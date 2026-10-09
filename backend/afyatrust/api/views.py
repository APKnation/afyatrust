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
from django.db.models import Q
from . import wallet_manager
from .blockchain import (
    cached_has_access,
    cache_invalidate,
    checksum_address,
    contract,
    CONTRACT_ADDRESS,
    ensure_gas,
    facility_address,
    send_transaction,
    send_transaction_async,
)
from .blockchain import w3


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
        audit_entries = [{
            "accessor": e[0],
            "role": e[1],
            "facility": e[2],
            "action": e[3],
            "timestamp": e[4],
            "transaction_hash": None,
        } for e in trail]

        # Try to enrich with transaction hashes from event logs
        action_to_event = {
            "PATIENT_REGISTERED": "PatientRegistered",
            "RECORD_ADDED": "RecordAdded",
            "GRANTED_TO_DOCTOR": "AccessGranted",
            "REVOKED_DOCTOR": "AccessRevoked",
            "VIEW": "RecordViewed",
            "BREAK_GLASS": "BreakGlassUsed",
            "EMERGENCY_ACCESS_REVOKED": "EmergencyAccessRevoked",
        }

        for entry in audit_entries:
            event_name = action_to_event.get(entry["action"])
            if not event_name:
                continue
            try:
                c = _get_contract()
                event = getattr(c.events, event_name)
                logs = event.get_logs(
                    argument_filters={"healthID": patient.health_id},
                    from_block=0
                )
                for log in logs:
                    args = dict(log.args)
                    # Match by timestamp (within 2 minutes) and accessor
                    log_ts = args.get("timestamp") or args.get("expiry") or 0
                    if abs(log_ts - entry["timestamp"]) <= 120:
                        log_accessor = args.get("clinician") or args.get("grantedTo") or args.get("revokedFrom") or args.get("viewer") or args.get("wallet") or ""
                        if log_accessor.lower() == entry["accessor"].lower():
                            entry["transaction_hash"] = log.transactionHash.hex()
                            break
            except Exception:
                pass  # Best effort

        # Newest first — dashboards must show the latest action at the top,
        # but the contract returns the trail oldest-first.
        audit_entries.sort(key=lambda e: e["timestamp"], reverse=True)
        events[:] = audit_entries
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

    # Lean dashboard path: return DB records immediately so the patient
    # dashboard is never blocked by slow on-chain RPC calls.
    # On-chain verification (getRecords / getAuditTrail) is intentionally
    # NOT called here — the Activity tab fetches its own story, and the
    # per-record "verified" badge already reflects the DB tx_hash.
    final_records = [{
        "id": r.id,
        "facility": r.facility_name,
        "type": r.record_type,
        "data": r.record_data,
        "hash": r.record_hash,
        "tx_hash": r.tx_hash,
        "date": r.created_at,
        "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
    } for r in patient.records.all()]

    events: list = []  # audit_trail is fetched by the Activity tab on demand

    return Response({
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "wallet_address": patient.wallet_address,
        "records": final_records,
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
            "from_hospital": r.from_hospital.name if r.from_hospital else "",
            "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
            "to_hospital": r.to_hospital.name,
            "to_hospital_code": r.to_hospital.code,
            "reason": r.reason,
            "status": r.status,
            "responded_by": r.responded_by,
            "date": r.created_at,
            "responded_at": r.responded_at,
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
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(doctor_wallet), days
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    # Permission changed (or was attempted) — drop cached hasAccess for this
    # patient so doctors see the new state on their next call.
    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

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
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(doctor_wallet)
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    # Revocation must be visible to doctors immediately.
    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

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
    """Doctor's own access requests with their status (PENDING / APPROVED /
    REJECTED), newest first — so the doctor can see whether the patient
    accepted or rejected each request."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response([], status=403)
    reqs = AccessRequest.objects.filter(doctor=doctor)[:50]
    return Response([{
        "id": r.id,
        "patient_health_id": r.patient.health_id,
        "patient_name": r.patient.full_name,
        "facility_id": r.facility_id,
        "reason": r.reason,
        "status": r.status,
        "responded_at": r.responded_at,
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

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    # Cached read (60s TTL): permissions only change via grant/revoke/approve,
    # which invalidate the cache — so this is safe and skips a slow RPC round-trip.
    allowed, chain_ok = cached_has_access(health_id, wallet)

    if not allowed:
        # DB fallback: live AccessGrant rows authorize the view too. This covers
        # the 1-hour emergency break-glass window (the contract never opens an
        # on-chain permission for it) and keeps views working when the chain
        # is unreachable for a patient with a valid, unexpired grant.
        allowed = AccessGrant.objects.filter(
            patient=patient, doctor=doctor, active=True, expires_at__gt=timezone.now()
        ).exists()

    if not allowed:
        return Response({
            "error": "No access permission",
            "action": "REQUEST_ACCESS",
            "chain_checked": chain_ok,
        }, status=403)

    # Step 6: log the view on-chain (viewer passed explicitly — the facility
    # wallet signs but the audit entry must name the real accessor).
    # Fire-and-forget: waiting ~12s for the recordView receipt would defeat
    # the cached hasAccess read; the audit tx is best-effort anyway.
    try:
        tx = contract.functions.recordView(health_id, checksum_address(wallet), facility_id)
        send_transaction_async(tx)
    except Exception:
        pass  # PoC: audit write is best-effort

    # Fetch the list of record pointers directly from the blockchain
    # to demonstrate true decentralized data exchange.
    chain_records = []
    try:
        chain_records = contract.functions.getRecords(health_id).call()
    except Exception:
        pass  # Fallback to local if chain is unreachable

    if chain_records:
        hashes = [r[0] for r in chain_records]
        local_records = {r.record_hash: r for r in patient.records.filter(record_hash__in=hashes)}
        final_records = []
        for cr in chain_records:
            r_hash, fac_id, meta_uri, ts = cr
            if r_hash in local_records:
                r = local_records[r_hash]
                final_records.append({
                    "facility": r.facility_name,
                    "type": r.record_type,
                    "data": r.record_data,
                    "hash": r.record_hash,
                    "date": r.created_at,
                    "verified": True,
                    "source_uri": meta_uri,
                })
    else:
        # Fallback if no chain records (or chain offline in PoC)
        final_records = [{
            "facility": r.facility_name,
            "type": r.record_type,
            "data": r.record_data,
            "hash": r.record_hash,
            "date": r.created_at,
            "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
        } for r in patient.records.all()]

    return Response({
        "health_id": health_id,
        "full_name": patient.full_name,
        "chain_checked": chain_ok,
        "records": final_records,
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
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(req.doctor_wallet), 7
        )
        tx_hash = send_transaction(tx, patient_key)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

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

    grants = AccessGrant.objects.filter(doctor=doctor).select_related("patient")
    items = []
    for g in grants:
        if g.source == "BREAK_GLASS":
            # The contract never opens an on-chain permission for break-glass;
            # the emergency window lives (and expires) in the DB.
            active = g.active and g.expires_at > timezone.now()
        else:
            allowed, _ = cached_has_access(g.patient.health_id, doctor.wallet_address)
            active = allowed or (g.active and g.expires_at > timezone.now())
        items.append({
            "health_id": g.patient.health_id,
            "full_name": g.patient.full_name,
            "granted_at": g.created_at,
            "expires_at": g.expires_at,
            "active": active,
            "source": g.source or ("grant" if g.active else "expired"),
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

    allowed, chain_ok = cached_has_access(health_id, doctor.wallet_address)
    if not chain_ok:
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
    allowed, chain_ok = cached_has_access(health_id, doctor.wallet_address)
    if not chain_ok:
        allowed = True  # PoC: chain unreachable — demo continues
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_doctors(request):
    """Patient-facing doctor lookup: free-text search by name or license.
    Returns doctors which match the query, so the patient can pick
    the right doctor without knowing their license number in advance.
    """
    query = str(request.query_params.get("q", "")).strip()
    # Only APPROVED doctors can be granted access; pending/revoked accounts
    # must not appear in the patient's picker.
    doctors = Doctor.objects.filter(status="APPROVED")
    if query:
        doctors = doctors.filter(
            Q(license_no__icontains=query)
            | Q(full_name__icontains=query)
        )
    return Response([
        {
            "id": d.id,
            "license_no": d.license_no,
            "full_name": d.full_name,
            "wallet_address": d.wallet_address,
            "facility_id": d.facility_id,
        }
        for d in doctors.order_by("full_name")[:20]
    ])


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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def hospital_outgoing_referrals(request):
    """Referrals sent FROM this hospital to another hospital (newest first).
    The sending hospital's staff uses this to track where their patients have
    been referred and whether the receiving hospital accepted or declined."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Staff account not found"}, status=403)

    status_filter = request.query_params.get("status", "").strip().upper()
    qs = Referral.objects.filter(from_hospital=staff.hospital)
    if status_filter in {"PENDING", "ACCEPTED", "DECLINED", "CANCELLED"}:
        qs = qs.filter(status=status_filter)
    return Response([_referral_json(r) for r in qs[:100]])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def hospital_records_exchange(request):
    """Records this hospital has anchored on-chain — the metadata_uri
    exchange pointers that another hospital can fetch to verify the data.

    This is the inter-hospital data flow surface: every record added by this
    hospital writes a pointer like
        https://api.<facility>.afyatrust.network/exchange/<hash>
    which any other hospital can GET to confirm the record exists and matches
    the on-chain hash — the clinical payload stays with this hospital."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Staff account not found"}, status=403)

    records = (
        MedicalRecord.objects.filter(
            patient__hospital=staff.hospital
        )
        .select_related("patient")
        .order_by("-created_at")[:100]
    )
    return Response([
        {
            "id": r.id,
            "health_id": r.patient.health_id,
            "patient_name": r.patient.full_name,
            "record_type": r.record_type,
            "record_hash": r.record_hash,
            "metadata_uri": f"https://api.{r.facility_id.lower()}.afyatrust.network/exchange/{r.record_hash}",
            "tx_hash": r.tx_hash,
            "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
            "created_at": r.created_at,
        }
        for r in records
    ])


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
    """Emergency access. Always allowed, always logged on-chain (step 7).

    The contract's breakGlass only emits an event + audit entry — it does not
    open a permission — so the backend opens a short emergency window in the
    DB (AccessGrant, 1 hour) and drops the cached hasAccess result so the
    clinician's next record view goes through immediately.
    """
    data = request.data
    health_id = str(data.get("health_id", "")).strip()
    facility_id = data.get("facility_id", "")
    reason = data.get("reason", "")

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    doctor = _doctor_from_request(request)
    wallet = doctor.wallet_address if doctor else facility_address()
    tx_hash = ""
    try:
        tx = contract.functions.breakGlass(health_id, checksum_address(wallet), facility_id, reason)
        tx_hash = send_transaction(tx)
    except Exception as e:
        tx_hash = f"PENDING: {e}"

    if doctor:
        # A live normal grant is never shortened — only add the emergency
        # window when the doctor has no active access yet.
        live = AccessGrant.objects.filter(
            patient=patient, doctor=doctor, active=True, expires_at__gt=timezone.now()
        ).exists()
        if not live:
            AccessGrant.objects.create(
                patient=patient, doctor=doctor,
                tx_hash=tx_hash[:66],
                active=True,
                expires_at=timezone.now() + timedelta(hours=1),
                source="BREAK_GLASS",
            )
    cache_invalidate(f"hasAccess:{health_id.lower()}")

    return Response({
        "status": "success",
        "message": "Break-glass used. Emergency access granted for 1 hour and logged for accountability.",
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

    facility_id = data.get("facility_id", "UNKNOWN")
    
    # Decentralized Exchange: The hospital hosting the data exposes an endpoint.
    # We construct the metadata_uri that will be stored on-chain, pointing to Hospital A.
    metadata_uri = f"https://api.{facility_id.lower()}.afyatrust.network/exchange/{record_hash}"

    try:
        tx = contract.functions.addRecord(
            patient.health_id, record_hash,
            facility_id, metadata_uri
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


@api_view(["GET"])
@permission_classes([AllowAny])
def exchange_record(request, record_hash):
    """Decentralized exchange endpoint (the metadata_uri stored on-chain).

    Hospital A writes `https://api.<facility>.afyatrust.network/exchange/<hash>`
    on-chain when adding a record. Anyone (typically Hospital B's backend or a
    verifying party) can later GET this URL to confirm the record exists and
    matches the hash anchored on Sepolia — the record data itself stays with
    the facility that created it.

    Only the hash is sensitive-free: we deliberately return the metadata and
    on-chain anchors, NOT the clinical payload, without authentication.
    """
    h = (record_hash or "").strip()
    # Some PoC-era rows store hashes without the 0x prefix — try the exact
    # value first, then the prefixed form, so both lookup styles resolve.
    record = MedicalRecord.objects.filter(record_hash__iexact=h).select_related("patient", "patient__hospital").first()
    if not record and not h.startswith("0x"):
        record = MedicalRecord.objects.filter(record_hash__iexact="0x" + h).select_related("patient", "patient__hospital").first()
    if not record:
        return Response({"error": "Record not found for this hash"}, status=404)

    # Re-verify the hash of the stored payload — proves the off-chain data
    # has not been tampered with since it was anchored on-chain.
    recomputed = "0x" + hashlib.sha256(json.dumps(record.record_data, sort_keys=True).encode()).hexdigest()

    tx_ok = bool(record.tx_hash) and not record.tx_hash.startswith("PENDING")

    return Response({
        "record_hash": record.record_hash,
        "hash_matches_payload": recomputed == record.record_hash,
        "record_type": record.record_type,
        "facility_id": record.facility_id,
        "facility_name": record.facility_name,
        "health_id": record.patient.health_id,
        "created_at": record.created_at,
        "anchored_on_chain": tx_ok,
        "tx_hash": record.tx_hash if tx_ok else None,
        "etherscan_url": f"https://sepolia.etherscan.io/tx/{record.tx_hash}" if tx_ok else None,
        "metadata_uri": f"https://api.{record.facility_id.lower()}.afyatrust.network/exchange/{record.record_hash}",
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def facility_records(request):
    """Recent records added by the signed-in staff member's hospital,
    newest first — shows the on-chain status (hash + tx) of each."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Staff account not found"}, status=403)

    records = (
        MedicalRecord.objects.filter(
            patient__hospital=staff.hospital
        )
        .select_related("patient")
        .order_by("-created_at")[:50]
    )
    return Response([{
        "id": r.id,
        "health_id": r.patient.health_id,
        "patient_name": r.patient.full_name,
        "facility": r.facility_name,
        "record_type": r.record_type,
        "record_data": r.record_data,
        "record_hash": r.record_hash,
        "tx_hash": r.tx_hash,
        "verified": bool(r.tx_hash) and not r.tx_hash.startswith("PENDING"),
        "created_at": r.created_at,
    } for r in records])


