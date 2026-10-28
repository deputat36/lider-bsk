import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
const HEADERS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const uuid = (v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const READ = new Set(['list','detail','assignees','selection','template.list','template.get']);
const WRITE = new Set(['create','respond','clarify','change','update','accept','cancel','template.save']);
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return reply(200,{});
 if(req.method!=='POST')return reply(405,{ok:false,error:{code:'method_not_allowed'}});
 const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!['https://otulfnouybahfnsycxqn.supabase.co','https://ofewxuqfjhamgerwzull.supabase.co'].includes(url))return reply(503,{ok:false,error:{code:'wrong_environment'}});
 if(!anon||!service)return reply(503,{ok:false,error:{code:'not_configured'}});
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,{ok:false,error:{code:'auth_required'}});
 try{
  const user=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(8000)});
  if(!user.ok)return reply(401,{ok:false,error:{code:'auth_required'}});
  const actor=await user.json();if(!uuid(actor?.id))return reply(401,{ok:false,error:{code:'auth_required'}});
  const raw=await req.text();if(new TextEncoder().encode(raw).length>262144)return reply(413,{ok:false,error:{code:'payload_too_large'}});
  let cmd;try{cmd=JSON.parse(raw);}catch{return reply(400,{ok:false,error:{code:'invalid_payload'}});}
  if(!cmd||typeof cmd!=='object'||Array.isArray(cmd)||!cmd.payload||typeof cmd.payload!=='object'||Array.isArray(cmd.payload)||(!READ.has(cmd.operation)&&!WRITE.has(cmd.operation))||Object.keys(cmd).some(k=>!['operation','request_id','expected_revision','payload'].includes(k)))return reply(400,{ok:false,error:{code:'invalid_payload'}});
  if(WRITE.has(cmd.operation)&&!uuid(cmd.request_id))return reply(400,{ok:false,error:{code:'invalid_payload'}});
  const response=await fetch(url+'/rest/v1/rpc/leader_quote_workspace_rpc',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_payload:{actor_id:actor.id,request:cmd}}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return reply(503,{ok:false,error:{code:'quote_command_failed'}});
  const result=await response.json();
  const status=result.ok?200:result.error?.code==='forbidden'?403:result.error?.code==='not_found'?404:['source_changed','idempotency_conflict','invalid_transition','quote_expired','quote_not_accepted'].includes(result.error?.code)?409:400;
  return reply(status,result);
 }catch{return reply(503,{ok:false,error:{code:'quote_command_failed'}});}
});
