#!/usr/bin/env python3
from pathlib import Path

path = Path('supabase/functions/leader-public-lead/index.ts')
text = path.read_text(encoding='utf-8')
old = """    } catch (_) {
      return null
    }
  }

  const legacyServiceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
"""
new = """    } catch (_) {
      // Ignore malformed modern key configuration and try the explicit legacy transition key.
    }
  }

  const legacyServiceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
"""
count = text.count(old)
if count == 1:
    text = text.replace(old, new, 1)
elif new in text:
    pass
else:
    raise SystemExit(f'credential fallback source fragment count={count}')

if text.count('function backendCredential(): BackendCredential | null') != 1:
    raise SystemExit('backend credential helper is not singleton')
if "Ignore malformed modern key configuration" not in text:
    raise SystemExit('legacy fallback marker missing')
path.write_text(text, encoding='utf-8')
print('public intake credential fallback fixed')
