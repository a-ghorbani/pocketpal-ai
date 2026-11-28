# Local API server

PocketPal can serve the loaded model over an OpenAI-compatible HTTP API, so scripts and other apps on your network can use it. This page lists what the server accepts. The code lives in `src/services/localApiServer/`.

## Endpoints

| Method | Path | |
|---|---|---|
| `GET` | `/v1/models` | The loaded model. |
| `POST` | `/v1/chat/completions` | Chat completion, streamed or not. |

Any other path returns `404`, and a wrong method returns `405`.

## Authentication

If you set an API key, send it as `Authorization: Bearer <key>`. A missing or wrong key returns `401`.

Without an API key, requests that carry an `Origin` header (that is, from a browser) are refused with `403`. Set a key to call the server from a web page.

## Chat completion request

| Field | Notes |
|---|---|
| `messages` | Required, non-empty. Roles `system`, `user` and `assistant`. Content is a string or an array of `text` parts. |
| `max_tokens` / `max_completion_tokens` | Default 1024, capped at 2048. |
| `stream` | `true` streams server-sent events. |
| `stream_options.include_usage` | Adds token usage to the stream. |
| `stop` | A string or an array of strings, added to the model's own stop words. |
| `temperature`, `top_p`, `top_k`, `min_p`, `seed` | Sampling. |
| `frequency_penalty`, `presence_penalty`, `repeat_penalty` | Penalties. |
| `response_format` | Passed through to the model. |
| `chat_template_kwargs.enable_thinking` | `true` or `false` turns reasoning on or off for this request. |

Any field you leave out uses the app's **new chat** settings, not the settings of the chat you have open. That includes thinking: toggling thinking off in an open chat does not change what the API does. To control it per request, send `chat_template_kwargs`:

```json
{
  "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
  "max_tokens": 64,
  "chat_template_kwargs": {"enable_thinking": false}
}
```

With thinking on, reasoning counts against `max_tokens` and is returned in `reasoning_content`, separate from `content`.

## Not supported

These are rejected with `400` instead of being silently ignored:

- `tools`, or a `tool_choice` other than `none`
- image, audio or any other non-text content parts
- `n` other than 1
- `logprobs: true`
