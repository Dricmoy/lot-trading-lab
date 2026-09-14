from django.urls import path
from backend.trading import views

urlpatterns = [
    path("api/health", views.health),
    path("api/market", views.market),
    path("api/connect", views.connect),
    path("api/account", views.account),
    path("api/orders", views.orders),
    path("api/reset", views.reset),
]
