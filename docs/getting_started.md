# Getting Started

Note: Part of this guide is outdated. It will be updated soon.

## Installation

**iPhone** users can grab it here: [PocketPal AI on the App Store](https://apps.apple.com/us/app/pocketpal-ai/id6502579498)

**Android** users can get it from here: [PocketPal AI on Google Play](https://play.google.com/store/apps/details?id=com.pocketpalai)

Note: This is a personal project, so I am working on it in my spare time. It might have bugs and issues, and obviously, I have not tested it on all devices. If you encounter any issues, open an issue, or even better, contribute to the project!

### Available Models

PocketPal AI comes pre-configured with some popular SLMs:

- Danube 2 and 3
- Phi
- Gemma 2
- Qwen

Modells need to be downloaded before use. You can download and use these models directly from the app and load any other GGUF models you like!

<div style="display: flex; justify-content: center;">
    <img src="../assets/models_page.webp" alt="Models Page" style="width: 33%;">
</div>

## Using PocketPal AI

### Downloading a Model

- Tap the burger menu
- Navigate to the “Models” page
- Choose your desired model and hit download

<div style="display: flex; justify-content: center;">
    <img src="../assets/add_model_1.webp" alt="Navigate to Models Page" style="width: 33%;">
    <img src="../assets/add_model_2.webp" alt="Download a Model" style="width: 33%;">
    <img src="../assets/add_model_3.webp" alt="Load a Model" style="width: 33%;">
</div>

### Loading a Model

After downloading, tap _Load_ to bring the model into memory. Now you’re ready to chat!

### Tips

On iOS devices, Apple’s GPU API (Metal) is activated by default. If you experience any hiccups, try deactivating it.

#### iOS Metal

#### Auto Offload/Load

To keep the device running smoothly, PocketPal AI can automatically manage memory usage:

- Enable “Auto Offload/Load” on the model page (by default it is)
- The app will offload the model when in the background
- It’ll reload when you return (give it a few seconds for larger models)

#### Advanced Settings

Click the chevron icon to access advanced LLM settings like:

- Temperature
- BOS token
- Chat template options
- etc.

<div style="display: flex;  justify-content: center;">
    <img src="../assets/model_config_1.webp" alt="Navigate to Models Page" style="width: 33%;">
    <img src="../assets/model_config_2.webp" alt="Download a Model" style="width: 33%;">
    <img src="../assets/model_load.webp" alt="Load a Model" style="width: 33%;">
</div>

### Finally, Let’s Chat!

Once your model is loaded, head to the “Chat” page and start conversing with the loaded model!

The generation performance metric is also displayed. If interested, watch the chat bubble for real-time performance metrics: Tokens per second and Milliseconds per token.

<div style="display: flex; justify-content: center;">
    <img src="../assets/chat_1.webp" alt="Navigate to Models Page" style="width: 33%;">
    <img src="../assets/chat_2.webp" alt="Download a Model" style="width: 33%;">
</div>

### Copying Text

Assistant responses use a rich rendering pipeline with rendered, clean, and raw modes. Markdown headings, emphasis, lists, links, task lists, code blocks, and GitHub-style tables are rendered in the chat bubble. Tables and long code blocks scroll horizontally on small screens.

Copy options:

- Default copy: use the copy icon at the bottom of the AI response bubble.
- Copy as clean text, clean text with thinking, Markdown, or raw text: long-press an assistant message and choose "Copy as".
- Code blocks have their own copy button in the code header.
- JSON, XML, and tool-call blocks are shown as collapsible safe code blocks with raw copy.
- Markdown tables can be copied as Markdown or plain tab-delimited text.
- Block equations can be copied as raw LaTeX.

Clean copy removes model template tokens and thinking blocks by default. Clean text with thinking includes reasoning as plain text without model template tokens. Raw copy keeps the exact model output, including service tokens and thinking tags.

### Markdown, Math, and Unsafe HTML

PocketPal supports common Markdown syntax and safe fallbacks for malformed Markdown while streaming. Code blocks preserve indentation and newlines, and Markdown/LaTeX is not interpreted inside fenced code.

Supported math delimiters:

- Inline: `$...$` and `\(...\)`
- Block: `$$...$$` and `\[...\]`

Escaped dollar signs such as `\$5` are preserved. Long block equations scroll horizontally. Unsafe HTML is escaped before rendering; scripts, remote images, and raw HTML are not executed. XML/HTML-like model output is displayed as text/code fallback rather than run as markup.

Rendering behavior can be tuned from Settings: Markdown, LaTeX, tables, thinking visibility, default thinking collapse, template-token cleanup, default copy mode, code wrapping, syntax highlighting, and compact tables. Very large answers, large tables, many code blocks, and large math blocks use cheaper fallback paths so the chat stays responsive while streaming on mobile devices.

## Feedback Welcome!

If you have suggestions for new models or features, please let us know by creating an issue.

Happy exploring! 🚀📱✨
