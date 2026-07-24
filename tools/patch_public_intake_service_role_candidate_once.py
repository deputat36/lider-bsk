#!/usr/bin/env python3
from pathlib import Path

edge = Path('supabase/functions/leader-public-lead/index.ts')
text = edge.read_text(encoding='utf-8')

anchor = """function isDuplicateRequest(details: string) {
  const text = details.toLowerCase()
  return text.includes('duplicate key') || text.includes('leader_leads_request_id_key') || text.includes('23505')
}
"""
helper = anchor + """
type BackendCredential = {
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

replacements = [
    ('credential helper', anchor, helper),
    ('audit param', '  anonKey: string\n', '  backendHeaders: Record<string, string>\n'),
    ('audit headers', """        'apikey': params.anonKey,
        'Authorization': 'Bearer ' + params.anonKey,
        'Content-Type': 'application/json',
""", """        ...params.backendHeaders,
        'Content-Type': 'application/json',
"""),
    ('main credential', """  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return json(req, 500, { error: 'server_not_configured' })
""", """  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const credential = backendCredential()
  if (!supabaseUrl || !credential) return json(req, 500, { error: 'server_not_configured' })
"""),
    ('audit base', """    supabaseUrl,
    anonKey,
    requestId,
""", """    supabaseUrl,
    backendHeaders: credential.headers,
    requestId,
"""),
    ('lead headers', """      'apikey': anonKey,
      'Authorization': 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
""", """      ...credential.headers,
      'Content-Type': 'application/json',
"""),
]

for label, old, new in replacements:
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new, 1)
    elif new in text:
        continue
    else:
        raise SystemExit(f'{label}: expected one source fragment, found {count}')

required = [
    "Deno.env.get('SUPABASE_SECRET_KEYS')",
    "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
    "headers: { apikey: secretKey }",
    "Authorization: 'Bearer ' + legacyServiceRole",
    'backendHeaders: credential.headers',
    '...credential.headers',
    "return json(req, 500, { error: 'server_not_configured' })",
]
missing = [item for item in required if item not in text]
forbidden = ["Deno.env.get('SUPABASE_ANON_KEY')", "'apikey': anonKey", "params.anonKey"]
present = [item for item in forbidden if item in text]
if missing or present:
    raise SystemExit('missing=' + repr(missing) + ' forbidden=' + repr(present))

edge.write_text(text, encoding='utf-8')
print('public intake Edge source switched to backend credential candidate')
