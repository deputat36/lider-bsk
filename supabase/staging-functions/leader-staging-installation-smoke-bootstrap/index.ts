import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  error: 'bootstrap_locked',
  issue: 436,
}), {
  status: 410,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
}))
