import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from django.core import signing
from django.db import connections
from django.test import Client, TestCase, TransactionTestCase, skipUnlessDBFeature

from .models import Account, LedgerEntry, OrderMovement, ReplaySession
from .replay import CATALOG, FRICTION, LAST_STEP, apply, initial_state, metrics, prices, reserved, reconstruct
from .services import OrderError, create_account, place_order, reservations, settle_orders
from .tests import execution
from .reconciliation import reconcile


class ReplayTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.account = self.client.get("/api/account").json()
        self.session = self.client.post("/api/replay", {"scenario": "steady-climb", "friction": "standard"}, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).json()["session"]

    def action(self, action, key=None, **data):
        response = self.client.post(f"/api/replay/{self.session['id']}", {"action": action, "revision": self.session["revision"], **data}, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()))
        if response.status_code == 200:
            self.session = response.json()["session"]
        return response

    def test_only_observed_prices_and_news_are_returned(self):
        self.assertEqual(len(self.session["prices"]), 1)
        self.assertEqual(len(self.session["news"]), 1)
        self.action("advance", count=5)
        self.assertEqual(len(self.session["prices"]), 6)
        self.assertTrue(all(n["step"] <= 5 for n in self.session["news"]))
        self.assertNotIn("news", self.client.get("/api/replay").json()["scenarios"][0])

    def test_order_retry_and_conflicting_key(self):
        key, revision = str(uuid.uuid4()), self.session["revision"]
        payload = {"side": "buy", "kind": "market", "quantity": 50, "reason": "small entry"}
        self.assertEqual(self.action("order", key, **payload).status_code, 200)
        first = self.session
        self.session = {**first, "revision": revision}
        retry = self.action("order", key, **payload)
        self.assertTrue(retry.json()["replayed"])
        self.assertEqual(self.session, first)
        self.session = {**first, "revision": revision}
        self.assertEqual(self.action("order", key, **{**payload, "quantity": 51}).status_code, 409)
        saved = ReplaySession.objects.get(id=first["id"])
        self.assertEqual(reconstruct(saved), saved.state)
        self.assertEqual(saved.account.cash, self.account["cash"])

    def test_stale_revision_cannot_advance(self):
        self.action("advance")
        self.session["revision"] = 0
        self.assertEqual(self.action("advance").status_code, 409)
        self.assertEqual(ReplaySession.objects.get(id=self.session["id"]).state["step"], 1)

    def test_reserved_cash_and_shares_release(self):
        self.action("order", side="buy", kind="limit", quantity=10, limit=9000, reason="wait for lower price")
        self.assertEqual(self.session["reserved_cash"], 90020)
        order = self.session["orders"][0]
        self.action("cancel", order_id=order["id"])
        self.assertEqual(self.session["reserved_cash"], 0)
        self.action("order", side="buy", kind="market", quantity=20, reason="entry")
        self.action("order", side="sell", kind="limit", quantity=20, limit=12000, reason="exit target")
        self.assertEqual(self.action("order", side="sell", kind="market", quantity=1, reason="double sell").status_code, 400)
        self.action("finish")
        self.assertEqual(self.session["reserved_shares"], 0)
        self.assertEqual(self.session["orders"][-1]["status"], "expired")

    def test_share_defaults_to_private_notes_and_is_revocable(self):
        self.action("order", side="buy", kind="market", quantity=20, reason="private plan")
        self.action("reflect", order_id=self.session["orders"][0]["id"], reflection="private reflection")
        self.assertEqual(self.action("share").status_code, 400)
        self.action("finish")
        self.action("share")
        url = "/api/replay/shared/" + self.session["share_url"].split("/")[-1]
        public = Client().get(url).json()["session"]
        self.assertIsNone(public["id"])
        self.assertEqual(public["orders"][0]["reason"], "")
        self.assertEqual(public["orders"][0]["reflection"], "")
        self.action("share", include_notes=True)
        self.assertEqual(Client().get(url).json()["session"]["orders"][0]["reason"], "private plan")
        self.action("unshare")
        self.assertEqual(Client().get(url).status_code, 404)
        saved = ReplaySession.objects.get(id=self.session["id"])
        self.assertEqual(saved.state, reconstruct(saved))

    def test_ownership_and_csrf(self):
        other = Client()
        other.get("/api/account")
        self.assertEqual(other.get(f"/api/replay/{self.session['id']}").status_code, 404)
        secure = Client(enforce_csrf_checks=True)
        secure.get("/api/account")
        self.assertEqual(secure.post("/api/replay", "{}", content_type="application/json").status_code, 403)
        self.assertEqual(other.post("/api/learning-metrics").status_code, 403)

    def test_start_is_idempotent_and_malformed_inputs_are_rejected(self):
        key = str(uuid.uuid4())
        args = dict(content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        body = {"scenario": "volatile-open", "friction": "light"}
        first = self.client.post("/api/replay", body, **args)
        self.assertEqual(first.json()["session"]["id"], self.client.post("/api/replay", body, **args).json()["session"]["id"])
        self.assertEqual(self.client.post("/api/replay", {**body, "friction": "standard"}, **args).status_code, 409)
        self.assertEqual(self.client.post("/api/replay", {"scenario": []}, **args).status_code, 400)
        self.assertEqual(self.action("order", side="buy", kind="market", quantity=True, reason="x").status_code, 400)
        self.assertEqual(self.action("order", side="buy", kind="market", quantity=1, reason="").status_code, 400)
        self.assertEqual(self.action("advance", count=100).status_code, 400)

    def test_all_scenarios_and_friction_preserve_accounting(self):
        for scenario in CATALOG:
            for friction in FRICTION:
                with self.subTest(scenario=scenario, friction=friction):
                    state = initial_state(scenario, friction)
                    apply(state, {"action": "order", "side": "buy", "kind": "limit", "quantity": 990, "limit": 10080, "reason": "partial order"}, scenario)
                    for step in range(LAST_STEP):
                        apply(state, {"action": "advance"}, scenario)
                        cash, shares = reserved(state)
                        self.assertGreaterEqual(state["cash"], cash)
                        self.assertGreaterEqual(state["shares"], shares)
                        m = metrics(state, prices(scenario))
                        self.assertEqual(m["value"] - 10000000, m["realized"] + m["unrealized"])
                        self.assertEqual(state["shares"], sum(o["executed"] for o in state["orders"]))
                    self.assertTrue(state["finished"])
                    self.assertEqual(reserved(state), (0, 0))

    def test_shared_liquidity_does_not_regenerate_per_click(self):
        self.action("order", side="buy", kind="market", quantity=100, reason="first")
        self.action("order", side="buy", kind="market", quantity=100, reason="second")
        self.assertEqual(self.session["shares"], 100)
        self.assertEqual(self.session["orders"][1]["executed"], 0)
        self.action("advance")
        self.action("order", side="buy", kind="market", quantity=100, reason="next")
        self.assertEqual(self.session["shares"], 200)


class RestingTests(TestCase):
    def setUp(self):
        self.account = create_account()
        self.payload = {"symbol": "HOOD", "side": "buy", "kind": "limit", "quantity": 3, "limit": 12000, "time_in_force": "gtc", "reason": "target"}

    @patch("backend.trading.services.execute")
    def test_continuation_fills_reservations_and_reconciliation(self, engine):
        engine.return_value = execution(1, status="partial")
        with patch("backend.trading.services.time.time", return_value=0):
            order, _ = place_order(self.account.id, self.payload, str(uuid.uuid4()))
        self.assertEqual(reservations(self.account)[0], 24000)
        engine.return_value = execution(2)
        with patch("backend.trading.services.time.time", return_value=30):
            settle_orders(self.account.id)
            settle_orders(self.account.id)
        order.refresh_from_db()
        self.assertEqual(order.executed, 3)
        self.assertEqual(order.status, "filled")
        self.assertEqual(engine.call_count, 2)
        self.assertEqual(LedgerEntry.objects.count(), 1)
        self.assertEqual(OrderMovement.objects.count(), 1)
        self.assertEqual(reservations(self.account), (0, {}))
        self.assertEqual(reconcile()[1], [])

    @patch("backend.trading.services.execute", side_effect=lambda *args: execution(0, status="cancelled"))
    def test_pending_orders_cannot_reserve_same_cash_or_shares(self, _):
        self.account.cash = self.account.cash_anchor = 36000
        self.account.save()
        place_order(self.account.id, self.payload, str(uuid.uuid4()))
        with self.assertRaises(OrderError):
            place_order(self.account.id, self.payload, str(uuid.uuid4()))
        sell = {**self.payload, "side": "sell", "quantity": 80, "limit": 20000}
        place_order(self.account.id, sell, str(uuid.uuid4()))
        with self.assertRaises(OrderError):
            place_order(self.account.id, {**sell, "quantity": 1}, str(uuid.uuid4()))

    @patch("backend.trading.services.execute")
    def test_invalid_fills_roll_back(self, engine):
        for result in [[], execution(4), execution(1, 12001), {**execution(), "fills": [{"quantity": True, "price": 12000}]}]:
            with self.subTest(result=result):
                engine.return_value = result
                with self.assertRaises(OrderError):
                    place_order(self.account.id, self.payload, str(uuid.uuid4()))
                self.assertEqual(self.account.orders.count(), 0)

    @patch("backend.trading.services.execute", return_value=execution(0, status="cancelled"))
    def test_cancel_and_journal_are_owned(self, _):
        order, _ = place_order(self.account.id, self.payload, str(uuid.uuid4()))
        client = Client()
        client.cookies["lot_account"] = signing.dumps(str(self.account.id), salt="lot-account")
        response = client.post("/api/orders/cancel", {"order_id": str(order.id)}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["account"]["reserved_cash"], 0)
        self.assertEqual(client.post("/api/orders/cancel", {"order_id": str(order.id)}, content_type="application/json").status_code, 200)
        self.assertEqual(client.post("/api/orders/journal", {"order_id": str(order.id), "reflection": "learned"}, content_type="application/json").status_code, 200)
        other = Client()
        other.get("/api/account")
        self.assertEqual(other.post("/api/orders/journal", {"order_id": str(order.id), "reflection": "overwrite"}, content_type="application/json").status_code, 404)

    @patch("backend.trading.news_provider.urlopen")
    def test_public_news_never_contacts_provider(self, upstream):
        client = Client()
        client.get("/api/account")
        self.assertFalse(client.get("/api/news?symbol=HOOD").json()["available"])
        upstream.assert_not_called()


class PostgreSQLConcurrencyTests(TransactionTestCase):
    """Only PostgreSQL can provide the row-lock evidence; SQLite skips these."""
    def workers(self, function):
        def isolated(_):
            try:
                return function()
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=4) as pool:
            return list(pool.map(isolated, range(4)))

    @skipUnlessDBFeature("has_select_for_update")
    @patch("backend.trading.services.execute", return_value=execution())
    def test_concurrent_identical_retries_trade_once(self, engine):
        account = Account.objects.create(cash=24000, cash_anchor=24000)
        payload = {"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 2}
        key = str(uuid.uuid4())
        results = self.workers(lambda: place_order(account.id, payload, key))
        self.assertEqual(len({o.id for o, _ in results}), 1)
        self.assertEqual(engine.call_count, 1)
        account.refresh_from_db()
        self.assertEqual(account.cash, 0)
        self.assertEqual(reconcile()[1], [])

    @skipUnlessDBFeature("has_select_for_update")
    @patch("backend.trading.services.execute", return_value=execution())
    def test_concurrent_distinct_orders_cannot_overspend(self, _):
        account = Account.objects.create(cash=24000, cash_anchor=24000)
        payload = {"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 2}
        def order():
            try:
                place_order(account.id, payload, str(uuid.uuid4()))
                return "filled"
            except OrderError:
                return "rejected"
        self.assertEqual(self.workers(order).count("filled"), 1)
        account.refresh_from_db()
        self.assertEqual(account.cash, 0)
        self.assertEqual(account.orders.count(), 1)
        self.assertEqual(reconcile()[1], [])

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_replay_actions_require_current_revision(self):
        account = create_account()
        session = ReplaySession.objects.create(account=account, scenario="steady-climb", start_key=uuid.uuid4(), start_fingerprint="", state=initial_state("steady-climb", "standard"))
        cookie = signing.dumps(str(account.id), salt="lot-account")
        def advance():
            client = Client()
            client.cookies["lot_account"] = cookie
            return client.post(f"/api/replay/{session.id}", json.dumps({"action": "advance", "revision": 0}), content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code
        results = self.workers(advance)
        self.assertEqual(results.count(200), 1)
        self.assertEqual(results.count(409), 3)
        session.refresh_from_db()
        self.assertEqual(session.state["step"], 1)
        self.assertEqual(session.state, reconstruct(session))

    @skipUnlessDBFeature("has_select_for_update")
    @patch("backend.trading.services.execute", return_value=execution())
    def test_concurrent_sales_cannot_sell_the_same_shares(self, _):
        from .models import Position
        account = Account.objects.create(cash=10000, cash_anchor=10000)
        Position.objects.create(account=account, symbol="HOOD", quantity=2, cost=20000)
        payload = {"symbol": "HOOD", "side": "sell", "kind": "market", "quantity": 2}
        def sell():
            try:
                place_order(account.id, payload, str(uuid.uuid4()))
                return "filled"
            except OrderError:
                return "rejected"
        self.assertEqual(self.workers(sell).count("filled"), 1)
        account.refresh_from_db()
        self.assertEqual(account.positions.get(symbol="HOOD").quantity, 0)
        self.assertEqual(reconcile()[1], [])

    @skipUnlessDBFeature("has_select_for_update")
    @patch("backend.trading.services.execute", side_effect=lambda *args: execution(0, status="cancelled"))
    def test_concurrent_resting_buys_cannot_reserve_the_same_cash(self, _):
        account = Account.objects.create(cash=36000, cash_anchor=36000)
        payload = {"symbol": "HOOD", "side": "buy", "kind": "limit", "quantity": 3, "limit": 12000, "time_in_force": "gtc"}
        def reserve():
            try:
                place_order(account.id, payload, str(uuid.uuid4()))
                return "open"
            except OrderError:
                return "rejected"
        self.assertEqual(self.workers(reserve).count("open"), 1)
        self.assertEqual(reservations(account)[0], 36000)
        self.assertEqual(reconcile()[1], [])

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_replay_retries_apply_one_event(self):
        account = create_account()
        session = ReplaySession.objects.create(account=account, scenario="steady-climb", start_key=uuid.uuid4(), start_fingerprint="", state=initial_state("steady-climb", "standard"))
        cookie, key = signing.dumps(str(account.id), salt="lot-account"), str(uuid.uuid4())
        def advance():
            client = Client()
            client.cookies["lot_account"] = cookie
            response = client.post(f"/api/replay/{session.id}", {"action": "advance", "revision": 0}, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
            return response.status_code, response.json().get("replayed")
        results = self.workers(advance)
        self.assertTrue(all(status == 200 for status, _ in results))
        self.assertEqual(sum(replayed for _, replayed in results), 3)
        session.refresh_from_db()
        self.assertEqual(session.state["step"], 1)
        self.assertEqual(session.events.count(), 1)
        self.assertEqual(session.state, reconstruct(session))
