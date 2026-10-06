import json
import re
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.test import Client, TestCase, override_settings

from .models import Account
from .tests import execution


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AuthenticationTests(TestCase):
    password = "PracticeRiver!5820"

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.client.get("/api/auth/session")

    def post(self, path, data, client=None, **headers):
        client = client or self.client
        return client.post(path, json.dumps(data), content_type="application/json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value, **headers)

    def register(self, email="alex@example.test", client=None):
        return self.post("/api/auth/signup", {"name": "Alex", "email": email, "password": self.password}, client)

    def test_register_hashes_password_and_opens_cash_account(self):
        result = self.register()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["account"]["cash"], 10000000)
        self.assertEqual(result.json()["account"]["positions"], [])
        user = get_user_model().objects.get(username="alex@example.test")
        self.assertNotEqual(user.password, self.password)
        self.assertTrue(user.check_password(self.password))
        self.assertTrue(self.client.cookies["lot_session"]["httponly"])

    def test_authentication_requires_csrf(self):
        for route in ["signup", "login", "logout", "forgot", "reset", "password"]:
            result = self.client.post(f"/api/auth/{route}", "{}", content_type="application/json")
            self.assertEqual(result.status_code, 403)

    def test_logout_blocks_old_registered_account_cookie(self):
        identity = self.register().json()["account"]["id"]
        self.post("/api/auth/logout", {})
        self.client.cookies["lot_account"] = signing.dumps(identity, salt="lot-account")
        self.assertEqual(self.post("/api/orders", {}).status_code, 401)
        guest = self.client.get("/api/account").json()
        self.assertNotEqual(guest["id"], identity)

    @patch("backend.trading.services.execute", return_value=execution())
    def test_trades_and_watchlist_restore_across_sessions(self, _):
        original = self.register().json()["account"]["id"]
        trade = self.post("/api/orders", {"symbol": "AAPL", "side": "buy", "kind": "market", "quantity": 2}, HTTP_IDEMPOTENCY_KEY="cf65a70a-96df-4e5d-a40c-2d15b1dff8f0")
        self.assertEqual(trade.status_code, 201)
        self.post("/api/preferences", {"watchlist": ["AAPL", "TSLA"]})
        self.post("/api/auth/logout", {})
        restored = self.post("/api/auth/login", {"email": "ALEX@example.test", "password": self.password}).json()
        self.assertEqual(restored["account"]["id"], original)
        self.assertEqual(restored["account"]["cash"], 9976000)
        self.assertEqual(restored["account"]["positions"][0]["quantity"], 2)
        self.assertEqual(len(restored["account"]["orders"]), 1)
        self.assertEqual(restored["account"]["watchlist"], ["AAPL", "TSLA"])

    def test_other_identity_is_isolated_even_with_copied_cookie(self):
        first = self.register().json()["account"]["id"]
        other = Client(enforce_csrf_checks=True)
        other.get("/api/auth/session")
        second = self.register("other@example.test", other).json()["account"]["id"]
        other.cookies["lot_account"] = signing.dumps(first, salt="lot-account")
        self.assertEqual(other.get("/api/account").json()["id"], second)
        self.assertNotEqual(first, second)

    def test_guest_progress_is_claimed_at_signup(self):
        guest = self.client.get("/api/account").json()
        claimed = self.register().json()["account"]
        self.assertEqual(claimed["id"], guest["id"])
        self.assertEqual(claimed["cash"], guest["cash"])
        self.assertEqual(claimed["positions"], guest["positions"])

    def test_invalid_login_is_generic_and_throttled(self):
        self.register()
        for _ in range(10):
            response = self.post("/api/auth/login", {"email": "alex@example.test", "password": "wrong"})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["error"], "The email or password is incorrect.")
        self.assertEqual(self.post("/api/auth/login", {"email": "alex@example.test", "password": "wrong"}).status_code, 429)

    def test_weak_password_and_duplicate_registration_are_rejected(self):
        weak = self.post("/api/auth/signup", {"name": "Alex", "email": "alex@example.test", "password": "123"})
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(Account.objects.count(), 0)
        self.register()
        self.post("/api/auth/logout", {})
        self.assertEqual(self.register().status_code, 409)

    def test_password_change_retains_this_session_and_revokes_old_password(self):
        self.register()
        result = self.post("/api/auth/password", {"current_password": self.password, "password": "LongerPractice!6492"})
        self.assertEqual(result.status_code, 200)
        self.assertIsNotNone(self.client.get("/api/auth/session").json()["user"])
        self.post("/api/auth/logout", {})
        self.assertEqual(self.post("/api/auth/login", {"email": "alex@example.test", "password": self.password}).status_code, 401)
        self.assertEqual(self.post("/api/auth/login", {"email": "alex@example.test", "password": "LongerPractice!6492"}).status_code, 200)

    def test_recovery_link_is_emailed_and_only_works_once(self):
        self.register()
        self.post("/api/auth/logout", {})
        self.assertEqual(self.post("/api/auth/forgot", {"email": "alex@example.test"}).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        uid, token = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body).groups()
        payload = {"uid": uid, "token": token, "password": "LongerPractice!6492"}
        self.assertEqual(self.post("/api/auth/reset", payload).status_code, 200)
        self.assertEqual(self.post("/api/auth/reset", payload).status_code, 400)
        self.assertEqual(self.post("/api/auth/login", {"email": "alex@example.test", "password": "LongerPractice!6492"}).status_code, 200)

    def test_unknown_email_recovery_has_same_public_response(self):
        result = self.post("/api/auth/forgot", {"email": "unknown@example.test"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_password_change_revokes_other_sessions(self):
        self.register()
        other = Client(enforce_csrf_checks=True)
        other.get("/api/auth/session")
        self.post("/api/auth/login", {"email": "alex@example.test", "password": self.password}, other)
        self.assertIsNotNone(other.get("/api/auth/session").json()["user"])
        self.post("/api/auth/password", {"current_password": self.password, "password": "LongerPractice!6492"})
        self.assertIsNone(other.get("/api/auth/session").json()["user"])
        self.assertIsNotNone(self.client.get("/api/auth/session").json()["user"])

    def test_password_reset_revokes_existing_session(self):
        self.register()
        recovery = Client(enforce_csrf_checks=True)
        recovery.get("/api/auth/session")
        self.post("/api/auth/forgot", {"email": "alex@example.test"}, recovery)
        uid, token = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body).groups()
        self.post("/api/auth/reset", {"uid": uid, "token": token, "password": "LongerPractice!6492"}, recovery)
        self.assertIsNone(self.client.get("/api/auth/session").json()["user"])
