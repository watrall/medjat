"""Serve the static app locally, including concurrent ES-module requests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, security_headers, **kwargs):
        self.security_headers = security_headers
        super().__init__(*args, **kwargs)

    def end_headers(self):
        for name, value in self.security_headers:
            self.send_header(name, value)
        super().end_headers()

    def log_message(self, format, *args):
        # A retained preview can otherwise fill an unattended output pipe.
        pass


class Server(ThreadingHTTPServer):
    request_queue_size = 64
    daemon_threads = True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8614)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    # Mirror the single site-wide header rule from the Cloudflare Pages build.
    security_headers = [
        line.strip().split(": ", 1)
        for line in (root / "_headers").read_text().splitlines()
        if line.startswith("  ")
    ]
    handler = partial(Handler, directory=str(root), security_headers=security_headers)
    server = Server(("127.0.0.1", args.port), handler)
    print(f"Medjat: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
