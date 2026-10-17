"""Run the Java audit read-only, without exporting the production signing key.

An ephemeral process-local key satisfies identity initialization when the host
cannot export Secret values. The audit never authenticates a user, issues a
cookie, serves external requests, or changes the deployed key.
"""
import os
import secrets
import subprocess

environment = dict(os.environ)
if not environment.get("DJANGO_SECRET_KEY"):
    environment["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(48)
java = environment.get("LOT_JAVA", "java")
raise SystemExit(subprocess.run([
    java, "-jar", "server/target/lot-server-2.0.0.jar", "--lot.reconcile=true", "--server.port=0",
    "--server.address=127.0.0.1", "--spring.flyway.enabled=false", "--spring.datasource.hikari.read-only=true",
], env=environment).returncode)
