import secrets

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from eth_account.account import Account
from eth_account.messages import encode_defunct

from .models import Patient, Doctor, LoginNonce

# Nonces older than this cannot be used.
NONCE_TTL_MINUTES = 10


def _build_message(wallet_address: str, nonce: str) -> str:
    """The exact string the user signs in their wallet."""
    return (
        "AfyaTrust wants you to sign in with your Ethereum account:\n"
        f"{wallet_address}\n"
        "\n"
        "This signature proves you own this wallet. It does not trigger any "
        "blockchain transaction and costs no gas.\n"
        "\n"
        f"Nonce: {nonce}"
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_nonce(request):
    """Issue a one-time nonce for the wallet to sign."""
    wallet = (request.data.get('wallet_address') or '').strip()
    if not wallet:
        return Response({'error': 'wallet_address is required'}, status=status.HTTP_400_BAD_REQUEST)

    nonce = secrets.token_hex(16)
    LoginNonce.objects.create(nonce=nonce, wallet_address=wallet)

    return Response({
        'nonce': nonce,
        'message': _build_message(wallet, nonce),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request):
    """Verify the wallet signature and return the account role."""
    wallet = (request.data.get('wallet_address') or '').strip()
    signature = (request.data.get('signature') or '').strip()

    if not wallet or not signature:
        return Response(
            {'error': 'wallet_address and signature are required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Find the newest unused, unexpired nonce for this wallet.
    cutoff = timezone.now() - timezone.timedelta(minutes=NONCE_TTL_MINUTES)
    login_nonce = (
        LoginNonce.objects
        .filter(wallet_address=wallet, used=False, created_at__gte=cutoff)
        .order_by('-created_at')
        .first()
    )
    if not login_nonce:
        return Response(
            {'error': 'No valid nonce. Request a new one.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Recover the signer and compare against the claimed wallet.
    try:
        message = _build_message(wallet, login_nonce.nonce)
        recovered = Account.recover_message(encode_defunct(text=message), signature=signature)
    except Exception:
        return Response({'error': 'Invalid signature format'}, status=status.HTTP_400_BAD_REQUEST)

    if recovered.lower() != wallet.lower():
        return Response({'error': 'Signature does not match wallet'}, status=status.HTTP_401_UNAUTHORIZED)

    # Mark nonce as used (single-use).
    login_nonce.used = True
    login_nonce.save(update_fields=['used'])

    # Detect role: a wallet can be a patient, a doctor, or not registered.
    patient = Patient.objects.filter(wallet_address__iexact=wallet).first()
    doctor = Doctor.objects.filter(wallet_address__iexact=wallet).first()

    if patient:
        role = 'PATIENT'
        health_id = patient.health_id
        full_name = patient.full_name
    elif doctor:
        role = 'DOCTOR'
        health_id = None
        full_name = doctor.full_name
    else:
        return Response(
            {
                'registered': False,
                'error': 'Wallet not registered. Please register first.',
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response({
        'registered': True,
        'role': role,
        'wallet_address': wallet,
        'health_id': health_id,
        'full_name': full_name,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def register_doctor(request):
    """Register a doctor wallet (patients are registered by facilities)."""
    wallet = (request.data.get('wallet_address') or '').strip()
    full_name = (request.data.get('full_name') or '').strip()
    facility_id = (request.data.get('facility_id') or '').strip()

    if not wallet or not full_name:
        return Response(
            {'error': 'wallet_address and full_name are required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if Patient.objects.filter(wallet_address__iexact=wallet).exists():
        return Response(
            {'error': 'This wallet is registered as a patient.'},
            status=status.HTTP_409_CONFLICT,
        )

    doctor = Doctor.objects.filter(wallet_address__iexact=wallet).first()
    created = doctor is None
    if created:
        doctor = Doctor.objects.create(
            wallet_address=wallet, full_name=full_name, facility_id=facility_id
        )
    else:
        # Keep profile fields fresh on re-registration.
        doctor.full_name = full_name
        doctor.facility_id = facility_id
        doctor.save(update_fields=['full_name', 'facility_id'])

    return Response({
        'status': 'success',
        'role': 'DOCTOR',
        'wallet_address': doctor.wallet_address,
        'full_name': doctor.full_name,
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
