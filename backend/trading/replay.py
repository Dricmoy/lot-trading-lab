"""Server-authoritative synthetic replay. No future prices enter a response."""
import hashlib
import json
import math
import uuid
from copy import deepcopy

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import Account, ReplayEvent, ReplaySession
from .services import OrderError
from .views import resolve_account

STARTING_CASH = 10000000
LAST_STEP = 59
FRICTION = {
    "light": {"label": "Light", "spread_bps": 4, "latency_bps": 0, "fee_bps": 0},
    "standard": {"label": "Standard", "spread_bps": 12, "latency_bps": 3, "fee_bps": 2},
    "challenging": {"label": "Challenging", "spread_bps": 30, "latency_bps": 8, "fee_bps": 5},
}
CATALOG = {
    "steady-climb": {
        "title": "A steady climb", "description": "Practice sizing a position as confidence builds.",
        "lesson": "How much of your cash will you commit, and why?", "tone": "Measured", "duration": "4 minutes",
        "news": [(0, "The session opens", "The fictional Lot Company starts a new trading day."),
                 (14, "Demand strengthens", "The scenario desk reports improving demand for the company's products."),
                 (32, "Forecast reiterated", "Management repeats its earlier outlook; the market weighs what is already priced in."),
                 (47, "The closing stretch", "Activity continues as participants review their positions before the close.")],
    },
    "sudden-selloff": {
        "title": "A sudden selloff", "description": "Practice responding when your original thesis changes.",
        "lesson": "What evidence would make you change your plan?", "tone": "Eventful", "duration": "4 minutes",
        "news": [(0, "A quiet opening", "The fictional Lot Company opens with no new announcement."),
                 (20, "Guidance revised", "A fictional company update lowers its near-term demand forecast."),
                 (35, "Uncertainty continues", "Participants disagree about how long the slowdown could last."),
                 (49, "A response from management", "Management outlines a response, with the outcome still uncertain.")],
    },
    "volatile-open": {
        "title": "A volatile opening", "description": "Practice patience and limit orders in a moving market.",
        "lesson": "How will you control the price you are willing to pay?", "tone": "Fast moving", "duration": "4 minutes",
        "news": [(0, "A busy opening", "The fictional Lot Company begins a session with heightened interest."),
                 (10, "Conflicting expectations", "Scenario participants interpret the same update differently."),
                 (28, "Volume settles", "Opening activity eases as participants reassess their orders."),
                 (46, "Into the afternoon", "The scenario desk reports a calmer afternoon following the busy opening.")],
    },
}


def clock(step):
    minute = 570 + round(step * 390 / LAST_STEP)
    return f"{minute // 60:02}:{minute % 60:02}"


def prices(scenario):
    path = []
    for step in range(LAST_STEP + 1):
        t = step / LAST_STEP
        if scenario == "steady-climb":
            value = 10000 + 980 * t + 75 * math.sin(step * .53) + 28 * math.sin(step * 1.81)
        elif scenario == "sudden-selloff":
            value = 10000 + min(step, 19) * 8 - max(0, min(step - 19, 7)) * 165 + max(0, step - 35) * 11 + 40 * math.sin(step * .72)
        else:
            value = 10000 + 480 * math.sin(step * .8) * math.exp(-step / 25) + 4 * step + 40 * math.sin(step * .31)
        path.append(round(value))
    path[0] = 10000
    return path


