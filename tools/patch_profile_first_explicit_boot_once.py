#!/usr/bin/env python3
from pathlib import Path

path = Path('tools/run_crm_profile_first_boot_browser_check.mjs')
text = path.read_text(encoding='utf-8')

page_old = "    + `  await import('./assets/v4/auth.js');\\n`"
page_new = "    + `  const authModule=await import('./assets/v4/auth.js');\\n`\n    + `  authModule.bootAuth();\\n`"

copy_old = "    await cp(path.join(repoRoot, 'crm', 'v4', 'assets', 'v4', 'auth.js'), path.join(assets, 'auth.js'));"
copy_new = "    const authSourcePath = path.join(repoRoot, 'crm', 'v4', 'assets', 'v4', 'auth.js');\n    const authSource = await readFile(authSourcePath, 'utf8');\n    const autoBoot = \"document.addEventListener('DOMContentLoaded', bootAuth);\";\n    if (!authSource.includes(autoBoot)) throw new Error('auth_auto_boot_marker_missing');\n    await writeFile(path.join(assets, 'auth.js'), authSource.replace(autoBoot, '// Browser check invokes bootAuth explicitly.'), 'utf8');"

for label, old, new in [('page boot', page_old, page_new), ('auth copy', copy_old, copy_new)]:
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new, 1)
    elif new in text:
        continue
    else:
        raise SystemExit(f'{label}: expected one source fragment, found {count}')

required = [
    "const authModule=await import('./assets/v4/auth.js');",
    'authModule.bootAuth();',
    "authSource.replace(autoBoot, '// Browser check invokes bootAuth explicitly.')",
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit('explicit boot markers missing: ' + ', '.join(missing))

path.write_text(text, encoding='utf-8')
print('profile-first browser check now invokes bootAuth explicitly')
