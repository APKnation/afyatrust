"""Export the off-chain database state that must live on-chain.

Feeds blockchain/scripts/migrate-state.js after a redeploy:

    python manage.py export_chain_state --out /tmp/afya_state.json
    cd ../../blockchain && npx hardhat run scripts/migrate-state.js --network sepolia /tmp/afya_state.json

Only state the current contract can represent is exported: patients, live
patient-signed grants, and anchored record hashes. Break-glass windows are
deliberately skipped — they last one hour and are re-created by the doctor
if the emergency is still ongoing.
"""
import json

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import AccessGrant, MedicalRecord, Patient


class Command(BaseCommand):
    help = "Export patients, live grants and record hashes for migrate-state.js."

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
                "health_id": p.health_id,
                "wallet": p.wallet_address,
                "name": p.full_name,
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
                    "health_id": g.patient.health_id,
                    "patient_wallet": g.patient.wallet_address,
                    "doctor_wallet": g.doctor.wallet_address,
                    "expires_at": g.expires_at.isoformat(),
                }
            )

        records = [
            {
                "health_id": r.patient.health_id,
                "hash": r.record_hash,
                "facility_id": r.facility_id,
            }
            for r in (
                MedicalRecord.objects.select_related("patient")
                .exclude(record_hash="")
                .order_by("created_at")
            )
        ]

        payload = {
            "patients": patients,
            "grants": grants,
            "records": records,
        }
        out = options["out"]
        with open(out, "w") as fh:
            json.dump(payload, fh, indent=2)

        self.stdout.write(
            f"Wrote {out}: {len(patients)} patients, {len(grants)} live grants, "
            f"{len(records)} records "
            f"({skipped_emergency} break-glass windows skipped — they expire in an hour)."
        )
