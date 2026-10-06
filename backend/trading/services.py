import hashlib
import json
import uuid
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction

from .market import market_headers
from .models import Account, LedgerEntry, Order, OrderMovement, Position

SYMBOLS = {"HOOD", "NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "COIN"}


class OrderError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def create_account():
    with transaction.atomic():
        account = Account.objects.create(cash=7552815, cash_anchor=7552815, watchlist=["NVDA", "AAPL", "MSFT", "AMZN"])
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


def validated_execution(result, requested, side, limit=0):
    message = "Execution data was invalid. No funds were changed. Please try again."
    if not isinstance(result, dict):
        raise OrderError(message, 503)
    fills = result.get("fills", [])
    if not isinstance(fills, list) or any(not isinstance(f, dict) or type(f.get("quantity")) is not int or type(f.get("price")) is not int or f["quantity"] <= 0 or f["price"] <= 0 for f in fills):
        raise OrderError(message, 503)
    quantity = sum(f["quantity"] for f in fills)
    total = sum(f["quantity"] * f["price"] for f in fills)
    if type(result.get("quantity")) is not int or type(result.get("total")) is not int or quantity != result["quantity"] or total != result["total"] or quantity > requested:
        raise OrderError(message, 503)
    if limit and any((side == "buy" and f["price"] > limit) or (side == "sell" and f["price"] < limit) for f in fills):
        raise OrderError(message, 503)
    expected_status = "filled" if quantity == requested else "partial" if quantity else "cancelled"
    if result.get("status") != expected_status:
        raise OrderError(message, 503)
    return quantity, total, fills


def place_order(account_id, data, key):
    try:
        key = uuid.UUID(key)
    except (ValueError, TypeError, AttributeError) as exc:
        raise OrderError("A valid Idempotency-Key is required.") from exc
    if not isinstance(data, dict):
        raise OrderError("Order must be a JSON object.")
    symbol, side, kind, quantity = (data.get(k) for k in ["symbol", "side", "kind", "quantity"])
    limit = data.get("limit", 0)
    time_in_force = data.get("time_in_force", "ioc")
    reason = data.get("reason", "")
    if not all(isinstance(value, str) for value in (symbol, side, kind)):
        raise OrderError("Symbol, side, and order type must be strings.")
    if symbol not in SYMBOLS or side not in ("buy", "sell") or kind not in ("market", "limit"):
        raise OrderError("Choose a supported symbol, side, and order type.")
    if type(quantity) is not int or not 1 <= quantity <= 10000:
        raise OrderError("Enter a whole number between 1 and 10,000 shares.")
    if type(limit) is not int or (kind == "limit" and not 1 <= limit <= 100000000):
        raise OrderError("Enter a valid limit price.")
    if time_in_force not in ("ioc", "gtc") or (kind == "market" and time_in_force != "ioc"):
        raise OrderError("Market orders execute immediately; only limit orders can stay open.")
    if not isinstance(reason, str) or len(reason) > 1200:
        raise OrderError("Keep your trade reason under 1,200 characters.")
    payload = dict(symbol=symbol, side=side, kind=kind, quantity=quantity, limit=limit if kind == "limit" else 0)
    canonical = {**payload}
    if time_in_force != "ioc" or reason:
        canonical.update(time_in_force=time_in_force, reason=reason.strip())
    fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    with transaction.atomic():
        account = Account.objects.select_for_update().get(id=account_id)
        existing = account.orders.filter(key=key).first()
        if existing:
            if existing.fingerprint != fingerprint:
                raise OrderError("This request key was already used for a different order.", 409)
            return existing, True
        position = account.positions.filter(symbol=symbol).first()
        held_cash, held_shares = reservations(account)
        if side == "sell" and (not position or position.quantity - held_shares.get(symbol, 0) < quantity):
            raise OrderError("You do not own enough shares. Short selling is not supported.")
        if time_in_force == "gtc":
            if open_orders(account).count() >= 20:
                raise OrderError("Cancel an open limit order before adding another. Your workspace supports 20 open orders.")
            if side == "buy" and quantity * limit > account.cash - held_cash:
                raise OrderError("Not enough available cash to reserve this limit order.")
        result = execute(payload, account)
        executed, total, fills = validated_execution(result, quantity, side, payload["limit"])
        if side == "buy" and total > account.cash - held_cash:
            raise OrderError("Not enough buying power for this order.")
        delta = -total if side == "buy" else total
        realized = 0
        if executed:
            if not position:
                position = Position(account=account, symbol=symbol)
            if side == "buy":
                position.quantity += executed
                position.cost += total
            else:
                released = position.cost * executed // position.quantity
                realized = total - released
                position.cost -= released
                position.quantity -= executed
            position.save()
            account.cash += delta
            account.save(update_fields=["cash"])
        if time_in_force == "gtc" and executed < quantity:
            result["status"] = "partial" if executed else "open"
        result["checked_bucket"] = int(time.time()) // 15
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
            limit=payload["limit"], time_in_force=time_in_force, reason=reason.strip(), realized=realized,
        )
        LedgerEntry.objects.create(account=account, order=order, cash_delta=delta, cash_after=account.cash)
        account.revision += 1
        account.save(update_fields=["revision"])
        return order, False


