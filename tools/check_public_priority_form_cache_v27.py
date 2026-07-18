#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
FORM_SCRIPT = ROOT / 'assets' / 'public-lead-form.js'
CAMPAIGN_MODEL = ROOT / 'assets' / 'public-campaign-link-model.js'
PRIORITY_SCRIPT = 'assets/public-lead-form.js?v=27'
PRIORITY_PAGES = {
    'bannery-borisoglebsk.html': "'bannery-borisoglebsk.html':{service:'Баннер'",
    'pechat-bannerov-borisoglebsk.html': "'pechat-bannerov-borisoglebsk.html':{service:'Баннер'",
    'vyveski-borisoglebsk.html': "'vyveski-borisoglebsk.html':{service:'Вывеска / наружная реклама'",
    'tablichki-borisoglebsk.html': "'tablichki-borisoglebsk.html':{service:'Табличка'",
    'nakleyki-plotternaya-rezka-borisoglebsk.html': "'nakleyki-plotternaya-rezka-borisoglebsk.html':{service:'Наклейки'",
    'pechat-na-plenke-borisoglebsk.html': "'pechat-na-plenke-borisoglebsk.html':{service:'Печать на плёнке'",
    'reklama-dlya-magazina-borisoglebsk.html': "'reklama-dlya-magazina-borisoglebsk.html':{service:'Комплексная реклама'",
}
CAMPAIGN_PATHS = (
    '/bannery-borisoglebsk.html',
    '/vyveski-borisoglebsk.html',
    '/nakleyki-plotternaya-rezka-borisoglebsk.html',
    '/pechat-na-plenke-borisoglebsk.html',
    '/reklama-dlya-magazina-borisoglebsk.html',
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.form_sources: list[str] = []
        self.form_mounts = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'script' and 'assets/public-lead-form.js' in (values.get('src') or ''):
            self.form_sources.append(values.get('src') or '')
        if values.get('id') == 'leader-lead-form':
            self.form_mounts += 1


def main() -> None:
    errors: list[str] = []
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    campaign_model = CAMPAIGN_MODEL.read_text(encoding='utf-8')

    for marker in (
        'request_id',
        'stableRequestId',
        'page_path',
        'submitted_at',
        'utm_source',
        'consent_version',
    ):
        if marker not in form_script:
            errors.append(f'assets/public-lead-form.js: missing current payload marker {marker}')

    for page_name, preset in PRIORITY_PAGES.items():
        path = ROOT / page_name
        if not path.is_file():
            errors.append(f'Missing priority commercial page: {page_name}')
            continue

        parser = PageParser()
        parser.feed(path.read_text(encoding='utf-8'))
        if parser.form_sources != [PRIORITY_SCRIPT]:
            errors.append(
                f'{page_name}: expected only {PRIORITY_SCRIPT}, found {parser.form_sources}'
            )
        if parser.form_mounts != 1:
            errors.append(f'{page_name}: expected one public form mount, found {parser.form_mounts}')
        if preset not in form_script:
            errors.append(f'assets/public-lead-form.js: missing preset for {page_name}')

    for path in CAMPAIGN_PATHS:
        marker = f"path: '{path}'"
        if marker not in campaign_model:
            errors.append(f'assets/public-campaign-link-model.js: missing priority target {path}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print(
        f'Priority commercial form cache is valid: {len(PRIORITY_PAGES)} pages on v27, '
        f'{len(CAMPAIGN_PATHS)} campaign targets covered.'
    )


if __name__ == '__main__':
    main()
