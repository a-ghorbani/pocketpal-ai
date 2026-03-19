# Fork update

Since the majority of the users of this application are those who wish to gain a deeper understanding of large models, I place greater emphasis on learning and exploration. I try to provide more parameters for users to debug, with easy recovery from incorrect adjustments, while exposing as much of the pipeline as possible so users can clearly see the model’s inputs, outputs, and adjustment methods. Because the chain is fully controllable, when the model encounters issues, configurations can be adjusted directly instead of waiting for code-level changes, making experimentation more flexible.


1. Added the ability to directly import local VLM models, supporting both model imports and visual component imports for MM Projects.

2. Fully exposed and made customizable the prompt template logic.

3. Added functionality to share GGUF model files.

4. Implemented logging features.

5. Exposed other interfaces that were previously available but not displayed in the UI.

6. Optimized the template matching mechanism in version 132; besides the 10 recommended built-in models, it now prioritizes reading the model's own configuration to avoid mis-matching different model series. (Note: qwen3.5 models directly compiled from version 132 will output garbled text.)

7. Critical modification! If the number of GPU unloading layers is too high, it can cause the model output to be garbled. However, in version 132, the default number of unloading layers is set to 99 (fully loaded), and I changed it to 0.

8. Add a template selector switch, allowing the selection of the chat-formatter / Nunjucks interpreter or the llama.cpp Jinja chat template interpreter.

A regrettable omission: I intended to implement real-time monitoring of memory (both RAM and virtual) usage, CPU utilization, and power consumption for performance debugging after evaluating feasibility, but decided against it due to complexity.

<p align="center">
  <img src="https://github.com/user-attachments/assets/4be53075-4dcb-424d-bedd-265ffd10715c" width="32%" />
  <img src="https://github.com/user-attachments/assets/649eab64-8b39-4064-a34a-9ce29a9e538c" width="32%" />
  <img src="https://github.com/user-attachments/assets/d33515d5-eefd-47ff-a51b-ee1248b77b01" width="32%" />
</p>

* Added compilation for **Apple IPA installers**.
* Split the single "Think" button into **three buttons**:
    * Whether to enable the UI-layer thinking box.
    * Whether to activate thinking at the parameter level.
    * Whether to incorporate thinking into the context.

## New Architecture Goals --- Normalized inference flow

| # | Architecture Type | Message Type | Logic | Status |
| :--- | :--- | :--- | :--- | :--- |
| ① | Jinja Built-in | Plain Text | A { messages, jinja: true } | ✓ Model Built-in |
| ② | Jinja Built-in | Multimodal | A { messages, jinja: true } | ✓ Model Built-in |
| ③ | Custom Jinja | Plain Text | A { messages, chatTemplate, jinja: true } | ✓ User Customized |
| ④ | Custom Jinja | Multimodal | A { messages, chatTemplate, jinja: true } | ✓ User Customized |
| ⑤ | Nunjucks | Plain Text | B { prompt, jinja: false } | ✓ JS Rendering |
| ⑥ | Nunjucks | Multimodal | A { messages, jinja: true } | ✗ Falls back to Built-in Template (+ UI Hint) |

### Pipeline Optimization
Only two JS remain on the entire pipeline.

| JS | Applicable Scenario | Can it be avoided? |
| :--- | :--- | :--- |
| **token callback** | All 6 scenarios | **No**, as it is the sole streaming mechanism for llama.rn. |
| **applyChatTemplate()** | Only scenario ⑤ | **Yes**. If users use Jinja exclusively, this JS will not be triggered at all. |

> [!IMPORTANT]
> Just need to synchronize adaptations whenever **llama.rn** is updated.

---


### Version Notes & Compatibility
the new llama version 0.11.3 (app-1.12.2 This repository is also developed based on this version) can control Qwen 3.5's thinking capabilities. In the default template, versions of 9B and above possess both enable/disable functions for thinking, whereas versions below 9B do not have this feature by default. Simply copy the 9B template and apply it to the 4B, 2B, and 0.8B models; you will then be able to control thinking with the new version!!!

Please note that when you turn off the "resemble format" (RF button), your thinking chain will merge into the main text and thus won't appear in the thinking box. The next context will still carry over the thinking process, which I think is unnecessary to change since resemble format is usually disabled anyway.

