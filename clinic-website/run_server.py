#!/usr/bin/env python3

import http.server
import socketserver
import os
import sys

PORT = 3000

# Change to the directory containing index.html
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving clinic website at http://localhost:{PORT}")
    print("Press CTRL+C to stop the server")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)