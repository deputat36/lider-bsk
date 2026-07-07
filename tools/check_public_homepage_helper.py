from pathlib import Path

path = Path('assets/packages-link.js')
text = path.read_text(encoding='utf-8')

required = [
    'leader-ui-fix-v10',
    'function mobile()',
    "h.classList.toggle('open')",
    "if(e.target&&e.target.tagName==='A')close()",
    'function cleanHero',
    'hero-checklist-link',
    'function popular()',
    'leader-extra-links',
    'nav-cases-link',
    'nav-urgent-link',
    'nav-prices-link',
]

missing = [item for item in required if item not in text]
if missing:
    raise SystemExit('Missing homepage helper markers: ' + ', '.join(missing))

if 'nav-communities-link' not in text or 'contacts-communities-link' not in text:
    raise SystemExit('Old dynamic link cleanup markers are missing')

print('Homepage helper UI contract is OK')
