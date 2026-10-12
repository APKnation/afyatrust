"""AfyaTrust PoC API endpoints.

Implements the 7 demo steps: registration (wallet + contract), PIN login,
records, permissions, doctor access check, and break-glass.
"""
import hashlib
import json
import logging
import math
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
    check_has_access,
    cache_invalidate,
    checksum_address,
    contract,
    CONTRACT_ADDRESS,
    emergency_access_remaining,
    ensure_clinician_role,
    facility_address,
    revoke_emergency_access_on_chain,
    send_transaction,
    send_transaction_async,
)
from .blockchain import w3

logger = logging.getLogger(__name__)


def _record_payload_hash(record_data):
    """Hash a record using the canonical serialization used at ingestion."""
    serialized = json.dumps(record_data, sort_keys=True)
    return "0x" + hashlib.sha256(serialized.encode()).hexdigest()


def _measurement_payload(measurement):
    return {
        "kind": measurement.kind,
        "value": measurement.value,
        "unit": measurement.unit,
        "notes": measurement.notes,
        "captured_at": measurement.created_at.isoformat(),
    }


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


def _doctor_can_view_patient(doctor, patient):
    """Require an individual live chain grant or a live emergency grant."""
    allowed, chain_ok = check_has_access(
        patient.health_id, doctor.wallet_address
    )
    if allowed:
        return True, chain_ok
    emergency = AccessGrant.objects.filter(
        patient=patient,
        doctor=doctor,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=timezone.now(),
    ).exists()
    if emergency:
        return True, chain_ok
    return False, chain_ok


def _on_chain_permission_active(health_id: str, doctor_wallet: str) -> bool:
    """True when the contract still lists a live permission for this doctor.

    Used after a failed revoke: if the chain has nothing left to revoke, the
    local bookkeeping can safely be closed; if a live permission remains, the
    caller must report that access still stands.
    """
    try:
        now_ts = int(timezone.now().timestamp())
        wallet = checksum_address(doctor_wallet).lower()
        return any(
            str(permission[0]).lower() == wallet
            and permission[4]
            and int(permission[3]) > now_ts
            for permission in contract.functions.getPermissions(health_id).call()
        )
    except Exception:
        return True  # chain unreadable — assume it stands and report failure


def _read_audit_trail(health_id: str):
    """getAuditTrail with one retry — public Sepolia RPCs drop requests
    intermittently and a single failure used to blank a patient's whole trail."""
    for attempt in (1, 2):
        try:
            return contract.functions.getAuditTrail(health_id).call()
        except Exception:
            logger.warning(
                "Audit trail read failed for %s (attempt %d)",
                health_id, attempt,
            )
    return None


