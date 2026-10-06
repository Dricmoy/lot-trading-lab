import json
import secrets
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings
from django.core import signing
from django.db import connection, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .models import Account
from .market import is_owner, market_headers, owner_id
from .services import SYMBOLS
from .services import OrderError, create_account, place_order


def resolve_account(request):
    private_id = request.session.get("lot_private_account")
    if private_id and owner_id() and private_id == str(owner_id()):
        return Account.objects.filter(id=private_id).first()
    if request.user.is_authenticated:
        current, _ = Account.objects.get_or_create(user=request.user)
        return current
    try:
        account_id = signing.loads(request.COOKIES.get("lot_account", ""), salt="lot-account", max_age=60 * 60 * 24 * 30)
        return Account.objects.get(id=account_id, user__isnull=True)
    except (signing.BadSignature, Account.DoesNotExist, ValueError):
        return None


def serialize_order(order):
    return {
        "id": str(order.id),
        "symbol": order.symbol,
        "side": order.side,
        "kind": order.kind,
        "requested": order.requested,
        "executed": order.executed,
        "total": order.total,
        "status": order.status,
        "result": order.result,
        "created_at": order.created_at.isoformat(),
    }


def serialize_account(account):
    return {
        "id": str(account.id),
        "cash": account.cash,
        "watchlist": account.watchlist,
        "market_source": "alpaca-iex" if is_owner(account) else "simulated",
        "positions": list(account.positions.filter(quantity__gt=0).values("symbol", "quantity", "cost")),
        "orders": [serialize_order(order) for order in account.orders.all()[:50]],
    }


@require_GET
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return JsonResponse({"status": "ok", "service": "Django ledger", "market_data": "simulated"})


@require_GET
@ensure_csrf_cookie
def account(request):
    current = resolve_account(request) or create_account()
    return account_response(current)


def account_response(current):
    response = JsonResponse(serialize_account(current))
    response.set_cookie(
        "lot_account",
        signing.dumps(str(current.id), salt="lot-account"),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        max_age=60 * 60 * 24 * 30,
    )
    response["Cache-Control"] = "no-store"
    return response


@require_POST
def orders(request):
    current = resolve_account(request)
    if not current:
        return JsonResponse({"error": "Open a practice account to continue."}, status=401)
    try:
        data = json.loads(request.body)
        order, replayed = place_order(current.id, data, request.headers.get("Idempotency-Key"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    except OrderError as exc:
        return JsonResponse({"error": str(exc)}, status=exc.status)
    current.refresh_from_db()
    return JsonResponse(
        {"order": serialize_order(order), "account": serialize_account(current), "replayed": replayed}, status=200 if replayed else 201
    )


@require_POST
def reset(request):
    current = resolve_account(request)
    if not current:
        return JsonResponse({"error": "Open a practice account to continue."}, status=401)
    with transaction.atomic():
        current = Account.objects.select_for_update().get(id=current.id)
        current.orders.all().delete()
        current.positions.all().delete()
        current.cash = 10000000
        current.save(update_fields=["cash"])
    return JsonResponse(serialize_account(current))


@require_POST
def preferences(request):
    current = resolve_account(request)
    if not current:
        return JsonResponse({"error": "Open a practice account first."}, status=401)
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid request."}, status=400)
    watchlist = data.get("watchlist") if isinstance(data, dict) else None
    if not isinstance(watchlist, list) or len(watchlist) > len(SYMBOLS) or any(not isinstance(s, str) or s not in SYMBOLS for s in watchlist):
        return JsonResponse({"error": "Choose supported stocks for your watchlist."}, status=400)
    current.watchlist = list(dict.fromkeys(watchlist))
    current.save(update_fields=["watchlist"])
    return JsonResponse({"watchlist": current.watchlist})


@require_POST
def connect(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    token = data.get("token") if isinstance(data, dict) else None
    if not owner_id() or not isinstance(token, str) or not secrets.compare_digest(token, settings.LOT_OWNER_ACCESS_TOKEN):
        return JsonResponse({"error": "Private access token is invalid."}, status=403)
    current, _ = Account.objects.get_or_create(id=owner_id(), defaults={"cash": 10000000})
    request.session["lot_private_account"] = str(current.id)
    return account_response(current)


@require_GET
def market(request):
    current = resolve_account(request)
    if not current:
        return JsonResponse({"error": "Load your account before requesting market data."}, status=401)
    symbol = request.GET.get("symbol", "NVDA")
    if symbol not in SYMBOLS:
        return JsonResponse({"error": "Unknown symbol."}, status=400)
    upstream = Request(settings.MATCHING_ENGINE_URL + "?" + urlencode({"symbol": symbol}), headers=market_headers(current))
    try:
        with urlopen(upstream, timeout=25) as result:
            response = JsonResponse(json.load(result))
    except (HTTPError, URLError, TimeoutError, ValueError):
        response = JsonResponse({"error": "Market data unavailable. Trading paused; please retry."}, status=503)
    response["Cache-Control"] = "private, no-store"
    return response
