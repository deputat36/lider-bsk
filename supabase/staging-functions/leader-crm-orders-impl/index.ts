// Retired legacy implementation (previous pinned commit 4dafa2723c1018574572d9a91441cf382ac25b34).
// All order commands use the JWT-first transactional leader-crm-orders handler.
Deno.serve(() => new Response(JSON.stringify({ok:false,error:'retired_endpoint'}),{status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}}));
