"""Exercise real HTTP services; creates and resets a dedicated demo account."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
import json
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("origin")
parser.add_argument("--concurrency", action="store_true")
args = parser.parse_args()
origin = args.origin.rstrip("/")
jar = CookieJar()
opener = build_opener(HTTPCookieProcessor(jar))


def get(path):
    with opener.open(origin + path, timeout=30) as response:
        return json.load(response)


assert get("/api/health")["status"] == "ok"
assert len(get("/api/engine")["assets"]) == 8
account = get("/api/account")
assert get("/api/account")["id"] == account["id"]
cookie = "; ".join(f"{c.name}={c.value}" for c in jar)
csrf = next(c.value for c in jar if c.name == "csrftoken")


def post(path, data, key=None):
    request = Request(
        origin + path,
        data=json.dumps(data).encode(),
        headers={
            "Cookie": cookie,
            "Content-Type": "application/json",
            "Origin": origin,
            "X-CSRFToken": csrf,
            "Idempotency-Key": key or str(uuid.uuid4()),
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        body = error.read().decode()
        try:
            body = json.loads(body)
        except ValueError:
            body = body[:300]
        return error.code, body


order = {"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 25}
key = str(uuid.uuid4())
status, first = post("/api/orders", order, key)
assert status == 201, (status, first)
assert first["order"]["executed"] == 25
assert len(first["order"]["result"]["fills"]) == 2
assert first["account"]["cash"] == account["cash"] - first["order"]["total"]
status, retry = post("/api/orders", order, key)
assert status == 200 and retry["replayed"] and retry["order"]["id"] == first["order"]["id"]
assert post("/api/orders", {**order, "quantity": 26}, key)[0] == 409
assert post("/api/orders", {**order, "symbol": []})[0] == 400
assert post("/api/orders", {**order, "side": "sell", "quantity": 1000})[0] == 400
status, cancelled = post("/api/orders", {**order, "kind": "limit", "limit": 1})
assert status == 201 and cancelled["order"]["status"] == "cancelled"
assert cancelled["account"]["cash"] == first["account"]["cash"]
status, sell = post("/api/orders", {**order, "side": "sell", "quantity": 2})
assert status == 201 and sell["account"]["cash"] == first["account"]["cash"] + sell["order"]["total"]
print(
    "PASS: health, Go quotes, account persistence, multi-level fills, buy/sell ledger, idempotency, conflicting retry, invalid input, no shorting, IOC cancellation"
)

if args.concurrency:
    key = str(uuid.uuid4())
    before = get("/api/account")
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(lambda _: post("/api/orders", {**order, "quantity": 1}, key), range(6)))
    assert all(status in (200, 201) for status, _ in results), results
    assert len({result["order"]["id"] for _, result in results}) == 1
    after = get("/api/account")
    assert before["cash"] - after["cash"] == results[0][1]["order"]["total"]
    assert len(after["orders"]) == len(before["orders"]) + 1
    print("PASS: six simultaneous identical requests create one order and debit cash once")

    status, fresh = post("/api/reset", {})
    assert status == 200 and fresh["cash"] == 10000000
    competing = [{"symbol": "NVDA", "side": "buy", "kind": "market", "quantity": quantity} for quantity in (300, 301)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda payload: post("/api/orders", payload), competing))
    assert sorted(status for status, _ in results) == [201, 400], results
    after = get("/api/account")
    successful = next(result for status, result in results if status == 201)
    assert after["cash"] == 10000000 - successful["order"]["total"] >= 0
    assert len(after["orders"]) == 1
    print("PASS: competing buys exceeding combined buying power serialize; one fills and one rejects without overspending")

status, reset = post("/api/reset", {})
assert status == 200 and reset["cash"] == 10000000 and reset["positions"] == [] and reset["orders"] == []
assert get("/api/account")["cash"] == 10000000
print("PASS: isolated reset and persisted cash")
