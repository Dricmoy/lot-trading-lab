# Published release — October 5, 2026

Production: https://lot-trading-lab.vercel.app
Deployment: `dpl_AQtVWsUb78iEdK8NXfpvXXb9Mo7G` (`https://lot-trading-i7pcg1i1n-dricmoys-projects.vercel.app`). Vercel reported READY and assigned the public production alias. Runtime build selected Python 3.12 from `.python-version`; Node 24 remains configured.

## Approved release and data preservation

The user explicitly approved publication and requested a recorded walkthrough plus no-signup demo access. Additive Django auth/content-types/session/trading migrations were applied before deployment. The migration helper compared ordered contents of all existing trading rows before and after: 18 accounts, 42 positions, two orders, and two ledger entries were preserved. Production signing/owner secrets were not exported. A migration-only ephemeral key was used locally; deployed cookie signing continues to use the existing production secret.

## Live acceptance

- `scripts/auth_smoke.py https://lot-trading-lab.vercel.app`: PASS. Fresh registered account, CSRF, actual Go quotes/fills, buy/sell cash and positions, replay safety, conflicting retry, cancelled limit, insufficient cash/shares, logout, restoration in another session, saved watchlist, identity isolation, password change, and reset of the separately created test account.
- `scripts/smoke.py https://lot-trading-lab.vercel.app`: PASS. New isolated guest account, multi-level fills, buy/sell ledger, idempotency, conflicting/invalid requests, no shorting, cancelled limit, and isolated reset/persistence. Existing user accounts were never reset.
- Browser: landing → Try the demo → `/demo`, with no registration or login form. Search selected Apple and review showed two shares and estimated cost. Portfolio and phone navigation worked. The existing guest account used for UI review was not traded or reset.
- Public walkthrough playback: actual `paused=false`, `readyState=4`, 1440×1024 decoded video, duration 40.167 seconds. Poster, captions, accessible play overlay, transcript, native controls, and direct-video fallback are present.
- Asset responses: MP4 200 `video/mp4`, 873,005 bytes; poster 200 `image/jpeg`; captions 200 `text/vtt`. A byte-range request returned 206 `bytes 0-31/873005`. `/demo`, `/signup`, and `/api/health` returned 200.
- Public browser console error log after the review: empty.
- New layout review: public landing/video and demo at 1280×720 and video at 1440×1024; phone video/portfolio at 390×844. Additional local video checks at 1440×1024 and 320×740. No page-level horizontal overflow in the inspected phone states.
- Final extension checks: build/lint passed, nine frontend tests passed, 35 Django tests passed, Ruff passed, no missing migrations, and clean whitespace. Unchanged Go race/vet and dependency-audit evidence is recorded below.

## Remaining configuration

No production SMTP provider is configured. A live recovery request returned HTTP 503 with “Password recovery is temporarily unavailable. Please try again later.” Actual email delivery is not claimed. The provider question is pending the user; secure setup is documented in `docs/AUTHENTICATION.md`.

## Recorded video provenance

The 40-second walkthrough records the actual local running product and guest buy/sell/portfolio/history flow. It uses 355 browser-captured frames delivered as H.264, with gaps between recording sections removed, no audio, and descriptive captions. Source frames/manifest stay in the ignored `.sites-runtime/recording/`; publication includes only video, poster, captions, and provenance.

---

# Verification — October 5, 2026 redesign

Scope: the local checkout at `/Users/dricmoybhattacharjee/Desktop/lot-trading-lab`, served by actual Vite, Django, and Go processes. This local evidence preceded the published release above. Older September public-deployment evidence below applies to the previous version only.

## Final automated checks

| Check | Result |
| --- | --- |
| `npm run build` | Passed: TypeScript and production Vite bundle |
| `npm run lint` | Passed, no findings |
| `npm test` | 9 tests passed across 2 files |
| `.venv/bin/python manage.py test` | 35 tests passed; system checks clean |
| `.venv/bin/ruff check .` | Passed |
| `.venv/bin/python manage.py makemigrations --check --dry-run` | No missing migrations |
| `go test -race ./api ./engine ./cmd/server` | API and engine suites passed; server has no test files |
| `go vet ./api ./engine ./cmd/server` | Passed |
| `npm audit` | Zero reported vulnerabilities, including development dependencies |
| `git diff --check` | Passed |

