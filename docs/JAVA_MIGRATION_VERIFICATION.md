# Java and C++ migration verification

Verified October 16, 2026 (America/Edmonton; final remote audit at 03:21 UTC October 17).

## Deployed runtime

The public [Lot application](https://lot-trading-lab.vercel.app) now serves Spring Boot 4.1.1 on Java 21, with the compiled C++20 execution component. The unchanged React app, recorded demo and decision-tree comparison are served from the same OCI image.

- Backend commit: `3040f14c6ec45409e38eff8cb0695b545438285a`.
- Production deployment: `dpl_CaK3gPfLRAF3Fpyt1zg6FEuzgkXz`.
- Immutable deployment: `https://lot-trading-cocg7jcsc-dricmoys-projects.vercel.app`.
- OCI image digest: `sha256:518d2188610fe0c918c50832b2f396a3a10fa314dcd44b7f5d75fd3be02352b9`.
- Vercel reports `framework: container`; the final entry point runs Java and invokes the packaged C++ binary directly. `.vercelignore` and `.dockerignore` exclude the old Python/Go entry points.

The public health endpoint returned:

    {"status":"ok","service":"Spring Boot ledger","language":"Java","matching_engine":"C++","market_data":"simulated"}

No Python or Go process handles the migrated API. Their source remains available as a development reference and migration oracle.

## Preserved original data

A read-only manifest captured original columns and per-record hashes before startup migration. Verification was repeated after migration, after public cutover and after disposable-account HTTP checks. Every captured record remained unchanged; new verification records were permitted. The private manifest contains hashes, not record contents, and is excluded from Git.

| Original table | Preserved rows |
| --- | ---: |
| auth_user | 2 |
| django_session | 2 |
| trading_account | 25 |
| trading_position | 54 |
| trading_order | 4 |
| trading_ledgerentry | 4 |
| trading_ordermovement | 0 |
| trading_portfoliosnapshot | 2 |
| trading_replaysession | 7 |
| trading_replayevent | 98 |
| trading_auththrottle | 9 |

The actual Java reconciliation ran against production with Flyway disabled and a read-only PostgreSQL snapshot. Before cutover it reconstructed all 25 accounts, four orders and seven replays without discrepancies. After all public verification, including newly created test workspaces, it returned:

    LOT_RECONCILIATION {"accounts":34,"orders":6,"replays":13,"problems":[]}

Existing signing keys, provider credentials and owner token were not changed. The audit wrapper uses an ephemeral process-local initialization key only when Vercel cannot export the deployed signing secret; that process does not authenticate users, issue cookies or change deployed credentials.

## Automated evidence

| Verification | Observed result |
| --- | --- |
| Maven verify and Spotless | 20 Java tests, zero failures/errors |
| Frozen Python replay oracle | All nine scenario/friction combinations match state after each action |
| C++ protocol oracle | 144 execution cases, four books and eleven rejected inputs |
| Frontend build, lint and tests | Build/lint pass; ten tests pass |
| Django-to-Java local harness | Existing sessions, signed guests, Unicode PBKDF2, cash/holdings/watchlists, whitespace-note retry, completed replays and comparisons pass |
| Recovery and identity | Legacy/new one-use reset links, guest promotion, copied-cookie rejection, session-only cookies and both session formats revoked on password change pass |
| Concurrent requests | Duplicate orders debit once; competing purchases, sales and reservations remain bounded; replay retries apply once and stale revisions receive 409 |
| Invalid execution boundary | Invalid prices, excessive quantity, process failure and timeout return 503 with identical cash, positions, orders and revision |
| Request boundaries | Invalid CSRF/origins/inputs rejected; both declared and chunked bodies over 16 KiB rejected |

GitHub Actions passed for the [deployed backend commit](https://github.com/Dricmoy/lot-trading-lab/actions/runs/38998079069) and the [additional execution-failure checks](https://github.com/Dricmoy/lot-trading-lab/actions/runs/38998335687). Both use isolated PostgreSQL, without production credentials.

## Deployed behavior

Both existing `auth_smoke.py` and `replay_smoke.py` passed on the separate-database container, the staged original-database deployment, and the public alias without a protection bypass. Checks covered registration, CSRF, buy/sell accounting, identical/conflicting retries, insufficient cash/shares, IOC limits, logout/login restoration, watchlists, password changes, own-account reset, all three complete replay days, journal restoration, ownership, sanitized sharing/revocation, separate replay balances, GTC reservation/reload/cancellation, observed history and public feed isolation.

Public HTML deep links `/`, `/demo`, `/replay`, `/replay/compare`, `/signup`, `/login` and `/reset-password` returned 200. The example comparison returned the expected `$97,636.15` and `$100,019.57` outcomes. The recorded polished MP4 returned HTTP 206 with a valid 1,024-byte range and `video/mp4` content type. Public `/api/engine` stayed synthetic even with a forged internal authorization header, and API responses included `no-store`.

Browser verification completed an ordinary buy, created and advanced a replay, saved a plan/reflection, and inspected a reconstructed decision. The same scripted decision tree was rendered again on the public Java deployment after cutover.

## Private feed

An opt-in, read-only server probe ran on a separate-database deployment with existing production-only provider credentials. It logged only:

    LOT_PRIVATE_FEED_CHECK {"status":"ok","source":"alpaca-iex","assets":8,"bars":78,"articles":5,"matching_engine":"C++"}

This confirms Java fetched the provider snapshots, selected-session bars and attributed headlines, and built the C++ book. No article content, prices, keys or owner token were printed. No brokerage endpoint was called. The diagnostic flag is absent from the final production deployment.

## Deployment corrections and rollback

An initial attempt to isolate previews with a separate schema failed because the hosted transaction pool lost session search-path settings. It created Flyway history in the preview schema and two empty Java-specific tables in public. Original-row hashes proved every original record unchanged. Subsequent verification used an actual separate database; the failed schema preview was never assigned to the public URL. Startup migration accepts those empty Java tables through idempotent creation clauses. No production migration checksum was edited.

The preceding public deployment is `dpl_EAtHwPGbFnULjZADTrErKjWvx9F6`, URL `lot-trading-p84199729-dricmoys-projects.vercel.app`. Reassigning the public alias to that URL restores the prior application. Legacy account/trade/replay formats and the original signing key remain compatible. A rollback to Django would require users with new opaque Java sessions to sign in again.

## Remaining boundaries

Production SMTP is still unconfigured, as before this migration; recovery returns a truthful 503 until delivery is configured. The local Java recovery implementation and one-use behavior are verified. Ordinary liquidity remains a stateless eight-level simulation, and C++ runs as a bounded subprocess per request. Persistent exchange books, branching state storage and throughput claims are future work. Local Docker was unavailable; the actual Linux image was built and verified on Vercel, while native Java/C++ plus PostgreSQL supplied local verification.
