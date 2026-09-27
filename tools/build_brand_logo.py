#!/usr/bin/env python3
"""Package the owner's bitmap in SVG. No paths, tracing or retyped wordmark.

The source is immutable. The SVG viewport removes empty outer margins and a
blue-channel alpha mask hides the baked-in pale checkerboard at render time.
Orange and black artwork retain their RGB values; no generated artwork is used.
The 640px WebP is a web-size encoding (quality 92) of the archived original PNG.
"""
import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/brand/source/logo-lider-owner-black-20260717.png'
WEB = ROOT / 'assets/brand/source/logo-lider-owner-web-640.webp'


def main():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    image = base64.b64encode(WEB.read_bytes()).decode('ascii')
    for name, viewport, width, height in (
        ('logo-lider-header.svg', '200 175 900 820', 108, 98.4),
        ('logo-lider-mark.svg', '330 175 620 525', 62, 52.5),
        ('logo-lider-light.svg', '200 175 900 820', 108, 98.4),
    ):
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{viewport}" role="img" aria-labelledby="title" data-source-sha256="{digest}">
  <title id="title">Лидер — рекламное агентство</title>
  <desc>Оригинал владельца от 17.07.2026. Растровый знак и надпись сохранены. Использовать на светлом фоне.</desc>
  <defs><filter id="background-key" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 -4 0 3.4"/></filter></defs>
  <image width="1254" height="1254" filter="url(#background-key)" href="data:image/webp;base64,{image}"/>
</svg>
'''
        (ROOT / 'assets/brand' / name).write_text(svg)
    print(f'Owner logo packaged; PNG sha256={digest}; WebP={WEB.stat().st_size} bytes')


if __name__ == '__main__':
    main()
