#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MIN_VERSION = 5


class ScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.form_sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != 'script':
            return
        values = dict(attrs)
        src = values.get('src') or ''
        if 'assets/public-lead-form.js' in src:
            self.form_sources.append(src)


def main() -> None:
    errors: list[str] = []
    pages: list[tuple[str, int]] = []

    for path in sorted(ROOT.glob('*.html')):
        parser = ScriptParser()
        parser.feed(path.read_text(encoding='utf-8'))
        if not parser.form_sources:
            continue
        if len(parser.form_sources) != 1:
            errors.append(f'{path.name}: expected one public form script, found {len(parser.form_sources)}')
            continue

        src = parser.form_sources[0]
        prefix = 'assets/public-lead-form.js?v='
        if not src.startswith(prefix):
            errors.append(f'{path.name}: cache marker is missing or malformed: {src}')
            continue
        raw_version = src[len(prefix):]
        if not raw_version.isdigit():
            errors.append(f'{path.name}: cache version must be numeric: {src}')
            continue
        version = int(raw_version)
        pages.append((path.name, version))
        if version < MIN_VERSION:
            errors.append(f'{path.name}: stale cache version v={version}; minimum is v={MIN_VERSION}')

    if not pages:
        errors.append('No public HTML pages reference the shared lead form')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    versions = sorted({version for _, version in pages})
    print(
        f'Validated {len(pages)} public form pages; '
        f'cache versions in use: {", ".join("v=" + str(version) for version in versions)}.'
    )


if __name__ == '__main__':
    main()