# ============ BLOCKCHAIN EVENT HISTORY (Etherscan-verified) ============

def _get_contract():
    """Get contract instance with proper error handling."""
    try:
        return contract
    except Exception as e:
        raise RuntimeError(f"Contract not available: {e}")


# Public RPCs cap eth_getLogs block ranges (Sepolia: 10,000 here) and
# reject anything wider — so every log query must walk in chunks.
_LOG_BLOCK_CHUNK = 9_000
_deploy_block_cache: dict = {}


def _deploy_block() -> int:
    """First block where the contract has code (binary search, cached).

    Querying from 0 wastes chunks of empty blocks; querying from deploy
    block keeps the number of RPC round-trips minimal.
    """
    if "block" in _deploy_block_cache:
        return _deploy_block_cache["block"]
    try:
        addr = w3.to_checksum_address(CONTRACT_ADDRESS)
    except Exception:
        return 0
    lo, hi = 0, w3.eth.block_number
    first_code = lo
    while lo <= hi:
        mid = (lo + hi) // 2
        try:
            if w3.eth.get_code(addr, mid):
                first_code = mid
                hi = mid - 1
            else:
                lo = mid + 1
        except Exception:
            return 0
    _deploy_block_cache["block"] = first_code
    return first_code


def _health_id_topic(health_id: str) -> str:
    """Indexed string event params are stored on-chain as their keccak256
    hash (a topic), NOT as plaintext. Filtering eth_getLogs by the plaintext
    value therefore matches nothing — hash it first.
    """
    from eth_utils import keccak
    from eth_abi import encode
    try:
        encoded = encode(["string"], [health_id])
        return "0x" + keccak(encoded).hex()
    except Exception:
        return ""