Authentication checks include hashed passwords, fresh cash accounts, CSRF, ownership despite copied cookies, guest promotion, restored holdings/history/watchlists, login throttling, password validation, password changes, revocation of other sessions, and one-use recovery tokens. Frontend state tests check that late account, order, market, preference, reset, and connection responses cannot repopulate an earlier identity after logout or account switching.

## Integration against running services

Commands:

```sh
.venv/bin/python scripts/auth_smoke.py http://127.0.0.1:5173
.venv/bin/python scripts/smoke.py http://127.0.0.1:5173
```

Results:

```text
PASS: registered account, CSRF, real market API, buy/sell cash and positions,
      safe retries, limits, insufficient cash/shares, logout, new-browser
      restoration, saved watchlist, identity isolation, password change,
      own-account reset
PASS: health, Go quotes, account persistence, multi-level fills, buy/sell ledger,
      idempotency, conflicting retry, invalid input, no shorting, IOC cancellation
PASS: isolated reset and persisted cash
```

The matching calls used the running Go service, not mocked fills. A huge AAPL order initially proved that finite synthetic liquidity can produce an affordable partial fill: insufficient cash must be asserted against executable fill cost, not requested notional. The final insufficient-cash scenario uses MSFT liquidity whose actual executable cost exceeds the available balance.

## Browser journey

A disposable local identity registered through the UI with $100,000 cash and no holdings. The browser searched AAPL, reviewed and bought two shares for $474.84, then sold one for $237.35. The resulting cash was $99,762.51 with one AAPL share. Portfolio and activity showed those changes. Logout/login restored the same cash, position, and orders. A $1 NVDA limit cancelled without changing cash. Password recovery generated a local email, the link set a new password, and login with that password restored the saved account.

Responsive checks covered 1440×1024, 1024×900, 768×1024, 390×844, and 320×740. No page-level horizontal overflow was found in the inspected states. Holdings tables scroll inside their container. The reset dialog dismissed with Escape without clearing the test portfolio. Sidebar labels, menus, signup, login, recovery, and password reveal controls were inspected. Browser console error log: empty.

Evidence is in `docs/screenshots/`. The selected concept and browser implementation were compared together at full-view and focused scales; see `design-qa.md` for corrections, normalization, intentional differences, and the passing local result.

## Hosting readiness and limits

Read-only Vercel metadata confirms the existing `dricmoys-projects/lot-trading-lab` project, Node 24, and database/application secret configuration. No SMTP or sender variables are configured. Production publishing must apply the additive Django authentication migration, configure email, deploy, and exercise the live authentication and trading flow. See `docs/AUTHENTICATION.md`.

Local checks use SQLite. The new authentication changes have not been tested on hosted PostgreSQL, in other browser engines, under load, or through an independent security/accessibility audit. Real private Alpaca delivery was not re-tested in this local redesign. Public-market prices and all executions remain simulated. No remote source, environment, database, or deployment was changed.

---

## Archived evidence from the earlier public version

The following record is retained for historical context. It is not evidence that the October redesign is deployed.

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

## October 5, 2026: polished recorded demo follow-up

The landing now plays a 48.366667-second, 1920×1080, 60 fps H.264 film from a new genuine guest-session recording. Smooth camera zooms track actual clicks; an animated pointer and click pulses clarify actions. Eight view crossfades, chapter copy, and animated opening/closing titles complete the edit. New poster/captions/transcript and versioned assets accompany it. The play overlay stays off after completion so the closing invitation remains readable.

All 2,902 frames decoded. Local desktop and 390×844 phone playback reached the end; no inspected phone horizontal overflow. Public playback reached `ended=true` with the correct duration/dimensions and no console errors. Public MP4 returned 200 `video/mp4`, matched the reviewed local SHA-256, and returned 206 for byte ranges. Poster/captions and `/api/health` returned 200. Production deployment: `dpl_VPEowvjXCiRE9NkwD4iuYWzUaKHU`, READY and aliased to the existing public site. Build, ESLint, Ruff, and whitespace checks passed; no test suites were added or run for this media-only follow-up. Full evidence: `docs/DEMO_FILM_QA.md`.
