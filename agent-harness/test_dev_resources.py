import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bin"))
import dev_resources as resources


class ResourcesTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.state = self.root / "state"
        self.state.mkdir()

    def test_alive(self):
        self.assertTrue(resources.alive(os.getpid()))
        self.assertFalse(resources.alive(0))

    def test_command_records_result_and_bounds_workers(self):
        with patch.object(resources, "shared", return_value=self.state):
            result = resources.run_heavy(self.root, [sys.executable, "-c", "import os; print(os.environ['PARALLEL_WORKERS'])"], capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "1")
        record = json.loads((self.state / "heavy.json").read_text())
        self.assertEqual(record["status"], "finished")
        self.assertNotIn("command", record)

    def test_surviving_child_prevents_overlap(self):
        resources.write_json(self.state / "heavy.json", {"status": "running", "child_pid": os.getpid()})
        with patch.object(resources, "shared", return_value=self.state):
            with self.assertRaisesRegex(RuntimeError, "still alive"):
                resources.run_heavy(self.root, [sys.executable, "-c", "pass"])

    def test_failed_launch_does_not_poison_queue(self):
        with patch.object(resources, "shared", return_value=self.state):
            with self.assertRaises(OSError):
                resources.run_heavy(self.root, [str(self.root / "missing-executable")])
            self.assertEqual(resources.run_heavy(self.root, [sys.executable, "-c", "pass"]).returncode, 0)

    def test_stale_child_recovers_but_unknown_launch_fails_closed(self):
        resources.write_json(self.state / "heavy.json", {"status": "running", "child_pid": 123})
        with patch.object(resources, "shared", return_value=self.state), patch.object(resources, "alive", return_value=False):
            self.assertEqual(resources.run_heavy(self.root, [sys.executable, "-c", "pass"]).returncode, 0)
            resources.write_json(self.state / "heavy.json", {"status": "starting"})
            with self.assertRaises(RuntimeError):
                resources.run_heavy(self.root, [sys.executable, "-c", "pass"])

    def test_lock_serializes_and_recovers_after_process_exit(self):
        code = "import sys,time; sys.path.insert(0,sys.argv[1]); from dev_resources import lock; from pathlib import Path;\nwith lock(Path(sys.argv[2])): print('locked',flush=True); time.sleep(0.5)"
        with subprocess.Popen([sys.executable, "-c", code, str(Path(resources.__file__).parent), str(self.state)], stdout=subprocess.PIPE, text=True) as child:
            self.assertEqual(child.stdout.readline().strip(), "locked")
            with self.assertRaises(TimeoutError):
                with resources.lock(self.state, timeout=0.05):
                    self.fail("overlapping lock")
            child.wait()
        with resources.lock(self.state, timeout=0.1):
            pass

    def test_reuse_only_passes_and_only_source_tests(self):
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess([], 0)
        with patch.object(resources, "shared", return_value=self.state), patch.object(resources, "fingerprint", return_value="key"), patch.object(resources, "run_heavy", side_effect=run):
            for _ in range(2):
                resources.run_check(self.root, ["test"], self.root, "frontend changed tests", reuse=True)
            self.assertEqual(len(calls), 1)
            for _ in range(2):
                resources.run_check(self.root, ["test"], self.root, "Rails tests", reuse=True)
            self.assertEqual(len(calls), 3)

    def test_source_change_during_check_never_records_pass(self):
        with patch.object(resources, "shared", return_value=self.state), patch.object(resources, "fingerprint", side_effect=["before", "after"]), patch.object(resources, "run_heavy", return_value=subprocess.CompletedProcess([], 0)):
            resources.run_check(self.root, ["test"], self.root, "frontend changed tests")
        self.assertFalse(list(self.state.glob("pass-*.json")))

    def test_fingerprint_changes_for_source_and_environment(self):
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        source = self.root / "source.txt"
        source.write_text("before")
        first = resources.fingerprint(self.root, ["test"], self.root)
        source.write_text("after")
        second = resources.fingerprint(self.root, ["test"], self.root)
        self.assertNotEqual(first, second)
        with patch.dict(os.environ, {"RESOURCE_TEST_CONTEXT": "changed"}):
            self.assertNotEqual(second, resources.fingerprint(self.root, ["test"], self.root))


if __name__ == "__main__":
    unittest.main()
