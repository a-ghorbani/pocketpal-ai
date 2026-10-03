#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docker_cli import docker_command, resolve_docker

DEFAULT_IMAGE = (
    "us-docker.pkg.dev/android-emulator-268719/images/"
    "30-google-x64:30.1.2"
)
DEFAULT_CONTAINER = "pocketpal-android-emulator"
ADB = "/android/sdk/platform-tools/adb"
SUBPROCESS_TIMEOUT = 15
ADB_INSTALL_TIMEOUT = 300
LAUNCH_CHECK_INTERVAL = 0.5


def format_command(command: list[str]) -> str:
    return " ".join(
        "ADBKEY=<redacted>" if part.startswith("ADBKEY=") else part
        for part in command
    )


def run(
    command: list[str],
    *,
    capture: bool = False,
    timeout: float | None = None,
) -> subprocess.CompletedProcess[str]:
    print("+", format_command(command), file=sys.stderr)
    return subprocess.run(
        command,
        check=True,
        text=True,
        capture_output=capture,
        timeout=timeout,
    )


def docker_available() -> None:
    try:
        executable, is_windows = resolve_docker()
        if is_windows:
            print(
                f"Using Windows Docker CLI fallback: {executable}",
                file=sys.stderr,
            )
    except RuntimeError as error:
        raise SystemExit(str(error)) from error


def inspect_container(name: str) -> dict | None:
    try:
        result = subprocess.run(
            docker_command("inspect", name),
            text=True,
            capture_output=True,
            timeout=SUBPROCESS_TIMEOUT,
        )
    except subprocess.TimeoutExpired as error:
        raise SystemExit(
            f"Timed out inspecting Docker container {name!r}."
        ) from error
    if result.returncode != 0:
        error = result.stderr.strip()
        normalized_error = error.casefold()
        if (
            "no such object:" in normalized_error
            or "no such container:" in normalized_error
        ):
            return None
        raise SystemExit(
            f"Could not inspect Docker container {name!r}: "
            f"{error or f'docker exited with code {result.returncode}'}"
        )
    try:
        return json.loads(result.stdout)[0]
    except (json.JSONDecodeError, IndexError, TypeError) as error:
        raise SystemExit(
            f"Docker returned invalid inspection data for container {name!r}."
        ) from error


def pull_image(image: str) -> None:
    docker_available()
    run(docker_command("pull", image))


