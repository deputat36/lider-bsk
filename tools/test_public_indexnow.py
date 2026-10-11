#!/usr/bin/env python3
import io
from http.client import RemoteDisconnected
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import call, patch
from urllib.error import HTTPError, URLError


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
        self.assertEqual(len(value['urlList']), 8)
        self.assertEqual(len(set(value['urlList'])), 8)
        self.assertIn('https://www.lider-bsk.ru/dizayn-3d-animaciya.html', value['urlList'])
        self.assertIn('https://www.lider-bsk.ru/nashi-raboty.html', value['urlList'])
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

    def test_network_retry_preserves_the_payload(self) -> None:
        requests = []

        def fake_urlopen(request, timeout):
            requests.append(request)
            if len(requests) == 1:
                return FakeResponse(public_indexnow.KEY)
            if len(requests) == 2:
                raise RemoteDisconnected('Remote end closed connection without response')
            return FakeResponse(status=200)

        with patch.object(public_indexnow, 'urlopen', side_effect=fake_urlopen), \
                patch.object(public_indexnow.time, 'sleep') as sleep:
            self.assertEqual(public_indexnow.submit(), 0)
        self.assertEqual(len(requests), 3)
        self.assertEqual(requests[1].full_url, public_indexnow.ENDPOINT)
        self.assertEqual(requests[1].data, requests[2].data)
        self.assertEqual(json.loads(requests[2].data), public_indexnow.payload())
        sleep.assert_called_once_with(5)

    def test_network_failure_stops_after_three_attempts(self) -> None:
        for error in (RemoteDisconnected('closed'), URLError('connection failed'), TimeoutError('timeout')):
            with self.subTest(error=type(error).__name__), \
                    patch.object(public_indexnow, 'urlopen', side_effect=[FakeResponse(public_indexnow.KEY), error, error, error]) as opener, \
                    patch.object(public_indexnow.time, 'sleep') as sleep:
                self.assertEqual(public_indexnow.submit(), 1)
                self.assertEqual(opener.call_count, 4)
                self.assertEqual(sleep.call_args_list, [call(5), call(10)])

    def test_http_refusals_do_not_retry(self) -> None:
        for status in (400, 403, 422, 429, 503):
            with self.subTest(status=status):
                error = HTTPError(public_indexnow.ENDPOINT, status, 'Rejected', hdrs=None, fp=io.BytesIO(b''))
                with patch.object(public_indexnow, 'urlopen', side_effect=[FakeResponse(public_indexnow.KEY), error]) as opener, \
                        patch.object(public_indexnow.time, 'sleep') as sleep:
                    self.assertEqual(public_indexnow.submit(), 1)
                self.assertEqual(opener.call_count, 2)
                sleep.assert_not_called()


if __name__ == '__main__':
    unittest.main()
