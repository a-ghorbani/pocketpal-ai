<div align="center">

<img src="src/assets/pocketpal-dark-v2.png" alt="PocketPal AI logo" width="120" />

# PocketMind

**A private, autonomous AI that runs entirely on your phone.**

Fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) with a
focus on knowledge, autonomy, and running your own local models - no cloud,
no account, no telemetry. Built and tested on a Pixel 8 Pro running
GrapheneOS. **Android only.**

<table align="center"><tr>
<td><a href="https://tokenbleed.github.io/pocketmind/"><img src=".github/img/badge_obtainium.png" alt="Get it on Obtainium" height="66" /></a></td>
<td><a href="https://github.com/tokenbleed/pocketmind/releases/latest"><img src="https://img.shields.io/github/v/release/tokenbleed/pocketmind?style=for-the-badge&label=Latest%20APK&color=2D2D2D&logo=github" alt="Latest APK" /></a></td>
</tr></table>

Releases are a single universal APK: Android 7.0 (API 24) and newer,
arm64-v8a and x86_64, no per-device variants.

</div>

## What this fork aims to accomplish

Upstream PocketPal is a chat client for local GGUF models. This fork turns
the phone into the whole stack:

1. **Knowledge, not just chat.** A local knowledge base: documents are
   chunked, embedded, and retrieved per question (hybrid BM25 + dense
   cosine, fused with RRF). The model answers from your files, cites them
   in-chat, and everything stays on the device.
2. **Autonomy.** Long-running local agents: a sandboxed file workspace the
   model can read and write, tool use with hard guardrails, and connectors
   to services you already use. The phone becomes an assistant that works
   while you are not looking at it.
3. **Fast, honest UX for local inference.** Local tokens are slow (single
   digits per second), so the UI must budget them like a scarce resource:
   extractive quote trimming, retrieval receipts on every message, warm
   contexts, and visible provenance for what went into each prompt.
4. **Degoogled-first.** Distributed as plain APKs via GitHub releases for
   Obtainium users. No Play Services dependency for core features.

## Shipped in this fork

- **File attachments**: share or attach any text-like file (code, markdown,
  CSV, logs, config) into chat; content is injected into the prompt with a
  context-aware budget
- **Knowledge base (RAG)**: oversized attachments index automatically;
  retrieval quotes the relevant excerpts under source headers; BM25 +
  embeddings run on-device (BGE Small EN v1.5 by default, Qwen3-Embedding
  as a quality option)
- **Chat provenance**: KB badge on the input and per-message "N KB excerpts
  from file" chips, so you always see whether retrieval fired
- **Document extraction**: PDF, DOCX, EPUB, PPTX, XLSX, and ODT files are
  text-extracted at attach time (pdfbox-android for PDFs, pure-JS zip/XML
  readers for the rest), so they feed chat and the knowledge base
- **Agent workspace**: sandboxed `list_files`, `read_file`, `write_file`,
  and `grep_files` talents with strict path jailing, so a Pal can keep
  notes and files across turns
- **Background runs**: every generation runs under an Android foreground
  service (dataSync type) with a progress notification, so a long agent
  run survives the app being backgrounded or the screen turning off;
  the notification follows agent steps and tool calls
- **Latency pack**: extractive sentence-level quote trimming, tuned defaults,
  warm embedding context

## How the knowledge base works

Everything below runs on the phone, with no network call anywhere in the
path. Documents take two routes depending on size, and every send runs a
hybrid retrieval pass:

