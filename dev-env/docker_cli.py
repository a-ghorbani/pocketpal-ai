from pathlib import Path
import os
import subprocess


WINDOWS_DOCKER = Path(
    "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
)
_resolved: tuple[str, bool] | None = None


def resolve_docker() -> tuple[str, bool]:
    global _resolved
    if _resolved is not None:
        return _resolved

    configured = os.environ.get("POCKETPAL_DOCKER_CLI")
    candidates = [(configured, configured.lower().endswith(".exe"))] if configured else []
    candidates.extend([("docker", False), (str(WINDOWS_DOCKER), True)])
    errors = []
    for executable, is_windows in candidates:
        if not executable:
            continue
        try:
            result = subprocess.run(
                [executable, "info"],
                text=True,
                capture_output=True,
                timeout=15,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as error:
            errors.append(str(error))
            continue
        if result.returncode == 0:
            _resolved = (executable, is_windows)
            return _resolved
        errors.append(result.stderr.strip())
    raise RuntimeError(
        "Docker is unavailable through the Linux or Windows Docker CLI. "
        "Start Docker Desktop and enable this distribution under "
        "Settings > Resources > WSL Integration."
    )


def windows_path(path: str) -> str:
    result = subprocess.run(
        ["wslpath", "-w", path],
        check=True,
        text=True,
        capture_output=True,
        timeout=15,
    )
    return result.stdout.strip()


def docker_command(*arguments: str) -> list[str]:
    executable, is_windows = resolve_docker()
    converted = list(arguments)
    if is_windows and converted:
        if converted[0] == "cp" and len(converted) >= 3:
            source = converted[1]
            if source.startswith("/"):
                converted[1] = windows_path(source)
        if converted[0] == "run":
            for index, value in enumerate(converted[:-1]):
                if value not in ("--volume", "-v"):
                    continue
                source, separator, destination = converted[index + 1].rpartition(":")
                if separator and source.startswith("/"):
                    converted[index + 1] = f"{windows_path(source)}:{destination}"
    return [executable, *converted]
