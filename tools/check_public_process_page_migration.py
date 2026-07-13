#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'kak-prohodit-zakaz.html'
PAGE_CSS_FILE = ROOT / 'assets' / 'public-order-process.css'
PAGE_JS_FILE = ROOT / 'assets' / 'public-order-process.js'
SITEMAP = ROOT / 'sitemap.xml'

EXPECTED_URL = 'https://www.lider-bsk.ru/kak-prohodit-zakaz.html'
SHARED_CSS = 'assets/public-landing.css?v=1'
FORM_CSS = 'assets/public-lead-form.css?v=4'
PAGE_CSS = 'assets/public-order-process.css?v=1'
FORM_JS = 'assets/public-lead-form.js?v=5'
PAGE_JS = 'assets/public-order-process.js?v=1'
PRESET = 'Страница «Как проходит заказ». Нужна консультация и расчёт рекламной задачи.'


def main() -> None:
    errors: list[str] = []
    page = PAGE.read_text(encoding='utf-8') if PAGE.is_file() else ''
    page_css = PAGE_CSS_FILE.read_text(encoding='utf-8') if PAGE_CSS_FILE.is_file() else ''
    page_js = PAGE_JS_FILE.read_text(encoding='utf-8') if PAGE_JS_FILE.is_file() else ''
    sitemap = SITEMAP.read_text(encoding='utf-8') if SITEMAP.is_file() else ''

    if not page:
        errors.append('Missing kak-prohodit-zakaz.html')
    if not page_css:
        errors.append('Missing assets/public-order-process.css')
    if not page_js:
        errors.append('Missing assets/public-order-process.js')
    if not sitemap:
        errors.append('Missing sitemap.xml')

    if page:
        exact_markers = (
            SHARED_CSS,
            FORM_CSS,
            PAGE_CSS,
            FORM_JS,
            PAGE_JS,
            f'<link rel="canonical" href="{EXPECTED_URL}">',
            f'<meta property="og:url" content="{EXPECTED_URL}">',
            '"@type":"HowTo"',
            'data-leader-lead-form',
            'process-timeline',
            'process-step',
            'process-number',
        )
        for marker in exact_markers:
            if marker not in page:
                errors.append(f'Process page missing marker: {marker}')

        for marker, label in (
            (SHARED_CSS, 'shared public landing CSS'),
            (FORM_CSS, 'public lead form CSS v4'),
            (PAGE_CSS, 'order process CSS v1'),
            (FORM_JS, 'public lead form JS v5'),
            (PAGE_JS, 'order process JS v1'),
        ):
            if page.count(marker) != 1:
                errors.append(f'{label} must be connected exactly once')

        if all(marker in page for marker in (SHARED_CSS, FORM_CSS, PAGE_CSS)):
            if not page.index(SHARED_CSS) < page.index(FORM_CSS) < page.index(PAGE_CSS):
                errors.append('CSS order must be landing, form, then order-process styles')
        if FORM_JS in page and PAGE_JS in page and page.index(FORM_JS) > page.index(PAGE_JS):
            errors.append('Order process JS must load after the shared form JS')

        if page.count('"@type":"HowToStep"') != 8:
            errors.append('HowTo JSON-LD must contain exactly eight steps')
        if re.search(r'<style\b', page, flags=re.IGNORECASE):
            errors.append('Inline style block must not return to the process page')
        if PRESET in page:
            errors.append('Process preset must live in external JS, not inline HTML')

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

    for marker in ('.process-timeline{', '.process-step{', '.process-number{', '.process-note{'):
        if marker not in page_css:
            errors.append(f'Order process CSS missing marker: {marker}')
    for marker in ('DOMContentLoaded', '[data-leader-lead-widget]', '[name="message"]', PRESET):
        if marker not in page_js:
            errors.append(f'Order process JS missing marker: {marker}')

    sitemap_marker = f'<loc>{EXPECTED_URL}</loc><lastmod>2026-07-12</lastmod>'
    if sitemap and sitemap_marker not in sitemap:
        errors.append('Sitemap does not contain the current process-page lastmod')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print('Public process page migration to shared and page-specific external assets is valid.')


if __name__ == '__main__':
    main()
