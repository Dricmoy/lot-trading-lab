"""Verify Java against disposable Django-created records in a LOCAL PostgreSQL DB.

Requires the legacy development requirements only as a migration oracle. The
deployed Java/C++ application does not import or execute Python. Never point this
harness at a shared database: it creates identities and adjusts fresh test cash.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import copy
from http.cookiejar import Cookie, CookieJar
import json
import os
from pathlib import Path
import secrets
import sys
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("origin", nargs="?", default="http://127.0.0.1:8080")
args = parser.parse_args()
origin = args.origin.rstrip("/")
database = urlparse(os.environ.get("DATABASE_URL", ""))
assert database.hostname in ("127.0.0.1", "localhost"), "LOCAL disposable PostgreSQL only"
assert urlparse(origin).hostname in ("127.0.0.1", "localhost"), "LOCAL Java server only"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django  # noqa: E402

django.setup()
from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.tokens import default_token_generator  # noqa: E402
from django.core import signing  # noqa: E402
from django.test import Client  # noqa: E402
from django.utils.encoding import force_bytes  # noqa: E402
from django.utils.http import urlsafe_base64_encode  # noqa: E402
from unittest.mock import patch  # noqa: E402
from backend.trading.models import Account, Order, ReplaySession  # noqa: E402
from backend.trading.services import place_order  # noqa: E402


class Browser:
    def __init__(self):
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))

    def cookie(self, name, value):
        self.jar.set_cookie(Cookie(0, name, value, None, False, urlparse(origin).hostname,
                                   False, False, "/", True, False, None, True, None, None, {}))

    def clone(self):
        other = Browser()
        for cookie in self.jar:
            other.jar.set_cookie(copy(cookie))
        return other

    def call(self, path, data=None, key=None, expected=200, headers=None):
        request_headers = {"Content-Type": "application/json", "Origin": origin}
        csrf = next((c.value for c in self.jar if c.name == "csrftoken"), "")
        request_headers["X-CSRFToken"] = csrf
        if key:
            request_headers["Idempotency-Key"] = str(key)
        request_headers.update(headers or {})
        request = Request(origin + path, data=json.dumps(data).encode() if data is not None else None,
                          headers=request_headers)
        try:
            response = self.opener.open(request, timeout=30)
        except HTTPError as error:
            response = error
        with response:
            body = json.loads(response.read())
            if expected is not None:
                assert response.status == expected, (path, response.status, body)
            return body if expected is not None else (response.status, body)


def fresh():
    browser = Browser()
    account = browser.call("/api/account")
    return browser, account


def parallel(browser, path, bodies, keys):
    clients = [browser.clone() for _ in bodies]
    with ThreadPoolExecutor(max_workers=len(clients)) as pool:
        return list(pool.map(lambda item: item[0].call(path, item[1], item[2], expected=None),
                             zip(clients, bodies, keys, strict=True)))


def legacy_post(client, route, body, key=None):
    response = client.post(route, json.dumps(body), content_type="application/json",
                           **({"HTTP_IDEMPOTENCY_KEY": str(key)} if key else {}))
    assert response.status_code in (200, 201), (route, response.status_code)
    return response.json()


email = f"java-legacy-{uuid.uuid4().hex}@example.test"
password = "Legacy-" + secrets.token_urlsafe(18) + "-é🌱"
user = get_user_model().objects.create_user(username=email, email=email, password=password, first_name="Legacy Check")
account = Account.objects.create(user=user, watchlist=["HOOD", "AAPL"])
key = uuid.uuid4()
body = {"symbol": "AAPL", "side": "buy", "kind": "market", "quantity": 2, "reason": "   "}
execution = {"fills": [{"price": 10001, "quantity": 2}], "quantity": 2, "total": 20002, "status": "filled"}
with patch("backend.trading.services.execute", return_value=execution):
    old_order, _ = place_order(account.id, body, str(key))
account.refresh_from_db()
old_hash = user.password
legacy = Client()
legacy.force_login(user)
legacy_cookie = legacy.cookies[settings.SESSION_COOKIE_NAME].value
browser = Browser()
browser.cookie("lot_session", legacy_cookie)
session = browser.call("/api/auth/session")
assert session["user"]["email"] == email
assert session["account"]["id"] == str(account.id)
assert session["account"]["cash"] == account.cash
assert session["account"]["watchlist"] == ["HOOD", "AAPL"]
assert session["account"]["positions"][0]["quantity"] == 2
retry = browser.call("/api/orders", body, key)
assert retry["replayed"] and retry["order"]["id"] == str(old_order.id)
assert Order.objects.filter(account=account).count() == 1
print("PASS: existing Django session, cash/positions/watchlist, and legacy whitespace-note retry")

# Build completed replays through the actual old Django controllers, then ask
# Java to reconstruct them for comparison, including canonical Unicode hashes.
replay_ids = []
for quantity in (10, 20):
    replay = legacy_post(legacy, "/api/replay", {"scenario": "steady-climb", "friction": "standard"}, uuid.uuid4())["session"]
    route = "/api/replay/" + replay["id"]
    replay = legacy_post(legacy, route, {"action": "order", "revision": 0, "side": "buy", "kind": "market",
                                       "quantity": quantity, "reason": "Legacy café 🌱"}, uuid.uuid4())["session"]
    while not replay["finished"]:
        replay = legacy_post(legacy, route, {"action": "advance", "revision": replay["revision"], "count": 5}, uuid.uuid4())["session"]
    replay_ids.append(replay["id"])
    restored = browser.call(route)["session"]
    assert restored["orders"] == replay["orders"] and restored["metrics"] == replay["metrics"]
comparison = browser.call(f"/api/replay/compare?first={replay_ids[0]}&second={replay_ids[1]}")
assert comparison
print("PASS: Django-created completed replay state, Unicode notes, events, and Java decision reconstruction")

# The old signed guest cookie cannot become a credential for a claimed account.
guest, original = fresh()
copied = guest.clone()
signup_email = f"java-claim-{uuid.uuid4().hex}@example.test"
claimed = guest.call("/api/auth/signup", {"name": "Claim Check", "email": signup_email, "password": password})
assert claimed["account"]["id"] == original["id"]
assert claimed["account"]["positions"] == original["positions"]
assert copied.call("/api/auth/session")["user"] is None
assert copied.call("/api/orders", body, uuid.uuid4(), expected=401)
legacy_guest = Browser()
guest_account = Account.objects.create()
legacy_guest.cookie("lot_account", signing.dumps(str(guest_account.id), salt="lot-account"))
assert legacy_guest.call("/api/account")["id"] == str(guest_account.id)
print("PASS: signed Django guest cookie, guest promotion, and copied-cookie ownership boundary")

# Java login accepts Django PBKDF2 including Unicode, without rewriting the hash.
returning = Browser()
returning.call("/api/auth/session")
assert returning.call("/api/auth/login", {"email": email, "password": password, "remember": False})["account"]["id"] == str(account.id)
assert next(c for c in returning.jar if c.name == "lot_java_session").expires is None
user.refresh_from_db()
assert user.password == old_hash
second = Browser()
second.call("/api/auth/session")
second.call("/api/auth/login", {"email": email, "password": password})
changed = "Updated-" + secrets.token_urlsafe(24)
returning.call("/api/auth/password", {"current_password": password, "password": changed})
user.refresh_from_db()
assert user.check_password(changed)
assert second.call("/api/auth/session")["user"] is None
assert browser.call("/api/auth/session")["user"] is None
print("PASS: Unicode Django PBKDF2 login, session-only remember option, Java hash compatibility, both session formats revoked on password change")

# A reset link issued by Django remains usable once after cutover.
uid = urlsafe_base64_encode(force_bytes(user.pk))
token = default_token_generator.make_token(user)
recovered = "Recovered-" + secrets.token_urlsafe(24)
resetter = Browser()
resetter.call("/api/auth/session")
reset_body = {"uid": uid, "token": token, "password": recovered}
resetter.call("/api/auth/reset", reset_body)
resetter.call("/api/auth/reset", reset_body, expected=400)
user.refresh_from_db()
assert user.check_password(recovered)
assert returning.call("/api/auth/session")["user"] is None

before = set(Path(".mailbox").glob("*.log"))
resetter.call("/api/auth/forgot", {"email": email})
created = set(Path(".mailbox").glob("*.log")) - before
assert len(created) == 1
mail = next(iter(created)).read_text()
link = next(line for line in mail.splitlines() if "/reset-password?" in line)
query = parse_qs(urlparse(link).query)
reset_body = {"uid": query["uid"][0], "token": query["token"][0], "password": "Again-" + secrets.token_urlsafe(24)}
resetter.call("/api/auth/reset", reset_body)
resetter.call("/api/auth/reset", reset_body, expected=400)
print("PASS: legacy and Java password recovery tokens, one-use enforcement, session revocation")

buyer, initial = fresh()
buy = {"symbol": "AAPL", "side": "buy", "kind": "market", "quantity": 2}
retry_key = uuid.uuid4()
results = parallel(buyer, "/api/orders", [buy] * 4, [retry_key] * 4)
assert sorted(code for code, _ in results) == [200, 200, 200, 201], results
assert Order.objects.filter(account_id=initial["id"]).count() == 1
print("PASS: four simultaneous identical orders commit one debit and one ledger entry")

buyer, initial = fresh()
Account.objects.filter(id=initial["id"]).update(cash=30000, cash_anchor=30000)
results = parallel(buyer, "/api/orders", [{**buy, "quantity": 1}] * 2, [uuid.uuid4(), uuid.uuid4()])
assert sorted(code for code, _ in results) == [201, 400], results
seller, _ = fresh()
sell = {**buy, "side": "sell", "quantity": 20}
results = parallel(seller, "/api/orders", [sell] * 2, [uuid.uuid4(), uuid.uuid4()])
assert sorted(code for code, _ in results) == [201, 400], results
for side, quantity, limit in (("buy", 5000, 1000), ("sell", 20, 100000000)):
    trader, _ = fresh()
    resting = {**buy, "side": side, "kind": "limit", "quantity": quantity, "limit": limit, "time_in_force": "gtc"}
    results = parallel(trader, "/api/orders", [resting] * 2, [uuid.uuid4(), uuid.uuid4()])
    assert sorted(code for code, _ in results) == [201, 400], results
print("PASS: concurrent purchases, sales, cash reservations and share reservations cannot overspend or oversell")

for duplicate in (False, True):
    trader, _ = fresh()
    replay = trader.call("/api/replay", {"scenario": "steady-climb"}, uuid.uuid4(), expected=201)["session"]
    route = "/api/replay/" + replay["id"]
    keys = [uuid.uuid4(), uuid.uuid4()]
    if duplicate:
        keys[1] = keys[0]
    results = parallel(trader, route, [{"action": "advance", "revision": 0}] * 2, keys)
    assert sorted(code for code, _ in results) == ([200, 200] if duplicate else [200, 409]), results
    assert trader.call(route)["session"]["step"] == 1
    assert ReplaySession.objects.get(id=replay["id"]).events.count() == 1
print("PASS: concurrent replay retries apply once; competing stale revisions receive 409")

trader, _ = fresh()
trader.call("/api/orders", buy, uuid.uuid4(), expected=403, headers={"Origin": "https://untrusted.example"})
trader.call("/api/orders", buy, uuid.uuid4(), expected=403, headers={"X-CSRFToken": "invalid"})
trader.call("/api/replay/compare", expected=400)
trader.call("/api/missing-route", expected=404)
trader.call("/api/orders", {**buy, "quantity": True}, uuid.uuid4(), expected=400)
trader.call("/api/orders", {**buy, "reason": "x" * 17000}, uuid.uuid4(), expected=413)
assert trader.call("/api/engine?symbol=AAPL", headers={"X-Lot-Market-Token": "forged"})["source"] == "simulated"
print("PASS: cross-origin, CSRF, malformed routes/inputs, request size and private-feed isolation")
