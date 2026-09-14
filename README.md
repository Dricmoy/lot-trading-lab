# Lot — Your trading ground

A full-stack paper-trading lab built around the engineering problems behind a consumer brokerage: order execution, portfolio accounting, retries, and an understandable trading experience. Independent project, not affiliated with Robinhood. The public demo uses simulated prices. Private mode reads real Alpaca IEX data; funds, liquidity, and executions remain simulated.

**Live app: https://lot-trading-lab.vercel.app**

## Stack

| Layer | Implementation |
| --- | --- |
| Client | React 19, TypeScript, Redux Toolkit, Vite, Recharts |
| Account API | Python 3.12, Django 5.2 |
| Matching engine | Go, standard library HTTP handlers, binary heap |
| Persistence | PostgreSQL on Neon; SQLite for local development |
| Hosting | Vercel static frontend + Python and Go serverless functions |

## What you can do

- Explore eight stocks, interactive intraday charts, simulated depth, and a session watchlist.
- Connect owner-only Alpaca IEX prices and real five-minute chart bars, with actual exchange timestamps.
- Submit whole-share buy/sell market or limit orders with a review step.
- Inspect individual fills, actual matching duration, and execution status.
- Track positions, cost basis, cash, total return, and allocation.
- Filter trade history, export the latest 50 orders to CSV, and reset your own demo.

New demo accounts start with seeded positions and cash whose original total cost is exactly $100,000. Resetting creates a cash-only $100,000 portfolio. A signed HttpOnly cookie restores your browser-scoped account for 30 days; account records persist in PostgreSQL.

## Run locally

Prerequisites: Node 22.12+ (Node 24 recommended), Python 3.12+, Go 1.23+, and `uv` or Python's venv/pip.

```sh
npm ci
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python manage.py migrate
```

Start these in three terminals:

```sh
go run ./cmd/server
```

```sh
.venv/bin/python manage.py runserver 127.0.0.1:8000
```

```sh
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api/engine` to Go on port 8001 and the other API routes to Django on port 8000. `.env.example` documents configurable server environment variables. Django reads the process environment, not Vite's `.env.local` file. Local runs default to SQLite, an explicitly development-only signing key, and trusted localhost origins.

## Verification

```sh
npm run build
npm run lint
npm test
.venv/bin/python manage.py test
.venv/bin/ruff check .
go test -race ./api ./engine ./cmd/server
go vet ./api ./engine ./cmd/server
go build ./api ./engine ./cmd/server
```

Backend tests cover buy/sell accounting, idempotency and conflicting retries, cash constraints, insufficient holdings, partial fills, non-crossing limits, engine failure, CSRF, cookie tampering, and account isolation. Go tests cover price/time priority, best bid execution, limit bounds, and input rejection. Frontend tests cover exact currency parsing and portfolio valuation. See `docs/VERIFICATION.md` for the actual run results.

## API

| Route | Method | Responsibility |
| --- | --- | --- |
| `/api/market?symbol=HOOD` | GET | Django: authenticated market proxy; private owner receives IEX data |
| `/api/connect` | POST | Django: exchange owner access token for signed account cookie |
| `/api/engine?symbol=HOOD` | GET | Go: simulated quotes, chart samples, and selected book |
| `/api/engine` | POST | Go: stateless execution calculation; does not mutate accounts |
| `/api/account` | GET | Django: open/restore isolated account and issue CSRF cookie |
| `/api/orders` | POST | Django: validate, match, and persist order + position + ledger |
| `/api/reset` | POST | Django: reset only the current demo account |
| `/api/health` | GET | Django: database connectivity check |

Order example (money is integer cents):

```json
{"symbol":"HOOD","side":"buy","kind":"limit","quantity":25,"limit":11850}
```

Account mutations require the signed account cookie and `X-CSRFToken`. Order submissions additionally require a UUID `Idempotency-Key`. Identical retries return the original order; a different payload using that key receives HTTP 409.

## Correctness and tradeoffs

`transaction.atomic()` and `select_for_update()` serialize each PostgreSQL account's order/reset operations. The matching response, cash update, position cost basis, order, and cash-ledger entry form one transaction. Unique database constraints enforce per-account idempotency. Monetary values use integer cents throughout. Selling releases proportional cost basis using integer rounding; selling the entire position removes its complete remaining cost.

