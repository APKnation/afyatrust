from django.contrib import admin
from django.urls import path, include
from api import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    # The metadata_uri stored ON-CHAIN is
    # https://api.<facility>.afyatrust.network/exchange/<hash> — root level,
    # no /api prefix — so serve it here too (same view as /api/exchange/).
    path('exchange/<str:record_hash>/', views.exchange_record),
]