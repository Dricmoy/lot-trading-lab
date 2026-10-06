# Build Lot's replay and learning release

This living plan follows the execution-plan skill. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current. Repository: /Users/dricmoybhattacharjee/Desktop/lot-trading-lab. Existing production: https://lot-trading-lab.vercel.app. React/TypeScript lives in src; Django accounts and the cash ledger live in backend/trading; Go computes ordinary simulated executions in engine and api/engine.go. PostgreSQL persists production data, SQLite supports local work. Local services are Vite :5173, Django :8000, Go :8001.

## Purpose / Big Picture

A visitor can enter without signup, choose one of three reproducible synthetic market sessions, reveal prices progressively, trade with a reason, and review their decisions against a holding benchmark. They can resume after reloading, write reflections, retry the same scenario, and explicitly share a finished recap. The regular workspace gains resting limit orders, journal entries, portfolio history, and clearer execution explanations. The README prominently links the recorded demo and live replay. Reliability and usage evidence support honest engineering claims.

## Progress

- [x] (2026-10-05) Read current repository, skills, account isolation and routes; confirm clean checkout.
- [x] (2026-10-05) User chose the full roadmap. Ask for the remaining SMTP provider configuration while independent work continues.
- [x] Implement persistent replay, progressive prices/news, trading journal, friction settings, benchmark, drawdown, repeat sessions, and explicit sharing.
- [x] Build responsive replay library, controls, order review, journal, recap, and shared session page.
- [x] Implement regular resting limits with reserved cash/shares, cancellation, and quote-driven settlement; preserve existing immediate-or-cancel behavior.
- [x] Persist valuation history, compute measured returns, add regular trade notes, and explain executions.
- [x] Add optional owner-only real Alpaca news, usage counters, structured operational logging, reconciliation evidence, and CI.
- [x] Update README with linked demo poster/video, feature walkthrough, architecture, constraints, and reproduction instructions.
- [ ] Exercise real flows and reliability cases, inspect desktop/phone, build/lint, migrate safely, publish, and verify public behavior.

## Decision Log

Replay is server authoritative: the browser receives only observed prices/news, never future bars. Scenario definitions are synthetic and versioned in backend/trading/replay.py; replay money is independent of ordinary account cash. Transactions lock each session, and unique request keys plus fingerprints prevent duplicated actions. The client sends a version number to prevent stale tabs from overwriting current state. Reason and reflection fields remain private unless a user explicitly includes them in a shared recap.

The replay UI keeps forest #172b20, ivory #f6f8f3, lime #c9f17e, existing Manrope/DM Sans, and a price chart as the focal element. A quiet timeline and playback toolbar represent actual progress. Library choices have specific learning goals; motion responds to actions, with reduced-motion support. The chart ends at the present step.

Resting means an order remains open across requests until filled, cancelled, or expired. Ordinary limit evaluation occurs on an explicit CSRF-protected POST when the workspace checks quotes, bounded to one evaluation per quote bucket. It is not a continuously running exchange. Reservations hold buying power/shares without prematurely debiting cash. Existing Go execution remains stateless. Network calls under account locks remain a documented bounded tradeoff; no claim of an asynchronous exchange or distributed exactly-once processing is made.

Portfolio tracking starts with the first observed snapshot. The holding comparison uses that snapshot's cash and quantities; it does not invent prior valuations. Account resets begin a new history epoch while preserving old snapshots. New cash anchors allow reconciliation from opening cash plus recorded movements; historical anchors are computed from existing rows. Resting-order continuation fills use an additive movement table so existing ledger rows remain unchanged.

Real news uses the existing Alpaca credentials only for the authenticated owner workspace, with source/time/link attribution and no public redistribution. Synthetic replay dispatches are authored content, explicitly fictional, and reveal at the session clock. No paid subscription is created. SMTP setup needs user/provider input; no credential is requested in chat. Actual five-person research needs participants; provide the research script and instrument observable completion events without inventing usage results.

## Context and Orientation

src/Site.tsx handles routing and landing/auth pages. src/App.tsx owns the workspace sidebar and Trading/Portfolio/Activity views; src/store.ts handles identity and request races. New src/Replay.tsx and src/replay.css add the learning experience. backend/trading/views.py resolves an account from the registered session or signed guest cookie. All new private endpoints reuse that resolver and Django CSRF protection. A shared UUID grants access only to the deliberately published sanitized recap. backend/trading/models.py and additive migrations persist sessions, actions, snapshots, continuation fills, and journal metadata. Monetary values remain integer cents and share quantities whole integers.

## Plan of Work

First add ReplaySession and ReplayEvent models plus backend/trading/replay.py. The catalog exposes descriptions and parameters, not price paths. Collection POST starts a fresh session with $100,000; detail POST advances, places/cancels orders, saves reflections, finishes, shares, or revokes sharing. Session serialization returns the observed prefix, current cash/shares, order journal, valuation history, benchmark and drawdown. Equal-key retries return current state without repeating the action; conflicting payloads or stale versions return 409.

Next wire Replay into the sidebar and /replay routes, and a public /s/<token> recap. Sessions have play/pause, speed, next-moment and skip controls; pending trade review pauses playback. Sessions and notes reload from the server. Completion exposes comparison, costs, journal reflection and retry/share actions. A shared viewer can try the same scenario without signup.

