# GGUF memory captures

Reference inputs and outputs for the per-architecture memory estimate, captured
on a host build of the llama.cpp that llama.rn **0.13.0-rc.11** vendors
(`node_modules/llama.rn/vendor/llama.cpp`), CPU backend, aarch64.

Each GGUF was loaded with `no_alloc` (no tensor data read) and a context was
created per `n_ctx` and flash-attention setting with the parameters the app
sends: `n_parallel` 1, `kv_unified` true, `n_batch` = `n_ubatch` = 512, f16 K
and V, `swa_full` false, `n_gpu_layers` 0. Files not on the capture host were
replaced by their real header (fetched by HTTP range) followed by zeros up to
the real file size; on a model present both ways the two gave byte-identical
buffers and metadata.

## Files

| path | what it is |
| --- | --- |
| `metadata/<model>.json` | the GGUF key/value map in the shape llama.rn's `loadLlamaModelInfo` returns it: every value as `gguf_kv_to_str` prints it (arrays as text like `[0, 0, 8, ...]`, bools as `true`/`false`), and the tokenizer arrays only as `<key>.length` numbers |
| `buffers/<model>.txt` | one `RESULT` line per (`n_ctx`, `fa`) from `llama_get_memory_breakdown`: `model` (weights), `context` (KV cache plus recurrent state), `compute` (graph scratch), in bytes. `fa=off` is the Android default; `fa=auto` resolved to flash attention on, on this host |
| `buffers/<model>.32k.txt` | the same at `n_ctx` 32768, `fa=off` only |
| `file-sizes.tsv` | each GGUF's size on disk in bytes, which is what the app stores as `Model.size` |
| `embedding-tensors.tsv` | from each GGUF's tensor descriptors: `token_embd.weight`'s ggml type id, dims and byte size, and whether `output.weight` exists. Without `output.weight` an Android CPU load holds `token_embd` twice (the input lookup plus a repacked copy for the output matrix) |
| `headers/<model>.gguf-header.gz` | the first `data_offset` bytes of two GGUFs, gzipped: one tied (LFM2.5-350M) and one with `output.weight` (Phi-3.5), for the local tensor scan |
| `written/<model>-<n_ctx>-<fa>.out` | a full-context fill (n_ctx − 8 prompt tokens in 512-token ubatches, then 8 single-token decodes) on the same build and parameters, one logits row per ubatch. `after fill rss+` is how much the process grew during the fill: the compute buffer as written, as opposed to the `compute_buf` reservation |

## Redaction

`tokenizer.chat_template` is replaced by `<omitted: N chars>` in every metadata
file; no estimate reads it. Nothing else is edited: keys, order and value text
are as captured.
