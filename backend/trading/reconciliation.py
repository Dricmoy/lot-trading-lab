"""Read-only checks. Do not print identities, balances, journal text, or credentials."""
from django.db import transaction
from .models import Account, LedgerEntry, OrderMovement, ReplaySession
from .services import reservations
from .replay import reconstruct, fingerprint, reserved


def reconcile():
    problems = []
    counts = {"accounts": 0, "orders": 0, "replays": 0}
    for account_id in Account.objects.values_list("id", flat=True).iterator():
        with transaction.atomic():
            account = Account.objects.select_for_update().get(id=account_id)
            counts["accounts"] += 1
            movements = list(LedgerEntry.objects.filter(account=account).values("cash_delta", "cash_after", "created_at"))
            movements += list(OrderMovement.objects.filter(account=account).values("cash_delta", "cash_after", "created_at"))
            cash = account.cash_anchor
            for movement in sorted(movements, key=lambda m: m["created_at"]):
                cash += movement["cash_delta"]
                if cash != movement["cash_after"]:
                    problems.append("cash movement chain")
            if cash != account.cash:
                problems.append("cash anchor reconciliation")
            held_cash, held_shares = reservations(account)
            if held_cash > cash or cash < 0:
                problems.append("cash reservation bounds")
            positions = {p.symbol: p for p in account.positions.all()}
            if any(p.cost < 0 or p.quantity < 0 for p in positions.values()) or any(q > (positions[s].quantity if s in positions else 0) for s, q in held_shares.items()):
                problems.append("position or share reservation bounds")
            for order in account.orders.all():
                counts["orders"] += 1
                fills = order.result.get("fills", [])
                if sum(f["quantity"] for f in fills) != order.executed or sum(f["quantity"] * f["price"] for f in fills) != order.total:
                    problems.append("order fill totals")
                ledger = LedgerEntry.objects.filter(order=order, account=account).first()
                delta = (ledger.cash_delta if ledger else 0) + sum(order.movements.values_list("cash_delta", flat=True))
                if not ledger or delta != (-order.total if order.side == "buy" else order.total):
                    problems.append("order ledger totals")
    for session_id in ReplaySession.objects.values_list("id", flat=True).iterator():
        with transaction.atomic():
            session = ReplaySession.objects.select_for_update().get(id=session_id)
            counts["replays"] += 1
            try:
                state = reconstruct(session)
                if fingerprint(state) != fingerprint(session.state):
                    problems.append("replay event reconstruction")
                held_cash, held_shares = reserved(state)
                if state["cash"] < held_cash or state["shares"] < held_shares:
                    problems.append("replay reservation bounds")
            except (ValueError, KeyError, TypeError):
                problems.append("replay event reconstruction")
    return counts, problems
