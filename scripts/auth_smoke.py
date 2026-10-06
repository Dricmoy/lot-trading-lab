"""Exercise registered trading through real HTTP services with isolated test identities."""

import argparse
from http.cookiejar import CookieJar
import json
import secrets
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("origin")
args = parser.parse_args()
origin = args.origin.rstrip("/")


class Browser:
    def __init__(self):
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))

    def request(self, path, data=None, key=None, csrf=True):
        headers = {"Content-Type": "application/json", "Origin": origin}
        if data is not None and csrf:
            headers["X-CSRFToken"] = next(c.value for c in self.jar if c.name == "csrftoken")
        if key:
            headers["Idempotency-Key"] = key
        request = Request(origin + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            try:
                content = json.loads(error.read())
            except ValueError:
                content = {"error": f"HTTP {error.code}"}
            return error.code, content


browser = Browser()
assert browser.request("/api/health")[1]["status"] == "ok"
assert browser.request("/api/auth/session")[1]["user"] is None
email = f"lot-smoke-{uuid.uuid4().hex}@example.test"
password = secrets.token_urlsafe(24)
signup = {"name": "Practice Check", "email": email, "password": password}
status, session = browser.request("/api/auth/signup", signup)
assert status == 200, (status, session)
account = session["account"]
assert account["cash"] == 10000000 and account["positions"] == []
assert len(browser.request("/api/market?symbol=AAPL")[1]["assets"]) == 8
assert browser.request("/api/orders", {}, csrf=False)[0] == 403
buy = {"symbol": "AAPL", "side": "buy", "kind": "market", "quantity": 2}
key = str(uuid.uuid4())
status, bought = browser.request("/api/orders", buy, key)
assert status == 201 and bought["order"]["executed"] == 2, (status, bought)
assert bought["account"]["cash"] == account["cash"] - bought["order"]["total"]
status, replay = browser.request("/api/orders", buy, key)
assert status == 200 and replay["replayed"] and replay["account"]["cash"] == bought["account"]["cash"]
assert browser.request("/api/orders", {**buy, "quantity": 3}, key)[0] == 409
status, sold = browser.request("/api/orders", {**buy, "side": "sell", "quantity": 1}, str(uuid.uuid4()))
assert status == 201 and sold["order"]["executed"] == 1
assert sold["account"]["cash"] == bought["account"]["cash"] + sold["order"]["total"]
assert sold["account"]["positions"][0]["quantity"] == 1
assert browser.request("/api/orders", {**buy, "side": "sell", "quantity": 3}, str(uuid.uuid4()))[0] == 400
assert browser.request("/api/orders", {**buy, "symbol": "MSFT", "quantity": 10000}, str(uuid.uuid4()))[0] == 400
status, cancelled = browser.request("/api/orders", {**buy, "kind": "limit", "limit": 1}, str(uuid.uuid4()))
assert status == 201 and cancelled["order"]["executed"] == 0
assert cancelled["account"]["cash"] == sold["account"]["cash"]
assert len(cancelled["account"]["orders"]) == 3
assert browser.request("/api/preferences", {"watchlist": ["AAPL", "TSLA"]})[0] == 200
assert browser.request("/api/auth/logout", {})[0] == 200
assert browser.request("/api/auth/session")[1]["user"] is None
assert browser.request("/api/orders", buy, str(uuid.uuid4()))[0] == 401
returning = Browser()
returning.request("/api/auth/session")
status, restored = returning.request("/api/auth/login", {"email": email, "password": password})
assert status == 200 and restored["account"]["id"] == account["id"]
assert restored["account"]["cash"] == sold["account"]["cash"]
assert restored["account"]["positions"][0]["quantity"] == 1
assert restored["account"]["watchlist"] == ["AAPL", "TSLA"]
assert len(restored["account"]["orders"]) == 3
other = Browser()
other.request("/api/auth/session")
status, isolated = other.request("/api/auth/signup", {**signup, "email": f"other-{email}"})
assert status == 200 and isolated["account"]["id"] != account["id"]
assert isolated["account"]["cash"] == 10000000 and not isolated["account"]["orders"]
assert returning.request("/api/auth/password", {"current_password": password, "password": f"Changed-{password}"})[0] == 200
assert returning.request("/api/auth/session")[1]["user"] is not None
status, reset = returning.request("/api/reset", {})
assert status == 200 and reset["cash"] == 10000000 and not reset["positions"] and not reset["orders"]
print("PASS: registered account, CSRF, real market API, buy/sell cash and positions, safe retries, limits, insufficient cash/shares, logout, new-browser restoration, saved watchlist, identity isolation, password change, own-account reset")
