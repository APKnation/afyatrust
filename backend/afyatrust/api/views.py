"""AfyaTrust PoC API endpoints.

Implements the 7 demo steps: registration (wallet + contract), PIN login,
records, permissions, doctor access check, and break-glass.
"""
import hashlib
import json
import re
from datetime import timedelta

from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    AccessGrant, AccessRequest, Doctor, Hospital, HospitalStaff,
    Measurement, MedicalRecord, Patient, Referral,
)
from . import wallet_manager
from .blockchain import contract, send_transaction, ensure_gas, facility_address


def _doctor_from_request(request):
    """Resolve the JWT-authenticated doctor (APPROVED only) from the token."""
    if not request.auth or request.auth.get("role") != "DOCTOR":
        return None
    return Doctor.objects.filter(
        license_no__iexact=request.auth.get("license_no", ""), status="APPROVED"
    ).first()


def _patient_from_request(request):
    """Resolve the JWT-authenticated patient from the token."""
    return Patient.objects.filter(
        health_id=request.auth.get("health_id", "") if request.auth else ""
    ).first()


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


# ============ 1. REGISTER (patient self-registration; facility may call) ============

@api_view(["POST"])
@permission_classes([AllowAny])
def register_patient(request):
    """Create custodial wallet, register on-chain, store patient with PIN.
    The registering doctor's hospital (when provided) is recorded."""
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

    # 3. Store patient (hospital resolved from the registering doctor's JWT
    # or an explicit facility_id, so patients can also be registered at the desk)
    hospital = None
    reg_facility = str(data.get("facility_id", "")).strip()
    if request.auth and request.auth.get("role") == "DOCTOR":
        reg_doctor = Doctor.objects.filter(
            license_no__iexact=request.auth.get("license_no", "")
        ).first()
        if reg_doctor:
            hospital = reg_doctor.hospital
            reg_facility = reg_facility or reg_doctor.facility_id
    if not hospital and reg_facility:
        hospital = Hospital.objects.filter(code__iexact=reg_facility).first()

    patient = Patient.objects.create(
        health_id=data["health_id"],
        full_name=data["full_name"],
        phone=data.get("phone", ""),
        pin_hash=make_password(data["pin"]),  # 4-digit PIN, hashed
        wallet_address=wallet["address"],
        encrypted_private_key=wallet["encrypted_key"],
        encryption_iv=wallet["iv"],
        registered_by_facility=reg_facility,
        hospital=hospital,
    )

    return Response({
        "status": "success",
        "health_id": patient.health_id,
        "wallet_address": patient.wallet_address,
        "tx_hash": tx_hash,
    }, status=status.HTTP_201_CREATED)


# ============ 2. LOGIN (single sign-in for ALL roles) ============

@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    """One login endpoint for everyone. The credential shape decides the role:
    - Patients: Health ID + PIN
    - Doctors:  medical license number + PIN (admin-created)
    - Staff:    username + password (admin-created)
    Every failure returns the same generic error so the endpoint does not
    reveal which roles or accounts exist."""
    data = request.data
    ident = str(
        data.get("identity") or data.get("health_id")
        or data.get("license_no") or data.get("username") or ""
    ).strip()
    secret = str(
        data.get("secret") or data.get("pin") or data.get("password") or ""
    ).strip()
    if not ident or not secret:
        return Response({"error": "Credentials required"},
                        status=status.HTTP_400_BAD_REQUEST)

    # --- Patient (Health ID + PIN) ---
    patient = Patient.objects.filter(health_id__iexact=ident).first()
    if patient and patient.pin_hash and check_password(secret, patient.pin_hash):
        refresh = RefreshToken()
        refresh["health_id"] = patient.health_id
        refresh["role"] = "PATIENT"
        return Response({
            "role": "PATIENT",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "health_id": patient.health_id,
            "full_name": patient.full_name,
            "wallet_address": patient.wallet_address,
        })

    # --- Doctor (license number + PIN, must be approved) ---
    doctor = Doctor.objects.filter(license_no__iexact=ident).first()
    if (doctor and doctor.status == "APPROVED" and doctor.pin_hash
            and check_password(secret, doctor.pin_hash)):
        refresh = RefreshToken()
        refresh["license_no"] = doctor.license_no
        refresh["wallet_address"] = doctor.wallet_address
        refresh["role"] = "DOCTOR"
        return Response({
            "role": "DOCTOR",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "license_no": doctor.license_no,
            "full_name": doctor.full_name,
            "hospital_code": doctor.facility_id,
            "wallet_address": doctor.wallet_address,
        })

    # --- Hospital staff (username + password) ---
    staff = HospitalStaff.objects.filter(username__iexact=ident).first()
    if staff and staff.password_hash and check_password(secret, staff.password_hash):
        refresh = RefreshToken()
        refresh["username"] = staff.username
        refresh["full_name"] = staff.full_name
        refresh["hospital_code"] = staff.hospital.code
        refresh["role"] = "STAFF"
        return Response({
            "role": "STAFF",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "username": staff.username,
            "full_name": staff.full_name,
            "hospital_code": staff.hospital.code,
            "hospital_name": staff.hospital.name,
        })

    # Uniform failure for every role — no account enumeration.
    return Response({"error": "Invalid credentials"},
                    status=status.HTTP_401_UNAUTHORIZED)


