import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).with_name("android_emulator.py")
SPEC = importlib.util.spec_from_file_location("android_emulator", MODULE_PATH)
android_emulator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(android_emulator)


def completed(stdout="", stderr="", returncode=0):
    return subprocess.CompletedProcess([], returncode, stdout, stderr)


class AndroidEmulatorTest(unittest.TestCase):
    def test_launch_subcommand_parser_wires_handler_and_options(self):
        args = android_emulator.build_parser().parse_args(
            [
                "launch",
                "com.pocketpalai.e2e",
                "--launch-check-seconds",
                "15",
            ]
        )

        self.assertIs(args.handler, android_emulator.launch_installed)
        self.assertEqual(args.launch, "com.pocketpalai.e2e")
        self.assertEqual(args.launch_check_seconds, 15)

    @mock.patch.object(android_emulator.time, "sleep")
    @mock.patch.object(android_emulator.time, "monotonic", side_effect=[0, 1])
    @mock.patch.object(android_emulator, "adb_shell")
    def test_successful_launch_readiness(self, adb_shell, _monotonic, _sleep):
        adb_shell.side_effect = [
            completed("123\n"),
            completed(
                "mResumedActivity: ActivityRecord{abc u0 "
                "com.pocketpalai.e2e/com.pocketpal.MainActivity t1}"
            ),
            completed("123\n"),
            completed(
                "topResumedActivity=ActivityRecord{abc u0 "
                "com.pocketpalai.e2e/com.pocketpal.MainActivity t1}"
            ),
        ]

        android_emulator.verify_launch(
            "emulator",
            "com.pocketpalai.e2e",
            "com.pocketpalai.e2e/com.pocketpal.MainActivity",
            1,
        )

    def test_explicit_am_start_error_with_zero_exit_code(self):
        result = completed(
            "Starting: Intent { cmp=com.example/com.example.MainActivity }\n"
            "Error: Activity class does not exist.\n"
        )

        with self.assertRaisesRegex(SystemExit, "activity launch failed"):
            android_emulator.check_am_start_output(result)

    @mock.patch.object(android_emulator.time, "monotonic", return_value=0)
    @mock.patch.object(
        android_emulator,
        "adb_shell",
        side_effect=subprocess.CalledProcessError(1, ["adb", "shell", "pidof"]),
    )
    def test_process_early_death(self, _adb_shell, _monotonic):
        with self.assertRaisesRegex(SystemExit, "exited before"):
            android_emulator.verify_launch(
                "emulator",
                "com.example",
                "com.example/com.example.MainActivity",
                5,
            )

    @mock.patch.object(
        android_emulator.subprocess,
        "run",
        side_effect=subprocess.TimeoutExpired(["docker", "inspect"], 15),
    )
    def test_inspect_timeout_is_reported(self, _run):
        with self.assertRaisesRegex(SystemExit, "Timed out inspecting"):
            android_emulator.inspect_container("emulator")

    @mock.patch.object(android_emulator.subprocess, "run")
    def test_inspect_failure_is_not_treated_as_missing(self, run):
        run.return_value = completed(stderr="permission denied", returncode=1)

        with self.assertRaisesRegex(SystemExit, "permission denied"):
            android_emulator.inspect_container("emulator")

    @mock.patch.object(android_emulator.subprocess, "run")
    def test_missing_container_returns_none(self, run):
        run.return_value = completed(
            stderr="Error: No such object: emulator", returncode=1
        )

        self.assertIsNone(android_emulator.inspect_container("emulator"))

    @mock.patch.object(android_emulator.subprocess, "run")
    def test_missing_container_from_windows_cli_returns_none(self, run):
        run.return_value = completed(
            stderr="error: no such object: emulator", returncode=1
        )

        self.assertIsNone(android_emulator.inspect_container("emulator"))

    @mock.patch.object(android_emulator.time, "sleep")
    @mock.patch.object(android_emulator.time, "monotonic", side_effect=[0, 0, 2])
    @mock.patch.object(
        android_emulator.subprocess,
        "run",
        return_value=completed(stdout="0\n"),
    )
    def test_boot_timeout_is_reported(self, _run, _monotonic, _sleep):
        with self.assertRaisesRegex(SystemExit, "within 1 seconds"):
            android_emulator.wait_for_boot("emulator", 1)


if __name__ == "__main__":
    unittest.main()
