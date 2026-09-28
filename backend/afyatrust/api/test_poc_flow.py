"""End-to-end PoC flow test (runs against the dev DB, cleans up after itself).

Hits real Sepolia transactions once CONTRACT_ADDRESS + FACILITY_PRIVATE_KEY
are configured (needs internet; each run takes a few minutes and a little
testnet gas).

    python manage.py shell -c "from api.test_poc_flow import run; run()"
"""
import time

from django.test import Client
from eth_account import Account

from api.models import Patient
from api import wallet_manager


def run():
    c = Client()
    # Unique per run: the contract forbids re-registering the same Health ID.
    health_id = f"POC-TEST-{int(time.time())}"

    # --- clean slate for this test -----------------------------------------
    # (on-chain registrations can't be undone, but stale local rows can)
    Patient.objects.filter(health_id__startswith="POC-TEST-").delete()

    # --- 1. Register (custodial wallet + real registerPatient tx) ----------
    r = c.post('/api/register/', content_type='application/json', data={
        'health_id': health_id,
        'full_name': 'PoC Tester',
        'pin': '1234',
        'phone': '0700000000',
        'facility_id': 'FAC-1',
    })
    assert r.status_code == 201, f"register: {r.status_code} {r.content}"
    body = r.json()
    assert body['wallet_address'].startswith('0x'), body
    assert body['tx_hash'].startswith('0x'), f"register tx failed: {body['tx_hash']}"
    print('1. register        -> wallet', body['wallet_address'][:12],
          '| tx', body['tx_hash'][:18] + '...')

    # Custodial key must be decryptable with MASTER_KEY.
    p = Patient.objects.get(health_id=health_id)
    key = wallet_manager.get_private_key(p.encrypted_private_key, p.encryption_iv)
    acct = Account.from_key(key)
    assert acct.address == p.wallet_address
    print('   custodial key   -> decrypts OK, matches wallet address')

    # --- 2. Login with Health ID + PIN --------------------------------------
    r = c.post('/api/login/', content_type='application/json',
               data={'health_id': health_id, 'pin': '1234'})
    assert r.status_code == 200, f"login: {r.status_code} {r.content}"
    jwt = r.json()['access']
    assert r.json()['health_id'] == health_id
    print('2. login            -> JWT received')

    # Wrong PIN must fail.
    r = c.post('/api/login/', content_type='application/json',
               data={'health_id': health_id, 'pin': '9999'})
    assert r.status_code == 401
    print('   wrong PIN       -> 401 OK')

    # --- 3. Add a record (SHA-256 hash + addRecord tx) ----------------------
    r = c.post('/api/add-record/', content_type='application/json', data={
        'health_id': health_id,
        'facility_id': 'FAC-1',
        'facility_name': 'Test Clinic',
        'record_type': 'LAB',
        'record_data': {'test': 'malaria', 'result': 'negative'},
    })
    assert r.status_code == 201, f"add-record: {r.status_code} {r.content}"
    assert r.json()['tx_hash'].startswith('0x'), r.json()
    print('3. add-record       -> hash', r.json()['hash'][:16],
          '| tx', r.json()['tx_hash'][:18] + '...')

    # --- 4. My records (JWT) ------------------------------------------------
    r = c.get('/api/patient/my-records/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    assert r.status_code == 200, f"my-records: {r.status_code} {r.content}"
    data = r.json()
    assert data['full_name'] == 'PoC Tester' and len(data['records']) == 1
    assert data['records'][0]['verified'] is True
    print('4. my-records       ->', len(data['records']),
          'record(s), verified on-chain')

    # --- 5. Grant access to a doctor wallet (patient-signed tx) -------------
    doctor = Account.from_key('0x' + '11' * 32)
    r = c.post('/api/patient/grant-access/', HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json', data={
                   'doctor_wallet': doctor.address, 'doctor_name': 'Dr. Test', 'days': 7})
    assert r.status_code == 200, f"grant: {r.status_code} {r.content}"
    assert r.json()['tx_hash'].startswith('0x'), r.json()
    print('5. grant-access     ->', r.json()['message'],
          '| tx', r.json()['tx_hash'][:18] + '...')

    # --- 6. Doctor requests access, patient approves, doctor views ----------
    r = c.post('/api/doctor/request-access/', content_type='application/json', data={
        'health_id': health_id,
        'doctor_wallet': doctor.address,
        'doctor_name': 'Dr. Test',
        'facility_id': 'FAC-2',
        'reason': 'Referral follow-up',
    })
    assert r.status_code == 201
    req_id = r.json()['request_id']

    r = c.get('/api/patient/requests/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    assert r.status_code == 200 and len(r.json()) == 1
    print('6. request access   -> patient sees', len(r.json()), 'pending request')

    r = c.post(f'/api/patient/approve-request/{req_id}/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    assert r.status_code == 200, f"approve: {r.status_code} {r.content}"
    assert r.json()['tx_hash'].startswith('0x'), r.json()
    print('   approve          ->', r.json()['status'],
          '| tx', r.json()['tx_hash'][:18] + '...')

    # Doctor can now view records; hasAccess is checked on-chain and the
    # view is logged on-chain (step 6 of the PoC document).
    r = c.get(f'/api/doctor/patient/{health_id}/',
              HTTP_X_WALLET_ADDRESS=doctor.address, HTTP_X_FACILITY_ID='FAC-2')
    assert r.status_code == 200, f"doctor view: {r.status_code} {r.content}"
    assert r.json()['chain_checked'] is True
    print('   doctor view      -> hasAccess OK on-chain,',
          len(r.json()['records']), 'record(s) visible')

    # The patient's audit trail must now include the VIEW event.
    r = c.get('/api/patient/my-records/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    actions = [e['action'] for e in r.json()['audit_trail']]
    assert 'VIEW' in actions, actions
    print('   audit trail      ->', actions)

    # --- 7. Break-glass (emergency access, permanently logged) --------------
    r = c.post('/api/doctor/break-glass/', content_type='application/json',
               data={'health_id': health_id, 'facility_id': 'FAC-2',
                     'reason': 'unconscious emergency'},
               HTTP_X_WALLET_ADDRESS=doctor.address)
    assert r.status_code == 200, f"break-glass: {r.status_code} {r.content}"
    assert r.json()['tx_hash'].startswith('0x'), r.json()
    print('7. break-glass      ->', r.json()['message'],
          '| tx', r.json()['tx_hash'][:18] + '...')

    # --- cleanup -------------------------------------------------------------
    Patient.objects.filter(health_id=health_id).delete()
    print('\nALL POC FLOW TESTS PASSED (real Sepolia transactions)')
