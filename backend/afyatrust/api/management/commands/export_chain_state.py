"""Export the state needed to restore application data on a new contract.

Feeds blockchain/scripts/migrate-state.js after a redeploy:

    python manage.py export_chain_state --out /tmp/afya_state.json
    cd ../../blockchain && STATE_FILE=/tmp/afya_state.json npx hardhat run scripts/migrate-state.js --network sepolia

Only keyed patient references, live grants, and confirmed MedicalRecord and
Measurement anchors are exported. Health IDs and names are omitted.
Break-glass windows are skipped — they last one hour and must be re-created
by a doctor if needed.
"""
import json
import os

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.blockchain import patient_ref
from api.models import AccessGrant, Measurement, MedicalRecord, Patient


class Command(BaseCommand):
    help = "Export pseudonymous patient refs, live grants, and confirmed record anchors."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out",
            default="/tmp/afya_state.json",
            help="Where to write the JSON (default: /tmp/afya_state.json).",
        )

    def handle(self, *args, **options):
        now = timezone.now()

        patients = [
            {
                "patient_ref": patient_ref(p.health_id),
                "wallet": p.wallet_address,
            }
            for p in Patient.objects.all().order_by("health_id")
        ]

        grants = []
        skipped_emergency = 0
        for g in (
            AccessGrant.objects.filter(active=True, expires_at__gt=now)
            .select_related("patient", "doctor")
            .order_by("created_at")
        ):
            if g.source == "BREAK_GLASS":
                skipped_emergency += 1
                continue
            if not g.doctor or not g.doctor.wallet_address:
                continue
            grants.append(
                {
                    "patient_ref": patient_ref(g.patient.health_id),
                    "patient_wallet": g.patient.wallet_address,
                    "doctor_wallet": g.doctor.wallet_address,
                    "expires_at": g.expires_at.isoformat(),
                }
            )

        records = []
        for record in (
            MedicalRecord.objects.select_related("patient")
            .exclude(record_hash="")
            .exclude(tx_hash="")
            .exclude(tx_hash__startswith="PENDING")
        ):
            records.append({
                "patient_ref": patient_ref(record.patient.health_id),
                "hash": record.record_hash,
                "facility_id": record.facility_id,
                "created_at": record.created_at,
            })
        for measurement in (
            Measurement.objects.select_related("patient")
            .exclude(record_hash="")
            .exclude(tx_hash="")
            .exclude(tx_hash__startswith="PENDING")
        ):
            records.append({
                "patient_ref": patient_ref(measurement.patient.health_id),
                "hash": measurement.record_hash,
                "facility_id": measurement.facility_id,
                "created_at": measurement.created_at,
            })
        records.sort(key=lambda record: record["created_at"])
        for record in records:
            record.pop("created_at")

        payload = {
            "patients": patients,
            "grants": grants,
            "records": records,
        }
        out = options["out"]
        fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as fh:
            json.dump(payload, fh, indent=2)

        self.stdout.write(
            f"Wrote {out}: {len(patients)} patients, {len(grants)} live grants, "
            f"{len(records)} records "
            f"({skipped_emergency} break-glass windows skipped — they expire in an hour)."
        )
