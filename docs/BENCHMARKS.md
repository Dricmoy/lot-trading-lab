# Benchmarks and test evidence

Measured on 2026-11-13 against the deployed Java 21 + C++20 runtime, running locally. Each number links to raw output in [`bench/results/20261113T074734Z/`](../bench/results/20261113T074734Z/). The older Go figures in `REPLAY_VERIFICATION.md` describe the retired engine; use the figures here instead.

| | |
| --- | --- |
| Host | Apple M4 Pro, 14 CPUs, 24 GB, macOS (Darwin 25.6) |
| Server | `lot-server-2.0.0.jar`, OpenJDK 21.0.13, Hikari pool 5, 8 matcher permits |
| Database | PostgreSQL 17.11, local, disposable |
| Load generator | k6 2.4.0 on the same machine, closed model (`constant-vus`) |
| Method | 10 s warm-up per scenario (excluded), then 30 s per concurrency step |

Client, server and database all run on one laptop. These numbers describe how the code behaves, not internet-facing production capacity. They exclude TLS, network distance, Neon, and Vercel cold starts.

## Reproduce

```sh
brew install k6 google-benchmark openjdk@21
# Server with Prometheus enabled (opt-in; production exposes health,info only):
LOT_METRICS_EXPOSURE=health,info,prometheus java -jar server/target/lot-server-2.0.0.jar
bench/run.sh                      # k6 sweep, server metrics, bench/results/<timestamp>/results.md
cmake -S matching -B matching/build -DCMAKE_BUILD_TYPE=Release -DLOT_BENCH=ON
cmake --build matching/build && matching/build/lot-matching-bench
```

## HTTP load (k6)

| Scenario | What a request does |
| --- | --- |
| `account` | `GET /api/account`: session check plus Postgres reads (cash, positions, last 50 orders) |
| `engine` | `POST /api/engine`: validation plus one C++ matcher subprocess, no database writes |
| `orders` | `POST /api/orders`: CSRF and idempotency check, account row lock, C++ match, ledger writes. One guest account per VU, alternating 1-share buy/sell |

"Server C++ ms" is the server's own `lot.matching.subprocess` timer: start the process, write stdin, wait, read and decode stdout. "Permit wait" is time spent queued for one of the 8 matcher slots.

| Scenario | VUs | Req/s | p50 ms | p95 ms | p99 ms | Errors | Server C++ ms | Permit wait ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| account | 1 | 2,908 | 0.31 | 0.39 | 0.56 | 0% | | |
| account | 8 | **12,055** | 0.62 | 0.83 | 1.21 | 0% | | |
| account | 64 | 11,747 | 5.00 | 12.92 | 18.44 | 0% | | |
| engine | 1 | 356 | 2.55 | 3.68 | 4.22 | 0% | 2.50 | 0.0 |
| engine | 8 | 2,439 | 3.16 | 3.61 | 4.01 | 0% | 3.03 | 0.0 |
| engine | 16 | **2,625** | 5.98 | 6.95 | 8.01 | 0% | 3.03 | 2.79 |
| engine | 64 | 2,598 | 24.86 | 27.91 | 31.06 | 0% | 3.06 | 21.28 |
| orders | 1 | 157 | 6.22 | 7.71 | 8.54 | 0% | 2.68 | 0.0 |
| orders | 8 | 681 | 10.65 | 19.33 | 20.27 | 0% | 3.04 | 0.0 |
| orders | 64 | **906** | 66.11 | 141.12 | 191.01 | 0% | 3.07 | 0.0 |

The full table with every step (1, 4, 8, 16, 32, 64 VUs) is in [`results.md`](../bench/results/20261113T074734Z/results.md). Across the sweep there were 2.28 M requests, all k6 checks passed, and none failed.

### Where the ceilings come from

Both ceilings match a Little's-law prediction from the server's own timers:

- **Engine ≈ 8 permits ÷ 3.03 ms ≈ 2,640 req/s.** Measured: 2,625. Above 8 VUs the extra latency is all queueing. At 64 VUs, 21.3 ms of the 24.9 ms median is permit wait, while the C++ round trip stays at about 3.05 ms.
- **Orders ≈ 5 DB connections ÷ ~5.5 ms per transaction ≈ 900 req/s.** Measured: 906. The account row lock and a pooled connection are both held across the C++ subprocess call, so the 5-connection Hikari pool saturates before the 8 matcher permits do (permit wait stays at 0).
- **The process start, not the matching, costs the time.** In-process, one match takes **541 ns** (Google Benchmark, below), but the subprocess round trip takes **~3 ms**, about 5,600× more. A long-lived matcher process, or JNI, would remove most of the per-order cost.

## Matching core microbenchmark (Google Benchmark)

`matching/bench.cpp` calls the same `book.hpp` code the executable uses. Mean of 5 repetitions, Release build:

| Benchmark | Time | Throughput |
| --- | ---: | ---: |
| Build both 8-level sides | 40 ns | |
| Market buy, 1 share (1 level) | 521 ns | 1.92 M/s |
| Market buy, 25 shares (2 levels) | 541 ns | 1.85 M/s |
| Market buy, 10,000 shares (sweeps 8 levels) | 611 ns | 1.64 M/s |
| Limit sell, stops at limit | 552 ns | 1.81 M/s |

