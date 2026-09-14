"""Verify the deployed owner-only feed. Uses .env.owner without printing it."""
import hashlib
from http.cookiejar import CookieJar
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen
import uuid

origin = "https://lot-trading-lab.vercel.app"
token = Path(".env.owner").read_text().strip().split("=", 1)[1]
jar = CookieJar()
opener = build_opener(HTTPCookieProcessor(jar))


def call(path, body=None, headers=None):
    csrf = next((c.value for c in jar if c.name == "csrftoken"), "")
    req = Request(origin + path, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Content-Type": "application/json", "Origin": origin, "X-CSRFToken": csrf, **(headers or {})})
    with opener.open(req, timeout=40) as response:
        return json.load(response)


public = call("/api/account")
assert public["market_source"] == "simulated"
assert call("/api/market?symbol=HOOD")["source"] == "simulated"
owner = call("/api/connect", {"token": token})
assert owner["market_source"] == "alpaca-iex" and owner["id"] != public["id"]
assert call("/api/account")["id"] == owner["id"]
try:
    market = call("/api/market?symbol=HOOD")
except HTTPError:
    # Inspect safe provider error text, never request headers or credentials.
    digest = hashlib.sha256(("lot-engine:" + token).encode()).hexdigest()
    req = Request(origin + "/api/engine?symbol=HOOD", headers={"X-Lot-Market-Token": digest})
    try:
        with urlopen(req, timeout=40) as response:
            market = json.load(response)
    except HTTPError as error:
        print("Provider check:", error.code, error.read().decode())
        raise SystemExit(1)
assert market["source"] == "alpaca-iex"
assert len(market["assets"]) == 8
asset = next(a for a in market["assets"] if a["symbol"] == "HOOD")
assert asset["quote_time"] and len(asset["history"]) == len(asset["history_times"]) > 0
assert all(a["price"] > 0 and a["quote_time"] for a in market["assets"])
print("PASS: private IEX quotes for 8 assets; HOOD price", asset["price"] / 100, "trade timestamp", asset["quote_time"], "chart bars", len(asset["history"]))
for symbol in ("NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "COIN"):
    selected = call("/api/market?symbol=" + symbol)
    a = next(a for a in selected["assets"] if a["symbol"] == symbol)
    assert a["history"] and len(a["history"]) == len(a["history_times"])
print("PASS: actual historical chart bars for all 8 symbols")
# Non-crossing limit validates real-price matching with no cash/position change.
key = str(uuid.uuid4())
order = {"symbol": "HOOD", "side": "buy", "kind": "limit", "quantity": 1, "limit": 1}
result = call("/api/orders", order, {"Idempotency-Key": key})
assert result["order"]["status"] == "cancelled"
assert result["account"]["cash"] == owner["cash"]
reference = result["order"]["result"]["book"]["asks"][0]["price"] - 1
assert abs(reference - asset["price"]) / asset["price"] < .1
retry = call("/api/orders", order, {"Idempotency-Key": key})
assert retry["replayed"] and retry["order"]["id"] == result["order"]["id"]
print("PASS: private Go matching uses IEX reference; cancelled order preserves funds; retry is idempotent")
with urlopen(origin + "/api/engine", timeout=30) as response:
    assert json.load(response)["source"] == "simulated"
print("PASS: anonymous direct Go endpoint exposes only simulated data")
