from django.db import models


class Hospital(models.Model):
    """Hospital/facility registered by an admin (Django admin only)."""
    code = models.CharField(max_length=50, unique=True)   # e.g. FAC-1
    name = models.CharField(max_length=200)
    region = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Patient(models.Model):
    """Patient with custodial wallet. Logs in with Health ID + PIN (no MetaMask)."""
    health_id = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    pin_hash = models.CharField(max_length=255)                    # hashed 4-digit PIN
    wallet_address = models.CharField(max_length=42, unique=True)  # custodial wallet
    encrypted_private_key = models.TextField()                     # AES-256-GCM ciphertext
    encryption_iv = models.CharField(max_length=64)                # base64 nonce/IV
    registered_by_facility = models.CharField(max_length=50, blank=True)
    hospital = models.ForeignKey(
        Hospital, null=True, blank=True, on_delete=models.SET_NULL, related_name="patients"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} ({self.health_id})"


class MedicalRecord(models.Model):
    """Off-chain clinical data. Only the hash + pointer go on-chain."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="records")
    facility_id = models.CharField(max_length=50)
    facility_name = models.CharField(max_length=200)
    record_type = models.CharField(max_length=50)      # e.g. LAB, PRESCRIPTION
    record_data = models.JSONField()                   # stays off-chain
    record_hash = models.CharField(max_length=66)      # SHA-256, mirrors on-chain
    tx_hash = models.CharField(max_length=66, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Doctor(models.Model):
    """Verified doctor. Created by an admin with license number + PIN; the
    backend generates a custodial wallet (no MetaMask) so the doctor has an
    on-chain identity for permission grants. Only APPROVED doctors can log in,
    request access or view records."""
    STATUS_CHOICES = [
        ("PENDING", "Pending review"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    ]
    full_name = models.CharField(max_length=200)
    license_no = models.CharField(max_length=50, unique=True)   # medical license
    pin_hash = models.CharField(max_length=255, blank=True)     # hashed 4-digit PIN
    facility_id = models.CharField(max_length=50)
    hospital = models.ForeignKey(
        Hospital, null=True, blank=True, on_delete=models.SET_NULL, related_name="doctors"
    )
    wallet_address = models.CharField(max_length=42, unique=True)  # custodial, on-chain identity
    encrypted_private_key = models.TextField(blank=True, default="")   # AES-256-GCM ciphertext
    encryption_iv = models.CharField(max_length=64, blank=True, default="")  # base64 nonce/IV
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Dr. {self.full_name} [{self.status}]"


class Measurement(models.Model):
    """Clinical reading a doctor takes for a patient (off-chain)."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="measurements")
    doctor = models.ForeignKey(Doctor, null=True, blank=True, on_delete=models.SET_NULL, related_name="measurements")
    hospital = models.ForeignKey(Hospital, null=True, blank=True, on_delete=models.SET_NULL, related_name="measurements")
    kind = models.CharField(max_length=50)             # e.g. "Blood pressure"
    value = models.FloatField()
    unit = models.CharField(max_length=20, blank=True) # e.g. "mmHg"
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.kind} {self.value}{self.unit} — {self.patient.health_id}"


class Referral(models.Model):
    """Doctor sends a patient to another hospital; the receiving hospital
    responds (accept/decline) via the Django admin."""
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("CANCELLED", "Cancelled"),
    ]
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="referrals")
    from_doctor = models.ForeignKey(Doctor, on_delete=models.SET_NULL, null=True, related_name="referrals_sent")
    from_hospital = models.ForeignKey(
        Hospital, on_delete=models.SET_NULL, null=True, blank=True, related_name="referrals_out"
    )
    to_hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="referrals_in")
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    responded_by = models.CharField(max_length=220, blank=True)  # e.g. "STAFF:juma@mnh"
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.patient.health_id} → {self.to_hospital.code} [{self.status}]"


class HospitalStaff(models.Model):
    """Non-doctor hospital desk staff. Created by an admin (Django admin);
    logs in with username + password to handle incoming referrals."""
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="staff")
    username = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=200)
    password_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} @ {self.hospital.code}"


class AccessRequest(models.Model):
    """Doctor asks the patient for access; patient approves or rejects."""
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    ]
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="access_requests")
    doctor = models.ForeignKey(
        Doctor, null=True, blank=True, on_delete=models.SET_NULL, related_name="access_requests"
    )
    doctor_wallet = models.CharField(max_length=42)
    doctor_name = models.CharField(max_length=200)
    facility_id = models.CharField(max_length=50)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    tx_hash = models.CharField(max_length=66, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class AccessGrant(models.Model):
    """Bookkeeping of a patient granting a doctor on-chain access, so the
    doctor's dashboard can list assigned patients even when the chain is
    unreachable. Fresh liveness always comes from hasAccess on-chain."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="grants")
    doctor = models.ForeignKey(Doctor, null=True, blank=True, on_delete=models.SET_NULL, related_name="grants")
    hospital = models.ForeignKey(Hospital, null=True, blank=True, on_delete=models.SET_NULL, related_name="grants")
    tx_hash = models.CharField(max_length=66, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.patient.health_id} → {self.doctor} until {self.expires_at:%Y-%m-%d}"
