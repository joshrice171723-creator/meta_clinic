"""Cross-worktree resource ownership and conservative source-check evidence."""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def shared(root):
    common = Path(git(root, "rev-parse", "--git-common-dir"))
    if not common.is_absolute():
        common = Path(root) / common
    path = common.resolve() / "development-resources"
    path.mkdir(exist_ok=True)
    return path


def alive(pid):
    if not pid:
        return False
    if sys.platform == "win32":
        import ctypes
        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x1000, False, int(pid))
        if not handle:
            # Access denied is not proof that the process exited.
            return kernel.GetLastError() != 87
        try:
            code = ctypes.c_ulong()
            return not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(int(pid), 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


@contextlib.contextmanager
def lock(directory, name="heavy", timeout=600):
    """Kernel releases dead-owner locks; metadata protects a surviving child."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / (name + ".lock")).open("a+b") as handle:
        handle.seek(0, 2)
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        start = time.monotonic()
        while True:
            handle.seek(0)
            try:
                if sys.platform == "win32":
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() - start >= timeout:
                    raise TimeoutError(f"{name} queue checkpoint reached; owner was not interrupted")
                time.sleep(0.2)
        try:
            yield time.monotonic() - start
        finally:
            handle.seek(0)
            if sys.platform == "win32":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def write_json(path, value):
    temporary = path.with_suffix(f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def run_heavy(root, command, cwd=None, capture_output=False, timeout=600):
    directory = shared(root)
    record = directory / "heavy.json"
    with lock(directory, timeout=timeout) as waited:
        previous = json.loads(record.read_text()) if record.exists() else {}
        if previous.get("status") == "starting":
            raise RuntimeError("Interrupted launch has unknown child ownership; inspect heavy.json before recovery")
        if previous.get("status") == "running" and alive(previous.get("child_pid")):
            raise RuntimeError("Previous owner's child is still alive; refusing overlapping heavy work")
        environment = dict(os.environ)
        environment.update(PARALLEL_WORKERS="1", VITEST_MAX_THREADS="1", VITEST_MIN_THREADS="1")
        # Never persist command arguments or environment: they may contain secrets.
        entry = {"owner_pid": os.getpid(), "child_pid": None, "status": "starting", "started_at": time.time(), "wait_seconds": waited}
        write_json(record, entry)
        started = time.monotonic()
        try:
            process = subprocess.Popen(command, cwd=cwd or root, env=environment,
                                       stdout=subprocess.PIPE if capture_output else None,
                                       stderr=subprocess.PIPE if capture_output else None,
                                       text=True, encoding="utf-8", errors="replace")
        except OSError:
            entry.update(status="launch_failed")
            write_json(record, entry)
            raise
        with process as child:
            entry.update(child_pid=child.pid, status="running")
            write_json(record, entry)
            stdout, stderr = child.communicate()
            entry.update(status="finished", returncode=child.returncode, seconds=time.monotonic() - started)
            write_json(record, entry)
            return subprocess.CompletedProcess(command, child.returncode, stdout, stderr)


def fingerprint(root, command, cwd):
    """Hash actual files, not HEAD; environment values are never stored in clear."""
    root = Path(root)
    digest = hashlib.sha256()
    digest.update(json.dumps([list(command), str(Path(cwd).relative_to(root)), sys.version,
                              sys.platform, sorted(os.environ.items())], sort_keys=True).encode())
    paths = set(subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root).decode().split("\0")) - {""}
    # Excluded local configuration and installed dependency metadata also invalidate.
    for base in (root, root / "apps/web", root / "apps/api"):
        paths.update(str(p.relative_to(root)) for p in base.glob(".env*") if p.is_file())
    paths.update(("apps/web/node_modules/.modules.yaml", "apps/web/node_modules/.pnpm/lock.yaml", ".bundle/config"))
    for name in sorted(paths):
        path = root / name
        if path.is_dir():
            continue
        digest.update(name.encode())
        digest.update(path.read_bytes() if path.exists() else b"<missing>")
    for tool in ("node", "ruby"):
        try:
            digest.update(subprocess.check_output([tool, "--version"], stderr=subprocess.STDOUT))
        except OSError:
            digest.update((tool + ":unavailable").encode())
    return digest.hexdigest()


def run_check(root, command, cwd, name, capture_output=False, reuse=False):
    # Only source-only checks are eligible. Never reuse runtime, network or build artifacts.
    cacheable = name in {"frontend related tests", "frontend changed tests", "frontend tests"}
    key = fingerprint(root, command, cwd) if cacheable else None
    evidence = shared(root) / (f"pass-{key}.json" if key else "unused")
    if reuse and key and evidence.exists():
        record = json.loads(evidence.read_text())
        if record.get("key") == key and record.get("returncode") == 0:
            print(f"Reused source-check evidence: {name} ({record['seconds']:.2f}s previously)", file=sys.stderr)
            result = subprocess.CompletedProcess(command, 0, "", "")
            result.reused_evidence = True
            return result
    started = time.monotonic()
    result = run_heavy(root, command, cwd, capture_output)
    if key and result.returncode == 0 and fingerprint(root, command, cwd) == key:
        write_json(evidence, {"key": key, "name": name, "returncode": 0, "seconds": time.monotonic() - started, "at": time.time()})
    return result
