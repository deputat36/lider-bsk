#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'kak-prohodit-zakaz.html'
SITEMAP = ROOT / 'sitemap.xml'

EXPECTED_URL = 'https://www.lider-bsk.ru/kak-prohodit-zakaz.html'
SHARED_CSS = 'assets/public-landing.css?v=1'
FORM_CSS = 'assets/public-lead-form.css?v=4'
FORM_JS = 'assets/public-lead-form.js?v=5'


def main() -> None:
    errors: list[str] = []
    if not PAGE.is_file():
        errors.append('Missing kak-prohodit-zakaz.html')
        page = ''
    else:
        page = PAGE.read_text(encoding='utf-8')

    sitemap = SITEMAP.read_text(encoding='utf-8') if SITEMAP.is_file() else ''
    if not sitemap:
        errors.append('Missing sitemap.xml')

    if page:
        exact_markers = (
            SHARED_CSS,
            FORM_CSS,
            FORM_JS,
            f'<link rel="canonical" href="{EXPECTED_URL}">',
            f'<meta property="og:url" content="{EXPECTED_URL}">',
            '"@type":"HowTo"',
            'data-leader-lead-form',
            'process-timeline',
            'process-step',
            'process-number',
            'Страница «Как проходит заказ». Нужна консультация и расчёт рекламной задачи.',
        )
        for marker in exact_markers:
            if marker not in page:
                errors.append(f'Process page missing marker: {marker}')

        if page.count(SHARED_CSS) != 1:
            errors.append('Shared public landing CSS must be connected exactly once')
        if page.count(FORM_JS) != 1 or page.count('assets/public-lead-form.js') != 1:
            errors.append('Public lead form v5 must be connected exactly once')
        if page.count('"@type":"HowToStep"') != 8:
            errors.append('HowTo JSON-LD must contain exactly eight steps')
        for stale in (
            'assets/public-lead-form.js?v=10',
            'assets/public-lead-form.css?v=10',
            ':root{--text:',
            '*{box-sizing:border-box}html{scroll-behavior:smooth}body{',
        ):
            if stale in page:
                errors.append(f'Stale pre-migration marker remains: {stale}')
        for forbidden in ('/crm/', '/nav/', 'nav-v2', 'service_role', 'sb_secret_'):
            if forbidden in page:
                errors.append(f'Forbidden contour/security marker: {forbidden}')

    sitemap_marker = f'<loc>{EXPECTED_URL}</loc><lastmod>2026-07-12</lastmod>'
    if sitemap and sitemap_marker not in sitemap:
        errors.append('Sitemap does not contain the current process-page lastmod')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print('Public process page migration to shared CSS and lead-form v5 is valid.')


if __name__ == '__main__':
    main()