The Go engine heapifies a synthetic book in O(n), then takes the best price and earliest sequence for each fill in O(log n). Total matching cost is O(n + k log n), where n is depth and k is fills. Limits protect execution prices; both order kinds use **immediate-or-cancel**, so no orders rest on the book. A buy that exceeds available cash at execution is rejected atomically. Network retries can safely reuse their key.

This is a simulation, not a production brokerage. Synthetic liquidity regenerates for each request; there is no global exchange, consolidated market feed, WebSocket service, actual clearing/settlement, real-money integration, or authenticated multi-device identity. Market polling is every 15 seconds while the page is open. Public chart time is fictional. Private charts use the latest available regular trading session's IEX bars and explicitly show its date; sparse bars are not fabricated. Last-trade prices may be old outside trading hours. SQLite does not provide PostgreSQL row-lock concurrency guarantees. The account lock is held during the bounded engine request (25-second timeout): a simple correctness tradeoff that should become a reservation/outbox workflow at larger scale. See `docs/ARCHITECTURE.md`.

## Deploy to Vercel

1. Install the Vercel CLI separately (`npm install -g vercel`), sign in, and run `vercel link`.
2. Provision a separate Neon PostgreSQL database and connect it to this project.
3. Set `DATABASE_URL` and a random `DJANGO_SECRET_KEY` in the deployment environments. Production startup fails closed if either is missing. Use a distinct database for future preview environments that must not share demo data.
4. Apply migrations to the intended database **before** deployment, e.g. `vercel env run -- .venv/bin/python manage.py migrate`. This is a manual deploy step; migrations do not run inside serverless requests.
5. Run `vercel --prod`. `vercel.json` builds the frontend and routes Python and Go independently.
6. Verify `/api/health`, `/api/engine`, a complete trade, persistence after reload, and mobile layout.

`MATCHING_ENGINE_URL` can override the Go endpoint. On Vercel it defaults to `https://$VERCEL_PROJECT_PRODUCTION_URL/api/engine`, keeping backend calls on the public production alias rather than a protected preview URL. `CSRF_TRUSTED_ORIGINS` is a comma-separated list for explicitly trusted proxy origins, normally unnecessary on the production same-origin app.

The browser never receives database credentials, Alpaca credentials, or the Django signing key. Never put any of them in a `VITE_` variable or commit environment files.


## Private Alpaca market data

Set production-only **Secret** environment variables `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, and a random 32+ character `LOT_OWNER_ACCESS_TOKEN`. Use paper keys. The provider only calls `https://data.alpaca.markets/v2/stocks/...` with `feed=iex`; it never calls any Alpaca order, funding, account, or live brokerage endpoint. Credentials never enter frontend bundles.

Click **Private market data** and enter the owner token. This opens a separate, persistent $100,000 cash practice account. A signed HttpOnly cookie protects access; reconnecting with the token restores the same account across browsers. Rotating the token changes the owner account identity and revokes old owner access. The local deployment's token is in the gitignored `.env.owner`; keep that file private.

Django checks the signed account identity before adding an internal, domain-separated SHA-256 token to Go requests. Browser-supplied upstream auth headers are ignored. Direct public Go calls retain synthetic data. Both displayed prices and simulated executions use Alpaca snapshots for the owner account. No provider error silently falls back to simulated quotes; expired-cache refresh failures return 503 and prevent account mutation. Snapshots cache for 30 seconds and selected-symbol bars for 60 seconds per warm Go process; cold starts and independent instances have separate caches. Each provider HTTP request times out after 7 seconds. Public responses and private proxy responses prohibit caching.

IEX is one exchange, **not** consolidated US pricing or NBBO. Chart bars are five-minute closes from the latest regular session found within ten calendar days. Only the selected symbol loads chart history. Real timestamps are shown in Eastern time; market closures or sparse IEX trading can produce older data. Simulator liquidity is generated around the latest available trade, including after hours; these fills do not represent executable exchange quotes.

[Alpaca's redistribution FAQ](https://alpaca.markets/support/redistribute-alpaca-api) says API data cannot be redistributed, so the personal feed is owner-only. Public visitors retain the synthetic demo. See [market-data documentation](https://docs.alpaca.markets/us/docs/about-market-data-api) and [stock bars reference](https://docs.alpaca.markets/us/reference/stockbarssingle).
