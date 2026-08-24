<div align="center">

<img src="src/assets/pocketpal-dark-v2.png" alt="PocketPal AI logo" width="120" />

# PocketMind

**A private, autonomous AI that runs entirely on your phone.**

Fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) with a
focus on knowledge, autonomy, and running your own local models - no cloud,
no account, no telemetry. Built and tested on a Pixel 8 Pro running
GrapheneOS. **Android only.**

[![Get it on Obtainium](https://img.shields.io/badge/Get_it_on-Obtainium-2D2D2D?style=for-the-badge&logo=android&logoColor=3ddc84)](obtainium://app/%7B%22id%22%3A%22com.pocketpalai%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Ftokenbleed%2Fpocketmind%22%2C%22author%22%3A%22tokenbleed%22%2C%22name%22%3A%22PocketMind%22%2C%22preferredApkIndex%22%3A0%2C%22additionalSettings%22%3A%22%7B%5C%22trackOnly%5C%22%3Afalse%7D%22%2C%22overrideSource%22%3A%22GitHub%22%7D)
[![Latest APK](https://img.shields.io/github/v/release/tokenbleed/pocketmind?style=for-the-badge&label=Latest%20APK&color=2D2D2D&logo=github)](https://github.com/tokenbleed/pocketmind/releases/latest)

The Obtainium button works on any Android device with
[Obtainium](https://github.com/ImranR98/Obtainium) installed: it opens the
app pre-filled with this repo, so PocketMind tracks its own updates from
GitHub releases. No store, no account.

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
- **Latency pack**: extractive sentence-level quote trimming, tuned defaults,
  warm embedding context

## Roadmap

- Autonomous task loop with step and token budgets, run under a foreground
  service
- Telegram connector (Bot API) for messages and files in and out

## Relationship to upstream

This is a personal fork of
[PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) by
[Amin Ghorbani](https://github.com/a-ghorbani). Upstream is MIT-licensed and
deserves the credit for the app, the model manager, and the llama.rn
integration; this fork diverges on the knowledge-base and autonomy direction.
It is not affiliated with the upstream project, and it is not on any app
store. Pull requests welcome once the roadmap stabilizes.

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
