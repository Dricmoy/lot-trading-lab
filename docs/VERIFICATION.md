# Verification — September 14, 2026

Live application: https://lot-trading-lab.vercel.app

Vercel production deployment: `dpl_8Mx1SMgTjDfEa4JdUgyVUUPBjTqF`.

## Production deployment

Command:

```sh
vercel inspect https://lot-trading-lab.vercel.app
```

Output (deployment fields):

```text
id       dpl_8Mx1SMgTjDfEa4JdUgyVUUPBjTqF
name     lot-trading-lab
target   production
status   Ready
url      https://lot-trading-qbhdwqzsp-dricmoys-projects.vercel.app
Aliases  https://lot-trading-lab.vercel.app
         https://lot-trading-lab-dricmoys-projects.vercel.app
Builds   api/index  (41.68MB) [iad1]
         api/engine (3.1MB) [iad1]
```

Python function build log confirms `Using Python 3.12 from .python-version`. The Go function built with Go 1.23.12. Production uses a dedicated free Neon PostgreSQL database with the Django schema applied before deployment.

## Frontend

Command:

```sh
npm run build
```

Output:

```text
> lot-trading-lab@1.0.0 build
> tsc -b && vite build

vite v7.3.6 building client environment for production...
transforming...
✓ 2169 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.70 kB │ gzip:   0.43 kB
dist/assets/index-Dnp2kwis.css   38.85 kB │ gzip:   8.82 kB
dist/assets/index-BPq5LJd7.js   252.38 kB │ gzip:  78.89 kB
dist/assets/charts-DVXXgoA7.js  377.14 kB │ gzip: 110.48 kB
✓ built in 1.16s
```

Command:

```sh
npm run lint
```

Output:

```text
> lot-trading-lab@1.0.0 lint
> eslint .
```

Exit code 0, no findings.

Command:

```sh
npm test
```

Output:

```text
> lot-trading-lab@1.0.0 test
> vitest run

RUN v4.1.11 /Users/dric/Documents/ChatGPT/Robinhood
Test Files  1 passed (1)
     Tests  3 passed (3)
```

## Django

Command:

```sh
.venv/bin/python manage.py test
```

Output:

```text
Creating test database for alias 'default'...
..................
----------------------------------------------------------------------
Ran 18 tests in 0.032s

OK
Destroying test database for alias 'default'...
Found 18 test(s).
System check identified no issues (0 silenced).
```

Command:

```sh
.venv/bin/python manage.py check
```

Output:

```text
System check identified no issues (0 silenced).
```

Command:

```sh
.venv/bin/ruff check .
```

Output:

```text
All checks passed!
```

## Go

Command:

```sh
go test -race ./api ./engine ./cmd/server
```

Output:

```text
?    lot/api          [no test files]
ok   lot/engine       1.282s
?    lot/cmd/server   [no test files]
```

Six engine tests passed, with the race detector enabled.

Commands:

```sh
go vet ./api ./engine ./cmd/server
go build ./api ./engine ./cmd/server
```

Both returned exit code 0 with no output.

## Real HTTP services and PostgreSQL concurrency

Command:

```sh
.venv/bin/python scripts/smoke.py http://127.0.0.1:5173
```

Output:

```text
PASS: health, Go quotes, account persistence, multi-level fills, buy/sell ledger, idempotency, conflicting retry, invalid input, no shorting, IOC cancellation
PASS: isolated reset and persisted cash
```

Command:

```sh
.venv/bin/python scripts/smoke.py https://lot-trading-lab.vercel.app --concurrency
```

Output:

```text
PASS: health, Go quotes, account persistence, multi-level fills, buy/sell ledger, idempotency, conflicting retry, invalid input, no shorting, IOC cancellation
PASS: six simultaneous identical requests create one order and debit cash once
PASS: competing buys exceeding combined buying power serialize; one fills and one rejects without overspending
PASS: isolated reset and persisted cash
```

This test used the actual public Vercel functions and PostgreSQL database, with a separately created demo account. The six-request replay check asserted one order ID, one cash debit, and one additional history record. Two concurrent NVDA buys had a combined cost greater than $100,000; exactly one returned 201 and the other 400, with nonnegative cash and a consistent final order total. The test reset its own account afterward.

