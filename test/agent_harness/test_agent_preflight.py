"""Deterministic coverage for preflight route precedence."""

import importlib.util
from importlib.machinery import SourceFileLoader
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOADER = SourceFileLoader("agent_preflight", str(ROOT / "bin/agent-preflight"))
SPEC = importlib.util.spec_from_loader("agent_preflight", LOADER)
assert SPEC and SPEC.loader
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def test_route_precedence_and_generic_fallback(self):
        manifest = preflight.route_manifest()
        self.assertEqual(preflight.route_for("apps/web/src/features/clinic/Workspace.tsx", manifest)[0]["name"], "react-frontend-clinic")
        self.assertEqual(preflight.route_for("apps/web/src/features/inventory/InventoryApp.tsx", manifest)[0]["name"], "react-frontend-inventory")
        self.assertEqual(preflight.route_for("apps/web/src/features/patientPortal/Portal.tsx", manifest)[0]["name"], "react-frontend-patient-portal")
        self.assertEqual(preflight.route_for("apps/web/src/unknown.ts", manifest)[0]["name"], "react-frontend")

    def test_multiple_paths_can_select_distinct_routes(self):
        manifest = preflight.route_manifest()
        names = [preflight.route_for(path, manifest)[0]["name"] for path in (
            "apps/web/src/features/launch/Home.tsx",
            "apps/web/src/features/identity/Login.tsx",
            "apps/web/src/shared/ui.tsx",
        )]
        self.assertEqual(names, ["react-frontend-launch", "react-frontend-identity-shared", "react-frontend-identity-shared"])

if __name__ == "__main__":
    unittest.main()
