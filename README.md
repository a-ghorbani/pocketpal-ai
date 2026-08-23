<div align="center">

<img src="src/assets/pocketpal-dark-v2.png" alt="PocketPal AI logo" width="120" />

# PocketMind

**A private, autonomous AI that runs entirely on your phone.**

Fork of [PocketPal AI](https://github.com/a-ghorbani/pocketpal-ai) with a
focus on knowledge, autonomy, and running your own local models - no cloud,
no account, no telemetry. Built and tested on a Pixel 8 Pro running
GrapheneOS.

[Releases](https://github.com/tokenbleed/pocketmind/releases) (APK, install
via [Obtainium](https://github.com/ImranR98/Obtainium) or directly)

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
- **Latency pack**: extractive sentence-level quote trimming, tuned defaults,
  warm embedding context

## Roadmap

- PDF / DOCX / EPUB text extraction at attach time
- Sandboxed agent workspace (list/read/write/grep tools with path jailing)
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
pnpm install
pnpm lint
pnpm test
cd android && ./gradlew assembleProdRelease
```

See the upstream README for the full build matrix (iOS, debug variants).

## License

MIT, inherited from upstream. See [LICENSE](./LICENSE).
