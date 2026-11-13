"""Turn one bench/run.sh output directory into a Markdown table (results.md)."""
import json
import sys
from pathlib import Path

out = Path(sys.argv[1])


def counter(path, name, labels=""):
    """Sum a Prometheus counter/summary series whose label set contains `labels`."""
    total = 0.0
    for line in path.read_text().splitlines():
        if line.startswith(name) and labels in line:
            total += float(line.rsplit(" ", 1)[1])
    return total


def subprocess_ms(scenario, vus):
    before, after = out / f"{scenario}-{vus}.before.prom", out / f"{scenario}-{vus}.after.prom"
    if not (before.exists() and after.exists()):
        return None, None
    rows = []
    for metric in ("lot_matching_subprocess_seconds", "lot_matching_permit_wait_seconds"):
        n = counter(after, metric + "_count") - counter(before, metric + "_count")
        t = counter(after, metric + "_sum") - counter(before, metric + "_sum")
        rows.append(round(t / n * 1000, 2) if n else None)
    return rows


lines = [
    "| Scenario | VUs | Requests | Req/s | p50 ms | p95 ms | p99 ms | Failed | C++ round trip ms (server) | Permit wait ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
]
for f in sorted(out.glob("*.json"), key=lambda p: (p.stem.split("-")[0], int(p.stem.split("-")[1]))):
    scenario, vus = f.stem.split("-")
    m = json.loads(f.read_text())["metrics"]
    d = m["http_req_duration"]["values"]
    sub, wait = subprocess_ms(scenario, vus)
    lines.append(
        f"| {scenario} | {vus} | {m['http_reqs']['values']['count']:,} | {m['http_reqs']['values']['rate']:,.0f} | "
        f"{d['med']:.2f} | {d['p(95)']:.2f} | {d['p(99)']:.2f} | {m['http_req_failed']['values']['rate']*100:.2f}% | "
        f"{'—' if sub is None else sub} | {'—' if wait is None else wait} |"
    )
(out / "results.md").write_text((out / "env.txt").read_text() + "\n" + "\n".join(lines) + "\n")
print("\n".join(lines))