# ============ 3. MY RECORDS ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_records(request):
    """Patient's own records, measurements, referrals + audit trail."""
    patient = _patient_from_request(request)
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
        "measurements": [{
            "id": m.id,
            "kind": m.kind,
            "value": m.value,
            "unit": m.unit,
            "notes": m.notes,
            "doctor": m.doctor.full_name if m.doctor else "",
            "hospital": m.hospital.name if m.hospital else "",
            "date": m.created_at,
        } for m in patient.measurements.all()],
        "referrals": [{
            "id": r.id,
            "to_hospital": r.to_hospital.name,
            "to_hospital_code": r.to_hospital.code,
            "reason": r.reason,
            "status": r.status,
            "date": r.created_at,
        } for r in patient.referrals.all()],
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

    doctor_license = str(request.data.get("doctor_license", "")).strip()
    doctor_wallet = str(request.data.get("doctor_wallet", "")).strip()
    doctor_name = str(request.data.get("doctor_name", "")).strip()
    days = int(request.data.get("days", 7))

    # Patients grant by license number (doctors have no visible wallet);
    # a raw wallet is still accepted for the PoC API.
    doc = None
    if doctor_license:
        doc = Doctor.objects.filter(license_no__iexact=doctor_license).first()
        if not doc:
            return Response({"error": "No doctor found with that license number"}, status=404)
        doctor_wallet = doctor_wallet or doc.wallet_address
        doctor_name = doctor_name or doc.full_name
    elif doctor_wallet:
        doc = Doctor.objects.filter(wallet_address__iexact=doctor_wallet).first()
    if not doctor_wallet:
        return Response({"error": "doctor_license or doctor_wallet is required"}, status=400)

    # The contract attributes the grant to the patient wallet itself, so the
    # patient's custodial key signs (facility tops up gas first).
    tx_hash = ""
    try:
        ensure_gas(patient.wallet_address)
        patient_key = wallet_manager.get_private_key(
            patient.encrypted_private_key, patient.encryption_iv
        )
        tx = contract.functions.patientGrantAccess(
            patient.health_id, patient.wallet_address, doctor_wallet, days
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    if doc:
        AccessGrant.objects.update_or_create(
            patient=patient, doctor=doc,
            defaults={
                "tx_hash": tx_hash,
                "active": True,  # chain liveness overrides when reachable
                "expires_at": timezone.now() + timedelta(days=days),
            },
        )

    return Response({
        "status": "success",
        "message": f"Access granted to {doctor_name or doctor_wallet} for {days} days",
        "tx_hash": tx_hash,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_access(request):
    """Patient revokes a doctor's access."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    doctor_license = str(request.data.get("doctor_license", "")).strip()
    doctor_wallet = str(request.data.get("doctor_wallet", "")).strip()
    if doctor_license and not doctor_wallet:
        doc = Doctor.objects.filter(license_no__iexact=doctor_license).first()
        if not doc:
            return Response({"error": "No doctor found with that license number"}, status=404)
        doctor_wallet = doc.wallet_address
    if not doctor_wallet:
        return Response({"error": "doctor_license or doctor_wallet is required"}, status=400)
    try:
        ensure_gas(patient.wallet_address)
        patient_key = wallet_manager.get_private_key(
            patient.encrypted_private_key, patient.encryption_iv
        )
        tx = contract.functions.patientRevokeAccess(
            patient.health_id, patient.wallet_address, doctor_wallet
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    AccessGrant.objects.filter(
        patient=patient, doctor__wallet_address__iexact=doctor_wallet
    ).update(active=False)

    return Response({"status": "success", "tx_hash": tx_hash})


# ============ 5. DOCTOR: ADMIN-CREATED ACCOUNTS ONLY ============
# Doctors no longer self-register and there is no separate doctor login —
# they sign in on the same page as everyone else using license_no + PIN.
# The Django admin creates the doctor, sets the initial PIN, and approves.


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_me(request):
    """Current doctor profile (from JWT claims)."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=404)
    return Response({
        "license_no": doctor.license_no,
        "full_name": doctor.full_name,
        "hospital_code": doctor.facility_id,
        "hospital_name": doctor.hospital.name if doctor.hospital else "",
        "wallet_address": doctor.wallet_address,
        "status": doctor.status,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_status(request):
    """Doctor checks their own verification status (JWT, not guessable)."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"registered": False})
    return Response({
        "registered": True,
        "status": doctor.status,
        "full_name": doctor.full_name,
        "hospital_code": doctor.facility_id,
    })


# ============ 5b. DOCTOR: REQUEST + VIEW RECORD ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request_access(request):
    """Verified doctor asks the patient for access (off-chain request)."""
    data = request.data
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response(
            {"error": "Doctor not verified. Register and wait for admin approval."},
            status=status.HTTP_403_FORBIDDEN,
        )

    patient = Patient.objects.filter(health_id=data.get("health_id", "")).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    req = AccessRequest.objects.create(
        patient=patient,
        doctor=doctor,
        doctor_wallet=doctor.wallet_address,
        doctor_name=doctor.full_name,
        facility_id=doctor.facility_id,  # from the verified profile, not free text
        reason=data.get("reason", ""),
    )
    return Response({
        "status": "pending",
        "request_id": req.id,
        "message": "Request sent to patient",
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_pending_requests(request):
    """Doctor's own pending requests, from the JWT."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response([], status=403)
    reqs = AccessRequest.objects.filter(doctor=doctor, status="PENDING")
    return Response([{
        "id": r.id,
        "patient_health_id": r.patient.health_id,
        "patient_name": r.patient.full_name,
        "facility_id": r.facility_id,
        "reason": r.reason,
        "created_at": r.created_at,
    } for r in reqs])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_view_record(request, health_id):
    """Doctor fetches records; checks hasAccess on-chain (step 5) and logs (step 6)."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({
            "error": "Doctor not verified. Register and wait for admin approval.",
            "action": "REGISTER",
        }, status=status.HTTP_403_FORBIDDEN)
    wallet = doctor.wallet_address
    facility_id = doctor.facility_id or "UNKNOWN"

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

    # Step 6: log the view on-chain (viewer passed explicitly — the facility
    # wallet signs but the audit entry must name the real accessor).
    try:
        tx = contract.functions.recordView(health_id, wallet, facility_id)
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


# ============ PATIENT: MEASUREMENTS + REFERRALS (own view) ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_measurements(request):
    """Patient's own measurement history."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)
    return Response([{
        "id": m.id,
        "kind": m.kind,
        "value": m.value,
        "unit": m.unit,
        "notes": m.notes,
        "doctor": m.doctor.full_name if m.doctor else "",
        "hospital": m.hospital.name if m.hospital else "",
        "date": m.created_at,
    } for m in patient.measurements.all()])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_referrals(request):
    """Patient's own referrals (hospital-to-hospital movements)."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)
    return Response([{
        "id": r.id,
        "from_hospital": r.from_hospital.name if r.from_hospital else "",
        "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
        "to_hospital": r.to_hospital.name,
        "to_hospital_code": r.to_hospital.code,
        "reason": r.reason,
        "status": r.status,
        "responded_by": r.responded_by,
        "date": r.created_at,
        "responded_at": r.responded_at,
    } for r in patient.referrals.all()])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def patient_send_referral(request):
    """Patient asks to be referred to another hospital. The receiving
    hospital's staff/doctor still accepts or declines, so no clinical
    decision is bypassed — the request is just initiated by the patient."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    to_code = str(request.data.get("to_hospital", "")).strip()
    reason = str(request.data.get("reason", "")).strip()
    if not to_code:
        return Response({"error": "to_hospital is required"}, status=400)

    to_hospital = Hospital.objects.filter(code__iexact=to_code).first()
    if not to_hospital:
        return Response({"error": "Target hospital not found"}, status=404)
    if patient.hospital and to_hospital.code.lower() == patient.hospital.code.lower():
        return Response({"error": "You are already registered at that hospital"}, status=400)

    ref = Referral.objects.create(
        patient=patient,
        from_doctor=None,          # patient-initiated; a doctor may be assigned on acceptance
        from_hospital=patient.hospital,
        to_hospital=to_hospital,
        reason=reason or "Patient-initiated referral request",
    )
    return Response({
        "status": "success",
        "referral_id": ref.id,
        "message": f"Referral request sent to {to_hospital.name} — they must accept it.",
    }, status=status.HTTP_201_CREATED)


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

    # Patient-signed on-chain grant (custodial key + facility gas top-up).
    tx_hash = ""
    try:
        ensure_gas(patient.wallet_address)
        patient_key = wallet_manager.get_private_key(
            patient.encrypted_private_key, patient.encryption_iv
        )
        tx = contract.functions.patientGrantAccess(
            patient.health_id, patient.wallet_address, req.doctor_wallet, 7
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    AccessGrant.objects.get_or_create(
        patient=patient, doctor=req.doctor,
        defaults={
            "tx_hash": tx_hash,
            "active": True,  # chain liveness overrides when reachable
            "expires_at": timezone.now() + timedelta(days=7),
        },
    )

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


# ============ DOCTOR: MY PATIENTS / MEASUREMENTS / REFERRALS ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_patients(request):
    """Patients assigned to the logged-in doctor: granted access on-chain
    (fresh from chain) plus a bookkeeping mirror of past grants."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)

    onchain: dict = {}
    try:
        perms = contract.functions.getPermissions(doctor.wallet_address).call()
        for p in perms:
            onchain[str(p[0]).strip().lower()] = bool(p[4])  # (health_id, patient, doctor, expiry, active)
    except Exception:
        pass  # chain unreachable — bookkeeping only

    grants = AccessGrant.objects.filter(doctor=doctor).select_related("patient")
    items = []
    for g in grants:
        active = onchain.get(g.patient.health_id.strip().lower(), g.active)
        items.append({
            "health_id": g.patient.health_id,
            "full_name": g.patient.full_name,
            "granted_at": g.created_at,
            "expires_at": g.expires_at,
            "active": active,
            "source": "grant" if g.active else "expired",
        })
    return Response(items)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_measurement(request):
    """Doctor records a clinical measurement for a patient with access."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)

    health_id = str(request.data.get("health_id", "")).strip()
    kind = str(request.data.get("kind", "")).strip()
    value = request.data.get("value")
    if not health_id or not kind or value in (None, ""):
        return Response({"error": "health_id, kind and value are required"}, status=400)

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    try:
        allowed = contract.functions.hasAccess(health_id, doctor.wallet_address).call()
    except Exception:
        allowed = True  # PoC: chain unreachable — demo continues
    if not allowed:
        return Response({"error": "No access permission for this patient"}, status=403)

    m = Measurement.objects.create(
        patient=patient,
        doctor=doctor,
        hospital=doctor.hospital,
        kind=kind,
        value=float(value),
        unit=str(request.data.get("unit", "")).strip(),
        notes=str(request.data.get("notes", "")).strip(),
    )
    return Response({
        "status": "success",
        "measurement_id": m.id,
        "message": f"{m.kind} recorded for {patient.full_name}",
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_measurements(request, health_id):
    """Measurement history for one patient (doctor must have access)."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)
    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)
    try:
        allowed = contract.functions.hasAccess(health_id, doctor.wallet_address).call()
    except Exception:
        allowed = True
    if not allowed:
        return Response({"error": "No access permission for this patient"}, status=403)

    return Response([{
        "id": m.id,
        "kind": m.kind,
        "value": m.value,
        "unit": m.unit,
        "notes": m.notes,
        "doctor": m.doctor.full_name if m.doctor else "",
        "hospital": m.hospital.name if m.hospital else _hospital_label(doctor),
        "created_at": m.created_at,
    } for m in patient.measurements.all()])


def _hospital_label(doctor):
    return doctor.hospital.name if doctor.hospital else doctor.facility_id


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_hospitals(request):
    """Hospital list (code + name only). Requires a session so the site
    does not leak which facilities exist in the network."""
    return Response([
        {"code": h.code, "name": h.name, "region": h.region}
        for h in Hospital.objects.all().order_by("name")
    ])


def _create_referral(doctor, request):
    """Doctor refers a patient to another hospital (dropdown selection)."""
    health_id = str(request.data.get("health_id", "")).strip()
    to_code = str(request.data.get("to_hospital", "")).strip()
    reason = str(request.data.get("reason", "")).strip()
    if not health_id or not to_code:
        return Response({"error": "health_id and to_hospital are required"}, status=400)
    if doctor.hospital and to_code.lower() == doctor.hospital.code.lower():
        return Response({"error": "Patient is already at your hospital"}, status=400)

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)
    to_hospital = Hospital.objects.filter(code__iexact=to_code).first()
    if not to_hospital:
        return Response({"error": "Target hospital not found"}, status=404)

    ref = Referral.objects.create(
        patient=patient,
        from_doctor=doctor,
        from_hospital=doctor.hospital,
        to_hospital=to_hospital,
        reason=reason,
    )
    return Response({
        "status": "success",
        "referral_id": ref.id,
        "message": f"Referral sent to {to_hospital.name}",
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def doctor_referrals(request):
    """GET: referrals the logged-in doctor has sent, newest first.
    POST: create a referral to another hospital."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)
    if request.method == "GET":
        return Response([
            _referral_json(r) for r in Referral.objects.filter(from_doctor=doctor)[:50]
        ])
    return _create_referral(doctor, request)


# ============ ACCOUNT: CHANGE PIN / PASSWORD (all roles) ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_secret(request):
    """Rotate the caller's own credential. Requires the CURRENT secret.
    - PATIENT: 4-digit PIN
    - DOCTOR:  4-digit PIN
    - STAFF:   password (8+ chars)
    Always returns the same generic error on a wrong current secret so the
    endpoint cannot be used to discover which roles exist."""
    if not request.auth:
        return Response({"error": "Authentication required"}, status=401)
    role = request.auth.get("role", "")
    current = str(request.data.get("current_secret", ""))
    new = str(request.data.get("new_secret", ""))

    if role == "STAFF":
        if len(new) < 8:
            return Response({"error": "New password must be at least 8 characters"}, status=400)
        staff = HospitalStaff.objects.filter(
            username__iexact=request.auth.get("username", "")
        ).first()
        if not staff or not current or not check_password(current, staff.password_hash):
            return Response({"error": "Current password is incorrect"}, status=401)
        staff.password_hash = make_password(new)
        staff.save(update_fields=["password_hash"])
        return Response({"status": "success", "message": "Password updated."})

    if role not in {"PATIENT", "DOCTOR"} or len(new) != 4 or not new.isdigit():
        return Response({"error": "New PIN must be exactly 4 digits"}, status=400)

    if role == "PATIENT":
        obj = Patient.objects.filter(
            health_id__iexact=request.auth.get("health_id", "")
        ).first()
    else:
        obj = Doctor.objects.filter(
            license_no__iexact=request.auth.get("license_no", "")
        ).first()
    if not obj or not current or not check_password(current, obj.pin_hash):
        return Response({"error": "Current PIN is incorrect"}, status=401)

    obj.pin_hash = make_password(new)
    obj.save(update_fields=["pin_hash"])
    return Response({"status": "success", "message": "PIN updated."})


def _referral_json(r):
    return {
        "id": r.id,
        "patient_health_id": r.patient.health_id,
        "patient_name": r.patient.full_name,
        "from_hospital": r.from_hospital.name if r.from_hospital else "",
        "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
        "to_hospital": r.to_hospital.name,
        "to_hospital_code": r.to_hospital.code,
        "reason": r.reason,
        "status": r.status,
        "responded_by": r.responded_by,
        "created_at": r.created_at,
        "responded_at": r.responded_at,
    }


# ============ HOSPITAL STAFF: REFERRAL INBOX ============
# Staff also sign in via the unified /api/login/ (username + password).


def _staff_from_request(request):
    """Resolve the JWT-authenticated hospital staff member."""
    if not request.auth or request.auth.get("role") != "STAFF":
        return None
    return HospitalStaff.objects.filter(
        username__iexact=request.auth.get("username", "")
    ).first()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def hospital_referrals(request):
    """Referral inbox for the staff member's hospital (newest first)."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Staff account not found"}, status=403)

    status_filter = request.query_params.get("status", "").strip().upper()
    qs = Referral.objects.filter(to_hospital=staff.hospital)
    if status_filter in {"PENDING", "ACCEPTED", "DECLINED", "CANCELLED"}:
        qs = qs.filter(status=status_filter)
    return Response([_referral_json(r) for r in qs[:100]])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def respond_referral(request, referral_id):
    """Accept or decline an incoming referral.
    Allowed: staff of the receiving hospital, or an APPROVED doctor whose
    hospital is the receiving hospital. Every response is recorded with who
    responded (audit)."""
    principal = request.auth
    actor = ""
    target_hospital = None

    if principal and principal.get("role") == "STAFF":
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff account not found"}, status=403)
        actor = f"STAFF:{staff.username}"
        target_hospital = staff.hospital
    elif principal and principal.get("role") == "DOCTOR":
        doctor = _doctor_from_request(request)
        if not doctor:
            return Response({"error": "Doctor not found"}, status=403)
        actor = f"DOCTOR:{doctor.license_no}"
        target_hospital = doctor.hospital
    else:
        return Response({"error": "Not allowed"}, status=403)

    ref = Referral.objects.filter(id=referral_id, to_hospital=target_hospital).first()
    if not ref:
        return Response({"error": "Referral not found for your hospital"}, status=404)
    if ref.status != "PENDING":
        return Response({"error": f"Referral already {ref.status.lower()}"}, status=409)

    action = str(request.data.get("action", "")).strip().upper()
    if action not in {"ACCEPTED", "DECLINED"}:
        return Response({"error": "action must be ACCEPTED or DECLINED"}, status=400)

    ref.status = action
    ref.responded_by = actor
    ref.responded_at = timezone.now()
    ref.save()
    return Response({"status": action.lower(), "referral": _referral_json(ref)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_incoming_referrals(request):
    """Pending referrals addressed to the logged-in doctor's hospital —
    the doctor-facing notification feed."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)
    incoming = Referral.objects.filter(
        to_hospital=doctor.hospital, status="PENDING"
    ) if doctor.hospital else Referral.objects.none()
    return Response([_referral_json(r) for r in incoming[:50]])

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

    doctor = _doctor_from_request(request)
    wallet = doctor.wallet_address if doctor else facility_address()
    tx_hash = ""
    try:
        tx = contract.functions.breakGlass(health_id, wallet, facility_id, reason)
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