Then extend ordinary Order metadata for time in force, limit, reasons/reflections, and realization. Add a continuation-fill movement table and valuation snapshot. Compute reservations from remaining open orders and enforce them on every new order. A settlement endpoint locks the account, checks bounded open orders, applies validated Go fills, records cash movements and snapshots, then returns current account and history. Cancellation releases reservations. Snapshot values come from server quotes and held quantities.

Finally implement owner-only news, privacy-preserving request logging and aggregate learning counts, a reconciliation command, and a CI workflow using current project tooling. Put the demo poster with a clickable live video link near the top of README; GitHub Markdown cannot reliably play a local MP4 inline. Record measured evidence separately from proposed research. Apply migrations first through scripts/migrate_production.py, which compares hashes of pre-existing columns/rows before and after. Deploy with the existing Vercel project and prior publication approval, then verify the public UI and API.

## Concrete Steps

From /Users/dricmoybhattacharjee/Desktop/lot-trading-lab generate and apply local migrations with .venv/bin/python manage.py makemigrations and .venv/bin/python manage.py migrate. Build with npm run build; lint with npm run lint and .venv/bin/ruff check .; compile Go with go build ./api ./engine ./cmd/server. Reliability evidence requested by the full roadmap includes the existing npm test, .venv/bin/python manage.py test, and go test -race ./api ./engine ./cmd/server suites, plus bounded manual HTTP retry/concurrency/reconciliation observations. Do not claim measured results until run.

Production additive migration uses npm exec --yes --package=vercel -- vercel env run --environment production --project lot-trading-lab --scope dricmoys-projects -- .venv/bin/python scripts/migrate_production.py. Secret values must not be printed. Publish with npm exec --yes --package=vercel -- vercel --prod --yes --scope dricmoys-projects. Preserve existing records and use only fresh disposable guest sessions for exercised trading.

## Validation and Acceptance

Open /replay, start each scenario, verify no future bars/news in API responses, buy/sell with a saved reason, reload, pause/advance/change speed, and finish. Recap metrics must reconcile with the recorded cash/shares and revealed path; retry starts independent cash on the same path. Pending limits reserve buying power, fill only when eligible, release on cancellation/finish, and cannot overspend or oversell. Notes and session IDs belonging to another account return 404. Shared pages exclude notes by default and stop working after revocation.

In the normal workspace place a non-crossing resting limit, observe reserved cash, reload, cancel and observe release. Existing IOC semantics and idempotent retries remain intact. Historical analytics label their tracking start; no prior data is fabricated. Inspect 390px and desktop layouts, keyboard controls, empty/error states, and screenshots. Publish asset/API status, actual flows, reconciliation, CI setup, and measured load limitations in docs/REPLAY_VERIFICATION.md.

## Idempotence and Recovery

New tables and defaulted columns are additive. Original account/position/order/ledger values are hashed using original column sets during production migration; capture hashes/counts only, never credentials or personal fields. Failed actions roll back; replay version/key errors advise refresh or reuse the same key. Existing video assets remain unchanged. If publication fails, keep local work and the prior production deployment; retry only after resolving the failure. Do not reset user accounts or delete existing sessions.

## Interfaces and Dependencies

Use existing Django, React, Recharts and lucide dependencies. ReplaySession stores account, scenario/version, state, start key, optional shared UUID and note-sharing choice. ReplayEvent stores session/key/fingerprint/action/payload/time. A replay state has integer cash, quantity and cost, observed step, revision, orders, and valuation points. Private responses use no-store. Ordinary Account serialization adds reserved balances and metrics; new Order fields are optional in TypeScript for older records. POST endpoints always validate body types, quantities, lengths, UUIDs, ownership and idempotency keys before mutations.

## Surprises & Discoveries

The current engine intentionally uses immediate-or-cancel for both market and limit orders; persistence and reservation support must be added separately. The production app already has private Alpaca credentials, allowing owner news without a new provider. NewsAPI's developer tier forbids production use. Existing monetary/account safeguards and idempotency are present; preserve their public contracts.

## Outcomes & Retrospective

Functional implementation and local integration are complete. All 57 Django tests passed on disposable PostgreSQL 16, including six four-worker concurrency cases. Frontend build/lint and 10 tests passed; Go race tests/vet passed. Three full replay scenarios, ordinary resting cancellation/history, and existing auth/trading integration checks passed. Migration, publication and public verification remain. SMTP provider input and actual participant research are external dependencies; independently complete and publish the functional product/engineering release and state any remaining external setup precisely.

Plan updated October 5: expanded from the recommended replay release to the full roadmap after the user's explicit selection.

October 6 discovery: the in-app browser viewport capability silently left the page at 1280x720 after requesting 390x844, including a fresh tab/reload. Reset the override. Responsive code was reviewed but actual phone visual verification remains unclaimed; record the limitation in release evidence.

October 6 production migration: 0003/0004 applied; original-column hashes preserved 21 accounts, 42 positions, 2 orders, 2 ledger rows. Production cash/fill reconciliation passed (21 accounts, 2 orders, 0 prior replays). No production credentials were printed or replaced.

Phone review recovery: a local 390x844 iframe containing the actual app exercised responsive CSS, order failure/recovery, buy and recap. Document clientWidth equaled scrollWidth (375px excluding scrollbar). Actual mobile browser engines remain untested. Initial production deployment and all public replay HTTP checks passed; GitHub Actions run 37422666410 passed.
