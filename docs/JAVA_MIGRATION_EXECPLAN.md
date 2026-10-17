# Migrate Lot to Spring Boot and C++

This completed ExecPlan follows the execution-plan skill. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current if extending the migration. Repository: `/Users/dricmoybhattacharjee/Desktop/lot-trading-lab`.

## Purpose / Big Picture

Replace Django and Go in the running application with Java and C++ while preserving accounts, credentials, virtual cash, positions, trades, replay sessions, journals, comparisons, private provider access, the frontend and recorded demo. The public application now runs the replacement at https://lot-trading-lab.vercel.app. Its `/api/health` identifies Java and C++; opening `/replay/compare?example=1` displays the same interactive decision tree, reconstructed by Java.

## Progress

- [x] (2026-10-16) Inspect clean main fd76114, every legacy API route, models, authentication, trading, replay and deployment contract.
- [x] Add Java 21, Spring Boot 4.1.1, JDBC transactions, Spring Security and additive Flyway migrations.
- [x] Preserve old PBKDF2 passwords, signed guests, compressed Django sessions, ownership, recovery links and private-owner identity.
- [x] Implement ordinary accounts, reservations, ledger, journal, observed portfolio history and private market/news adapters.
- [x] Implement deterministic replay, event reconstruction, private comparisons and the public scripted example in Java.
- [x] Replace Go execution with the compiled C++20 executable and a bounded numeric protocol.
- [x] Verify all nine scenario/friction combinations against legacy state fixtures; pass 20 Java and ten frontend tests.
- [x] Verify 144 C++ executions, four books and eleven rejected inputs.
- [x] Verify real Django-created data, Unicode identities, recovery, concurrency, request boundaries and execution failures locally.
- [x] Verify native browser trading, replay, saved plan/reflection and decision inspection, plus the public decision tree after cutover.
- [x] Build the actual Linux container on Vercel; verify a separate-database deployment and private provider counts.
- [x] Preserve every captured original record across eleven production tables; reconcile actual production records through Java.
- [x] Verify the staged original-database deployment, switch the public alias, and rerun public checks without a bypass token.
- [x] Retire Python/Go from active deployment and CI paths, retain source as an oracle, update README/demo and verification documentation.

## Context and Orientation

React and TypeScript remain in `src/`. The Java application is `server/src/main/java/com/lot/`, built with the pinned Maven wrapper in `server/`. `Identity` and `AuthController` own authentication; `Accounts` owns account transactions; `MarketData` selects synthetic or owner-only provider inputs; `ReplayEngine` applies deterministic replay actions and reconstructs decisions; `ReplayService` persists owned sessions and events; `Reconciliation` provides an offline read-only audit. `matching/main.cpp` is the C++ executable, built with CMake. `Dockerfile.vercel` packages the JRE, C++ executable and built React assets. Vercel explicitly selects the container framework.

Legacy Python remains in `backend/` and `api/index.py`; Go remains in `engine/`, `cmd/` and `api/engine.go`. These paths are excluded from deployment. No Java endpoint forwards requests to them. They support development compatibility checks only. The existing PostgreSQL schema remains authoritative: auth_user, django_session and the trading account, position, order, ledger, order movement, portfolio snapshot, replay session, replay event and throttle tables. Money is integer cents. Java adds opaque-session and recovery-token tables; Flyway never cleans or replaces application data.

## Milestones

The first milestone made the Java application runnable against an isolated PostgreSQL database, retaining the exact route/JSON contract. Registered passwords and signed identity formats remained verifiable with the original signing key. It is demonstrated by the local Django-to-Java compatibility harness, including actual old session records and recovery tokens.

The second milestone ported trading, reservations, history, provider selection, replay and comparisons, then replaced stateless execution with C++. State fixtures cover the complete replay path for three scenarios and three friction settings. HTTP checks demonstrate account cash and replay cash remain independent, retries do not duplicate operations, and requests cannot spend reserved resources.

The third milestone built and exercised the real Linux container. A failed schema-isolation experiment exposed transaction-pool behavior; a separate database replaced it. A server-only provider probe confirmed eight assets, 78 bars and five attributed headlines without printing their contents. The final production deployment omits this diagnostic flag and uses the original database and signing key.

