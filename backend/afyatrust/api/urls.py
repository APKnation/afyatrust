from django.urls import path
from . import views

urlpatterns = [
    # Registration + login
    path("register/", views.register_patient),
    path("login/", views.login),
    path("add-record/", views.add_record),

    # Patient (JWT required)
    path("patient/my-records/", views.my_records),
    path("patient/requests/", views.my_requests),
    path("patient/grant-access/", views.grant_access),
    path("patient/revoke-access/", views.revoke_access),
    path("patient/approve-request/<int:request_id>/", views.approve_request),
    path("patient/reject-request/<int:request_id>/", views.reject_request),

    # Doctor
    path("doctor/register/", views.doctor_register),
    path("doctor/status/", views.doctor_status),
    path("doctor/request-access/", views.request_access),
    path("doctor/pending-requests/", views.doctor_pending_requests),
    path("doctor/patient/<str:health_id>/", views.doctor_view_record),
    path("doctor/break-glass/", views.break_glass),
]
