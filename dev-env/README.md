# Docker Android emulator

This directory contains two dependency-free Python tools:

- `android_emulator.py` manages a hardware-accelerated Android emulator and
  installs or launches local APKs.
- `verify_android_artifact.py` runs the repeatable GitHub Actions artifact
  acceptance workflow used for release-configuration changes.

## Requirements

- Python 3.10 or newer
- Docker Desktop or Docker Engine on x86-64 Linux
- Hardware virtualization enabled
- `/dev/kvm` available to Docker
- GitHub CLI (`gh`) authenticated for the repository when using
  `verify_android_artifact.py`
- `unzip` is not required; APK inspection uses Python's standard library

Docker Desktop on macOS and Windows does not support the KVM setup required by
this image. A Linux host or Linux VM with nested virtualization is required.
When running inside WSL 2, the scripts normally use Docker Desktop's Linux
socket. If that socket integration is missing but the Windows Docker engine is
healthy, they automatically fall back to Docker Desktop's `docker.exe` and
translate WSL file paths for APK copies and key mounts.

## Usage

### Step-by-step: reload an APK and playtest it

Follow these steps from the repository root. The commands below use the
retained default emulator:

| Setting               | Value                        |
| --------------------- | ---------------------------- |
| Container             | `pocketpal-android-emulator` |
| Android version       | Android 11 / API 30          |
| ADB address           | `127.0.0.1:5555`             |
| PocketPal E2E package | `com.pocketpalai.e2e`        |

#### 1. Open a terminal in the repository and check prerequisites

```bash
cd /home/wiw/workspace/pocketpal-ai
python3 --version
docker info >/dev/null && echo "Docker is reachable"
test -e /dev/kvm && echo "/dev/kvm is available"
adb version
scrcpy --version
```

**Verify:** Python, ADB, and scrcpy each print a version. The Docker check
prints `Docker is reachable`, and the KVM check prints `/dev/kvm is
available`. If Docker is not reachable, start Docker Desktop (and enable WSL
integration when using WSL 2) before continuing. If `adb` or `scrcpy` is
missing on Ubuntu/Debian, install them with:

```bash
sudo apt update
sudo apt install -y adb scrcpy
```

#### 2. Get the APK

For the source-matching APK from the verified GitHub Actions build, authenticate
the GitHub CLI and download the artifact:

```bash
gh auth status
rm -rf /tmp/pocketpal-apk-34751845630
mkdir -p /tmp/pocketpal-apk-34751845630
gh run download 34751845630 \
  --repo wiw-msft-copilot-test/pocketpal-ai \
  --name e2e-android-apk \
  --dir /tmp/pocketpal-apk-34751845630
export APK=/tmp/pocketpal-apk-34751845630/app-e2e-releaseE2e.apk
test -f "$APK" && echo "APK found: $APK"
sha256sum "$APK"
```

**Verify:** The final command prints this SHA-256 for that exact artifact:

```text
26b53311d5906d5c35d77eaa8e9c8d5c673bee648c64132ca7bbfeb66a4c5f2f
```

For an APK already on disk, skip the download and set `APK` to its path
instead:

```bash
export APK=/absolute/path/to/app-e2e-releaseE2e.apk
test -f "$APK" && echo "APK found: $APK"
```

#### 3. Restart the emulator and wait for Android to boot

The `stop` command intentionally keeps the container and its Android data. The
following block stops the existing container when present and also works on
first use when the container does not exist:

```bash
if python3 dev-env/android_emulator.py status | grep -q "does not exist"; then
  echo "No existing emulator container; creating it now."
else
  python3 dev-env/android_emulator.py stop
fi
python3 dev-env/android_emulator.py start
```

**Verify:** `start` ends with an Android readiness message such as
`Android 11 (API 30) is ready.`. Then confirm the retained container and ADB
connection:

```bash
python3 dev-env/android_emulator.py status
adb connect 127.0.0.1:5555
adb -s 127.0.0.1:5555 get-state
adb -s 127.0.0.1:5555 shell getprop sys.boot_completed
```

The expected results are `status: running`, `device`, and `1`.

#### 4. Install the APK and launch PocketPal

```bash
python3 dev-env/android_emulator.py install "$APK" \
  --launch com.pocketpalai.e2e \
  --launch-check-seconds 10
```

The command replaces the installed APK, launches PocketPal, and checks that
the process remains alive and in the foreground.

**Verify:** The command ends successfully. For an additional explicit check:

