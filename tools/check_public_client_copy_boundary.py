#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

# Root HTML files are the client-facing public site. Internal CRM pages live in
# dedicated subdirectories and are intentionally outside this scan.
#
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
    pages = sorted(ROOT.glob('*.html'))
    if not pages:
        raise SystemExit('No root public HTML files found')

    errors: list[str] = []
    for path in pages:
        text = path.read_text(encoding='utf-8')
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern, label in FORBIDDEN:
                if pattern.search(line):
                    errors.append(f'{path.name}:{lineno}: internal term {label!r}: {compact(line)}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(
        f'Client copy and infrastructure boundary is valid for '
        f'{len(pages)} root public HTML files.'
    )


if __name__ == '__main__':
    main()
