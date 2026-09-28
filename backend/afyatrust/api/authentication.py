"""Stateless JWT authentication for patients, doctors and hospital staff.

SimpleJWT normally loads a Django User row via the `user_id` claim.
These roles are not Django users, so we return a lightweight principal
built from the token claims instead.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication


class Principal:
    """Minimal request.user stand-in derived from JWT claims."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, role: str, id: str = "", name: str = "", **extra):
        self.role = role
        self.id = id or name
        self.name = name
        for k, v in extra.items():
            setattr(self, k, v)

    def __str__(self):
        return f"{self.role}({self.id})"


class RoleJWTAuthentication(JWTAuthentication):
    """Builds a Patient, Doctor or HospitalStaff principal from the role claim."""

    def get_user(self, validated_token):
        role = validated_token.get("role", "PATIENT")
        if role == "DOCTOR":
            return Principal(
                "DOCTOR",
                id=validated_token.get("license_no", ""),
                name=validated_token.get("full_name", ""),
                license_no=validated_token.get("license_no", ""),
                wallet_address=validated_token.get("wallet_address", ""),
            )
        if role == "STAFF":
            return Principal(
                "STAFF",
                id=validated_token.get("username", ""),
                name=validated_token.get("full_name", ""),
                username=validated_token.get("username", ""),
                hospital_code=validated_token.get("hospital_code", ""),
            )
        return Principal(
            "PATIENT",
            id=validated_token.get("health_id", ""),
            health_id=validated_token.get("health_id", ""),
        )
