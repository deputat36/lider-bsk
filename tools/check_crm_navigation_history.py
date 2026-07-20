from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
tabs = (root / 'crm/v4/assets/v4/crm-v4-tabs-lite.js').read_text(encoding='utf-8')
menu = (root / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js').read_text(encoding='utf-8')
route = (root / 'crm/v4/assets/v4/crm-navigation-route-v1.js').read_text(encoding='utf-8')
router = (root / 'crm/v4/assets/v4/router.js').read_text(encoding='utf-8')
role_test = (root / 'tools/test_crm_role_landing.mjs').read_text(encoding='utf-8')

checks = [
    ('navigation helper is imported', "from './crm-navigation-route-v1.js'" in tabs),
    ('tab navigation uses pushState', "historyMode: 'push'" in tabs and "'pushState'" in tabs),
    ('initial correction uses replaceState', "historyMode: 'replace'" in tabs and "'replaceState'" in tabs),
    ('browser history is restored without another write', "window.addEventListener('popstate'" in tabs and "historyMode: 'none'" in tabs),
    ('role gate remains canonical', "canOpenV4Tab" in tabs and "firstAllowedV4Tab" in tabs),
    ('default landing ignores technical body tab', 'setActiveTab(requestedInitialTab()' in tabs and 'current || readInitialTab()' not in tabs),
    ('direct lead route opens card first', "readCrmLeadRoute(window.location.href) && canOpenV4Tab('card')" in tabs),
    ('router shares direct lead helper', "import { readCrmLeadRoute }" in router and 'readCrmLeadRoute(window.location.href)' in router),
    ('quick start is hidden outside leads', "hideElement('crmQuickStart')" in tabs and "showElement('crmQuickStart')" in tabs),
    ('navigation clears stale lead route', "searchParams.delete('lead')" in route and "searchParams.delete('id')" in route),
    ('unrelated query parameters are not cleared', "new URL(href" in route and "searchParams.set('tab'" in route),
    ('active item exposes aria-current', 'aria-current' in tabs and 'aria-current' in menu),
    ('role landing test covers all canonical roles', all(role in role_test for role in ('owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'))),
    ('new cache marker is loaded', 'crm-v4-tabs-lite.js?v=20260720-role-landing-1' in index),
    ('navigation helper performs no network writes', all(marker not in route for marker in ('fetch(', 'XMLHttpRequest', 'supabaseClient', '.from('))),
    ('tabs perform no database writes', all(marker not in tabs for marker in ('.insert(', '.update(', '.delete(', '.upsert(', '.rpc('))),
]

failed = [label for label, ok in checks if not ok]
if failed:
    raise SystemExit('CRM navigation history check failed: ' + '; '.join(failed))

print('CRM navigation is role-aware, direct-link safe, history-aware and keeps onboarding out of focused workspaces.')
