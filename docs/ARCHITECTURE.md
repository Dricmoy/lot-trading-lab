# Architecture and engineering discussion

```mermaid
sequenceDiagram
    participant UI as React / Redux
    participant API as Django API
    participant DB as PostgreSQL
    participant GO as Go matcher
    UI->>API: POST /api/orders + CSRF + idempotency key
    API->>DB: BEGIN; SELECT account FOR UPDATE
    API->>DB: Check existing key + fingerprint
    alt identical retry
        API-->>UI: Original order, no second execution
    else new order
        API->>API: Validate symbol, quantity, side, holdings
        API->>GO: Match against simulated liquidity
        GO->>GO: Heapify; consume price-time priority levels
        GO-->>API: Fills, integer total, duration
        API->>API: Verify execution totals and buying power
        API->>DB: Update cash/position; insert order + ledger
        API->>DB: COMMIT
        API-->>UI: Updated account and execution details
    end
```

## Account consistency

- Money: integer USD cents. Shares: positive whole integers, at most 10,000 per request.
- An order cannot reduce cash below zero, including at database-constraint level.
- Sell requests cannot exceed the current holding; no short selling or margin.
- A unique `(account_id, key)` identifies an order; the canonical input is SHA-256 fingerprinted.
- Failed engine requests and insufficient cash cause transaction rollback, not a partially recorded order.
- Account reset takes the same row lock as order placement, making the operation linearizable per account under PostgreSQL.
- Account identifiers are UUIDs inside signed, HttpOnly, SameSite=Lax cookies. This is demo isolation, not user authentication.

## Simulated exchange

Quotes are deterministic functions of a 15-second clock bucket. Historical samples form a fictional intraday scenario. Each stock has eight bid and eight ask levels. Go owns both the quotes and matching; the browser cannot submit a fill price directly to the Django ledger.

The matching engine has no account authority. Its publicly accessible POST endpoint only computes an execution against synthetic depth. Calling it never buys shares or changes buying power. All persisted executions pass through Django.

The binary heap sorts by ascending ask for buys, descending bid for sells, then sequence for ties. Limit orders stop before crossing an unacceptable price. No liquidity gives `cancelled`; some gives `partial`; full quantity gives `filled`. The stateless Go slice cancels remainders. Django can keep ordinary limit remainders open across slices, reserving cash/shares. A CSRF-protected settlement request evaluates one eligible order, at most once per order per 15-second quote bucket. The browser makes one check per observed quote while the regular workspace is open; no background exchange worker runs. Additional fills append OrderMovement rows and update the cumulative order inside the account transaction.

## Scaling discussion

For a real exchange-like simulator, partition an order book by instrument, enforce a single writer per partition, maintain price-level queues, and append a durable event log. For account services, replace network calls under database locks with explicit fund reservations and a transactional outbox. Consumers must be idempotent; describe delivery as at-least-once rather than promising distributed exactly-once processing. Add authentication, account quotas, rate limiting, telemetry, retention, request deadlines, load tests, and operational recovery before opening to substantial traffic.

The current deployment is intentionally bounded: a personal portfolio demo on serverless functions with persistent PostgreSQL. It does not claim any production brokerage compliance, throughput targets, or live-market accuracy.

## Relevant interview walkthrough

1. Place a 25-share buy: show execution walking multiple price levels.
2. Explain why integer cents are used and why the displayed estimate can differ from the fill.
3. Retry the same POST/key: show one order and one debit.
4. Submit simultaneous buys: explain account row locks and prevention of overspending.
5. Place a non-crossing limit: show reserved buying power and an open remainder; cancel it to release the reservation. Select IOC to demonstrate immediate cancellation instead.
6. Inspect the transaction boundary and describe the reservation/outbox evolution.


## Owner-only Alpaca feed

`POST /api/connect` verifies a high-entropy owner token using constant-time comparison and issues the same signed HttpOnly account cookie used by the ledger. The private account is separate from all seeded public demo accounts. `GET /api/market` resolves that cookie and proxies to Go. Only the owner receives a server-generated internal authorization header; user-supplied headers never grant access. Go reads IEX snapshots and selected-symbol bars using production-only Alpaca paper keys. Private order execution uses the same provider's latest available trade as the synthetic book reference. The provider never submits brokerage orders.

A mutex coalesces refreshes within each warm Go instance. Quotes cache 30 seconds, bars 60 seconds. Failed refreshes return an error rather than synthetic data. The Django account lock remains held through an engine request with a 25-second timeout. Historical chart timestamps use the latest available regular session, not the request date. See README for IEX coverage and cache limitations.

## Replay and learning

ReplaySession holds an independent integer-cent cash/position state, versioned scenario identity, revision, and optional sharing token. ReplayEvent records each accepted action, payload fingerprint, UUID key, and revision. The catalog contains authored scenario descriptions; session responses contain only the observed price/news prefix. Session locking serializes mutations. Equal-key retries do not repeat an action, conflicting payloads and stale revisions return 409, and order IDs derive deterministically from session/request UUIDs for event reconstruction.

Synthetic spread, latency cost, fees, and shared per-side moment liquidity are explicit assumptions. Full spread is divided across buy/sell quotes, latency cost is adverse per fill, and fees round upward to cents. A buy limit conservatively reserves one rounded fee per remaining share, covering repeated partial fills. Finish expires open remainders without liquidating holdings or revealing future prices. The holding benchmark uses the opening mid-price and excludes execution costs. Drawdown uses observed portfolio peaks.

Shared recaps require a finished session and an explicit action. A random revocable token exposes sanitized outcomes without account identity or private session ID. Reasons/reflections are absent unless explicitly included. Guests retain progress in the signed browser workspace; existing guest promotion to a registered account preserves replay ownership.

PortfolioSnapshot stores server-observed marks per account/history epoch/minute. Analytics begin at the first shown observation and compare unchanged initial quantities/cash at later observed prices. Reset rotates the epoch; earlier rows remain. No historical price path is invented. Account cash anchors plus original LedgerEntry and continuation OrderMovement rows support read-only reconciliation. Existing cash/order/ledger columns remain unchanged during additive migrations; the production helper compares their original column sets and row hashes.

Production request logs contain route patterns, generated request IDs, method/status/duration; no bodies, cookies, account IDs, or query strings. Owner-only aggregate learning counters derive from persisted state. Automated verification sessions count as workspaces and must not be described as people or traction. GitHub Actions uses an isolated PostgreSQL 16 service for concurrency checks and runs frontend/backend/Go checks without production secrets.
