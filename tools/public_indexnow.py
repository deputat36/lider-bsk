#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
HOST = 'www.lider-bsk.ru'
ORIGIN = f'https://{HOST}'
ENDPOINT = 'https://yandex.com/indexnow'
KEY = '93997a8ea7f1013d09703e47ac5ece584a3b0fcaf26738f8'
KEY_FILE = ROOT / f'{KEY}.txt'
KEY_LOCATION = f'{ORIGIN}/{KEY}.txt'
URLS_FILE = ROOT / 'tools' / 'public-indexnow-urls.txt'


def changed_urls() -> list[str]:
    paths = [
        line.strip()
        for line in URLS_FILE.read_text(encoding='utf-8').splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    ]
    return [f'{ORIGIN}{path}' for path in paths]


def payload() -> dict[str, object]:
    return {
        'host': HOST,
        'key': KEY,
        'keyLocation': KEY_LOCATION,
        'urlList': changed_urls(),
    }


def wait_for_published_key(attempts: int = 18, delay_seconds: int = 10) -> None:
    request = Request(KEY_LOCATION, headers={'User-Agent': 'RA-Lider-IndexNow/1.0'})
    for attempt in range(1, attempts + 1):
        try:
            with urlopen(request, timeout=20) as response:
                published = response.read().decode('utf-8').strip()
            if published == KEY:
                print(f'IndexNow key is published: attempt {attempt}.')
                return
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError):
            pass
        if attempt < attempts:
            time.sleep(delay_seconds)
    raise RuntimeError('IndexNow key was not available on the public site in time')


def submit() -> int:
    wait_for_published_key()
    body = json.dumps(payload(), ensure_ascii=True, separators=(',', ':')).encode('utf-8')
    request = Request(
        ENDPOINT,
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': 'RA-Lider-IndexNow/1.0',
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            status = response.status
    except HTTPError as error:
        print(f'IndexNow rejected the request with HTTP {error.code}.', file=sys.stderr)
        return 1
    except (URLError, TimeoutError) as error:
        print(f'IndexNow request failed: {error}', file=sys.stderr)
        return 1

    if status not in (200, 202):
        print(f'Unexpected IndexNow response: HTTP {status}.', file=sys.stderr)
        return 1
    print(f'IndexNow accepted {len(changed_urls())} updated URLs: HTTP {status}.')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description='Build or submit the public IndexNow payload.')
    parser.add_argument('--submit', action='store_true', help='Wait for the key and notify Yandex.')
    args = parser.parse_args()
    if args.submit:
        return submit()
    print(json.dumps(payload(), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
