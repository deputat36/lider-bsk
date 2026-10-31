"""Keep the customer-facing header static and shared across public pages."""
from html import escape
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START = '<!-- public-navigation:start -->'
END = '<!-- public-navigation:end -->'
CSS = '<link rel="stylesheet" href="assets/public-site-navigation.css?v=1">'
SCRIPT = '<script src="assets/packages-link.js?v=2"></script>'
LINKS = (
    ('uslugi.html', 'Услуги'),
    ('reklama-dlya-biznesa.html', 'Решения'),
    ('nashi-raboty.html', 'Работы'),
    ('prices.html', 'Цены'),
    ('kontakty.html', 'Контакты'),
)


def navigation(page_name, request_href):
    links = ''.join(
        f'<a href="{href}"' + (' aria-current="page"' if href == page_name else '')
        + f'>{label}</a>' for href, label in LINKS
    )
    return f'''{START}
<header class="header leader-site-header"><div class="leader-header-inner">
<a class="brand" href="index.html" aria-label="РА Лидер — на главную"><img class="brand-logo" src="assets/brand/logo-lider-header.svg?v=4" width="108" height="98.4" alt="Лидер — рекламное агентство"></a>
<div class="header__cta leader-header-actions"><a class="phone" href="tel:+79802457471">8 980 245-74-71</a><a class="btn btn--accent" href="{escape(request_href, quote=True)}">Рассчитать заказ</a><button class="menu-btn" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="main-navigation"><svg class="leader-icon" width="24" height="24" aria-hidden="true" focusable="false"><use href="assets/brand/leader-icons.svg#icon-menu"></use></svg></button></div>
<nav class="nav" id="main-navigation" aria-label="Основная навигация">{links}</nav>
</div></header>
{END}'''


def apply_navigation(text, page_name):
    request_href = '#request' if re.search(r'\bid=["\']request["\']', text) else 'request.html'
    header = navigation(page_name, request_href)
    marked = re.compile(re.escape(START) + r'.*?' + re.escape(END), re.S)
    legacy = re.compile(r'<header\b[^>]*class="header"[^>]*>.*?</header>', re.S)
    if marked.search(text):
        text = marked.sub(lambda _: header, text, count=1)
    elif legacy.search(text):
        text = legacy.sub(lambda _: header, text, count=1)
    else:
        text = re.sub(r'(<body\b[^>]*>)', lambda m: m.group(1) + '\n' + header, text, count=1)
    if CSS not in text:
        shared = '<link rel="stylesheet" href="assets/public-product-system.css?v=1">'
        if shared in text:
            text = text.replace(shared, CSS + '\n' + shared, 1)
        else:
            text = text.replace('</head>', CSS + '\n</head>', 1)
    # Legacy templates used both deferred and regular script tags.
    text = re.sub(r'<script\b[^>]*src="assets/packages-link\.js\?v=2"[^>]*>\s*</script>\s*', '', text)
    text = text.replace('</body>', SCRIPT + '\n</body>', 1)
    return text


def public_pages():
    for node in ET.parse(ROOT / 'sitemap.xml').findall('{*}url/{*}loc'):
        yield ROOT / (node.text.rsplit('/', 1)[-1] or 'index.html')


if __name__ == '__main__':
    import sys
    changed = []
    for page in public_pages():
        text = page.read_text()
        updated = apply_navigation(text, page.name)
        if text != updated:
            changed.append(page.name)
            if '--check' not in sys.argv:
                page.write_text(updated)
    if '--check' in sys.argv and changed:
        raise SystemExit('Shared navigation differs: ' + ', '.join(changed))
    print(f'Shared navigation {"verified" if "--check" in sys.argv else "updated"} on {len(list(public_pages()))} pages')
