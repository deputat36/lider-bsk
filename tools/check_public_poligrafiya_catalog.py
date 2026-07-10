#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'poligrafiya-katalog.html'

REQUIRED_LINKS = (
    'vizitki-borisoglebsk.html',
    'razdatochnye-materialy-borisoglebsk.html',
    'blanki-borisoglebsk.html',
    'buklety-borisoglebsk.html',
    'gramoty-borisoglebsk.html',
    'menyu-dlya-kafe-borisoglebsk.html',
    'otkrytki-priglasheniya-borisoglebsk.html',
    'kalendari-borisoglebsk.html',
    'birki-etiketki-borisoglebsk.html',
    'papki-konverty-borisoglebsk.html',
)

FORBIDDEN_MARKERS = (
    '/crm/',
    '/nav/',
    '/nav-v2/',
    '/nav_v2/',
    'nav-v2-deal-api',
)


def require(text: str, marker: str) -> None:
    if marker not in text:
        raise SystemExit(f"Missing {marker!r} in {PAGE.name}")


def main() -> None:
    if not PAGE.is_file():
        raise SystemExit(f'Missing page: {PAGE}')

    text = PAGE.read_text(encoding='utf-8')

    require(text, '<title>Каталог полиграфии в Борисоглебске | РА Лидер</title>')
    require(text, '<h1>Каталог полиграфии</h1>')
    require(text, 'rel="canonical" href="https://www.lider-bsk.ru/poligrafiya-katalog.html"')

    for link in REQUIRED_LINKS:
        require(text, f'href="{link}"')
        if not (ROOT / link).is_file():
            raise SystemExit(f'Missing catalog target: {link}')

    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            raise SystemExit(f'Forbidden contour marker {marker!r} in {PAGE.name}')

    print('Public polygraphy catalog contract is valid.')


if __name__ == '__main__':
    main()
