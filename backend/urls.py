from django.urls import path
from backend.trading import views
from backend.trading import auth
from backend.trading import replay
from backend.trading import news

urlpatterns = [
    path("api/replay", replay.collection),
    path("api/replay/<uuid:session_id>", replay.detail),
    path("api/replay/shared/<uuid:token>", replay.shared),
    path("api/learning-metrics", replay.learning_metrics),
    path("api/auth/session", auth.session),
    path("api/auth/signup", auth.signup),
    path("api/auth/login", auth.signin),
    path("api/auth/logout", auth.signout),
    path("api/auth/password", auth.change_password),
    path("api/auth/forgot", auth.forgot_password),
    path("api/auth/reset", auth.reset_password),
    path("api/preferences", views.preferences),
    path("api/orders/settle", views.settle),
    path("api/orders/cancel", views.cancel),
    path("api/orders/journal", views.journal),
    path("api/portfolio/history", views.history),
    path("api/news", news.news),
    path("api/health", views.health),
    path("api/market", views.market),
    path("api/connect", views.connect),
    path("api/account", views.account),
    path("api/orders", views.orders),
    path("api/reset", views.reset),
]
