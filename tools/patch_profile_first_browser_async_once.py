#!/usr/bin/env python3
from pathlib import Path

path = Path('tools/run_crm_profile_first_boot_browser_check.mjs')
text = path.read_text(encoding='utf-8')

start_old = "    + `let readyEvents=0;document.addEventListener('leader-v4:crm-ready',()=>{readyEvents+=1;});\\n`\n    + `if(scenario==='expired_session')localStorage.setItem('leader_profile_first_browser_check_session','stale');\\n`"
start_new = "    + `let readyEvents=0;document.addEventListener('leader-v4:crm-ready',()=>{readyEvents+=1;});\\n`\n    + `async function run(){\\n`\n    + `if(scenario==='expired_session')localStorage.setItem('leader_profile_first_browser_check_session','stale');\\n`"

end_old = "    + `}catch(error){output('failed',{error:String(error?.message||error||'profile_first_browser_failed'),crm_ready:v4State.crmReady,profile_loaded:v4State.profileLoaded,ready_events:readyEvents});document.body.dataset.profileFirstFailed='true';}\\n`\n    + `document.body.dataset.profileFirstFinished='true';\\n`;"
end_new = "    + `}catch(error){output('failed',{error:String(error?.message||error||'profile_first_browser_failed'),crm_ready:v4State.crmReady,profile_loaded:v4State.profileLoaded,ready_events:readyEvents});document.body.dataset.profileFirstFailed='true';}\\n`\n    + `document.body.dataset.profileFirstFinished='true';\\n`\n    + `}\\n`\n    + `run();\\n`;"

for label, old, new in [('async start', start_old, start_new), ('async end', end_old, end_new)]:
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new, 1)
    elif new in text:
        continue
    else:
        raise SystemExit(f'{label}: expected one source fragment, found {count}')

if 'async function run(){\\n' not in text or '+ `run();\\n`;' not in text:
    raise SystemExit('async browser runner markers missing')

path.write_text(text, encoding='utf-8')
print('profile-first browser runner made non-blocking')