The final milestone captured original-row fingerprints, verified additive startup migration, reconciled actual saved records in Java, checked a staged deployment, assigned the public alias, and reran public HTTP/browser verification. All original records remained unchanged after those checks. The README retains the recorded demo and now explains Java/C++ development and verification.

## Decision Log

Use Java 21 and Spring Boot 4.1.1 with explicit JDBC and PostgreSQL row locks. This preserves the established schema and keeps account/ledger transactions visible. Spring Security supplies CSRF, cookie and header protections. Guest signatures and old sessions continue using the existing DJANGO_SECRET_KEY; no secret or owner token is rotated.

Use a compiled C++ subprocess for the existing stateless execution contract, with eight concurrent permits, up to two seconds waiting for capacity, a three-second execution deadline, bounded output and independent fill validation. This fulfills the runtime migration without claiming a persistent exchange or new throughput result. The proposed branching state structures remain separate future work.

Use idempotent creation for Java tables and indexes, baseline version zero for existing databases, and disable Flyway clean. Reconciliation runs with Flyway disabled in a read-only repeatable-read snapshot. Its local wrapper may supply an ephemeral process-local initialization key when Vercel cannot export Secret values; the wrapper does not issue cookies or change the deployed key.

Use a separate database for previews. Session-level search paths do not safely isolate data behind the hosted transaction pool. Preserve the original public alias until the original-database candidate has passed checks. Vercel's generated project alias can update even with --skip-domain; the public alias lot-trading-lab.vercel.app was reassigned explicitly only after verification.

## Concrete Steps

For a new local setup, install Node 24, JDK 21, CMake 3.20+, a C++20 compiler and PostgreSQL. From the repository root run the commands below. The Compose database is disposable development storage; never reuse its published password for shared data.

    npm ci
    docker compose up -d postgres
    export DATABASE_URL='postgres://lot:local_disposable_password@127.0.0.1:54329/lot'
    cmake -S matching -B matching/build -DCMAKE_BUILD_TYPE=Release
    cmake --build matching/build -j 2
    server/mvnw -B -s server/maven-settings.xml -f server/pom.xml verify
    java -jar server/target/lot-server-2.0.0.jar

Run `npm run dev` in a second terminal and open http://127.0.0.1:5173. All API requests proxy to Java on port 8080. Alternatively build React and add `--spring.web.resources.static-locations=file:dist/,classpath:/static/` when starting the jar. Environment files are not automatically loaded by Java; export the documented variables. Maven's project settings force public dependencies through Maven Central without changing corporate user settings.

The execution environment used an existing Homebrew JDK at `/opt/homebrew/opt/openjdk@21`, a private native PostgreSQL cluster on 127.0.0.1:55441 and a pinned Maven bootstrap under `.tools/`, because Docker Desktop did not respond. Its database URL is stored privately in `.tools/database-url`. The final local Java service runs on port 8080 from an immutable jar named in `.tools/current-runtime`. Do not overwrite a jar while it is running; rebuild separately and restart with a new immutable copy.

The deployed backend commit is 3040f14c6ec45409e38eff8cb0695b545438285a. Deployment dpl_CaK3gPfLRAF3Fpyt1zg6FEuzgkXz uses image digest sha256:518d2188610fe0c918c50832b2f396a3a10fa314dcd44b7f5d75fd3be02352b9. Production PORT=8080 and PUBLIC_APP_URL=https://lot-trading-lab.vercel.app are configured. The original database and all existing private secrets remain unchanged.

## Validation and Acceptance

`server/mvnw -B -s server/maven-settings.xml -f server/pom.xml verify` passes 20 tests and formatting. `python3 matching/verify.py` passes 144 executions plus input/book checks. `npm run build`, `npm run lint` and `npm test` pass, with ten frontend tests.

For a running local service, run `scripts/auth_smoke.py` and `scripts/replay_smoke.py` with http://127.0.0.1:8080. Install the development requirements into a Python 3.12 environment and run `scripts/java_compatibility.py` against that same local server with its DATABASE_URL exported. It refuses remote databases. Run `scripts/java_faults.py` to start a separate temporary Java service on 8082 and inject invalid, excessive, failed and timed-out execution. Every case must return 503 with the entire account unchanged. Python is a development oracle, not an application runtime.

