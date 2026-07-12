#!/usr/bin/env python3
from pathlib import Path

PAGE = Path('request.html')
CSS = Path('assets/public-request.css')
REQUEST_REFERENCE = Path('.github/workflows/request-reference-check.yml')
REQUEST_SEO = Path('.github/workflows/public-request-seo-check.yml')
PUBLIC_AUDIT = Path('.github/workflows/public-site-audit-check.yml')
STATIC_CHECKS = Path('.github/workflows/static-checks.yml')


def replace_exact(text: str, old: str, new: str, expected: int, source: Path) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{source}: expected {expected} occurrences, found {count}: {old}')
    return text.replace(old, new)


page = PAGE.read_text(encoding='utf-8')
start_tag = '<style>'
end_tag = '</style>'
if page.count(start_tag) != 1 or page.count(end_tag) != 1:
    raise SystemExit('Expected exactly one request page style block')
if CSS.exists():
    raise SystemExit('assets/public-request.css already exists; guarded patch stopped')

start = page.index(start_tag)
end = page.index(end_tag, start)
css = page[start + len(start_tag):end].strip()
for marker in (
    ':root{--black:#1a1a1a',
    '.header__inner{min-height:76px',
    '.hero__grid{display:grid',
    '.scenario-grid{display:grid',
    '.info-grid{display:grid',
    '.after-submit{background:#fff}',
    '@media(max-width:900px)',
    '@media(max-width:560px)',
):
    if marker not in css:
        raise SystemExit(f'Request CSS marker missing before extraction: {marker}')

page = page[:start] + '<link rel="stylesheet" href="assets/public-request.css?v=1">' + page[end + len(end_tag):]
page = replace_exact(
    page,
    'Оставьте заявку на баннер, табличку, наклейки, печать на пленке, дизайн, соцсети или оформление бизнеса. Заявка попадет в CRM РА Лидер.',
    'Оставьте заявку на баннер, табличку, наклейки, печать на пленке, дизайн, соцсети или оформление бизнеса. После отправки вы получите номер обращения для быстрой проверки.',
    1,
    PAGE,
)
page = replace_exact(page, 'Заявка сразу попадёт в CRM', 'Номер обращения после отправки', 1, PAGE)
page = replace_exact(page, 'assets/public-lead-form.js?v=4', 'assets/public-lead-form.js?v=5', 1, PAGE)

request_reference = REQUEST_REFERENCE.read_text(encoding='utf-8')
request_reference = replace_exact(
    request_reference,
    "          form = 'assets/public-lead-form.js?v=4'",
    "          form = 'assets/public-lead-form.js?v=5'",
    1,
    REQUEST_REFERENCE,
)

request_seo = REQUEST_SEO.read_text(encoding='utf-8')
request_seo = replace_exact(
    request_seo,
    "          grep -Fq '<link rel=\"stylesheet\" href=\"assets/public-lead-form.css?v=4\">' \"$page\"",
    "          grep -Fq '<link rel=\"stylesheet\" href=\"assets/public-lead-form.css?v=4\">' \"$page\"\n          grep -Fq '<link rel=\"stylesheet\" href=\"assets/public-request.css?v=1\">' \"$page\"",
    1,
    REQUEST_SEO,
)
request_seo = replace_exact(
    request_seo,
    "          grep -Fq 'assets/public-lead-form.js?v=4' \"$page\"",
    "          grep -Fq 'assets/public-lead-form.js?v=5' \"$page\"",
    1,
    REQUEST_SEO,
)
request_seo = replace_exact(
    request_seo,
    "          grep -Fq 'Заявка сразу попадёт в CRM' \"$page\"",
    "          grep -Fq 'Номер обращения после отправки' \"$page\"",
    1,
    REQUEST_SEO,
)
request_seo = replace_exact(
    request_seo,
    "          if grep -Fq 'assets/public-lead-form.css?v=3' \"$page\"; then\n            echo 'request.html must use the current public CSS cache marker v4.' >&2\n            exit 1\n          fi",
    "          if grep -Fq 'assets/public-lead-form.css?v=3' \"$page\" || grep -Fq 'assets/public-lead-form.js?v=4' \"$page\"; then\n            echo 'request.html contains stale public form cache markers.' >&2\n            exit 1\n          fi",
    1,
    REQUEST_SEO,
)

