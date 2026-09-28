"""Stateless JWT authentication for patients.

SimpleJWT normally loads a Django User row via the `user_id` claim.
Patients are not Django users, so we return a lightweight principal
built from the token claims instead.
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


class HealthIdJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        return PatientPrincipal(
            health_id=validated_token.get("health_id", ""),
            role=validated_token.get("role", "PATIENT"),
        )