Run `java -jar server/target/lot-server-2.0.0.jar --lot.reconcile=true --server.port=0` for an offline audit. Against production, use `vercel env run --environment production -- .venv/bin/python scripts/java_reconcile.py`, setting LOT_JAVA to the JDK executable if needed. The wrapper enforces read-only connections and disables Flyway. Before/after migration, `scripts/database_snapshot.py capture` and `verify` use a private manifest path to prove original-record preservation without exporting record contents.

The production health endpoint identifies Java/C++. Public auth and replay scripts passed after the alias switch. All three full replay days, account restoration, safe retries, GTC cancellation, sharing/revocation, notes, observed history and public synthetic feed isolation passed. HTML deep links return 200 and the polished MP4 returns 206 for byte ranges. Browser inspection shows the shared decision trunk and both branches with their original results. Complete evidence, counts and CI links are recorded in `docs/JAVA_MIGRATION_VERIFICATION.md`.

## Idempotence and Recovery

Flyway startup migration can be repeated safely; clean is disabled. Original application rows were never rewritten. The original-row hash manifest remains private in `.tools/production-before-java.json` and verifies every originally captured account, credential, position, trade, ledger, snapshot, replay, event, session and throttle record after cutover.

The prior deployment dpl_EAtHwPGbFnULjZADTrErKjWvx9F6 remains available at lot-trading-p84199729-dricmoys-projects.vercel.app. Roll back the public URL with `vercel alias set lot-trading-p84199729-dricmoys-projects.vercel.app lot-trading-lab.vercel.app`. Existing financial/replay formats remain compatible. Users holding new opaque Java sessions would sign in again on Django. Do not reset accounts, delete data, rotate keys or repair production checksums as a rollback shortcut.

## Surprises & Discoveries

The system Java command was a macOS stub and the global Maven settings used a corporate mirror. Existing Homebrew Java and project-scoped Maven Central settings solved both without global configuration changes. Local Docker was unhealthy; native PostgreSQL and Vercel's actual Linux container builder supplied independent runtime evidence.

Django inherited America/Chicago for its naive password-reset token clock. Treating that timestamp as UTC rejected still-valid links. Java now reproduces the legacy clock; real Django-created links pass once after migration. Java password limits also count Unicode characters rather than UTF-16 code units, preserving Django bounds.

PostgreSQL now() records transaction start, which can precede lock acquisition. New ledger/event writes use clock_timestamp() so accepted mutations reconstruct in application order. Ordinary fingerprints retain Python's spaces and whitespace-note condition; replay fingerprints retain compact sorted ASCII JSON. Both are covered by fixtures and saved-data checks.

An initial schema preview created history in the preview namespace and two empty Java tables in public when the hosted pool lost search-path settings. Every original-record hash remained unchanged. A distinct empty preview database replaced schema isolation. The unpublished migration gained IF NOT EXISTS clauses; only the owned disposable local migration checksum was adjusted. No production checksum was edited.

One deployment uploaded a source file while local formatting was still running and failed the formatting gate. A stable committed snapshot fixed it. Production then built the exact verified backend commit. Deployment source preparation and mutation are now kept sequential.

## Outcomes & Retrospective

The complete API runs as Java/C++ on the public URL, with the frontend, no-signup demo, recorded video and decision trees intact. Twenty Java tests, ten frontend tests, the C++ oracle, local legacy/concurrency/fault checks, actual hosted provider checks and public HTTP/browser checks pass. CI passed both the deployed backend and the added failure checks.

All original rows in eleven tables remained unchanged. The final production Java audit returned 34 accounts, six orders, thirteen replays and no problems; extra workspaces belong to disposable verification. Existing SMTP remains unconfigured and recovery truthfully returns 503 in production until a sender is configured. The locally verified recovery implementation remains available. Ordinary matching remains a bounded stateless simulation with no claimed exchange throughput.

Completed October 16, 2026. This revision replaces earlier in-progress notes with the deployed outcome, actual verification, pool-isolation correction and rollback procedure. No required migration work remains.
