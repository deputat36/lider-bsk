from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
tabs = (root / 'crm/v4/assets/v4/crm-v4-tabs-lite.js').read_text(encoding='utf-8')
menu = (root / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js').read_text(encoding='utf-8')
route = (root / 'crm/v4/assets/v4/crm-navigation-route-v1.js').read_text(encoding='utf-8')

checks = [
    ('navigation helper is imported', "from './crm-navigation-route-v1.js'" in tabs),
    ('tab navigation uses pushState', "historyMode: 'push'" in tabs and "'pushState'" in tabs),
    ('initial correction uses replaceState', "historyMode: 'replace'" in tabs and "'replaceState'" in tabs),
    ('browser history is restored without another write', "window.addEventListener('popstate'" in tabs and "historyMode: 'none'" in tabs),
    ('role gate remains canonical', "canOpenV4Tab" in tabs and "firstAllowedV4Tab" in tabs),
    ('navigation clears stale lead route', "searchParams.delete('lead')" in route and "searchParams.delete('id')" in route),
    ('unrelated query parameters are not cleared', "new URL(href" in route and "searchParams.set('tab'" in route),
    ('active item exposes aria-current', "aria-current" in tabs and "aria-current" in menu),
    ('new cache marker is loaded', index.count('v=20260714-navigation-history-1') == 2),
    ('navigation helper performs no network writes', all(marker not in route for marker in ('fetch(', 'XMLHttpRequest', 'supabaseClient', '.from('))),
]

failed = [label for label, ok in checks if not ok]
if failed:
    raise SystemExit('CRM navigation history check failed: ' + '; '.join(failed))

print('CRM navigation history source contract is valid.')