```bash
adb -s 127.0.0.1:5555 shell pm path com.pocketpalai.e2e
adb -s 127.0.0.1:5555 shell dumpsys activity activities \
  | grep -m1 -E 'mResumedActivity|topResumedActivity'
```

The first command must print a `package:/data/app/...` path, and the second
must contain `com.pocketpalai.e2e/com.pocketpal.MainActivity`.

#### 5. Open the emulator window with scrcpy

Leave the terminal running the emulator, open a second terminal, and run:

```bash
cd /home/wiw/workspace/pocketpal-ai
adb connect 127.0.0.1:5555
scrcpy --serial 127.0.0.1:5555 --window-title "PocketPal Android emulator"
```

**Verify:** A window titled **PocketPal Android emulator** appears. Use the
mouse and keyboard to playtest the APK. Close the scrcpy window or press
`Ctrl+C` in its terminal when finished; this does not stop the emulator.

On Windows 11 with WSLg, scrcpy should display a window automatically. If no
window appears, verify that the Linux GUI environment is available:

```bash
echo "DISPLAY=$DISPLAY"
echo "WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
```

At least one of these values should be populated. Run scrcpy from a WSLg
terminal rather than an SSH-only shell.

#### Optional: capture safe Responses diagnostics while playtesting

If a remote Responses model fails, you can capture structural event information
without logging credentials or conversation content. This is optional and
should be disabled when finished.

1. In PocketPal, open **Settings**, scroll to **Diagnostics**, and turn on
   **Responses protocol logging**.
2. In a second terminal, start a local collector:

   ```bash
   mkdir -p /tmp/pocketpal-responses-diagnostics
   adb -s 127.0.0.1:5555 logcat -v threadtime '*:I' \
     | grep --line-buffered 'PP_RESPONSES_DIAG' \
     > /tmp/pocketpal-responses-diagnostics/trace.log
   ```

3. Send a short synthetic prompt in a new chat, such as `Reply with OK`.
   Count every inference attempt, including failed requests, against your
   approved test budget.
4. Read the trace:

   ```bash
   cat /tmp/pocketpal-responses-diagnostics/trace.log
   ```

   **Verify:** records contain only event names, indices, item/part types,
   status, aliases, parameter-presence flags, and safe error classes. They must
   not contain API keys, headers, URLs, prompts, generated text, tool payloads,
   images, or reasoning content.

5. Turn the setting off in PocketPal, press `Ctrl+C` in the collector terminal,
   and remove the temporary trace:

   ```bash
   rm -f /tmp/pocketpal-responses-diagnostics/trace.log
   rmdir /tmp/pocketpal-responses-diagnostics 2>/dev/null || true
   ```

Diagnostics are memory-only and turn off after an app restart. Existing
`logcat` lines are not retroactively erased. Do not use the normal full-reset
Appium configuration for a credential-configured playtest; use
`E2E_NO_RESET=true E2E_FULL_RESET=false` so app data is preserved.

#### Reload a different APK later

Once the emulator is running, repeat only Steps 2, 4, and 5. The shortest
reload command is:

```bash
python3 dev-env/android_emulator.py install "$APK" \
  --launch com.pocketpalai.e2e \
  --launch-check-seconds 10
```

The emulator can also be controlled directly:

```bash
# Relaunch the currently installed APK without reinstalling it.
python3 dev-env/android_emulator.py launch com.pocketpalai.e2e \
  --launch-check-seconds 15

# Follow emulator logs when diagnosing a failed launch.
python3 dev-env/android_emulator.py logs --follow

# Stop the container without deleting it.
python3 dev-env/android_emulator.py stop
```

The first `start` creates an ADB key in `~/.android` when one is not already
present. Subsequent starts reuse the named container and its emulator state.
When `--launch` is a package name, the script resolves its installed launcher
activity. A full component must include the complete activity class name. The
script fails if Android reports a launch error, the app process exits during
the launch-check interval, or the resolved activity is not foreground. Use the
standalone `launch` command for repeated smoke-test relaunches without
reinstalling the APK.

Global options must precede the command:

```bash
python3 dev-env/android_emulator.py \
  --name my-emulator \
  --adb-port 5557 \
  --webrtc-port 8556 \
  --timeout 360 \
  start
```

The defaults are:

| Setting              | Value                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| Container            | `pocketpal-android-emulator`                                            |
| Image                | `us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2` |
| Host ADB endpoint    | `127.0.0.1:5555`                                                        |
| Host WebRTC endpoint | `127.0.0.1:8554`                                                        |