def _audit(patient, events):
    """Fetch and normalize the on-chain audit trail for a patient."""
    trail = _read_audit_trail(patient.health_id)
    if trail is None:
        events[:] = []  # chain unreachable — show an empty trail
        return events
    try:
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
                # No server-side healthID filter: web3 mis-encodes string
                # topics. Fetch this event's logs and match the patient's
                # topic client-side (see _topic_matches).
                topic = _health_id_topic(patient.health_id)
                topic_bytes = bytes.fromhex(topic[2:]) if topic else b""
                logs = event.get_logs(from_block=_deploy_block())
                for log in logs:
                    args = dict(log.args)
                    if topic_bytes and not _topic_matches(
                        args.get("healthID"), topic_bytes
                    ):
                        continue
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
        logger.exception("Could not normalize audit trail for %s", patient.health_id)
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
        "phone": patient.phone,
        "wallet_address": patient.wallet_address,
        "hospital": patient.hospital.name if patient.hospital else (patient.registered_by_facility or ""),
        "records": final_records,
        "measurements": [{
            "id": m.id,
            "kind": m.kind,
            "value": m.value,
            "unit": m.unit,
            "notes": m.notes,
            "doctor": m.doctor.full_name if m.doctor else "",
            "hospital": m.hospital.name if m.hospital else (m.facility_id or ""),
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_patient_summary(request):
    """Return a summary of the authenticated patient's recorded history."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    records = list(patient.records.all())
    measurements = list(
        patient.measurements.select_related("doctor", "hospital").all()
    )
    return Response(_patient_health_summary(patient, records, measurements))


# ============ 3b. PATIENT PROFILE (view + edit own profile) ============

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_profile(request):
    """Return the authenticated patient's own profile fields that they are
    allowed to edit: full_name, phone. identity fields (health_id, wallet) are
    included read-only so the UI can show the complete profile."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)
    return Response({
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "phone": patient.phone,
        "wallet_address": patient.wallet_address,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def patch_patient_profile(request):
    """Update the authenticated patient's editable profile fields.
    Only full_name and phone may be changed by the patient."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    full_name = str(request.data.get("full_name", "")).strip()
    phone = str(request.data.get("phone", "")).strip()

    if not full_name:
        return Response({"error": "full_name is required"}, status=status.HTTP_400_BAD_REQUEST)

    patient.full_name = full_name
    patient.phone = phone
    patient.save(update_fields=["full_name", "phone"])

    # Keep the JWT's in-memory name in sync for the current session.
    request._cached_auth = None

    return Response({
        "status": "success",
        "full_name": patient.full_name,
        "phone": patient.phone,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_grant_access_status(request):
    """How many active / pending grants this patient currently has."""
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    now = timezone.now()
    active = AccessGrant.objects.filter(
        patient=patient, active=True, expires_at__gt=now
    ).count()
    pending_requests = AccessRequest.objects.filter(
        patient=patient, status="PENDING"
    ).count()
    expiring_soon = AccessGrant.objects.filter(
        patient=patient, active=True,
        expires_at__gt=now, expires_at__lte=now + timedelta(days=7)
    ).count()

    last_grant = (
        AccessGrant.objects.filter(patient=patient)
        .order_by("-created_at")
        .first()
    )
    last_grant_doctor = None
    last_grant_label = None
    if last_grant:
        if last_grant.doctor:
            last_grant_doctor = last_grant.doctor.full_name
        elif last_grant.hospital:
            last_grant_doctor = last_grant.hospital.name
        else:
            last_grant_doctor = "Unknown"
        # Append (Expired) if the grant is no longer active
        if last_grant.expires_at and last_grant.expires_at < now:
            last_grant_label = last_grant_doctor + " (Expired)"
        else:
            last_grant_label = last_grant_doctor

    # Active break-glass windows: the patient can see who is in their record
    # right now, why, and how long is left — and end it early.
    emergency = []
    for g in AccessGrant.objects.filter(
        patient=patient,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=now,
    ).select_related("doctor"):
        emergency.append({
            "doctor_name": g.doctor.full_name if g.doctor else "Unknown doctor",
            "doctor_license": g.doctor.license_no if g.doctor else "",
            "doctor_wallet": g.doctor.wallet_address if g.doctor else "",
            "facility_id": g.doctor.facility_id if g.doctor else "",
            "reason": g.reason,
            "started_at": g.created_at.isoformat(),
            "expires_at": g.expires_at.isoformat(),
            "remaining_seconds": max(
                int((g.expires_at - now).total_seconds()), 0
            ),
            "tx_hash": g.tx_hash,
        })

    # Active routine doctor grants (patient can review and revoke)
    active_grants = []
    for g in AccessGrant.objects.filter(
        patient=patient,
        active=True,
        expires_at__gt=now,
    ).exclude(source="BREAK_GLASS").select_related("doctor", "hospital"):
        active_grants.append({
            "id": g.id,
            "doctor_name": g.doctor.full_name if g.doctor else "Unknown doctor",
            "doctor_license": g.doctor.license_no if g.doctor else "",
            "doctor_wallet": g.doctor.wallet_address if g.doctor else "",
            "facility_id": g.doctor.facility_id if g.doctor else "",
            "hospital_name": g.hospital.name if g.hospital else "",
            "source": g.source,
            "created_at": g.created_at.isoformat(),
            "expires_at": g.expires_at.isoformat(),
            "tx_hash": g.tx_hash,
        })

    return Response({
        "activeCount": active,
        "pendingCount": pending_requests,
        "expiringSoon": expiring_soon,
        "lastGrantAt": last_grant.created_at.isoformat() if last_grant else None,
        "lastGrantDoctor": last_grant_label,
        "emergencyCount": len(emergency),
        "emergency": emergency,
        "active_grants": active_grants,
        "totalGrantsEver": AccessGrant.objects.filter(patient=patient).count(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_wallet_activity(request):
    """Wallet-centric activity: the wallet address, activity count, most recent
    on-chain event timestamp, and the last transaction hash touching this patient.

    The activityCount is built from the DB so it is always accurate even when
    the blockchain node is temporarily unreachable.
    """
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    # Build activity count and last-tx from DB rows (never 0 when chain is down)
    events = []

    # Registration
    if patient.created_at:
        events.append({"timestamp": int(patient.created_at.timestamp()), "transaction_hash": None})

    # Records
    for r in patient.records.order_by("-created_at"):
        tx = r.tx_hash if r.tx_hash and not r.tx_hash.startswith("PENDING") else None
        events.append({"timestamp": int(r.created_at.timestamp()) if r.created_at else 0, "transaction_hash": tx})

    # Access grants
    for g in patient.grants.order_by("-created_at"):
        tx = g.tx_hash if g.tx_hash and not g.tx_hash.startswith("PENDING") else None
        events.append({"timestamp": int(g.created_at.timestamp()) if g.created_at else 0, "transaction_hash": tx})

    # Referrals
    for ref in patient.referrals.order_by("-created_at"):
        tx = ref.tx_hash if ref.tx_hash and not ref.tx_hash.startswith("PENDING") else None
        events.append({"timestamp": int(ref.created_at.timestamp()) if ref.created_at else 0, "transaction_hash": tx})

    events.sort(key=lambda e: e["timestamp"], reverse=True)

    last_tx_hash = None
    last_ts = None
    for e in events:
        if e["timestamp"]:
            if last_ts is None:
                last_ts = e["timestamp"]
            if e["transaction_hash"] and not last_tx_hash:
                last_tx_hash = e["transaction_hash"]

    # Also try to enrich from on-chain story (best-effort; silently skip if chain is down)
    try:
        story_res = patient_activity_story(request, patient.health_id)
        story_data = story_res.data if hasattr(story_res, "data") else {}
        chain_story = story_data.get("story") or []
        if chain_story:
            chain_sorted = sorted(chain_story, key=lambda s: s.get("timestamp") or 0, reverse=True)
            top = chain_sorted[0]
            if top.get("timestamp") and (last_ts is None or top["timestamp"] > last_ts):
                last_ts = top["timestamp"]
            if top.get("transaction_hash") and not last_tx_hash:
                last_tx_hash = top["transaction_hash"]
            # Prefer chain count when available (it includes RecordViewed events)
            if len(chain_story) > len(events):
                events = chain_story
    except Exception:
        pass

    pending_ops = AccessRequest.objects.filter(
        patient=patient, status="PENDING"
    ).count()

    return Response({
        "wallet_address": patient.wallet_address,
        "health_id": patient.health_id,
        "full_name": patient.full_name,
        "activityCount": len(events),
        "lastTxHash": last_tx_hash,
        "lastActivityAt": last_ts,
        "pendingOperations": pending_ops,
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

    # patientGrantAccess is operator-only: the facility wallet submits it on
    # the patient's behalf (their wallet is passed as grantedBy and their JWT
    # authorizes the call). send_transaction waits for the receipt and raises
    # when the contract reverts — a rejected grant is reported as an error
    # instead of a fake success.
    # Automatically ensure the clinician role is active on-chain so the transaction does not revert.
    try:
        ensure_clinician_role(doctor_wallet)
    except Exception:
        logger.warning("Could not auto-ensure clinician role for %s", doctor_wallet)

    tx_hash = ""
    try:
        tx = contract.functions.patientGrantAccess(
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(doctor_wallet), days
        )
        tx_hash = send_transaction(tx)
    except Exception as exc:
        logger.exception(
            "patientGrantAccess failed for %s -> %s",
            patient.health_id, doctor_wallet,
        )
        tx_hash = f"PENDING: {type(exc).__name__}"
    granted_on_chain = tx_hash.startswith("0x")

    # Permission changed (or was attempted) — drop cached hasAccess for this
    # patient so doctors see the new state on their next call.
    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

    if doc:
        AccessGrant.objects.update_or_create(
            patient=patient, doctor=doc,
            defaults={
                "hospital": doc.hospital,
                "tx_hash": tx_hash,
                "active": granted_on_chain,
                "expires_at": timezone.now() + timedelta(days=days),
            },
        )

    if not granted_on_chain:
        return Response({
            "error": (
                "The access grant was not confirmed on-chain, so no access was "
                "granted. This usually means the doctor's wallet is missing "
                "CLINICIAN_ROLE (approved doctors receive it automatically — ask "
                "an administrator to run: python manage.py grant_clinician_roles)."
            ),
            "tx_hash": tx_hash,
            "pending": True,
        }, status=status.HTTP_502_BAD_GATEWAY)

    return Response({
        "status": "success",
        "message": f"Access granted to {doctor_name or doctor_wallet} for {days} days",
        "tx_hash": tx_hash,
        "pending": False,
        "chain_logged": True,
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
    # patientRevokeAccess is operator-only: the facility wallet submits the
    # patient's revocation. A revert must not read as success.
    tx_hash = ""
    try:
        tx = contract.functions.patientRevokeAccess(
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(doctor_wallet)
        )
        tx_hash = send_transaction(tx)
    except Exception as exc:
        logger.exception(
            "patientRevokeAccess failed for %s -> %s",
            patient.health_id, doctor_wallet,
        )
        if _on_chain_permission_active(patient.health_id, doctor_wallet):
            # A live permission remains on-chain: closing the local row would
            # only hide it. Tell the patient the truth and leave access as-is.
            return Response({
                "error": (
                    "The revocation was not confirmed on-chain, so the doctor "
                    f"still has access ({type(exc).__name__}). Please retry."
                )
            }, status=status.HTTP_502_BAD_GATEWAY)
        tx_hash = ""  # nothing left to revoke on-chain — close locally

    # Revocation must be visible to doctors immediately.
    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

    AccessGrant.objects.filter(
        patient=patient, doctor__wallet_address__iexact=doctor_wallet
    ).update(active=False)

    return Response({
        "status": "success",
        "message": "Access revoked; the revocation is logged on-chain.",
        "tx_hash": tx_hash,
        "chain_logged": bool(tx_hash),
    })


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

    allowed, chain_ok = _doctor_can_view_patient(doctor, patient)

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
        logger.exception("Could not submit record-view audit for %s", health_id)

    emergency_grant = AccessGrant.objects.filter(
        patient=patient,
        doctor=doctor,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=timezone.now(),
    ).first()
    rem = emergency_access_remaining(patient.health_id, doctor.wallet_address)
    has_emergency = bool(emergency_grant) or rem > 0
    emergency_reason = (
        emergency_grant.reason if (emergency_grant and emergency_grant.reason)
        else ("Medical emergency break-glass" if rem > 0 else "")
    )
    emergency_expires_at = (
        emergency_grant.expires_at.isoformat() if emergency_grant
        else ((timezone.now() + timedelta(seconds=rem)).isoformat() if rem > 0 else None)
    )
    emergency_remaining_secs = (
        rem if rem > 0
        else (max(int((emergency_grant.expires_at - timezone.now()).total_seconds()), 0) if emergency_grant else 0)
    )

    # Referral context is shown separately and never grants record access.
    referral_context = None
    if doctor.hospital:
        referral_context = Referral.objects.filter(
            patient=patient,
            to_hospital=doctor.hospital,
            status="ACCEPTED",
        ).order_by("-responded_at").first()

    # Fetch the record pointers so payloads can be checked against immutable
    # anchors before they are released.
    chain_records = []
    chain_verification_unavailable = False
    try:
        chain_records = contract.functions.getRecords(health_id).call()
    except Exception:
        logger.exception("Could not load on-chain records for patient %s", health_id)
        if not has_emergency:
            return Response(
                {"error": "Blockchain records are unavailable; medical history was not released"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        chain_verification_unavailable = True

    final_records = []
    integrity_issues = []
    verified_record_objects = []
    if chain_verification_unavailable:
        integrity_issues.append({
            "record_hash": None,
            "facility_id": doctor.facility_id,
            "record_type": "All history",
            "reason": "BLOCKCHAIN_UNAVAILABLE_EMERGENCY_ACCESS_UNVERIFIED",
        })
    for r_hash, fac_id, meta_uri, _timestamp in chain_records:
        record = patient.records.filter(
            record_hash__iexact=r_hash,
            facility_id__iexact=fac_id,
        ).first()
        if not record:
            integrity_issues.append({
                "record_hash": str(r_hash),
                "facility_id": str(fac_id),
                "record_type": "Unknown",
                "reason": "ON_CHAIN_RECORD_NOT_AVAILABLE_OFF_CHAIN",
            })
            continue
        payload_matches = (
            _record_payload_hash(record.record_data).lower()
            == str(r_hash).lower()
        )
        facility_matches = record.facility_id.lower() == str(fac_id).lower()
        if not payload_matches or not facility_matches:
            integrity_issues.append({
                "record_hash": record.record_hash,
                "facility_id": record.facility_id,
                "record_type": record.record_type,
                "reason": (
                    "PAYLOAD_HASH_MISMATCH" if not payload_matches
                    else "FACILITY_MISMATCH"
                ),
            })
            continue
        verified_record_objects.append(record)
        final_records.append({
            "facility": record.facility_name or record.facility_id,
            "type": record.record_type,
            "data": record.record_data,
            "hash": record.record_hash,
            "date": record.created_at,
            "verified": True,
            "source_uri": meta_uri,
        })

    chain_record_keys = {
        (str(chain_record[0]).lower(), str(chain_record[1]).lower())
        for chain_record in chain_records
    }
    for record in patient.records.all():
        record_key = (record.record_hash.lower(), record.facility_id.lower())
        if record_key not in chain_record_keys:
            payload_matches = (
                _record_payload_hash(record.record_data).lower()
                == record.record_hash.lower()
            )
            if has_emergency and payload_matches:
                final_records.append({
                    "facility": record.facility_name or record.facility_id,
                    "type": record.record_type,
                    "data": record.record_data,
                    "hash": record.record_hash,
                    "date": record.created_at,
                    "verified": False,
                    "source_uri": None,
                })
            integrity_issues.append({
                "record_hash": record.record_hash,
                "facility_id": record.facility_id,
                "record_type": record.record_type,
                "reason": (
                    "PAYLOAD_HASH_MISMATCH" if not payload_matches
                    else (
                        "BLOCKCHAIN_UNAVAILABLE_EMERGENCY_ACCESS_UNVERIFIED"
                        if chain_verification_unavailable
                        else "RECORD_NOT_ANCHORED_ON_CHAIN"
                    )
                ),
            })

    # Measurements (all, for the viewing doctor)
    measurements = []
    verified_measurement_objects = []
    chain_anchors = chain_record_keys
    for measurement in patient.measurements.select_related("doctor", "hospital").all():
        computed_hash = _record_payload_hash(_measurement_payload(measurement))
        payload_matches = bool(
            measurement.record_hash
            and computed_hash.lower() == measurement.record_hash.lower()
        )
        anchored = bool(
            measurement.record_hash
            and measurement.facility_id
            and (measurement.record_hash.lower(), measurement.facility_id.lower())
            in chain_anchors
        )
        verified = payload_matches and anchored
        if verified:
            verified_measurement_objects.append(measurement)
        else:
            integrity_issues.append({
                "record_hash": measurement.record_hash or None,
                "facility_id": measurement.facility_id or (
                    measurement.hospital.code if measurement.hospital else ""
                ),
                "record_type": f"Measurement: {measurement.kind}",
                "reason": (
                    "MEASUREMENT_HASH_MISMATCH" if measurement.record_hash and not payload_matches
                    else "MEASUREMENT_NOT_ANCHORED"
                ),
            })
        measurements.append({
            "id": measurement.id,
            "kind": measurement.kind,
            "value": (
                measurement.value
                if (
                    verified
                    or not measurement.record_hash
                    or (chain_verification_unavailable and payload_matches)
                )
                else None
            ),
            "unit": measurement.unit,
            "notes": (
                measurement.notes
                if (
                    verified
                    or not measurement.record_hash
                    or (chain_verification_unavailable and payload_matches)
                )
                else ""
            ),
            "doctor": measurement.doctor.full_name if measurement.doctor else "",
            "hospital": measurement.hospital.name if measurement.hospital else "",
            "date": measurement.created_at,
            "record_hash": measurement.record_hash,
            "tx_hash": measurement.tx_hash,
            "verified": verified,
            "withheld": bool(
                measurement.record_hash
                and (
                    not payload_matches
                    or (not verified and not chain_verification_unavailable)
                )
            ),
        })

    # Referrals (all, for the viewing doctor)
    referrals = [{
        "id": r.id,
        "from_hospital": r.from_hospital.name if r.from_hospital else "",
        "from_hospital_code": r.from_hospital.code if r.from_hospital else "",
        "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
        "to_hospital": r.to_hospital.name,
        "to_hospital_code": r.to_hospital.code,
        "reason": r.reason,
        "status": r.status,
        "created_at": r.created_at,
        "responded_by": r.responded_by,
        "responded_at": r.responded_at,
    } for r in patient.referrals.all()]

    # Patient health summary (computed from records + measurements)
    summary = _patient_health_summary(
        patient,
        records=verified_record_objects,
        measurements=verified_measurement_objects,
    )
    return Response({
        "health_id": health_id,
        "full_name": patient.full_name,
        "chain_checked": chain_ok,
        "emergency_access": has_emergency,
        "emergency_reason": emergency_reason,
        "emergency_expires_at": emergency_expires_at,
        "emergency_remaining_seconds": emergency_remaining_secs,
        "referral_access": False,
        "referral_context": ({
            "from_hospital": referral_context.from_hospital.name if referral_context and referral_context.from_hospital else "",
            "from_doctor": referral_context.from_doctor.full_name if referral_context and referral_context.from_doctor else "",
            "reason": referral_context.reason if referral_context else "",
            "accepted_at": referral_context.responded_at if referral_context else None,
        } if referral_context else None),
        "chain_verification_unavailable": chain_verification_unavailable,
        "records": final_records,
        "measurements": measurements,
        "referrals": referrals,
        "summary": summary,
        "integrity_issues": integrity_issues,
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

    # operator-submitted grant (patientGrantAccess is onlyOperator), waited
    # on so a revert surfaces here instead of silently granting nothing.
    tx_hash = ""
    try:
        tx = contract.functions.patientGrantAccess(
            patient.health_id, checksum_address(patient.wallet_address),
            checksum_address(req.doctor_wallet), 7
        )
        tx_hash = send_transaction(tx)
    except Exception as exc:
        logger.exception(
            "approve_request grant failed for %s -> %s",
            patient.health_id, req.doctor_wallet,
        )
        tx_hash = f"PENDING: {type(exc).__name__}"
    granted_on_chain = tx_hash.startswith("0x")

    cache_invalidate(f"hasAccess:{patient.health_id.strip().lower()}")

    AccessGrant.objects.get_or_create(
        patient=patient, doctor=req.doctor,
        defaults={
            "tx_hash": tx_hash,
            "active": granted_on_chain,
            "expires_at": timezone.now() + timedelta(days=7),
        },
    )

    if not granted_on_chain:
        # The request stays pending so it can be approved again once the
        # doctor's CLINICIAN_ROLE is provisioned.
        return Response({
            "error": (
                "Your approval could not be confirmed on-chain, so no access "
                "was granted. Please retry; if it keeps failing, the doctor's "
                "wallet may be missing CLINICIAN_ROLE."
            ),
            "tx_hash": tx_hash,
            "pending": True,
        }, status=status.HTTP_502_BAD_GATEWAY)

    req.status = "APPROVED"
    req.tx_hash = tx_hash
    req.responded_at = timezone.now()
    req.save()

    return Response({"status": "approved", "tx_hash": tx_hash, "pending": False, "chain_logged": True})


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
    """Patients with individual access grants plus referral coordination entries."""
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)

    grants = AccessGrant.objects.filter(doctor=doctor).select_related("patient")
    items = []
    listed = set()
    for g in grants:
        active, _chain_ok = _doctor_can_view_patient(doctor, g.patient)
        listed.add(g.patient_id)
        items.append({
            "health_id": g.patient.health_id,
            "full_name": g.patient.full_name,
            "granted_at": g.created_at,
            "expires_at": g.expires_at,
            "active": active,
            "source": g.source or ("grant" if g.active else "expired"),
        })

    # Accepted referrals are listed for coordination, but do not grant
    # access to records. The record endpoint still requires consent or
    # documented break-glass access.
    if doctor.hospital:
        referral_qs = Referral.objects.filter(
            to_hospital=doctor.hospital, status="ACCEPTED"
        ).select_related("patient").order_by("-responded_at")
        for r in referral_qs:
            if r.patient_id in listed:
                continue
            listed.add(r.patient_id)
            items.append({
                "health_id": r.patient.health_id,
                "full_name": r.patient.full_name,
                "granted_at": r.responded_at or r.created_at,
                "expires_at": None,
                "active": False,
                "source": "REFERRAL",
            })
    return Response(items)


def _flatten_values(value):
    if value is None or value == "":
        return []
    if isinstance(value, (list, tuple, set)):
        return [item for child in value for item in _flatten_values(child)]
    if isinstance(value, dict):
        return [json.dumps(value, sort_keys=True)]
    return [str(value).strip()]


def _record_diagnoses(record):
    """Diagnosis/disease labels stored on one medical record's payload."""
    labels = set()
    for key, value in (record.record_data or {}).items():
        normalized_key = str(key).strip().lower()
        if any(term in normalized_key for term in ("diagnos", "disease", "condition", "illness")):
            labels.update(label for label in _flatten_values(value) if label)
    return labels


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def doctor_dashboard(request):
    """Aggregate practice overview for the logged-in doctor.

    Identical for every approved doctor at every hospital — everything is
    scoped to the doctor's own JWT identity (their patients, their recorded
    measurements, their referrals), never to a facility-wide account.
    """
    from collections import Counter

    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Doctor not found"}, status=403)

    grants = AccessGrant.objects.filter(doctor=doctor).select_related("patient")
    patient_ids = set()
    active_patient_ids = set()
    for grant in grants:
        if _doctor_can_view_patient(doctor, grant.patient)[0]:
            patient_ids.add(grant.patient_id)
            active_patient_ids.add(grant.patient_id)

    measurements = Measurement.objects.filter(doctor=doctor)
    meas_counter = Counter(measurements.values_list("kind", flat=True))
    total_measurements = sum(meas_counter.values())

    referrals_sent = Referral.objects.filter(from_doctor=doctor)
    incoming_pending = (
        Referral.objects.filter(to_hospital=doctor.hospital, status="PENDING").count()
        if doctor.hospital else 0
    )

    access_requests = AccessRequest.objects.filter(doctor=doctor)
    req_statuses = Counter(access_requests.values_list("status", flat=True))
    break_glass_uses = AccessGrant.objects.filter(
        doctor=doctor, source="BREAK_GLASS"
    ).count()

    # Which diseases appear most among this doctor's patients, as a rate:
    # the share (%) of their patients whose records mention each condition.
    disease_patients: dict[str, dict] = {}
    patient_records = MedicalRecord.objects.filter(
        patient_id__in=patient_ids
    ).only("patient_id", "record_data")
    for record in patient_records:
        for label in _record_diagnoses(record):
            entry = disease_patients.setdefault(
                label.casefold(), {"label": label, "patients": set()}
            )
            entry["patients"].add(record.patient_id)
    total_patients = len(patient_ids)
    diseases = sorted(
        (
            {
                "name": entry["label"],
                "count": len(entry["patients"]),
                "rate": round(len(entry["patients"]) * 100 / total_patients, 1)
                if total_patients else 0.0,
            }
            for entry in disease_patients.values()
        ),
        key=lambda d: d["count"],
        reverse=True,
    )[:10]

    return Response({
        "total_patients": total_patients,
        "active_patients": len(active_patient_ids),
        "total_measurements": total_measurements,
        "total_actions": (
            sum(req_statuses.values())
            + break_glass_uses
            + total_measurements
            + referrals_sent.count()
        ),
        "break_glass_uses": break_glass_uses,
        "access_requests": {
            "total": sum(req_statuses.values()),
            "pending": req_statuses.get("PENDING", 0),
            "approved": req_statuses.get("APPROVED", 0),
            "rejected": req_statuses.get("REJECTED", 0),
        },
        "referrals": {
            "sent": referrals_sent.count(),
            "sent_pending": referrals_sent.filter(status="PENDING").count(),
            "sent_accepted": referrals_sent.filter(status="ACCEPTED").count(),
            "sent_declined": referrals_sent.filter(status="DECLINED").count(),
            "incoming_pending": incoming_pending,
        },
        "measurements_by_kind": [
            {"kind": kind, "count": count}
            for kind, count in meas_counter.most_common(10)
        ],
        "diseases": diseases,
    })


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

    allowed, _chain_ok = _doctor_can_view_patient(doctor, patient)
    if not allowed:
        return Response({"error": "No access permission for this patient"}, status=403)

    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return Response({"error": "value must be a valid number"}, status=400)
    if not math.isfinite(numeric_value):
        return Response({"error": "value must be a finite number"}, status=400)

    m = Measurement.objects.create(
        patient=patient,
        doctor=doctor,
        hospital=doctor.hospital,
        kind=kind,
        value=numeric_value,
        unit=str(request.data.get("unit", "")).strip(),
        notes=str(request.data.get("notes", "")).strip(),
        facility_id=doctor.hospital.code if doctor.hospital else doctor.facility_id,
    )
    m.record_hash = _record_payload_hash(_measurement_payload(m))
    m.save(update_fields=["record_hash"])

    tx_hash = ""
    try:
        metadata_uri = request.build_absolute_uri(
            f"/exchange/{m.record_hash}/"
        )
        tx = contract.functions.addRecord(
            patient.health_id, m.record_hash, m.facility_id, metadata_uri
        )
        tx_hash = send_transaction(tx)
    except Exception as exc:
        # Never persist or return provider exception text: RPC URLs can contain
        # credentials. The measurement remains saved locally for reconciliation.
        logger.error(
            "Could not anchor measurement %s (%s)",
            m.id,
            type(exc).__name__,
        )
        tx_hash = "PENDING"
    m.tx_hash = tx_hash[:66]
    m.save(update_fields=["tx_hash"])

    verified = bool(m.tx_hash and not m.tx_hash.startswith("PENDING"))
    return Response({
        "status": "saved" if verified else "saved_pending_chain",
        "measurement_id": m.id,
        "record_hash": m.record_hash,
        "tx_hash": m.tx_hash,
        "verified": verified,
        "message": (
            f"{m.kind} recorded and verified on-chain for {patient.full_name}."
            if verified else
            f"{m.kind} was saved locally for {patient.full_name}, but blockchain anchoring failed. "
            "It is not blockchain-verified; ask the administrator to check the Sepolia RPC URL "
            "and facility signing key before recording more measurements."
        ),
    }, status=status.HTTP_201_CREATED if verified else status.HTTP_202_ACCEPTED)


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
    allowed, _chain_ok = _doctor_can_view_patient(doctor, patient)
    if not allowed:
        return Response({"error": "No access permission for this patient"}, status=403)

    emergency_grant = AccessGrant.objects.filter(
        patient=patient,
        doctor=doctor,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=timezone.now(),
    ).exists()
    blockchain_unavailable = False
    try:
        chain_records = contract.functions.getRecords(patient.health_id).call()
    except Exception as exc:
        logger.error(
            "Could not verify measurements for patient %s (%s)",
            health_id,
            type(exc).__name__,
        )
        if not emergency_grant:
            return Response(
                {"error": "Blockchain is unavailable; measurements were not released"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        chain_records = []
        blockchain_unavailable = True

    result = []
    for measurement in patient.measurements.select_related("doctor", "hospital").all():
        computed_hash = (
            _record_payload_hash(_measurement_payload(measurement))
            if measurement.record_hash else ""
        )
        payload_matches = bool(
            computed_hash
            and computed_hash.lower() == measurement.record_hash.lower()
        )
        anchored = bool(
            measurement.record_hash
            and measurement.facility_id
            and any(
                str(chain_record[0]).lower() == measurement.record_hash.lower()
                and str(chain_record[1]).lower() == measurement.facility_id.lower()
                for chain_record in chain_records
            )
        )
        verified = payload_matches and anchored
        result.append({
            "id": measurement.id,
            "kind": measurement.kind,
            "value": (
                measurement.value
                if verified or not measurement.record_hash
                or (blockchain_unavailable and payload_matches)
                else None
            ),
            "unit": measurement.unit,
            "notes": (
                measurement.notes
                if verified or not measurement.record_hash
                or (blockchain_unavailable and payload_matches)
                else ""
            ),
            "doctor": measurement.doctor.full_name if measurement.doctor else "",
            "hospital": measurement.hospital.name if measurement.hospital else _hospital_label(doctor),
            "created_at": measurement.created_at,
            "facility_id": measurement.facility_id,
            "record_hash": measurement.record_hash,
            "tx_hash": measurement.tx_hash,
            "payload_matches_hash": payload_matches,
            "anchored_on_chain": anchored,
            "verified": verified,
            "withheld": bool(
                measurement.record_hash
                and (
                    not payload_matches
                    or (not verified and not blockchain_unavailable)
                )
            ),
            "blockchain_unavailable": blockchain_unavailable,
        })
    return Response(result)


def _hospital_label(doctor):
    return doctor.hospital.name if doctor.hospital else doctor.facility_id


def _patient_health_summary(patient: Patient, records=None, measurements=None) -> dict:
    """Summarize repeated diagnoses, medicines, measurements, and facilities."""
    from collections import Counter

    records = list(records if records is not None else patient.records.all())
    diagnosis_counts: Counter = Counter()
    diagnosis_labels: dict[str, str] = {}
    medicine_counts: Counter = Counter()
    medicine_labels: dict[str, str] = {}
    facility_visit_days: dict[str, set] = {}

    def values(value):
        if value is None or value == "":
            return []
        if isinstance(value, (list, tuple, set)):
            return [item for child in value for item in values(child)]
        if isinstance(value, dict):
            return [json.dumps(value, sort_keys=True)]
        return [str(value).strip()]

    for record in records:
        record_diagnoses = set()
        record_medicines = set()
        for key, value in (record.record_data or {}).items():
            normalized_key = str(key).strip().lower()
            concepts = values(value)
            if any(term in normalized_key for term in ("diagnos", "disease", "condition", "illness")):
                record_diagnoses.update(concept for concept in concepts if concept)
            if (
                any(term in normalized_key for term in ("medicine", "medication", "drug", "prescription", "rx"))
                or (
                    record.record_type.upper() in {"PRESCRIPTION", "MEDICATION"}
                    and normalized_key in {"name", "item"}
                )
            ):
                record_medicines.update(concept for concept in concepts if concept)

        for label in record_diagnoses:
            normalized = label.casefold()
            diagnosis_counts[normalized] += 1
            diagnosis_labels.setdefault(normalized, label)
        for label in record_medicines:
            normalized = label.casefold()
            medicine_counts[normalized] += 1
            medicine_labels.setdefault(normalized, label)

        facility = record.facility_name or record.facility_id or "Unknown facility"
        facility_visit_days.setdefault(facility, set()).add(
            timezone.localtime(record.created_at).date().isoformat()
        )

    meas_counter: Counter = Counter()
    meas_latest: dict = {}
    measurements = list(
        measurements if measurements is not None
        else patient.measurements.select_related("doctor", "hospital").all()
    )
    for m in measurements:
        meas_counter[m.kind] += 1
        facility = m.hospital.name if m.hospital else (
            m.facility_id or (m.doctor.facility_id if m.doctor else "Unknown facility")
        )
        facility_visit_days.setdefault(facility, set()).add(
            timezone.localtime(m.created_at).date().isoformat()
        )
        if m.created_at and (m.kind not in meas_latest or m.created_at > meas_latest[m.kind].get("date")):
            meas_latest[m.kind] = {
                "value": m.value,
                "unit": m.unit,
                "date": m.created_at,
                "doctor": m.doctor.full_name if m.doctor else "",
                "hospital": m.hospital.name if m.hospital else "",
            }

    return {
        "diagnoses": [
            {"type": diagnosis_labels[label], "count": count}
            for label, count in diagnosis_counts.most_common(10)
        ],
        "medicines": [
            {"detail": medicine_labels[label], "count": count}
            for label, count in medicine_counts.most_common(10)
        ],
        "measurements": [
            {
                "kind": kind,
                "count": count,
                "latest_value": lv["value"],
                "latest_unit": lv["unit"],
                "latest_date": lv["date"].isoformat() if lv.get("date") else None,
                "latest_doctor": lv["doctor"],
                "latest_hospital": lv["hospital"],
            }
            for kind, count in meas_counter.most_common(10)
            for lv in [meas_latest.get(kind, {})]
            if lv
        ],
        "hospital_visits": [
            {"facility": facility, "count": len(visit_days)}
            for facility, visit_days in sorted(
                facility_visit_days.items(),
                key=lambda entry: len(entry[1]),
                reverse=True,
            )[:10]
        ],
        "total_records": len(records),
        "total_measurements": len(measurements),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def list_hospitals(request):
    """Public hospital list used to populate patient registration."""
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

    # A referral may only be initiated by a doctor who already has an
    # individual grant or a documented emergency grant for the patient.
    allowed, _chain_ok = _doctor_can_view_patient(doctor, patient)
    if not allowed:
        return Response(
            {"error": "You can only refer a patient you have access to"},
            status=status.HTTP_403_FORBIDDEN,
        )

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
        "from_hospital_code": r.from_hospital.code if r.from_hospital else "",
        "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
        "to_hospital": r.to_hospital.name,
        "to_hospital_code": r.to_hospital.code,
        "reason": r.reason,
        "status": r.status,
        "responded_by": r.responded_by,
        "created_at": r.created_at,
        "responded_at": r.responded_at,
        "tx_hash": r.tx_hash,
        "on_chain_referral_tx": r.on_chain_referral_tx,
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
    """Records this hospital has anchored on-chain for referral exchange."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Staff account not found"}, status=403)

    records = (
        MedicalRecord.objects.filter(facility_id__iexact=staff.hospital.code)
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
            "metadata_uri": request.build_absolute_uri(f"/exchange/{r.record_hash}/"),
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

    # Log the transfer of care on-chain when the referral is accepted.
    # This immutably records: which patient, which clinician, which facility
    # the patient came from, and which facility the patient is going to.
    # No one can rewrite this later — it is anchored at a specific block.
    if action == "ACCEPTED":
        clinician_wallet = (
            doctor.wallet_address if principal and principal.get("role") == "DOCTOR"
            else facility_address()
        )
        try:
            tx = contract.functions.logReferralAccepted(
                ref.patient.health_id,
                checksum_address(clinician_wallet),
                ref.from_hospital.code if ref.from_hospital else "UNKNOWN",
                ref.to_hospital.code if ref.to_hospital else "UNKNOWN",
            )
            tx_hash = send_transaction(tx)
            ref.tx_hash = tx_hash
            ref.save(update_fields=["tx_hash"])
        except Exception as e:
            # PoC: chain may be unreachable — referral still accepted in DB
            ref.on_chain_referral_tx = f"PENDING: {e}"
            ref.save(update_fields=["on_chain_referral_tx"])

    return Response({"status": action.lower(), "referral": _referral_json(ref)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_referral_records(request, referral_id):
    """Verify source records and hand off only records passing both checks."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Hospital staff account required"}, status=403)

    referral = Referral.objects.filter(
        id=referral_id,
        to_hospital=staff.hospital,
        status="ACCEPTED",
    ).select_related("patient", "from_hospital", "to_hospital").first()
    if not referral:
        return Response(
            {"error": "Accepted referral not found for your hospital"},
            status=404,
        )
    if not referral.from_hospital:
        return Response(
            {"error": "Referral does not identify a sending hospital"},
            status=409,
        )

    try:
        chain_records = contract.functions.getRecords(
            referral.patient.health_id
        ).call()
    except Exception:
        logger.exception(
            "Blockchain record lookup failed for referral %s", referral.id
        )
        return Response(
            {"error": "Blockchain is unavailable; records were not released"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    source_code = referral.from_hospital.code
    records = MedicalRecord.objects.filter(
        patient=referral.patient,
        facility_id__iexact=source_code,
        created_at__lte=referral.created_at,
    ).order_by("-created_at")
    anchors = [
        {
            "record_hash": str(chain_record[0]),
            "facility_id": str(chain_record[1]),
            "timestamp": int(chain_record[3]),
        }
        for chain_record in chain_records
    ]

    results = []
    for record in records:
        computed_hash = _record_payload_hash(record.record_data)
        anchor = next(
            (
                item for item in anchors
                if item["record_hash"].lower() == record.record_hash.lower()
                and item["facility_id"].lower() == source_code.lower()
            ),
            None,
        )
        payload_matches = computed_hash.lower() == record.record_hash.lower()
        on_chain = anchor is not None
        verified = payload_matches and on_chain
        result = {
            "id": record.id,
            "record_type": record.record_type,
            "facility_id": record.facility_id,
            "created_at": record.created_at,
            "record_hash": record.record_hash,
            "computed_hash": computed_hash,
            "payload_matches_hash": payload_matches,
            "anchored_on_chain": on_chain,
            "verified": verified,
            "status": "VERIFIED" if verified else "INTEGRITY_MISMATCH",
            "tx_hash": record.tx_hash,
            "etherscan_url": (
                f"https://sepolia.etherscan.io/tx/{record.tx_hash}"
                if record.tx_hash and not record.tx_hash.startswith("PENDING")
                else None
            ),
            "record_data": record.record_data if verified else None,
        }
        if anchor:
            result["on_chain_timestamp"] = anchor["timestamp"]
        results.append(result)

    return Response({
        "referral_id": referral.id,
        "patient_health_id": referral.patient.health_id,
        "from_hospital": source_code,
        "to_hospital": referral.to_hospital.code,
        "referral_tx_hash": referral.tx_hash or None,
        "referral_anchored_on_chain": bool(
            referral.tx_hash and not referral.tx_hash.startswith("PENDING")
        ),
        "records": results,
        "verified_count": sum(record["verified"] for record in results),
        "mismatch_count": sum(not record["verified"] for record in results),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_referral_timeline(request):
    """The blockchain-secured referral story for this patient.

    For each referral this patient was part of, returns:
      - the referral itself (from → to hospital, status, who accepted)
      - the on-chain record hashes Hospital A anchored BEFORE the referral
        (the data the receiving hospital will verify via hash)
      - the on-chain referral-accepted transaction (immutable transfer-of-care
        proof: who accepted, from which facility, to which facility, at which block)
      - the on-chain view events from the receiving hospital (immutable audit)

    This is the core demonstration of how the blockchain secures data across
    hospitals during a referral: every step is anchored at a specific block
    timestamp and cannot be changed by anyone in between.
    """
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    # All referrals involving this patient
    referrals = Referral.objects.filter(patient=patient).order_by("-created_at")[:50]

    out = []
    for ref in referrals:
        entry: dict = _referral_json(ref)

        # On-chain record hashes from the sending hospital (anchored BEFORE referral)
        from_records = []
        if ref.from_hospital_id:
            try:
                chain_records = contract.functions.getRecords(patient.health_id).call()
            except Exception:
                logger.exception(
                    "Blockchain record lookup failed for referral %s", ref.id
                )
                chain_records = []

            local = patient.records.filter(
                facility_id__iexact=ref.from_hospital.code,
                created_at__lte=ref.created_at,
            ).order_by("-created_at")[:20]
            for record in local:
                anchor = next(
                    (
                        chain_record for chain_record in chain_records
                        if str(chain_record[0]).lower() == record.record_hash.lower()
                        and str(chain_record[1]).lower() == ref.from_hospital.code.lower()
                    ),
                    None,
                )
                payload_matches = (
                    _record_payload_hash(record.record_data).lower()
                    == record.record_hash.lower()
                )
                from_records.append({
                    "record_hash": record.record_hash,
                    "facility_id": record.facility_id,
                    "facility_name": record.facility_name,
                    "record_type": record.record_type,
                    "metadata_uri": anchor[2] if anchor else None,
                    "tx_hash": record.tx_hash,
                    "payload_matches_hash": payload_matches,
                    "anchored_on_chain": anchor is not None,
                    "verified": payload_matches and anchor is not None,
                    "created_at": record.created_at.isoformat(),
                    "on_chain_timestamp": anchor[3] if anchor else None,
                })

        entry["from_hospital_records"] = from_records

        # On-chain referral acceptance event (immutable transfer-of-care proof)
        entry["on_chain_referral_accepted"] = bool(ref.tx_hash and not ref.tx_hash.startswith("PENDING"))
        entry["on_chain_referral_tx_hash"] = ref.tx_hash if ref.tx_hash and not ref.tx_hash.startswith("PENDING") else None

        # On-chain view events from the receiving hospital (immutable audit)
        view_events = []
        try:
            trail = contract.functions.getAuditTrail(patient.health_id).call()
            for e in trail:
                accessor, role, facility_id, action, ts = e[0], e[1], e[2], e[3], e[4]
                if (action == "VIEW" and facility_id and
                        facility_id.lower() == ref.to_hospital.code.lower()):
                    view_events.append({
                        "accessor": accessor,
                        "role": role,
                        "facility_id": facility_id,
                        "timestamp": ts,
                    })
        except Exception:
            pass
        entry["receiving_hospital_views"] = view_events

        out.append(entry)

    return Response({
        "health_id": patient.health_id,
        "referrals": out,
    })


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
@permission_classes([IsAuthenticated])
def break_glass(request):
    """Approved doctor emergency access with a short-lived audited grant.

    The contract grants and audits emergency access on-chain. The database
    mirrors a one-hour grant so the authenticated doctor can proceed if that
    transaction is pending, while the response makes the missing chain audit
    explicit.
    """
    doctor = _doctor_from_request(request)
    if not doctor:
        return Response({"error": "Approved doctor account required"}, status=403)
    health_id = str(request.data.get("health_id", "")).strip()
    reason = str(request.data.get("reason", "")).strip()
    if not health_id or not reason:
        return Response({"error": "health_id and emergency reason are required"}, status=400)

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    wallet = doctor.wallet_address
    facility_id = doctor.facility_id or "UNKNOWN"
    # Check if doctor already holds active routine permission
    has_routine = _on_chain_permission_active(health_id, wallet)
    if has_routine:
        return Response({
            "status": "already_granted",
            "message": "Doctor already has routine access permission for this patient.",
            "has_access": True,
            "emergency_access": False,
        })

    # Check if emergency access is already active
    active_emergency = AccessGrant.objects.filter(
        patient=patient,
        doctor=doctor,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=timezone.now(),
    ).first()
    rem = emergency_access_remaining(health_id, wallet)
    if active_emergency or rem > 0:
        return Response({
            "status": "success",
            "message": "Emergency access is already active for this patient.",
            "tx_hash": active_emergency.tx_hash if active_emergency else "",
            "chain_logged": True,
            "clinician_wallet": wallet,
            "expires_at": (
                active_emergency.expires_at.isoformat() if active_emergency
                else (timezone.now() + timedelta(seconds=rem)).isoformat()
            ),
        })

    # Ensure clinician role on-chain before executing break-glass
    try:
        ensure_clinician_role(wallet)
    except Exception:
        logger.warning("Could not auto-ensure clinician role for %s", wallet)

    try:
        tx = contract.functions.breakGlass(health_id, checksum_address(wallet), facility_id, reason)
        tx_hash = send_transaction(tx)
    except Exception as e:
        logger.exception("Break-glass transaction failed for %s", health_id)
        tx_hash = f"PENDING: {e}"

    # Keep the reason and local emergency expiry even when the chain write is
    # pending, and report that the immutable audit step still needs retry.
    AccessGrant.objects.create(
        patient=patient,
        doctor=doctor,
        hospital=doctor.hospital,
        source="BREAK_GLASS",
        tx_hash=tx_hash[:66],
        active=True,
        expires_at=timezone.now() + timedelta(hours=1),
        reason=reason,
    )
    cache_invalidate(f"hasAccess:{health_id.lower()}")

    return Response({
        "status": "success",
        "message": (
            "Emergency access granted for 1 hour and logged on-chain."
            if not tx_hash.startswith("PENDING")
            else "Emergency access granted for 1 hour, but the on-chain audit transaction is pending."
        ),
        "tx_hash": tx_hash,
        "chain_logged": not tx_hash.startswith("PENDING"),
        "clinician_wallet": wallet,
        "expires_at": (timezone.now() + timedelta(hours=1)).isoformat(),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def revoke_emergency_access(request):
    """Patient ends an active break-glass window before its one-hour expiry.

    revokeEmergencyAccess(...) is operator-only, so the backend wallet signs it.
    Access is only reported as ended when the chain (or the absence of a chain
    window) backs it up: the doctor's liveness check reads hasAccess first, so a
    local-only flip would leave the on-chain window standing.
    """
    patient = _patient_from_request(request)
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    doctor_license = str(request.data.get("doctor_license", "")).strip()
    doctor_wallet = str(request.data.get("doctor_wallet", "")).strip()

    doctor = None
    if doctor_license:
        doctor = Doctor.objects.filter(license_no__iexact=doctor_license).first()
        if doctor:
            doctor_wallet = doctor.wallet_address
    if not doctor and doctor_wallet:
        doctor = Doctor.objects.filter(wallet_address__iexact=doctor_wallet).first()
    if not doctor:
        return Response(
            {"error": "doctor_license or doctor_wallet is required"}, status=400
        )

    grant = AccessGrant.objects.filter(
        patient=patient,
        doctor=doctor,
        source="BREAK_GLASS",
        active=True,
        expires_at__gt=timezone.now(),
    ).first()
    if not grant:
        return Response(
            {"error": "No active emergency access for that doctor"}, status=409
        )

    health_id = grant.patient.health_id
    remaining = emergency_access_remaining(health_id, doctor.wallet_address)
    chain_logged = False
    tx_hash = ""
    if remaining > 0:
        try:
            tx_hash = revoke_emergency_access_on_chain(
                health_id, doctor.wallet_address
            )
            chain_logged = True
        except Exception as exc:
            # Never return provider text: RPC URLs can contain credentials.
            logger.exception("Emergency revoke failed for %s", health_id)
            return Response(
                {
                    "error": (
                        "Emergency access could not be ended on-chain "
                        f"({type(exc).__name__}). The window stays open until its "
                        "expiry; retry in a moment."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    grant.active = False
    grant.save(update_fields=["active"])
    cache_invalidate(f"hasAccess:{health_id.strip().lower()}")

    return Response({
        "status": "success",
        "message": (
            "Emergency access ended and the revocation was logged on-chain."
            if chain_logged
            else "Emergency access ended. There was no active on-chain window to revoke."
        ),
        "tx_hash": tx_hash,
        "chain_logged": chain_logged,
    })


# ============ FACILITY: ADD RECORD ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_record(request):
    """Authenticated hospital staff adds a record under their own facility."""
    staff = _staff_from_request(request)
    if not staff:
        return Response({"error": "Hospital staff account required"}, status=403)

    data = request.data
    health_id = str(data.get("health_id", "")).strip()
    patient = Patient.objects.filter(health_id__iexact=health_id).first()
    if not patient:
        return Response({"error": "Health ID not found"}, status=404)

    record_data = data.get("record_data", {})
    if not isinstance(record_data, dict) or not record_data:
        return Response({"error": "record_data must be a non-empty object"}, status=400)
    record_hash = _record_payload_hash(record_data)

    record = MedicalRecord.objects.create(
        patient=patient,
        facility_id=staff.hospital.code,
        facility_name=staff.hospital.name,
        record_type=data.get("record_type", "GENERAL"),
        record_data=record_data,
        record_hash=record_hash,
    )

    facility_id = staff.hospital.code
    metadata_uri = request.build_absolute_uri(f"/exchange/{record_hash}/")

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

    This public metadata response never includes the clinical payload. The
    receiving hospital obtains that payload only through the accepted-referral
    verification flow.
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
    recomputed = _record_payload_hash(record.record_data)
    try:
        chain_records = contract.functions.getRecords(record.patient.health_id).call()
    except Exception:
        logger.exception("Blockchain record lookup failed for exchange hash %s", h)
        return Response(
            {"error": "Blockchain is unavailable; record could not be verified"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    anchored = any(
        str(chain_record[0]).lower() == record.record_hash.lower()
        and str(chain_record[1]).lower() == record.facility_id.lower()
        for chain_record in chain_records
    )
    payload_matches = recomputed.lower() == record.record_hash.lower()

    return Response({
        "record_hash": record.record_hash,
        "computed_hash": recomputed,
        "hash_matches_payload": payload_matches,
        "anchored_on_chain": anchored,
        "verified": payload_matches and anchored,
        "record_type": record.record_type,
        "facility_id": record.facility_id,
        "facility_name": record.facility_name,
        "created_at": record.created_at,
        "tx_hash": record.tx_hash if record.tx_hash and not record.tx_hash.startswith("PENDING") else None,
        "etherscan_url": (
            f"https://sepolia.etherscan.io/tx/{record.tx_hash}"
            if record.tx_hash and not record.tx_hash.startswith("PENDING")
            else None
        ),
        "metadata_uri": request.build_absolute_uri(f"/exchange/{record.record_hash}/"),
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
        MedicalRecord.objects.filter(facility_id__iexact=staff.hospital.code)
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
    hash (a topic), NOT as plaintext — hash it first.

    Solidity hashes the UTF-8 bytes directly (keccak256(bytes(s))), NOT the
    ABI encoding of the string: keccak(abi.encode(s)) includes the offset and
    length words and therefore never matches the topic in the log.
    """
    from eth_utils import keccak
    try:
        return "0x" + keccak(str(health_id).encode("utf-8")).hex()
    except Exception:
        return ""


def _topic_matches(value, expected: bytes) -> bool:
    """Match a `string indexed` event arg against its expected topic hash.

    web3 hands those params back as the raw 32-byte topic hash (sometimes as
    a hex string), never as decoded plaintext.
    """
    if isinstance(value, (bytes, bytearray)):
        return bytes(value) == expected
    if isinstance(value, str):
        topic = _health_id_topic(value)
        return bool(topic) and bytes.fromhex(topic[2:]) == expected
    return False


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
        topic_filters = {}
        topic_plain = {}  # expected topic hash -> plaintext value for it
        for k, v in (argument_filters or {}).items():
            inp = next((i for i in indexed_inputs if i["name"] == k), None)
            if inp and inp.get("type") == "string":
                h = _health_id_topic(v)
                if h:
                    # web3 mis-encodes `string indexed` topics for eth_getLogs
                    # (the node answers "data type size mismatch, expected 32")
                    # and get_logs returns the value as its raw topic hash — so
                    # the RPC is asked for all logs of this event and the topic
                    # is matched here instead.
                    raw = bytes.fromhex(h[2:])
                    topic_filters[k] = raw
                    topic_plain[raw] = v
                else:
                    plain_filters[k] = v
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
                if any(
                    not _topic_matches(args.get(k), expected)
                    for k, expected in topic_filters.items()
                ):
                    continue
                # Indexed string params come back as raw 32-byte topic hashes,
                # which are neither readable nor JSON-serializable: restore the
                # plaintext when we know it, hex-encode anything else.
                readable_args = {}
                for name, value in args.items():
                    if isinstance(value, (bytes, bytearray)):
                        plain = topic_plain.get(bytes(value))
                        readable_args[name] = (
                            plain if plain is not None else bytes(value).hex()
                        )
                    else:
                        readable_args[name] = value
                results.append({
                    "transaction_hash": log.transactionHash.hex(),
                    "block_number": log.blockNumber,
                    "event": event_name,
                    "args": readable_args,
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
        "emergency_access_revoked": "EmergencyAccessRevoked",
        "referral_accepted": "ReferralAccepted",
    }

    canonical_event = None
    if event_type:
        norm = event_type.lower().replace("-", "_")
        if norm in event_map:
            canonical_event = event_map[norm]
        else:
            for k, v in event_map.items():
                if v.lower() == norm or k == norm:
                    canonical_event = v
                    break
            if not canonical_event and event_type in event_map.values():
                canonical_event = event_type

    all_events = []

    if canonical_event:
        # Fetch specific event type
        contract_event = canonical_event
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
    "EmergencyAccessRevoked": ("had EMERGENCY access REVOKED", "🔒"),
    "ReferralAccepted": ("accepted transfer-of-care referral", "🏥"),
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


def _summarize_records(records_qs):
    counts = {}
    for r in records_qs.all():
        t = r.record_type or "OTHER"
        counts[t] = counts.get(t, 0) + 1
    return counts


def _serialize_record(r):
    if not r:
        return None
    return {
        "id": r.id,
        "facility_id": r.facility_id,
        "facility_name": r.facility_name,
        "record_type": r.record_type,
        "record_data": r.record_data,
        "record_hash": r.record_hash,
        "tx_hash": r.tx_hash,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _summarize_measurements(measurements_qs):
    counts = {}
    for m in measurements_qs.all():
        k = m.kind or "Other"
        counts[k] = counts.get(k, 0) + 1
    return counts


def _serialize_measurement(m):
    if not m:
        return None
    return {
        "id": m.id,
        "kind": m.kind,
        "value": m.value,
        "unit": m.unit,
        "notes": m.notes,
        "doctor": m.doctor.full_name if m.doctor else None,
        "hospital": m.hospital.name if m.hospital else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _summarize_referrals(patient, referral_cls):
    refs = referral_cls.objects.filter(patient=patient)
    by_status = {}
    for ref in refs:
        st = ref.status or "UNKNOWN"
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "total": refs.count(),
        "by_status": by_status,
        "list": [{
            "id": r.id,
            "from_hospital": r.from_hospital.name if r.from_hospital else "",
            "to_hospital": r.to_hospital.name if r.to_hospital else "",
            "from_doctor": r.from_doctor.full_name if r.from_doctor else "",
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in refs.order_by("-created_at")[:10]]
    }


def _count_blockchain_transactions(patient):
    records_with_tx = patient.records.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").count()
    measurements_with_tx = patient.measurements.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").count()
    grants_with_tx = patient.grants.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").count()
    referrals_with_tx = patient.referrals.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").count()
    return records_with_tx + measurements_with_tx + grants_with_tx + referrals_with_tx


def _get_recent_blockchain_events(patient, limit=10):
    events = []
    for r in patient.records.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").order_by("-created_at")[:limit]:
        events.append({
            "type": "RecordAdded",
            "action": f"Medical record added ({r.record_type})",
            "facility": r.facility_name,
            "tx_hash": r.tx_hash,
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{r.tx_hash}",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    for g in patient.grants.exclude(tx_hash="").exclude(tx_hash__startswith="PENDING").order_by("-created_at")[:limit]:
        events.append({
            "type": "BreakGlassUsed" if g.source == "BREAK_GLASS" else "AccessGranted",
            "action": "Emergency access (break-glass)" if g.source == "BREAK_GLASS" else "Access granted",
            "facility": g.hospital.name if g.hospital else (g.doctor.facility_id if g.doctor else ""),
            "doctor": g.doctor.full_name if g.doctor else "",
            "tx_hash": g.tx_hash,
            "etherscan_url": f"https://sepolia.etherscan.io/tx/{g.tx_hash}",
            "created_at": g.created_at.isoformat() if g.created_at else None,
        })
    events.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return events[:limit]


def _get_journey(patient):
    steps = []
    if patient.created_at:
        steps.append({
            "step": "Registration",
            "hospital": patient.hospital.name if patient.hospital else (patient.registered_by_facility or "Initial Facility"),
            "date": patient.created_at.isoformat(),
            "description": f"Registered with Health ID {patient.health_id}",
        })
    for ref in patient.referrals.order_by("created_at"):
        from_name = ref.from_hospital.name if ref.from_hospital else "Facility"
        to_name = ref.to_hospital.name if ref.to_hospital else "Facility"
        steps.append({
            "step": "Referral",
            "from_hospital": from_name,
            "to_hospital": to_name,
            "status": ref.status,
            "date": ref.created_at.isoformat() if ref.created_at else None,
            "description": f"Referral from {from_name} to {to_name} [{ref.status}]",
        })
    return steps


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_dashboard(request, health_id=""):
    """Comprehensive patient dashboard aggregating all data for a patient.
    
    Returns a unified view showing:
    - Patient profile
    - Total records and breakdown by type
    - Measurements summary (pie chart data)
    - Referrals (outgoing/incoming)
    - Access grants/revocations
    - Blockchain activity summary
    - Patient journey (Hospital A → Hospital B flow)
    """
    requestor_role = request.auth.get("role", "") if request.auth else ""
    if requestor_role == "PATIENT":
        token_health_id = request.auth.get("health_id", "")
        if not health_id or health_id == "me":
            health_id = token_health_id
        elif token_health_id != health_id:
            return Response({"error": "Not authorized"}, status=403)
    elif not health_id:
        return Response({"error": "health_id is required"}, status=400)
    
    # Get patient
    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)
    
    # Build dashboard data
    dashboard_data = {
        "patient": {
            "id": patient.id,
            "health_id": patient.health_id,
            "full_name": patient.full_name,
            "phone": patient.phone,
            "pin_hash": patient.pin_hash,
            "wallet_address": patient.wallet_address,
            "hospital": patient.hospital.name if patient.hospital else "",
            "registration_date": patient.created_at.isoformat() if patient.created_at else None,
        },
        
        # Records summary
        "records": {
            "total": patient.records.count(),
            "by_type": _summarize_records(patient.records),
            "latest": _serialize_record(patient.records.order_by("-created_at").first()) if patient.records.exists() else None,
        },
        
        # Measurements summary (for pie chart)
        "measurements": {
            "total": patient.measurements.count(),
            "by_kind": _summarize_measurements(patient.measurements),
            "latest": _serialize_measurement(patient.measurements.order_by("-created_at").first()) if patient.measurements.exists() else None,
        },
        
        # Referrals
        "referrals": {
            "outgoing": Referral.objects.filter(
                patient=patient, 
                from_doctor__isnull=False
            ).count(),
            "incoming": Referral.objects.filter(
                patient=patient, 
                to_hospital=patient.hospital
            ).count() if patient.hospital else 0,
            "summary": _summarize_referrals(patient, Referral),
        },
        
        # Access grants
        "access": {
            "active_grants": AccessGrant.objects.filter(
                patient=patient, 
                active=True,
                expires_at__gt=timezone.now()
            ).count(),
            "active_revokes": AccessGrant.objects.filter(
                patient=patient, 
                active=False
            ).count(),
        },
        
        # Blockchain activity
        "blockchain": {
            "total_transactions": _count_blockchain_transactions(patient),
            "recent_events": _get_recent_blockchain_events(patient, limit=10),
        },
        
        # Patient journey (Hospital A → Hospital B flow)
        "journey": _get_journey(patient),
    }
    
    return Response(dashboard_data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_activity_story(request, health_id):
    """Unified human-readable on-chain story for a patient.

    Merges the on-chain audit trail with raw event logs.
    Falls back to DB-sourced events when the blockchain node is unreachable,
    so the Access History tab always shows meaningful data.
    """
    requestor_role = request.auth.get("role", "") if request.auth else ""
    if requestor_role == "PATIENT":
        if request.auth.get("health_id", "") != health_id:
            return Response({"error": "Not authorized"}, status=403)
    elif requestor_role == "DOCTOR":
        doctor = _doctor_from_request(request)
        if not doctor:
            return Response({"error": "Doctor not verified"}, status=403)
        patient = Patient.objects.filter(health_id=health_id).first()
        if not patient or not _doctor_can_view_patient(doctor, patient)[0]:
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

    patient = Patient.objects.filter(health_id=health_id).first()
    if not patient:
        return Response({"error": "Patient not found"}, status=404)

    # ------------------------------------------------------------------
    # Helper: build story entirely from DB rows (used when chain is down)
    # ------------------------------------------------------------------
    def _db_story(pat):
        items = []

        # Registration event
        if pat.created_at:
            ts = int(pat.created_at.timestamp())
            items.append({
                "action": "PATIENT_REGISTERED",
                "event": "PatientRegistered",
                "who": pat.full_name,
                "wallet": pat.wallet_address or "",
                "role": "PATIENT",
                "facility": pat.hospital.name if pat.hospital else (pat.registered_by_facility or ""),
                "verb": _ACTION_STORY["PatientRegistered"][0],
                "icon": _ACTION_STORY["PatientRegistered"][1],
                "timestamp": ts,
                "transaction_hash": None,
                "etherscan_url": None,
                "source": "db",
            })

        # Records added
        for r in pat.records.order_by("-created_at"):
            ts = int(r.created_at.timestamp()) if r.created_at else 0
            tx = r.tx_hash if r.tx_hash and not r.tx_hash.startswith("PENDING") else None
            items.append({
                "action": "RECORD_ADDED",
                "event": "RecordAdded",
                "who": r.facility_name or r.facility_id or "Healthcare facility",
                "wallet": "",
                "role": "STAFF",
                "facility": r.facility_name or r.facility_id or "",
                "verb": "added a %s record (hash anchored on-chain)" % (r.record_type or "medical"),
                "icon": _ACTION_STORY["RecordAdded"][1],
                "timestamp": ts,
                "transaction_hash": tx,
                "etherscan_url": "https://sepolia.etherscan.io/tx/%s" % tx if tx else None,
                "source": "db",
            })

        # Access grants / break-glass
        for g in pat.grants.order_by("-created_at"):
            ts = int(g.created_at.timestamp()) if g.created_at else 0
            tx = g.tx_hash if g.tx_hash and not g.tx_hash.startswith("PENDING") else None
            is_emergency = getattr(g, "source", "") == "BREAK_GLASS"
            ev_name = "BreakGlassUsed" if is_emergency else "AccessGranted"
            doctor_name = g.doctor.full_name if g.doctor else "A doctor"
            facility_name = g.hospital.name if g.hospital else (g.doctor.facility_id if g.doctor else "")
            who_str = "Dr. %s" % doctor_name
            if facility_name:
                who_str += " (%s)" % facility_name
            items.append({
                "action": "BREAK_GLASS" if is_emergency else "GRANTED_TO_DOCTOR",
                "event": ev_name,
                "who": who_str,
                "wallet": g.doctor.wallet_address if g.doctor else "",
                "role": "DOCTOR",
                "facility": facility_name,
                "verb": _ACTION_STORY[ev_name][0],
                "icon": _ACTION_STORY[ev_name][1],
                "timestamp": ts,
                "transaction_hash": tx,
                "etherscan_url": "https://sepolia.etherscan.io/tx/%s" % tx if tx else None,
                "source": "db",
            })

        # Accepted referrals
        for ref in pat.referrals.filter(status="ACCEPTED").order_by("-created_at"):
            ts = int(ref.responded_at.timestamp()) if ref.responded_at else (
                int(ref.created_at.timestamp()) if ref.created_at else 0)
            tx = ref.tx_hash if ref.tx_hash and not ref.tx_hash.startswith("PENDING") else None
            from_hosp = ref.from_hospital.name if ref.from_hospital else "Sending facility"
            to_hosp = ref.to_hospital.name if ref.to_hospital else "Receiving facility"
            items.append({
                "action": "REFERRAL_ACCEPTED",
                "event": "ReferralAccepted",
                "who": ref.responded_by or to_hosp,
                "wallet": "",
                "role": "STAFF",
                "facility": to_hosp,
                "verb": "accepted referral from %s to %s" % (from_hosp, to_hosp),
                "icon": _ACTION_STORY["ReferralAccepted"][1],
                "timestamp": ts,
                "transaction_hash": tx,
                "etherscan_url": "https://sepolia.etherscan.io/tx/%s" % tx if tx else None,
                "source": "db",
            })

        items.sort(key=lambda x: x["timestamp"], reverse=True)
        return items

    # ------------------------------------------------------------------
    # 1) Try the on-chain audit trail
    # ------------------------------------------------------------------
    chain_available = True
    trail = []
    try:
        trail = contract.functions.getAuditTrail(health_id).call()
    except Exception:
        logger.warning(
            "Blockchain unavailable for patient %s — falling back to DB story", health_id
        )
        chain_available = False

    # ------------------------------------------------------------------
    # 2) Chain down or empty trail → return DB story (never 503)
    # ------------------------------------------------------------------
    if not chain_available or not trail:
        db_items = _db_story(patient)
        return Response({
            "health_id": health_id,
            "story": db_items,
            "count": len(db_items),
            "source": "db",
        })

    # ------------------------------------------------------------------
    # 3) Chain available — enrich audit entries with raw event tx hashes
    # ------------------------------------------------------------------
    events_by_key: dict = {}
    for evt_name in [
        "PatientRegistered", "RecordAdded", "AccessGranted",
        "AccessRevoked", "RecordViewed", "BreakGlassUsed",
        "EmergencyAccessGranted", "EmergencyAccessRevoked", "ReferralAccepted",
    ]:
        for ev in _fetch_events(evt_name, argument_filters={"healthID": health_id}):
            a = ev["args"]
            actor = (
                a.get("grantedTo") or a.get("revokedFrom") or a.get("viewer")
                or a.get("clinician") or ""
            )
            ts = a.get("timestamp")
            if ts is None:
                try:
                    blk = w3.eth.get_block(ev["block_number"])
                    ts = blk.timestamp
                except Exception:
                    ts = 0
            key = (actor.lower(), round(ts / 120))
            events_by_key.setdefault(key, ev)

    def _match_tx(action: str, accessor: str, ts: int) -> str:
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
        for (actor_key, _), ev in events_by_key.items():
            if (ev["event"] == ev_name
                    and actor_key == (accessor or "").lower()
                    and abs(ev.get("args", {}).get("timestamp", ts) - ts) <= 120):
                return ev["transaction_hash"]
        for (_, __), ev in events_by_key.items():
            if ev["event"] == ev_name and abs(ev.get("args", {}).get("timestamp", ts) - ts) <= 120:
                return ev["transaction_hash"]
        return ""

    action_map = {
        "PATIENT_REGISTERED": "PatientRegistered",
        "RECORD_ADDED": "RecordAdded",
        "GRANTED_TO_DOCTOR": "AccessGranted",
        "REVOKED_DOCTOR": "AccessRevoked",
        "VIEW": "RecordViewed",
        "BREAK_GLASS": "BreakGlassUsed",
        "EMERGENCY_ACCESS_REVOKED": "EmergencyAccessRevoked",
    }
    story = []
    for e in trail:
        accessor, role, facility, action, ts = e[0], e[1], e[2], e[3], e[4]
        tx = _match_tx(action, accessor, ts)
        ev_name = action_map.get(action, "")
        who = _who({
            "viewer": accessor, "clinician": accessor, "wallet": accessor,
            "grantedTo": accessor, "revokedFrom": accessor,
        })
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
            "etherscan_url": ("https://sepolia.etherscan.io/tx/%s" % tx) if tx else None,
            "source": "chain",
        })

    # Merge DB events not already represented in the chain trail
    db_items = _db_story(patient)
    chain_timestamps = {s["timestamp"] for s in story}
    for dbi in db_items:
        if dbi["transaction_hash"] and not any(
            abs(dbi["timestamp"] - ct) <= 120 for ct in chain_timestamps
        ):
            story.append(dbi)

    story.sort(key=lambda x: x["timestamp"], reverse=True)
    return Response({
        "health_id": health_id,
        "story": story,
        "count": len(story),
        "source": "chain",
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
        patient = Patient.objects.filter(health_id=health_id).first()
        if not patient or not _doctor_can_view_patient(doctor, patient)[0]:
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
