// Built-in APIs only: no registry download is required to bundle this function.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
const PROJECTS = ['https://ofewxuqfjhamgerwzull.supabase.co','https://otulfnouybahfnsycxqn.supabase.co'];
const OPERATIONS = new Set(['company.get','company.save','list','get','save','transition']);
const HEADERS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const uuid = (v: unknown) => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async request => {
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
 if(request.method==='OPTIONS')return reply(200,{});
 if(request.method!=='POST')return reply(405,{ok:false,error:{code:'method_not_allowed'}});
 const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!PROJECTS.includes(url)||!anon||!service)return reply(503,{ok:false,error:{code:'not_configured'}});
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,{ok:false,error:{code:'auth_required'}});
 try{
  const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(8000)});
  if(!auth.ok)return reply(401,{ok:false,error:{code:'auth_required'}});
  const user=await auth.json();if(!uuid(user?.id))return reply(401,{ok:false,error:{code:'auth_required'}});
  const reader=request.body?.getReader();if(!reader)return reply(400,{ok:false,error:{code:'invalid_payload'}});
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>262144){await reader.cancel();return reply(413,{ok:false,error:{code:'payload_too_large'}});}chunks.push(value);}
  const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  let command;try{command=JSON.parse(new TextDecoder().decode(buffer));}catch{return reply(400,{ok:false,error:{code:'invalid_payload'}});}
  if(!command||typeof command!=='object'||Array.isArray(command)||!OPERATIONS.has(command.operation)||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)||Object.keys(command).some(k=>!['operation','request_id','payload'].includes(k)))return reply(400,{ok:false,error:{code:'invalid_payload'}});
  if(['company.save','save','transition'].includes(command.operation)&&!uuid(command.request_id))return reply(400,{ok:false,error:{code:'invalid_payload'}});
  const response=await fetch(url+'/rest/v1/rpc/leader_document_workspace_rpc',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({p_payload:{actor_id:user.id,request:command}}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)return reply(503,{ok:false,error:{code:'document_command_failed'}});
  const result=await response.json(),code=result?.error?.code;
  return reply(result.ok?200:code==='forbidden'?403:code==='not_found'?404:['source_changed','idempotency_conflict','terminal_document'].includes(code)?409:400,result);
 }catch{return reply(503,{ok:false,error:{code:'document_command_failed'}});}
});
