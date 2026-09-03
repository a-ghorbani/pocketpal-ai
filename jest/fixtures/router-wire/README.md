# Router-mode wire captures

Unedited responses and event streams from a live `llama-server` in router mode,
build **b9976 (`e3546c794`)**, taken in an isolated sandbox on loopback with
three CPU-only presets, two tiny models and one deliberately corrupt `.gguf`.

They are here rather than written by hand because llama.cpp's server README is
measured wrong on four load-bearing points — the SSE event name, the nesting of
the `download_progress` URL map, what `POST /models` returns for a repository
that does not exist, and what the two terminal download events mean. A fixture
transcribed from that document encodes its errors and passes.

## What was captured, and what was left out

Nothing is trimmed. Files are byte-for-byte as they arrived, headers included
where the capture was taken with `curl -i`, because key ordering, content types
and fields that appear on only some builds are all evidence and none of them is
knowably unimportant in advance. Host-identifying values inside
`status.args` were **not** rewritten in these files: the sandbox ran on
loopback with no host-identifying paths beyond a checkout directory.

Tests project the fields they need in their own bodies, through
`jest/fixtures/routerWire.ts`, so the projection is visible at the assertion
rather than baked into the fixture.

## Files

| file | what it is |
| --- | --- |
| `router-v1-models.json` | `GET /v1/models` from a router: top-level `data`, `object`, **no `models` key**; every row carries a `status` object, unloaded rows included |
| `direct-v1-models.json` | `GET /v1/models` from a single-model server: top-level `data`, **`models`**, `object`; no row carries `status` |
| `direct-models-endpoint.json` | `GET /models` from that same single-model server, byte-identical to its `/v1/models` — so probing `/models` does not discriminate router from direct |
| `unload-not-running-400.json` | `POST /models/unload` for a model that is already unloaded |
| `unload-not-found-400.json` | `POST /models/unload` for an unknown id |
| `sse-load-sequence.txt` | `GET /models/sse` across a load: the one-shot `model_status` ack, then `status_change` carrying progress from `0.0`, `loaded`, `sleeping`, a clean unload (`exit_code: 0`) and a failed load (`exit_code: 1`) |
| `sse-download-sequence.txt` | `GET /models/sse` across a failed download, a successful one and a cancel — `download_finished` fires for both outcomes, `download_failed` fires on cancel, and `download_progress` nests its URL map under `data.progress` |
| `sse-unregistered-404.txt` | `GET /models/sse` where the route is unregistered: a clean JSON `not_found_error` envelope, which is what a router built before the stream existed looks like |
| `post-models-unregistered-404.txt` | the same for `POST /models` |
| `sse-shifted-control-200.txt` | same-instance control: the same server answers 200 chunked at the registered path, so the 404 above is about the route and not about a mistyped URL |
| `sse-unauthorized-401.txt` | `GET /models/sse` with no key on a key-protected server — an `authentication_error` envelope, a different shape from the 404 |
| `sse-authorized-control-200.txt` | same-instance control: 200 with the key, so the 401 is about credentials and not about the route |

## Relationship to `jest/fixtures/remoteModelList.ts`

That file is the fixture for the `/v1/models` list shape, and stays so — it is a
richer capture from a 47-model router and documents its own redactions.
`router-v1-models.json` and `direct-v1-models.json` here were captured from a
**different, later build**, and agree with it on the router/direct top-level-key
difference and on `status` being present per row. Take them as an independent
second build confirming that shape, not as a replacement for it.

The remaining ten files record behaviour that exists nowhere else.
