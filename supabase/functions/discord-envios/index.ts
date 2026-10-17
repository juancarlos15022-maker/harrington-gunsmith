import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {validarMensaje} from "./discord-validar.ts";
const URL_=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(URL_,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const out=(o:unknown,st=200)=>new Response(JSON.stringify(o),{status:st,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});if(req.method!=='POST')return out({error:'METODO'},405);
let leaseKey='';
try{
const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return out({error:'SIN_CUENTA'},401);
const caller=createClient(URL_,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
const {data:permitido,error:ae}=await caller.rpc('hg_permitido');if(ae||!permitido)return out({error:'SIN_CUENTA'},401);
const {data:u}=await caller.auth.getUser();if(!u.user)return out({error:'SIN_CUENTA'},401);
const {data:owner}=await caller.rpc('hg_es_jefe');
if(Number(req.headers.get('content-length')||0)>8000000)return out({error:'TAMANO'},413);
let b:any,files:File[]=[];const {data:persona}=await admin.from('datos').select('valor').eq('clave','empleados').single();const emp=u.user.app_metadata?.emp_id;const nom=(persona?.valor||[]).find((x:any)=>x.id===emp)?.name;if(!nom)return out({error:'SIN_CUENTA'},401);
if((req.headers.get('content-type')||'').includes('multipart/form-data')){const fd=await req.formData();b=JSON.parse(String(fd.get('peticion')||'{}'));for(const [k,v]of fd.entries())if(k.startsWith('files[')&&v instanceof File)files.push(v);}
else b=await req.json();
if(files.length>2||files.reduce((a,x)=>a+x.size,0)>7500000)return out({error:'TAMANO'},413);
const solicitado=String(b.metodo||'POST');let metodo=solicitado;if(metodo==='POST'&&b.mensaje)return out({error:'METODO_MENSAJE'},400);if(!['POST','PATCH','DELETE'].includes(metodo))return out({error:'METODO'},400);if(metodo==='DELETE'&&!owner)return out({error:'SOLO_PROPIETARIO'},403);
const {data:limite}=await admin.rpc('hg_consumir_limite',{p_key:'discord:'+u.user.id,p_max:30,p_segundos:60});if(!limite)return out({error:'LIMITE'},429);
const {data:cfg}=await admin.from('datos').select('valor').eq('clave','discord').single();const urls=[cfg?.valor?.url,...Object.values(cfg?.valor?.urls||{})].filter(x=>typeof x==='string');
const hook=urls.find((x:any)=>new URL(x).pathname.split('/')[3]===String(b.webhook));if(!hook)return out({error:'CANAL_NO_CONFIGURADO'},403);
const url=new URL(String(hook));if(url.hostname!=='discord.com'&&url.hostname!=='discordapp.com')return out({error:'DESTINO'},400);
if(!/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname))return out({error:'DESTINO'},400);
url.search='';if(b.mensaje){if(!/^\d{15,22}$/.test(String(b.mensaje)))return out({error:'MENSAJE'},400);url.pathname=url.pathname.replace(/\/$/,'')+'/messages/'+b.mensaje;}else if(metodo!=='POST')return out({error:'MENSAJE'},400);
if(b.wait||!owner)url.searchParams.set('wait','true');
let payload=b.payload||{};const meta=payload._hg||{};delete payload._hg;let registro='';const kind=String(meta.kind||'');
if(owner&&meta.ref&&['ventas','encargos','stock','materiales','clientes','agenda','fichajes','ausencias','fabricacion','resumen'].includes(kind)&&metodo!=='DELETE'){
 const target=cfg?.valor?.urls?.[kind]||cfg?.valor?.url;if(!target||new URL(target).pathname.split('/')[3]!==String(b.webhook))return out({error:'CANAL_INVALIDO'},403);
 try{const verified=await validarMensaje(admin,kind,String(meta.ref),emp,nom,true);registro=verified.record;if(['fabricacion','stock','materiales','fichajes'].includes(kind)){payload={username:'Harrington Gunsmith',embeds:[{title:verified.title,description:verified.description,color:0xC9A24A,footer:{text:'Harrington · Datos verificados por registro'}}]};files=[];}}catch{return out({error:'OPERACION_INVALIDA'},403);}
 leaseKey=kind+':'+registro;const claim=await admin.rpc('hg_discord_reservar',{p_key:leaseKey});if(claim.error||claim.data!==true){leaseKey='';return out({error:'ENVIO_EN_CURSO'},409);}
 if(metodo==='POST'){const {data:m}=await admin.from('hg_discord_messages').select('message_id,webhook_id').eq('kind',kind).eq('record_key',registro).maybeSingle();if(m?.message_id&&m.webhook_id===String(b.webhook)){b.mensaje=m.message_id;url.pathname=url.pathname.replace(/\/$/,'')+'/messages/'+m.message_id;metodo='PATCH';}}
 url.searchParams.set('wait','true');
}
if(!owner){
 const target=cfg?.valor?.urls?.[kind]||cfg?.valor?.url;if(!target||new URL(target).pathname.split('/')[3]!==String(b.webhook))return out({error:'CANAL_INVALIDO'},403);
 let canonical;try{canonical=await validarMensaje(admin,kind,String(meta.ref||''),emp,nom);}catch(e){return out({error:e instanceof Error?e.message:'OPERACION_INVALIDA'},403);}registro=canonical.record;leaseKey=kind+':'+registro;const claim=await admin.rpc('hg_discord_reservar',{p_key:leaseKey});if(claim.error||claim.data!==true){leaseKey='';return out({error:'ENVIO_EN_CURSO'},409);}
 if(metodo==='PATCH'){
  const {data:m}=await admin.from('hg_discord_messages').select('webhook_id,kind,record_key').eq('message_id',String(b.mensaje)).maybeSingle();
  if(!m||m.webhook_id!==String(b.webhook)||m.kind!==kind||m.record_key!==registro){await admin.from('hg_discord_leases').delete().eq('clave',leaseKey);leaseKey='';return out({error:'MENSAJE_AJENO'},403);}
 }
 if(metodo==='POST'){
  const {data:existente}=await admin.from('hg_discord_messages').select('message_id,webhook_id').eq('kind',kind).eq('record_key',registro).maybeSingle();
  if(existente?.message_id&&existente.webhook_id===String(b.webhook)){
   b.mensaje=existente.message_id;url.pathname=url.pathname.replace(/\/$/,'')+'/messages/'+existente.message_id;metodo='PATCH';
  }
 }
 const image=files.length&&['ventas','encargos'].includes(kind)?{url:'attachment://'+files[0].name}:undefined;
 payload={username:'Harrington Gunsmith',embeds:[{title:canonical.title,description:canonical.description,color:0xC9A24A,footer:{text:'Harrington · Registro verificado por el servidor'},timestamp:new Date().toISOString(),...(image?{image}:{})}]};
 if(!image)files=[];
}
payload.allowed_mentions={parse:[]};if(JSON.stringify(payload).length>30000){if(leaseKey)await admin.from('hg_discord_leases').delete().eq('clave',leaseKey);return out({error:'TAMANO'},413);}
let body:BodyInit|undefined;const headers:Record<string,string>={};
if(metodo!=='DELETE'){if(files.length){const fd=new FormData();fd.append('payload_json',JSON.stringify(payload));files.forEach((f,i)=>fd.append('files['+i+']',f,f.name));body=fd;}else{headers['Content-Type']='application/json';body=JSON.stringify(payload);}}
let r=await fetch(url,{method:metodo,headers,body});if(r.status===404&&metodo==='PATCH'&&!!registro){await admin.from('hg_discord_messages').delete().eq('message_id',String(b.mensaje));if(solicitado==='POST'){url.pathname=url.pathname.replace(/\/messages\/\d+$/,'');metodo='POST';r=await fetch(url,{method:metodo,headers,body});}}const text=await r.text();if(r.ok&&metodo==='POST'&&(b.wait||!owner||!!registro)){try{const result=JSON.parse(text);if(result.id&&registro){b.mensaje=String(result.id);const saved=await admin.from('hg_discord_messages').upsert({message_id:String(result.id),webhook_id:String(b.webhook),kind,record_key:registro,created_by:u.user.id},{onConflict:'kind,record_key'});if(saved.error)throw Error('REFERENCIA_NO_GUARDADA');if(kind==='stock'||kind==='materiales'){const updated={...cfg.valor,refs:{...(cfg.valor.refs||{}),[kind]:{id:String(result.id),w:String(b.webhook)}}};await admin.from('datos').update({valor:updated,actualizado:new Date().toISOString()}).eq('clave','discord');}}}catch{if(leaseKey)await admin.from('hg_discord_leases').delete().eq('clave',leaseKey);return out({error:'ENVIO_REALIZADO_REFERENCIA_PENDIENTE',mensaje:b.mensaje||null},502);}}
if(leaseKey)await admin.from('hg_discord_leases').delete().eq('clave',leaseKey);
return new Response(metodo==='PATCH'&&r.ok&&b.wait?JSON.stringify({id:String(b.mensaje)}):text||null,{status:r.status,headers:{...CORS,'Content-Type':'application/json'}});
}catch{if(leaseKey)await admin.from('hg_discord_leases').delete().eq('clave',leaseKey);return out({error:'ENVIO_NO_DISPONIBLE'},500);}
});