### Run the remote protocol acceptance suite

After installing the E2E APK in the retained API 30 emulator, run the
deterministic split-session suite from the repository root:

```bash
cd e2e
E2E_DEVICE_NAME=127.0.0.1:5555 \
E2E_PLATFORM_VERSION=11 \
E2E_DEVICE_UDID=127.0.0.1:5555 \
E2E_APP_PATH=../android/app/build/outputs/apk/e2e/releaseE2e/app-e2e-releaseE2e.apk \
yarn e2e:remote-responses:android
```

The runner owns the fixture lifecycle and `adb reverse` setup. By default it
maps device loopback ports `18080` and `18081` to the host fixture on `18080`,
then removes both mappings. `E2E_REMOTE_FIXTURE_PORT` changes the base port.
No provider key is used.

The full suite passed locally in this Docker API 30 environment for source
`f174a6c`. The source-matching application APK came from build run
`34751845630` and has SHA-256
`26b53311d5906d5c35d77eaa8e9c8d5c673bee648c64132ca7bbfeb66a4c5f2f`.
Artifact-only hosted run `34758311979` separately passed API 35 install,
foreground, deterministic fixture, and Appium checks. iOS was not verified on
the Linux host because Xcode was unavailable. Live GitHub Copilot inference
was also not verified because no explicit credential was supplied; the fixture
is deterministic transport evidence, not a GitHub API contract.

The emulator container is intentionally retained after `stop`. Remove it
manually when its state is no longer needed:

```bash
docker rm pocketpal-android-emulator
```

### View and control the emulator from Linux or WSL

The Google emulator container is headless. To open an interactive window
without using Windows tools, install ADB and scrcpy in Linux:

```bash
sudo apt update
sudo apt install -y adb scrcpy
```

Connect to the loopback-only ADB port and open the display:

```bash
adb connect 127.0.0.1:5555
adb devices
scrcpy --serial 127.0.0.1:5555
```

On Windows 11 with WSLg, the scrcpy window should appear automatically. If it
does not, verify that GUI forwarding is available:

```bash
echo "$DISPLAY"
echo "$WAYLAND_DISPLAY"
```

Both should normally be populated in a WSLg session. Run the commands from a
WSLg-capable terminal rather than an SSH-only shell.

For a non-interactive screenshot, no host ADB installation is required:

```bash
python3 - <<'PY'
import subprocess
from pathlib import Path
import sys

sys.path.insert(0, str(Path("dev-env").resolve()))
from docker_cli import docker_command

with open("/tmp/pocketpal-emulator.png", "wb") as screenshot:
    subprocess.run(
        docker_command(
            "exec",
            "pocketpal-android-emulator",
            "/android/sdk/platform-tools/adb",
            "exec-out",
            "screencap",
            "-p",
        ),
        stdout=screenshot,
        check=True,
    )
PY
```

Open `/tmp/pocketpal-emulator.png` with any Linux image viewer. Port `8554`
exposes the emulator's gRPC/WebRTC service endpoint; it is not a standalone
browser UI. A browser viewer requires Google's separate WebRTC gateway and
frontend.

## Test Android hands-free conversation

PocketPal's microphone control starts a foreground hands-free loop: recognize
one utterance, send it automatically, speak the response with the selected
PocketPal voice, and listen again. It uses Android's explicit on-device
`SpeechRecognizer` API and does not fall back to the default, potentially
cloud-backed recognizer. A remote chat model still receives the recognized
text when the user selected a remote server.

| Environment | Expected result |
| --- | --- |
| Existing API 30 Docker emulator | The mic explains that Android 12+ is required; typing and sending continue to work. |
| API 31–32 phone with an on-device provider | Dictation can run, but Android cannot preflight language-model support. |
| API 33+ phone with an on-device provider | PocketPal can distinguish installed, downloadable, pending, and unsupported language models. |
| API 31+ device without an on-device provider | The mic explains that on-device recognition is unavailable. |

For a real offline acceptance check:

1. Install a debug or E2E APK on an API 31+ physical Android phone.
2. If prompted, explicitly download the current language's speech model.
3. Disable Wi-Fi and cellular data.
4. Select an installed PocketPal voice, open a normal text chat with an empty
   composer, tap the microphone, and speak a predetermined phrase.
5. Verify the phrase is sent exactly once without tapping Send, the concise
   response is spoken without a table, and listening resumes after playback.
