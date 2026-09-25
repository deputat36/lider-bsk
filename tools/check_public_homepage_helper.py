"""Homepage content is static; the legacy-named helper only owns menu state."""
from pathlib import Path
from html.parser import HTMLParser

root = Path(__file__).resolve().parents[1]
page = (root / 'index.html').read_text()
helper = (root / 'assets/packages-link.js').read_text()

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids = []; self.links = []; self.menu = []; self.logo = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'): self.ids.append(a['id'])
        if tag == 'a': self.links.append(a.get('href'))
        if tag == 'button' and 'menu-btn' in a.get('class', '').split(): self.menu.append(a)
        if tag == 'img' and 'brand-logo' in a.get('class', '').split(): self.logo.append(a)
p = Parser(); p.feed(page)
assert len(p.ids) == len(set(p.ids)), 'Duplicate homepage IDs'
assert len(p.menu) == 1 and p.menu[0].get('aria-expanded') == 'false'
assert p.menu[0].get('aria-controls') in p.ids
assert len(p.logo) == 1 and p.logo[0]['src'] == 'assets/brand/logo-lider-header.svg?v=3'
for target in ['prices.html', 'primery-rabot-kejsy.html', 'srochnaya-reklama-borisoglebsk.html', 'chto-nuzhno-dlya-rascheta.html']:
    assert target in p.links, f'Missing static commercial route: {target}'
assert 'service-pages' in p.ids
for marker in ['setTimeout', 'innerHTML', 'createElement', '.onclick', '.textContent', 'insertAdjacentElement']:
    assert marker not in helper, f'Delayed or destructive content patch returned: {marker}'
for marker in ['aria-expanded', 'aria-label', "event.key === 'Escape'", 'button.focus()', "mobile.addEventListener('change'", "header.addEventListener('focusout'"]:
    assert marker in helper, f'Missing menu behavior: {marker}'
assert page.count('assets/packages-link.js?v=2') == 1
assert page.count('assets/public-lead-form.js?v=30') == 1
print('Static homepage content and accessible navigation contract: PASS')
