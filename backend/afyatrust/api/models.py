from django.db import models


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


class AccessRequest(models.Model):
    """Doctor asks the patient for access; patient approves or rejects."""
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    ]
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="access_requests")
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
