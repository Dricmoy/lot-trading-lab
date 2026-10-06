"""Apply additive migrations and verify existing trading rows are unchanged."""
import hashlib
import os
import secrets
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.environ["VERCEL"] = "1"
# Vercel cannot export production secret keys. Schema migration does not use
# cookie signing; this key exists only in this local migration process.
if not os.environ.get("DJANGO_SECRET_KEY"):
    os.environ["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(48)
import django  # noqa: E402

django.setup()
from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402

if connection.vendor != "postgresql":
    raise SystemExit("Production migration requires PostgreSQL; refusing another database.")


def snapshot():
    result = {}
    with connection.cursor() as cursor:
        for table in ("trading_account", "trading_position", "trading_order", "trading_ledgerentry"):
            # Limit account fields to existing columns so the additive upgrade compares cleanly.
            columns = "id,cash,created_at" if table == "trading_account" else "*"
            cursor.execute(f"SELECT {columns} FROM {table} ORDER BY id")
            digest = hashlib.sha256()
            count = 0
            for row in cursor:
                digest.update(repr(row).encode())
                count += 1
            result[table] = (count, digest.hexdigest())
    return result


before = snapshot()
print("Existing row counts:", {table: value[0] for table, value in before.items()})
call_command("migrate", interactive=False, verbosity=1)
after = snapshot()
if before != after:
    raise SystemExit("Trading snapshot changed during migration. Inspect concurrent writes before claiming preservation.")
print("PASS: all existing account, position, order, and ledger row contents preserved.")
