#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'assets' / 'public-landing.css'
text = path.read_text(encoding='utf-8') if path.exists() else ''
markers = [
    '--leader-orange:#ff6a00',
    '.container,.wrap',
    '.hero-grid,.hero__grid,.cta',
    '.grid3',
    '.grid2',
    '@media(max-width:920px)',
    '@media(max-width:560px)',
    'Do not use it for CRM or nav contours',
]
missing = [marker for marker in markers if marker not in text]
if missing:
    print('Missing public landing CSS markers: ' + ', '.join(missing))
    sys.exit(1)
print('Public landing CSS foundation is valid.')
