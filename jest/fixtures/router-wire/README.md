# Router-mode wire captures

Responses and event streams captured from a live `llama-server` in router mode,
build **b9976 (`e3546c794`)**, taken in an isolated sandbox on loopback with
three CPU-only presets, two tiny models and one deliberately corrupt `.gguf`.

They are here rather than written by hand because llama.cpp's server README is
measured wrong on four load-bearing points — the SSE event name, the nesting of
the `download_progress` URL map, what `POST /models` returns for a repository
that does not exist, and what the two terminal download events mean. A fixture
transcribed from that document encodes its errors and passes.

## What was captured, what was redacted, and what was left out

Retained lines are as they arrived, headers included where the capture was taken
with `curl -i`, because key ordering, content types and fields that appear on
only some builds are all evidence and none of them is knowably unimportant in
advance — with the one exception below.

**Redacted.** One file carried absolute paths belonging to the capture host:
in `router-v1-models.json` the directory the binary ran from becomes
`/bin/llama-server` and the directory the weights sat in becomes
`/models/<name>.gguf`, in `status.args` and the `status.preset` string. Nothing
else is rewritten: `--host 127.0.0.1` and `--port 0` are what the server
reported, and the other files carry no host-identifying value at all — the only
absolute paths left in them are content types, Hugging Face repository ids and
one `huggingface.co` download URL.

**What the redaction preserves**, which is what keeps it usable as evidence:
every key, every type, every nesting level, and every array element in its
original position. `args` is a flat array in which a flag and its value are
adjacent by position, so each replaced element is replaced in place by exactly
one element. That is the standard `jest/fixtures/remoteModelList.ts` states for
its own redactions.

**Left out.** Only one file omits anything. `sse-download-sequence.txt` selects
**rows** from a 112-event stream: all nine non-`download_progress` events, each
of which is a distinct outcome, plus three of the 103 `download_progress` ticks
— the first (`done: 0`), one mid-sequence, and the last (`done == total`). The
omitted ticks are structurally identical to the retained mid-sequence one and
differ only in the `done` integer, so removing them alters no key, no nesting
level and no event ordering.

**What this capture does not establish.** The wire allows `download_progress` to
carry several URLs in parallel for a multi-file download. Every tick captured
here has exactly one URL, so multi-entry behaviour of the per-URL map is
unverified by capture.

Tests project the fields they need in their own bodies, through
`jest/fixtures/routerWire.ts`, so the projection is visible at the assertion
rather than baked into the fixture.

## Files

| file                             | what it is                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router-v1-models.json`          | `GET /v1/models` from a router: top-level `data`, `object`, **no `models` key**; every row carries a `status` object, unloaded rows included                                                                                |
| `unload-not-running-400.json`    | `POST /models/unload` for a model that is already unloaded                                                                                                                                                                  |
| `unload-not-found-400.json`      | `POST /models/unload` for an unknown id                                                                                                                                                                                     |
| `sse-load-sequence.txt`          | `GET /models/sse` across a load: the one-shot `model_status` ack, then `status_change` carrying progress from `0.0`, `loaded`, `sleeping`, a clean unload (`exit_code: 0`) and a failed load (`exit_code: 1`)               |
| `sse-download-sequence.txt`      | `GET /models/sse` across a failed download, a successful one and a cancel — `download_finished` fires for both outcomes, `download_failed` fires on cancel, and `download_progress` nests its URL map under `data.progress` |
| `sse-unregistered-404.txt`       | `GET /models/sse` where the route is unregistered: a clean JSON `not_found_error` envelope, which is what a router built before the stream existed looks like                                                               |
| `sse-shifted-control-200.txt`    | same-instance control: the same server answers 200 `text/event-stream` at the registered path, so the 404 above is about the route and not about a mistyped URL                                                             |
| `sse-unauthorized-401.txt`       | `GET /models/sse` with no key on a key-protected server — an `authentication_error` envelope, a different shape from the 404                                                                                                |
| `sse-authorized-control-200.txt` | same-instance control: 200 with the key, so the 401 is about credentials and not about the route. Byte-identical to the shifted control: both succeed through the same handler                                              |

## Download facts the app does not act on yet

Server-side download is not wired in the app. These measured facts stand for
when it is: `POST /models` answers `200 {"success":true}` even for a repository
that does not exist; `download_progress` nests its per-URL map under
`data.progress`; `download_finished` fires for a failed download as well as a
successful one; `download_failed` fires on cancel, and cancel is
`POST /models/unload`; `models_reload` fires unprompted. The only verdict is the
model's presence in a later `GET /v1/models`.

## Relationship to `jest/fixtures/remoteModelList.ts`

That file is the fixture for the `/v1/models` list shape, and stays so — it is a
richer capture from a 47-model router and documents its own redactions.
`router-v1-models.json` here was captured from a **different, later build** and
agrees with it on the router top-level keys and on `status` being present per
row: an independent second build confirming that shape.
