from django.urls import path
from . import views

urlpatterns = [
    # Usajili
    path('register/', views.register_patient),
    path('add-record/', views.add_record),
    
    # Mgonjwa
    path('patient/my-records/', views.my_records),
    path('patient/grant-access/', views.patient_grant_access),
    path('patient/revoke-access/', views.patient_revoke_access),
    path('patient/pending-requests/', views.pending_requests),
    path('patient/approve-request/<int:request_id>/', views.approve_request),
    path('patient/reject-request/<int:request_id>/', views.reject_request),
    
    # Daktari
    path('doctor/request-access/', views.doctor_request_access),
    path('doctor/patient/<str:health_id>/', views.doctor_view_record),
    path('doctor/break-glass/', views.break_glass),
]