def ensure_image(image: str) -> None:
    result = subprocess.run(
        docker_command("image", "inspect", image),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        pull_image(image)


def ensure_adb_key(image: str) -> Path:
    android_dir = Path.home() / ".android"
    private_key = android_dir / "adbkey"
    public_key = android_dir / "adbkey.pub"
    if private_key.is_file() and public_key.is_file():
        return private_key
    if private_key.exists() or public_key.exists():
        raise SystemExit(
            f"Refusing to overwrite an existing partial ADB key pair in {android_dir}. "
            "Restore the missing key file or move the existing file first."
        )

    android_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    run(
        docker_command(
            "run",
            "--rm",
            "--user",
            f"{os.getuid()}:{os.getgid()}",
            "--entrypoint",
            ADB,
            "--volume",
            f"{android_dir}:/keys",
            image,
            "keygen",
            "/keys/adbkey",
        ),
        timeout=SUBPROCESS_TIMEOUT,
    )
    private_key.chmod(0o600)
    public_key.chmod(0o644)
    return private_key


def wait_for_boot(name: str, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            result = subprocess.run(
                docker_command(
                    "exec",
                    name,
                    ADB,
                    "shell",
                    "getprop",
                    "sys.boot_completed",
                ),
                text=True,
                capture_output=True,
                timeout=SUBPROCESS_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            result = None
        if result and result.returncode == 0 and result.stdout.strip() == "1":
            version = run(
                docker_command(
                    "exec",
                    name,
                    ADB,
                    "shell",
                    "getprop",
                    "ro.build.version.release",
                ),
                capture=True,
                timeout=SUBPROCESS_TIMEOUT,
            ).stdout.strip()
            api = run(
                docker_command(
                    "exec",
                    name,
                    ADB,
                    "shell",
                    "getprop",
                    "ro.build.version.sdk",
                ),
                capture=True,
                timeout=SUBPROCESS_TIMEOUT,
            ).stdout.strip()
            print(f"Android {version} (API {api}) is ready.")
            return
        time.sleep(3)
    raise SystemExit(
        f"Emulator did not finish booting within {timeout} seconds. "
        f"Run: docker logs {name}"
    )


def start_container(args: argparse.Namespace) -> None:
    docker_available()
    ensure_image(args.image)
    existing = inspect_container(args.name)
    if existing:
        configured_image = existing["Config"]["Image"]
        if configured_image != args.image:
            raise SystemExit(
                f"Container {args.name!r} uses {configured_image!r}, not "
                f"{args.image!r}. Remove or rename it before continuing."
            )
        if not existing["State"]["Running"]:
            run(docker_command("start", args.name))
        else:
            print(f"Container {args.name!r} is already running.")
        wait_for_boot(args.name, args.timeout)
        return

    if not Path("/dev/kvm").exists():
        raise SystemExit(
            "/dev/kvm is unavailable. Enable hardware virtualization and KVM "
            "passthrough in Docker Desktop."
        )

    adb_key = ensure_adb_key(args.image)
    run(
        docker_command(
            "run",
            "--detach",
            "--name",
            args.name,
            "--device",
            "/dev/kvm",
            "--env",
            f"ADBKEY={adb_key.read_text().strip()}",
            "--publish",
            f"127.0.0.1:{args.adb_port}:5555",
            "--publish",
            f"127.0.0.1:{args.webrtc_port}:8554",
            args.image,
        )
    )
    wait_for_boot(args.name, args.timeout)


def stop_container(args: argparse.Namespace) -> None:
    docker_available()
    existing = inspect_container(args.name)
    if not existing:
        raise SystemExit(f"Container {args.name!r} does not exist.")
    if existing["State"]["Running"]:
        run(docker_command("stop", args.name))
    else:
        print(f"Container {args.name!r} is already stopped.")


def show_status(args: argparse.Namespace) -> None:
    docker_available()
    existing = inspect_container(args.name)
    if not existing:
        print(f"Container {args.name!r} does not exist.")
        return
    state = existing["State"]
    health = state.get("Health", {}).get("Status", "not configured")
    print(f"name:   {args.name}")
    print(f"image:  {existing['Config']['Image']}")
    print(f"status: {state['Status']}")
    print(f"health: {health}")
    if state["Running"]:
        run(
            docker_command("exec", args.name, ADB, "devices", "-l"),
            timeout=SUBPROCESS_TIMEOUT,
        )


def show_logs(args: argparse.Namespace) -> None:
    docker_available()
    command = docker_command("logs", "--tail", str(args.tail))
    if args.follow:
        command.append("--follow")
    command.append(args.name)
    try:
        run(command)
    except KeyboardInterrupt:
        pass


def adb_shell(
    name: str,
    *arguments: str,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    return run(
        docker_command("exec", name, ADB, "shell", *arguments),
        capture=capture,
        timeout=SUBPROCESS_TIMEOUT,
    )


def resolve_launch_component(name: str, target: str) -> tuple[str, str]:
    if "/" in target:
        package, activity = target.split("/", 1)
        if (
            not package
            or not activity
            or activity.startswith(".")
            or "." not in package
            or "." not in activity
        ):
            raise SystemExit(
                "--launch must be an installed package or an exact full "
                "component such as "
                "com.pocketpalai.e2e/com.pocketpal.MainActivity."
            )
        return package, target

    result = adb_shell(
        name,
        "cmd",
        "package",
        "resolve-activity",
        "--brief",
        "-a",
        "android.intent.action.MAIN",
        "-c",
        "android.intent.category.LAUNCHER",
        target,
    )
    candidates = [
        line.strip()
        for line in result.stdout.splitlines()
        if "/" in line and not line.lstrip().startswith(("Error:", "Warning:"))
    ]
    if not candidates:
        raise SystemExit(
            f"No launcher activity found for installed package {target!r}."
        )
    component = candidates[-1]
    package, activity = component.split("/", 1)
    if activity.startswith("."):
        component = f"{package}/{package}{activity}"
    return package, component


def check_am_start_output(result: subprocess.CompletedProcess[str]) -> None:
    output = "\n".join(part for part in (result.stdout, result.stderr) if part)
    if re.search(
        r"(?im)^\s*(?:error:|exception\b|security exception\b)|"
        r"\b(?:ActivityNotFoundException|SecurityException)\b",
        output,
    ):
        raise SystemExit(f"Android activity launch failed: {output.strip()}")


def foreground_component(output: str) -> str | None:
    for line in output.splitlines():
        if "mResumedActivity" not in line and "topResumedActivity" not in line:
            continue
        match = re.search(r"([A-Za-z0-9_.$]+/[A-Za-z0-9_.$]+)", line)
        if match:
            package, activity = match.group(1).split("/", 1)
            if activity.startswith("."):
                activity = package + activity
            return f"{package}/{activity}"
    return None


def verify_launch(
    name: str,
    package: str,
    component: str,
    interval: float,
) -> None:
    deadline = time.monotonic() + interval
    while True:
        try:
            process = adb_shell(name, "pidof", package)
        except subprocess.CalledProcessError:
            process = None
        if process is None or not process.stdout.strip():
            raise SystemExit(
                f"Launched package {package!r} exited before the "
                f"{interval:g}-second readiness check completed."
            )

        activities = adb_shell(name, "dumpsys", "activity", "activities")
        foreground = foreground_component(activities.stdout)
        now = time.monotonic()
        if now >= deadline:
            if foreground != component:
                raise SystemExit(
                    f"Expected {component!r} to be foreground after "
                    f"{interval:g} seconds, but found "
                    f"{foreground or 'no resumed activity'!r}."
                )
            return
        time.sleep(min(LAUNCH_CHECK_INTERVAL, deadline - now))


def launch_activity(args: argparse.Namespace) -> None:
    package, component = resolve_launch_component(args.name, args.launch)
    result = adb_shell(
        args.name,
        "am",
        "start",
        "-W",
        "-n",
        component,
    )
    check_am_start_output(result)
    verify_launch(args.name, package, component, args.launch_check_seconds)


def launch_installed(args: argparse.Namespace) -> None:
    start_container(args)
    launch_activity(args)


def install_apk(args: argparse.Namespace) -> None:
    apk = args.apk.expanduser().resolve()
    if not apk.is_file():
        raise SystemExit(f"APK does not exist: {apk}")

    start_container(args)
    destination = f"/tmp/{uuid.uuid4().hex}-{apk.name}"
    copied = False
    primary_error: BaseException | None = None
    try:
        run(docker_command("cp", str(apk), f"{args.name}:{destination}"))
        copied = True
        install_command = docker_command(
            "exec",
            args.name,
            ADB,
            "install",
        )
        if args.replace:
            install_command.append("-r")
        if args.grant_permissions:
            install_command.append("-g")
        install_command.append(destination)
        run(install_command, timeout=ADB_INSTALL_TIMEOUT)
        if args.launch:
            launch_activity(args)
    except BaseException as error:
        primary_error = error
        raise
    finally:
        if copied:
            try:
                run(
                    docker_command("exec", args.name, "rm", "-f", destination),
                    capture=True,
                    timeout=SUBPROCESS_TIMEOUT,
                )
            except (
                FileNotFoundError,
                subprocess.CalledProcessError,
                subprocess.TimeoutExpired,
            ) as cleanup_error:
                message = (
                    f"Failed to remove copied APK {destination!r}: {cleanup_error}"
                )
                if primary_error is not None:
                    print(f"Warning: {message}", file=sys.stderr)
                else:
                    raise SystemExit(message) from cleanup_error


def add_runtime_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--image", default=DEFAULT_IMAGE)
    parser.add_argument("--name", default=DEFAULT_CONTAINER)
    parser.add_argument("--adb-port", type=int, default=5555)
    parser.add_argument("--webrtc-port", type=int, default=8554)
    parser.add_argument(
        "--timeout",
        type=int,
        default=240,
        help="seconds to wait for Android to boot (default: 240)",
    )


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage a Dockerized Android emulator for PocketPal APKs."
    )
    add_runtime_options(parser)
    commands = parser.add_subparsers(dest="command", required=True)

    pull = commands.add_parser("pull", help="download the emulator image")
    pull.set_defaults(handler=lambda args: pull_image(args.image))

    start = commands.add_parser("start", help="start the emulator and wait for boot")
    start.set_defaults(handler=start_container)

    stop = commands.add_parser("stop", help="stop the emulator container")
    stop.set_defaults(handler=stop_container)

    status = commands.add_parser("status", help="show container and device status")
    status.set_defaults(handler=show_status)

    logs = commands.add_parser("logs", help="show emulator container logs")
    logs.add_argument("--tail", type=int, default=100)
    logs.add_argument("--follow", action="store_true")
    logs.set_defaults(handler=show_logs)

    launch = commands.add_parser(
        "launch",
        help="launch an already-installed package or exact full component",
    )
    launch.add_argument("launch", metavar="PACKAGE_OR_FULL_COMPONENT")
    launch.add_argument(
        "--launch-check-seconds",
        type=positive_float,
        default=5,
        help="seconds the launched package must remain alive (default: 5)",
    )
    launch.set_defaults(handler=launch_installed)

    install = commands.add_parser("install", help="install a local APK")
    install.add_argument("apk", type=Path)
    install.add_argument(
        "--no-replace",
        action="store_false",
        dest="replace",
        help="do not pass -r to adb install",
    )
    install.add_argument(
        "--grant-permissions",
        action="store_true",
        help="grant runtime permissions during installation",
    )
    install.add_argument(
        "--launch",
        metavar="PACKAGE_OR_FULL_COMPONENT",
        help="launch an installed package or exact full component after installation",
    )
    install.add_argument(
        "--launch-check-seconds",
        type=positive_float,
        default=5,
        help="seconds the launched package must remain alive (default: 5)",
    )
    install.set_defaults(handler=install_apk)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        args.handler(args)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            f"Command failed with exit code {error.returncode}: "
            f"{format_command(error.cmd)}"
        ) from error


if __name__ == "__main__":
    main()
