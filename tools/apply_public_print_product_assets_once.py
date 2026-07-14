#!/usr/bin/env python3
from pathlib import Path
from html import escape
import re

ROOT = Path(__file__).resolve().parents[1]
CSS_LINK = '<link rel="stylesheet" href="assets/public-print-product.css?v=1">'
PRESET_SCRIPT = '<script src="assets/public-print-product.js?v=1"></script>'
PAGES = {
    'blanki-borisoglebsk.html': 'Страница: бланки и фирменные документы. Нужно рассчитать бланк, фирменный лист, прайс, анкету, коммерческое предложение или другой документ. Нужно уточнить формат, содержание, тираж, срок и нужен ли дизайн.',
    'buklety-borisoglebsk.html': 'Страница: буклеты и брошюры. Нужно рассчитать буклет, брошюру, мини-каталог, меню или презентационный материал. Нужно уточнить формат, количество страниц, тираж, бумагу, срок и нужен ли дизайн.',
    'gramoty-borisoglebsk.html': 'Страница: грамоты, дипломы и сертификаты. Нужно рассчитать грамоты, дипломы, сертификаты или благодарственные письма. Нужно уточнить формат, количество, бумагу, список имён, номинации, срок и нужен ли дизайн.',
    'menyu-dlya-kafe-borisoglebsk.html': 'Страница: меню для кафе и бара. Нужно рассчитать дизайн и печать меню, вкладышей, акционных листов или материалов для общепита. Нужно уточнить формат, количество страниц, тираж, бумагу, ламинацию, срок и нужен ли дизайн.',
    'otkrytki-priglasheniya-borisoglebsk.html': 'Страница: открытки и приглашения. Нужно рассчитать открытки, приглашения, подарочные сертификаты или карточки для мероприятия. Нужно уточнить формат, тираж, бумагу, текст, персонализацию, срок и нужен ли дизайн.',
    'kalendari-borisoglebsk.html': 'Страница: календари. Нужно рассчитать календарь, планер или настольный печатный материал. Нужно уточнить формат, тираж, бумагу, срок и нужен ли дизайн.',
    'birki-etiketki-borisoglebsk.html': 'Страница: бирки и этикетки. Нужно рассчитать бирки, этикетки, карточки товара или вкладыши. Нужно уточнить размер, тираж, материал, текст, срок и нужен ли дизайн.',
    'papki-konverty-borisoglebsk.html': 'Страница: папки и конверты. Нужно рассчитать фирменные папки, конверты, обложки или деловой комплект. Нужно уточнить формат, тираж, бумагу, срок и нужен ли дизайн.',
}
CSS_MARKERS = (
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6}',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}',
    '.cta{background:#111827;color:#fff;border-radius:28px',
    '@media(max-width:900px){.grid,.cta{grid-template-columns:1fr}}',
)
INLINE_SCRIPT_RE = re.compile(
    r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>(.*?)</script>',
    flags=re.I | re.S,
)
MESSAGE_RE = re.compile(r"if\(msg&&!msg\.value\)msg\.value='([^']*)';")

changed = []
for page_name, expected_message in PAGES.items():
    path = ROOT / page_name
    html = path.read_text(encoding='utf-8')
    if html.lower().count('<!doctype html>') != 1:
        raise SystemExit(f'{page_name}: expected one doctype')

    if CSS_LINK not in html:
        style_matches = list(re.finditer(r'<style>\s*(.*?)\s*</style>', html, flags=re.I | re.S))
        if len(style_matches) != 1:
            raise SystemExit(f'{page_name}: expected one inline style block, found {len(style_matches)}')
        inline_css = re.sub(r'\s+', '', style_matches[0].group(1))
        for marker in CSS_MARKERS:
            if re.sub(r'\s+', '', marker) not in inline_css:
                raise SystemExit(f'{page_name}: missing expected CSS marker {marker}')
        indent_match = re.search(r'(^[ \t]*)<style>', html, flags=re.I | re.M)
        indent = indent_match.group(1) if indent_match else ''
        match = style_matches[0]
        html = html[:match.start()] + indent + CSS_LINK + html[match.end():]

    body_marker = (
        '<body class="page-print-product" data-lead-service="Полиграфия" '
        f'data-lead-message="{escape(expected_message, quote=True)}">'
    )
    if body_marker not in html:
        if html.count('<body>') != 1:
            raise SystemExit(f'{page_name}: expected one plain body tag')
        html = html.replace('<body>', body_marker, 1)

    if PRESET_SCRIPT not in html:
        scripts = list(INLINE_SCRIPT_RE.finditer(html))
        if len(scripts) != 1:
            raise SystemExit(f'{page_name}: expected one inline preset script, found {len(scripts)}')
        script_body = scripts[0].group(1)
        for marker in (
            "document.querySelector('[data-leader-lead-widget]')",
            "form.querySelector('[name=\"service\"]')",
            "form.querySelector('[name=\"message\"]')",
            "value==='Полиграфия'",
            "new Option('Полиграфия','Полиграфия')",
        ):
            if marker not in script_body:
                raise SystemExit(f'{page_name}: unexpected preset script; missing {marker}')
        message_match = MESSAGE_RE.search(script_body)
        if not message_match or message_match.group(1) != expected_message:
            actual = message_match.group(1) if message_match else None
            raise SystemExit(f'{page_name}: preset message mismatch: {actual!r}')
        match = scripts[0]
        html = html[:match.start()] + PRESET_SCRIPT + html[match.end():]

    if html.lower().count('<!doctype html>') != 1:
        raise SystemExit(f'{page_name}: migration changed doctype count')
    if html.count(CSS_LINK) != 1 or html.count(PRESET_SCRIPT) != 1:
        raise SystemExit(f'{page_name}: shared asset link count mismatch')
    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style remained')
    if INLINE_SCRIPT_RE.search(html):
        raise SystemExit(f'{page_name}: executable inline script remained')

    original = path.read_text(encoding='utf-8')
    if html != original:
        path.write_text(html, encoding='utf-8')
        changed.append(page_name)

print('Updated pages:', ', '.join(changed) if changed else 'none')
