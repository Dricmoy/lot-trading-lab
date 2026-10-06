from django.urls import path
from backend.trading import views
from backend.trading import auth

urlpatterns = [
    path("api/auth/session", auth.session),
    path("api/auth/signup", auth.signup),
    path("api/auth/login", auth.signin),
    path("api/auth/logout", auth.signout),
    path("api/auth/password", auth.change_password),
    path("api/auth/forgot", auth.forgot_password),
    path("api/auth/reset", auth.reset_password),
    path("api/preferences", views.preferences),
    path("api/health", views.health),
    path("api/market", views.market),
    path("api/connect", views.connect),
    path("api/account", views.account),
    path("api/orders", views.orders),
    path("api/reset", views.reset),
]
