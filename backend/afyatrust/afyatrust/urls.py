from django.contrib import admin
from django.urls import path, include
from api import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    # Public metadata endpoint. It exposes hashes only, never clinical payloads.
    path('exchange/<str:record_hash>/', views.exchange_record),
]