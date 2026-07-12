#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE_BUST = ROOT / 'docs' / 'PUBLIC_LEAD_FORM_CACHE_BUST_2026-07-01.md'
COVERAGE = ROOT / 'docs' / 'PUBLIC_LEAD_FORM_CACHE_V5_COVERAGE_2026-07-10.md'
COMPLETE_CHECKER = ROOT / 'tools' / 'check_all_public_form_cache_versions.py'


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def forbid(text: str, marker: str, source: Path) -> None:
    if marker in text:
        raise SystemExit(f'Stale marker {marker!r} remains in {source.relative_to(ROOT)}')


def main() -> None:
    cache_bust = CACHE_BUST.read_text(encoding='utf-8')
    coverage = COVERAGE.read_text(encoding='utf-8')
    checker = COMPLETE_CHECKER.read_text(encoding='utf-8')

    for source, text in ((CACHE_BUST, cache_bust), (COVERAGE, coverage)):
        for marker in (
            'completed 2026-07-12',
            '49 public',
            'tools/check_all_public_form_cache_versions.py',
            '07d5ba61fc28fb09514b54d89eff8b2c8602e033',
            '#235',
            '#236',
            'leader-public-lead v10',
        ):
            require(text, marker, source)

        for marker in (
            'Remaining blocked pages',
            'remain unchanged until',
            'still intentionally using v4',
            'request.html also remain unchanged',
            'still expects `assets/public-lead-form.js?v=4`',
        ):
            forbid(text, marker, source)

    for marker in (
        'MIN_VERSION = 5',
        "Path('.').glob('*.html')",
        "if len(parser.form_sources) != 1",
        'cache version must be numeric',
        'version < MIN_VERSION',
    ):
        require(checker, marker, COMPLETE_CHECKER)

    print('Public cache migration documentation is current.')


if __name__ == '__main__':
    main()