```mermaid
flowchart TD
    subgraph INGEST["Ingestion, at attach time"]
        A["File attached"] --> B{"Office or PDF?"}
        B -->|"PDF DOCX EPUB PPTX XLSX ODT"| C["Text extraction<br/>pdfbox-android, zip/XML readers"]
        B -->|"Text, code, CSV, logs"| D["Raw text"]
        C --> D
        D --> E{"Over the auto-index<br/>threshold, 20k chars"}
        E -->|"No, fits the prompt"| F["Quoted directly<br/>under the context budget"]
        E -->|"Yes"| G["Chunking<br/>1200 chars, 200 overlap"]
        G --> H["Embedding, GGUF via llama.cpp<br/>BGE Small EN v1.5, or Qwen3"]
        H --> V[("Vector store<br/>Float32 blob per document")]
        G --> S[("Chunks and metadata<br/>in SQLite")]
    end

    subgraph QUERY["Retrieval, at send time"]
        U["User message"] --> Q1["Query embedding<br/>warm context, L2 normalized"]
        Q1 --> DP["Dense pass<br/>cosine similarity"]
        U --> KP["BM25 keyword pass<br/>exact tokens survive"]
        DP --> RRF["Reciprocal rank fusion<br/>k=60"]
        KP --> RRF
        RRF --> TK["Top-K hits<br/>with a cosine floor"]
        TK --> TR["Extractive trimming<br/>query-relevant sentences only,<br/>900 chars per hit"]
        TR --> INJ["Quoted under source headers<br/>global 3000 char budget"]
    end

    V -.->|"loaded per query"| DP
    S -.->|"chunk text"| KP
    INJ --> LLM["Local LLM prompt,<br/>provenance chips in the UI"]
```

Two design notes behind the shape of that graph:

- **Hybrid retrieval, not dense-only.** Small embedding models blur exact
  tokens such as IDs, error codes, and file names; BM25 nails those. Both
  passes run on every query and fuse through RRF, which needs no shared
  score scale. If the embedding model is missing, retrieval degrades to
  keyword-only instead of failing the chat.
- **Brute-force beats an index at phone scale.** A few thousand chunks by
  384 dims is a couple million multiplies per query, so plain dot products
  in JS outpace any index structure while keeping the corpus a set of
  plain files.

## Roadmap

- Telegram connector (Bot API) for messages and files in and out

## Relationship to upstream

This is a personal fork of
[PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) by
[Amin Ghorbani](https://github.com/a-ghorbani). Upstream is MIT-licensed and
deserves the credit for the app, the model manager, and the llama.rn
integration; this fork diverges on the knowledge-base and autonomy direction.
It is not affiliated with the upstream project, and it is not on any app
store. Pull requests welcome once the roadmap stabilizes.

## Engineering notes

An honest admission first: given a free hand, this would have been written
in Kotlin as a native app. Forking the React Native codebase was the
faster path to a working product, and shipping something users can run
outranks writing it in the right language. The tradeoff is a bigger APK
and a JS layer between the UI and llama.cpp.

A size-and-speed audit of the current codebase, in impact order:

1. **Decide the fate of on-device TTS.** The single biggest slab in the
   APK is `libonnxruntime.so` at 32 MB per ABI, 64 MB across both, and
   it exists solely for the optional voice engines (kitten, kokoro,
   supertonic) that `@pocketpalai/react-native-speech` drives with ONNX
   models. No app code imports it directly. Keeping voice costs 64 MB
   in every install; dropping TTS cuts the APK by a third.
2. **Strip the PalsHub cloud layer.** `@supabase/supabase-js`, the
   Firebase app-check BoM, Google Sign-In, Play Billing, and Chrome
   Custom Tabs all exist for upstream's community hub and checkout.
   None of it serves an offline fork, and it drags Play Services
   dependencies into a degoogled build.
3. **Enable R8 minification and resource shrinking.** Release builds
   currently ship with `minifyEnabled false` (upstream default). Turning
   on R8 plus `shrinkResources` trims DEX and assets; it needs a
   validation pass on device because native-module reflection breaks
   without the right keep rules.
4. **Virtualize the message list.** Chat renders every message inside a
   ScrollView, so each token re-renders the whole transcript. A windowed
   list (or `React.memo` on message rows) cuts per-token JS work on long
   sessions.
5. **Live with the llama.cpp weight.** Six CPU-variant `.so` files at
   ~10 MB each plus Hexagon DSP assets, per ABI, are what make the
   178 MB APK. That is the price of one universal binary that runs on
   everything from a 2016 arm64 phone to a Hexagon-backed flagship;
   per-ABI splits would halve downloads but we ship universal only.

## Development

```bash
yarn install
yarn lint
yarn test
cd android && ./gradlew assembleProdRelease
```

Android-only fork: the iOS project, fastlane lanes, and CI jobs were
removed. To build for iOS again, restore them from upstream.

## License

MIT, inherited from upstream. See [LICENSE](./LICENSE).
