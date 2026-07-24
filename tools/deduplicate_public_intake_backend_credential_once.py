#!/usr/bin/env python3
from pathlib import Path

path = Path('supabase/functions/leader-public-lead/index.ts')
text = path.read_text(encoding='utf-8')
start_marker = "type BackendCredential = {"
end_marker = "async function writeAudit(params: {"
start = text.find(start_marker)
end = text.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('backend credential section markers missing')

helper = """type BackendCredential = {
  headers: Record<string, string>
  source: 'secret_key' | 'legacy_service_role'
}

function backendCredential(): BackendCredential | null {
  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw)
      const secretKey = typeof parsed?.default === 'string' ? parsed.default.trim() : ''
      if (secretKey) {
        return { headers: { apikey: secretKey }, source: 'secret_key' }
      }
    } catch (_) {
      return null
    }
  }

  const legacyServiceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (legacyServiceRole) {
    return {
      headers: {
        apikey: legacyServiceRole,
        Authorization: 'Bearer ' + legacyServiceRole,
      },
      source: 'legacy_service_role',
    }
  }

  return null
}

"""

text = text[:start] + helper + text[end:]
if text.count(start_marker) != 1 or text.count('function backendCredential(): BackendCredential | null') != 1:
    raise SystemExit('backend credential helper is not singleton after normalization')
path.write_text(text, encoding='utf-8')
print('public intake backend credential helper normalized to one copy')