6. While a response is spoken, tap the gray speaker Stop. Audio must stop,
   generation may finish silently, and listening resumes afterward. Turning
   TTS off instead must also turn conversation off; turning TTS on alone must
   not activate the microphone.
7. Repeat after ordinary silence, stopping conversation, changing chats,
   backgrounding, and locking the phone. The system microphone indicator must
   clear whenever conversation exits.

The API 30 container cannot prove successful recognition. It is useful only
for the unsupported-version path. Emulator images can also omit the same
on-device recognition provider or language models available on real phones.

## Full GitHub artifact acceptance

Use `verify_android_artifact.py` after changing native dependencies, feature
flags, authentication boundaries, release bundling, or the E2E workflow. It is
intentionally slower than a local smoke test: it binds evidence to an exact
remote commit, performs a clean installation, and inspects rendered UI.

### Dispatch and verify the current remote branch

Push the branch first, then run:

```bash
python3 dev-env/verify_android_artifact.py --dispatch
```

The command:

1. Reads the current SHA of
   `origin/copilot/security-audit-credentials`.
2. Dispatches `.github/workflows/e2e-tests.yml`.
3. Refuses a workflow run for a different SHA.
4. Watches the build for up to two hours and saves failed job logs.
5. Downloads `e2e-android-apk` to `/tmp/pocketpal-apk-<run-id>/`.
6. Records the APK SHA-256 and checks its native DEX boundary.
7. Performs a 60-second upgrade launch and two cold relaunches.
8. Verifies the disabled centralized-integration deep links and UI.
9. Creates an isolated emulator for a clean 60-second launch, then removes it.
10. Writes `acceptance.json`, screenshots, UI XML, app-process-scoped logcat,
    and command output into the run-specific evidence directory.

### Verify an existing successful run

```bash
python3 dev-env/verify_android_artifact.py \
  --run-id 34725193906
```

By default, the run must target the current remote branch SHA. To verify an
older run deliberately, supply its full commit SHA:

```bash
python3 dev-env/verify_android_artifact.py \
  --run-id 34725193906 \
  --expected-sha 4dd64383a7b2bcdd302999e5558863154971d785
```

### What the policy check asserts

The acceptance script fails unless:

- the app renders and remains foreground without fatal Java, native, or React
  Native startup errors;
- Firebase and Google Sign-In native classes are absent;
- React Native Keychain remains for user-owned credentials;
- Pals/PalsHub, centralized sign-in, and centralized feedback controls are
  absent;
- Hugging Face token, search-provider API key, and remote-server API key
  controls remain visible; and
- disabled hub and checkout deep links leave the app alive and foreground.

It uses an unreachable emulator-local URL to reveal the remote-server API-key
form. It never reads, prints, changes, or sends real provider credentials.

### Useful options

```bash
python3 dev-env/verify_android_artifact.py --help

# Use a different repository or branch.
python3 dev-env/verify_android_artifact.py \
  --dispatch \
  --repo owner/repository \
  --branch feature/my-branch

# Put evidence somewhere other than /tmp.
python3 dev-env/verify_android_artifact.py \
  --run-id 123456789 \
  --evidence-dir /path/to/evidence

# Short diagnostic rerun after full acceptance has already passed.
python3 dev-env/verify_android_artifact.py \
  --run-id 123456789 \
  --skip-clean-install \
  --skip-ui-policy
```

The skip options are for diagnosis only and are recorded as `skipped` in
`acceptance.json`; they do not constitute full acceptance. If ports `5557` or
`8556` are occupied, override `--clean-adb-port` and
`--clean-webrtc-port`. The persistent emulator is left running, while the
run-specific clean-test emulator is always removed.

## Troubleshooting Docker Desktop on WSL

If the script reports Docker as unavailable, first verify the engine:

```bash
docker info
```

The scripts automatically try the standard Windows Docker Desktop CLI at
`/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` when the Linux
socket is unavailable. You can select another executable explicitly:

```bash
POCKETPAL_DOCKER_CLI=/path/to/docker \
  python3 dev-env/android_emulator.py status
```

If both paths fail, open **Docker Desktop → Settings → Resources → WSL
Integration**, enable the current distribution, and select **Apply & restart**.
Restarting WSL alone does not enable a disabled distribution integration.

Do not run `docker desktop start` inside WSL when Docker Desktop is installed on
Windows. That command targets the native Linux Docker Desktop installation.
