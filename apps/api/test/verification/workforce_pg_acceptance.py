"""Focused Workforce acceptance; reuse bin/verify-backend's scratch lifecycle.

Run only through A's final resource queue with existing local PostgreSQL and
locked dependencies. Does not install, start services, seed or use shared DBs.
"""
import os
import pathlib
import subprocess
import tempfile
import uuid

root = pathlib.Path(__file__).resolve().parents[2]
name = "apply_workforce_verify_" + uuid.uuid4().hex[:12]
env = os.environ.copy()
if env.get("PGHOST", "127.0.0.1") not in ("127.0.0.1", "localhost", "::1"):
    raise SystemExit("Existing loopback synthetic PostgreSQL required")
env.pop("DATABASE_URL", None)
env.pop("PGDATABASE", None)
env.update(
    RAILS_ENV="test",
    APPLY_TEST_DATABASE=name,
    APPLY_DEVELOPMENT_DATABASE=name + "_unused",
    APPLY_WORKFORCE_VERIFY_DATABASE=name,
    SKIP_TEST_DATABASE="1",
    RAILS_MAX_THREADS="5",
)
created = False


def command(args):
    if args[0] in ("createdb", "dropdb") and os.name == "nt":
        return ["ruby", str(root / "bin" / "pg-client.rb"), *args]
    if args[0] == "bin/rails":
        return ["ruby", str(root / "bin" / "rails"), *args[1:]]
    return args


def run(args, timeout=180):
    result = subprocess.run(
        command(args), cwd=root, env=env, capture_output=True, text=True, timeout=timeout
    )
    # Only our assertions reach the console; never echo connection diagnostics.
    for line in (result.stdout + "\n" + result.stderr).splitlines():
        if line.startswith(("PASS:", "FAIL:")):
            print(line, flush=True)
    if result.returncode:
        raise RuntimeError("Workforce acceptance step failed: " + " ".join(args))


with tempfile.TemporaryDirectory(prefix="apply-workforce-verify-") as temporary:
    env["SCHEMA"] = str(pathlib.Path(temporary) / "structure.sql")
    try:
        run(["createdb", name], timeout=30)
        created = True
        run(["bin/rails", "db:migrate"])
        run(["bin/rails", "runner", "--skip-executor", "test/verification/workforce_access_postgres.rb"], timeout=90)
    finally:
        if created:
            run(["dropdb", name], timeout=30)
            print("Removed only this process's Workforce scratch database", flush=True)
