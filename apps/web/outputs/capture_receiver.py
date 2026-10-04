from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
from io import BytesIO
from PIL import Image

root = Path(r'C:\Users\joshr\Desktop\meta_clinic\apps\web\public\marketing\captures')
root.mkdir(parents=True, exist_ok=True)

class CaptureReceiver(BaseHTTPRequestHandler):
    def do_POST(self):
        name = self.path.removeprefix('/capture/')
        if not self.path.startswith('/capture/') or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,90}\.png', name):
            self.send_error(400)
            return
        size = int(self.headers.get('Content-Length', '0'))
        if size < 1000 or size > 15_000_000:
            self.send_error(413)
            return
        data = self.rfile.read(size)
        if data.startswith(b'\xff\xd8\xff'):
            output = BytesIO()
            Image.open(BytesIO(data)).save(output, format='PNG')
            data = output.getvalue()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            self.send_error(415)
            return
        (root / name).write_bytes(data)
        self.send_response(201)
        self.end_headers()
        self.wfile.write(name.encode())

    def log_message(self, *_args):
        pass

HTTPServer(('127.0.0.1', 3499), CaptureReceiver).serve_forever()
