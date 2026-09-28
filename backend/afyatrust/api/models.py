from django.db import models


class Patient(models.Model):
    health_id = models.CharField(max_length=50, unique=True)
    wallet_address = models.CharField(max_length=42, unique=True)
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} ({self.health_id})"


class Doctor(models.Model):
    wallet_address = models.CharField(max_length=42, unique=True)
    full_name = models.CharField(max_length=200)
    facility_id = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Dr. {self.full_name} ({self.wallet_address[:10]}...)"


class LoginNonce(models.Model):
    """One-time nonce issued for wallet signature login."""
    nonce = models.CharField(max_length=64, unique=True)
    wallet_address = models.CharField(max_length=42)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']


class MedicalRecord(models.Model):
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    facility_id = models.CharField(max_length=50)
    facility_name = models.CharField(max_length=200)
    record_type = models.CharField(max_length=50)
    record_data = models.JSONField()
    record_hash = models.CharField(max_length=66)
    tx_hash = models.CharField(max_length=66, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class AccessRequest(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    doctor_wallet = models.CharField(max_length=42)
    doctor_name = models.CharField(max_length=200)
    facility_id = models.CharField(max_length=50)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    tx_hash = models.CharField(max_length=66, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
