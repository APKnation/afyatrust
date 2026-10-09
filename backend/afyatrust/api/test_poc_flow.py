"""End-to-end PoC flow test (runs against the dev DB, cleans up after itself).

Hits real Sepolia transactions once CONTRACT_ADDRESS + FACILITY_PRIVATE_KEY
are configured (needs internet; each run takes a few minutes and a little
testnet gas).

    python manage.py shell -c "from api.test_poc_flow import run; run()"
"""
import time

from django.contrib.auth.hashers import make_password
from django.test import Client
from eth_account import Account

from api.models import Hospital, HospitalStaff, MedicalRecord, Patient
from api import wallet_manager


def run():
    c = Client()
    # Unique per run: the contract forbids re-registering the same Health ID.
    health_id = f"POC-TEST-{int(time.time())}"

    # --- clean slate for this test -----------------------------------------
    # (on-chain registrations can't be undone, but stale local rows can)
    Patient.objects.filter(health_id__startswith="POC-TEST-").delete()
    hospital_a, _ = Hospital.objects.get_or_create(
        code="FAC-1", defaults={"name": "PoC Hospital A"}
    )
    hospital_b, _ = Hospital.objects.get_or_create(
        code="FAC-2", defaults={"name": "PoC Hospital B"}
    )
    suffix = str(int(time.time() * 1000))
    staff_a = HospitalStaff.objects.create(
        hospital=hospital_a,
        username=f"poc-a-{suffix}",
        full_name="PoC Hospital A Staff",
        password_hash=make_password("PoC-password-123"),
    )
    staff_b = HospitalStaff.objects.create(
        hospital=hospital_b,
        username=f"poc-b-{suffix}",
        full_name="PoC Hospital B Staff",
        password_hash=make_password("PoC-password-123"),
    )

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

    # Hospital A and B use separate staff credentials in the same demo API.
    staff_login = c.post('/api/login/', content_type='application/json', data={
        'identity': staff_a.username, 'secret': 'PoC-password-123',
    })
    assert staff_login.status_code == 200, staff_login.content
    hospital_a_jwt = staff_login.json()['access']
    staff_login = c.post('/api/login/', content_type='application/json', data={
        'identity': staff_b.username, 'secret': 'PoC-password-123',
    })
    assert staff_login.status_code == 200, staff_login.content
    hospital_b_jwt = staff_login.json()['access']

    # --- 3. Add a record (SHA-256 hash + addRecord tx) ----------------------
    r = c.post('/api/add-record/', HTTP_AUTHORIZATION=f'Bearer {hospital_a_jwt}',
               content_type='application/json', data={
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

    # Hospital A refers the patient to B; B accepts and verifies the payload
    # against both the database hash and the immutable on-chain record anchor.
    r = c.post('/api/patient/referrals/send/',
               HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json', data={
                   'to_hospital': 'FAC-2',
                   'reason': 'PoC cross-hospital integrity demonstration',
               })
    assert r.status_code == 201, f"patient referral: {r.status_code} {r.content}"
    referral_id = r.json()['referral_id']
    r = c.post(f'/api/staff/referrals/{referral_id}/respond/',
               HTTP_AUTHORIZATION=f'Bearer {hospital_b_jwt}',
               content_type='application/json', data={'action': 'ACCEPTED'})
    assert r.status_code == 200, f"accept referral: {r.status_code} {r.content}"
    r = c.post(f'/api/staff/referrals/{referral_id}/verify-records/',
               HTTP_AUTHORIZATION=f'Bearer {hospital_b_jwt}')
    assert r.status_code == 200, f"verify referral: {r.status_code} {r.content}"
    check = r.json()['records'][0]
    assert check['verified'] is True and check['record_data'] is not None, check
    print('   Hospital B      -> verified Hospital A record against Sepolia')

    # Simulate an in-between alteration; the changed payload must be withheld.
    record = MedicalRecord.objects.get(id=r.json()['records'][0]['id'])
    original_data = record.record_data
    record.record_data = {**original_data, 'result': 'tampered'}
    record.save(update_fields=['record_data'])
    r = c.post(f'/api/staff/referrals/{referral_id}/verify-records/',
               HTTP_AUTHORIZATION=f'Bearer {hospital_b_jwt}')
    assert r.status_code == 200, f"tamper check: {r.status_code} {r.content}"
    tamper_check = r.json()['records'][0]
    assert not tamper_check['verified'] and tamper_check['record_data'] is None
    record.record_data = original_data
    record.save(update_fields=['record_data'])
    print('   tamper test      -> modified payload detected and withheld')

    # --- 4. My records (JWT) ------------------------------------------------
    r = c.get('/api/patient/my-records/', HTTP_AUTHORIZATION=f'Bearer {jwt}')
    assert r.status_code == 200, f"my-records: {r.status_code} {r.content}"
    data = r.json()
    assert data['full_name'] == 'PoC Tester' and len(data['records']) == 1
    assert data['records'][0]['verified'] is True
    print('4. my-records       ->', len(data['records']),
          'record(s), verified on-chain')

    # --- 5. Grant access to a doctor wallet (patient-signed tx) -------------
    doctor = Account.create()
    r = c.post('/api/patient/grant-access/', HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json', data={
                   'doctor_wallet': doctor.address, 'doctor_name': 'Dr. Test', 'days': 7})
    assert r.status_code == 200, f"grant: {r.status_code} {r.content}"
    assert r.json()['tx_hash'].startswith('0x'), r.json()
    print('5. grant-access     ->', r.json()['message'],
          '| tx', r.json()['tx_hash'][:18] + '...')

    # --- 6. Doctor verifies, requests access, patient approves, views -------
    # An unverified doctor must be rejected.
    r = c.post('/api/doctor/request-access/',
               HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json', data={
        'health_id': health_id, 'doctor_wallet': doctor.address, 'reason': 'x'})
    assert r.status_code == 403, f"unverified doctor not blocked: {r.status_code}"
    print('   unverified doctor -> 403 blocked OK')

    # Doctor self-registers and an admin approves the account.
    from django.utils import timezone
    from api.models import Doctor
    Doctor.objects.create(
        full_name='Dr. Test', license_no=f'LIC-{int(time.time())}',
        pin_hash=make_password('4321'),
        wallet_address=doctor.address, facility_id='FAC-2',
        status='APPROVED', approved_at=timezone.now(),
    )
    license_no = Doctor.objects.get(wallet_address=doctor.address).license_no
    r = c.post('/api/login/', content_type='application/json', data={
        'identity': license_no, 'secret': '4321',
    })
    assert r.status_code == 200, f"doctor login: {r.status_code} {r.content}"
    doctor_jwt = r.json()['access']

    r = c.post('/api/doctor/request-access/',
               HTTP_AUTHORIZATION=f'Bearer {doctor_jwt}',
               content_type='application/json', data={
        'health_id': health_id,
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
              HTTP_AUTHORIZATION=f'Bearer {doctor_jwt}')
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
    r = c.post('/api/patient/revoke-access/',
               HTTP_AUTHORIZATION=f'Bearer {jwt}',
               content_type='application/json',
               data={'doctor_license': license_no})
    assert r.status_code == 200, f"revoke access: {r.status_code} {r.content}"
    r = c.post('/api/doctor/break-glass/',
               HTTP_AUTHORIZATION=f'Bearer {doctor_jwt}',
               content_type='application/json',
               data={'health_id': health_id, 'reason': 'unconscious emergency'})
    assert r.status_code == 200, f"break-glass: {r.status_code} {r.content}"
    break_glass_result = r.json()
    assert 'chain_logged' in break_glass_result, break_glass_result
    r = c.get(f'/api/doctor/patient/{health_id}/',
              HTTP_AUTHORIZATION=f'Bearer {doctor_jwt}')
    assert r.status_code == 200, f"emergency history: {r.status_code} {r.content}"
    print('7. break-glass      ->', break_glass_result['message'],
          '| one-hour history access verified')

    # --- cleanup -------------------------------------------------------------
    Patient.objects.filter(health_id=health_id).delete()
    Doctor.objects.filter(wallet_address__iexact=doctor.address).delete()
    HospitalStaff.objects.filter(id__in=[staff_a.id, staff_b.id]).delete()
    print('\nALL POC FLOW TESTS PASSED (real Sepolia transactions)')
