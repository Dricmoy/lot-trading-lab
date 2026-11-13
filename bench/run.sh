#!/usr/bin/env bash
# Concurrency sweep against a running local Java/C++ server (LOT_METRICS_EXPOSURE must include prometheus).
# Usage: bench/run.sh [base_url]   Env: DURATION (default 30s), VUS_LIST, SCENARIOS
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${1:-http://127.0.0.1:8080}
DURATION=${DURATION:-30s}
VUS_LIST=${VUS_LIST:-"1 4 8 16 32 64"}
SCENARIOS=${SCENARIOS:-"engine orders account"}
OUT=bench/results/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT"
{
  echo "commit: $(git rev-parse HEAD)$(git diff --quiet || echo ' (dirty)')"
  echo "date_utc: $(date -u +%FT%TZ)"
  echo "host: $(sysctl -n machdep.cpu.brand_string 2>/dev/null || uname -m), $(sysctl -n hw.ncpu 2>/dev/null) cpus, $(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1073741824 )) GB"
  echo "os: $(uname -sr)"
  echo "java: $(java -version 2>&1 | head -1)"
  echo "k6: $(k6 version | head -1)"
  echo "postgres: $(psql --version)"
  echo "duration_per_step: $DURATION"
} > "$OUT/env.txt"
scrape() { curl -sf "$BASE/actuator/prometheus" > "$1"; }
# Warm the JIT and connection pool; excluded from results.
for s in $SCENARIOS; do SCENARIO=$s VUS=8 DURATION=10s BASE_URL=$BASE k6 run -q bench/k6/lot.js >/dev/null 2>&1 || true; done
for s in $SCENARIOS; do
  for v in $VUS_LIST; do
    scrape "$OUT/$s-$v.before.prom"
    SCENARIO=$s VUS=$v DURATION=$DURATION BASE_URL=$BASE OUT="$OUT/$s-$v.json" \
      k6 run -q bench/k6/lot.js 2>&1 | grep -v 'level=' | tee -a "$OUT/summary.txt" || true
    scrape "$OUT/$s-$v.after.prom"
  done
done
python3 bench/report.py "$OUT"
