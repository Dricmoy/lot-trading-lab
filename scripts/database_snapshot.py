"""Read-only before/after verification of existing rows; never exports row content.

Capture before an additive migration. Verification permits new records but
requires every captured record and column to remain byte-for-byte equivalent
under a stable JSON representation. Store the manifest outside Git.
"""
import argparse
from datetime import date, datetime
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import uuid

import psycopg
from psycopg import sql

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("mode", choices=("capture", "verify"))
parser.add_argument("manifest", type=Path)
args = parser.parse_args()
tables = ("auth_user", "django_session", "trading_account", "trading_position", "trading_order",
          "trading_ledgerentry", "trading_ordermovement", "trading_portfoliosnapshot",
          "trading_replaysession", "trading_replayevent", "trading_auththrottle")


def encode(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    raise TypeError(type(value).__name__)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=encode).encode()).hexdigest()


original = json.loads(args.manifest.read_text()) if args.mode == "verify" else {}
current = {}
with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=15, options="-c default_transaction_read_only=on -c timezone=UTC") as connection:
    connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    for table in tables:
        columns = original[table]["columns"] if original else [r[0] for r in connection.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s ORDER BY ordinal_position", (table,))]
        assert columns, f"Missing table: {table}"
        key = "session_key" if table == "django_session" else "key" if table == "trading_auththrottle" else "id"
        key_index = columns.index(key)
        query = sql.SQL("SELECT {} FROM {}").format(sql.SQL(",").join(map(sql.Identifier, columns)), sql.Identifier(table))
        rows = {digest(row[key_index]): digest(row) for row in connection.execute(query)}
        current[table] = {"columns": columns, "rows": rows}
        if original:
            differences = sum(rows.get(identity) != value for identity, value in original[table]["rows"].items())
            assert differences == 0, f"{table}: {differences} original records changed or disappeared; inspect concurrent activity"
        print(f"{table}: {len(original[table]['rows']) if original else len(rows)} original rows {'preserved' if original else 'captured'}")
if not original:
    descriptor = os.open(args.manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(current, output, sort_keys=True)
print("PASS: read-only original-record integrity verification" if original else "PASS: read-only integrity manifest saved without record contents")
