"""Bounded stateless load sample; no account writes, secrets, or private feed."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import platform
import statistics
import time
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:8001/api/engine")
parser.add_argument("--requests", type=int, default=200)
parser.add_argument("--workers", type=int, default=8)
args = parser.parse_args()
if not 1 <= args.requests <= 1000 or not 1 <= args.workers <= 16:
    parser.error("Use 1–1000 requests and 1–16 workers.")
payload = json.dumps({"symbol": "HOOD", "side": "buy", "kind": "market", "quantity": 25}).encode()


def sample(_):
    start = time.perf_counter()
    request = Request(args.url, data=payload, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    assert result["quantity"] == 25 and sum(f["quantity"] * f["price"] for f in result["fills"]) == result["total"]
    return (time.perf_counter() - start) * 1000


sample(0)  # One excluded warm-up.
started = time.perf_counter()
with ThreadPoolExecutor(max_workers=args.workers) as pool:
    durations = sorted(pool.map(sample, range(args.requests)))
elapsed = time.perf_counter() - started
print(json.dumps({"scope": "warm local stateless synthetic Go execution; excludes Django, PostgreSQL, provider and Vercel cold starts",
                  "platform": platform.platform(), "requests": args.requests, "concurrency": args.workers,
                  "successful": len(durations), "elapsed_seconds": round(elapsed, 3),
                  "requests_per_second": round(len(durations) / elapsed, 1),
                  "median_ms": round(statistics.median(durations), 2),
                  "p95_ms": round(durations[max(0, (95 * len(durations) + 99) // 100 - 1)], 2),
                  "max_ms": round(max(durations), 2)}, indent=2))