Most of the ~500 ns is building the per-call `std::map<price, std::deque>` index. The book has only eight levels, so these are per-call costs, not exchange-scale numbers.

## Correctness under load

- **Ledger audit after the sweep:** 42,296 accounts and 126,343 orders. For every account, cash equals the anchor plus the sum of deltas, and the revision equals the order count, so there were no lost updates. Walking each account's ledger in insert order finds **0 broken links in 126,343 entries**.
- **A weakness in the audit:** the built-in reconciler orders movements by `created_at` (wall clock). The Mac's clock stepped back 48 ms during the run, and the reconciler reported 52 false "cash movement chain" problems in 4 accounts. Details are in [`reconciliation.txt`](../bench/results/20261113T074734Z/reconciliation.txt). Ordering by a monotonic sequence would fix it.
- **C++ oracle:** 144 execution cases, 4 books and 11 invalid protocol inputs match an independent Python model (`matching/verify.py`).
- **Fault injection:** 9 matcher failure modes each return HTTP 503 and leave cash, positions, orders and revision identical. After recovery, a retry with the same idempotency key debits once (`scripts/java_faults.py`).
- **Concurrency:** 6 simultaneous identical requests create one order. Competing buys that exceed buying power serialize, and one is rejected (`scripts/smoke.py --concurrency`).

## Coverage

| Suite | Java lines | Java branches | Java methods |
| --- | ---: | ---: | ---: |
| Unit tests (`mvn verify`, JaCoCo) | 21.6% | 19.0% | 23.8% |
| HTTP integration + fault injection (JaCoCo agent on the live server) | 60.5% | 44.8% | 75.8% |
| **Combined** | **61.5%** (1,147/1,865) | **48.5%** | **76.2%** |

The HTTP suites were `smoke.py --concurrency`, `auth_smoke.py`, `replay_smoke.py`, `history_sampling.py` and `java_faults.py`. Most of the uncovered code is the owner-only Alpaca feed (`MarketData` 26%, `PrivateFeedProbe` 19%), which needs live credentials, plus password-recovery email paths (`AuthController` 37%). `Reconciliation` (12%) ran outside the instrumented process.

The frontend Vitest suite covers 55.6% of lines (70/126) in the modules its 2 test files import. It is not whole-app coverage.

## Deployed backends compared (Vercel)

Two backends run side by side on Vercel, each with its own Neon database branch:

| | Current | Legacy |
| --- | --- | --- |
| URL | `lot-trading-lab.vercel.app` | `lot-trading-lab-legacy.vercel.app` |
| Runtime | Spring Boot container, plus a C++ subprocess per match | Django on Python functions, plus a Go function for matching |
| Code | `main` | `legacy-django-go` (`fd76114` + banner) |
| Database | Neon `main` (production) | Neon branch `legacy-django-go` (copy-on-write clone, separate writes) |

On 2026-11-13, a light k6 run of the stateless `POST /api/engine` (2 VUs, 20 s, from a home connection; raw output in [`bench/results/deployed-20261113T083402Z/`](../bench/results/deployed-20261113T083402Z/)):

| Backend | Req/s | p50 ms | p95 ms | p99 ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Java + C++ (container) | 8.5 | 191 | 497 | 639 | 0% |
| Go (serverless function) | 17.5 | 110 | 136 | 189 | 0% |

Both routes use the same Vercel edge (`pdx1`) and compute region (`iad1`), and connect and TLS times match (~25 ms and ~75 ms), so the difference is server-side. The Java path pays for a container hop and a fresh C++ process per request. Locally that process costs ~3 ms, and on Vercel's container CPU it appears to cost far more. The Go function computes in-process. This matches the local finding that process creation, not matching, sets the cost. A long-lived matcher process is the next optimization to try.

The order path is not compared here because it writes to each backend's database. Running it against production would create guest accounts in the live database.

## Resume-safe phrasing

- Load-tested the Java/C++ order path with k6: **~900 orders/s** with full Postgres ledger writes and **~2,600 matches/s** on the stateless path, with 0 errors over 2.28 M requests. Both ceilings matched Little's-law predictions from Prometheus/Micrometer timers.
- Used server-side metrics to trace order latency to C++ **process creation (~3 ms) rather than matching (541 ns)**, and to show the 5-connection DB pool, not the matcher, limits order throughput.
- Audited 126 K orders across 42 K accounts after load: 0 ledger inconsistencies, and found a clock-skew false positive in the reconciler.
- Deployed the pre-migration Django/Go backend beside the Java/C++ one on Vercel, each on its own Neon branch, and compared the two in production. Java was ~80 ms slower at p50 on the stateless path, consistent with its per-request process creation (a hypothesis, not yet isolated on Vercel).
- Reached **61.5% line / 76% method coverage** on the Java backend by running JaCoCo over unit, HTTP integration and 9-case fault-injection suites.

State the conditions when you use a number (local, single machine), and don't round 906 up to "1,000+".
