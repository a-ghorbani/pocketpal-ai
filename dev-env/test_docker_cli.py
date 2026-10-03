import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).with_name("docker_cli.py")
SPEC = importlib.util.spec_from_file_location("docker_cli_test_target", MODULE_PATH)
docker_cli = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(docker_cli)


class DockerCliTest(unittest.TestCase):
    def setUp(self):
        docker_cli._resolved = None

    @mock.patch.object(docker_cli.subprocess, "run")
    def test_falls_back_to_windows_docker_when_wsl_socket_is_unavailable(self, run):
        run.side_effect = [
            subprocess.CompletedProcess([], 1, "", "daemon unavailable"),
            subprocess.CompletedProcess([], 0, "", ""),
        ]

        executable, is_windows = docker_cli.resolve_docker()

        self.assertEqual(executable, str(docker_cli.WINDOWS_DOCKER))
        self.assertTrue(is_windows)

    @mock.patch.object(docker_cli, "windows_path", return_value=r"\\wsl$\Ubuntu\tmp\a.apk")
    def test_translates_wsl_source_for_windows_docker_cp(self, _windows_path):
        docker_cli._resolved = ("docker.exe", True)

        command = docker_cli.docker_command(
            "cp", "/tmp/a.apk", "emulator:/tmp/a.apk"
        )

        self.assertEqual(
            command,
            [
                "docker.exe",
                "cp",
                r"\\wsl$\Ubuntu\tmp\a.apk",
                "emulator:/tmp/a.apk",
            ],
        )

    @mock.patch.object(
        docker_cli, "windows_path", return_value=r"\\wsl$\Ubuntu\home\me\.android"
    )
    def test_translates_wsl_volume_for_windows_docker(self, _windows_path):
        docker_cli._resolved = ("docker.exe", True)

        command = docker_cli.docker_command(
            "run", "--volume", "/home/me/.android:/keys", "image"
        )

        self.assertEqual(
            command[3],
            r"\\wsl$\Ubuntu\home\me\.android:/keys",
        )


if __name__ == "__main__":
    unittest.main()
