import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = not bool(os.getenv("VERCEL"))
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "local-development-only-lot-secret")
if not DEBUG and (not os.getenv("DJANGO_SECRET_KEY") or not os.getenv("DATABASE_URL")):
    raise RuntimeError("Production requires DJANGO_SECRET_KEY and DATABASE_URL")
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,.vercel.app,testserver").split(",")
ROOT_URLCONF = "backend.urls"
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "backend.trading"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]
DATABASES = {"default": dj_database_url.config(default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}", conn_max_age=0)}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
CSRF_COOKIE_SECURE = not DEBUG
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173" if DEBUG else "").split(",")
    if origin
]
production_host = os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
MATCHING_ENGINE_URL = os.getenv(
    "MATCHING_ENGINE_URL", f"https://{production_host}/api/engine" if production_host else "http://127.0.0.1:8001/api/engine"
)

LOT_OWNER_ACCESS_TOKEN = os.getenv("LOT_OWNER_ACCESS_TOKEN", "")

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_COOKIE_NAME = "lot_session"
PASSWORD_RESET_TIMEOUT = 60 * 60
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.filebased.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend")
EMAIL_FILE_PATH = BASE_DIR / ".mailbox"
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "true").lower() == "true"
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Lot <accounts@localhost>")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", f"https://{production_host}" if production_host else "http://127.0.0.1:5173")
