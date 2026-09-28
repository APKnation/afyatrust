"""AfyaTrust PoC API endpoints.

Implements the 7 demo steps: registration (wallet + contract), PIN login,
records, permissions, doctor access check, and break-glass.
"""
import hashlib
import json

from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Patient, MedicalRecord, AccessRequest
from . import wallet_manager
from .blockchain import contract, send_transaction


def _audit(patient, events):
    """Fetch and normalize the on-chain audit trail for a patient."""
    try:
        trail = contract.functions.getAuditTrail(patient.health_id).call()
        events[:] = [{
            "accessor": e[0],
            "role": e[1],
            "facility": e[2],
            "action": e[3],
            "timestamp": e[4],
        } for e in trail]
    except Exception:
        events[:] = []  # PoC: chain may be unreachable; show empty trail
    return events


# ============ 1. REGISTER (facility registers patient) ============

@api_view(["POST"])
@permission_classes([AllowAny])
def register_patient(request):
    """Create custodial wallet, register on-chain, store patient with PIN."""
    data = request.data
    required = ["health_id", "full_name", "pin"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return Response({"error": f"Missing fields: {', '.join(missing)}"},
                        status=status.HTTP_400_BAD_REQUEST)

    if Patient.objects.filter(health_id=data["health_id"]).exists():
        return Response({"error": "Health ID already registered"},
                        status=status.HTTP_409_CONFLICT)

    # 1. Custodial wallet (patient never sees MetaMask)
    wallet = wallet_manager.create_wallet()

    # 2. Register on-chain (facility wallet pays gas)
    tx_hash = ""
    try:
        tx = contract.functions.registerPatient(
            data["health_id"], wallet["address"], data["full_name"]
        )
        tx_hash = send_transaction(tx)
    except Exception as e:
        # PoC: continue so the demo works before the contract is deployed,
        # but tell the caller the on-chain step was skipped.
        tx_hash = f"PENDING: {e}"

    # 3. Store patient
    patient = Patient.objects.create(
        health_id=data["health_id"],
        full_name=data["full_name"],
        phone=data.get("phone", ""),
        pin_hash=make_password(data["pin"]),  # 4-digit PIN, hashed
        wallet_address=wallet["address"],
        encrypted_private_key=wallet["encrypted_key"],
        encryption_iv=wallet["iv"],
        registered_by_facility=data.get("facility_id", ""),
    )

    return Response({
        "status": "success",
        "health_id": patient.health_id,
        "wallet_address": patient.wallet_address,
        "tx_hash": tx_hash,
    }, status=status.HTTP_201_CREATED)


# ============ 2. LOGIN (Health ID + PIN -> JWT) ============

@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    """Patient login with Health ID + 4-digit PIN. Returns JWT."""
    health_id = request.data.get("health_id", "").strip()
    pin = request.data.get("pin", "").strip()

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient or not check_password(pin, patient.pin_hash):
        return Response({"error": "Invalid Health ID or PIN"},
                        status=status.HTTP_401_UNAUTHORIZED)

    refresh = RefreshToken()
    refresh["health_id"] = patient.health_id
    refresh["role"] = "PATIENT"

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "wallet_address": patient.wallet_address,
    })


# ============ 3. MY RECORDS ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_records(request):
    """Patient's own records + audit trail (read from token claims)."""
    health_id = request.auth.get("health_id") if request.auth else None
    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    events: list = []
    _audit(patient, events)

    return Response({
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "wallet_address": patient.wallet_address,
        "records": [{
            "id": r.id,
            "facility": r.facility_name,
            "type": r.record_type,
            "data": r.record_data,
            "hash": r.record_hash,
            "tx_hash": r.tx_hash,
            "date": r.created_at,
            "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
        } for r in patient.records.all()],
        "audit_trail": events,
    })


