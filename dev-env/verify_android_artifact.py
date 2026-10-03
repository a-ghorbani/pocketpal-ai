#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from docker_cli import docker_command

REPOSITORY = "wiw-msft-copilot-test/pocketpal-ai"
WORKFLOW = "e2e-tests.yml"
BRANCH = "copilot/security-audit-credentials"
PACKAGE = "com.pocketpalai.e2e"
ARTIFACT = "e2e-android-apk"
ADB = "/android/sdk/platform-tools/adb"
FATAL_PATTERN = re.compile(
    r"FATAL EXCEPTION|Default FirebaseApp|UnsatisfiedLinkError|"
    r"TurboModuleRegistry.*could not be found",
    re.IGNORECASE,
)
DISABLED_DEX_MARKERS = (
    b"io/invertase/firebase",
    b"reactnativegooglesignin",
    b"RNGoogleSignin",
)
KEYCHAIN_DEX_MARKERS = (b"RNKeychain", b"KeychainModule")


def command_text(command: list[str]) -> str:
    return " ".join(command)


def run(
    command: list[str],
    *,
    capture: bool = False,
    timeout: int | None = None,
) -> subprocess.CompletedProcess[str]:
    print("+", command_text(command), file=sys.stderr)
    return subprocess.run(
        command,
        check=True,
        text=True,
        capture_output=capture,
        timeout=timeout,
    )


def run_json(command: list[str], *, timeout: int = 60):
    result = run(command, capture=True, timeout=timeout)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(
            f"Command returned invalid JSON: {command_text(command)}"
        ) from error


def remote_sha(repository: str, branch: str) -> str:
    ref = run_json(
        [
            "gh",
            "api",
            f"repos/{repository}/git/ref/heads/{branch}",
        ]
    )
    return ref["object"]["sha"]


def latest_run(repository: str, branch: str) -> dict | None:
    runs = run_json(
        [
            "gh",
            "run",
            "list",
            "--repo",
            repository,
            "--workflow",
            WORKFLOW,
            "--branch",
            branch,
            "--event",
            "workflow_dispatch",
            "--limit",
            "1",
            "--json",
            "databaseId,headSha,status,conclusion,url,createdAt",
        ]
    )
    return runs[0] if runs else None


def dispatch_run(repository: str, branch: str, expected_sha: str) -> int:
    previous = latest_run(repository, branch)
    previous_id = previous["databaseId"] if previous else None
    run(
        [
            "gh",
            "workflow",
            "run",
            WORKFLOW,
            "--repo",
            repository,
            "--ref",
            branch,
        ],
        timeout=60,
    )
    for _ in range(20):
        candidate = latest_run(repository, branch)
        if (
            candidate
            and candidate["databaseId"] != previous_id
            and candidate["headSha"] == expected_sha
        ):
            return int(candidate["databaseId"])
        time.sleep(3)
    raise SystemExit(
        "Could not identify a newly dispatched workflow run for "
        f"expected SHA {expected_sha}."
    )


def run_details(repository: str, run_id: int) -> dict:
    return run_json(
        [
            "gh",
            "run",
            "view",
            str(run_id),
            "--repo",
            repository,
            "--json",
            "status,conclusion,headSha,url,jobs",
        ]
    )


def save_failure_logs(repository: str, details: dict, evidence_dir: Path) -> None:
    result = subprocess.run(
        [
            "gh",
            "run",
            "view",
            str(details["databaseId"]),
            "--repo",
            repository,
            "--log-failed",
        ],
        text=True,
        capture_output=True,
    )
    if result.stdout.strip():
        (evidence_dir / "failed.log").write_text(result.stdout)
        return
    for job in details.get("jobs", []):
        if job.get("conclusion") != "failure":
            continue
        job_id = job.get("databaseId")
        log = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{repository}/actions/jobs/{job_id}/logs",
            ],
            text=True,
            capture_output=True,
        )
        if log.returncode == 0:
            (evidence_dir / f"failed-job-{job_id}.log").write_text(log.stdout)


