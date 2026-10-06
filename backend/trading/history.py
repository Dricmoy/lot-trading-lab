"""Observed account valuations, not invented historical performance."""
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .models import Account, PortfolioSnapshot


def record_snapshot(account_id, market):
    prices = {asset["symbol"]: asset["price"] for asset in market.get("assets", []) if type(asset.get("price")) is int and asset["price"] > 0}
    if not prices:
        return
    bucket = timezone.now().replace(second=0, microsecond=0)
    with transaction.atomic():
        account = Account.objects.select_for_update().get(id=account_id)
        positions = list(account.positions.filter(quantity__gt=0).values("symbol", "quantity", "cost"))
        if any(p["symbol"] not in prices for p in positions):
            return
        value = account.cash + sum(p["quantity"] * prices[p["symbol"]] for p in positions)
        PortfolioSnapshot.objects.update_or_create(account=account, epoch=account.history_epoch, bucket=bucket,
                                                   defaults={"cash": account.cash, "value": value, "positions": positions, "prices": prices})


def portfolio_history(account, days=7):
    query = account.snapshots.filter(epoch=account.history_epoch, bucket__gte=timezone.now() - timedelta(days=days))
    rows = list(query.order_by("-bucket")[:5000])[::-1]
    if not rows:
        return {"points": [], "since": None, "return": 0, "benchmark_return": 0, "drawdown": 0, "limited": False}
    first = rows[0]
    peak = first.value
    drawdown = 0
    points = []
    for row in rows:
        benchmark = first.cash + sum(p["quantity"] * row.prices.get(p["symbol"], first.prices[p["symbol"]]) for p in first.positions)
        peak = max(peak, row.value)
        drawdown = max(drawdown, (peak - row.value) / max(1, peak) * 100)
        points.append({"time": row.bucket.isoformat(), "value": row.value, "benchmark": benchmark})
    stride = max(1, len(points) // 240)
    shown = points[::stride]
    if shown[-1] != points[-1]:
        shown.append(points[-1])
    return {"points": shown, "since": first.bucket.isoformat(), "return": (rows[-1].value - first.value) / max(1, first.value) * 100,
            "benchmark_return": (points[-1]["benchmark"] - first.value) / max(1, first.value) * 100,
            "drawdown": drawdown, "limited": query.count() > 5000,
            "definition": "Holding comparison keeps the cash and share quantities from the first shown observation; no earlier prices are reconstructed."}
