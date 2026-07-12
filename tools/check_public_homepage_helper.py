from pathlib import Path

helper_path = Path('assets/packages-link.js')
helper_text = helper_path.read_text(encoding='utf-8')

index_path = Path('index.html')
index_text = index_path.read_text(encoding='utf-8')

required = [
    'leader-ui-fix-v10',
    'function mobile()',
    "h.classList.toggle('open')",
    "if(e.target&&e.target.tagName==='A')close()",
    'function hero()',
    'hero-checklist-link',
    'function popular()',
    'leader-extra-links',
    'nav-cases-link',
    'nav-urgent-link',
    'nav-prices-link',
    'function clientCopy()',
    'Обращение получает номер и не теряется',
    'Обращение под контролем',
    'После отправки вы получаете номер обращения',
    'Понятный расчёт',
    'До начала работ согласуем вариант, стоимость, сроки и внешний вид.',
    'Опишите задачу в форме. После отправки появится номер обращения',
    'чтобы вам не пришлось повторять данные',
    'номер обращения для быстрой проверки',
]

missing = [item for item in required if item not in helper_text]
if missing:
    raise SystemExit('Missing homepage helper markers: ' + ', '.join(missing))

if 'nav-communities-link' not in helper_text or 'contacts-communities-link' not in helper_text:
    raise SystemExit('Old dynamic link cleanup markers are missing')

for forbidden in (
    'Заявка в CRM',
    'контролем себестоимости и маржи',
    'Заявка попадёт в CRM РА «Лидер»',
    'обрабатывать заказы в CRM',
    'передает заявку в рабочую CRM',
):
    if forbidden in helper_text:
        raise SystemExit('Client-facing helper must not contain internal copy: ' + forbidden)

form_script = 'assets/public-lead-form.js'
helper_script = 'assets/packages-link.js'

if index_text.count(helper_script) != 1:
    raise SystemExit('Homepage helper script must be connected exactly once in index.html')

if index_text.count(form_script) != 1:
    raise SystemExit('Public lead form script must be connected exactly once in index.html')

if index_text.index(form_script) > index_text.index(helper_script):
    raise SystemExit('Homepage helper script must be loaded after public lead form script')

if 'menu-btn' not in index_text:
    raise SystemExit('Homepage mobile menu button is missing in index.html')

print('Homepage helper UI and client copy contract is OK')
