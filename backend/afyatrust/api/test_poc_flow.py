"""End-to-end PoC flow test (runs against the dev DB, cleans up after itself).

    python manage.py shell -c "from api.test_poc_flow import run; run()"
"""
import re

from django.test import Client
from eth_account import Account

from api.models import Patient
from api import wallet_manager


def run():
    c = Client()
    health_id = 'POC-TEST-1'

    # --- clean slate for this test -----------------------------------------
    Patient.objects.filter(health_id=health_id).delete()

    # --- 1. Register (wallet created custodially, chain step is skipped
    #        gracefully because CONTRACT_ADDRESS is not configured yet) -----
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
    assert body['tx_hash'].startswith('PENDING'), body  # chain not configured yet
    print('1. register        -> wallet', body['wallet_address'][:12], '| chain step deferred')

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

    # --- 3. Add a record (hash computed, chain deferred) --------------------
    r = c.post('/api/add-record/', content_type='application/json', data={
        'health_id': health_id,
        'facility_id': 'FAC-1',
        'facility_name': 'Test Clinic',
        'record_type': 'LAB',
        'record_data': {'test': 'malaria', 'result': 'negative'},
    })
    assert r.status_code == 201, f"add-record: {r.status_code} {r.content}"
    print('3. add-record       -> hash', r.json()['hash'][:16], '| chain deferred')

    # --- 4. My records (JWT) ------------------------------------------------
    r = c.get('/api/patient/my-records/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    assert r.status_code == 200, f"my-records: {r.status_code} {r.content}"
    data = r.json()
    assert data['full_name'] == 'PoC Tester' and len(data['records']) == 1
    print('4. my-records       ->', len(data['records']), 'record(s)')

    # --- 5. Grant access to a doctor wallet ---------------------------------
    doctor = Account.from_key('0x' + '11' * 32)
    r = c.post('/api/patient/grant-access/', HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json', data={
                   'doctor_wallet': doctor.address, 'doctor_name': 'Dr. Test', 'days': 7})
    assert r.status_code == 200, f"grant: {r.status_code} {r.content}"
    print('5. grant-access     ->', r.json()['message'])

    # --- 6. Doctor requests, then (chain not configured) is denied on-chain --
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
    assert r.status_code == 200
    print('   approve          ->', r.json()['status'])

    # --- 7. Break-glass (chain deferred, still returns success) -------------
    r = c.post('/api/doctor/break-glass/', content_type='application/json',
               data={'health_id': health_id, 'facility_id': 'FAC-2',
                     'reason': 'unconscious emergency'}, HTTP_X_WALLET_ADDRESS=doctor.address)
    assert r.status_code == 200, f"break-glass: {r.status_code} {r.content}"
    print('7. break-glass      ->', r.json()['message'])

    # --- cleanup -------------------------------------------------------------
    Patient.objects.filter(health_id=health_id).delete()
    print('\nALL POC FLOW TESTS PASSED (chain steps deferred until CONTRACT_ADDRESS is set)')
