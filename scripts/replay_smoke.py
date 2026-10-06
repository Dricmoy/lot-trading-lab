"""Exercise fresh disposable practice workspaces; never sign in or reset accounts."""
import json
import sys
import uuid
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173").rstrip("/")


class Browser:
    def __init__(self):
        self.jar = CookieJar()
        self.opener = build_opener(HTTPCookieProcessor(self.jar))

    def call(self, path, body=None, key=None, csrf=True, expected=200):
        headers = {"Content-Type": "application/json", "Origin": base, "Referer": base + "/demo"}
        if csrf:
            token = next((c.value for c in self.jar if c.name == "csrftoken"), "")
            headers["X-CSRFToken"] = token
        if key:
            headers["Idempotency-Key"] = key
        request = Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            response = self.opener.open(request, timeout=45)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == expected, f"{path.split('/')[2]} expected {expected}, received {response.status}"
            data = response.read()
            return json.loads(data) if "application/json" in response.headers.get("Content-Type", "") else {}


browser, other = Browser(), Browser()
browser.call("/api/auth/session")
account = browser.call("/api/account")
other.call("/api/account")
assert account["id"] != other.call("/api/account")["id"]
assert len(browser.call("/api/replay")["scenarios"]) == 3
browser.call("/api/replay", {}, csrf=False, expected=403)
for scenario in ("steady-climb", "sudden-selloff", "volatile-open"):
    start_key = str(uuid.uuid4())
    body = {"scenario": scenario, "friction": "standard"}
    session = browser.call("/api/replay", body, start_key, expected=201)["session"]
    assert browser.call("/api/replay", body, start_key, expected=201)["session"]["id"] == session["id"]
    path = "/api/replay/" + session["id"]
    other.call(path, expected=404)
    assert len(session["prices"]) == 1
    key = str(uuid.uuid4())
    order_body = {"action": "order", "revision": 0, "side": "buy", "kind": "market", "quantity": 50, "reason": "Disposable verification: small entry."}
    session = browser.call(path, order_body, key)["session"]
    assert browser.call(path, order_body, key)["replayed"]
    assert session["shares"] == 50
    browser.call(path, {"action": "advance", "revision": 0}, str(uuid.uuid4()), expected=409)
    session = browser.call(path, {"action": "reflect", "revision": session["revision"], "order_id": session["orders"][0]["id"], "reflection": "Disposable private reflection."}, str(uuid.uuid4()))["session"]
    while not session["finished"]:
        session = browser.call(path, {"action": "advance", "revision": session["revision"], "count": 5}, str(uuid.uuid4()))["session"]
        assert len(session["prices"]) == session["step"] + 1
        assert all(n["step"] <= session["step"] for n in session["news"])
    assert session["step"] == 59
    assert session["metrics"]["value"] - 10000000 == session["metrics"]["realized"] + session["metrics"]["unrealized"]
    assert browser.call(path)["session"] == session
    session = browser.call(path, {"action": "share", "revision": session["revision"]}, str(uuid.uuid4()))["session"]
    public_path = "/api/replay/shared/" + session["share_url"].split("/")[-1]
    public = other.call(public_path)["session"]
    assert public["id"] is None and not public["orders"][0]["reason"] and not public["orders"][0]["reflection"]
    browser.call(path, {"action": "unshare", "revision": session["revision"]}, str(uuid.uuid4()))
    other.call(public_path, expected=404)
    print(f"PASS: {scenario}, full day, notes/reload, retries, ownership, sanitized sharing and revocation")
assert browser.call("/api/account")["cash"] == account["cash"]
body = {"symbol": "HOOD", "side": "buy", "kind": "limit", "quantity": 1, "limit": 1, "time_in_force": "gtc", "reason": "Disposable resting-order verification."}
result = browser.call("/api/orders", body, str(uuid.uuid4()), expected=201)
assert result["order"]["status"] == "open" and result["account"]["reserved_cash"] == 1
assert browser.call("/api/account")["reserved_cash"] == 1
result = browser.call("/api/orders/cancel", {"order_id": result["order"]["id"]})
assert result["account"]["reserved_cash"] == 0 and result["account"]["cash"] == account["cash"]
assert browser.call("/api/market?symbol=HOOD")["source"] == "simulated"
assert browser.call("/api/portfolio/history")["points"]
assert not browser.call("/api/news?symbol=HOOD")["available"]
print("PASS: independent replay cash, normal resting reservation/reload/cancellation, observed valuation, public feed isolation")
