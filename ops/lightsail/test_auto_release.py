"""Offline build-context cleanup checks: temporary Git repos and mocked Docker only."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import auto_release as release


class BuildContextCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.git"
        seed = self.root / "seed"
        self.git("init", str(seed))
        (seed / "fixture.txt").write_text("Independent synthetic build context\n")
        self.git("-C", str(seed), "add", ".")
        self.git("-C", str(seed), "-c", "user.name=Synthetic Test",
                 "-c", "user.email=test@example.invalid", "commit", "-m", "fixture")
        self.git("clone", "--bare", str(seed), str(self.source))
        self.revision = self.git("--git-dir", str(self.source), "rev-parse", "HEAD").strip()
        self.checkout = self.root / "builds" / self.revision
        self.checkout.parent.mkdir()
        self.git("--git-dir", str(self.source), "worktree", "add", "--detach",
                 str(self.checkout), self.revision)
        # Another registered worktree and recovery sentinel must survive cleanup.
        self.other = self.root / "another-owner"
        self.git("--git-dir", str(self.source), "worktree", "add", "--detach",
                 str(self.other), self.revision)
        self.recovery = self.root / "backups" / "release-synthetic" / "recovery.txt"
        self.recovery.parent.mkdir(parents=True)
        self.recovery.write_text("Independent synthetic recovery sentinel\n")
        self.state = self.root / "state"
        self.state.mkdir()
        self.commands = []
        self.real_run = release.run

    def git(self, *args):
        return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL, text=True)

    def runner(self, failing_component=None, dirty=False):
        def run(args, **kwargs):
            self.commands.append(args)
            if args[:2] == ["docker", "build"]:
                if dirty:
                    (self.checkout / "operator-evidence.txt").write_text("Retain me\n")
                if args[-1].endswith("/" + str(failing_component)):
                    raise release.Blocked("Synthetic image build failure")
                return None
            return self.real_run(args, **kwargs)
        return run

    def assert_cleaned(self):
        self.assertFalse(self.checkout.exists())
        registrations = self.git("--git-dir", str(self.source), "worktree", "list", "--porcelain")
        self.assertNotIn(str(self.checkout), registrations)
        self.assertIn(str(self.other), registrations)
        self.assertTrue(self.other.exists())
        self.assertEqual(self.recovery.read_text(), "Independent synthetic recovery sentinel\n")
        self.assertEqual(self.commands[-1], ["git", "--git-dir", str(self.source),
                                           "worktree", "remove", str(self.checkout)])

    def test_success_removes_only_the_owned_build_context_and_registration(self):
        with patch.object(release, "STATE", self.state), patch.object(release, "run", self.runner()):
            release.build_images(self.source, self.checkout, self.revision)
        self.assert_cleaned()
        self.assertEqual(len([c for c in self.commands if c[:2] == ["docker", "build"]]), 2)
        self.assertEqual(json.loads((self.state / "status.json").read_text())["sha"], self.revision)

    def test_first_image_failure_cleans_context_and_stops_the_second_build(self):
        with patch.object(release, "STATE", self.state), patch.object(release, "run", self.runner("api")):
            with self.assertRaisesRegex(release.Blocked, "Synthetic image build failure"):
                release.build_images(self.source, self.checkout, self.revision)
        self.assert_cleaned()
        self.assertEqual(len([c for c in self.commands if c[:2] == ["docker", "build"]]), 1)

    def test_second_image_failure_also_cleans_context(self):
        with patch.object(release, "STATE", self.state), patch.object(release, "run", self.runner("web")):
            with self.assertRaisesRegex(release.Blocked, "Synthetic image build failure"):
                release.build_images(self.source, self.checkout, self.revision)
        self.assert_cleaned()

    def test_status_write_failure_cleans_context_without_building(self):
        with patch.object(release, "run", self.runner()), \
             patch.object(release, "atomic_json", side_effect=OSError("synthetic status failure")):
            with self.assertRaisesRegex(OSError, "synthetic status failure"):
                release.build_images(self.source, self.checkout, self.revision)
        self.assert_cleaned()
        self.assertFalse(any(c[0] == "docker" for c in self.commands))

    def test_dirty_build_context_is_retained_without_force_removal(self):
        with patch.object(release, "STATE", self.state), patch.object(release, "run", self.runner(dirty=True)):
            with self.assertRaisesRegex(release.Blocked, "git failed"):
                release.build_images(self.source, self.checkout, self.revision)
        self.assertEqual((self.checkout / "operator-evidence.txt").read_text(), "Retain me\n")
        self.assertTrue(self.other.exists())
        self.assertTrue(self.recovery.exists())
        self.assertEqual(self.commands[-1], ["git", "--git-dir", str(self.source),
                                           "worktree", "remove", str(self.checkout)])


if __name__ == "__main__":
    unittest.main()
