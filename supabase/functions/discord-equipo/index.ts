import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {reminderCron} from './equipo.ts';
import {startVoice} from './voz.ts';
import {rumorCron} from './rumores.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
 const cors={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return Response.json({error:'solo POST'},{status:405});
 const {data,error}=await sb.from('bot_cfg').select('clave,valor');if(error)return Response.json({error:'configuración'},{status:503});const c=Object.fromEntries((data||[]).map(r=>[r.clave,r.valor]));
 let b:any;try{b=await req.json();}catch{return Response.json({error:'JSON'},{status:400});}
 if(b.accion==='copiar_rumor'){
  if(!/^[a-f0-9-]{36}$/.test(String(b.id||''))||!/^[a-f0-9-]{72}$/.test(String(b.token||'')))return Response.json({error:'Enlace inválido.'},{status:403,headers:cors});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const {data:r}=await sb.from('bot_equipo').select('data,due_at,status').eq('id','copy:'+b.id).eq('kind','rumor_copy').maybeSingle();
  if(!r||r.status!=='active'||r.data.hash!==hash||Date.parse(r.due_at)<=Date.now())return Response.json({error:'El enlace ha caducado. Pulse de nuevo Copiar rumor en Discord.'},{status:403,headers:cors});
  return Response.json({texto:r.data.text},{headers:cors});
 }
 if(!c.secreto||c.secreto.length<20||b.secreto!==c.secreto)return Response.json({error:'NO'},{status:403});
 try{await sb.from('bot_equipo').update({status:'pending'}).eq('kind','voice_watch').eq('status','sending').lt('updated_at',new Date(Date.now()-120000).toISOString());
 (globalThis as any).EdgeRuntime.waitUntil(rumorCron(c).catch(e=>console.error('rumores',String(e).slice(0,150))));
 return Response.json({ok:true,...await reminderCron(c),...await startVoice(c)});
 }catch(e){return Response.json({error:String(e).slice(0,200)},{status:500});}
});
