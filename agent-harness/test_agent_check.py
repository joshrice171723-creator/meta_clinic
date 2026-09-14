import contextlib
from importlib.machinery import SourceFileLoader
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


AGENT_CHECK_PATH = str(Path(__file__).resolve().parents[1] / "bin" / "agent-check")
SPEC = importlib.util.spec_from_loader("agent_check", SourceFileLoader("agent_check", AGENT_CHECK_PATH))
agent_check = importlib.util.module_from_spec(SPEC)
sys.modules["agent_check"] = agent_check
SPEC.loader.exec_module(agent_check)


class AgentCheckTest(unittest.TestCase):
    def test_scope_selects_directories_and_discloses_unrelated(self):
        selected, unrelated = agent_check.select_paths(
            {"apps/web/src/App.tsx", "apps/api/app/models/user.rb", "notes.md"},
            ["apps/web"],
        )
        self.assertEqual(selected, {"apps/web/src/App.tsx"})
        self.assertEqual(unrelated, {"apps/api/app/models/user.rb", "notes.md"})
        self.assertTrue(agent_check.matches_scope("apps/web/src/App.tsx", ["."]))

    def test_staged_only_uses_index_and_excludes_untracked(self):
        with patch.object(agent_check, "git_lines", side_effect=[{"tracked.rb"}, {"untracked.rb"}]) as git:
            self.assertEqual(agent_check.changed_paths("HEAD", staged=True), {"tracked.rb", "untracked.rb"})
        self.assertEqual(git.call_args_list[0].args, ("diff", "--cached", "--name-only", "--"))
        self.assertEqual(len(git.call_args_list), 2)

    def test_levels_escalate_checks(self):
        paths = {"apps/web/src/App.tsx"}
        focused = [check.name for check in agent_check.checks_for(paths, "focused")]
        component = [check.name for check in agent_check.checks_for(paths, "component")]
        integration = [check.name for check in agent_check.checks_for(paths, "integration")]
        self.assertEqual(focused, ["git diff --check", "focused frontend typecheck"])
        self.assertIn("frontend tests", component)
        self.assertIn("frontend/API boundary", integration)
        self.assertGreater(len(integration), len(component))

    def test_cross_boundary_is_selected_for_both_apps(self):
        checks = [check.name for check in agent_check.checks_for({"apps/api/app/a.rb", "apps/web/src/a.tsx"}, "component")]
        self.assertIn("frontend/API boundary", checks)

    def test_json_report_shape_and_unrelated_files(self):
        output = io.StringIO()
        with patch.object(agent_check, "changed_paths", return_value={"apps/web/src/App.tsx", "README.md"}), contextlib.redirect_stdout(output), patch.object(sys, "argv", ["agent-check", "--path", "apps/web", "--level", "focused", "--json"]):
            self.assertEqual(agent_check.main(), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["selected_files"], ["apps/web/src/App.tsx"])
        self.assertEqual(report["unrelated_files"], ["README.md"])
        self.assertEqual(report["level"], "focused")
        self.assertIsNone(report["phase"])
        self.assertEqual(report["requested_checks"], [])
        self.assertEqual(report["outcomes"][0]["status"], "skipped")
        self.assertIn("selected_commands", report)

    def test_delivery_phases_reject_broad_build_and_unfrozen_final_checks(self):
        self.assertEqual(
            agent_check.phase_error("build", "component", False, ["apps/web"], []),
            "Build-phase verification must use --level focused.",
        )
        self.assertEqual(
            agent_check.phase_error("final", "component", False, ["apps/web"], []),
            "Final verification requires --staged so checks bind to the frozen candidate.",
        )
        self.assertIsNone(agent_check.phase_error("build", "focused", False, ["apps/web"], []))
        self.assertIsNone(agent_check.phase_error("final", "integration", True, ["apps/web"], []))

    def test_repair_phase_requires_scoped_named_checks(self):
        self.assertEqual(
            agent_check.phase_error("repair", "component", False, [], ["frontend tests"]),
            "Repair verification requires at least one --path scope.",
        )
        self.assertEqual(
            agent_check.phase_error("repair", "component", False, ["apps/web"], []),
            "Repair verification requires one or more --check names from the failed or invalidated set.",
        )
        self.assertIsNone(
            agent_check.phase_error("repair", "component", False, ["apps/web"], ["frontend tests"])
        )

    def test_repair_phase_selects_only_named_invalidated_checks(self):
        output = io.StringIO()
        argv = [
            "agent-check",
            "--phase",
            "repair",
            "--path",
            "apps/web",
            "--check",
            "frontend tests",
            "--json",
        ]
        with patch.object(agent_check, "changed_paths", return_value={"apps/web/src/App.tsx"}), contextlib.redirect_stdout(output), patch.object(sys, "argv", argv):
            self.assertEqual(agent_check.main(), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["phase"], "repair")
        self.assertEqual([check["name"] for check in report["selected_commands"]], ["frontend tests"])


if __name__ == "__main__":
    unittest.main()