def _fetch_events(event_name, from_block=0, to_block="latest", argument_filters=None):
    """Fetch events from the contract across chunked block ranges.

    - Handles the RPC 10,000-block range cap by walking the chain in
      _LOG_BLOCK_CHUNK windows from the deploy block.
    - argument_filters accepts plaintext values for indexed string params
      (e.g. healthID) and converts them to the on-chain hash topic.
    - Returns [] on unrecoverable RPC errors instead of raising, so callers
      never break — but chunked fetches mean real events now come through.
    """
    try:
        c = _get_contract()
        event = getattr(c.events, event_name)

        start = max(from_block, _deploy_block()) if from_block == 0 else from_block
        latest = w3.eth.block_number if to_block in ("latest", "") else int(to_block)
        if start > latest:
            return []

        # Convert plaintext filters for indexed string params to topics.
        abi_event = event.abi
        indexed_inputs = [i for i in abi_event.get("inputs", []) if i.get("indexed")]
        topics_filters = {}
        plain_filters = {}
        for k, v in (argument_filters or {}).items():
            inp = next((i for i in indexed_inputs if i["name"] == k), None)
            if inp and inp.get("type") == "string":
                h = _health_id_topic(v)
                if h:
                    topics_filters[k] = h
            elif inp:
                topics_filters[k] = v  # address/uint indexed: usable as-is
            else:
                plain_filters[k] = v  # non-indexed: match client-side

        results = []
        chunk_start = start
        while chunk_start <= latest:
            chunk_end = min(chunk_start + _LOG_BLOCK_CHUNK - 1, latest)
            try:
                logs = event.get_logs(
                    argument_filters={**topics_filters},
                    from_block=chunk_start,
                    to_block=chunk_end,
                )
            except Exception:
                # This window failed (transient RPC error) — skip it rather
                # than dropping the whole fetch.
                chunk_start = chunk_end + 1
                continue
            for log in logs:
                args = dict(log.args)
                # Non-indexed params arrive as plaintext — apply client-side filters.
                if any(args.get(k) != v for k, v in plain_filters.items()):
                    continue
                results.append({
                    "transaction_hash": log.transactionHash.hex(),
                    "block_number": log.blockNumber,
                    "event": event_name,
                    "args": args,
                })
            chunk_start = chunk_end + 1
        return results
    except Exception as e:
        # Return empty list on error instead of dict to avoid breaking .extend()
        return []


