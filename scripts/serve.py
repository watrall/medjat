"""Serve the static app locally, including concurrent ES-module requests."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
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
    server = Server(("127.0.0.1", args.port), partial(Handler, directory=str(root)))
    print(f"Ancient Egypt Research Explorer: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
