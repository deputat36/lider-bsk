#!/usr/bin/env python3
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import public_indexnow  # noqa: E402


class FakeResponse:
    def __init__(self, body: str = '', status: int = 200) -> None:
        self.body = body.encode('utf-8')
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def read(self) -> bytes:
        return self.body


class PublicIndexNowTest(unittest.TestCase):
    def test_payload_is_canonical_and_scoped(self) -> None:
        value = public_indexnow.payload()
        self.assertEqual(value['host'], 'www.lider-bsk.ru')
        self.assertEqual(len(value['urlList']), 7)
        self.assertEqual(len(set(value['urlList'])), 7)
        self.assertTrue(all(url.startswith('https://www.lider-bsk.ru/') for url in value['urlList']))
        self.assertTrue(all('?' not in url and '#' not in url for url in value['urlList']))

    def test_submit_waits_for_key_and_accepts_202(self) -> None:
        requests = []

        def fake_urlopen(request, timeout):
            requests.append((request, timeout))
            if len(requests) == 1:
                return FakeResponse(public_indexnow.KEY)
            return FakeResponse(status=202)

        with patch.object(public_indexnow, 'urlopen', side_effect=fake_urlopen):
            self.assertEqual(public_indexnow.submit(), 0)

        self.assertEqual(requests[0][0].full_url, public_indexnow.KEY_LOCATION)
        self.assertEqual(requests[1][0].full_url, public_indexnow.ENDPOINT)
        submitted = json.loads(requests[1][0].data.decode('utf-8'))
        self.assertEqual(submitted, public_indexnow.payload())

    def test_submit_rejects_http_error(self) -> None:
        error = HTTPError(
            public_indexnow.ENDPOINT,
            403,
            'Invalid key',
            hdrs=None,
            fp=io.BytesIO(b''),
        )
        with patch.object(
            public_indexnow,
            'urlopen',
            side_effect=[FakeResponse(public_indexnow.KEY), error],
        ):
            self.assertEqual(public_indexnow.submit(), 1)


if __name__ == '__main__':
    unittest.main()
