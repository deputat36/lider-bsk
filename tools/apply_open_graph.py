#!/usr/bin/env python3
"""Apply or check Open Graph metadata for static public pages.

Usage:
  python3 tools/apply_open_graph.py --check
  python3 tools/apply_open_graph.py --apply

The script is intentionally dependency-free. It works with the current static HTML
structure and is safer than hand-editing long one-line inline CSS pages.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "tools" / "open_graph_pages.json"

OG_TAG_RE = re.compile(
    r"^\s*<meta\s+(?:property|name)=\"(?:og:|twitter:)(?:type|locale|site_name|url|title|description|image|image:type|image:width|image:height|card)\"[^>]*>\s*$",
    re.IGNORECASE,
)


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def load_config() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def build_block(config: dict[str, Any], page: dict[str, str]) -> str:
    image = config["image"]
    image_type = config["image_type"]
    image_width = config["image_width"]
    image_height = config["image_height"]
    site_name = config["site_name"]
    locale = config["locale"]

    lines = [
        '  <!-- Open Graph / social preview -->',
        '  <meta property="og:type" content="website">',
        f'  <meta property="og:locale" content="{esc(locale)}">',
        f'  <meta property="og:site_name" content="{esc(site_name)}">',
        f'  <meta property="og:url" content="{esc(page["url"])}">',
        f'  <meta property="og:title" content="{esc(page["title"])}">',
        f'  <meta property="og:description" content="{esc(page["description"])}">',
        f'  <meta property="og:image" content="{esc(image)}">',
        f'  <meta property="og:image:type" content="{esc(image_type)}">',
        f'  <meta property="og:image:width" content="{esc(image_width)}">',
        f'  <meta property="og:image:height" content="{esc(image_height)}">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{esc(page["title"])}">',
        f'  <meta name="twitter:description" content="{esc(page["description"])}">',
        f'  <meta name="twitter:image" content="{esc(image)}">',
    ]
    return "\n".join(lines)


def remove_old_social_tags(head: str) -> str:
    output: list[str] = []
    for line in head.splitlines():
        stripped = line.strip()
        if stripped == "<!-- Open Graph / social preview -->":
            continue
        if OG_TAG_RE.match(line):
            continue
        output.append(line)
    return "\n".join(output).rstrip() + "\n"


def insert_block(document: str, config: dict[str, Any], page: dict[str, str]) -> str:
    lower = document.lower()
    head_close = lower.find("</head>")
    if head_close < 0:
        raise ValueError(f"{page['path']}: missing </head>")

    head = document[:head_close]
    rest = document[head_close:]
    clean_head = remove_old_social_tags(head)
    block = build_block(config, page)

    stylesheet_match = re.search(r"\n\s*<link\s+rel=\"stylesheet\"", clean_head, re.IGNORECASE)
    style_match = re.search(r"\n\s*<style", clean_head, re.IGNORECASE)
    insertion = stylesheet_match.start() if stylesheet_match else (style_match.start() if style_match else len(clean_head))

    before = clean_head[:insertion].rstrip()
    after = clean_head[insertion:].lstrip("\n")
    return before + "\n" + block + "\n" + after + rest


def validate_page_text(text: str, config: dict[str, Any], page: dict[str, str]) -> list[str]:
    required = {
        f'<meta property="og:url" content="{page["url"]}">': "og:url",
        f'<meta property="og:title" content="{page["title"]}">': "og:title",
        f'<meta property="og:description" content="{page["description"]}">': "og:description",
        f'<meta property="og:image" content="{config["image"]}">': "og:image",
        f'<meta property="og:image:type" content="{config["image_type"]}">': "og:image:type",
        '<meta name="twitter:card" content="summary_large_image">': "twitter:card",
        f'<meta name="twitter:image" content="{config["image"]}">': "twitter:image",
    }
    missing = [label for marker, label in required.items() if marker not in text]
    return missing


def run(apply: bool) -> int:
    config = load_config()
    image_path = ROOT / "assets" / "og-lider-default.png"
    if not image_path.exists():
        raise FileNotFoundError("assets/og-lider-default.png not found")
    png_header = image_path.read_bytes()[:8]
    if png_header != b"\x89PNG\r\n\x1a\n":
        raise ValueError("assets/og-lider-default.png is not a valid PNG")

    changed: list[str] = []
    missing_before: dict[str, list[str]] = {}

    for page in config["pages"]:
        path = ROOT / page["path"]
        if not path.exists():
            raise FileNotFoundError(page["path"])
        original = path.read_text(encoding="utf-8")
        missing = validate_page_text(original, config, page)
        if missing:
            missing_before[page["path"]] = missing

        updated = insert_block(original, config, page)
        if updated != original:
            changed.append(page["path"])
            if apply:
                path.write_text(updated, encoding="utf-8")

    if apply:
        if changed:
            print("Updated Open Graph metadata:")
            for item in changed:
                print(f"- {item}")
        else:
            print("Open Graph metadata is already up to date.")
        return 0

    if missing_before:
        print("Open Graph metadata is not complete yet:")
        for path, missing in missing_before.items():
            print(f"- {path}: {', '.join(missing)}")
        print("Run: python3 tools/apply_open_graph.py --apply")
        return 1

    print("Open Graph metadata is complete for configured pages.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Check configured pages")
    mode.add_argument("--apply", action="store_true", help="Apply configured metadata")
    args = parser.parse_args()
    return run(apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
