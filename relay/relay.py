"""YoomiRead relay: forwards translation requests from the phone to the AI provider.

Why it exists: the provider does not allow web pages to call its chat address directly,
so the phone calls this relay instead, and the relay calls the provider.

Runs on your PC, behind Mini Deploy (Caddy), on 127.0.0.1 only. Nothing else can reach it.

Settings come from relay/.env (never committed):
  RELAY_PASSWORD   the password the phone sends (put it in the app's "API key" box)
  PROVIDER_KEY     your provider API key (stays on this PC)
  PROVIDER_URL     optional, default https://api.cheaperinference.com/v1
  RELAY_PORT       optional, default 9300
"""

import hmac
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length", "authorization"}
ALLOWED = {"/v1/chat/completions", "/v1/models"}
MAX_BODY = 2_000_000  # a chapter is far smaller than this


def load_env(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "YoomiRelay/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep the log short; never log bodies or keys
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def _deny(self, code: int, message: str) -> None:
        body = message.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorised(self) -> bool:
        sent = self.headers.get("Authorization", "")
        wanted = "Bearer " + os.environ.get("RELAY_PASSWORD", "")
        return bool(os.environ.get("RELAY_PASSWORD")) and hmac.compare_digest(sent.encode(), wanted.encode())

    def do_GET(self):
        self._forward()

    def do_POST(self):
        self._forward()

    def _forward(self):
        path = self.path.split("?")[0]
        if path not in ALLOWED:
            return self._deny(404, "not found")
        if not self._authorised():
            return self._deny(401, "wrong or missing relay password")

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > MAX_BODY:
            return self._deny(413, "request too large")
        body = self.rfile.read(length) if length else None

        base = os.environ.get("PROVIDER_URL", "https://api.cheaperinference.com/v1").rstrip("/")
        url = base + path[len("/v1"):]
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        headers["Authorization"] = "Bearer " + os.environ.get("PROVIDER_KEY", "")

        req = urllib.request.Request(url, data=body, method=self.command, headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=300)
            status, reply_headers, stream = resp.status, resp.headers, resp
        except urllib.error.HTTPError as e:
            status, reply_headers, stream = e.code, e.headers, e
        except urllib.error.URLError:
            return self._deny(502, "could not reach the provider from the relay")

        self.send_response(status)
        for k, v in reply_headers.items():
            if k.lower() not in HOP_BY_HOP and k.lower() != "content-encoding":
                self.send_header(k, v)
        self.send_header("Connection", "close")
        self.end_headers()
        # Pass the answer through as it arrives, so the phone shows text while it streams.
        while True:
            chunk = stream.read(1024)
            if not chunk:
                break
            self.wfile.write(chunk)
            self.wfile.flush()
        self.close_connection = True


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    load_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
    missing = [k for k in ("RELAY_PASSWORD", "PROVIDER_KEY") if not os.environ.get(k)]
    if missing:
        sys.exit("Missing in relay/.env: " + ", ".join(missing))
    port = int(os.environ.get("RELAY_PORT", "9300"))
    # Loopback only: Caddy on this PC is the only thing that reaches it.
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"relay listening on 127.0.0.1:{port}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
