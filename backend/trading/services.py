import hashlib
import json
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction

from .market import market_headers
from .models import Account, LedgerEntry, Order, Position

SYMBOLS = {"HOOD", "NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "COIN"}


class OrderError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def create_account():
    with transaction.atomic():
        account = Account.objects.create(cash=7552815, watchlist=["NVDA", "AAPL", "MSFT", "AMZN"])
        # A seeded, explicitly simulated portfolio with a $100,000 cost basis.
        for symbol, quantity, cost in [("HOOD", 80, 874400), ("NVDA", 60, 990000), ("AAPL", 25, 582785)]:
            Position.objects.create(account=account, symbol=symbol, quantity=quantity, cost=cost)
        return account


def execute(payload, account=None):
    request = Request(settings.MATCHING_ENGINE_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", **market_headers(account)})
    try:
        with urlopen(request, timeout=25) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise OrderError("Trading is temporarily unavailable. No funds were changed. Please try again.", 503) from exc


def place_order(account_id, data, key):
    try:
        key = uuid.UUID(key)
    except (ValueError, TypeError, AttributeError) as exc:
        raise OrderError("A valid Idempotency-Key is required.") from exc
    if not isinstance(data, dict):
        raise OrderError("Order must be a JSON object.")
    symbol, side, kind, quantity = (data.get(k) for k in ["symbol", "side", "kind", "quantity"])
    limit = data.get("limit", 0)
    if not all(isinstance(value, str) for value in (symbol, side, kind)):
        raise OrderError("Symbol, side, and order type must be strings.")
    if symbol not in SYMBOLS or side not in ("buy", "sell") or kind not in ("market", "limit"):
        raise OrderError("Choose a supported symbol, side, and order type.")
    if type(quantity) is not int or not 1 <= quantity <= 10000:
        raise OrderError("Enter a whole number between 1 and 10,000 shares.")
    if type(limit) is not int or (kind == "limit" and not 1 <= limit <= 100000000):
        raise OrderError("Enter a valid limit price.")
    payload = dict(symbol=symbol, side=side, kind=kind, quantity=quantity, limit=limit if kind == "limit" else 0)
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    with transaction.atomic():
        account = Account.objects.select_for_update().get(id=account_id)
        existing = account.orders.filter(key=key).first()
        if existing:
            if existing.fingerprint != fingerprint:
                raise OrderError("This request key was already used for a different order.", 409)
            return existing, True
        position = account.positions.filter(symbol=symbol).first()
        if side == "sell" and (not position or position.quantity < quantity):
            raise OrderError("You do not own enough shares. Short selling is not supported.")
        result = execute(payload, account)
        fills = result.get("fills", [])
        executed = sum(fill["quantity"] for fill in fills)
        total = sum(fill["quantity"] * fill["price"] for fill in fills)
        if executed != result.get("quantity") or total != result.get("total") or not 0 <= executed <= quantity or total < 0:
            raise OrderError("We couldn't complete this trade. No funds were changed. Please try again.", 503)
        if side == "buy" and total > account.cash:
            raise OrderError("Not enough buying power for this order.")
        delta = -total if side == "buy" else total
        if executed:
            if not position:
                position = Position(account=account, symbol=symbol)
            if side == "buy":
                position.quantity += executed
                position.cost += total
            else:
                position.cost -= position.cost * executed // position.quantity
                position.quantity -= executed
            position.save()
            account.cash += delta
            account.save(update_fields=["cash"])
        order = Order.objects.create(
            account=account,
            key=key,
            fingerprint=fingerprint,
            symbol=symbol,
            side=side,
            kind=kind,
            requested=quantity,
            executed=executed,
            total=total,
            status=result["status"],
            result=result,
        )
        LedgerEntry.objects.create(account=account, order=order, cash_delta=delta, cash_after=account.cash)
        return order, False
