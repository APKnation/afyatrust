from django.contrib import admin
from django import forms
from django.utils import timezone
from django.contrib.auth.hashers import make_password

from .models import (
    AccessRequest, Doctor, Hospital, HospitalStaff, Measurement,
    MedicalRecord, Patient, Referral,
)
from . import wallet_manager


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    """Admin-only hospital registry: feeds doctor accounts and referrals."""
    list_display = ("name", "code", "region", "created_at")
    search_fields = ("name", "code", "region")


class DoctorForm(forms.ModelForm):
    """Admin creates doctor accounts: sets the initial PIN at creation.
    The wallet is NOT entered here — a custodial wallet is generated
    automatically, exactly like for patients."""
    pin = forms.CharField(
        widget=forms.PasswordInput(render_value=False),
        required=False,
        help_text="4-digit PIN the doctor will use to sign in. Required for new doctors; leave blank to keep the current PIN.",
    )

    class Meta:
        model = Doctor
        # wallet_address + key material are generated in save(), never typed.
        fields = ("full_name", "license_no", "pin", "facility_id", "hospital", "status")

    def clean_pin(self):
        pin = self.cleaned_data.get("pin") or ""
        if pin and len(pin) != 4:
            raise forms.ValidationError("PIN must be exactly 4 digits.")
        return pin

    def save(self, commit=True):
        doctor = super().save(commit=False)
        if doctor.pk and not self.cleaned_data.get("pin"):
            pass  # keep existing pin_hash
        elif self.cleaned_data.get("pin"):
            doctor.pin_hash = make_password(self.cleaned_data["pin"])

        # Custodial wallet: generate when missing (new doctor, or legacy row
        # created before auto-generation existed).
        if not doctor.wallet_address:
            wallet = wallet_manager.create_wallet()
            doctor.wallet_address = wallet["address"]
            doctor.encrypted_private_key = wallet["encrypted_key"]
            doctor.encryption_iv = wallet["iv"]

        if commit:
            doctor.save()
        return doctor


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    """Doctors are created here by the admin (name, license, hospital, PIN);
    the custodial wallet is generated automatically, then an admin approves.
    There is no public doctor registration."""
    form = DoctorForm
    list_display = ("full_name", "license_no", "facility_id", "status", "short_wallet", "has_pin")
    list_filter = ("status", "hospital")
    search_fields = ("full_name", "license_no", "wallet_address")
    readonly_fields = ("wallet_address", "encrypted_private_key", "encryption_iv")
    actions = ["approve_doctors", "reject_doctors", "reset_pin_action"]

    @admin.display(description="Wallet")
    def short_wallet(self, obj):
        if not obj.wallet_address:
            return "—"
        return f"{obj.wallet_address[:10]}…{obj.wallet_address[-6:]}"

    @admin.display(boolean=True, description="PIN set")
    def has_pin(self, obj):
        return bool(obj.pin_hash)

    @admin.action(description="Approve selected doctors")
    def approve_doctors(self, request, queryset):
        count = 0
        for d in queryset.filter(status__in=["PENDING", "REJECTED"]):
            d.status = "APPROVED"
            d.approved_at = timezone.now()
            d.save(update_fields=["status", "approved_at"])
            count += 1
        self.message_user(request, f"{count} doctor(s) approved.")

    @admin.action(description="Revoke selected doctors")
    def reject_doctors(self, request, queryset):
        count = queryset.filter(status="APPROVED").update(status="REJECTED")
        self.message_user(request, f"{count} doctor(s) revoked.")

    @admin.action(description="Force PIN reset (blocks login until new PIN set)")
    def reset_pin_action(self, request, queryset):
        from django.contrib.auth.hashers import identify_hasher
        count = 0
        for d in queryset:
            try:
                identify_hasher(d.pin_hash)
            except Exception:
                continue
            d.pin_hash = "!"
            d.save(update_fields=["pin_hash"])
            count += 1
        self.message_user(request, f"{count} doctor(s) PIN-blocked. Set a new PIN on each doctor's page.")


class HospitalStaffForm(forms.ModelForm):
    """Password is set through a write-only field, never stored in clear."""
    password = forms.CharField(
        widget=forms.PasswordInput(render_value=False),
        required=False,
        help_text="Type a password to set (or reset) it. Leave blank to keep the current password.",
    )

    class Meta:
        model = HospitalStaff
        fields = "__all__"

    def save(self, commit=True):
        staff = super().save(commit=False)
        raw = self.cleaned_data.get("password")
        if raw:
            staff.password_hash = make_password(raw)
        elif not staff.password_hash:
            raise ValueError("HospitalStaff requires a password")
        if commit:
            staff.save()
        return staff


@admin.register(HospitalStaff)
class HospitalStaffAdmin(admin.ModelAdmin):
    """Admin creates hospital desk accounts so staff can respond to referrals
    on the hospital page without touching Django admin."""
    form = HospitalStaffForm
    list_display = ("full_name", "username", "hospital", "created_at")
    list_filter = ("hospital",)
    search_fields = ("full_name", "username")

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if obj:  # editing: blank password keeps the current one
            form.base_fields["password"].help_text = (
                "Leave blank to keep the current password."
            )
        return form


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    """Referrals overview. Day-to-day responses happen on the hospital staff
    page; the admin keeps a full audit (who responded, when)."""
    list_display = (
        "patient", "from_hospital", "to_hospital", "reason",
        "status", "responded_by", "responded_at", "created_at",
    )
    list_filter = ("status", "to_hospital")
    search_fields = ("patient__health_id", "patient__full_name", "reason")
    actions = ["accept_referrals", "decline_referrals"]

    @admin.action(description=" Accept selected referrals")
    def accept_referrals(self, request, queryset):
        count = queryset.filter(status="PENDING").update(
            status="ACCEPTED", responded_at=timezone.now()
        )
        self.message_user(request, f"{count} referral(s) accepted.")

    @admin.action(description="Decline selected referrals")
    def decline_referrals(self, request, queryset):
        count = queryset.filter(status="PENDING").update(
            status="DECLINED", responded_at=timezone.now()
        )
        self.message_user(request, f"{count} referral(s) declined.")


@admin.register(AccessGrant)
class AccessGrantAdmin(admin.ModelAdmin):
    list_display = (
        "patient", "doctor", "source", "reason", "active", "expires_at",
        "tx_hash", "created_at",
    )
    list_filter = ("source", "active", "hospital")
    search_fields = ("patient__health_id", "doctor__license_no", "reason")
    readonly_fields = ("created_at", "tx_hash")


@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    list_display = ("kind", "value", "unit", "patient", "doctor", "hospital", "created_at")
    list_filter = ("kind", "hospital")
    search_fields = ("patient__health_id", "patient__full_name")


admin.site.register(Patient)
admin.site.register(MedicalRecord)
admin.site.register(AccessRequest)
