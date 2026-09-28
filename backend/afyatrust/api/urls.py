from django.urls import path
from . import views

urlpatterns = [
    # Registration + login
    path("register/", views.register_patient),
    path("login/", views.login),
    path("add-record/", views.add_record),
    path("facility/records/", views.facility_records),
    path("hospitals/", views.list_hospitals),
    path("account/change-secret/", views.change_secret),

    # Patient (JWT required)
    path("patient/my-records/", views.my_records),
    path("patient/measurements/", views.my_measurements),
    path("patient/referrals/", views.my_referrals),
    path("patient/referrals/send/", views.patient_send_referral),
    path("patient/requests/", views.my_requests),
    path("patient/grant-access/", views.grant_access),
    path("patient/revoke-access/", views.revoke_access),
    path("patient/approve-request/<int:request_id>/", views.approve_request),
    path("patient/reject-request/<int:request_id>/", views.reject_request),

    # Hospital staff (JWT required; admin-created accounts)
    path("staff/referrals/", views.hospital_referrals),
    path("staff/referrals/<int:referral_id>/respond/", views.respond_referral),

    # Doctor (JWT required; admin-created accounts)
    path("doctor/me/", views.doctor_me),
    path("doctor/status/", views.doctor_status),
    path("doctor/request-access/", views.request_access),
    path("doctor/pending-requests/", views.doctor_pending_requests),
    path("doctor/patients/", views.doctor_patients),
    path("doctor/measurements/<str:health_id>/", views.patient_measurements),
    path("doctor/measurements/", views.add_measurement),
    path("doctor/referrals/", views.doctor_referrals),
    path("doctor/referrals/incoming/", views.doctor_incoming_referrals),
    path("doctor/patient/<str:health_id>/", views.doctor_view_record),
    path("doctor/break-glass/", views.break_glass),
]
