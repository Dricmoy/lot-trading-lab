import hashlib
import json
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import Account, AuthThrottle
from .views import resolve_account, serialize_account

User = get_user_model()


def body(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise ValidationError("Check the form and try again.") from None
    if not isinstance(data, dict):
        raise ValidationError("Check the form and try again.")
    return data


def invalid(exc, status=400):
    return JsonResponse({"error": " ".join(exc.messages)}, status=status)


def user_info(user):
    return {"name": user.first_name, "email": user.email} if user.is_authenticated else None


def auth_response(request, current=None):
    response = JsonResponse({"user": user_info(request.user), "account": serialize_account(current) if current else None})
    response["Cache-Control"] = "no-store"
    response.delete_cookie("lot_account")
    return response


def limited(request, action, identity="", maximum=10):
    # Use the server-provided peer address, never an arbitrary client header.
    address = request.META.get("REMOTE_ADDR", "unknown")
    for suffix, limit in [(address, 40), (identity or address, maximum)]:
        key = hashlib.sha256(f"{action}:{suffix}".encode()).hexdigest()
        now = timezone.now()
        with transaction.atomic():
            record, _ = AuthThrottle.objects.select_for_update().get_or_create(key=key, defaults={"started_at": now})
            if record.started_at < now - timedelta(minutes=15):
                record.started_at, record.attempts = now, 0
            record.attempts += 1
            record.save(update_fields=["started_at", "attempts"])
            if record.attempts > limit:
                response = JsonResponse({"error": "Too many attempts. Please try again in 15 minutes."}, status=429)
                response["Retry-After"] = "900"
                return response
    return None


def email_value(data):
    email = data.get("email", "")
    if not isinstance(email, str):
        raise ValidationError("Enter a valid email address.")
    email = email.strip().lower()
    validate_email(email)
    if len(email) > 150:
        raise ValidationError("Use an email address with 150 characters or fewer.")
    return email


def password_value(data, user):
    password = data.get("password")
    if not isinstance(password, str) or len(password) > 256:
        raise ValidationError("Enter a password between 10 and 256 characters.")
    validate_password(password, user=user)
    return password


@require_GET
@ensure_csrf_cookie
def session(request):
    current = resolve_account(request) if request.user.is_authenticated else None
    response = JsonResponse({"user": user_info(request.user), "account": serialize_account(current) if current else None})
    response["Cache-Control"] = "no-store"
    return response


@require_POST
def signup(request):
    if request.user.is_authenticated:
        return JsonResponse({"error": "Sign out before creating another account."}, status=409)
    try:
        data = body(request)
        email = email_value(data)
        name = data.get("name", "")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            raise ValidationError("Enter your name, up to 100 characters.")
        user = User(username=email, email=email, first_name=name.strip())
        password = password_value(data, user)
    except ValidationError as exc:
        return invalid(exc)
    blocked = limited(request, "signup", email, 5)
    if blocked is not None:
        return blocked
    try:
        with transaction.atomic():
            user.set_password(password)
            user.save()
            guest = resolve_account(request)
            current = Account.objects.select_for_update().filter(pk=guest.pk, user__isnull=True).first() if guest else None
            if current:
                current.user = user
                current.save(update_fields=["user"])
            else:
                current = Account.objects.create(user=user, watchlist=["NVDA", "AAPL", "MSFT", "AMZN"])
    except IntegrityError:
        return JsonResponse({"error": "That email already has an account. Sign in to continue."}, status=409)
    login(request, user)
    request.session.pop("lot_private_account", None)
    request.session.set_expiry(settings.SESSION_COOKIE_AGE)
    return auth_response(request, current)


@require_POST
def signin(request):
    try:
        data = body(request)
        email = email_value(data)
        password = data.get("password", "")
        if not isinstance(password, str) or len(password) > 256:
            raise ValidationError("Check your email and password.")
    except ValidationError as exc:
        return invalid(exc)
    blocked = limited(request, "login", email)
    if blocked is not None:
        return blocked
    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({"error": "The email or password is incorrect."}, status=401)
    login(request, user)
    request.session.pop("lot_private_account", None)
    request.session.set_expiry(settings.SESSION_COOKIE_AGE if data.get("remember", True) else 0)
    return auth_response(request, resolve_account(request))


@require_POST
def signout(request):
    logout(request)
    return auth_response(request)


@require_POST
def change_password(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Sign in to change your password."}, status=401)
    blocked = limited(request, "password", request.user.username)
    if blocked is not None:
        return blocked
    try:
        data = body(request)
        old = data.get("current_password")
        if not isinstance(old, str) or not request.user.check_password(old):
            raise ValidationError("Your current password is incorrect.")
        password = password_value(data, request.user)
    except ValidationError as exc:
        return invalid(exc)
    request.user.set_password(password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    return JsonResponse({"message": "Your password has been changed."})


@require_POST
def forgot_password(request):
    try:
        email = email_value(body(request))
    except ValidationError as exc:
        return invalid(exc)
    blocked = limited(request, "forgot", email, 3)
    if blocked is not None:
        return blocked
    if not settings.DEBUG and settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend" and not settings.EMAIL_HOST:
        return JsonResponse({"error": "Password recovery is temporarily unavailable. Please try again later."}, status=503)
    user = User.objects.filter(username=email, is_active=True).first()
    if user and user.has_usable_password():
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.PUBLIC_APP_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
        try:
            send_mail("Reset your Lot password", f"Hi {user.first_name},\n\nUse this link to choose a new password:\n{link}\n\nThe link expires in one hour and can be used once. If you didn't request it, you can ignore this email.\n\nLot", settings.DEFAULT_FROM_EMAIL, [email])
        except Exception:
            return JsonResponse({"error": "We couldn't send the email. Please try again later."}, status=503)
    return JsonResponse({"message": "If an account uses that email, a reset link is on its way."})


@require_POST
def reset_password(request):
    try:
        data = body(request)
        uid, token = data.get("uid", ""), data.get("token", "")
        if not isinstance(uid, str) or not isinstance(token, str):
            raise ValidationError("This reset link is invalid or has expired. Request a new one.")
        with transaction.atomic():
            try:
                user = User.objects.select_for_update().get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
            except (ValueError, TypeError, OverflowError, User.DoesNotExist):
                raise ValidationError("This reset link is invalid or has expired. Request a new one.") from None
            if not default_token_generator.check_token(user, token):
                raise ValidationError("This reset link is invalid or has expired. Request a new one.")
            password = password_value(data, user)
            user.set_password(password)
            user.save(update_fields=["password"])
    except ValidationError as exc:
        return invalid(exc)
    logout(request)
    return JsonResponse({"message": "Your password has been reset. Sign in with your new password."})
