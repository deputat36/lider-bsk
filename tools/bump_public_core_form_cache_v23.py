#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE_VERSION = 23


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} occurrence(s) of {old!r}, found {count}')
    target.write_text(text.replace(old, new), encoding='utf-8')


def main() -> None:
    old_v5 = '<script src="assets/public-lead-form.js?v=5"></script>'
    old_v14 = '<script src="assets/public-lead-form.js?v=14"></script>'
    new_v23 = '<script src="assets/public-lead-form.js?v=23"></script>'

    for page in ('index.html', 'request.html', 'uslugi.html', 'kontakty.html'):
        replace_exact(page, old_v5, new_v23)
    replace_exact('prices.html', old_v14, new_v23)

    replace_exact(
        'tools/check_public_homepage_css_migration.py',
        "        'assets/public-lead-form.js?v=5',",
        "        'assets/public-lead-form.js?v=23',",
    )
    replace_exact(
        'tools/check_public_homepage_css_migration.py',
        "        'assets/public-lead-form.js?v=4',\n",
        "        'assets/public-lead-form.js?v=4',\n        'assets/public-lead-form.js?v=5',\n",
    )
    replace_exact(
        'tools/check_public_homepage_css_migration.py',
        "print('Homepage CSS extraction and form v5 contract is valid.')",
        "print('Homepage CSS extraction and form v23 contract is valid.')",
    )

    replace_exact(
        'tools/check_public_request_css_v5.py',
        "        'assets/public-lead-form.js?v=5',",
        "        'assets/public-lead-form.js?v=23',",
    )
    replace_exact(
        'tools/check_public_request_css_v5.py',
        "        'assets/public-lead-form.js?v=4',\n",
        "        'assets/public-lead-form.js?v=4',\n        'assets/public-lead-form.js?v=5',\n",
    )
    replace_exact(
        'tools/check_public_request_css_v5.py',
        "print('Request page CSS, source copy and form v5 contract is valid.')",
        "print('Request page CSS, source copy and form v23 contract is valid.')",
    )

    replace_exact(
        'tools/check_public_services_catalog.py',
        "        'assets/public-lead-form.js?v=5',",
        "        'assets/public-lead-form.js?v=23',",
    )

    replace_exact(
        'tools/check_public_prices_css.py',
        "FORM_SCRIPT = '<script src=\"assets/public-lead-form.js?v=14\"></script>'",
        "FORM_SCRIPT = '<script src=\"assets/public-lead-form.js?v=23\"></script>'",
    )
    replace_exact(
        'tools/check_public_prices_css.py',
        'prices.html must retain public-lead-form.js?v=14 exactly once',
        'prices.html must load public-lead-form.js?v=23 exactly once',
    )

    replace_exact(
        'tools/check_public_contacts_assets.py',
        "FORM_JS = 'assets/public-lead-form.js?v=5'",
        "FORM_JS = 'assets/public-lead-form.js?v=23'",
    )

    replace_exact(
        'tools/check_all_public_form_cache_versions.py',
        'MIN_VERSION = 5\n',
        "MIN_VERSION = 5\nCORE_VERSION = 23\nCORE_PAGES = {\n    'index.html',\n    'request.html',\n    'uslugi.html',\n    'prices.html',\n    'kontakty.html',\n}\n",
    )
    replace_exact(
        'tools/check_all_public_form_cache_versions.py',
        '        version = int(raw_version)\n        pages.append((path.name, version))\n',
        "        version = int(raw_version)\n        if path.name in CORE_PAGES and version != CORE_VERSION:\n            errors.append(\n                f'{path.name}: core page must use v={CORE_VERSION}, found v={version}'\n            )\n        pages.append((path.name, version))\n",
    )
    replace_exact(
        'tools/check_all_public_form_cache_versions.py',
        "        f'cache versions in use: {\", \".join(\"v=\" + str(version) for version in versions)}.'\n",
        "        f'cache versions in use: {\", \".join(\"v=\" + str(version) for version in versions)}; '\n        f'core pages pinned to v={CORE_VERSION}.'\n",
    )

    replace_exact(
        'tools/check_public_cache_docs_current.py',
        "COVERAGE = ROOT / 'docs' / 'PUBLIC_LEAD_FORM_CACHE_V5_COVERAGE_2026-07-10.md'\n",
        "COVERAGE = ROOT / 'docs' / 'PUBLIC_LEAD_FORM_CACHE_V5_COVERAGE_2026-07-10.md'\nCORE_BUST = ROOT / 'docs' / 'PUBLIC_CORE_FORM_CACHE_V23_2026-07-15.md'\n",
    )
    replace_exact(
        'tools/check_public_cache_docs_current.py',
        "    coverage = COVERAGE.read_text(encoding='utf-8')\n    checker = COMPLETE_CHECKER.read_text(encoding='utf-8')\n",
        "    coverage = COVERAGE.read_text(encoding='utf-8')\n    core_bust = CORE_BUST.read_text(encoding='utf-8')\n    checker = COMPLETE_CHECKER.read_text(encoding='utf-8')\n",
    )
    replace_exact(
        'tools/check_public_cache_docs_current.py',
        "    for source, text in ((CACHE_BUST, cache_bust), (COVERAGE, coverage)):\n",
        "    for marker in (\n        'completed 2026-07-15',\n        'assets/public-lead-form.js?v=23',\n        'index.html',\n        'request.html',\n        'uslugi.html',\n        'prices.html',\n        'kontakty.html',\n        'source `Вручную`',\n        'production Supabase was not changed',\n    ):\n        require(core_bust, marker, CORE_BUST)\n\n    for source, text in ((CACHE_BUST, cache_bust), (COVERAGE, coverage), (CORE_BUST, core_bust)):\n",
    )
    replace_exact(
        'tools/check_public_cache_docs_current.py',
        "        'MIN_VERSION = 5',\n",
        "        'MIN_VERSION = 5',\n        'CORE_VERSION = 23',\n        \"'index.html'\",\n        \"'request.html'\",\n        \"'uslugi.html'\",\n        \"'prices.html'\",\n        \"'kontakty.html'\",\n",
    )

    print('Core public form cache markers migrated to v=23.')


if __name__ == '__main__':
    main()
