#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'index.html'
HELPER = ROOT / 'assets' / 'packages-link.js'


class HomepageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []
        self.h1_count = 0
        self.form_mount_count = 0
        self.menu_button_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get('id'):
            self.ids.add(values['id'] or '')
        if tag == 'script' and values.get('src'):
            self.scripts.append(values['src'] or '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'h1':
            self.h1_count += 1
        if values.get('id') == 'leader-lead-form' or 'data-leader-lead-form' in values:
            self.form_mount_count += 1
        if tag == 'button' and 'menu-btn' in (values.get('class') or '').split():
            self.menu_button_count += 1


def require(text: str, marker: str, source: str) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source}')


def forbid(text: str, marker: str, source: str) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden internal homepage copy {marker!r} in {source}')


def main() -> None:
    page = PAGE.read_text(encoding='utf-8')
    helper = HELPER.read_text(encoding='utf-8')
    parser = HomepageParser()
    parser.feed(page)

    for marker in (
        '<title>РА Лидер в Борисоглебске — наружная реклама, баннеры, наклейки, дизайн</title>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/">',
        '<meta property="og:url" content="https://www.lider-bsk.ru/">',
        '<script type="application/ld+json">',
        'обращение получает номер и не теряется',
        '<b>Обращение под контролем</b>',
        'После отправки вы получаете номер обращения, а специалист видит описание задачи.',
        '<b>Понятный расчёт</b>',
        'До начала работ согласуем вариант, стоимость, сроки и внешний вид.',
        'Дизайн, соцсети, контент и карты можно заказать из любого города.',
        'После отправки появится номер обращения — мы уточним детали и подготовим расчёт.',
        'чтобы вам не пришлось повторять данные.',
        'номер обращения для быстрой проверки.',
        'privacy.html',
    ):
        require(page, marker, 'index.html')

    for marker in (
        'заявка сразу попадает в CRM',
        '<b>Заявка в CRM</b>',
        'обрабатывать заказы в CRM',
        'Заявка попадёт в CRM РА «Лидер»',
        'с контролем себестоимости и маржи',
        'передает заявку в рабочую CRM',
        'можно продавать не только в Борисоглебске',
    ):
        forbid(page, marker, 'index.html')

    required_ids = {'top', 'services', 'advantages', 'solutions', 'online', 'process', 'request', 'contacts', 'leader-lead-form'}
    missing_ids = required_ids - parser.ids
    if missing_ids:
        raise SystemExit('Missing homepage section IDs: ' + ', '.join(sorted(missing_ids)))

    if parser.h1_count != 1:
        raise SystemExit(f'Homepage must contain exactly one h1, found {parser.h1_count}')
    if parser.form_mount_count != 1:
        raise SystemExit(f'Homepage must contain exactly one lead form mount, found {parser.form_mount_count}')
    if parser.menu_button_count != 1:
        raise SystemExit(f'Homepage must contain exactly one mobile menu button, found {parser.menu_button_count}')

    expected_stylesheets = [
        'assets/public-homepage.css?v=1',
        'assets/public-lead-form.css?v=4',
    ]
    if parser.stylesheets != expected_stylesheets:
        raise SystemExit(f'Unexpected homepage stylesheets: {parser.stylesheets}')

    form_script = 'assets/public-lead-form.js?v=5'
    helper_script = 'assets/packages-link.js?v=1'
    if parser.scripts.count(form_script) != 1 or parser.scripts.count(helper_script) != 1:
        raise SystemExit(f'Unexpected homepage scripts: {parser.scripts}')
    if parser.scripts.index(form_script) > parser.scripts.index(helper_script):
        raise SystemExit('Homepage helper must load after the public form script')

    for marker in (
        'function clientCopy()',
        'Обращение получает номер и не теряется',
        'Обращение под контролем',
        'Понятный расчёт',
        'номер обращения для быстрой проверки',
    ):
        require(helper, marker, 'assets/packages-link.js')

    print('Homepage source copy and structural contract is valid.')


if __name__ == '__main__':
    main()
