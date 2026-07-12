#!/usr/bin/env python3
from __future__ import annotations

import ast
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE_CHECK = ROOT / 'tools/check_public_lead_form_cache_v5_partial.py'
SITEMAP = ROOT / 'sitemap.xml'
BASE_URL = 'https://www.lider-bsk.ru/'
V5_SCRIPT = 'assets/public-lead-form.js?v=5'
FORBIDDEN_MARKERS = (
    '/crm/',
    '/nav/',
    '/nav-v2/',
    '/nav_v2/',
    'nav-v2-deal-api',
    'service_role',
    'sb_secret_',
)


def load_v5_pages() -> tuple[str, ...]:
    tree = ast.parse(CACHE_CHECK.read_text(encoding='utf-8'), filename=str(CACHE_CHECK))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == 'V5_PAGES':
                    value = ast.literal_eval(node.value)
                    if not isinstance(value, tuple) or not all(isinstance(item, str) for item in value):
                        raise SystemExit('V5_PAGES must be a tuple of page names')
                    return value
    raise SystemExit('V5_PAGES not found in cache coverage checker')


class PageContractParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lang = ''
        self.title_count = 0
        self.title_parts: list[str] = []
        self.in_title = False
        self.descriptions: list[str] = []
        self.robots: list[str] = []
        self.canonicals: list[str] = []
        self.og_urls: list[str] = []
        self.h1_count = 0
        self.form_mount_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key.lower(): (value or '') for key, value in attrs}
        tag = tag.lower()
        if tag == 'html':
            self.lang = data.get('lang', '').lower()
        elif tag == 'title':
            self.title_count += 1
            self.in_title = True
        elif tag == 'meta':
            name = data.get('name', '').lower()
            prop = data.get('property', '').lower()
            content = data.get('content', '').strip()
            if name == 'description':
                self.descriptions.append(content)
            elif name == 'robots':
                self.robots.append(content.lower())
            elif prop == 'og:url':
                self.og_urls.append(content)
        elif tag == 'link' and 'canonical' in data.get('rel', '').lower().split():
            self.canonicals.append(data.get('href', '').strip())
        elif tag == 'h1':
            self.h1_count += 1

        if data.get('id') == 'leader-lead-form' or 'data-leader-lead-form' in data:
            self.form_mount_count += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == 'title':
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)

    @property
    def title(self) -> str:
        return ' '.join(''.join(self.title_parts).split())


def main() -> None:
    pages = load_v5_pages()
    sitemap = SITEMAP.read_text(encoding='utf-8')
    errors: list[str] = []

    for name in pages:
        path = ROOT / name
        if not path.is_file():
            errors.append(f'{name}: file is missing')
            continue

        text = path.read_text(encoding='utf-8')
        parser = PageContractParser()
        parser.feed(text)
        expected_url = BASE_URL if name == 'index.html' else BASE_URL + name

        if parser.lang != 'ru':
            errors.append(f'{name}: html lang must be ru')
        if parser.title_count != 1 or not parser.title:
            errors.append(f'{name}: exactly one non-empty title is required')
        if len(parser.descriptions) != 1 or len(parser.descriptions[0]) < 50:
            errors.append(f'{name}: exactly one useful meta description is required')
        if len(parser.robots) > 1:
            errors.append(f'{name}: at most one robots meta tag is allowed')
        elif parser.robots:
            directives = {item.strip() for item in parser.robots[0].split(',')}
            if directives.intersection({'noindex', 'nofollow', 'none'}):
                errors.append(f'{name}: robots directives must not block indexing or links')
        if parser.canonicals != [expected_url]:
            errors.append(f'{name}: canonical must equal {expected_url}')
        if parser.og_urls != [expected_url]:
            errors.append(f'{name}: og:url must equal canonical')
        if parser.h1_count != 1:
            errors.append(f'{name}: exactly one h1 is required')
        if parser.form_mount_count != 1:
            errors.append(f'{name}: exactly one public lead form mount is required')
        if text.count(V5_SCRIPT) != 1:
            errors.append(f'{name}: exactly one {V5_SCRIPT} reference is required')
        if sitemap.count(f'<loc>{expected_url}</loc>') != 1:
            errors.append(f'{name}: sitemap must contain canonical exactly once')

        for marker in FORBIDDEN_MARKERS:
            if marker in text:
                errors.append(f'{name}: forbidden contour/security marker {marker!r}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(f'Public v5 landing SEO and contour contract is valid for {len(pages)} pages.')


if __name__ == '__main__':
    main()
