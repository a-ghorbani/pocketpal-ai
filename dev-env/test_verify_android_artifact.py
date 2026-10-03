from contextlib import redirect_stderr
import importlib.util
from io import StringIO
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile


MODULE_PATH = Path(__file__).with_name("verify_android_artifact.py")
SPEC = importlib.util.spec_from_file_location("verify_android_artifact", MODULE_PATH)
verify = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(verify)


class VerifyAndroidArtifactTest(unittest.TestCase):
    @mock.patch.object(verify.time, "sleep")
    @mock.patch.object(verify, "run")
    @mock.patch.object(verify, "latest_run")
    def test_dispatch_selects_new_run_for_exact_sha(
        self, latest_run, _run, _sleep
    ):
        latest_run.side_effect = [
            {"databaseId": 10, "headSha": "old"},
            {"databaseId": 11, "headSha": "stale"},
            {"databaseId": 12, "headSha": "expected"},
        ]

        run_id = verify.dispatch_run("acme/app", "feature", "expected")

        self.assertEqual(run_id, 12)

    def test_parse_bounds_returns_center(self):
        self.assertEqual(verify.parse_bounds("[10,20][110,220]"), (60, 120))

    def test_parse_bounds_rejects_invalid_input(self):
        with self.assertRaisesRegex(SystemExit, "Invalid Android UI bounds"):
            verify.parse_bounds("10,20,30,40")

    def test_numeric_options_must_be_positive(self):
        with redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as raised:
                verify.build_parser().parse_args(
                    ["--run-id", "123", "--relaunch-count", "0"]
                )
        self.assertEqual(raised.exception.code, 2)

    def test_fatal_lines_are_case_insensitive(self):
        lines = verify.fatal_lines(
            "ok\njava.lang.UnsatisfiedLinkError: missing\nfatal exception: main"
        )
        self.assertEqual(len(lines), 2)

    @mock.patch.object(verify, "adb")
    def test_capture_log_scopes_to_app_process(self, adb):
        adb.side_effect = [
            subprocess.CompletedProcess([], 0, "123\n", ""),
            subprocess.CompletedProcess([], 0, "app log\n", ""),
        ]
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "logcat.txt"
            verify.capture_log("emulator", destination)
            self.assertEqual(destination.read_text(), "app log\n")
        adb.assert_any_call(
            "emulator", "logcat", "-d", "--pid=123", timeout=60
        )

    def test_ui_policy_helpers(self):
        texts = {"Chat", "Models", "Hugging Face Token"}
        verify.assert_present(texts, ("Chat", "Models"), "screen")
        verify.assert_absent(texts, ("PalsHub", "Sign In"), "screen")
        with self.assertRaisesRegex(SystemExit, "missing"):
            verify.assert_present(texts, ("API key",), "screen")
        with self.assertRaisesRegex(SystemExit, "disabled UI"):
            verify.assert_absent(texts, ("hugging face",), "screen")

    def test_dex_boundary_accepts_keychain_without_central_auth(self):
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / "app.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                archive.writestr("classes.dex", b"header RNKeychain footer")
            verify.inspect_dex(apk)

    def test_dex_boundary_rejects_firebase(self):
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / "app.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                archive.writestr(
                    "classes.dex",
                    b"RNKeychain io/invertase/firebase/app",
                )
            with self.assertRaisesRegex(SystemExit, "disabled native classes"):
                verify.inspect_dex(apk)

    def test_summary_records_provenance(self):
        details = {
            "databaseId": 123,
            "url": "https://github.com/acme/app/actions/runs/123",
            "headSha": "abc",
            "conclusion": "success",
        }
        summary = verify.build_summary(
            details,
            Path("/tmp/app.apk"),
            "digest",
            Path("/tmp/evidence"),
            clean_install_ran=True,
            ui_policy_ran=False,
            launch_check_seconds=60,
            relaunch_check_seconds=15,
            relaunch_count=2,
        )
        self.assertEqual(summary["repository"], "acme/app")
        self.assertEqual(summary["run_id"], 123)
        self.assertEqual(summary["commit_sha"], "abc")
        self.assertEqual(summary["checks"]["clean_install"]["status"], "passed")
        self.assertEqual(
            summary["checks"]["upgrade_install"]["check_seconds"], 60
        )
        self.assertEqual(summary["checks"]["ui_auth_policy"], "skipped")


if __name__ == "__main__":
    unittest.main()
