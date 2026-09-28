from django.urls import path
from . import views
from . import auth_views

urlpatterns = [
    # Auth
    path('auth/nonce/', auth_views.auth_nonce),
    path('auth/login/', auth_views.auth_login),
    path('auth/register-doctor/', auth_views.register_doctor),

    # Registration / records
    path('register/', views.register_patient),
    path('add-record/', views.add_record),

    # Patient
    path('patient/my-records/', views.my_records),
    path('patient/grant-access/', views.patient_grant_access),
    path('patient/revoke-access/', views.patient_revoke_access),
    path('patient/pending-requests/', views.pending_requests),
    path('patient/approve-request/<int:request_id>/', views.approve_request),
    path('patient/reject-request/<int:request_id>/', views.reject_request),

    # Doctor
    path('doctor/request-access/', views.doctor_request_access),
    path('doctor/patient/<str:health_id>/', views.doctor_view_record),
    path('doctor/break-glass/', views.break_glass),
]
