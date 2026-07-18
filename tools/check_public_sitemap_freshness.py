#!/usr/bin/env python3
from datetime import date
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SITEMAP = ROOT / 'sitemap.xml'
ORIGIN = 'https://www.lider-bsk.ru/'
PRIORITY_LASTMOD = date(2026, 7, 18)
PRIORITY_PAGES = {
    'bannery-borisoglebsk.html',
    'pechat-bannerov-borisoglebsk.html',
    'vyveski-borisoglebsk.html',
    'tablichki-borisoglebsk.html',
    'nakleyki-plotternaya-rezka-borisoglebsk.html',
    'pechat-na-plenke-borisoglebsk.html',
    'reklama-dlya-magazina-borisoglebsk.html',
}


def main() -> None:
    errors: list[str] = []
    namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    tree = ET.parse(SITEMAP)
    entries: dict[str, date] = {}

    for node in tree.getroot().findall('sm:url', namespace):
        location = node.findtext('sm:loc', default='', namespaces=namespace).strip()
        raw_lastmod = node.findtext('sm:lastmod', default='', namespaces=namespace).strip()
        if not location.startswith(ORIGIN):
            errors.append(f'Non-canonical sitemap URL: {location or "<empty>"}')
            continue
        path = location.removeprefix(ORIGIN)
        try:
            lastmod = date.fromisoformat(raw_lastmod)
        except ValueError:
            errors.append(f'{location}: invalid lastmod {raw_lastmod!r}')
            continue
        if lastmod > date.today():
            errors.append(f'{location}: lastmod cannot be in the future: {lastmod}')
        entries[path] = lastmod

    for page in sorted(PRIORITY_PAGES):
        if not (ROOT / page).is_file():
            errors.append(f'Missing priority public page: {page}')
        actual = entries.get(page)
        if actual != PRIORITY_LASTMOD:
            errors.append(
                f'{page}: expected truthful lastmod {PRIORITY_LASTMOD}, found {actual}'
            )

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(
        f'Public sitemap freshness is valid: {len(entries)} canonical URLs and '
        f'{len(PRIORITY_PAGES)} priority pages updated on {PRIORITY_LASTMOD}.'
    )


if __name__ == '__main__':
    main()
