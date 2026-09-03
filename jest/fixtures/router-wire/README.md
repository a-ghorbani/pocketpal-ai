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

Every retained line is byte-for-byte as it arrived, headers included where the
capture was taken with `curl -i`, because key ordering, content types and fields
that appear on only some builds are all evidence and none of them is knowably
unimportant in advance. Host-identifying values inside `status.args` were **not**
rewritten: the sandbox ran on loopback with no host-identifying paths beyond a
checkout directory.

Eleven of the twelve files are complete. `sse-download-sequence.txt` selects
**rows** from a 112-event stream: all nine non-`download_progress` events, each
of which is a distinct outcome, plus three of the 103 `download_progress` ticks
— the first (`done: 0`), one mid-sequence, and the last (`done == total`).
Selecting rows is not the same operation as tidying a row, and only the second
is forbidden: the omitted ticks are structurally identical to the retained
mid-sequence one and differ only in the `done` integer, so removing them alters
no key, no nesting level and no event ordering. The first and last are kept
because `0` is a real value and completion is a distinct state.

**What this capture does not establish.** The wire allows `download_progress` to
carry several URLs in parallel for a multi-file download. Every tick captured
here has exactly one URL: the parallel case was never exercised, so multi-entry
behaviour of the per-URL map is unverified by capture, and any test over it is a
constructed case rather than a measured one.

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
| `sse-shifted-control-200.txt` | same-instance control: the same server answers 200 `text/event-stream` at the registered path, so the 404 above is about the route and not about a mistyped URL |
| `sse-unauthorized-401.txt` | `GET /models/sse` with no key on a key-protected server — an `authentication_error` envelope, a different shape from the 404 |
| `sse-authorized-control-200.txt` | same-instance control: 200 with the key, so the 401 is about credentials and not about the route. Byte-identical to the shifted control, which is itself informative: both succeed through the same handler |

## Relationship to `jest/fixtures/remoteModelList.ts`

That file is the fixture for the `/v1/models` list shape, and stays so — it is a
richer capture from a 47-model router and documents its own redactions.
`router-v1-models.json` and `direct-v1-models.json` here were captured from a
**different, later build**, and agree with it on the router/direct top-level-key
difference and on `status` being present per row. Take them as an independent
second build confirming that shape, not as a replacement for it.

The remaining ten files record behaviour that exists nowhere else.
