"""End-to-end test of the wallet login flow.

Run manually:
    python manage.py shell < api/test_auth_flow.py
or:
    python manage.py test api.test_auth_flow
"""
import secrets

from django.test import Client
from eth_account import Account
from eth_account.messages import encode_defunct

from api.models import Patient, Doctor, LoginNonce


def run():
    client = Client()

    # Fresh wallet for the test run.
    acct = Account.from_key('0x' + 'ab' * 32)
    wallet = acct.address

    # --- Register a doctor -------------------------------------------------
    r = client.post(
        '/api/auth/register-doctor/',
        content_type='application/json',
        data={'wallet_address': wallet, 'full_name': 'Dr. Test', 'facility_id': 'F1'},
    )
    assert r.status_code == 201, f"register-doctor failed: {r.status_code} {r.content}"
    print('register-doctor ->', r.json())

    # --- Request nonce -----------------------------------------------------
    r = client.post(
        '/api/auth/nonce/',
        content_type='application/json',
        data={'wallet_address': wallet},
    )
    assert r.status_code == 200, f"nonce failed: {r.status_code} {r.content}"
    nonce_payload = r.json()
    print('nonce ->', nonce_payload['nonce'])

    # --- Sign the message and log in --------------------------------------
    signature = acct.sign_message(encode_defunct(text=nonce_payload['message'])).signature.hex()
    if not signature.startswith('0x'):
        signature = '0x' + signature

    r = client.post(
        '/api/auth/login/',
        content_type='application/json',
        data={'wallet_address': wallet, 'signature': signature},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.content}"
    body = r.json()
    assert body['registered'] is True and body['role'] == 'DOCTOR', body
    print('login ->', body)

    # --- Replay must fail (nonce single-use) -------------------------------
    r = client.post(
        '/api/auth/login/',
        content_type='application/json',
        data={'wallet_address': wallet, 'signature': signature},
    )
    assert r.status_code == 400, f"replay should fail, got {r.status_code}"
    print('replay rejected ->', r.json())

    # --- Wrong signer must fail --------------------------------------------
    r2 = client.post('/api/auth/nonce/', content_type='application/json', data={'wallet_address': wallet})
    msg2 = r2.json()['message']
    other = Account.from_key('0x' + 'cd' * 32)
    bad_sig = other.sign_message(encode_defunct(text=msg2)).signature.hex()
    if not bad_sig.startswith('0x'):
        bad_sig = '0x' + bad_sig
    r = client.post(
        '/api/auth/login/',
        content_type='application/json',
        data={'wallet_address': wallet, 'signature': bad_sig},
    )
    assert r.status_code == 401, f"wrong signer should 401, got {r.status_code}"
    print('wrong signer rejected ->', r.json())

    # --- Patient login ------------------------------------------------------
    p_acct = Account.from_key('0x' + 'ef' * 32)
    p_wallet = p_acct.address
    Patient.objects.create(
        health_id='TEST-' + secrets.token_hex(4),
        wallet_address=p_wallet,
        full_name='Test Patient',
    )
    r = client.post('/api/auth/nonce/', content_type='application/json', data={'wallet_address': p_wallet})
    msg3 = r.json()['message']
    sig3 = p_acct.sign_message(encode_defunct(text=msg3)).signature.hex()
    if not sig3.startswith('0x'):
        sig3 = '0x' + sig3
    r = client.post(
        '/api/auth/login/',
        content_type='application/json',
        data={'wallet_address': p_wallet, 'signature': sig3},
    )
    assert r.status_code == 200 and r.json()['role'] == 'PATIENT', r.content
    print('patient login ->', r.json())

    # Cleanup test rows.
    Doctor.objects.filter(wallet_address=wallet).delete()
    Patient.objects.filter(wallet_address=p_wallet).delete()
    LoginNonce.objects.filter(wallet_address__in=[wallet, p_wallet]).delete()

    print('\nALL AUTH FLOW TESTS PASSED')


if __name__ == '__main__':
    run()