def wait_for_run(
    repository: str,
    run_id: int,
    expected_sha: str,
    evidence_dir: Path,
) -> dict:
    details = run_details(repository, run_id)
    details["databaseId"] = run_id
    if details["headSha"] != expected_sha:
        raise SystemExit(
            f"Run {run_id} targets {details['headSha']}, expected {expected_sha}."
        )
    if details["status"] != "completed":
        watch = subprocess.run(
            [
                "gh",
                "run",
                "watch",
                str(run_id),
                "--repo",
                repository,
                "--exit-status",
                "--interval",
                "30",
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=7200,
        )
        (evidence_dir / "workflow-watch.log").write_text(watch.stdout)
    details = run_details(repository, run_id)
    details["databaseId"] = run_id
    (evidence_dir / "workflow.json").write_text(
        json.dumps(details, indent=2) + "\n"
    )
    if details["conclusion"] != "success":
        save_failure_logs(repository, details, evidence_dir)
        raise SystemExit(
            f"Workflow run {run_id} concluded {details['conclusion']!r}."
        )
    return details


def download_apk(repository: str, run_id: int, evidence_dir: Path) -> Path:
    existing = list(evidence_dir.rglob("*.apk"))
    if not existing:
        run(
            [
                "gh",
                "run",
                "download",
                str(run_id),
                "--repo",
                repository,
                "--name",
                ARTIFACT,
                "--dir",
                str(evidence_dir),
            ],
            timeout=900,
        )
        existing = list(evidence_dir.glob("*.apk"))
    if len(existing) != 1:
        raise SystemExit(
            f"Expected one downloaded APK in {evidence_dir}, found {len(existing)}."
        )
    return existing[0]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_dex(apk: Path) -> None:
    with zipfile.ZipFile(apk) as archive:
        dex_names = [
            name
            for name in archive.namelist()
            if re.fullmatch(r"classes\d*\.dex", name)
        ]
        if not dex_names:
            raise SystemExit("APK contains no classes*.dex files.")
        dex = b"".join(archive.read(name) for name in dex_names)
    lower = dex.lower()
    found_disabled = [
        marker.decode(errors="replace")
        for marker in DISABLED_DEX_MARKERS
        if marker.lower() in lower
    ]
    if found_disabled:
        raise SystemExit(
            "APK contains disabled native classes: " + ", ".join(found_disabled)
        )
    if not any(marker.lower() in lower for marker in KEYCHAIN_DEX_MARKERS):
        raise SystemExit("APK does not contain the native Keychain dependency.")


def adb(
    container: str,
    *arguments: str,
    capture: bool = True,
    timeout: int = 30,
) -> subprocess.CompletedProcess[str]:
    return run(
        docker_command("exec", container, ADB, *arguments),
        capture=capture,
        timeout=timeout,
    )


def emulator_command(
    container: str,
    *arguments: str,
    timeout: int = 180,
) -> subprocess.CompletedProcess[str]:
    script = Path(__file__).with_name("android_emulator.py")
    return run(
        [
            sys.executable,
            str(script),
            "--name",
            container,
            *arguments,
        ],
        capture=True,
        timeout=timeout,
    )


def fatal_lines(log: str) -> list[str]:
    return [line for line in log.splitlines() if FATAL_PATTERN.search(line)]


def capture_log(container: str, destination: Path) -> None:
    process = adb(container, "shell", "pidof", PACKAGE).stdout.split()
    if not process:
        raise SystemExit(f"Cannot capture logs because {PACKAGE!r} is not running.")
    log = adb(
        container,
        "logcat",
        "-d",
        f"--pid={process[0]}",
        timeout=60,
    ).stdout
    destination.write_text(log)
    failures = fatal_lines(log)
    if failures:
        raise SystemExit(
            "Fatal runtime diagnostics found:\n" + "\n".join(failures[-20:])
        )


def install_and_launch(
    container: str,
    apk: Path,
    evidence_dir: Path,
    check_seconds: int,
) -> None:
    adb(container, "logcat", "-c")
    result = emulator_command(
        container,
        "install",
        str(apk),
        "--launch",
        PACKAGE,
        "--launch-check-seconds",
        str(check_seconds),
        timeout=max(420, check_seconds + 360),
    )
    (evidence_dir / "install-launch.log").write_text(
        result.stdout + result.stderr
    )
    capture_log(container, evidence_dir / "install-logcat.txt")


def relaunches(
    container: str,
    evidence_dir: Path,
    count: int,
    check_seconds: int,
) -> None:
    for index in range(1, count + 1):
        adb(container, "logcat", "-c")
        adb(container, "shell", "am", "force-stop", PACKAGE)
        result = emulator_command(
            container,
            "launch",
            PACKAGE,
            "--launch-check-seconds",
            str(check_seconds),
            timeout=max(120, check_seconds + 60),
        )
        (evidence_dir / f"relaunch-{index}.log").write_text(
            result.stdout + result.stderr
        )
        capture_log(container, evidence_dir / f"relaunch-{index}-logcat.txt")


def binary_output(command: list[str], *, timeout: int = 60) -> bytes:
    print("+", command_text(command), file=sys.stderr)
    result = subprocess.run(command, check=True, capture_output=True, timeout=timeout)
    return result.stdout


def dump_ui(container: str, evidence_dir: Path, name: str) -> ET.Element:
    device_path = f"/sdcard/{name}.xml"
    adb(container, "shell", "uiautomator", "dump", device_path, timeout=60)
    xml = binary_output(
        docker_command("exec", container, ADB, "exec-out", "cat", device_path)
    )
    image = binary_output(
        docker_command("exec", container, ADB, "exec-out", "screencap", "-p")
    )
    (evidence_dir / f"{name}.xml").write_bytes(xml)
    (evidence_dir / f"{name}.png").write_bytes(image)
    return ET.fromstring(xml)


def node_text(node: ET.Element) -> str:
    return node.get("text") or node.get("content-desc") or ""


def ui_text(root: ET.Element) -> set[str]:
    return {node_text(node) for node in root.iter("node") if node_text(node)}


def parse_bounds(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", value)
    if not match:
        raise SystemExit(f"Invalid Android UI bounds: {value!r}")
    left, top, right, bottom = map(int, match.groups())
    return ((left + right) // 2, (top + bottom) // 2)


def find_control(
    root: ET.Element,
    *,
    text: str | None = None,
    resource_id: str | None = None,
) -> ET.Element:
    matches = []
    for node in root.iter("node"):
        if text is not None and node_text(node) != text:
            continue
        if resource_id is not None and node.get("resource-id") != resource_id:
            continue
        matches.append(node)
    if not matches:
        target = text or resource_id
        raise SystemExit(f"UI control {target!r} was not found.")
    return next(
        (node for node in matches if node.get("clickable") == "true"),
        matches[0],
    )


def tap_control(
    container: str,
    root: ET.Element,
    *,
    text: str | None = None,
    resource_id: str | None = None,
) -> None:
    node = find_control(root, text=text, resource_id=resource_id)
    x, y = parse_bounds(node.get("bounds", ""))
    adb(container, "shell", "input", "tap", str(x), str(y))
    time.sleep(1)


def assert_present(texts: set[str], required: tuple[str, ...], surface: str) -> None:
    missing = [text for text in required if text not in texts]
    if missing:
        raise SystemExit(f"{surface} is missing: {', '.join(missing)}")


def assert_absent(texts: set[str], forbidden: tuple[str, ...], surface: str) -> None:
    found = [
        item
        for item in forbidden
        if any(item.lower() in text.lower() for text in texts)
    ]
    if found:
        raise SystemExit(f"{surface} exposes disabled UI: {', '.join(found)}")


def verify_ui_policy(container: str, evidence_dir: Path) -> None:
    emulator_command(
        container,
        "launch",
        PACKAGE,
        "--launch-check-seconds",
        "5",
        timeout=90,
    )
    current = dump_ui(container, evidence_dir, "chat")
    assert_present(ui_text(current), ("Chat", "Download Model"), "Chat")
    tap_control(container, current, resource_id="menu-button")
    drawer = dump_ui(container, evidence_dir, "drawer")
    drawer_text = ui_text(drawer)
    assert_present(
        drawer_text,
        ("Chat", "Models", "Benchmark", "Settings", "App Info"),
        "Drawer",
    )
    assert_absent(drawer_text, ("Pals", "PalsHub", "Sign In"), "Drawer")

    tap_control(container, drawer, text="Settings")
    required_settings = (
        "Search provider",
        "API key",
        "Hugging Face Token",
        "Set Token",
    )
    settings_text: set[str] = set()
    settings = None
    for page in range(8):
        settings = dump_ui(container, evidence_dir, f"settings-{page}")
        settings_text.update(ui_text(settings))
        if all(text in settings_text for text in required_settings):
            break
        adb(
            container,
            "shell",
            "input",
            "swipe",
            "540",
            "1450",
            "540",
            "350",
            "500",
        )
        time.sleep(1)
    assert settings is not None
    assert_present(settings_text, required_settings, "Settings")
    assert_absent(settings_text, ("PalsHub", "Sign In"), "Settings")

    tap_control(container, settings, resource_id="menu-button")
    drawer = dump_ui(container, evidence_dir, "models-drawer")
    tap_control(container, drawer, text="Models")
    models = dump_ui(container, evidence_dir, "models")
    tap_control(container, models, resource_id="fab-group")
    model_menu = dump_ui(container, evidence_dir, "model-menu")
    tap_control(container, model_menu, text="Add Remote Model")
    remote = dump_ui(container, evidence_dir, "remote-model-initial")
    url = find_control(remote, resource_id="remote-url-input")
    x, y = parse_bounds(url.get("bounds", ""))
    adb(container, "shell", "input", "tap", str(x), str(y))
    adb(container, "shell", "input", "text", "http://127.0.0.1:9")
    adb(container, "shell", "input", "keyevent", "66")
    remote_text: set[str] = set()
    for attempt in range(15):
        time.sleep(1)
        remote = dump_ui(container, evidence_dir, f"remote-model-{attempt}")
        remote_text.update(ui_text(remote))
        if {"API Key", "Stored securely on device."}.issubset(remote_text):
            break
        adb(
            container,
            "shell",
            "input",
            "swipe",
            "540",
            "1450",
            "540",
            "700",
            "300",
        )
    assert_present(
        remote_text,
        ("Add Remote Model", "API Key", "Stored securely on device."),
        "Remote model",
    )

    tap_control(container, remote, resource_id="sheet-close-button")
    models = dump_ui(container, evidence_dir, "models-after-remote")
    tap_control(container, models, resource_id="menu-button")
    drawer = dump_ui(container, evidence_dir, "info-drawer")
    tap_control(container, drawer, text="App Info")
    info = dump_ui(container, evidence_dir, "app-info")
    info_text = ui_text(info)
    assert_present(info_text, ("PocketPal AI", "Support the Project"), "App Info")
    assert_absent(
        info_text,
        ("Share Your Thoughts", "PalsHub", "Sign In"),
        "App Info",
    )


def verify_disabled_links(container: str, evidence_dir: Path) -> None:
    links = {
        "hub": "pocketpal://hub/run?url=https%3A%2F%2Fexample.invalid%2Fmodel.gguf",
        "checkout": "pocketpal://checkout/success",
    }
    for name, link in links.items():
        adb(container, "logcat", "-c")
        result = adb(
            container,
            "shell",
            "am",
            "start",
            "-W",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            link,
            PACKAGE,
        )
        (evidence_dir / f"{name}-link.log").write_text(result.stdout)
        time.sleep(5)
        process = adb(container, "shell", "pidof", PACKAGE).stdout.strip()
        if not process:
            raise SystemExit(f"App exited after disabled {name} deep link.")
        activities = adb(
            container, "shell", "dumpsys", "activity", "activities"
        ).stdout
        if f"{PACKAGE}/com.pocketpal.MainActivity" not in activities:
            raise SystemExit(f"App left the foreground after {name} deep link.")
        capture_log(container, evidence_dir / f"{name}-link-logcat.txt")


def clean_install(
    apk: Path,
    evidence_dir: Path,
    base_container: str,
    run_id: int,
    check_seconds: int,
    adb_port: int,
    webrtc_port: int,
) -> None:
    name = f"{base_container}-clean-{run_id}"
    existing = subprocess.run(
        docker_command("inspect", name),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=30,
    )
    if existing.returncode == 0:
        raise SystemExit(
            f"Refusing to reuse or remove existing clean-test container {name!r}."
        )
    script = Path(__file__).with_name("android_emulator.py")
    command = [
        sys.executable,
        str(script),
        "--name",
        name,
        "--adb-port",
        str(adb_port),
        "--webrtc-port",
        str(webrtc_port),
        "install",
        str(apk),
        "--launch",
        PACKAGE,
        "--launch-check-seconds",
        str(check_seconds),
    ]
    try:
        result = run(command, capture=True, timeout=max(420, check_seconds + 360))
        (evidence_dir / "clean-install-launch.log").write_text(
            result.stdout + result.stderr
        )
        root = dump_ui(name, evidence_dir, "clean-chat")
        assert_present(ui_text(root), ("Chat", "Download Model"), "Clean Chat")
        capture_log(name, evidence_dir / "clean-logcat.txt")
    finally:
        subprocess.run(
            docker_command("stop", name),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            docker_command("rm", name),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def build_summary(
    details: dict,
    apk: Path,
    digest: str,
    evidence_dir: Path,
    *,
    clean_install_ran: bool,
    ui_policy_ran: bool,
    launch_check_seconds: int,
    relaunch_check_seconds: int,
    relaunch_count: int,
) -> dict:
    return {
        "repository": details["url"].split("/actions/runs/")[0].removeprefix(
            "https://github.com/"
        ),
        "run_id": details["databaseId"],
        "run_url": details["url"],
        "commit_sha": details["headSha"],
        "conclusion": details["conclusion"],
        "apk": str(apk),
        "apk_sha256": digest,
        "package": PACKAGE,
        "evidence_dir": str(evidence_dir),
        "checks": {
            "workflow": "passed",
            "upgrade_install": {
                "status": "passed",
                "check_seconds": launch_check_seconds,
            },
            "cold_relaunches": {
                "status": "passed",
                "count": relaunch_count,
                "check_seconds": relaunch_check_seconds,
            },
            "clean_install": {
                "status": "passed" if clean_install_ran else "skipped",
                "check_seconds": launch_check_seconds,
            },
            "native_auth_boundary": "passed",
            "ui_auth_policy": "passed" if ui_policy_ran else "skipped",
            "disabled_deep_links": "passed" if ui_policy_ran else "skipped",
        },
    }


def positive_int(value: str) -> int:
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Verify a GitHub Actions Android APK artifact in the Docker emulator."
        )
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--dispatch", action="store_true")
    source.add_argument("--run-id", type=int)
    parser.add_argument("--repo", default=REPOSITORY)
    parser.add_argument("--branch", default=BRANCH)
    parser.add_argument("--expected-sha")
    parser.add_argument("--container", default="pocketpal-android-emulator")
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--launch-check-seconds", type=positive_int, default=60)
    parser.add_argument("--relaunch-check-seconds", type=positive_int, default=15)
    parser.add_argument("--relaunch-count", type=positive_int, default=2)
    parser.add_argument("--skip-clean-install", action="store_true")
    parser.add_argument("--skip-ui-policy", action="store_true")
    parser.add_argument("--clean-adb-port", type=positive_int, default=5557)
    parser.add_argument("--clean-webrtc-port", type=positive_int, default=8556)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    expected_sha = args.expected_sha or remote_sha(args.repo, args.branch)
    run_id = (
        dispatch_run(args.repo, args.branch, expected_sha)
        if args.dispatch
        else args.run_id
    )
    assert run_id is not None
    evidence_dir = args.evidence_dir or Path(f"/tmp/pocketpal-apk-{run_id}")
    evidence_dir.mkdir(parents=True, exist_ok=True)

    details = wait_for_run(args.repo, run_id, expected_sha, evidence_dir)
    apk = download_apk(args.repo, run_id, evidence_dir)
    digest = sha256(apk)
    (evidence_dir / "SHA256SUMS").write_text(f"{digest}  {apk.name}\n")
    inspect_dex(apk)
    install_and_launch(
        args.container, apk, evidence_dir, args.launch_check_seconds
    )
    relaunches(
        args.container,
        evidence_dir,
        args.relaunch_count,
        args.relaunch_check_seconds,
    )
    if not args.skip_ui_policy:
        verify_ui_policy(args.container, evidence_dir)
        verify_disabled_links(args.container, evidence_dir)
    if not args.skip_clean_install:
        clean_install(
            apk,
            evidence_dir,
            args.container,
            run_id,
            args.launch_check_seconds,
            args.clean_adb_port,
            args.clean_webrtc_port,
        )

    summary = build_summary(
        details,
        apk,
        digest,
        evidence_dir,
        clean_install_ran=not args.skip_clean_install,
        ui_policy_ran=not args.skip_ui_policy,
        launch_check_seconds=args.launch_check_seconds,
        relaunch_check_seconds=args.relaunch_check_seconds,
        relaunch_count=args.relaunch_count,
    )
    (evidence_dir / "acceptance.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except subprocess.TimeoutExpired as error:
        raise SystemExit(
            f"Command timed out after {error.timeout} seconds: "
            f"{command_text(error.cmd)}"
        ) from error
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            f"Command failed with exit code {error.returncode}: "
            f"{command_text(error.cmd)}"
        ) from error
