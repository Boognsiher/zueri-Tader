"""Lokaler Webserver für das Spiel, ohne Zwischenspeicher im Browser.

Der einfache `python -m http.server` lässt den Browser die Programmdateien (game/src/*.js)
zwischenspeichern. Nach einem Update lädt der Browser dann neue Daten, aber alte Programmdateien,
und das Spiel startet nicht. Dieser Server verbietet das Zwischenspeichern.

Aufruf aus dem Projektordner: python tools/spielserver.py [port]
"""

import http.server
import sys


class OhneCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f"Züri-Trade läuft auf http://localhost:{port}/game/ (beenden mit Strg+C)")
http.server.ThreadingHTTPServer(("", port), OhneCache).serve_forever()
