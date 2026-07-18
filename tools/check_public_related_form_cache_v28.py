#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
FORM_SCRIPT = ROOT / 'assets' / 'public-lead-form.js'
SITEMAP = ROOT / 'sitemap.xml'
EXPECTED_SCRIPT = 'assets/public-lead-form.js?v=28'
EXPECTED_LASTMOD = '2026-07-18'
PAGES = {
    'banner-dlya-magazina-borisoglebsk.html': "'banner-dlya-magazina-borisoglebsk.html':{service:'Баннер'",
    'oformlenie-vhoda-borisoglebsk.html': "'oformlenie-vhoda-borisoglebsk.html':{service:'Вывеска / наружная реклама'",
    'nakleyki-na-vitrinu-borisoglebsk.html': "'nakleyki-na-vitrinu-borisoglebsk.html':{service:'Наклейки'",
    'rezhim-raboty-tablichki-borisoglebsk.html': "'rezhim-raboty-tablichki-borisoglebsk.html':{service:'Табличка'",
    'outdoor-advertising-borisoglebsk.html': "'outdoor-advertising-borisoglebsk.html':{service:'Вывеска / наружная реклама'",
    'reklama-otkrytiya-magazina-borisoglebsk.html': "'reklama-otkrytiya-magazina-borisoglebsk.html':{service:'Комплексная реклама'",
}


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.form_sources: list[str] = []
        self.form_mounts = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'script' and 'assets/public-lead-form.js' in (values.get('src') or ''):
            self.form_sources.append(values.get('src') or '')
        if values.get('id') == 'leader-lead-form':
            self.form_mounts += 1


def main() -> None:
    errors: list[str] = []
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    sitemap_root = ET.parse(SITEMAP).getroot()
    namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    sitemap_entries = {
        node.findtext('sm:loc', default='', namespaces=namespace):
        node.findtext('sm:lastmod', default='', namespaces=namespace)
        for node in sitemap_root.findall('sm:url', namespace)
    }

    for marker in (
        'request_id',
        'stableRequestId',
        'page_path',
        'submitted_at',
        'utm_source',
        'consent_version',
        'leader_public_lead_pending_v1',
    ):
        if marker not in form_script:
            errors.append(f'assets/public-lead-form.js: missing current payload marker {marker}')

    for page_name, preset in PAGES.items():
        page = ROOT / page_name
        if not page.is_file():
            errors.append(f'Missing related commercial page: {page_name}')
            continue

        parser = PageParser()
        parser.feed(page.read_text(encoding='utf-8'))
        if parser.form_sources != [EXPECTED_SCRIPT]:
            errors.append(
                f'{page_name}: expected only {EXPECTED_SCRIPT}, found {parser.form_sources}'
            )
        if parser.form_mounts != 1:
            errors.append(f'{page_name}: expected one public form mount, found {parser.form_mounts}')
        if preset not in form_script:
            errors.append(f'assets/public-lead-form.js: missing preset for {page_name}')

        url = f'https://www.lider-bsk.ru/{page_name}'
        if sitemap_entries.get(url) != EXPECTED_LASTMOD:
            errors.append(f'{page_name}: sitemap lastmod must equal {EXPECTED_LASTMOD}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(
        f'Related commercial form cache is valid: {len(PAGES)} pages on v28 '
        f'with sitemap lastmod {EXPECTED_LASTMOD}.'
    )


if __name__ == '__main__':
    main()