in the older llama version 0.11.0 （app-1.11.21）can you control their thinking without configuring templates for the 4B, 2B, and 0.8B models. This repository also includes a branch specifically designed to be compatible with llama version 0.11.0; please note that under the Android framework, engine switching is not possible—you can only have one engine per app.

### CI/CD & Downloads
I have optimized the compilation for versions **1.11.21** and **1.12.2**, enabling direct generation of **APK** and **IPA** installer packages via actions; feel free to compile and test them yourself.

* [https://github.com/CCSSNE/bianyi-1.11.21](https://github.com/CCSSNE/bianyi-1.11.21)
* [https://github.com/CCSSNE/bianyi-1.12.2](https://github.com/CCSSNE/bianyi-1.12.2)







# PocketPal AI 📱🚀

PocketPal AI is a pocket-sized AI assistant powered by small language models (SLMs) that run directly on your phone. Designed for both iOS and Android, PocketPal AI lets you interact with various SLMs without the need for an internet connection. Your privacy is fully protected as all processing happens entirely on-device — your conversations, prompts, and data never leave your phone or get stored on external servers.

> **Note on Privacy**: The only data that may leave your device is what you explicitly choose to share: benchmark results (if you opt to contribute to the leaderboard) and any feedback you voluntarily submit through the app.

## Table of Contents

- [PocketPal AI 📱🚀](#pocketpal-ai-)
  - [Table of Contents](#table-of-contents)
  - [📰 News & Announcements](#-news--announcements)
  - [Features](#features)
  - [Installation](#installation)
    - [iOS](#ios)
    - [Android](#android)
  - [Usage](#usage)
    - [Downloading a Model](#downloading-a-model)
    - [Loading a Model](#loading-a-model)
    - [Chatting with the model](#chatting-with-the-model)
    - [Copying Text](#copying-text)
    - [Message Editing](#message-editing)
    - [Using Pals](#using-pals)
    - [Benchmarking](#benchmarking)
    - [Setup Hugging Face Access Token](#setup-hugging-face-access-token)
    - [Send Feedback](#send-feedback)
  - [Development Setup](#development-setup)
    - [Prerequisites](#prerequisites)
    - [Getting Started](#getting-started)
    - [Scripts](#scripts)
  - [Contributing](#contributing)
    - [Quick Start for Contributors](#quick-start-for-contributors)
  - [Roadmap](#roadmap)
  - [License](#license)
  - [Contact](#contact)
  - [Acknowledgements](#acknowledgements)

## 📰 News & Announcements
- **🔒 HF Token Authentication (v1.9.0, Apr, 2025)**: Access gated models from Hugging Face with your authentication token.
- **🌐 Localization Support (v1.8.16, Apr, 2025)**: PocketPal AI now supports multiple languages (At the moment Japanese and Chinese).
- **📱 iPad Support (v1.8.12, Mar, 2025)**: Full support for iPad devices including landscape orientation.
- **👤 Pals Feature (v1.8.0, Feb, 2025)**: Create and chat with personalized AI assistants with different personalities.
- **🔍 Benchmarking Tool (v1.6.1, 2024)**: Test and compare model performance with the built-in benchmarking feature.
- **🎨 New Icon Alert (Nov 2024)**: PocketPal AI has a fresh new look! Huge thanks to **[Chun Te Lee](https://github.com/Reeray)** for the design! [Read more](https://github.com/a-ghorbani/pocketpal-ai/discussions/102).
- **🚀 Hugging Face Public Hub Integration (v1.5, Nov 2024)**: PocketPal AI now integrates with the Hugging Face model Hub! Browse, download, and run models directly from the Hugging Face Hub within the app. [Read more](https://github.com/a-ghorbani/pocketpal-ai/discussions/104)

## Features

- **Offline AI Assistance**: Run language models directly on your device without internet connectivity.
- **Model Flexibility**: Download and swap between multiple SLMs, including Danube 2 and 3, Phi, Gemma 2, and Qwen.
- **Auto Offload/Load**: Automatically manage memory by offloading models when the app is in the background.
- **Inference Settings**: Customize model parameters like system prompt, temperature, BOS token, and chat templates.
- **Real-Time Performance Metrics**: View tokens per second and milliseconds per token during AI response generation.
- **Message Editing**: Edit your messages and retry AI generation.
- **Personalized Pals**: Create different AI personalities with customized settings.
- **Background Downloads**: Continue downloading models while using other apps (iOS).
- **Screen Awake During Inference**: Keep your screen on while the AI is generating responses.
- **Multi-device Support**: Optimized for both phones and tablets, including iPad.
- **Localization**: Use the app in your preferred language.
- **Hugging Face Integration**: Access both public and gated models with authentication.

## Installation

### iOS

Download PocketPal AI from the App Store:

[**Download on the App Store**](https://apps.apple.com/us/app/pocketpal-ai/id6502579498)

### Android

Get PocketPal AI on Google Play:

[**Get it on Google Play**](https://play.google.com/store/apps/details?id=com.pocketpalai)

## Usage

### Downloading a Model

1. Open the app and tap the **Menu** icon (☰).
2. Navigate to the **Models** page.
3. Choose a model from the list and tap **Download**.
4. Or tap the + button to add models from Hugging Face or locally downloaded ones.
5. If you select "Add from Hugging Face", you can search GGUF models directly on HF and select any quantization that fits your device (memory and storage).
6. You can then download it immediately or bookmark it for later.

<img src="assets/images and logos/Download_models.png" alt="Download Models Screenshot" width="100%">

### Loading a Model

- After downloading, tap **Load** next to the model to load it to memory.
- You can also load a model directly within the chat page using the chevron icon on the left side of the chat input.

### Chatting with the model 

1. Ensure a model is loaded.
2. Navigate to the **Chat** page from the menu.
3. Start conversing with your AI assistant!
4. The screen will stay awake during inference and deactivate when idle.
5. You can select and load models using the chevron icon on the left side of the chat input.

<img src="assets/images and logos/Chat.png" alt="Chat Screenshot" width="83%">

### Copying Text

- **Copy Entire Response**: Tap the copy icon at the bottom of the AI's response bubble.
- **Copy Specific Paragraph**: Long-press on a paragraph to copy its content.

*Note*: Preserving text formatting while copying is currently limited. We're working on improving this feature.

### Message Editing

1. Long-press on any of your messages to edit them.
2. After editing, the AI will regenerate its response based on your changes.
3. Use the retry option to get a new response without changing your message.
4. You can also retry generation using a different model for comparison or better results.

### Using Pals

1. Create personalized AI assistants with different personalities and settings.
2. PocketPal offers two different pal types:
   - **Assistant Pal**: Select a default model, set a system prompt (manually or generated by another AI), and customize chat text input color.
   - **Roleplay Pal**: Similar to Assistant Pal plus additional settings for location, AI's role, and other contextual parameters.
3. Select a Pal using the Pal picker in the chat page to quickly switch between different personas.

<div style="margin-top: 30px; margin-bottom: 30px;">
  <img src="assets/images and logos/Pals.png" alt="Assistant Pal Screenshot" width="100%">
  <p><em>An example of creating a cocktail recipe assistant</em></p>
</div>

<div style="margin-top: 30px; margin-bottom: 30px;">
  <img src="assets/images and logos/Roleplay.png" alt="Roleplay Pal Screenshot" width="33%">
  <p><em>Setting up a roleplay pal with custom parameters</em></p>
</div>

<div style="margin-top: 30px; margin-bottom: 30px;">
  <img src="assets/images and logos/Pals-AI_generates_system_prompt.png" alt="AI-Generated System Prompt" width="16%">
  <p><em>Using AI to generate system prompts for your pals</em></p>
</div>

### Benchmarking

1. Navigate to the Benchmarking page.
2. Run performance tests on your models to compare speed and efficiency.
3. View detailed metrics like tokens per second and memory usage.
4. Share your benchmark results and compare with other devices on the [PocketPal AI Phone Leaderboard](https://huggingface.co/spaces/a-ghorbani/ai-phone-leaderboard).

<img src="assets/images and logos/Benchmark.png" alt="Benchmark Screenshot" width="100%">

### Setup Hugging Face Access Token

Access gated models from Hugging Face by setting up your authentication token:

1. First, get an access token from your Hugging Face account:
   - Refer to the [HF Security Tokens documentation](https://huggingface.co/docs/hub/en/security-tokens)

   <img src="assets/images and logos/Get_token_from_HF.png" alt="Get Token from Hugging Face" width="1000%">

2. In PocketPal AI:
   - Navigate to the Settings page
   - Tap on "Set Token"
   - Paste your personal access token in the text input
   - Save

   <img src="assets/images and logos/Token_in_pocketpal.png" alt="Token Setup in PocketPal" width="66%">

### Send Feedback

Share your thoughts directly from the app:

1. Navigate to the App Info page
2. Tap on "Sharing your thoughts" 
3. Type in whatever you'd like to share, from feature requests to suggestions
4. Hit "Submit Feedback"

<img src="assets/images and logos/Send_Feedback.png" alt="Send Feedback Screenshot" width="50%">

## Development Setup

Interested in contributing or running the app locally? Follow the steps below.

### Prerequisites

- **Node.js** (version 18 or higher)
- **Yarn**
- **React Native CLI**
- **Xcode** (for iOS development)
- **Android Studio** (for Android development)

### Getting Started

1. **Fork and Clone the Repository**

   ```bash
   git clone https://github.com/a-ghorbani/pocketpal-ai
   cd pocketpal-ai
   ```

2. **Install Dependencies**

   ```bash
   yarn install
   ```

3. **Install Pod Dependencies (iOS Only)**

   ```bash
   cd ios
   pod install
   cd ..
   ```

4. **Run the App**

   - **iOS Simulator**

     ```bash
     yarn ios
     ```

   - **Android Emulator**

     ```bash
     yarn android
     ```

### Scripts

- **Start Metro Bundler**

  ```bash
  yarn start
  ```

- **Clean Build Artifacts**

  ```bash
  yarn clean
  ```

- **Lint and Type Check**

  ```bash
  yarn lint
  yarn typecheck
  ```

- **Run Tests**

  ```bash
  yarn test
  ```

## Contributing

We welcome all contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md) before you start.

### Quick Start for Contributors

1. **Fork the Repository**
2. **Create a New Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
4. **Test Your Changes**

   - **Run on iOS**

     ```bash
     yarn ios
     ```

   - **Run on Android**

     ```bash
     yarn android
     ```

5. **Lint and Type Check**

   ```bash
   yarn lint
   yarn typecheck
   ```

6. **Commit Your Changes**

   - Follow the Conventional Commits format:

     ```bash
     git commit -m "feat: add new model support"
     ```

7. **Push and Open a Pull Request**

   ```bash
   git push origin feature/your-feature-name
   ```

## Roadmap

- **New Models**: Add support for more tiny LLMs.
- **UI/UX Enhancements**: Continue improving the overall user interface and user experience.
- **Improved Documentation**: Enhance the documentation of the project.
- **Performance Optimization**: Further optimize performance across different device types.
- **More Languages**: Add support for additional languages through localization.
- **Enhanced Error Handling**: Improve error handling and recovery mechanisms.

Feel free to open issues to suggest features or report bugs.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact

For questions or feedback, please open an issue.

## Acknowledgements

PocketPal AI is built using the amazing work from:

- **[llama.cpp](https://github.com/ggerganov/llama.cpp)**: Enables efficient inference of LLMs on local devices.
- **[llama.rn](https://github.com/mybigday/llama.rn)**: Implements llama.cpp bindings into React Native.
- **[React Native](https://reactnative.dev/)**: The framework powering the cross-platform mobile experience.
- **[MobX](https://mobx.js.org/)**: State management library that keeps the app reactive and performant.
- **[React Native Paper](https://callstack.github.io/react-native-paper/)**: Material Design components for the UI.
- **[React Navigation](https://reactnavigation.org/)**: Routing and navigation for the app's screens.
- **[Gorhom Bottom Sheet](https://github.com/gorhom/react-native-bottom-sheet)**: Powers the smooth bottom sheet interactions throughout the app.
- **[@dr.pogodin/react-native-fs](https://github.com/birdofpreyru/react-native-fs)**: File system access that enables model download and management.

And many other open source libraries that make this project possible!

---

Happy exploring! 🚀📱✨
