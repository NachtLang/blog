#!/usr/bin/env python3
"""Local preview server with HTTP Range support (seekable audio)."""
import http.server
import mimetypes
import os
import re
import socketserver
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()

        try:
            file = open(path, "rb")
            stat = os.fstat(file.fileno())
        except OSError:
            self.send_error(404, "File not found")
            return None

        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        size = stat.st_size
        range_header = self.headers.get("Range")
        self._range_remaining = None

        if range_header:
            match = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
            if match:
                start_s, end_s = match.groups()
                if start_s:
                    start = int(start_s)
                    end = int(end_s) if end_s else size - 1
                elif end_s:
                    length = int(end_s)
                    start = max(0, size - length)
                    end = size - 1
                else:
                    start, end = 0, size - 1

                if start >= size:
                    file.close()
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None

                end = min(end, size - 1)
                if end < start:
                    end = start
                length = end - start + 1
                file.seek(start)
                self._range_remaining = length
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
                self.end_headers()
                return file

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        return file

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_range_remaining", None)
        if remaining is None:
            super().copyfile(source, outputfile)
            return
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.chdir(ROOT)
    with Server(("127.0.0.1", 8866), RangeHandler) as httpd:
        print("Serving on http://127.0.0.1:8866 (Range enabled)")
        httpd.serve_forever()
