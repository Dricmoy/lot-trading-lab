# Replay release evidence

Recorded October 6, 2026. These are bounded observations of this implementation, not brokerage execution or production capacity claims.

## Local checks

| Check | Observed result |
| --- | --- |
| Frontend production build | Passed; 2,177 transformed modules |
| Frontend lint | Passed |
| Frontend tests | 10 passed, including older same-account cash/watchlist responses |
| Django on isolated PostgreSQL 16 | 57 passed, no skips; 4.971 seconds |
| Ruff | Passed |
| Migration drift | No changes detected |
| Go race-enabled tests | API and engine packages passed; server has no test files |
| Go vet | Passed |
| Existing three-service trading checks | Passed buy/sell, multi-level fills, ledger, retry conflicts, insufficient holdings, IOC and isolated reset |
| Existing authentication integration checks | Passed local registered/session restoration, ownership, CSRF, watchlist, password/session changes, disposable reset |
| New replay integration checks | All three scenarios passed full-day reveal, journal persistence, exact-key retry, stale rejection, separate ownership, private sharing and revocation |
| Ordinary resting limits | Non-crossing order remained open with reserved cash after reload; cancellation released it without a cash debit |
| Valuation history | Actual server-observed snapshot appeared; public news did not contact the private feed |
| Read-only reconciliation | 19 local accounts, 11 orders, 8 replays reconciled at the recorded checkpoint; counts include disposable verification |

The PostgreSQL instance was a disposable local Docker `postgres:16` container bound only to loopback. Tests used Django's separate test database. No tests pointed at Neon or any existing production database.

Six PostgreSQL concurrency cases each used four simultaneous workers: identical ordinary retries produce one execution/ledger row; distinct purchases cannot overspend; sales cannot sell the same shares twice; resting orders cannot reserve the same cash; distinct stale replay actions allow one mutation; identical replay retries apply one event. Cash/fill/reservation reconciliation and deterministic replay reconstruction pass afterward. These cases establish the exercised transactions, not proof of all distributed failures.

## Browser review

At the observed 1280 × 720 desktop viewport: guest library and scenario choice, actual market order review/confirmation, a saved reason/reflection after reload, resting limit reservation/cancellation, early completion recap, notes-excluded shared page, revocation, repeat scenario opening, 4× playback, fictional dispatch reveal, and automatic 16:00 completion were inspected. The interface displayed the saved values rather than mock screenshots.

Phone breakpoints are implemented for the library, toolbar, ticket, journal, recap, shared page, and landing section. **The browser viewport override did not take effect:** after requesting 390 × 844, the page still reported 1280 × 720. A fresh tab and reload gave the same result. The override was reset. Consequently this release does not claim a completed phone visual or cross-browser check. Validate on an actual phone or functioning responsive browser before making that claim. Existing breakpoint rules were reviewed in source.

## Measured matching sample

`python scripts/benchmark.py`: warm local stateless Go synthetic matching, one excluded warm-up, 200 requests, concurrency 8, macOS 27.0.1 arm64.

| Measurement | Observed |
| --- | --- |
| Successful responses | 200/200 |
| Elapsed sample | 0.031 seconds |
| Median round trip | 1.12 ms |
| p95 round trip | 1.86 ms |
| Maximum round trip | 2.51 ms |
| Sample throughput | 6,458.9 responses/second |

This short loopback sample includes HTTP plus matching on synthetic depth. It excludes Django accounting, PostgreSQL, Alpaca, Vercel cold starts, production networks, and sustained load. It is not a production throughput promise. The script caps requests/workers and validates every returned fill total.

## Delivery

Production migrations 0003 and 0004 applied successfully before publication. Original contents of 21 accounts, 42 positions, 2 orders and 2 ledger rows were preserved using original-column hashes. Read-only reconciliation passed for all 21 accounts and 2 orders; no replay rows existed before this release. Deployment, public flows, owner news and GitHub Actions results will be recorded after execution. The migration helper hashes pre-existing rows using their pre-migration column sets, outputs aggregate counts only, and never prints credentials or account contents.

## Remaining external evidence

- Production recovery mail needs SMTP provider configuration and a verified sender. No delivery success is claimed.
- The five-person study is prepared in `USER_RESEARCH.md`; no volunteers were contacted and no human results are invented.
- Owner aggregate counters include disposable verification. They describe workspaces rather than humans, cohorts, or traction.
- Ordinary resting settlement occurs while the workspace is open; there is no background exchange worker, WebSocket market service, or real clearing/settlement.
- Simulation spread, fees, latency costs, fictional prices/news and regenerated ordinary depth do not represent actual executable brokerage quotes.
