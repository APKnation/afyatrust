from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

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