def _get_hospital_code_from_request(request):
    """Extract hospital code from JWT for any role."""
    if not request.auth:
        return None
    role = request.auth.get("role", "")
    if role == "DOCTOR":
        doctor = Doctor.objects.filter(license_no__iexact=request.auth.get("license_no", "")).first()
        return doctor.facility_id if doctor else None
    elif role == "STAFF":
        staff = HospitalStaff.objects.filter(username__iexact=request.auth.get("username", "")).first()
        return staff.hospital.code if staff and staff.hospital else None
    elif role == "PATIENT":
        patient = Patient.objects.filter(health_id=request.auth.get("health_id", "")).first()
        return patient.hospital.code if patient and patient.hospital else None
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def blockchain_events(request):
    """
    Fetch blockchain events for the authenticated user's hospital.
    Supports filtering by event type, date range, and patient Health ID.
    All events include Etherscan transaction links for verification.
    """
    hospital_code = _get_hospital_code_from_request(request)
    if not hospital_code:
        return Response({"error": "Hospital not found for your account"}, status=403)

    # Query parameters
    event_type = request.query_params.get("event_type", "").strip()  # e.g., "RecordAdded", "AccessGranted"
    health_id = request.query_params.get("health_id", "").strip()
    from_block = request.query_params.get("from_block")
    to_block = request.query_params.get("to_block", "latest")
    limit = int(request.query_params.get("limit", 100))

    # Map event types to contract events
    event_map = {
        "patient_registered": "PatientRegistered",
        "record_added": "RecordAdded",
        "access_granted": "AccessGranted",
        "access_revoked": "AccessRevoked",
        "record_viewed": "RecordViewed",
        "break_glass_used": "BreakGlassUsed",
        "emergency_access_granted": "EmergencyAccessGranted",
    }

    all_events = []

    if event_type and event_type in event_map:
        # Fetch specific event type
        contract_event = event_map[event_type]
        argument_filters = {}
        if health_id:
            argument_filters["healthID"] = health_id
        # Note: facilityID filter works for RecordAdded and BreakGlassUsed
        if contract_event in ["RecordAdded", "BreakGlassUsed"]:
            argument_filters["facilityID"] = hospital_code
        events = _fetch_events(contract_event, argument_filters=argument_filters)
        all_events.extend(events)
    else:
        # Fetch all event types relevant to this hospital
        # For events with facilityID, filter by hospital
        facility_events = ["RecordAdded", "BreakGlassUsed"]
        for evt in facility_events:
            argument_filters = {"facilityID": hospital_code}
            if health_id:
                argument_filters["healthID"] = health_id
            events = _fetch_events(evt, argument_filters=argument_filters)
            all_events.extend(events)

        # For patient-specific events, filter by health_id if provided
        patient_events = ["PatientRegistered", "AccessGranted", "AccessRevoked", "RecordViewed", "EmergencyAccessGranted"]
        if health_id:
            for evt in patient_events:
                argument_filters = {"healthID": health_id}
                events = _fetch_events(evt, argument_filters=argument_filters)
                all_events.extend(events)

    # Sort by block number (newest first) and limit
    all_events.sort(key=lambda x: x.get("block_number", 0), reverse=True)
    all_events = all_events[:limit]

    # Add Etherscan links
    for evt in all_events:
        if "transaction_hash" in evt:
            evt["etherscan_url"] = f"https://sepolia.etherscan.io/tx/{evt['transaction_hash']}"
            # Add human-readable timestamp
            try:
                block = w3.eth.get_block(evt["block_number"])
                evt["timestamp"] = block.timestamp
                evt["datetime"] = block.timestamp
            except Exception:
                evt["timestamp"] = None
                evt["datetime"] = None

    return Response({
        "hospital_code": hospital_code,
        "events": all_events,
        "count": len(all_events),
    })


