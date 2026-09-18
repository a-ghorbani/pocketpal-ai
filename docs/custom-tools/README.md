# Custom HTTP tools — Termux example

A custom tool lets a model call an HTTP endpoint you define. This example runs a
small Python server on the phone itself, so nothing leaves the device.

## 1. Start the server in Termux

```bash
pkg install python
termux-wake-lock          # keeps the server alive when the screen goes off
python termux-server.py
```

It listens on `http://127.0.0.1:8765`, which is the address PocketPal uses to
reach it. Stop it with Ctrl+C, and release the lock with `termux-wake-unlock`.

The server keeps notes in memory only, and exposes three endpoints:

| Endpoint | What it does |
| --- | --- |
| `GET /time` | the current date and time |
| `GET /notes` | every note stored since the server started |
| `POST /notes/<id>` | stores `{"text": "..."}` under `<id>` |

## 2. Add the tools to PocketPal

Open **Settings → Custom tools → Import** and pick `example-tools.json`. It
defines `get_time` and `add_note` against the endpoints above.

Imported tools always arrive with confirmation switched on, whatever the file
says, so the first call always asks you first.

## 3. Turn them on for a Pal

Tool access is granted per Pal. Edit a Pal, open **Talents**, and switch on
`get_time` or `add_note`. Then ask the model something like "what time is it?"
and approve the call when the sheet appears.

## Writing your own

- `{{arg}}` placeholders are filled from the model's arguments. They are allowed
  in the path, in query values, in header values and as whole body values —
  never in the scheme, host or port.
- `{{secret.NAME}}` holds a credential in the device keychain. It is allowed in
  a query value and in the `Authorization` header only, and never reaches the
  model, the chat display, a log line or an export file.
- `response` trims what the model sees: `extract` (a JSONPath subset of `$`,
  `.key`, `[n]` and `[*]`), then `fields`, `maxItems`, `template`, `maxChars`,
  and finally the untrusted-content wrapper.
- A tool pointing anywhere other than loopback is flagged in the editor, because
  anything the model sends then leaves the device.
- A response that arrives from a host other than the one you defined is
  discarded on iOS, where the final address is visible. On Android the network
  stack follows redirects itself and reports the original address, so such a
  redirect cannot be detected — one more reason to point a tool only at a host
  you trust.
