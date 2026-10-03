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

### Using Scout

Scout is a built-in general-purpose Pal with five talents: Internet Search,
page reading, calculation, date and time, and HTML Preview. Open the Pal picker
from Chat and select **Scout**. Scout does not select or download a model; it
uses the local or remote model you already selected. That model or server must
support function calling for talents to work.

Scout uses a warm dark-beige composer with muted-gold accents in both light and
dark themes. Existing Scouts that still use the original built-in colors are
updated automatically; colors you customized are preserved.

Internet Search is not configured automatically. Open **Settings → Internet
Search**, choose a provider, accept the external-content disclosure, and add
that provider's API key. Search queries and pages then leave the device, and a
remote chat model also receives the conversation. The Scout Pal record and chat
history remain stored locally.

The **Results per search** setting accepts 1–20 results and defaults to 5.
**Send full search results** is enabled by default: PocketPal forwards every
title, URL, and provider snippet returned up to the selected count without
shortening or dropping later results. Disable it to restore bounded search
output, which limits snippets and can omit later results to conserve model
context. Provider result counts are upper bounds, so a provider may return
fewer results than requested.

Tavily basic search uses one request for the selected count. Selecting 20
therefore maximizes the raw results requested in that call; PocketPal does not
paginate the request. Larger tool output takes more prompt-processing time,
remote input tokens, local memory, chat storage, and model context. The active
model or server's context limit still applies, so reduce the count, disable full
results, or increase the model context when searches overflow it. Changing the
setting affects future searches and does not restore content shortened in older
chat history.

Scout can use HTML Preview for requested diagrams, charts, UI mockups, and small
interactive explanations. A context size of at least 4,096 tokens is
recommended for HTML generation; PocketPal displays its existing context-room
hint when the active model is smaller. Preview rendering retains PocketPal's
network and navigation restrictions. Scout uses ordinary prose for routine
answers and does not need to call a tool on every turn.

### Using Remote API Protocols

Remote servers can select **Auto**, **Chat Completions**, or **Responses** as
their API protocol. An individual remote model can inherit that setting or
override it with Chat Completions or Responses. Set the server default while
adding or managing a server and use the model settings for an override.
PocketPal resolves the effective protocol in this order:

1. model override;
2. server override;
3. endpoint support advertised by the model catalog; then
4. compatibility default: Chat Completions.

A catalog entry can be incomplete or inaccurate. PocketPal warns when an
override contradicts advertised support, and listing a model does not prove
that your credential is entitled to run it.

The Responses transport supports PocketPal text streaming, image-to-input
conversion, reasoning summaries, structured output, cancellation, usage, and
completed, incomplete, refusal, and failure outcomes. Local function talents
can execute in the agent loop and their outcomes are replayed to the provider.
Chats and the validated replay data needed to continue them are stored locally,
so completed conversations survive an app restart.

PocketPal sends Responses requests with `store: false`; it does not ask the
provider to retain a conversation. Instead, it explicitly replays local
history. A versioned, opaque provider-state block may be retained in local
messages and JSON chat backups when needed for faithful continuation. Copy and
Markdown export include visible text only, not that state. PocketPal will not
reuse opaque state after the provider server, model, or protocol changes.

Hosted OpenAI tools, background responses, WebSocket mode, and the Conversations
API are outside this integration's scope.

### Generation parameter defaults

Each optional generation setting has an explicit mode in the generation
settings sheets:

- **Use provider/native default** does not send that parameter.
- **Use custom value** sends the retained value.
- **Inherit** follows the parent preset where the setting is inherited.

Switching to the provider default keeps the custom value so it can be restored
later. A valid `0`, `false`, or backend-specific sentinel remains a real custom
value; it is not treated as omission. Omitting a parameter also does not disable
the corresponding algorithm—the active provider or local runtime chooses its
default. Required request fields, tools, schemas, routing, and safety controls
are not optional.

The same controls apply to remote and on-device generation settings. Thinking
has separate **backend default**, **On**, and **Off** intent; reasoning effort
can likewise inherit, use the backend default, or send an explicit supported
level. A provider may support only some optional parameters. For example, the
verified GitHub Copilot Responses model rejected `temperature` and `top_p`; set
those fields to **Use provider/native default** rather than changing their
saved custom values.

### Responses diagnostics

For troubleshooting a Responses provider, open **Settings → Diagnostics** and
turn on **Responses protocol logging**. The setting is memory-only and returns
to off after an app restart. It logs only bounded structural metadata such as
event types, indices, item types, status, and request parameter presence. It
does not log API keys, headers, URLs, prompts, generated text, tool payloads,
images, or reasoning content. Disable it when finished; existing Android
`logcat` lines are not retroactively erased.

