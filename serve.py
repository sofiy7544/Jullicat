#!/usr/bin/env python3
"""Локальний сервер для перегляду магазину на iPhone (і будь-якому пристрої) у тій самій Wi-Fi.

Чому потрібен сервер, а не просто файл:
  Service worker і «встановлення на екран Домому» працюють лише по http(s),
  тому відкривати треба за адресою на кшталт http://192.168.x.x:8000, а не file://

Запуск:
  python3 serve.py            # порт 8000
  python3 serve.py 5050       # свій порт

Потім на iPhone (та сама мережа Wi-Fi) відкрийте надруковану адресу в Safari.
Зупинити сервер: Ctrl+C
"""
import http.server
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


def lan_ip():
    """Визначає локальну IP-адресу комп'ютера в мережі Wi-Fi."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # реальне з'єднання не відкривається
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # тихий лог


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    ip = lan_ip()
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print("\n  🧸  Jellycat Ukraine — локальний сервер запущено\n")
        print(f"  На цьому комп'ютері:  http://localhost:{PORT}")
        print(f"  На iPhone (та сама Wi-Fi):  http://{ip}:{PORT}\n")
        print("  Відкрийте адресу для iPhone у Safari, потім «Поділитися» →")
        print("  «На екран Домому», щоб користуватись як застосунком (працює офлайн).\n")
        print("  Зупинити: Ctrl+C\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Сервер зупинено. Бувай! 👋\n")
