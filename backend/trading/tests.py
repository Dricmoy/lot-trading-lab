import json
import uuid
from unittest.mock import patch

from django.core import signing
from django.db import IntegrityError, transaction
from django.test import Client, TestCase

from .models import Account, LedgerEntry, Order
from .services import OrderError, create_account, place_order


def execution(quantity=2, price=12000, status="filled"):
    return {
        "fills": [{"quantity": quantity, "price": price}] if quantity else [],
        "quantity": quantity,
        "total": quantity * price,
        "status": status,
        "duration_us": 4,
        "book": {"bids": [], "asks": []},
        "algorithm": "price-time",
    }


class AccountingTests(TestCase):
    def setUp(self):
        self.account = create_account()
        self.payload = {"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 2}

    def order(self, payload=None, key=None):
        return place_order(self.account.id, payload or self.payload, key or str(uuid.uuid4()))

    @patch("backend.trading.services.execute", return_value=execution())
    def test_buy_updates_cash_position_and_ledger(self, _):
        before = self.account.cash
        order, replayed = self.order()
        self.account.refresh_from_db()
        self.assertEqual(self.account.cash, before - 24000)
        self.assertEqual(self.account.positions.get(symbol="HOOD").quantity, 82)
        self.assertEqual(self.account.positions.get(symbol="HOOD").cost, 898400)
        self.assertEqual(LedgerEntry.objects.get(order=order).cash_delta, -24000)
        self.assertFalse(replayed)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_idempotency_does_not_trade_twice(self, engine):
        key = str(uuid.uuid4())
        first, _ = self.order(key=key)
        second, replayed = self.order(key=key)
        self.assertEqual(first.id, second.id)
        self.assertTrue(replayed)
        self.assertEqual(engine.call_count, 1)
        self.assertEqual(LedgerEntry.objects.count(), 1)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_reused_key_rejects_different_payload(self, _):
        key = str(uuid.uuid4())
        self.order(key=key)
        with self.assertRaises(OrderError) as error:
            self.order({**self.payload, "quantity": 3}, key=key)
        self.assertEqual(error.exception.status, 409)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_insufficient_cash_rolls_back(self, _):
        self.account.cash = 10
        self.account.save()
        with self.assertRaisesMessage(OrderError, "Not enough buying power"):
            self.order()
        self.account.refresh_from_db()
        self.assertEqual(self.account.cash, 10)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(self.account.positions.get(symbol="HOOD").quantity, 80)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_sell_reduces_cost_basis_and_adds_cash(self, _):
        before = self.account.cash
        self.order({**self.payload, "side": "sell"})
        self.account.refresh_from_db()
        p = self.account.positions.get(symbol="HOOD")
        self.assertEqual(p.quantity, 78)
        self.assertEqual(p.cost, 852540)
        self.assertEqual(self.account.cash, before + 24000)

    def test_no_short_sales(self):
        with self.assertRaises(OrderError):
            self.order({**self.payload, "side": "sell", "quantity": 81})

    @patch("backend.trading.services.execute", return_value=execution(1, status="partial"))
    def test_partial_execution_debits_only_filled_shares(self, _):
        before = self.account.cash
        order, _ = self.order()
        self.account.refresh_from_db()
        self.assertEqual(order.executed, 1)
        self.assertEqual(self.account.cash, before - 12000)

    @patch("backend.trading.services.execute", return_value=execution(0, status="cancelled"))
    def test_non_crossing_limit_preserves_funds(self, _):
        before = self.account.cash
        self.order({**self.payload, "kind": "limit", "limit": 1})
        self.account.refresh_from_db()
        self.assertEqual(self.account.cash, before)
        self.assertEqual(self.account.positions.get(symbol="HOOD").quantity, 80)

    @patch("backend.trading.services.execute", side_effect=OrderError("offline", 503))
    def test_engine_failure_leaves_no_order_or_cash_change(self, _):
        before = self.account.cash
        with self.assertRaises(OrderError):
            self.order()
        self.account.refresh_from_db()
        self.assertEqual(self.account.cash, before)
        self.assertEqual(Order.objects.count(), 0)

    def test_rejects_malformed_quantities(self):
        for quantity in [0, -1, True, "2", 1.5, 10001]:
            with self.subTest(quantity=quantity), self.assertRaises(OrderError):
                self.order({**self.payload, "quantity": quantity})

    def test_rejects_non_string_order_fields(self):
        for field in ("symbol", "side", "kind"):
            with self.subTest(field=field), self.assertRaises(OrderError):
                self.order({**self.payload, field: []})

    def test_database_prevents_negative_cash(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Account.objects.filter(id=self.account.id).update(cash=-1)


class APITests(TestCase):
    def test_separate_browsers_receive_separate_accounts(self):
        a = Client().get("/api/account").json()
        b = Client().get("/api/account").json()
        self.assertNotEqual(a["id"], b["id"])

    def test_cookie_restores_same_account(self):
        client = Client()
        a = client.get("/api/account").json()
        b = client.get("/api/account").json()
        self.assertEqual(a["id"], b["id"])

    def test_unsigned_account_cookie_cannot_access_account(self):
        account = create_account()
        client = Client()
        client.cookies["lot_account"] = str(account.id)
        self.assertNotEqual(client.get("/api/account").json()["id"], str(account.id))

    def test_csrf_is_required_for_orders(self):
        client = Client(enforce_csrf_checks=True)
        client.get("/api/account")
        self.assertEqual(client.post("/api/orders", "{}", content_type="application/json").status_code, 403)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_csrf_protected_trade_round_trip(self, _):
        client = Client(enforce_csrf_checks=True)
        client.get("/api/account")
        response = client.post(
            "/api/orders",
            json.dumps({"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 2}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
            HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["account"]["orders"]), 1)

    def test_reset_is_scoped_to_account(self):
        first, second = create_account(), create_account()
        client = Client()
        client.cookies["lot_account"] = signing.dumps(str(first.id), salt="lot-account")
        result = client.post("/api/reset").json()
        self.assertEqual(result["cash"], 10000000)
        self.assertEqual(result["positions"], [])
        self.assertEqual(second.positions.count(), 3)


class PrivateMarketTests(TestCase):
    token = "owner-token-with-more-than-thirty-two-characters"

    def test_private_connect_requires_token_and_keeps_demo_separate(self):
        with self.settings(LOT_OWNER_ACCESS_TOKEN=self.token):
            client = Client()
            demo = client.get("/api/account").json()
            self.assertEqual(client.post("/api/connect", {"token": "wrong"}, content_type="application/json").status_code, 403)
            private = client.post("/api/connect", {"token": self.token}, content_type="application/json").json()
            self.assertNotEqual(demo["id"], private["id"])
            self.assertEqual(private["market_source"], "alpaca-iex")
            self.assertEqual(private["cash"], 10000000)
            self.assertEqual(private["positions"], [])
            again = client.post("/api/connect", {"token": self.token}, content_type="application/json").json()
            self.assertEqual(again["id"], private["id"])
            self.assertEqual(client.get("/api/account").json()["market_source"], "alpaca-iex")
            self.assertEqual(Client().get("/api/account").json()["market_source"], "simulated")

    def test_connect_disabled_and_csrf_protected(self):
        self.assertEqual(Client().post("/api/connect", {}, content_type="application/json").status_code, 403)
        client = Client(enforce_csrf_checks=True)
        client.get("/api/account")
        self.assertEqual(client.post("/api/connect", {"token": self.token}, content_type="application/json").status_code, 403)

    @patch("backend.trading.views.urlopen")
    def test_market_proxy_never_forwards_public_headers(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = b'{"source":"simulated"}'
        client = Client()
        self.assertEqual(client.get("/api/market").status_code, 401)
        client.get("/api/account")
        self.assertEqual(client.get("/api/market?symbol=INVALID").status_code, 400)
        result = client.get("/api/market?symbol=HOOD", HTTP_X_LOT_MARKET_TOKEN="forged")
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("X-lot-market-token", upstream.call_args.args[0].headers)
        self.assertEqual(result.headers["Cache-Control"], "private, no-store")

    @patch("backend.trading.services.execute", return_value=execution())
    def test_private_orders_use_owner_feed(self, engine):
        from .market import market_headers, owner_id
        with self.settings(LOT_OWNER_ACCESS_TOKEN=self.token):
            owner = Account.objects.create(id=owner_id())
            place_order(owner.id, {"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 2}, str(uuid.uuid4()))
            self.assertTrue(market_headers(engine.call_args.args[1]))
            self.assertEqual(market_headers(create_account()), {})