def open_orders(account):
    return account.orders.filter(time_in_force="gtc", status__in=["open", "partial"])


def reservations(account, exclude=None):
    cash, shares = 0, {}
    for order in open_orders(account):
        if order.id == exclude:
            continue
        remaining = order.requested - order.executed
        if order.side == "buy":
            cash += remaining * order.limit
        else:
            shares[order.symbol] = shares.get(order.symbol, 0) + remaining
    return cash, shares


def settle_orders(account_id):
    """Evaluate at most one eligible resting order per call, once per quote bucket."""
    with transaction.atomic():
        account = Account.objects.select_for_update().get(id=account_id)
        bucket = int(time.time()) // 15
        candidates = sorted(open_orders(account), key=lambda o: (o.result.get("checked_bucket", 0), o.created_at))
        order = next((o for o in candidates if o.result.get("checked_bucket", 0) < bucket), None)
        if not order:
            return account
        remaining = order.requested - order.executed
        result = execute(dict(symbol=order.symbol, side=order.side, kind="limit", quantity=remaining, limit=order.limit), account)
        quantity, total, fills = validated_execution(result, remaining, order.side, order.limit)
        held_cash, held_shares = reservations(account, order.id)
        position = account.positions.filter(symbol=order.symbol).first()
        if order.side == "buy" and total > account.cash - held_cash:
            raise OrderError("Reserved buying power was unavailable. No funds were changed.", 409)
        if order.side == "sell" and (not position or quantity > position.quantity - held_shares.get(order.symbol, 0)):
            raise OrderError("Reserved shares were unavailable. No funds were changed.", 409)
        if quantity:
            if not position:
                position = Position(account=account, symbol=order.symbol)
            if order.side == "buy":
                position.quantity += quantity
                position.cost += total
                delta = -total
            else:
                released = position.cost * quantity // position.quantity
                position.cost -= released
                position.quantity -= quantity
                order.realized = (order.realized or 0) + total - released
                delta = total
            position.save()
            account.cash += delta
            account.save(update_fields=["cash"])
            OrderMovement.objects.create(account=account, order=order, quantity=quantity, total=total, cash_delta=delta, cash_after=account.cash)
            order.executed += quantity
            order.total += total
            order.result["fills"] += fills
        order.status = "filled" if order.executed == order.requested else "partial" if order.executed else "open"
        order.result.update(quantity=order.executed, total=order.total, status=order.status, checked_bucket=bucket, book=result.get("book", {}))
        order.save(update_fields=["result", "executed", "total", "status", "realized"])
        account.revision += 1
        account.save(update_fields=["revision"])
        return account
