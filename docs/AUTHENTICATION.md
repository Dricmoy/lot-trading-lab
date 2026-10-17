# Accounts and password recovery

## Local use

Start PostgreSQL, build the C++ executable and Java service, then start Vite as described in the README. Flyway applies additive migrations during Java startup. Open `/signup` to create a practice account. A fresh registration starts with $100,000 virtual cash. If a valid guest account exists in the browser, registration claims that guest's holdings, orders, cash, and watchlist instead.

Passwords use PBKDF2-SHA256 in a Django-compatible format, with minimum length, common-password, numeric-password and account-similarity checks. Existing Django hashes remain usable. All authentication and trading mutations require CSRF protection. Email addresses are normalized to lowercase. Sessions expire after 30 days when Remember me is selected, or when the browser session ends otherwise. A password change keeps the current session and revokes other sessions; a reset revokes previous sessions. The reset token expires after one hour and is invalid after use. PostgreSQL locks the user row while consuming a reset token.

In local development, reset emails are written to `.mailbox/` rather than sent externally. That directory is ignored by Git. Open the message for your own disposable local test account and follow its link. Do not commit messages or token links.

## Production email setup

The existing Vercel project's environment-variable names were inspected on October 5, 2026. It has database and application secrets, but no SMTP or sender settings. The approved database migration used Vercel environment variables within a local process. Production signing and owner-access secrets were not exported or changed. The migration process used an ephemeral signing key because schema changes do not require the production cookie-signing secret.

Choose an SMTP provider and verify a sending domain or sender in that provider's dashboard. In Vercel's project settings, add the following as server-only Production variables:

| Variable | Value |
| --- | --- |
| `PUBLIC_APP_URL` | `https://lot-trading-lab.vercel.app` |
| `EMAIL_HOST` | Provider's SMTP hostname |
| `EMAIL_PORT` | `587` for STARTTLS |
| `EMAIL_HOST_USER` | Provider-issued SMTP username |
| `EMAIL_HOST_PASSWORD` | Provider-issued SMTP secret; mark sensitive |
| `EMAIL_USE_TLS` | `true` |
| `DEFAULT_FROM_EMAIL` | Lot name and provider-verified sender address |

Do not put these credentials in `VITE_` variables or send them in chat. Set them directly in the secure hosting dashboard. The default production mail backend is SMTP. Missing mail configuration returns a clear temporary-unavailability error; it does not pretend an email was sent. Provider failures also return an error.

## Publishing checklist

1. Publishing and additive production migrations were approved on October 5, 2026 and completed. Future releases should preserve the same authorization boundary.
2. Capture original-row fingerprints, then let Flyway add Java session/recovery tables at startup. Existing accounts, credentials, ledger records, cash, positions, orders and replays remain in their original tables. Verify the captured records after migration.
3. Configure email settings through the hosting dashboard, then deploy the reviewed version.
4. Check database health, register a disposable account, buy and sell simulated shares, reload, log out, and log in from a new session. Verify the same cash, holdings, history, and watchlist.
5. Request recovery for that account, confirm actual email delivery, consume the link, sign in with the new password, and confirm the used link is rejected.
6. Verify a second account remains isolated. Check phone navigation, order review, portfolio tables, and activity.

Use a separate database for preview deployments. The Java backend requires PostgreSQL locally and in deployment. The prior production trading concurrency evidence is archived separately in `VERIFICATION.md`.

## Operational maintenance

Authentication limits use database counters keyed by hashed peer address and identity. Buckets reset after 15 minutes. Expired Java sessions and reset links are rejected on lookup. Remove expired Java and legacy session rows and expired throttle records as an operational maintenance task. No recurring job has been created as part of this local redesign.

## October 5 live status

Registration, login/logout, session restoration, password changes, account isolation, guest trading, and persisted watchlists passed integration checks on the public alias. Production migrations preserved the contents of all 18 existing accounts, 42 positions, two orders, and two ledger rows. Email recovery returns HTTP 503 with a clear unavailable message until SMTP is configured; actual email delivery has not been verified.


## Java compatibility

Java verifies existing `lot_session` database sessions, compressed Django signatures and signed guest cookies using the original `DJANGO_SECRET_KEY`. After login it issues a new random opaque `lot_java_session`; only its SHA-256 hash is stored. Password changes invalidate both session formats using the password hash and rotate the current Java session. Guest cookies can resolve only accounts whose user ownership remains null.

New recovery links use a hashed random token with absolute one-hour expiry and one-use consumption under a user lock. Existing Django links remain valid until their original expiry or a password/login change. The legacy verifier preserves Django's inherited America/Chicago naive token clock; new tokens use UTC expiry. Production SMTP remains optional and unavailable delivery returns HTTP 503. Development writes messages only to `.mailbox/`.
