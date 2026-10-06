# Complete Lot's trading experience

This is a living execution plan maintained using the execution-plan skill. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current.

## Purpose / Big Picture

Visitors should arrive at a polished Lot landing page, create an account or try a guest workspace, buy and sell simulated stocks, and see cash, holdings, and trade history update correctly. Registered users should be able to sign out and restore their portfolio by signing in again. Every page should remain usable on a phone. The selected visual is the first displayed concept, saved at `/Users/dricmoybhattacharjee/.codex/generated_images/01a10f30-f21b-78a0-9eee-56ece1e426d3/exec-9562f48e-9adb-4544-a5c3-5640b5aae84e.png`: forest sidebar, light workspace, large typography, chart and order ticket side by side.

## Progress

- [x] (2026-10-05) Clone authoritative public source and inspect existing trading/account behavior.
- [x] (2026-10-05) Inspect Wealthsimple's current home-page voice as a reference for original Lot copy.
- [x] (2026-10-05) Implement persistent user identity, registration, sign-in, sign-out, password management, and account isolation.
- [x] (2026-10-05) Add landing and authentication pages; apply selected visual direction to the workspace.
- [x] (2026-10-05) Make phone and tablet navigation, forms, charts, tables, and dialogs usable.
- [x] (2026-10-05) Prove registration, trades, portfolio/history, reload, sign-out/sign-in and isolation with real local services.
- [x] (2026-10-05) Complete automated checks and visual QA against the selected concept; prepare reviewable changes.
- [x] (2026-10-05) User approved publishing the reviewed update and account migrations.
- [x] (2026-10-05) Record and embed the real 40-second walkthrough; add prominent no-signup `/demo` entry.
- [x] (2026-10-05) Apply production migrations with existing-row preservation, publish, and verify live accounts, trading, demo, and video.
- [ ] Configure the user-selected email provider and verify actual recovery email delivery.

## Surprises & Discoveries

The repository already has a Django cash ledger and a Go matching engine. Accounts are signed browser cookies and lack multi-device user identity. The public page responded to HTTP but remained in a loading state when previously opened; serving HTML alone does not prove trading works. A very large AAPL request can fill only the available synthetic depth for less than $100,000, so requested notional alone does not establish an insufficient-cash scenario. The integration check now uses MSFT executable fills that exceed the available balance. Legacy responsive styles imposed a 28px watch button width and hid sidebar text; intrinsic sizing and explicit accessible names fixed the resulting clipping and unnamed buttons.

## Decision Log

Decision: Keep the existing React, Django and Go architecture and add Django's established password/session authentication. Registered account ownership is stored on the account record. Guest practice remains available and can be claimed during registration. Rationale: preserve working accounting while making identity real. Date: 2026-10-05.

Decision: Write original Lot copy inspired by the direct product language on Wealthsimple's official site. Keep clear disclosures that funds and executions are simulated. Rationale: the user's request calls for appropriate product messaging, not copied brokerage claims. Date: 2026-10-05.

## Outcomes & Retrospective

The local landing, account, trading, portfolio and activity flows are implemented. Final checks passed: 9 TypeScript tests, 35 Django tests, Go race tests/vet, build, lint, Ruff, migration consistency, real-service integration, and dependency audit. Browser flows verified registration, buy/sell accounting, restored identity, cancelled limits, password recovery, and responsive layouts. `design-qa.md` records a passing local visual review. Remote source, environment, database, and deployment changes remain unpublished. Final live completion requires publishing approval and SMTP configuration; the existing host has no email variables configured. Email setup instructions are prepared in `docs/AUTHENTICATION.md`.

## Context and Orientation

The checkout is `/Users/dricmoybhattacharjee/Desktop/lot-trading-lab`. `src/App.tsx` currently contains trading, portfolio, activity and order-review views; `src/store.ts` owns account/market requests. `backend/trading/views.py` resolves account cookies. `backend/trading/services.py` makes one database transaction containing fills, holdings, cash and ledger updates. `engine/engine.go` calculates simulated fills, with Go's local HTTP service on port 8001. Django runs on port 8000 and Vite on port 5173. Vite proxies API calls to those services. Money is integer cents, preventing floating-point cash errors.

## Plan of Work

