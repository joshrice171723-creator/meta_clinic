"""Execute the actual Bash launcher with isolated command stubs, never a real host.

PATH contains only our stubs; the config source and all external operations are
intercepted. No Docker/AWS calls, host files, credentials or databases are used.
"""
import configparser
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent


class PrivateRouteTest(unittest.TestCase):
    def render(self, component, networks, directory):
        source = (ROOT / "apply-run.sh").read_text().split('python3 - "$component" <<\'PY\'\n', 1)[1].split('\nPY\n', 1)[0]
        source = source.replace("Path('/etc/apply/upstreams')", f"Path({str(directory)!r})")
        result = subprocess.CompletedProcess([], 0, json.dumps(networks), "")
        with patch.object(sys, "argv", ["-", component]), patch("subprocess.run", return_value=result), patch("time.sleep"):
            exec(compile(source, "private-route", "exec"), {})

    def test_exact_network_and_port_rendered_privately(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            networks = {"apply-database": {"IPAddress": "172.18.0.3"}, "apply-frontend": {"IPAddress": "172.19.0.2"}}
            for component, expected in (("api", "172.18.0.3:3001"), ("web", "172.19.0.2:8080")):
                self.render(component, networks, directory)
                output = directory / (component + ".conf")
                self.assertEqual("server " + expected + ";\n", output.read_text())
                self.assertEqual(0o600, output.stat().st_mode & 0o777)

    def test_missing_network_and_config_injection_fail_closed(self):
        with tempfile.TemporaryDirectory() as scratch:
            directory = Path(scratch)
            with self.assertRaises(SystemExit):
                self.render("api", {"other": {"IPAddress": "172.18.0.3"}}, directory)
            with self.assertRaises(ValueError):
                self.render("api", {"apply-database": {"IPAddress": "127.0.0.1; include evil;"}}, directory)
            self.assertEqual([], list(directory.iterdir()))


class LauncherTest(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="apply-launcher-test-")
        self.addCleanup(self.scratch.cleanup)
        self.directory = Path(self.scratch.name)
        self.log = self.directory / "commands.jsonl"
        self.repository = "000000000000.dkr.ecr.us-east-1.amazonaws.com/synthetic"
        self.api = self.repository + "@sha256:" + "a" * 64
        self.web = self.repository + "@sha256:" + "b" * 64
        config = self.directory / "bash-env"
        config.write_text('''source() {
  [[ "$#" = 1 && "$1" = /etc/apply/config ]] || return 99
  export APPLY_ENVIRONMENT="$TEST_ENVIRONMENT"
  export APPLY_REPOSITORY="$TEST_REPOSITORY"
}
''')
        executable = self.directory / "command-stub"
        executable.write_text(f"#!{sys.executable}\n" + '''import json, os, sys
from pathlib import Path
name = Path(sys.argv[0]).name
with open(os.environ["TEST_COMMAND_LOG"], "a") as output:
    output.write(json.dumps([name, *sys.argv[1:]]) + "\\n")
if name == "cat":
    key = {"/etc/apply/image": "TEST_API_IMAGE", "/etc/apply/web-image": "TEST_WEB_IMAGE"}.get(sys.argv[1])
    if key is None:
        sys.exit(99)
    print(os.environ[key])
elif name == "python3":
    sys.stdin.read()  # Consume, but never execute, the secret preparation code.
elif name == "mountpoint":
    sys.exit(int(os.environ["TEST_MOUNT_RESULT"]))
elif name == "install":
    pass
elif name == "seq":
    print("1")
elif name in ("nginx", "systemctl"):
    pass
elif name == "docker" and sys.argv[1:3] == ["container", "inspect"]:
    sys.exit(1)  # Exercise first-time PostgreSQL container creation.
elif name != "docker":
    sys.exit(99)
''')
        executable.chmod(0o700)
        for name in ("cat", "mountpoint", "python3", "docker", "install", "seq", "nginx", "systemctl"):
            (self.directory / name).symlink_to(executable)
        self.bash = shutil.which("bash")
        self.assertIsNotNone(self.bash)
        self.environment = {
            "PATH": str(self.directory), "BASH_ENV": str(config),
            "TEST_COMMAND_LOG": str(self.log), "TEST_REPOSITORY": self.repository,
            "TEST_ENVIRONMENT": "staging", "TEST_MOUNT_RESULT": "0",
            "TEST_API_IMAGE": self.api, "TEST_WEB_IMAGE": self.web,
        }

    def launch(self, *arguments, script="apply-run.sh", **overrides):
        self.log.write_text("")
        result = subprocess.run(
            [self.bash, str(ROOT / script), *arguments],
            env={**self.environment, **overrides}, capture_output=True, text=True,
            timeout=10,
        )
        calls = [json.loads(line) for line in self.log.read_text().splitlines()]
        return result, calls

    def run_command(self, calls):
        runs = [call for call in calls if call[:2] == ["docker", "run"]]
        self.assertEqual(1, len(runs))
        return runs[0]

    def test_api_uses_its_own_name_and_runtime_network(self):
        for environment in ("staging", "production"):
            for arguments in ((), ("api",)):
                with self.subTest(environment=environment, arguments=arguments):
                    result, calls = self.launch(*arguments, TEST_ENVIRONMENT=environment)
                    self.assertEqual(0, result.returncode, result.stderr)
                    command = self.run_command(calls)
                    self.assertEqual("apply-api", command[command.index("--name") + 1])
                    self.assertEqual("apply-database", command[command.index("--network") + 1])
                    self.assertNotIn("--publish", command)
                    self.assertIn("/run/apply/runtime.env", command)
                    self.assertEqual([self.api, "./bin/rails", "server"], command[-3:])
                    self.assertIn(["python3", "-"], calls)

    def test_web_has_no_secret_preparation_or_database_configuration(self):
        result, calls = self.launch("web")
        self.assertEqual(0, result.returncode, result.stderr)
        command = self.run_command(calls)
        self.assertEqual("apply-web", command[command.index("--name") + 1])
        self.assertEqual("apply-frontend", command[command.index("--network") + 1])
        self.assertNotIn("--publish", command)
        self.assertNotIn("--env-file", command)
        self.assertNotIn("apply-database", command)
        self.assertEqual(self.web, command[-1])
        self.assertFalse(any(call[0] == "python3" for call in calls))

    def test_service_start_stop_and_cleanup_match_launched_containers(self):
        for component in ("api", "web"):
            with self.subTest(component=component):
                service = configparser.ConfigParser(interpolation=None)
                service.read(ROOT / f"apply-{component}.service")
                self.assertEqual(f"/usr/local/sbin/apply-run {component}", service["Service"]["ExecStart"])
                self.assertEqual(f"/usr/local/sbin/apply-run route {component}", service["Service"]["ExecStartPost"])
                result, calls = self.launch(component)
                self.assertEqual(0, result.returncode, result.stderr)
                command = self.run_command(calls)
                name = command[command.index("--name") + 1]
                self.assertEqual(name, service["Service"]["ExecStartPre"].split()[-1])
                self.assertEqual(name, service["Service"]["ExecStop"].split()[-1])

    def test_prepare_does_not_start_a_container_or_read_an_image(self):
        result, calls = self.launch("prepare")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual([["mountpoint", "-q", "/srv/apply"], ["python3", "-"]], calls)

    def test_bad_images_never_start_a_container(self):
        for component, key in (("api", "TEST_API_IMAGE"), ("web", "TEST_WEB_IMAGE")):
            for value in (self.repository + ":latest", self.api[:-1], self.api.replace("/synthetic@", "/other@")):
                with self.subTest(component=component, image=value):
                    result, calls = self.launch(component, **{key: value})
                    self.assertNotEqual(0, result.returncode)
                    self.assertFalse(any(call[:2] == ["docker", "run"] for call in calls))

    def test_invalid_mode_or_environment_fails_before_preparing_secrets(self):
        for arguments, overrides in ((("unknown",), {}), (("api",), {"TEST_ENVIRONMENT": "development"})):
            with self.subTest(arguments=arguments, overrides=overrides):
                result, calls = self.launch(*arguments, **overrides)
                self.assertNotEqual(0, result.returncode)
                self.assertFalse(any(call[0] in ("docker", "python3") for call in calls))

    def test_missing_data_mount_fails_before_any_runtime_operations(self):
        for component in ("api", "web", "prepare"):
            with self.subTest(component=component):
                result, calls = self.launch(component, TEST_MOUNT_RESULT="1")
                self.assertNotEqual(0, result.returncode)
                self.assertEqual([["mountpoint", "-q", "/srv/apply"]], calls)

    def test_postgres_bind_mount_is_private_and_owned_by_database_user(self):
        result, calls = self.launch("start", script="postgres.sh")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn(["install", "-d", "-o", "999", "-g", "999", "-m", "700", "/srv/apply/postgres"], calls)
        command = self.run_command(calls)
        self.assertIn("type=bind,src=/srv/apply/postgres,dst=/var/lib/postgresql", command)

    def test_private_route_refresh_is_separate_from_secret_preparation(self):
        for component in ("api", "web"):
            result, calls = self.launch("route", component)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertIn(["python3", "-", component], calls)
            self.assertNotIn(["python3", "-"], calls)
            self.assertIn(["nginx", "-t"], calls)
            self.assertIn(["systemctl", "reload", "nginx.service"], calls)
        for component in ("", "other"):
            result, calls = self.launch("route", component)
            self.assertNotEqual(0, result.returncode)
            self.assertFalse(any(call[0] == "python3" for call in calls))


if __name__ == "__main__":
    unittest.main()
