#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'poligrafiya-katalog.html'
SITEMAP = ROOT / 'sitemap.xml'

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


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f"Missing {marker!r} in {source.name}")


def main() -> None:
    for source in (PAGE, SITEMAP):
        if not source.is_file():
            raise SystemExit(f'Missing file: {source}')

    text = PAGE.read_text(encoding='utf-8')
    sitemap = SITEMAP.read_text(encoding='utf-8')

    require(text, '<title>Каталог полиграфии в Борисоглебске | РА Лидер</title>', PAGE)
    require(text, '<h1>Каталог полиграфии</h1>', PAGE)
    require(text, 'rel="canonical" href="https://www.lider-bsk.ru/poligrafiya-katalog.html"', PAGE)
    require(sitemap, '<loc>https://www.lider-bsk.ru/poligrafiya-katalog.html</loc>', SITEMAP)

    for link in REQUIRED_LINKS:
        require(text, f'href="{link}"', PAGE)
        if not (ROOT / link).is_file():
            raise SystemExit(f'Missing catalog target: {link}')
        require(sitemap, f'<loc>https://www.lider-bsk.ru/{link}</loc>', SITEMAP)

    for marker in FORBIDDEN_MARKERS:
        if marker in text:
            raise SystemExit(f'Forbidden contour marker {marker!r} in {PAGE.name}')
        if marker in sitemap:
            raise SystemExit(f'Forbidden contour marker {marker!r} in {SITEMAP.name}')

    print('Public polygraphy catalog and sitemap contract is valid.')


if __name__ == '__main__':
    main()