## Browser checks

- Desktop production interface loaded successfully from the public URL.
- A five-share HOOD order filled through the live browser UI for $592.05.
- Activity showed the fill quantity, price, Go matching time, and recorded transaction path.
- Reloading the public app preserved that order in activity.
- No browser console errors were recorded during the production check.
- Mobile layout inspected at 390 × 844: chart, order ticket, bottom navigation, portfolio metrics, and activity.
- Wide holdings tables scroll within their card on mobile; the page itself does not need horizontal scrolling.
- Temporary browser viewport override was reset.

## Dependency audit

Command:

```sh
npm audit --omit=dev
```

Output:

```text
found 0 vulnerabilities
```

The full npm dependency audit during the final install also reported zero vulnerabilities. The Vercel deployment CLI is installed separately from the project's dependency tree.

## Limits

27 automated unit tests passed (18 Django, 6 Go, 3 TypeScript), plus the deployed integration and browser checks above. These are functional and concurrency checks, not a full security audit, accessibility certification, or load test. Data and execution liquidity are synthetic. SQLite is used only for local tests; concurrency assertions ran against hosted PostgreSQL. No Git commits were made.

## Alpaca private-feed integration — 2026-09-14

Final local checks after changing the default stock to NVIDIA:

```text
$ npm run build
vite v7.3.6 building client environment for production...
✓ 2169 modules transformed.
dist/assets/index-cxOtIZga.js 255.20 kB (gzip 79.76 kB)
✓ built in 1.28s

$ npm run lint
> eslint .
(exit 0; no warnings or errors)

$ npm test
Test Files 1 passed (1)
Tests 4 passed (4)

$ .venv/bin/python manage.py test
Ran 22 tests in 0.043s
OK
System check identified no issues (0 silenced).

$ .venv/bin/ruff check .
All checks passed!

$ go test -race ./api ./engine ./cmd/server
ok lot/api (cached)
ok lot/engine 1.426s
? lot/cmd/server [no test files]

$ go vet ./...
(exit 0; no output)

$ go build ./...
(exit 0; no output)
```

Production verification of the Alpaca integration:

```text
$ .venv/bin/python scripts/private_smoke.py
PASS: private IEX quotes for 8 assets; HOOD price 112.59 trade timestamp 2026-09-11T19:59:57.502795494Z chart bars 78
PASS: actual historical chart bars for all 8 symbols
PASS: private Go matching uses IEX reference; cancelled order preserves funds; retry is idempotent
PASS: anonymous direct Go endpoint exposes only simulated data

$ .venv/bin/python scripts/smoke.py https://lot-trading-lab.vercel.app --concurrency
PASS: health, Go quotes, account persistence, multi-level fills, buy/sell ledger, idempotency, conflicting retry, invalid input, no shorting, IOC cancellation
PASS: six simultaneous identical requests create one order and debit cash once
PASS: competing buys exceeding combined buying power serialize; one fills and one rejects without overspending
PASS: isolated reset and persisted cash
```

Browser verification: private sign-in succeeded; real IEX price, date, 78 chart bars, separate $100,000 account, and synthetic-depth labels rendered correctly. Browser error/warning log was empty. No brokerage orders were sent; the private smoke test records a cancelled limit order without changing cash or positions.

After removing the entire Under the hood view, navigation item, and banner:

```text
$ npm run build
✓ 2169 modules transformed.
dist/assets/index-BizHtuxZ.js 251.19 kB (gzip 78.52 kB)
✓ built in 1.25s
$ npm run lint
> eslint .
(exit 0; no warnings or errors)
$ npm test
Test Files 1 passed (1)
Tests 4 passed (4)
$ .venv/bin/python manage.py test
Ran 22 tests in 0.044s
OK
System check identified no issues (0 silenced).
$ .venv/bin/ruff check .
All checks passed!
$ go test -race ./api ./engine ./cmd/server
ok lot/api (cached)
ok lot/engine (cached)
? lot/cmd/server [no test files]
$ go vet ./...
(exit 0; no output)
$ go build ./...
(exit 0; no output)
```