public_audit = PUBLIC_AUDIT.read_text(encoding='utf-8')
public_audit = replace_exact(
    public_audit,
    "      - 'assets/public-homepage.css'",
    "      - 'assets/public-homepage.css'\n      - 'assets/public-request.css'",
    2,
    PUBLIC_AUDIT,
)
public_audit = replace_exact(
    public_audit,
    "      - 'docs/PUBLIC_HOMEPAGE_CSS_MIGRATION_2026-07-12.md'",
    "      - 'docs/PUBLIC_HOMEPAGE_CSS_MIGRATION_2026-07-12.md'\n      - 'docs/PUBLIC_REQUEST_CSS_V5_MIGRATION_2026-07-12.md'",
    2,
    PUBLIC_AUDIT,
)
public_audit = replace_exact(
    public_audit,
    "      - 'tools/check_public_homepage_css_migration.py'",
    "      - 'tools/check_public_homepage_css_migration.py'\n      - 'tools/check_public_request_css_v5.py'",
    2,
    PUBLIC_AUDIT,
)
public_audit = replace_exact(
    public_audit,
    "      - '.github/workflows/public-homepage-css-migration-check.yml'",
    "      - '.github/workflows/public-homepage-css-migration-check.yml'\n      - '.github/workflows/public-request-css-v5-check.yml'",
    2,
    PUBLIC_AUDIT,
)
public_audit = replace_exact(
    public_audit,
    "          form = 'assets/public-lead-form.js?v=4'",
    "          form = 'assets/public-lead-form.js?v=5'",
    1,
    PUBLIC_AUDIT,
)
public_audit = replace_exact(
    public_audit,
    "      - name: Check homepage CSS migration contract\n        run: python3 tools/check_public_homepage_css_migration.py",
    "      - name: Check homepage CSS migration contract\n        run: python3 tools/check_public_homepage_css_migration.py\n\n      - name: Check request CSS and form v5 contract\n        run: python3 tools/check_public_request_css_v5.py",
    1,
    PUBLIC_AUDIT,
)

static_checks = STATIC_CHECKS.read_text(encoding='utf-8')
static_checks = replace_exact(
    static_checks,
    "          grep -lF 'assets/public-lead-form.js?v=4' -- *.html >/dev/null",
    "          if grep -lF 'assets/public-lead-form.js?v=4' -- *.html; then\n            echo 'Stale public form JS cache version v4 remains.' >&2\n            exit 1\n          fi",
    1,
    STATIC_CHECKS,
)

for marker in ('Заявка попадет в CRM', 'Заявка сразу попадёт в CRM', 'assets/public-lead-form.js?v=4', '<style>', '</style>'):
    if marker in page:
        raise SystemExit(f'Stale request marker remains: {marker}')
if page.count('assets/public-request.css?v=1') != 1:
    raise SystemExit('Request stylesheet link must appear exactly once')

CSS.write_text('/* RA Lider public request page styles. Extracted without visual changes. */\n' + css + '\n', encoding='utf-8')
PAGE.write_text(page, encoding='utf-8')
REQUEST_REFERENCE.write_text(request_reference, encoding='utf-8')
REQUEST_SEO.write_text(request_seo, encoding='utf-8')
PUBLIC_AUDIT.write_text(public_audit, encoding='utf-8')
STATIC_CHECKS.write_text(static_checks, encoding='utf-8')
print(f'Extracted {len(css)} request CSS characters and synchronized public v5 CI contracts.')
