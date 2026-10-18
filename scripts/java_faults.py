"""Prove that malformed, failed and timed-out execution cannot change local cash."""
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
import uuid

assert urlparse(os.environ.get("DATABASE_URL", "")).hostname in ("localhost", "127.0.0.1"), "LOCAL disposable database only"
origin = "http://127.0.0.1:8082"
jar = CookieJar()
browser = build_opener(HTTPCookieProcessor(jar))


def call(route, body=None, key=None):
    headers = {"Origin": origin, "Content-Type": "application/json", "Idempotency-Key": key or str(uuid.uuid4()),
               "X-CSRFToken": next((c.value for c in jar if c.name == "csrftoken"), "")}
    request = Request(origin + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        response = browser.open(request, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


with tempfile.TemporaryDirectory(prefix="lot-execution-faults-") as directory:
    root = Path(directory)
    binary = root / "matcher"
    mode = root / "mode"
    # Test-only executable replaces the C++ boundary in this separate process.
    # No application configuration or real matching binary is modified.
    binary.write_text("#!/bin/sh\ncase \"$(cat '" + str(mode) + "')\" in\n"
                      "invalid) printf '%s\\n' '{\"fills\":[{\"quantity\":1,\"price\":0}],\"quantity\":1,\"total\":0,\"status\":\"filled\"}';;\n"
                      "excess) printf '%s\\n' '{\"fills\":[{\"quantity\":10001,\"price\":100}],\"quantity\":10001,\"total\":1000100,\"status\":\"filled\"}';;\n"
                      "malformed) printf '{';;\nempty) :;;\nnull) printf 'null';;\narray) printf '[]';;\n"
                      "trailing) printf '%s\\n' '{\"fills\":[],\"quantity\":0,\"total\":0,\"status\":\"cancelled\"} {}';;\n"
                      "recovered) printf '%s\\n' '{\"fills\":[{\"quantity\":1,\"price\":100}],\"quantity\":1,\"total\":100,\"status\":\"filled\"}';;\n"
                      "failure) exit 2;;\ntimeout) exec sleep 6;;\nesac\n")
    binary.chmod(0o700)
    environment = {**os.environ, "PORT": "8082", "PUBLIC_APP_URL": origin, "LOT_MATCHING_BINARY": str(binary)}
    with (root / "server.log").open("w") as log:
        server = subprocess.Popen([environment.get("LOT_JAVA", "java"), "-jar", "server/target/lot-server-2.0.0.jar"],
                                  env=environment, stdout=log, stderr=subprocess.STDOUT)
        try:
            subprocess.run([os.sys.executable, "scripts/wait_for_http.py", origin + "/api/health"], check=True)
            code, before = call("/api/account")
            assert code == 200
            key = str(uuid.uuid4())
            order = {"symbol": "AAPL", "side": "buy", "kind": "market", "quantity": 1}
            for fault in ("invalid", "excess", "malformed", "empty", "null", "array", "trailing", "failure", "timeout"):
                mode.write_text(fault)
                code, result = call("/api/orders", order, key)
                assert code == 503, (fault, code, result)
                code, after = call("/api/account")
                assert code == 200 and before == after, fault
                print(f"PASS: execution {fault} returns 503 with identical cash, positions, orders and revision")
            mode.write_text("recovered")
            code, accepted = call("/api/orders", order, key)
            assert code == 201 and accepted["replayed"] is False, (code, accepted)
            code, retried = call("/api/orders", order, key)
            assert code == 200 and retried["replayed"] is True, (code, retried)
            assert accepted["order"] == retried["order"] and accepted["account"] == retried["account"]
            assert accepted["account"]["cash"] == before["cash"] - 100
            print("PASS: the same failed key succeeds after recovery and retries without a second debit")
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
