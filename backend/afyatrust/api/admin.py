from django.contrib import admin
from .models import Patient, Doctor, LoginNonce, MedicalRecord, AccessRequest

admin.site.register(Patient)
admin.site.register(Doctor)
admin.site.register(LoginNonce)
admin.site.register(MedicalRecord)
admin.site.register(AccessRequest)
