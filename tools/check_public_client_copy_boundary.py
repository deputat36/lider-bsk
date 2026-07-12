#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

# Root HTML files are the client-facing public site. Internal CRM pages live in
# dedicated subdirectories and are intentionally outside this scan.
FORBIDDEN = (
    (re.compile(r'\bcrm\b', re.IGNORECASE), 'CRM'),
    (re.compile(r'себестоим', re.IGNORECASE), 'себестоимость'),
    (re.compile(r'марж', re.IGNORECASE), 'маржа'),
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

    print(f'Client copy boundary is valid for {len(pages)} root public HTML files.')


if __name__ == '__main__':
    main()