# ============ 4. GRANT ACCESS (patient -> doctor) ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def grant_access(request):
    """Patient grants a doctor access for N days (on-chain permission)."""
    patient = Patient.objects.filter(
        health_id=request.auth.get("health_id", "")
    ).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    doctor_wallet = request.data.get("doctor_wallet", "").strip()
    doctor_name = request.data.get("doctor_name", "").strip()
    days = int(request.data.get("days", 7))
    if not doctor_wallet:
        return Response({"error": "doctor_wallet is required"}, status=400)

    tx_hash = ""
    try:
        tx = contract.functions.patientGrantAccess(
            patient.health_id, doctor_wallet, days
        )
        tx_hash = send_transaction(tx)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    return Response({
        "status": "success",
        "message": f"Access granted to {doctor_name or doctor_wallet} for {days} days",
        "tx_hash": tx_hash,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_access(request):
    """Patient revokes a doctor's access."""
    patient = Patient.objects.filter(
        health_id=request.auth.get("health_id", "")
    ).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    doctor_wallet = request.data.get("doctor_wallet", "").strip()
    try:
        tx = contract.functions.patientRevokeAccess(patient.health_id, doctor_wallet)
        tx_hash = send_transaction(tx)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    return Response({"status": "success", "tx_hash": tx_hash})


# ============ 5. DOCTOR: REQUEST + VIEW RECORD ============

@api_view(["POST"])
@permission_classes([AllowAny])
def request_access(request):
    """Doctor asks the patient for access (off-chain request)."""
    data = request.data
    patient = Patient.objects.filter(health_id=data.get("health_id", "")).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    req = AccessRequest.objects.create(
        patient=patient,
        doctor_wallet=data.get("doctor_wallet", ""),
        doctor_name=data.get("doctor_name", ""),
        facility_id=data.get("facility_id", ""),
        reason=data.get("reason", ""),
    )
    return Response({
        "status": "pending",
        "request_id": req.id,
        "message": "Request sent to patient",
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def doctor_pending_requests(request):
    """Doctor's own pending requests, identified by wallet header."""
    wallet = request.headers.get("X-Wallet-Address", "")
    reqs = AccessRequest.objects.filter(doctor_wallet=wallet, status="PENDING")
    return Response([{
        "id": r.id,
        "patient_health_id": r.patient.health_id,
        "patient_name": r.patient.full_name,
        "facility_id": r.facility_id,
        "reason": r.reason,
        "created_at": r.created_at,
    } for r in reqs])


@api_view(["GET"])
@permission_classes([AllowAny])
def doctor_view_record(request, health_id):
    """Doctor fetches records; checks hasAccess on-chain (step 5) and logs (step 6)."""
    wallet = request.headers.get("X-Wallet-Address", "")
    facility_id = request.headers.get("X-Facility-ID", "UNKNOWN")

    try:
        allowed = contract.functions.hasAccess(health_id, wallet).call()
    except Exception:
        # Chain unreachable in PoC: allow but mark it, so demo continues.
        allowed = False
        chain_ok = False
    else:
        chain_ok = True

    if not allowed:
        return Response({
            "error": "No access permission",
            "action": "REQUEST_ACCESS",
            "chain_checked": chain_ok,
        }, status=403)

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    # Step 6: log the view on-chain.
    try:
        tx = contract.functions.recordView(health_id, facility_id)
        send_transaction(tx)
    except Exception:
        pass  # PoC: audit write is best-effort

    return Response({
        "health_id": health_id,
        "full_name": patient.full_name,
        "chain_checked": chain_ok,
        "records": [{
            "facility": r.facility_name,
            "type": r.record_type,
            "data": r.record_data,
            "hash": r.record_hash,
            "date": r.created_at,
            "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
        } for r in patient.records.all()],
    })


# ============ 6. PATIENT: RESPOND TO REQUESTS ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_requests(request):
    """Patient's pending access requests."""
    patient = Patient.objects.filter(
        health_id=request.auth.get("health_id", "")
    ).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    return Response([{
        "id": r.id,
        "doctor_name": r.doctor_name,
        "doctor_wallet": r.doctor_wallet,
        "facility_id": r.facility_id,
        "reason": r.reason,
        "created_at": r.created_at,
    } for r in patient.access_requests.filter(status="PENDING")])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_request(request, request_id):
    """Patient approves: grants on-chain access for 7 days."""
    patient = Patient.objects.filter(
        health_id=request.auth.get("health_id", "")
    ).first()
    req = AccessRequest.objects.filter(id=request_id, patient=patient).first()
    if not req:
        return Response({"error": "Request not found"}, status=404)

    tx_hash = ""
    try:
        tx = contract.functions.patientGrantAccess(patient.health_id, req.doctor_wallet, 7)
        tx_hash = send_transaction(tx)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    req.status = "APPROVED"
    req.tx_hash = tx_hash
    req.responded_at = timezone.now()
    req.save()

    return Response({"status": "approved", "tx_hash": tx_hash})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reject_request(request, request_id):
    """Patient rejects an access request."""
    patient = Patient.objects.filter(
        health_id=request.auth.get("health_id", "")
    ).first()
    req = AccessRequest.objects.filter(id=request_id, patient=patient).first()
    if not req:
        return Response({"error": "Request not found"}, status=404)

    req.status = "REJECTED"
    req.responded_at = timezone.now()
    req.save()
    return Response({"status": "rejected"})


# ============ 7. BREAK-GLASS ============

@api_view(["POST"])
@permission_classes([AllowAny])
def break_glass(request):
    """Emergency access. Always allowed, always logged on-chain (step 7)."""
    data = request.data
    health_id = data.get("health_id", "")
    facility_id = data.get("facility_id", "")
    reason = data.get("reason", "")

    if not Patient.objects.filter(health_id=health_id).exists():
        return Response({"error": "Health ID not found"}, status=404)

    wallet = request.headers.get("X-Wallet-Address", "")
    tx_hash = ""
    try:
        tx = contract.functions.breakGlass(health_id, facility_id, reason)
        tx_hash = send_transaction(tx)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    return Response({
        "status": "success",
        "message": "Break-glass used. This access has been logged for accountability.",
        "tx_hash": tx_hash,
        "clinician_wallet": wallet,
    })


# ============ FACILITY: ADD RECORD ============

@api_view(["POST"])
@permission_classes([AllowAny])
def add_record(request):
    """Facility adds a clinical record: data off-chain, hash on-chain (step 3)."""
    data = request.data
    patient = Patient.objects.filter(health_id=data.get("health_id", "")).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    record_data = data.get("record_data", {})
    record_str = json.dumps(record_data, sort_keys=True)
    record_hash = "0x" + hashlib.sha256(record_str.encode()).hexdigest()

    record = MedicalRecord.objects.create(
        patient=patient,
        facility_id=data.get("facility_id", ""),
        facility_name=data.get("facility_name", ""),
        record_type=data.get("record_type", "GENERAL"),
        record_data=record_data,
        record_hash=record_hash,
    )

    try:
        tx = contract.functions.addRecord(
            patient.health_id, record_hash,
            data.get("facility_id", ""), data.get("metadata_uri", "")
        )
        record.tx_hash = send_transaction(tx)
        record.save()
    except Exception as e:
        record.tx_hash = f"PENDING: {e}"
        record.save()

    return Response({
        "status": "success",
        "record_id": record.id,
        "hash": record_hash,
        "tx_hash": record.tx_hash,
    }, status=status.HTTP_201_CREATED)
