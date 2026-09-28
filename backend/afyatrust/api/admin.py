from django.contrib import admin
from django import forms
from django.utils import timezone
from django.contrib.auth.hashers import make_password

from .models import (
    AccessRequest, Doctor, Hospital, HospitalStaff, Measurement,
    MedicalRecord, Patient, Referral,
)


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    """Admin-only hospital registry: feeds doctor registration and referrals."""
    list_display = ("name", "code", "region", "created_at")
    search_fields = ("name", "code", "region")


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    """Doctors self-register; an admin approves or rejects them here."""
    list_display = ("full_name", "license_no", "facility_id", "status")
    list_filter = ("status", "hospital")
    search_fields = ("full_name", "license_no", "wallet_address")
    actions = ["approve_doctors", "reject_doctors"]

    @admin.action(description="✅ Approve selected doctors")
    def approve_doctors(self, request, queryset):
        count = 0
        for d in queryset.filter(status__in=["PENDING", "REJECTED"]):
            d.status = "APPROVED"
            d.approved_at = timezone.now()
            d.save(update_fields=["status", "approved_at"])
            count += 1
        self.message_user(request, f"{count} doctor(s) approved.")

    @admin.action(description="❌ Revoke selected doctors")
    def reject_doctors(self, request, queryset):
        count = queryset.filter(status="APPROVED").update(status="REJECTED")
        self.message_user(request, f"{count} doctor(s) revoked.")


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
    """Admin creates hospital desk accounts (username + password) so staff can
    respond to referrals on the hospital page without touching Django admin."""
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

    @admin.action(description="✅ Accept selected referrals")
    def accept_referrals(self, request, queryset):
        count = queryset.filter(status="PENDING").update(
            status="ACCEPTED", responded_at=timezone.now()
        )
        self.message_user(request, f"{count} referral(s) accepted.")

    @admin.action(description="❌ Decline selected referrals")
    def decline_referrals(self, request, queryset):
        count = queryset.filter(status="PENDING").update(
            status="DECLINED", responded_at=timezone.now()
        )
        self.message_user(request, f"{count} referral(s) declined.")


@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    list_display = ("kind", "value", "unit", "patient", "doctor", "hospital", "created_at")
    list_filter = ("kind", "hospital")
    search_fields = ("patient__health_id", "patient__full_name")


admin.site.register(Patient)
admin.site.register(MedicalRecord)
admin.site.register(AccessRequest)
