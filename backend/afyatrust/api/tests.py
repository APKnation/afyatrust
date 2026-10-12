from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from . import blockchain
from .blockchain import patient_ref
from .models import AccessGrant, Patient, Referral
from .views import (
    _doctor_can_view_patient,
    blockchain_events,
    break_glass,
    patient_dashboard,
)


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
    @override_settings(CHAIN_ID_SECRET="a" * 64)
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

    @override_settings(CHAIN_ID_SECRET="a" * 64)
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


class BreakGlassAttestationTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(is_authenticated=True)

    def test_break_glass_requires_explicit_boolean_attestation(self):
        for attestation in (None, False, "true"):
            with self.subTest(attestation=attestation):
                payload = {"health_id": "patient-123", "reason": "Urgent care"}
                if attestation is not None:
                    payload["patient_unable_to_consent"] = attestation
                request = self.factory.post(
                    "/doctor/break-glass/", payload, format="json"
                )
                force_authenticate(request, user=self.user, token={})

                with patch(
                    "api.views._doctor_from_request",
                    return_value=SimpleNamespace(),
                ):
                    response = break_glass(request)

                self.assertEqual(response.status_code, 400)
                self.assertIn("cannot communicate or consent", response.data["error"])

    def test_patient_dashboard_rejects_roles_without_record_access(self):
        request = self.factory.get("/patient/dashboard/patient-123/")
        force_authenticate(
            request,
            user=self.user,
            token={"role": "HOSPITAL_STAFF"},
        )
        with patch.object(Patient.objects, "filter") as patient_filter:
            response = patient_dashboard(request, health_id="patient-123")

        self.assertEqual(response.status_code, 403)
        patient_filter.assert_not_called()


class PatientReferenceTests(SimpleTestCase):
    @override_settings(CHAIN_ID_SECRET="a" * 64)
    def test_reference_is_stable_opaque_and_case_insensitive(self):
        first = patient_ref("H-123")

        self.assertEqual(first, patient_ref("h-123"))
        self.assertNotIn("H-123", first)
        self.assertTrue(first.startswith("pt_"))

    @override_settings(CHAIN_ID_SECRET="a" * 64)
    def test_reference_changes_with_the_secret(self):
        first = patient_ref("H-123")
        with override_settings(CHAIN_ID_SECRET="b" * 64):
            self.assertNotEqual(first, patient_ref("H-123"))

    @override_settings(CHAIN_ID_SECRET="")
    def test_missing_reference_secret_fails_explicitly(self):
        with self.assertRaisesRegex(RuntimeError, "CHAIN_ID_SECRET"):
            patient_ref("H-123")


class PatientBlockchainEventAuthorizationTests(SimpleTestCase):
    def test_doctor_cannot_query_patient_events_without_record_access(self):
        factory = APIRequestFactory()
        request = factory.get("/blockchain/events/?health_id=patient-123")
        force_authenticate(
            request,
            user=SimpleNamespace(is_authenticated=True),
            token={"role": "DOCTOR", "license_no": "DOC-1"},
        )
        patient = SimpleNamespace(health_id="patient-123")
        doctor = SimpleNamespace()

        with (
            patch("api.views._get_hospital_code_from_request", return_value="FAC-1"),
            patch.object(Patient.objects, "filter") as patient_filter,
            patch("api.views._doctor_from_request", return_value=doctor),
            patch("api.views._doctor_can_view_patient", return_value=(False, True)),
            patch("api.views._fetch_events") as fetch_events,
        ):
            patient_filter.return_value.first.return_value = patient
            response = blockchain_events(request)

        self.assertEqual(response.status_code, 403)
        fetch_events.assert_not_called()