# ============ UNIFIED ACTIVITY STORY (human-readable on-chain history) ==========

_ACTION_STORY = {
    "PatientRegistered": ("registered on AfyaTrust", "🟢"),
    "RecordAdded": ("added a medical record (hash anchored on-chain)", "📄"),
    "AccessGranted": ("was GRANTED access to the records", "🔑"),
    "AccessRevoked": ("had access REVOKED", "🚫"),
    "RecordViewed": ("VIEWED the records", "👁"),
    "BreakGlassUsed": ("used BREAK-GLASS emergency access", "🚨"),
    "EmergencyAccessGranted": ("received a 1-hour EMERGENCY window", "⏱"),
}


def _who(args: dict) -> str:
    """Best-effort human identity for the acting wallet in an event."""
    wallet = (args.get("grantedTo") or args.get("revokedFrom") or args.get("viewer")
              or args.get("clinician") or args.get("wallet") or "")
    if not wallet:
        return ""
    w = wallet.lower()
    doc = Doctor.objects.filter(wallet_address__iexact=wallet).first()
    if doc:
        return f"Dr. {doc.full_name} ({doc.facility_id})"
    pat = Patient.objects.filter(wallet_address__iexact=wallet).first()
    if pat:
        return pat.full_name
    if facility_address() and w == facility_address().lower():
        return "Hospital staff (facility wallet)"
    return f"{wallet[:10]}…"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_activity_story(request, health_id):
    """One unified, human-readable timeline of everything that happened to
    this patient's data on-chain — who did what, when, verified by tx.

    Merges the on-chain audit trail (has every action) with the raw event
    logs (has tx hashes) into a single story, e.g.:
      "Dr. Alice (1212) VIEWED the records — verified on Etherscan"
    """
    requestor_role = request.auth.get("role", "") if request.auth else ""
    if requestor_role == "PATIENT":
        if request.auth.get("health_id", "") != health_id:
            return Response({"error": "Not authorized"}, status=403)
    elif requestor_role == "DOCTOR":
        doctor = _doctor_from_request(request)
        if not doctor:
            return Response({"error": "Doctor not verified"}, status=403)
        allowed, _ = cached_has_access(health_id, doctor.wallet_address)
        live_grant = AccessGrant.objects.filter(
            patient__health_id__iexact=health_id, doctor=doctor,
            active=True, expires_at__gt=timezone.now(),
        ).exists()
        if not (allowed or live_grant):
            return Response({"error": "No access permission for this patient"}, status=403)
    elif requestor_role == "STAFF":
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff not found"}, status=403)
        patient = Patient.objects.filter(health_id=health_id).first()
        if not patient or patient.hospital != staff.hospital:
            return Response({"error": "Patient not in your hospital"}, status=403)
    else:
        return Response({"error": "Not authorized"}, status=403)

    # 1) The on-chain audit trail — complete, authoritative, every action.
    try:
        trail = contract.functions.getAuditTrail(health_id).call()
    except Exception:
        trail = []

    # 2) Raw event logs — supply tx hashes per (action, actor, timestamp).
    events_by_key: dict = {}
    for evt_name in ["PatientRegistered", "RecordAdded", "AccessGranted",
                     "AccessRevoked", "RecordViewed", "BreakGlassUsed",
                     "EmergencyAccessGranted"]:
        for ev in _fetch_events(evt_name, argument_filters={"healthID": health_id}):
            a = ev["args"]
            actor = (a.get("grantedTo") or a.get("revokedFrom") or a.get("viewer")
                     or a.get("clinician") or "")
            ts = a.get("timestamp")
            if ts is None:
                try:
                    blk = w3.eth.get_block(ev["block_number"])
                    ts = blk.timestamp
                except Exception:
                    ts = 0
            key = (actor.lower(), round(ts / 120))  # 2-min bucket match
            events_by_key.setdefault(key, ev)

    def _match_tx(action: str, accessor: str, ts: int) -> str:
        """Find the tx hash of the event matching this audit entry."""
        action_to_event = {
            "PATIENT_REGISTERED": "PatientRegistered",
            "RECORD_ADDED": "RecordAdded",
            "GRANTED_TO_DOCTOR": "AccessGranted",
            "REVOKED_DOCTOR": "AccessRevoked",
            "VIEW": "RecordViewed",
            "BREAK_GLASS": "BreakGlassUsed",
            "EMERGENCY_ACCESS_REVOKED": "EmergencyAccessRevoked",
        }
        ev_name = action_to_event.get(action)
        if not ev_name:
            return ""
        for (actor_key, bucket), ev in events_by_key.items():
            if ev["event"] == ev_name and actor_key == (accessor or "").lower() \
                    and abs(ev.get("args", {}).get("timestamp", ts) - ts) <= 120:
                return ev["transaction_hash"]
        # Fallback: match on event name + time bucket only (actor field
        # names differ between the audit trail and raw events).
        for (actor_key, bucket), ev in events_by_key.items():
            if ev["event"] == ev_name and abs(ev.get("args", {}).get("timestamp", ts) - ts) <= 120:
                return ev["transaction_hash"]
        return ""

    story = []
    for e in trail:
        accessor, role, facility, action, ts = e[0], e[1], e[2], e[3], e[4]
        tx = _match_tx(action, accessor, ts)
        # Map audit action → story fragment
        action_map = {
            "PATIENT_REGISTERED": "PatientRegistered",
            "RECORD_ADDED": "RecordAdded",
            "GRANTED_TO_DOCTOR": "AccessGranted",
            "REVOKED_DOCTOR": "AccessRevoked",
            "VIEW": "RecordViewed",
            "BREAK_GLASS": "BreakGlassUsed",
            "EMERGENCY_ACCESS_REVOKED": "EmergencyAccessRevoked",
        }
        ev_name = action_map.get(action, "")
        # The "who": resolve wallet → doctor/patient/staff name.
        who = _who({"viewer": accessor, "clinician": accessor, "wallet": accessor,
                    "grantedTo": accessor, "revokedFrom": accessor})
        verb = _ACTION_STORY.get(ev_name, (action.lower().replace("_", " "), "•"))
        story.append({
            "action": action,
            "event": ev_name,
            "who": who,
            "wallet": accessor,
            "role": role,
            "facility": facility,
            "verb": verb[0],
            "icon": verb[1],
            "timestamp": ts,
            "transaction_hash": tx or None,
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{tx}" if tx else None,
        })

    story.sort(key=lambda x: x["timestamp"], reverse=True)
    return Response({
        "health_id": health_id,
        "story": story,
        "count": len(story),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_blockchain_history(request, health_id):
    """
    Fetch complete blockchain transaction history for a specific patient.
    Returns all events related to this patient across all hospitals.
    Includes Etherscan verification links.
    """
    # Verify access (patient can see own, doctor with permission, staff of patient's hospital)
    requestor_role = request.auth.get("role", "") if request.auth else ""

    if requestor_role == "PATIENT":
        patient_health_id = request.auth.get("health_id", "")
        if patient_health_id != health_id:
            return Response({"error": "Not authorized"}, status=403)
    elif requestor_role == "DOCTOR":
        doctor = _doctor_from_request(request)
        if not doctor:
            return Response({"error": "Doctor not verified"}, status=403)
        allowed, _ = cached_has_access(health_id, doctor.wallet_address)
        if not allowed:
            return Response({"error": "No access permission for this patient"}, status=403)
    elif requestor_role == "STAFF":
        staff = _staff_from_request(request)
        if not staff:
            return Response({"error": "Staff not found"}, status=403)
        patient = Patient.objects.filter(health_id=health_id).first()
        if not patient or patient.hospital != staff.hospital:
            return Response({"error": "Patient not in your hospital"}, status=403)
    else:
        return Response({"error": "Not authorized"}, status=403)

    # Fetch all event types for this patient
    event_types = [
        "PatientRegistered",
        "RecordAdded",
        "AccessGranted",
        "AccessRevoked",
        "RecordViewed",
        "BreakGlassUsed",
        "EmergencyAccessGranted",
    ]

    all_events = []
    for evt_name in event_types:
        argument_filters = {"healthID": health_id}
        events = _fetch_events(evt_name, argument_filters=argument_filters)
        all_events.extend(events)

    # Sort by block number (newest first)
    all_events.sort(key=lambda x: x.get("block_number", 0), reverse=True)

    # Add Etherscan links and timestamps
    for evt in all_events:
        if "transaction_hash" in evt:
            evt["etherscan_url"] = f"https://sepolia.etherscan.io/tx/{evt['transaction_hash']}"
            try:
                block = w3.eth.get_block(evt["block_number"])
                evt["timestamp"] = block.timestamp
            except Exception:
                evt["timestamp"] = None

    return Response({
        "health_id": health_id,
        "events": all_events,
        "count": len(all_events),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def hospital_blockchain_summary(request):
    """
    Get a summary of blockchain activity for the hospital.
    Useful for admin dashboards showing transaction counts by type.
    """
    hospital_code = _get_hospital_code_from_request(request)
    if not hospital_code:
        return Response({"error": "Hospital not found for your account"}, status=403)

    summary = {}
    event_types = [
        "PatientRegistered",
        "RecordAdded",
        "AccessGranted",
        "AccessRevoked",
        "RecordViewed",
        "BreakGlassUsed",
        "EmergencyAccessGranted",
    ]

    for evt_name in event_types:
        argument_filters = {}
        if evt_name in ["RecordAdded", "BreakGlassUsed"]:
            argument_filters["facilityID"] = hospital_code
        events = _fetch_events(evt_name, argument_filters=argument_filters)
        summary[evt_name.lower()] = len(events)

    return Response({
        "hospital_code": hospital_code,
        "summary": summary,
        "total_transactions": sum(summary.values()),
    })
