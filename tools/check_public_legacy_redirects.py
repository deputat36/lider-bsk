#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SITEMAP = ROOT / 'sitemap.xml'
BASE_URL = 'https://www.lider-bsk.ru/'

REDIRECTS = {
    'banner/index.html': 'bannery-borisoglebsk.html',
    'signs/index.html': 'tablichki-borisoglebsk.html',
    'auto-stickers/index.html': 'nakleyki-plotternaya-rezka-borisoglebsk.html',
}

FORBIDDEN_MARKERS = (
    '/crm/',
    '/nav/',
    '/nav-v2/',
    '/nav_v2/',
    'service_role',
    'sb_secret_',
    'assets/public-lead-form.js',
)


class RedirectParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.robots: list[str] = []
        self.canonicals: list[str] = []
        self.refreshes: list[str] = []
        self.links: list[str] = []
        self.h1_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key.lower(): (value or '') for key, value in attrs}
        tag = tag.lower()
        if tag == 'meta':
            name = data.get('name', '').lower()
            equiv = data.get('http-equiv', '').lower()
            content = data.get('content', '').strip()
            if name == 'robots':
                self.robots.append(content.lower())
            elif equiv == 'refresh':
                self.refreshes.append(content)
        elif tag == 'link' and 'canonical' in data.get('rel', '').lower().split():
            self.canonicals.append(data.get('href', '').strip())
        elif tag == 'a':
            self.links.append(data.get('href', '').strip())
        elif tag == 'h1':
            self.h1_count += 1


def main() -> None:
    sitemap = SITEMAP.read_text(encoding='utf-8')
    errors: list[str] = []

    for source_name, target_name in REDIRECTS.items():
        source = ROOT / source_name
        target = ROOT / target_name
        legacy_url = BASE_URL + source_name.removesuffix('index.html')
        target_url = BASE_URL + target_name
        target_path = '/' + target_name

        if not source.is_file():
            errors.append(f'{source_name}: redirect page is missing')
            continue
        if not target.is_file():
            errors.append(f'{source_name}: target page {target_name} is missing')
            continue

        text = source.read_text(encoding='utf-8')
        target_text = target.read_text(encoding='utf-8')
        parser = RedirectParser()
        parser.feed(text)

        if parser.robots != ['noindex, follow']:
            errors.append(f'{source_name}: robots must be exactly noindex, follow')
        if parser.canonicals != [target_url]:
            errors.append(f'{source_name}: canonical must equal {target_url}')
        if parser.refreshes != [f'0; url={target_path}']:
            errors.append(f'{source_name}: meta refresh must point to {target_path}')
        if parser.links.count(target_path) != 1:
            errors.append(f'{source_name}: fallback link must point to {target_path} exactly once')
        if f"window.location.replace('{target_path}')" not in text:
            errors.append(f'{source_name}: JavaScript redirect must use location.replace')
        if parser.h1_count != 1:
            errors.append(f'{source_name}: exactly one h1 is required')
        if f'rel="canonical" href="{target_url}"' not in target_text:
            errors.append(f'{target_name}: target canonical is missing or incorrect')
        if legacy_url in sitemap or f'<loc>{legacy_url}</loc>' in sitemap:
            errors.append(f'{source_name}: legacy URL must not be listed in sitemap')

        for marker in FORBIDDEN_MARKERS:
            if marker in text:
                errors.append(f'{source_name}: forbidden marker {marker!r}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(f'Public legacy URL compatibility is valid for {len(REDIRECTS)} paths.')


if __name__ == '__main__':
    main()
