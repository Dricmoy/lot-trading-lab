# Migrate Lot to Spring Boot and C++

This living ExecPlan follows the execution-plan skill. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current. Work from `/Users/dricmoybhattacharjee/Desktop/lot-trading-lab`.

## Purpose / Big Picture

Replace the running Django account/replay API with enterprise Java using Spring Boot, PostgreSQL transactions, Spring Security, Flyway, health checks and structured logs. Replace the Go execution service with C++ as chosen in the discussion. The React application, existing accounts, passwords, money, order history, replay sessions, comparisons and private Alpaca access must continue to work. The outcome is a running replacement, not a Java scaffold or proxy to Python.

## Progress

- [x] (2026-10-16) Inspect clean main at fd76114, all existing API routes, models, authentication, order services, replay and deployment contract.
- [x] Verify available Java 21 installation and documented Spring Boot / Vercel container support.
- [x] Add a Java build and runnable Spring Boot application with existing database compatibility and additive migrations.
- [x] Preserve registered credentials, account ownership, guest progress, CSRF, session expiry, recovery and private-owner authorization.
- [x] Implement ordinary accounts, transactions, reservations, history and private market/news adapters.
- [x] Implement replay actions, event reconstruction, private comparisons and scripted example in Java.
- [x] Replace Go execution with a compiled C++ engine using an explicit internal protocol.
- [x] Verify local API parity, authentication/security boundaries, concurrency/accounting and actual Django-created saved data.
- [ ] Verify browser flows, private provider access and deployment behavior.
- [ ] Package containers, update local tools/docs/CI, deploy a preview, then switch production after evidence supports parity.
- [ ] Retire Python/Go from the active runtime, audit all requirements and record final evidence.

## Context and Orientation

The current API is `backend/trading/*.py` exposed by `backend/urls.py`; the stateless Go service is `engine/*.go` and `api/engine.go`. React expects the same routes and JSON fields via `src/lib.ts`. `backend/trading/models.py` defines the production PostgreSQL schema: existing `auth_user`, `django_session`, `trading_account`, positions, orders, ledger, order movements, valuation snapshots, replay sessions and events. Money is integer cents. Replay events use canonical SHA-256 fingerprints and deterministic UUID5 order IDs. Existing signed guest cookies and Django PBKDF2 password hashes require compatibility. A single account lock serializes money changes, and each replay session has revision and unique request-key guards.

## Decision Log

Use Java 21 and Spring Boot 4.1.1, explicit JDBC queries and PostgreSQL row locks. JDBC preserves the established schema and makes locking/accounting visible. Flyway owns only additive Java-specific session/recovery tables; it must never clean or replace existing tables. Keep legacy code as a reference until parity and deployment are demonstrated, then remove it from active build/deploy paths. Preserve the existing HTTP/JSON frontend contract.

Spring Security supplies CSRF and security headers. Persistent opaque sessions are server-owned; compatibility code validates Django sessions and signed guest cookies using the existing server secret, with PBKDF2 hash compatibility. No signing key or owner token is rotated. Credentials are never logged. Java calls a compiled C++ executable through a bounded input/output protocol; deployment packages both binaries, with no Python or Go process required. A future persistent exchange/forking engine is separate work; the migration preserves currently available behavior.

Vercel currently documents its OCI container runtime as beta on all plans. Use a container preview to establish actual availability before changing the live alias. Any production schema change must be additive and accompanied by original-row integrity evidence. No user account reset or deletion is authorized as part of migration.

## Plan of Work

Create `server/` for Maven sources in package `com.lot`, separating configuration, identity, account/trading, replay, market adapters and API controllers. Add `matching/` for the C++ engine and its CMake build. Implement shared canonical JSON/hash/UUID utilities before porting replay, so existing events reconstruct exactly. Preserve ordinary legacy fingerprint formatting as well as replay compact canonical formatting.

Use existing production tables with additional Java session/recovery tables. Authenticate existing Django hashes and bridge valid legacy cookies/sessions. Record session revocation using the user's password hash so changing a password invalidates other sessions. Use database-backed rate limits. Never accept a browser-provided internal market authorization header.

Implement ordinary trading with account row locks and replay with session row locks. Validate every execution response before accounting. Add equivalent data observation/history and owner-only market/news behavior. Port deterministic scenario paths, rounding, cost basis, reservations and action fingerprints without rewriting stored records. Comparison reconstructs observed owned completed sessions and keeps public scripted examples separate.

Finally update Vite, container files and CI; demonstrate local and preview behavior with disposable identities. Capture counts and hashes of preserved data without exposing account contents. Promote only after the Java health endpoint and rendered app establish the actual runtime.

## Concrete Steps

Use the installed JDK under `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`. Bootstrap a pinned Maven distribution into a gitignored project tool folder if Maven is unavailable. Package the Java application with Maven, build C++ with CMake, and run against a separate local PostgreSQL database. Point Vite's `/api` proxy at Java on port 8080. Keep legacy local services available on their old ports for parity checks until cutover.

The user goal explicitly requires verification. Run contract/security/accounting checks against the Java service, include concurrent money and replay actions, and inspect actual browser trading/replay/comparison flows. Use only disposable accounts for mutations. Production verification reads existing records and performs mutations solely on fresh disposable identities.

## Validation and Acceptance

Every route currently in `backend/urls.py` and `/api/engine` must be served by Java/C++, including private feed failures, recovery configuration failures, comparison reconstruction and revoked shares. Registered users retain credentials and data. Copied guest cookies cannot access registered accounts. Missing CSRF and cross-origin mutations fail. Retry keys do not double-debit or double-advance. Competing requests cannot overspend, oversell, overreserve or bypass replay revision checks. Existing replay state hashes reconstruct identically.

