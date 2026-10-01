// Canonical order handler. The production bundle is reviewed after staging proof.
import { orderOperationPlan, executeOrderOperation } from '../_shared/order-operations-edge-v1.js'
import { runCanonicalEdgeWrapper } from '../_shared/canonical-edge-wrapper-v1.js'

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!['https://otulfnouybahfnsycxqn.supabase.co','https://ofewxuqfjhamgerwzull.supabase.co'].includes(url || '')) throw new Error('wrong_environment')
    if (req.method === 'POST') {
      const reader = req.body?.getReader()
      const chunks: Uint8Array[] = []; let size = 0
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break
        size += value.length
        if (size > 16384) { await reader.cancel(); return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' } }) }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const body = new TextDecoder().decode(bytes)
      req = new Request(req.url, { method: req.method, headers: req.headers, body })
    }
    return await runCanonicalEdgeWrapper(req, { plan: orderOperationPlan, execute: executeOrderOperation })
  } catch (_) {
    console.error(JSON.stringify({ module: 'orders', code: 'order_request_failed', correlation_id: correlationId, timestamp: new Date().toISOString() }))
    return new Response(JSON.stringify({ ok: false, error: 'order_request_failed', correlation_id: correlationId }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } })
  }
})