### Using a GitHub Copilot Remote Model

PocketPal can connect to GitHub Copilot through either supported remote
protocol:

1. Open **Models**, tap **+**, then select **Add Remote Model**.
2. Set **Server Type** to **GitHub Copilot** before connecting.
3. Enter `https://api.githubcopilot.com` as the server URL. Do not append
   `/v1`; PocketPal uses unversioned `/models`, `/responses`, and
   `/chat/completions` for this server type. Other server types retain their
   `/v1/models`, `/v1/responses`, and `/v1/chat/completions` routes.
4. Enter a supported GitHub credential, select an available model, and add it.

GitHub documents fine-grained personal access tokens with the **Copilot
Requests** permission for Copilot CLI authentication. PocketPal stores the
credential in the platform Keychain/Keystore, but it does not implement GitHub
sign-in or refresh the credential. Your account must have the required Copilot
access and comply with any organization policy.

This option sends a pinned, test-suffixed Copilot CLI-derived identification
profile. GitHub may reject the custom `copilot-developer-cli-test` integration
ID, and PocketPal will not retry with the original identity. A model appearing
in `/models` does not prove entitlement or successful inference.

The Copilot integration was verified with deterministic local fixtures, not
live Copilot inference, because no explicit GitHub credential was supplied.
Fixture behavior validates PocketPal's transport and UI; it is not a GitHub API
contract.

To change the URL, credential, or server type later, open **Models**, tap **+**,
then **Manage Servers**. Re-select the remote model after editing its server so
the active chat uses the new configuration. Messages sent to any remote server
leave your device.

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

On Android 12 or newer, the microphone button can run a hands-free
conversation when an on-device recognizer and a PocketPal voice are available.
Start with an empty message composer, tap the microphone, and speak. PocketPal
sends the recognized text automatically, asks the model for a concise,
table-free spoken response, reads it with the selected voice, and listens
again. The response instruction is best-effort and a model may not always
follow it.

A short double blip sounds after your speech has been captured and listening
has stopped. A single beep sounds after the complete spoken response finishes,
before the microphone restarts, to signal that it is your turn. These cues
follow media volume and routing (the same as narration), including when the
ringer is silent, vibrating, or in Do Not Disturb. Muting media suppresses the
cues. Silence retries and recognition errors do not play the listening cue;
skipped or failed narration does not play the narration cue. Cancelled turns
do not add further cues. The second cue precedes the microphone restart; it
does not mean the recognizer is already listening.

The microphone button turns hands-free conversation off. The gray speaker Stop
only skips the current audio; generation can finish silently before listening
resumes. Turning text-to-speech off also ends hands-free conversation, while
turning text-to-speech on by itself does not start the microphone. Hands-free
conversation ends when PocketPal leaves the foreground. Recognition stays on
device, but recognized text is still sent to a remote model when a remote
server is selected.

Android builds also expose a separate **PocketPal Voice Chat** launcher entry.
The entry is available only while a model is loaded. Opening it creates a new
chat with the currently selected Pal and model, then starts hands-free
conversation. If the model or Pal becomes ineligible before the launch is
handled, PocketPal rejects the request instead of starting it later. This
private-build fallback can be launched by name when Google Assistant permits
app launches, but it is not a Google Play App Action and Android Auto may block
it while driving because PocketPal is not an Android Auto app.

<div style="display: flex; justify-content: center;">
    <img src="../assets/chat_1.webp" alt="Navigate to Models Page" style="width: 33%;">
    <img src="../assets/chat_2.webp" alt="Download a Model" style="width: 33%;">
</div>

### Copying Text

Important Note: As of now, I haven’t found an easy way to select and copy text from the generated responses while preserving the text formatting, particularly Markdown support.

In the meantime, here are the current options for copying text:

- Paragraph-level copying: Long-press on a specific paragraph to copy its content.
- Full response copying: Use the copy icon at the bottom of the text bubble to copy the entire AI-generated response.

I know these options might not be ideal, and this is one of my frustrations with using other apps. The difficulty of copying portions of text used to be a particularly annoying aspect of chat apps like ChatGPT and others.

**Developers**: PocketPal AI is built using React Native. Finding an easy solution that balances text selection with preserved formatting (especially Markdown support) has been tricky for me. If you have experience in this area, I’d love to hear from you!

## Feedback Welcome!

If you have suggestions for new models or features, please let us know by creating an issue.

Happy exploring! 🚀📱✨
