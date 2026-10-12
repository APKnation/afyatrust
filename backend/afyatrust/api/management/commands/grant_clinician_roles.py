"""Backfill CLINICIAN_ROLE for approved doctors.

breakGlass(...) and patient-signed grants both revert for any wallet without
CLINICIAN_ROLE, so every APPROVED doctor needs it on-chain. Approval in the
Django admin grants it automatically; this command repairs wallets approved
before that existed, or granted while the chain was unreachable.

Usage:
    python manage.py grant_clinician_roles            # all approved doctors
    python manage.py grant_clinician_roles --license MED-123
    python manage.py grant_clinician_roles --include-pending
"""
from django.core.management.base import BaseCommand

from api.blockchain import ensure_clinician_role
from api.models import Doctor


class Command(BaseCommand):
    help = (
        "Ensure every approved doctor's wallet holds CLINICIAN_ROLE on-chain "
        "(required for break-glass and patient-signed grants)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--license",
            dest="license_no",
            default="",
            help="Only this doctor's license number.",
        )
        parser.add_argument(
            "--include-pending",
            action="store_true",
            help="Also process PENDING/REJECTED doctors (default: APPROVED only).",
        )

    def handle(self, *args, **options):
        doctors = Doctor.objects.all().order_by("full_name")
        if not options["include_pending"]:
            doctors = doctors.filter(status="APPROVED")
        if options["license_no"]:
            doctors = doctors.filter(license_no__iexact=options["license_no"])

        granted = already = failed = 0
        for doctor in doctors:
            result, detail = ensure_clinician_role(doctor.wallet_address)
            line = f"{doctor.license_no} {doctor.full_name} [{doctor.status}]: {result}"
            if result == "granted":
                granted += 1
                self.stdout.write(self.style.SUCCESS(line))
            elif result == "already":
                already += 1
                self.stdout.write(line)
            else:
                failed += 1
                self.stdout.write(self.style.WARNING(f"{line} — {detail}"))

        self.stdout.write(
            f"\n{granted} granted, {already} already held the role, "
            f"{failed} not granted."
        )
        if failed:
            self.stdout.write(
                self.style.WARNING(
                    "Doctors without CLINICIAN_ROLE cannot use break-glass: the "
                    "contract reverts with 'Clinician is not authorized'."
                )
            )