def fingerprint(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def request_data(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise OrderError("Check the request and try again.") from None
    if not isinstance(data, dict):
        raise OrderError("Check the request and try again.")
    return data


def request_key(request):
    try:
        return uuid.UUID(request.headers.get("Idempotency-Key", ""))
    except (ValueError, AttributeError):
        raise OrderError("A valid Idempotency-Key is required.") from None


def text(value, label, required=False):
    if not isinstance(value, str) or len(value) > 1200 or (required and not value.strip()):
        raise OrderError(f"Enter {label}, up to 1,200 characters.")
    return value.strip()


def open_orders(state):
    return [o for o in state["orders"] if o["status"] in ("open", "partial") and o["remaining"] > 0]


def fee(gross, bps):
    return (gross * bps + 9999) // 10000


def reserved(state, exclude=None):
    cash = shares = 0
    for order in open_orders(state):
        if order["id"] == exclude:
            continue
        if order["side"] == "buy":
            cash += order["remaining"] * (order["limit"] + fee(order["limit"], FRICTION[state["friction"]]["fee_bps"]))
        else:
            shares += order["remaining"]
    return cash, shares


def point(state, path):
    value = state["cash"] + state["shares"] * path[state["step"]]
    entry = {"step": state["step"], "time": clock(state["step"]), "value": value}
    if not state["history"] or state["history"][-1] != entry:
        state["history"].append(entry)


def try_fill(state, order, path):
    settings = FRICTION[state["friction"]]
    mid = path[state["step"]]
    adjustment = max(1, (mid * settings["spread_bps"] + 19999) // 20000) + (mid * settings["latency_bps"] + 9999) // 10000
    price = mid + adjustment if order["side"] == "buy" else mid - adjustment
    if order["kind"] == "limit" and ((order["side"] == "buy" and price > order["limit"]) or (order["side"] == "sell" and price < order["limit"])):
        return
    # Shared per-side liquidity is consumed within this virtual moment, not regenerated per click.
    available = 100 + (state["step"] * 17) % 90 - state["liquidity"][order["side"]]
    quantity = min(order["remaining"], max(0, available))
    if not quantity:
        return
    gross = quantity * price
    charge = fee(gross, settings["fee_bps"])
    cash_reserved, shares_reserved = reserved(state, order["id"])
    if order["side"] == "buy":
        if gross + charge > state["cash"] - cash_reserved:
            return
        state["cash"] -= gross + charge
        state["shares"] += quantity
        state["cost"] += gross + charge
    else:
        if quantity > state["shares"] - shares_reserved:
            return
        released = state["cost"] * quantity // state["shares"]
        state["shares"] -= quantity
        state["cost"] -= released
        state["cash"] += gross - charge
        pnl = gross - charge - released
        state["realized"] += pnl
        order["realized"] += pnl
    state["liquidity"][order["side"]] += quantity
    order["executed"] += quantity
    order["remaining"] -= quantity
    order["total"] += gross
    order["fees"] += charge
    order["fills"].append({"step": state["step"], "time": clock(state["step"]), "price": price, "quantity": quantity, "fee": charge, "mid": mid})
    order["status"] = "filled" if not order["remaining"] else "partial"


def metrics(state, path):
    value = state["cash"] + state["shares"] * path[state["step"]]
    peak = STARTING_CASH
    drawdown = 0
    for p in state["history"]:
        peak = max(peak, p["value"])
        drawdown = max(drawdown, (peak - p["value"]) / peak * 100)
    benchmark_shares = STARTING_CASH // path[0]
    benchmark_cash = STARTING_CASH - benchmark_shares * path[0]
    baseline = benchmark_cash + benchmark_shares * path[state["step"]]
    return {"value": value, "return": (value - STARTING_CASH) / STARTING_CASH * 100,
            "benchmark_value": baseline, "benchmark_return": (baseline - STARTING_CASH) / STARTING_CASH * 100,
            "difference": value - baseline, "drawdown": drawdown, "realized": state["realized"],
            "unrealized": state["shares"] * path[state["step"]] - state["cost"],
            "fees": sum(o["fees"] for o in state["orders"]), "trades": sum(o["executed"] > 0 for o in state["orders"])}


def serialize(session, public=False):
    state = deepcopy(session.state)
    path = prices(session.scenario)
    definition = CATALOG[session.scenario]
    if public and not session.share_notes:
        for order in state["orders"]:
            order["reason"] = order["reflection"] = ""
    cash_reserved, shares_reserved = reserved(state)
    return {"id": str(session.id) if not public else None, "scenario": session.scenario,
            "scenario_version": session.scenario_version, "title": definition["title"], "lesson": definition["lesson"],
            **state, "price": path[state["step"]], "clock": clock(state["step"]), "last_step": LAST_STEP,
            "prices": [{"step": i, "time": clock(i), "price": p} for i, p in enumerate(path[:state["step"] + 1])],
            "news": [{"step": step, "time": clock(step), "title": title, "body": body, "source": "Lot scenario desk"}
                     for step, title, body in definition["news"] if step <= state["step"]],
            "reserved_cash": cash_reserved, "reserved_shares": shares_reserved,
            "metrics": metrics(state, path), "assumptions": FRICTION[state["friction"]],
            "share_url": f"/s/{session.shared_token}" if session.shared_token else None,
            "notes_shared": session.share_notes, "created_at": session.created_at.isoformat()}


def reply(data, status=200):
    response = JsonResponse(data, status=status)
    response["Cache-Control"] = "private, no-store"
    return response


def finish(state):
    for order in open_orders(state):
        order["status"] = "expired"
    state["finished"] = True


def apply(state, data, scenario, order_id=None):
    action = data.get("action")
    path = prices(scenario)
    if state["finished"] and action not in ("reflect", "share", "unshare"):
        raise OrderError("This session is finished. Try the scenario again to practice a different approach.", 409)
    if action == "advance":
        count = data.get("count", 1)
        if type(count) is not int or not 1 <= count <= 5:
            raise OrderError("Advance between one and five moments.")
        for _ in range(count):
            if state["step"] >= LAST_STEP:
                break
            state["step"] += 1
            state["liquidity"] = {"buy": 0, "sell": 0}
            for order in open_orders(state):
                try_fill(state, order, path)
            point(state, path)
        if state["step"] == LAST_STEP:
            finish(state)
    elif action == "order":
        if len(state["orders"]) >= 100:
            raise OrderError("This session has reached its 100-order limit. Finish it or start another.", 429)
        side, kind, quantity, limit = data.get("side"), data.get("kind"), data.get("quantity"), data.get("limit", 0)
        if side not in ("buy", "sell") or kind not in ("market", "limit") or type(quantity) is not int or not 1 <= quantity <= 10000:
            raise OrderError("Choose a side and between 1 and 10,000 whole shares.")
        if type(limit) is not int or (kind == "limit" and not 1 <= limit <= 100000000):
            raise OrderError("Enter a valid limit price.")
        reason = text(data.get("reason", ""), "your reason for this trade", True)
        cash_reserved, shares_reserved = reserved(state)
        if side == "sell" and quantity > state["shares"] - shares_reserved:
            raise OrderError("You do not have enough available shares. Cancel an open sell order to release its reservation.")
        order = {"id": str(order_id or uuid.uuid4()), "step": state["step"], "time": clock(state["step"]), "side": side, "kind": kind,
                 "requested": quantity, "remaining": quantity, "executed": 0, "limit": limit if kind == "limit" else 0,
                 "total": 0, "fees": 0, "realized": 0, "status": "open", "fills": [], "reason": reason, "reflection": ""}
        if side == "buy":
            setting = FRICTION[state["friction"]]
            worst = limit if kind == "limit" else path[state["step"]] + max(1, (path[state["step"]] * setting["spread_bps"] + 19999) // 20000) + (path[state["step"]] * setting["latency_bps"] + 9999) // 10000
            gross = quantity * worst
            required = quantity * (worst + fee(worst, setting["fee_bps"])) if kind == "limit" else gross + fee(gross, setting["fee_bps"])
            if required > state["cash"] - cash_reserved:
                raise OrderError("Not enough available cash for this order and its modeled fees.")
        state["orders"].append(order)
        try_fill(state, order, path)
        if kind == "market" and order["remaining"]:
            order["status"] = "partial_cancelled" if order["executed"] else "cancelled"
        point(state, path)
    elif action in ("cancel", "reflect"):
        order = next((o for o in state["orders"] if o["id"] == data.get("order_id")), None)
        if not order:
            raise OrderError("This order was not found.", 404)
        if action == "cancel":
            if order not in open_orders(state):
                raise OrderError("This order is no longer open.", 409)
            order["status"] = "cancelled"
        else:
            order["reflection"] = text(data.get("reflection", ""), "a reflection")
    elif action == "finish":
        finish(state)
    elif action in ("share", "unshare"):
        if not state["finished"]:
            raise OrderError("Finish the session before sharing a recap.")
        if action == "share" and type(data.get("include_notes", False)) is not bool:
            raise OrderError("Choose whether to share your journal notes.")
    else:
        raise OrderError("Choose a supported replay action.")
    state["revision"] += 1


def initial_state(scenario, friction):
    state = {"cash": STARTING_CASH, "shares": 0, "cost": 0, "realized": 0, "step": 0, "revision": 0,
             "finished": False, "friction": friction, "orders": [], "history": [], "liquidity": {"buy": 0, "sell": 0}}
    point(state, prices(scenario))
    return state


def reconstruct(session):
    state = initial_state(session.scenario, session.state["friction"])
    for event in session.events.order_by("created_at", "id"):
        if event.fingerprint != fingerprint(event.payload) or event.payload.get("revision") != state["revision"]:
            raise ValueError("Replay action fingerprint or revision differs.")
        apply(state, event.payload, session.scenario, uuid.uuid5(session.id, str(event.key)))
    return state


@require_http_methods(["GET", "POST"])
def collection(request):
    account = resolve_account(request)
    if not account:
        return reply({"error": "Open a practice workspace first."}, 401)
    if request.method == "GET":
        catalog = [{"id": key, **{k: v for k, v in item.items() if k != "news"}} for key, item in CATALOG.items()]
        # Select small JSON scalars rather than loading every journal/history blob.
        rows = account.replays.order_by("-created_at").values("id", "scenario", "created_at", "state__step", "state__finished", "state__cash", "state__shares")[:200]
        sessions = [{"id": str(s["id"]), "scenario": s["scenario"], "title": CATALOG[s["scenario"]]["title"], "step": s["state__step"],
                     "finished": s["state__finished"], "return": (s["state__cash"] + s["state__shares"] * prices(s["scenario"])[s["state__step"]] - STARTING_CASH) / STARTING_CASH * 100,
                     "created_at": s["created_at"].isoformat()} for s in rows]
        return reply({"scenarios": catalog, "sessions": sessions, "friction": FRICTION})
    try:
        data, key = request_data(request), request_key(request)
        scenario, friction = data.get("scenario"), data.get("friction", "standard")
        if not isinstance(scenario, str) or not isinstance(friction, str) or scenario not in CATALOG or friction not in FRICTION:
            raise OrderError("Choose an available scenario and execution setting.")
        digest = fingerprint(data)
        with transaction.atomic():
            Account.objects.select_for_update().get(id=account.id)
            session = account.replays.filter(start_key=key).first()
            if session and session.start_fingerprint != digest:
                raise OrderError("This request key was used for a different session.", 409)
            if not session:
                if account.replays.count() >= 200:
                    raise OrderError("Your workspace has reached 200 saved sessions. Resume an existing session.", 429)
                state = initial_state(scenario, friction)
                session = ReplaySession.objects.create(account=account, scenario=scenario, start_key=key, start_fingerprint=digest, state=state)
        return reply({"session": serialize(session)}, 201)
    except OrderError as exc:
        return reply({"error": str(exc)}, exc.status)


@require_http_methods(["GET", "POST"])
def detail(request, session_id):
    account = resolve_account(request)
    if not account:
        return reply({"error": "Open a practice workspace first."}, 401)
    try:
        if request.method == "GET":
            session = ReplaySession.objects.get(id=session_id, account=account)
            return reply({"session": serialize(session)})
        data, key = request_data(request), request_key(request)
        digest = fingerprint(data)
        with transaction.atomic():
            session = ReplaySession.objects.select_for_update().get(id=session_id, account=account)
            event = session.events.filter(key=key).first()
            if event:
                if event.fingerprint != digest:
                    raise OrderError("This request key was used for a different action.", 409)
            else:
                if type(data.get("revision")) is not int or data["revision"] != session.state["revision"]:
                    raise OrderError("This session changed in another tab. Reload it before continuing.", 409)
                if session.events.count() >= 1000:
                    raise OrderError("This session has reached its action limit.", 429)
                apply(session.state, data, session.scenario, uuid.uuid5(session.id, str(key)))
                if data["action"] == "share":
                    session.shared_token = session.shared_token or uuid.uuid4()
                    session.share_notes = data.get("include_notes", False)
                elif data["action"] == "unshare":
                    session.shared_token = None
                    session.share_notes = False
                session.save()
                ReplayEvent.objects.create(session=session, key=key, fingerprint=digest, action=data["action"], payload=data)
        return reply({"session": serialize(session), "replayed": bool(event)})
    except ReplaySession.DoesNotExist:
        return reply({"error": "This session was not found in your workspace."}, 404)
    except OrderError as exc:
        return reply({"error": str(exc)}, exc.status)


@require_GET
def shared(request, token):
    session = ReplaySession.objects.filter(shared_token=token).first()
    if not session or not session.state["finished"]:
        return reply({"error": "This recap is unavailable or its sharing link was revoked."}, 404)
    return reply({"session": serialize(session, public=True)})


@require_POST
def learning_metrics(request):
    # Only the configured owner can inspect aggregate learning activity.
    from .market import is_owner
    account = resolve_account(request)
    if not account or not is_owner(account):
        return reply({"error": "Private workspace required."}, 403)
    sessions = ReplaySession.objects.all()
    starts = sessions.count()
    first_trades = finishes = full_days = returns = 0
    account_counts = {}
    for s in sessions.iterator():
        first_trades += any(o["executed"] for o in s.state["orders"])
        finishes += s.state["finished"]
        full_days += s.state["finished"] and s.state["step"] == LAST_STEP
        account_counts[s.account_id] = account_counts.get(s.account_id, 0) + 1
    returns = sum(count > 1 for count in account_counts.values())
    return reply({"starts": starts, "sessions_with_fills": first_trades, "finished": finishes, "full_day_finishes": full_days, "early_finishes": finishes - full_days,
                  "workspaces_with_repeat_sessions": returns, "unique_workspaces": len(account_counts),
                  "note": "Counts describe workspaces, including disposable verification sessions; they are not verified people or retention cohorts."})
