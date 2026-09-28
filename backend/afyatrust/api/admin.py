from django.contrib import admin
from django.utils import timezone

from .models import AccessRequest, Doctor, MedicalRecord, Patient


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    """Doctors self-register; an admin approves or rejects them here."""
    list_display = ("full_name", "license_no", "facility_id", "wallet_address", "status")
    list_filter = ("status",)
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


admin.site.register(Patient)
admin.site.register(MedicalRecord)
admin.site.register(AccessRequest)
