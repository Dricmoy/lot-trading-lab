"""Check portfolio history through Java using disposable LOCAL snapshot fixtures."""
import argparse
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
import json
import math
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, build_opener

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("origin", nargs="?", default="http://127.0.0.1:8080")
origin = parser.parse_args().origin.rstrip("/")
assert urlparse(origin).hostname in ("127.0.0.1", "localhost"), "LOCAL Java server only"
assert urlparse(os.environ.get("DATABASE_URL", "")).hostname in ("127.0.0.1", "localhost"), "LOCAL disposable PostgreSQL only"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
import django  # noqa: E402

django.setup()
from backend.trading.models import Account, PortfolioSnapshot  # noqa: E402


def get(browser, path):
    with browser.open(origin + path, timeout=15) as response:
        assert response.status == 200
        return json.load(response)


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


browser = build_opener(HTTPCookieProcessor(CookieJar()))
other = build_opener(HTTPCookieProcessor(CookieJar()))
account = Account.objects.get(pk=get(browser, "/api/account")["id"])
other_account = Account.objects.get(pk=get(other, "/api/account")["id"])
try:
    for count in (0, 1, 239, 240, 241, 479, 480, 5000, 5001):
        PortfolioSnapshot.objects.filter(account=account).delete()
        start = datetime.now(timezone.utc).replace(second=0, microsecond=0) - timedelta(minutes=count + 1)
        rows = []
        for index in range(count):
            value = {1: 5_000_000, 2: 15_000_000}.get(index, 10_000_000)
            price = {3: 50_000, 4: 200_000}.get(index, 100_000)
            rows.append(PortfolioSnapshot(account=account, epoch=account.history_epoch,
                        bucket=start + timedelta(minutes=index), cash=0, value=value,
                        positions=[{"symbol": "AAPL", "quantity": value // price, "cost": value}],
                        prices={"AAPL": price}))
        PortfolioSnapshot.objects.bulk_create(rows)
        result = get(browser, "/api/portfolio/history?days=7")
        retained = rows[-5000:]
        assert result["observations"] == len(retained), count
        assert result["limited"] is (count > 5000), count
        selected = result["points"]
        assert len(selected) <= 240, (count, len(selected))
        if not retained:
            assert selected == [] and result["since"] is None
            continue

        first = retained[0]
        expected = [{"time": row.bucket, "value": row.value,
                     "benchmark": first.cash + sum(p["quantity"] * row.prices[p["symbol"]]
                                                    for p in first.positions)} for row in retained]
        by_time = {point["time"]: point for point in expected}
        selected = [{**point, "time": instant(point["time"])} for point in selected]
        assert selected[0] == expected[0] and selected[-1] == expected[-1], count
        assert [p["time"] for p in selected] == sorted({p["time"] for p in selected}), count
        assert all(point == by_time[point["time"]] for point in selected), count
        if count <= 240:
            assert selected == expected, count
        for series in ("value", "benchmark"):
            assert min(p[series] for p in selected) == min(p[series] for p in expected), (count, series)
            assert max(p[series] for p in selected) == max(p[series] for p in expected), (count, series)

        peak, drawdown, pair = expected[0], 0, (expected[0], expected[0])
        for point in expected:
            if point["value"] > peak["value"]:
                peak = point
            loss = (peak["value"] - point["value"]) / max(1, peak["value"]) * 100
            if loss > drawdown:
                drawdown, pair = loss, (peak, point)
        assert all(point in selected for point in pair), count
        assert math.isclose(result["drawdown"], drawdown, abs_tol=1e-10), count
        assert math.isclose(result["return"], (expected[-1]["value"] - first.value) / first.value * 100, abs_tol=1e-10), count
        assert math.isclose(result["benchmark_return"], (expected[-1]["benchmark"] - first.value) / first.value * 100, abs_tol=1e-10), count
        assert instant(result["since"]) == first.bucket, count
        print(f"PASS: {count} observations, {len(selected)} chart points, exact summaries and retained extremes")

    isolated = get(other, "/api/portfolio/history?days=7")
    assert isolated["points"] == [] and isolated["observations"] == 0
    print("PASS: empty history and account isolation")
finally:
    account.delete()
    other_account.delete()
