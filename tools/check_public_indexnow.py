#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'tools' / 'public_indexnow.py'
URLS_FILE = ROOT / 'tools' / 'public-indexnow-urls.txt'
WORKFLOW = ROOT / '.github' / 'workflows' / 'public-indexnow-notify.yml'
SITEMAP = ROOT / 'sitemap.xml'
EXPECTED_LASTMOD = '2026-07-18'


def main() -> None:
    errors: list[str] = []
    script = SCRIPT.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')
    paths = [line.strip() for line in URLS_FILE.read_text(encoding='utf-8').splitlines() if line.strip()]

    key_match = re.search(r"^KEY = '([A-Za-z0-9-]{8,128})'$", script, flags=re.M)
    if not key_match:
        errors.append('public_indexnow.py must declare a valid IndexNow key')
        key = ''
    else:
        key = key_match.group(1)
        key_file = ROOT / f'{key}.txt'
        if not key_file.is_file() or key_file.read_text(encoding='utf-8').strip() != key:
            errors.append('Root IndexNow key file is missing or does not match the declared key')

    if len(paths) != 7 or len(set(paths)) != len(paths):
        errors.append('IndexNow URL list must contain seven unique priority page paths')

    sitemap_root = ET.parse(SITEMAP).getroot()
    namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    sitemap_entries = {
        node.findtext('sm:loc', default='', namespaces=namespace):
        node.findtext('sm:lastmod', default='', namespaces=namespace)
        for node in sitemap_root.findall('sm:url', namespace)
    }

    for path in paths:
        page_name = path.removeprefix('/')
        url = f'https://www.lider-bsk.ru{path}'
        if not path.startswith('/') or '?' in path or '#' in path:
            errors.append(f'IndexNow path must be canonical and parameter-free: {path}')
        if not (ROOT / page_name).is_file():
            errors.append(f'IndexNow page is missing: {page_name}')
        if sitemap_entries.get(url) != EXPECTED_LASTMOD:
            errors.append(f'IndexNow page must have lastmod {EXPECTED_LASTMOD}: {url}')
        if page_name not in workflow:
            errors.append(f'Workflow path trigger is missing: {page_name}')

    for marker in (
        "ENDPOINT = 'https://yandex.com/indexnow'",
        "'Content-Type': 'application/json; charset=utf-8'",
        "status not in (200, 202)",
        'wait_for_published_key()',
    ):
        if marker not in script:
            errors.append(f'IndexNow submit contract marker is missing: {marker}')

    for marker in (
        "if: github.event_name == 'push'",
        'python3 tools/check_public_indexnow.py',
        'python3 tools/test_public_indexnow.py',
        'python3 tools/public_indexnow.py --submit',
    ):
        if marker not in workflow:
            errors.append(f'IndexNow workflow marker is missing: {marker}')

    if "if: github.event_name == 'pull_request'" in workflow:
        errors.append('Pull request workflows must not submit IndexNow notifications')

    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode:
        errors.append(f'IndexNow dry run failed: {result.stderr.strip()}')
    else:
        try:
            dry_payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            errors.append(f'IndexNow dry run is not valid JSON: {error}')
        else:
            expected_urls = [f'https://www.lider-bsk.ru{path}' for path in paths]
            if dry_payload.get('urlList') != expected_urls:
                errors.append('IndexNow dry run URL list differs from the reviewed source list')
            if dry_payload.get('host') != 'www.lider-bsk.ru':
                errors.append('IndexNow dry run host is not canonical')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(f'Public IndexNow contract is valid for {len(paths)} updated commercial URLs.')


if __name__ == '__main__':
    main()
