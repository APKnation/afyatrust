from django.contrib import admin
from django.utils import timezone

from .models import AccessRequest, Doctor, Hospital, Measurement, MedicalRecord, Patient, Referral


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


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    """Receiving-hospital staff respond to referrals here (accept/decline)."""
    list_display = (
        "patient", "from_hospital", "to_hospital", "reason",
        "status", "created_at",
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
