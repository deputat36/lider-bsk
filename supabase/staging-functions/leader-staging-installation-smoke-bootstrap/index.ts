Deno.serve(() => new Response('{"error":"locked"}', { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }))
