"""Bounded standard-library oracle for the C++ simulation's protocol and fills."""
import json
from pathlib import Path
import subprocess
import sys

binary = Path(sys.argv[1] if len(sys.argv) > 1 else "matching/build/lot-matching").resolve()


def run(command):
    return subprocess.run([str(binary)], input=command + "\n", text=True, capture_output=True, timeout=4)


cases = 0
for price in (25, 10000, 23749, 100000000):
    expected = {
        "asks": [{"price": price + i * 3 + 1, "quantity": 10 + (i * 23) % 71, "sequence": i} for i in range(8)],
        "bids": [{"price": price - i * 3 - 1, "quantity": 12 + (i * 17) % 63, "sequence": i} for i in range(8)],
    }
    result = run(f"book {price}")
    assert result.returncode == 0 and json.loads(result.stdout) == expected
    for side in ("buy", "sell"):
        for kind in ("market", "limit"):
            for quantity in (1, 20, 10000):
                for limit in (max(1, price - 5), price, min(100000000, price + 5)):
                    levels = expected["asks" if side == "buy" else "bids"]
                    remaining, total, fills = quantity, 0, []
                    for level in levels:
                        if kind == "limit" and ((side == "buy" and level["price"] > limit) or (side == "sell" and level["price"] < limit)):
                            break
                        amount = min(remaining, level["quantity"])
                        if amount:
                            fills.append({"price": level["price"], "quantity": amount})
                        remaining -= amount
                        total += amount * level["price"]
                        if not remaining:
                            break
                    result = run(f"match {side} {kind} {quantity} {limit} {price}")
                    assert result.returncode == 0, result.stderr
                    data = json.loads(result.stdout)
                    assert data["fills"] == fills and data["quantity"] == quantity - remaining and data["total"] == total
                    assert data["status"] == ("filled" if not remaining else "cancelled" if remaining == quantity else "partial")
                    assert data["book"] == expected
                    cases += 1
for invalid in ("", "unknown", "book -1", "book 100000001", "book 100 extra", "match buy market 0 0 10000",
                "match buy market 10001 0 10000", "match other market 1 0 10000", "match buy limit 1 0 10000",
                "match buy market 1 0 10000 extra", "x" * 600):
    assert run(invalid).returncode != 0
print(f"PASS: {cases} C++ execution cases, 4 books, and 11 invalid protocol inputs")
