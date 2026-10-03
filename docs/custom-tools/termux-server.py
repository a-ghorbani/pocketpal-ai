#!/usr/bin/env python3
"""A tiny demo server for PocketPal AI custom HTTP tools.

Standard library only, so it runs under Termux with nothing but
`pkg install python`. It listens on loopback, which is the only address
PocketPal can reach on the same device.

Endpoints:
  GET  /time          -> the current time on the device
  GET  /notes         -> every note stored so far (in memory)
  POST /notes/<id>    -> {"text": "..."} stores a note under <id>

Run it with:  python termux-server.py
"""

import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import unquote

HOST = "127.0.0.1"
PORT = 8765

# In memory on purpose: the demo should leave nothing behind on the device.
NOTES = {}


class DemoHandler(BaseHTTPRequestHandler):
    def _respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/time":
            now = datetime.now(timezone.utc).astimezone()
            self._respond(
                200,
                {
                    "iso": now.isoformat(),
                    "human": now.strftime("%Y-%m-%d %H:%M:%S %Z"),
                },
            )
            return

        if self.path == "/notes":
            self._respond(
                200,
                {"notes": [{"id": key, "text": text} for key, text in NOTES.items()]},
            )
            return

        self._respond(404, {"error": "no such endpoint"})

    def do_POST(self):
        if not self.path.startswith("/notes/"):
            self._respond(404, {"error": "no such endpoint"})
            return

        note_id = unquote(self.path[len("/notes/") :])
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self._respond(400, {"error": "body was not valid JSON"})
            return

        NOTES[note_id] = payload.get("text", "")
        self._respond(200, {"saved": note_id, "text": NOTES[note_id]})

    def log_message(self, fmt, *args):
        print("[demo] " + fmt % args)


if __name__ == "__main__":
    print("PocketPal demo tool server listening on http://%s:%d" % (HOST, PORT))
    print("Press Ctrl+C to stop.")
    HTTPServer((HOST, PORT), DemoHandler).serve_forever()
