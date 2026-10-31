<div align="center">

<img src="src/assets/pocketpal-dark-v2.png" alt="PocketPal AI logo" width="120" />

# PocketPal AI

**A private AI assistant that runs entirely on your phone.**

Chat with language models, give them a voice, and let them use tools — all on-device. No account, no cloud, no internet required.

<a href="https://pocketpal.dev/"><strong>pocketpal.dev</strong></a> ·
<a href="#get-the-app">Get the app</a> ·
<a href="https://pocketpal.dev/leaderboard">Leaderboard</a> ·
<a href="https://palshub.ai/">PalsHub</a> ·
<a href="https://github.com/a-ghorbani/pocketpal-ai/discussions">Discussions</a>

<br/>

[![App Store](https://img.shields.io/badge/App_Store-Download-0D96F6?logo=apple&logoColor=white)](https://apps.apple.com/us/app/pocketpal-ai/id6502579498)
[![Google Play](https://img.shields.io/badge/Google_Play-Get_it-414141?logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=com.pocketpalai)

[![Latest release](https://img.shields.io/github/v/release/a-ghorbani/pocketpal-ai?sort=semver)](https://github.com/a-ghorbani/pocketpal-ai/releases)
[![License: MIT](https://img.shields.io/github/license/a-ghorbani/pocketpal-ai)](LICENSE)
[![Stars](https://img.shields.io/github/stars/a-ghorbani/pocketpal-ai)](https://github.com/a-ghorbani/pocketpal-ai/stargazers)
[![Open issues](https://img.shields.io/github/issues/a-ghorbani/pocketpal-ai)](https://github.com/a-ghorbani/pocketpal-ai/issues)
[![Sponsor](https://img.shields.io/github/sponsors/a-ghorbani?logo=githubsponsors)](https://github.com/sponsors/a-ghorbani)

</div>

---

## Why PocketPal AI?

Most AI apps are a thin window onto someone else's server — every message you type gets shipped off, logged, and analyzed somewhere you can't see. PocketPal flips that around: **the AI lives on your phone, and your conversations stay on it unless you choose an online feature.**

- **🔒 Private by default** — every prompt, response, and document stays on your device unless you turn on an online feature such as web search or a remote server.
- **✈️ Works offline** — download a model once and it just works, with no connection and no account. On a plane, on a trail, anywhere.
- **📱 Runs on hardware you already own** — real language models, voices, and tools, tuned to make the most of your phone's CPU, GPU, and NPU.
- **🆓 Free and open source** — chat, models, voices and tools are free, with no account. The store builds offer an optional one-time **PocketPal Plus** purchase for hands-free voice; builds from source include it. MIT-licensed.

> **Privacy note:** Your chats and documents leave your device only through features you turn on: web search and page reading, a remote server, or a system voice your phone runs online. The app's other network use (model and voice downloads, PalsHub and purchases, device-compatibility rules from the jsDelivr CDN at launch, the opt-in benchmark leaderboard, and feedback or reports you submit) never attaches your chats.

## Contents

- [Features](#features)
- [Get the app](#get-the-app)
- [How it works](#how-it-works)
- [Using the app](#using-the-app)
- [For developers](#for-developers)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Community & support](#community--support)
- [License](#license)

## Features

- **🧠 On-device chat** — run GGUF language models (Gemma, Qwen, Phi, Llama, and more) fully offline.
- **🗣️ Text-to-speech** — give your assistant a voice with on-device neural voices (Kokoro, Kitten, Supertonic, and Phonon on supported devices) that synthesize speech on your phone, or your phone's system voices.
- **🎙️ Voice input** — dictate messages with on-device Whisper speech recognition (whisper.cpp).
- **🎭 Pals** — create personalized assistants with their own model, system prompt, and personality (Assistant and Roleplay types).
- **🛍️ [PalsHub](https://palshub.ai/)** — discover and install community Pals, including premium ones via in-app purchase.
- **✨ PocketPal Plus** — an optional one-time purchase in the App Store and Google Play builds that adds hands-free voice conversation. Builds from source include every Plus feature.
- **🛠️ Talents & tools** — let capable Pals call built-in tools (calculator, date/time, rich HTML rendering, opt-in web search and page reading) inside a tool-use loop.
- **📥 Hugging Face integration** — search and download GGUF models, including gated ones, directly from the HF Hub with your access token.
- **📊 Benchmarking** — measure tokens/sec and memory, and optionally compare on the [AI Phone Leaderboard](https://pocketpal.dev/leaderboard).
- **⚡ Hardware acceleration** — CPU, GPU (Metal on iOS, OpenCL/Adreno on Android), and NPU (Qualcomm Hexagon) inference paths, with graceful fallback.
- **🌍 Localized** — available in 16 languages, on phones and tablets, including full iPad support.

## Get the app

| Platform | |
| --- | --- |
| **iOS / iPadOS** | [![Download on the App Store](https://img.shields.io/badge/App_Store-Download-0D96F6?logo=apple&logoColor=white)](https://apps.apple.com/us/app/pocketpal-ai/id6502579498) |
| **Android** | [![Get it on Google Play](https://img.shields.io/badge/Google_Play-Get_it-414141?logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=com.pocketpalai) |

**Three steps to your first chat:**

1. **Install** PocketPal from the App Store or Google Play.
2. **Download a model** — tap the menu (☰) → **Models**, pick one that fits your phone, and download (or add one from Hugging Face).
3. **Load it and start chatting** — that's it, you're running AI fully offline.

## How it works

You don't need to know any of this to use PocketPal — but if you're curious how a phone runs real AI offline, here's the short version.

PocketPal is a four-layer stack, from the silicon up to the chat UI. Each layer has one job, and the dependency direction is strictly top-down — the JS app talks to native bridges, bridges talk to inference engines, engines target hardware backends.

<div align="center">
  <img src="assets/images and logos/stack-diagram-dark.png" alt="PocketPal AI on-device stack — UI & Tool Use → Bridging → Engine → Hardware" width="100%">
</div>

| Layer | What runs here |
| --- | --- |
| **UI & Tool Use** | The React Native app (UI via React Native Paper, state via MobX, chat history in WatermelonDB). The **`AgentRunner`** drives each chat turn — streaming tokens, dispatching **Talents** (tools) when the model calls them, and feeding results back for follow-up reasoning. **Pals** are configurable personas; **PalsHub** is the in-app marketplace for sharing and buying them. In **voice mode**, your speech is transcribed, answered as a normal chat turn, and the reply is spoken back. |
| **Bridging** | Native modules that connect JavaScript to the engines. [`llama.rn`](https://github.com/mybigday/llama.rn) bridges LLM inference over JSI; [`whisper.rn`](https://github.com/mybigday/whisper.rn) bridges speech recognition; [`@pocketpalai/react-native-speech`](https://github.com/a-ghorbani/react-native-speech) and `onnxruntime-react-native` bridge text-to-speech, with the `@pocketpalai/react-native-speech-phonon` add-on for Phonon. |
| **Engine** | The inference engines. **llama.cpp** runs language models in the quantized **GGUF** format. **whisper.cpp** runs Whisper speech recognition models in the **GGML** format. **ONNX Runtime** runs the Kokoro, Kitten and Supertonic voice models in the **ONNX** format. **Phonon** runs natively in its own Rust runtime: a GGUF model on the CPU on Android, a Core ML model on iOS. |
| **Hardware** | Where the math actually happens. PocketPal targets **CPU** (universal fallback), **GPU** (Metal on iOS, OpenCL on Qualcomm Adreno for Android), and **NPU** (Qualcomm Hexagon, and the Apple Neural Engine for Phonon on iOS) — falling back gracefully and offloading partial layers when a full backend isn't available. |

## Using the app

<details>
<summary><strong>📥 Download & load a model</strong></summary>

<br/>

1. Open the app and tap the **Menu** (☰), then go to **Models**.
2. Pick a model from the list and tap **Download**, or tap **+** to add one from Hugging Face or local storage.
3. From Hugging Face, search GGUF models and choose a quantization that fits your device's memory and storage — download now or bookmark for later.
4. After downloading, tap **Load** (or use the chevron icon left of the chat input to load right from the chat screen).

<img src="assets/images and logos/Download_models.png" alt="Download Models" width="100%">
</details>

<details>
<summary><strong>💬 Chat</strong></summary>

<br/>

1. Make sure a model is loaded.
2. Open the **Chat** page and start talking.
3. The screen stays awake during inference and deactivates when idle.
4. **Copy** a full response with the copy icon, or long-press a paragraph to copy just that.
5. **Edit** any of your messages with a long-press — the AI regenerates from your change. Hit **retry** for a fresh answer, optionally with a different model.

<img src="assets/images and logos/Chat.png" alt="Chat" width="83%">
</details>

<details>
<summary><strong>🎭 Pals & PalsHub</strong></summary>

<br/>

Create personalized assistants:
- **Assistant Pal** — pick a default model, set a system prompt (write it yourself or have the app generate one), and customize the chat input color.
- **Roleplay Pal** — everything above, plus location, the AI's role, and other contextual parameters.

Switch personas with the Pal picker on the chat page. Browse **[PalsHub](https://palshub.ai/)** in-app to discover community Pals, including premium ones via in-app purchase.

<img src="assets/images and logos/Pals.png" alt="Assistant Pal" width="100%">
<p><em>Creating a cocktail-recipe assistant</em></p>
</details>

<details>
<summary><strong>📊 Benchmark your device</strong></summary>

<br/>

1. Open the **Benchmark** page.
2. Run performance tests to compare speed and efficiency across models.
3. Review tokens/sec and memory usage.
4. Optionally share your results to the [AI Phone Leaderboard](https://pocketpal.dev/leaderboard).

<img src="assets/images and logos/Benchmark.png" alt="Benchmark" width="100%">
</details>

<details>
<summary><strong>🔑 Set up a Hugging Face token (for gated models)</strong></summary>

<br/>

1. Create an access token in your Hugging Face account ([docs](https://huggingface.co/docs/hub/en/security-tokens)).
2. In PocketPal, go to **Settings → Set Token**, paste it, and save.

<img src="assets/images and logos/Token_in_pocketpal.png" alt="Token setup" width="66%">
</details>

<details>
<summary><strong>💌 Send feedback</strong></summary>

<br/>

Go to **App Info → "Sharing your thoughts"**, type your feedback — feature requests, suggestions, anything — and submit.

<img src="assets/images and logos/Send_Feedback.png" alt="Send feedback" width="50%">
</details>

## For developers

PocketPal is a standard React Native app. If you can build a React Native project, you can build PocketPal.

### Prerequisites

- **Node.js** — version is pinned in [`.nvmrc`](.nvmrc) (currently `22.21.0`); run `nvm use` to match it. Older Node will fail the `engines` check.
- **Yarn 1 (Classic)** — `packageManager` is pinned to `yarn@1.22.22`.
- **Xcode** + **CocoaPods**, and **Ruby + Bundler** (for iOS / Fastlane tooling).
  - Xcode 26.6 or later, with the Metal Toolchain: `xcodebuild -downloadComponent MetalToolchain`.
  - The iOS simulator build needs an Apple silicon Mac.
  - After a change to `patches/llama.rn+*.patch`, remove `node_modules/llama.rn` and run `yarn --check-files` so the patch applies to fresh sources.
- **Android Studio** + Android SDK/NDK.

See the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for platform details.

### Clone, install & run

```bash
git clone https://github.com/a-ghorbani/pocketpal-ai
cd pocketpal-ai

nvm use                       # match the pinned Node version
yarn install                  # install JS dependencies
(cd ios && pod install)       # iOS only

yarn start                    # Metro bundler
yarn ios                      # build + run on iOS simulator
yarn android                  # build + run on Android emulator
```

Core on-device chat works without any backend keys; only PalsHub/auth features need additional configuration.

> **Native-change rule:** if you change `package.json`, a native module, `ios/`, `android/`, the Podfile, or `build.gradle`, re-run `pod install` and rebuild both platforms — a JS reload won't pick up native changes.

### Quality gates

```bash
yarn lint           # ESLint
yarn typecheck      # tsc --noEmit
yarn test           # Jest
yarn l10n:validate  # validate locale JSON (placeholders, integrity)
yarn test:perf      # render-performance tests (Reassure)
yarn test:perf:compare [base]  # render counts of HEAD vs. base (default: merge-base with origin/main)
```

Run `yarn lint && yarn typecheck && yarn test` before opening a PR. Pull requests also run the render-count comparison; see [render-performance tests](docs/render-perf-tests.md). Commits are validated by Commitlint ([Conventional Commits](https://www.conventionalcommits.org/)) via a Husky hook.

<details>
<summary><strong>Repository layout</strong></summary>

<br/>

```
src/
├── screens/        # Chat, Models, Pals, Benchmark, Settings, Plus, About, …
├── components/     # Reusable UI
├── store/          # MobX stores (Model, ChatSession, Pal, TTS, ASR, VoiceMode, HF, Benchmark, …)
├── services/
│   ├── agent/      # AgentRunner — the chat / tool loop
│   ├── talents/    # Tool engines + registries
│   ├── search/     # Web search providers for the search talents
│   ├── tts/        # TTS engines (kokoro, kitten, supertonic, phonon, system)
│   ├── asr/        # Whisper speech recognition (dictation and voice mode)
│   ├── voice/      # Hands-free voice mode
│   ├── plus/       # Plus feature catalog and gate
│   ├── iap/        # In-app purchases (store bridge)
│   ├── palshub/    # PalsHub marketplace integration
│   ├── deviceRules/ # Device-compatibility rules (bundled, refreshed at launch)
│   └── downloads/  # Model download manager
├── database/       # WatermelonDB schema, models, migrations
├── repositories/   # Data-access layer over the DB
├── locales/        # i18n JSON + lazy loader (index.ts is the registry)
└── hooks/  api/  theme/  utils/  config/  specs/
```
</details>

<details>
<summary><strong>Tech stack</strong></summary>

<br/>

Versions are pinned in [`package.json`](package.json); the highlights:

| Area | Choice |
| --- | --- |
| Framework | React Native `0.87.1`, React `19.2.3` (New Architecture) |
| Language | TypeScript `5.9.3` |
| UI | React Native Paper `5.15.3`, React Navigation |
| State | MobX `6` (`mobx`, `mobx-react`, `mobx-persist-store`) |
| Persistence | WatermelonDB (chat history), AsyncStorage (settings), Keychain (secrets) |
| LLM | `llama.rn` `0.13.0-rc.9` → llama.cpp b11960 · GGUF |
| ASR | `whisper.rn` `0.7.4` → whisper.cpp · GGML; mic via `@fugood/react-native-audio-pcm-stream` `1.1.4` |
| TTS | `@pocketpalai/react-native-speech` `2.8.2` + `onnxruntime-react-native` `^1.23.2` · ONNX; `@pocketpalai/react-native-speech-phonon` `0.1.3` |
| Tooling | Yarn 1 (Classic), ESLint, Prettier, Jest, Husky + Commitlint |

</details>

<details>
<summary><strong>Extending PocketPal</strong></summary>

<br/>

A **Talent** is a tool the model can call mid-conversation. Engines are registered in a `TalentRegistry`, exposed to the model as tool schemas; the `AgentRunner` detects a call, runs the engine, and returns the result for the next turn.

| Talent | Engine | Does |
| --- | --- | --- |
| `calculate` | `CalculateEngine` | Arithmetic / expression evaluation |
| `datetime` | `DatetimeEngine` | Current date / time |
| `render_html` | `RenderHtmlEngine` | Renders model-produced HTML in chat |
| `web_search` | `WebSearchEngine` | Searches the web (opt-in; needs a configured provider) |
| `read_url` | `ReadUrlEngine` | Reads a web page from search results, a site you named, or a link on a page it read (opt-in; needs a configured provider) |

Good first contributions:
- A new **Talent** — implement a `TalentEngine` and register it in `src/services/talents/`.
- A new **TTS engine** — model it on an existing engine in `src/services/tts/engines/`, register it in `engineRegistry.ts`, wire it into `TTSStore`, then search `src/` for that engine's name, ignoring case, to find every other entry it needs, such as its type, constants, setup-sheet entries and strings.
- A new **locale** — translate on [Weblate](https://hosted.weblate.org/projects/pocketpal-ai/); registering a new language in the app follows the steps in `src/locales/index.ts`.

</details>

## Contributing

Contributions are welcome — bug reports, fixes, features, translations, and docs all help.

1. Fork and branch: `git checkout -b feature/your-feature-name`
2. Make your changes; run on a device/emulator (`yarn ios` / `yarn android`). Re-run `pod install` + rebuild if you touched native code.
3. Gate locally: `yarn lint && yarn typecheck && yarn test`
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `git commit -m "feat: add new talent"`
5. Push and open a pull request.

Please read the [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) first. Want to translate PocketPal into your language? Join us on [Weblate](https://hosted.weblate.org/projects/pocketpal-ai/).

## Roadmap

- **Tool use expansion** — grow the Talents catalog and deepen the agentic loop so Pals can do more, fully on-device.

Have an idea or found a bug? [Open an issue](https://github.com/a-ghorbani/pocketpal-ai/issues/new/choose) or start a [discussion](https://github.com/a-ghorbani/pocketpal-ai/discussions).

## Community & support

- 💬 **Questions & ideas** — [GitHub Discussions](https://github.com/a-ghorbani/pocketpal-ai/discussions)
- 🐛 **Bugs & requests** — [GitHub Issues](https://github.com/a-ghorbani/pocketpal-ai/issues/new/choose)
- 🌐 **Website** — [pocketpal.dev](https://pocketpal.dev/)
- ❤️ **Support development** — PocketPal is free and ad-free; [sponsoring](https://github.com/sponsors/a-ghorbani) helps keep it that way.

## License

Licensed under the [MIT License](LICENSE).

## Acknowledgements

PocketPal AI stands on the shoulders of the open-source community, including:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** — efficient on-device LLM inference.
- **[llama.rn](https://github.com/mybigday/llama.rn)** — llama.cpp bindings for React Native.
- **[whisper.cpp](https://github.com/ggml-org/whisper.cpp)** — on-device speech recognition.
- **[whisper.rn](https://github.com/mybigday/whisper.rn)** — whisper.cpp bindings for React Native.
- **[@pocketpalai/react-native-speech](https://github.com/a-ghorbani/react-native-speech)** — React Native TTS bridge powering on-device voices.
- **[Phonon](https://github.com/gradium-ai/xn-ptts)** by Gradium — on-device TTS model, built on Kyutai's Pocket TTS and Mimi.
- **[ONNX Runtime](https://onnxruntime.ai/)** — cross-platform inference engine powering on-device TTS.
- **[React Native](https://reactnative.dev/)**, **[MobX](https://mobx.js.org/)**, **[React Native Paper](https://callstack.github.io/react-native-paper/)**, **[React Navigation](https://reactnavigation.org/)**, **[WatermelonDB](https://github.com/Nozbe/WatermelonDB)**, and many other open-source libraries that make this project possible.

<div align="center">
<br/>

Made with ❤️ for people who want AI that stays on their phone.

<br/>

<sub>If PocketPal is useful to you, consider giving it a ⭐ — it helps others find the project.</sub>

</div>
