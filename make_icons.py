#!/usr/bin/env python3
"""Генерує PNG-іконки для PWA без сторонніх бібліотек (тільки stdlib).

Малює простий «маскот» (мордочка з вушками) у фірмових кольорах магазину.
Запуск:  python3 make_icons.py
"""
import struct
import zlib

# Фірмові кольори (з :root у index.html)
BG = (200, 80, 26)      # --accent  #C8501A
FACE = (253, 248, 243)  # --bg      #FDF8F3
INK = (28, 18, 9)       # --ink     #1C1209


def write_png(path, size):
    cx = cy = size / 2
    # геометрія мордочки
    face_r = size * 0.30
    ear_r = size * 0.13
    ear_off = size * 0.26
    ears = [(cx - ear_off, cy - ear_off), (cx + ear_off, cy - ear_off)]
    eye_r = size * 0.035
    eyes = [(cx - face_r * 0.4, cy - face_r * 0.15),
            (cx + face_r * 0.4, cy - face_r * 0.15)]

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 для кожного рядка
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            color = BG
            # вушка
            for ex, ey in ears:
                if (px - ex) ** 2 + (py - ey) ** 2 <= ear_r ** 2:
                    color = FACE
            # мордочка
            if (px - cx) ** 2 + (py - cy) ** 2 <= face_r ** 2:
                color = FACE
            # очі
            for ex, ey in eyes:
                if (px - ex) ** 2 + (py - ey) ** 2 <= eye_r ** 2:
                    color = INK
            # носик
            if (px - cx) ** 2 + (py - (cy + face_r * 0.18)) ** 2 <= (size * 0.03) ** 2:
                color = INK
            raw += bytes(color)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit, truecolor RGB
    idat = zlib.compress(bytes(raw), 9)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"  → {path} ({size}×{size})")


if __name__ == "__main__":
    print("Генерую іконки…")
    write_png("icon-192.png", 192)
    write_png("icon-512.png", 512)
    write_png("apple-touch-icon.png", 180)
    print("Готово.")