After deployment `/api/health` identifies the Java service, the frontend completes ordinary buy/sell/resting cancellation and replay/decision inspection, and no Python/Go handler remains in the active deploy path. Build, runtime observations and residual limitations are recorded here and in migration documentation. A scaffold, Java-to-Django proxy, missing feature, failed migration or unavailable deployment does not satisfy completion.

## Idempotence and Recovery

Keep the current production deployment active until a preview is proven. Additive migrations can run repeatedly through Flyway. Never execute Flyway clean, reset accounts, rotate secrets or overwrite existing rows for convenience. Preserve the previous deployment as rollback; avoid new data formats that it cannot read. Record command/event representations compatible with the existing implementation during transition.

## Surprises & Discoveries

Legacy Django inherited its global America/Chicago timezone. Its reset-token timestamp counts naive local seconds since 2001; interpreting that timestamp as UTC rejected still-valid links by several hours. Java now uses the original timezone for the compatibility verifier, proven with a real Django-generated token accepted once by Java. New Java recovery uses absolute UTC expiry.

PostgreSQL now() is the transaction start time. Requests waiting on an account lock can otherwise write cash movements with timestamps preceding earlier commits. New ledger and replay writes use clock_timestamp() so reconstruction follows application order. Canonical ordinary fingerprints preserve Python's spaces and its treatment of whitespace-only notes; replay fingerprints preserve compact sorted ASCII JSON.


The default `java` command is a macOS stub, but Homebrew already has OpenJDK 21.0.11. Maven is absent. The filesystem has about 14 GiB free, so use existing tools and bounded container caches. Vercel's container runtime is now documented; current account/CLI compatibility still needs direct deployment evidence.

## Outcomes & Retrospective

Local Java/C++ services run against a separate PostgreSQL 17 database. Maven verify passes 19 tests, including nine legacy replay scenario/friction cases with state after each action. The C++ protocol oracle passes 144 executions, four books and eleven rejected inputs. Existing HTTP auth and replay smoke scripts pass. The new local-only `scripts/java_compatibility.py` creates records through Django and proves existing sessions, Unicode PBKDF2 hashes, signed guests, cash/positions/watchlists, ordinary retry fingerprints, completed replay reconstruction, guest promotion, recovery tokens, session revocation and six concurrency patterns work through Java. Java's read-only reconciliation reports 23 accounts, nine orders, twelve replays and no problems after these checks.

Production remains the old deployment. An original-row hash manifest for all eleven legacy data tables is saved locally with permissions 0600, without record contents. Production and preview environment URLs point at the same database; the initial container preview attempted a separate schema. Hosted transaction pooling lost session search-path settings, so that attempt did not isolate table creation as intended: Flyway history went into the preview schema and two empty Java-specific tables were added in public. A read-only before/after check proved all original records in all eleven legacy tables unchanged. The broken preview did not pass signup and must never be promoted. A separate empty database named `lot_java_preview_20261016` was then created on the same existing PostgreSQL cluster; its private URL is in the ignored `.tools/preview-database-url`. The current candidate overrides DATABASE_URL to that database and uses no schema overrides. Never promote a candidate with a preview database URL. A first preview with framework null built static assets only; it is not Java deployment evidence. Framework container is now explicit for the next attempt. Browser, actual container, provider and production checks remain required.

Plan created October 16 after the explicit user goal to make the Java change happen; the earlier Java/C++ architecture choice remains in scope.

Updated October 16 with local compatibility/concurrency evidence, the reset-token timezone correction, integrity capture and isolated container-preview steps. Deployment is still incomplete.


October 16 deployment update: container framework must be explicit (`framework: container`); framework null produced only static assets. Container deployment dpl_ARYD2NoSHsyWFYq1Qg3YXzMX4QCi proved Java/C++ health, HTML deep links, in-memory comparison and MP4 byte-range delivery, but failed registered signup because schema settings do not survive hosted transaction pooling. The separate-database replacement is building as dpl_5oVbJQ6AbydZ6DdXi8fUmGgsSRN5, production environment with --skip-domain, the disposable DATABASE_URL override and opt-in LOT_VERIFY_PRIVATE=1. This gives the container existing server-only provider credentials for read-only verification without changing the live alias or real account database. The opt-in probe logs only counts/source/status and invokes no brokerage endpoints. Do not enable this diagnostic in the final production deployment.

Production's original data has now been reconstructed and reconciled by the actual Java code with Flyway disabled and a PostgreSQL read-only repeatable-read snapshot: 25 accounts, four orders, seven saved replays, problems empty. The standalone audit wrapper supplies only a process-local ephemeral initialization key when the platform cannot export the real signing secret; it does not authenticate sessions, issue cookies or change any deployed key. An earlier audit with FOR UPDATE was rejected in read-only mode; the audit now uses snapshot reads, and the final read-only run passed.

Local browser verification on the Java-served built frontend (port 8081) completed an ordinary simulated buy, created a replay, persisted a plan/order and advanced its clock with correct valuation. Run immutable copies of packaged jars when rebuilding locally: rewriting a running Spring Boot jar can break lazy class loading. Current immutable local runtime path is recorded in `.tools/current-runtime`. The owned local Flyway checksum was adjusted only for the unpublished V1 change adding IF NOT EXISTS around the new Java tables/indexes; no production checksum was edited. This makes startup safely accept the empty Java tables created by the failed preview attempt.
