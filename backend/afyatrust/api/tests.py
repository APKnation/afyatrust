from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from . import blockchain
from .models import AccessGrant, Referral
from .views import _doctor_can_view_patient


class DoctorPatientAccessTests(SimpleTestCase):
    def setUp(self):
        self.doctor = SimpleNamespace(
            wallet_address="0x0000000000000000000000000000000000000001",
            hospital=SimpleNamespace(pk=1),
        )
        self.patient = SimpleNamespace(health_id="patient-123")

    def test_accepted_referral_alone_does_not_grant_record_access(self):
        with (
            patch("api.views.check_has_access", return_value=(False, True)),
            patch.object(AccessGrant.objects, "filter") as grants_filter,
            patch.object(Referral.objects, "filter") as referrals_filter,
        ):
            grants_filter.return_value.exists.return_value = False

            self.assertEqual(
                _doctor_can_view_patient(self.doctor, self.patient),
                (False, True),
            )
            referrals_filter.assert_not_called()

    def test_live_individual_chain_grant_allows_record_access(self):
        with (
            patch("api.views.check_has_access", return_value=(True, True)),
            patch.object(AccessGrant.objects, "filter") as grants_filter,
        ):
            self.assertEqual(
                _doctor_can_view_patient(self.doctor, self.patient),
                (True, True),
            )
            grants_filter.assert_not_called()

    def test_active_break_glass_grant_allows_access_when_chain_grant_is_absent(self):
        with (
            patch("api.views.check_has_access", return_value=(False, True)),
            patch.object(AccessGrant.objects, "filter") as grants_filter,
        ):
            grants_filter.return_value.exists.return_value = True

            self.assertEqual(
                _doctor_can_view_patient(self.doctor, self.patient),
                (True, True),
            )


class ClinicianRoleTests(SimpleTestCase):
    """CLINICIAN_ROLE is the switch that makes break-glass real: without it the
    contract reverts with "Clinician is not authorized"."""

    WALLET = "0x0000000000000000000000000000000000000001"
    SIGNER = "0x0000000000000000000000000000000000000002"

    def test_grants_when_missing_and_backend_is_admin(self):
        with (
            patch.object(blockchain, "has_role", side_effect=[False, True, True]),
            patch.object(blockchain, "facility_address", return_value=self.SIGNER),
            patch.object(blockchain, "send_transaction", return_value="0xabc") as send,
        ):
            status, detail = blockchain.ensure_clinician_role(self.WALLET)
        self.assertEqual(status, "granted")
        self.assertEqual(detail, "0xabc")
        send.assert_called_once()

    def test_skips_when_role_already_held(self):
        with (
            patch.object(blockchain, "has_role", return_value=True),
            patch.object(blockchain, "send_transaction") as send,
        ):
            status, _ = blockchain.ensure_clinician_role(self.WALLET)
        self.assertEqual(status, "already")
        send.assert_not_called()

    def test_reports_when_backend_wallet_lacks_admin_role(self):
        with (
            patch.object(blockchain, "has_role", side_effect=[False, False]),
            patch.object(blockchain, "facility_address", return_value=self.SIGNER),
            patch.object(blockchain, "send_transaction") as send,
        ):
            status, detail = blockchain.ensure_clinician_role(self.WALLET)
        self.assertEqual(status, "no_permission")
        self.assertIn("grant-clinician-role.js", detail)
        send.assert_not_called()

    def test_reports_unreadable_chain_instead_of_wrong_permission(self):
        with (
            patch.object(blockchain, "has_role", return_value=None),
            patch.object(blockchain, "send_transaction") as send,
        ):
            status, _ = blockchain.ensure_clinician_role(self.WALLET)
        self.assertEqual(status, "chain_unavailable")
        send.assert_not_called()

    def test_rejects_doctor_without_wallet(self):
        with patch.object(blockchain, "send_transaction") as send:
            status, _ = blockchain.ensure_clinician_role("")
        self.assertEqual(status, "invalid_wallet")
        send.assert_not_called()


class EmergencyAccessHelperTests(SimpleTestCase):
    def test_remaining_is_zero_when_chain_unreachable(self):
        class BrokenContract:
            def __getattr__(self, name):
                raise ConnectionError("Sepolia unreachable")

        with patch.object(blockchain, "contract", BrokenContract()):
            self.assertEqual(
                blockchain.emergency_access_remaining(
                    "H-1", "0x0000000000000000000000000000000000000001"
                ),
                0,
            )

    def test_remaining_never_returns_negative(self):
        class Contract:
            class functions:
                @staticmethod
                def emergencyAccessRemaining(*args, **kwargs):
                    class Call:
                        def call(self):
                            return -5
                    return Call()

        with patch.object(blockchain, "contract", Contract()):
            self.assertEqual(
                blockchain.emergency_access_remaining(
                    "H-1", "0x0000000000000000000000000000000000000001"
                ),
                0,
            )