Add optional user ownership and saved watchlists to Account without changing existing records. Install Django auth, content types and session applications, then provide JSON authentication endpoints that enforce cross-site request forgery protection. Use server sessions, password validation/hashing, generic login/reset errors, persistent throttling, and account isolation. Add password recovery with Django's token mechanism and configurable email delivery; local mail is saved outside source control for verification. Add route-aware landing, registration, login and recovery pages. Keep the existing trading execution implementation and reshape its presentation to the selected concept. Replace internal engineering copy with useful trade information. Add coherent responsive styles, keyboard focus and reduced-motion behavior. Verify against real local services and use browser screenshots at desktop, tablet and phone sizes.

## Concrete Steps

From the checkout run `npm ci`, create `.venv` with `/opt/homebrew/bin/python3.12 -m venv .venv`, install `requirements-dev.txt`, generate/apply migrations, then start `go run ./cmd/server`, `.venv/bin/python manage.py runserver 127.0.0.1:8000`, and `npm run dev -- --port 5173`. Use separate persistent terminal sessions. Run `npm run build`, `npm run lint`, `npm test`, `.venv/bin/python manage.py test`, `.venv/bin/ruff check .`, and `go test -race ./api ./engine ./cmd/server`.

## Validation and Acceptance

A fresh browser starts at the landing page. Registration with a valid email and password opens a $100,000 cash practice account. Buying two AAPL shares decreases cash by the actual simulated fills and adds two shares; selling one adds cash and leaves one. Activity shows both orders. A non-crossing limit leaves money/holdings unchanged. Reload and sign-out/sign-in retain records. A second identity starts separately. Incorrect passwords, missing CSRF, stale cookies, insufficient funds and excessive sells are rejected without account mutations. Password recovery works through a one-use emailed link. Watchlist choices survive a new session. Browser checks at 1440, 1024, 768, 390 and 320 pixels show no page overflow or blocked primary controls. Visual QA documents comparison with option 1. Public deployment is only claimed after publishing and exercising the live flow.

## Idempotence and Recovery

Migrations are additive and repeatable. Local test accounts use only virtual funds in the local SQLite database. Never reset existing remote accounts. Retried orders reuse the existing idempotency key. Do not expose or print credentials. Keep local changes reviewable before any remote publishing.

## Artifacts and Notes

Final evidence belongs in `docs/VERIFICATION.md` and `design-qa.md`, including exact commands, results, browser journey and remaining deployment requirements.

## Interfaces and Dependencies

Use Django's built-in User, session middleware, password validators and reset token generator. JSON auth responses include the current user and owned Account. Frontend routes cover `/`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, and `/app`; existing Trading, Portfolio and Activity remain inside the app. Auth state resolves before loading any account. Guest account cookies may only access accounts with no registered owner. Password changes invalidate other sessions. All account mutations remain behind CSRF protection.

Revision: initial plan written after source inspection, preserving the full user objective and the selected visual reference.

Revision: October 5 local implementation and verification complete. Preserve the outstanding production migration, email configuration, publishing authorization, and live acceptance checks; do not claim the full public goal complete yet.

Blocked audit (2026-10-05): the same launch dependencies remained across three consecutive goal turns: no human approval to publish/apply production migrations, and no production email provider configuration. All requested local implementation and verification is complete; no further independent implementation is required. Read-only hosting inspection confirms production still uses the September 14 deployment `dpl_2pBgB7ZCjWWfeQQjgmZ1b24uGCfk`. Keep the full objective intact. Resume with publishing approval and an email provider configured securely; then migrate, deploy, and verify live trading/authentication and actual recovery email delivery.

Revision: User approved publishing and requested a recorded landing-page video plus immediate demo entry without signup. Approval resolves the earlier publication blocker. Email provider selection is pending a separate user reply; continue all independent release work.

Revision: Approved release deployed as `dpl_AQtVWsUb78iEdK8NXfpvXXb9Mo7G`, with the production alias assigned. All existing trading rows were preserved by migration. Live registered and guest integration checks passed; video playback and byte ranges passed. Source recording contains actual local trades, not mocked imagery. SMTP remains unconfigured; the current provider-selection question is pending. Publication is complete; actual recovery delivery is the remaining auth configuration dependency.
