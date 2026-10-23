# Lot — Your trading ground

[![Quality and accounting](https://github.com/Dricmoy/lot-trading-lab/actions/workflows/quality.yml/badge.svg)](https://github.com/Dricmoy/lot-trading-lab/actions/workflows/quality.yml)

Practice making trading decisions with virtual money. Choose a synthetic market day in Lot Replay, reveal it as you go, write your plan, and review the result. Lot also includes a regular trading workspace, persistent accounts, portfolios, and order history. Public prices are simulated. Owner-only private mode reads Alpaca IEX data; funds, liquidity, and executions remain simulated.

**Replay release:** three reproducible scenarios, saved plans/reflections, performance recaps, explicit sharing, resting limit orders, observed portfolio history, and owner-only news. Production password-reset email delivery still needs an SMTP provider. See [release evidence](docs/REPLAY_VERIFICATION.md) and the [five-person usability script](docs/USER_RESEARCH.md).

**[Try Lot Replay without signup](https://lot-trading-lab.vercel.app/replay)** · [Live app](https://lot-trading-lab.vercel.app) · [Regular workspace](https://lot-trading-lab.vercel.app/demo)

**[Explore the example decision tree](https://lot-trading-lab.vercel.app/replay/compare?example=1)** · [Compare your completed attempts](https://lot-trading-lab.vercel.app/replay/compare)

## Watch the demo

[![Watch the recorded Lot product demo](public/demo/lot-walkthrough-polished.jpg)](https://lot-trading-lab.vercel.app/#watch-demo)

**[Watch the 48-second walkthrough](https://lot-trading-lab.vercel.app/#watch-demo)** · [Open the MP4](https://lot-trading-lab.vercel.app/demo/lot-walkthrough-polished.mp4) · [Try the workspace without signup](https://lot-trading-lab.vercel.app/demo)

The demo records actual guest buy/sell trades, portfolio updates, and completed orders. It includes cursor zooms, transitions, captions, and a written transcript. GitHub displays the linked poster; the live landing plays the video with native controls.

The landing page uses Motion for React (formerly Framer Motion) for a coordinated hero entrance, layered illustrative preview, responsive stock selection, a one-shot replay path, and smooth FAQ disclosure. It follows reduced-motion preferences, offers an Animations on/off control, and keeps the recorded walkthrough under manual playback control. See the [motion design and accessibility notes](docs/LANDING_MOTION.md).

## Stack

**Java/C++ is live.** The original accounts and saved replays were preserved. See [migration verification](docs/JAVA_MIGRATION_VERIFICATION.md) and the [completed execution plan](docs/JAVA_MIGRATION_EXECPLAN.md).

| Layer | Implementation |
| --- | --- |
| Client | React 19, TypeScript, Redux Toolkit, Vite, Recharts, Motion for React |
| Account and replay API | Java 21, Spring Boot 4.1, Spring Security, JDBC, Flyway |
| Matching engine | C++20, ordered price levels and FIFO queues |
| Persistence | PostgreSQL; the existing Neon schema is preserved |
| Hosting | OCI container containing Spring Boot, C++ and the built React app |

## Architecture

```mermaid
flowchart LR
    Browser["Browser · React + Redux"]
    subgraph Runtime["Deployed OCI container"]
        Assets["Static app + recorded demo"]
        API["Spring Boot · Java 21<br/>Identity, accounts, orders, replay, history"]
        CPP["C++20 executable<br/>Stateless price-level matching"]
    end
    DB[("PostgreSQL · Neon<br/>Accounts, ledger, sessions, replay events")]
    Feed["Alpaca data API<br/>Owner-only quotes, bars, news"]
    Mail["SMTP provider<br/>Optional recovery email"]
    Browser -->|"Load app and video"| Assets
    Browser -->|"JSON API · cookies + CSRF"| API
    API -->|"JDBC transactions + row locks"| DB
    API -->|"Bounded numeric stdin / JSON stdout"| CPP
    API -->|"Server-side credentials"| Feed
    API -->|"When configured"| Mail
```

Java owns identity, cash, reservations, persistence, and deterministic replay. C++ computes ordinary simulated executions against eight price levels per side; each invocation starts a fresh book and cannot access accounts or the database. Java validates its output before recording a fill. Replay uses its own Java model so saved events can reconstruct an attempt exactly. Public market data is synthetic; the private provider supplies data only, with no brokerage order routing.

See the [architecture guide](docs/ARCHITECTURE.md) for transaction and replay diagrams, failure handling, data structures, and scaling tradeoffs. Python and Go remain development compatibility references outside the deployed runtime.

### Project guide

| Guide | What it explains |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Runtime boundaries, accounting, replay, and execution failures |
| [Decision-tree comparison](docs/ATTEMPT_COMPARISON.md) | Shared choices, divergent branches, and comparable outcomes |
| [Portfolio history](docs/PORTFOLIO_HISTORY.md) | Observed valuations, bounded charts, preserved extremes, and exact summaries |
| [Authentication](docs/AUTHENTICATION.md) | Guest promotion, sessions, and password recovery |
| [Java/C++ migration evidence](docs/JAVA_MIGRATION_VERIFICATION.md) | Data preservation and compatibility checks |
| [Replay verification](docs/REPLAY_VERIFICATION.md) | Scenarios, journals, reservations, sharing, and history |
| [Recorded demo](docs/DEMO_FILM_QA.md) | Walkthrough footage, captions, and playback checks |
| [Landing motion](docs/LANDING_MOTION.md) | Choreography, reduced motion, keyboard behavior, and implementation boundaries |

## What you can do

- Replay a steady climb, sudden selloff, or volatile opening; only revealed prices and fictional dispatches reach the browser.
- Play/pause, change speed, advance moments, finish early, and retry the same path with a fresh independent $100,000 balance.
- Record a reason before replay trades, save reflections, and compare net return, drawdown, realized/unrealized gains, and fees against holding.
- Compare two completed attempts on the same scenario in an interactive decision tree: shared choices form a trunk, then branches show different orders, cancellations and finishes. Inspect plans/fills/reflections and compare results at the same revealed clock.
- Select light, standard, or challenging modeled spread, latency cost, and fees.
- Explicitly share finished recaps; journal notes remain private by default, and links can be revoked.
- Keep ordinary limit orders open with reserved cash/shares, cancel remainders, or choose immediate-or-cancel.
- Track observed 1D/1W/1M portfolio values with a holding comparison, actual time spacing, and charts that preserve brief highs/lows and the largest drawdown.
- Read attributed real headlines in the owner-only Alpaca workspace.
- Open `/demo` immediately without signup; create an account later to save your progress.
- Watch the recorded buy, sell, portfolio, and activity walkthrough on the landing page.
- Explore eight stocks, interactive intraday charts, simulated depth, and an account watchlist.
- Connect owner-only Alpaca IEX prices and real five-minute chart bars, with actual exchange timestamps.
- Submit whole-share buy/sell market or limit orders with a review step.
- Review and confirm orders, then inspect individual fills and execution status.
- Create an account, log in and out, and change your password. Emailed recovery is implemented and locally verified; live delivery requires SMTP configuration.
- Restore your holdings, history, and watchlist from another browser.
- Track positions, cost basis, cash, total return, and allocation.
- Filter trade history, export the latest 50 orders to CSV, and reset your own demo.

New registered accounts start with $100,000 in virtual cash and no holdings. Guest workspaces include a seeded example portfolio with a $100,000 original cost basis; signing up from a guest workspace preserves its progress. Resetting creates a cash-only $100,000 portfolio. Spring Security protects mutations with CSRF tokens. Passwords use Django-compatible PBKDF2-SHA256, and opaque server sessions use Secure, HttpOnly, SameSite cookies in production. Existing Django passwords and signed identities remain compatible. Registered records persist in PostgreSQL and restore after login from another browser. Guests use a signed browser cookie for 30 days. No real-money trading is possible.

## Run locally

Prerequisites: Node 24, JDK 21, a C++20 compiler, CMake 3.20+, and PostgreSQL. The Maven wrapper downloads a pinned, checksum-verified Maven distribution.

```sh
npm ci
docker compose up -d postgres
export DATABASE_URL='postgres://lot:local_disposable_password@127.0.0.1:54329/lot'
cmake -S matching -B matching/build -DCMAKE_BUILD_TYPE=Release
cmake --build matching/build -j 2
server/mvnw -B -s server/maven-settings.xml -f server/pom.xml verify
java -jar server/target/lot-server-2.0.0.jar
```

Then run `npm run dev` in another terminal and open http://127.0.0.1:5173. Vite proxies all `/api` requests to Java on port 8080. Java invokes the compiled C++ executable directly; no Python or Go service is involved. Flyway initializes an empty PostgreSQL database or adds Java session/recovery tables to the existing schema without replacing application rows. An existing native PostgreSQL installation can be used instead of Compose.

Environment variables must be exported to the server process; Java does not load Vite environment files. See [.env.example](.env.example). On macOS with a Homebrew JDK, set `JAVA_HOME` to the JDK installation if the system Java command is a stub. Keep the original `DJANGO_SECRET_KEY` when connecting an existing database: it verifies old sessions and guest cookies.

To serve the complete built app directly from Java:

```sh
npm run build
java -jar server/target/lot-server-2.0.0.jar --spring.web.resources.static-locations=file:dist/,classpath:/static/
```

## Verification

```sh
npm run build
npm run lint
npm test
server/mvnw -B -s server/maven-settings.xml -f server/pom.xml verify
python3 matching/verify.py
python3 scripts/auth_smoke.py http://127.0.0.1:8080
python3 scripts/replay_smoke.py http://127.0.0.1:8080
java -jar server/target/lot-server-2.0.0.jar --lot.reconcile=true --server.port=0
```

The Java tests cover deterministic replay parity against frozen legacy fixtures, canonical fingerprints, UUIDs, password hashes, signed cookies, strict matcher response decoding, and portfolio chart sampling. The C++ oracle exercises 144 executions, four books and eleven invalid protocol inputs. HTTP checks exercise registration, trading, safe retries, ownership, replay, journal notes, sharing/revocation, reservations and observed history. Reconciliation checks cash movement chains, fills, reservations and replay reconstruction without changing records.

The local-only migration harness also creates real Django records and verifies them through Java. It covers legacy sessions, Unicode passwords and notes, guest promotion, old/new one-use recovery links, session revocation, simultaneous duplicate orders, competing purchases/sales/reservations, and stale/duplicate replay actions. A separate fault-injection check covers nine execution failures: invalid fills, excessive quantities, malformed JSON, empty output, null, arrays, trailing JSON, nonzero exits, and timeouts. Each must return HTTP 503 with identical cash, positions, orders, and revision. Python is used only by this development oracle, not by the deployed application:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python scripts/java_compatibility.py http://127.0.0.1:8080
.venv/bin/python scripts/java_faults.py
.venv/bin/python scripts/history_sampling.py http://127.0.0.1:8080
.venv/bin/ruff check .
```

Use a disposable **local** database for this harness; it refuses remote hosts. GitHub Actions supplies an isolated PostgreSQL database and runs the Java/C++, frontend and HTTP checks. Local recovery messages are saved to the gitignored `.mailbox/` directory. Actual production email delivery still requires SMTP configuration; see [authentication](docs/AUTHENTICATION.md).

The history check seeds only fresh disposable accounts. It exercises empty/small histories, the 240-point chart budget, brief portfolio and benchmark extremes, summary calculations, the 5,000-observation retention boundary, and account isolation. See the [history data flow and sampling contract](docs/PORTFOLIO_HISTORY.md).

## API

| Route | Method | Responsibility |
| --- | --- | --- |
| `/api/market?symbol=HOOD` | GET | Java: authenticated market proxy; private owner receives IEX data |
| `/api/connect` | POST | Java: exchange owner access token for an opaque private session |
| `/api/engine?symbol=HOOD` | GET | Java + C++: simulated quotes, chart samples, and selected book |
| `/api/engine` | POST | C++ via Java: stateless execution calculation; does not mutate accounts |
| `/api/auth/session` | GET | Restore identity and issue CSRF cookie |
| `/api/auth/signup` | POST | Register and claim guest progress or open cash-only account |
| `/api/auth/login` | POST | Authenticate and restore owned account |
| `/api/auth/logout` | POST | End session |
| `/api/auth/password` | POST | Change password and revoke other sessions |
| `/api/auth/forgot` | POST | Send one-use recovery link |
| `/api/auth/reset` | POST | Validate recovery token and set password |
| `/api/preferences` | POST | Save the current account watchlist |
| `/api/account` | GET | Java: open/restore isolated account and issue CSRF cookie |
| `/api/orders` | POST | Java: validate, match, and persist order + position + ledger |
| `/api/orders/settle` | POST | Evaluate up to one eligible resting order, each at most once per 15-second bucket |
| `/api/orders/cancel` | POST | Cancel owned remaining shares and release reservations |
| `/api/orders/journal` | POST | Save an owned order reflection |
| `/api/portfolio/history?days=7` | GET | At most 240 original chart points and summaries from up to 5,000 observations; windows 1, 7, or 30 days |
| `/api/replay` | GET/POST | Scenario catalog/saved sessions; start an independent replay |
| `/api/replay/compare?first=<id>&second=<id>` | GET | Owned finished attempts, reconstructed decision branches and outcomes at a common clock |
| `/api/replay/compare/example` | GET | Authored synthetic example executed entirely in memory; no saved user data |
| `/api/replay/<id>` | GET/POST | Restore/advance/trade/reflect/finish/share/revoke an owned replay |
| `/api/replay/shared/<token>` | GET | Deliberately shared finished recap; notes excluded by default |
| `/api/news?symbol=HOOD` | GET | Owner-only attributed Alpaca headlines |
| `/api/learning-metrics` | POST | Owner-only aggregate workspace activity, including verification |
| `/api/reset` | POST | Java: reset only the current demo account |
| `/api/health` | GET | Java: database connectivity check |

Order example (money is integer cents):

```json
{"symbol":"HOOD","side":"buy","kind":"limit","quantity":25,"limit":11850,"time_in_force":"gtc","reason":"Wait for my chosen entry price."}
```

Account mutations require a valid registered session, guest cookie, or owner session, plus `X-CSRFToken`. Registered account cookies alone cannot grant access to owned accounts. Order submissions additionally require a UUID `Idempotency-Key`. Identical retries return the original order; a different payload using that key receives HTTP 409.

## Correctness and tradeoffs

JDBC transactions and PostgreSQL `SELECT ... FOR UPDATE` serialize each PostgreSQL account's order/reset operations. The matching response, cash update, position cost basis, order, and cash-ledger entry form one transaction. Unique database constraints enforce per-account idempotency. Monetary values use integer cents throughout. Selling releases proportional cost basis using integer rounding; selling the entire position removes its complete remaining cost.

Replay actions lock their session, require a current revision and a UUID request key, and persist a payload fingerprint plus an event. The read-only reconciliation command reconstructs replay state from those events and checks ordinary cash anchors, movement chains, fill totals, and reservations. A stale version or conflicting retry returns 409. Sharing is explicit, notes are excluded by default, and revoked links return 404.

[Attempt comparison](docs/ATTEMPT_COMPARISON.md) reuses saved events to reconstruct each decision's actual before/after state. It requires distinct, owned, completed attempts on the same scenario version. Shared order terms/timing form the tree's trunk; plans can differ. Charts and measurements stop at the last moment both attempts experienced; individual branches retain their own full endings. Different execution conditions are disclosed. The tree describes recorded choices and outcomes, without claiming that one choice alone caused a result. Private plans and reflections stay in the account workspace.

The C++ engine builds an ordered price-level map and consumes FIFO liquidity from the best acceptable price. Building the eight-level synthetic slice costs O(P log P); matching walks the consumed levels. Limits protect execution prices. Java keeps `gtc` remainders open and reserves their cash/shares; `ioc` remainders cancel. Ordinary resting orders are checked while the regular workspace is open, at most one eligible order per quote observation and once per order per 15-second bucket. Replay limits are evaluated at each revealed moment and expire when the session ends. A buy exceeding available cash is rejected atomically.

This is a simulation, not a production brokerage. Ordinary synthetic liquidity regenerates for each engine request; replay liquidity is shared across all orders within each virtual moment; there is no global exchange, consolidated market feed, WebSocket service, actual clearing/settlement, or real-money integration. Registered users have multi-browser identity; guest identities remain browser scoped. Market polling is every 15 seconds while the page is open. Public chart time is fictional. Private charts use the latest available regular trading session's IEX bars and explicitly show its date; sparse bars are not fabricated. Last-trade prices may be old outside trading hours. The account lock is held during the bounded C++ execution (three-second process deadline, up to two seconds waiting for capacity): a simple correctness tradeoff that should become a reservation/outbox workflow at larger scale. Observed history saves one valuation per minute received by the workspace, up to the latest 5,000 observations per selected window. Straight lines connect sparse observations. A reset starts a new history epoch. Replay history records each revealed moment and trade cost changes. Structured production request logs include a generated request ID, route pattern, method, status, and duration; they exclude identities, credentials, query strings, and request bodies. See [architecture](docs/ARCHITECTURE.md).

## Deploy to Vercel

The root `Dockerfile.vercel` builds React assets, Java and C++ in separate stages, then packages a non-root Java 21 runtime with the matching executable. The final container has no Python or Go service. `vercel.json` explicitly selects the container framework and Spring serves both the API and frontend deep links.

1. Link the existing Vercel project; retain `DATABASE_URL`, `DJANGO_SECRET_KEY`, private provider credentials and owner token.
2. Set `PORT=8080` in the intended deployment environment. Configure SMTP only if recovery delivery is wanted.
3. Deploy a preview against a separate PostgreSQL database. Do not use search-path/schema isolation with a transaction pool: session settings can be lost between transactions. **Never promote a preview that overrides the production database URL.**
4. Verify Java/C++ health, frontend routes, video delivery and all account/replay flows on that preview.
5. Before production migration, capture original-row fingerprints using `scripts/database_snapshot.py capture` with a private manifest path. Flyway performs additive startup migration; verify original rows afterward using the same manifest and `verify` mode.
6. Deploy production with the original database and signing key, without preview-schema overrides. Verify `/api/health` identifies Java/C++, then run disposable-account HTTP checks and read-only reconciliation. Keep the preceding deployment available for rollback.

The production signing key and owner token must not be rotated during this migration. Existing tables and legacy code remain available as migration references; `.vercelignore` and the container build exclude the Python/Go entry points from deployment.

The browser never receives database credentials, Alpaca credentials, or the Django signing key. Never put any of them in a `VITE_` variable or commit environment files.


## Private Alpaca market data

Set production-only **Secret** environment variables `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, and a random 32+ character `LOT_OWNER_ACCESS_TOKEN`. Use paper keys. The market provider calls `https://data.alpaca.markets/v2/stocks/...` with `feed=iex`; the news adapter calls `https://data.alpaca.markets/v1beta1/news` for up to five attributed headlines with `include_content=false`; it never calls any Alpaca order, funding, account, or live brokerage endpoint. Credentials never enter frontend bundles.

Click **Private market data** and enter the owner token. This opens a separate, persistent $100,000 cash practice account. An opaque server session in an HttpOnly cookie protects access; reconnecting with the token restores the same account across browsers. Rotating the token changes the owner account identity and revokes old owner access. Store the owner token privately, for example in a password manager, and reuse it when reconnecting. Secret environment values are excluded from the repository.

Java resolves the registered, guest or private-owner identity before accessing provider data. Browser-supplied internal market headers are ignored; direct public engine calls retain synthetic data. Both displayed prices and private simulated execution reference Alpaca snapshots. Provider errors return 503 and prevent account mutation. Quotes cache for 30 seconds and selected-symbol bars for 60 seconds per Java process. Each provider HTTP request has a seven-second deadline. API responses prohibit caching.

IEX is one exchange, **not** consolidated US pricing or NBBO. Chart bars are five-minute closes from the latest regular session found within ten calendar days. Only the selected symbol loads chart history. Real timestamps are shown in Eastern time; market closures or sparse IEX trading can produce older data. Simulator liquidity is generated around the latest available trade, including after hours; these fills do not represent executable exchange quotes.

[Alpaca's redistribution FAQ](https://alpaca.markets/support/redistribute-alpaca-api) says API data cannot be redistributed, so the personal feed is owner-only. Public visitors retain the synthetic demo. See [market-data documentation](https://docs.alpaca.markets/us/docs/about-market-data-api) and [stock bars reference](https://docs.alpaca.markets/us/reference/stockbarssingle).

## News and learning evidence

Real news is useful for the owner's regular workspace and is integrated through the existing Alpaca credentials. Public replay uses explicitly fictional, timed dispatches aligned with its synthetic clock. Real headlines are independent of simulated prices and do not drive replay paths. No paid news subscription was created. [Alpaca news reference](https://docs.alpaca.markets/us/v1.4.2/reference/news-3). [NewsAPI's developer plan](https://newsapi.org/pricing) is for development only, so it is unsuitable for the deployed app without a production plan.

The owner-only learning counters measure starts, fills, full-day/early finishes, and repeat **workspaces**, including disposable verification. They are not evidence of unique people, retention, or traction. [The five-person research script](docs/USER_RESEARCH.md) is ready to use; no human study results are claimed.
