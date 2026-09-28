"""Stateless JWT authentication for patients and doctors.

SimpleJWT normally loads a Django User row via the `user_id` claim.
Patients and doctors are not Django users, so we return a lightweight
principal built from the token claims instead.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication


class PatientPrincipal:
    """Minimal request.user stand-in derived from JWT claims."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, health_id: str, role: str = "PATIENT"):
        self.id = health_id
        self.health_id = health_id
        self.role = role

    def __str__(self):
        return f"Patient({self.health_id})"


class DoctorPrincipal:
    """request.user stand-in for a doctor identified by license_no."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, license_no: str, wallet_address: str = "", role: str = "DOCTOR"):
        self.id = license_no
        self.license_no = license_no
        self.wallet_address = wallet_address
        self.role = role

    def __str__(self):
        return f"Doctor({self.license_no})"


class RoleJWTAuthentication(JWTAuthentication):
    """Builds a Patient or Doctor principal depending on the token role."""

    def get_user(self, validated_token):
        if validated_token.get("role") == "DOCTOR":
            return DoctorPrincipal(
                license_no=validated_token.get("license_no", ""),
                wallet_address=validated_token.get("wallet_address", ""),
            )
        return PatientPrincipal(
            health_id=validated_token.get("health_id", ""),
            role=validated_token.get("role", "PATIENT"),
        )
