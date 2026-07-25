function clean(value: unknown, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = clean(Deno.env.get('SUPABASE_URL'), 1000)
  const serviceKey = clean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 5000)
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'server_not_configured' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return json(400, { error: 'bad_json' })
  }

  const runId = clean(body.run_id, 120)
  if (!/^staging-public-intake-[0-9]{10,}$/.test(runId)) {
    return json(400, { error: 'run_id_invalid' })
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/leader_staging_public_intake_smoke_cleanup_rpc`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_run_id: runId }),
  })

  const text = await response.text()
  if (!response.ok) return json(500, { error: 'cleanup_failed' })
  try {
    return json(200, JSON.parse(text))
  } catch (_) {
    return json(500, { error: 'cleanup_invalid_response' })
  }
})
