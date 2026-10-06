# Accounts and password recovery

## Local use

Run migrations, then start Django, Go, and Vite as described in the README. Open `/signup` to create a practice account. A fresh registration starts with $100,000 virtual cash. If a valid guest account exists in the browser, registration claims that guest's holdings, orders, cash, and watchlist instead.

Passwords use Django's standard password hashing and validation. All authentication and trading mutations require CSRF protection. Email addresses are normalized to lowercase. Sessions expire after 30 days when Remember me is selected, or when the browser session ends otherwise. A password change keeps the current session and revokes other sessions; a reset revokes previous sessions. The reset token expires after one hour and is invalid after use. PostgreSQL locks the user row while consuming a reset token.

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
2. Apply the Django auth, content-types, sessions, and trading migrations using the production environment. Existing practice account IDs, holdings, ledger records, cash, and orders are preserved. Account ownership is nullable for existing guests; watchlists on those legacy records initially start empty.
3. Configure email settings through the hosting dashboard, then deploy the reviewed version.
4. Check database health, register a disposable account, buy and sell simulated shares, reload, log out, and log in from a new session. Verify the same cash, holdings, history, and watchlist.
5. Request recovery for that account, confirm actual email delivery, consume the link, sign in with the new password, and confirm the used link is rejected.
6. Verify a second account remains isolated. Check phone navigation, order review, portfolio tables, and activity.

Use a separate database for preview deployments. Local SQLite checks do not establish PostgreSQL concurrency behavior for these new authentication changes. The prior production trading concurrency evidence is archived separately in `VERIFICATION.md`.

## Operational maintenance

Authentication limits use database counters keyed by hashed peer address and identity. Buckets reset after 15 minutes. Schedule normal Django session cleanup with `manage.py clearsessions`, and remove expired throttle records as an operational maintenance task. No recurring job has been created as part of this local redesign.

## October 5 live status

Registration, login/logout, session restoration, password changes, account isolation, guest trading, and persisted watchlists passed integration checks on the public alias. Production migrations preserved the contents of all 18 existing accounts, 42 positions, two orders, and two ledger rows. Email recovery returns HTTP 503 with a clear unavailable message until SMTP is configured; actual email delivery has not been verified.
