#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

# Most root HTML files are client-facing public pages. A small explicit set of
# internal visual review pages also lives at repository root for manual QA.
# Those pages may contain implementation vocabulary, but they are excluded only
# when they retain an explicit noindex,nofollow contract.
INTERNAL_ROOT_PAGES = {
    'brand-system-review.html',
    'logo-review.html',
}

# Keep this list focused on language and identifiers that reveal internal
# operations or infrastructure. Generic commercial terms such as "API" or
# "интеграция" are intentionally not forbidden because they may describe a
# legitimate customer-facing service.
FORBIDDEN = (
    (re.compile(r'\bcrm\b', re.IGNORECASE), 'CRM'),
    (re.compile(r'себестоим', re.IGNORECASE), 'себестоимость'),
    (re.compile(r'марж', re.IGNORECASE), 'маржа'),
    (re.compile(r'рабоч(?:ий|его|ему|им|ем)\s+контур', re.IGNORECASE), 'рабочий контур'),
    (re.compile(r'\bsupabase\b', re.IGNORECASE), 'Supabase'),
    (re.compile(r'\bedge\s+functions?\b', re.IGNORECASE), 'Edge Function'),
    (re.compile(r'\brequest[_-]?id\b', re.IGNORECASE), 'request_id'),
    (re.compile(r'\bleader-public-lead\b', re.IGNORECASE), 'leader-public-lead'),
    (re.compile(r'\bofewxuqfjhamgerwzull\b', re.IGNORECASE), 'Supabase project ref'),
    (re.compile(r'\bleader_(?:leads|public_lead_audit)\b', re.IGNORECASE), 'internal database table'),
    (re.compile(r'\b(?:source_page_path|submitted_at|phone_normalized)\b', re.IGNORECASE), 'internal data field'),
    (re.compile(r'\b(?:service[_ -]?role|anon(?:ymous)?[_ -]?key)\b', re.IGNORECASE), 'credential terminology'),
    (re.compile(r'\brow[- ]level\s+security\b|\brls\b', re.IGNORECASE), 'RLS'),
    (re.compile(r'\bapi\s+endpoint\b', re.IGNORECASE), 'API endpoint'),
)


def compact(line: str, limit: int = 180) -> str:
    value = ' '.join(line.split())
    return value if len(value) <= limit else value[: limit - 1] + '…'


def main() -> None:
    root_pages = sorted(ROOT.glob('*.html'))
    if not root_pages:
        raise SystemExit('No root HTML files found')

    errors: list[str] = []
    public_pages: list[Path] = []

    for path in root_pages:
        text = path.read_text(encoding='utf-8')
        if path.name in INTERNAL_ROOT_PAGES:
            if '<meta name="robots" content="noindex,nofollow">' not in text:
                errors.append(
                    f'{path.name}: internal review page lost required noindex,nofollow boundary'
                )
            continue
        public_pages.append(path)
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern, label in FORBIDDEN:
                if pattern.search(line):
                    errors.append(f'{path.name}:{lineno}: internal term {label!r}: {compact(line)}')

    missing_review_pages = sorted(name for name in INTERNAL_ROOT_PAGES if not (ROOT / name).is_file())
    for name in missing_review_pages:
        errors.append(f'internal review page allowlist references missing file: {name}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(
        f'Client copy and infrastructure boundary is valid for '
        f'{len(public_pages)} public root HTML files; '
        f'{len(INTERNAL_ROOT_PAGES)} noindex review pages validated separately.'
    )


if __name__ == '__main__':
    main()
