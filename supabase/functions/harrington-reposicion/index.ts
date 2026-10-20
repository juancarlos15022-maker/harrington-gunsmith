import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {runReposicion,telegramaIC} from './reposicion.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
// 20/10/2026: la página aceptar.html (la abre el botón «Aceptar propuesta» del privado) llama aquí con su enlace secreto.
const CORS={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type','Vary':'Origin'};
const json=(o:unknown,status=200)=>new Response(JSON.stringify(o),{status,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(req.method!=='POST')return json({error:'SOLO_POST'},405);
 let body:any;try{body=await req.json();}catch{return json({error:'JSON'},400);}
 const {data,error}=await sb.from('bot_cfg').select('clave,valor').in('clave',['secreto','token','canal_pedidos']);if(error)return json({error:'CONFIGURACION'},503);
 const c=Object.fromEntries((data||[]).map((x:any)=>[x.clave,x.valor]));
 if(body?.accion==='aceptar'){
  const t=String(body.token||'');if(!/^[0-9a-f]{64}$/.test(t))return json({error:'ENLACE_NO_VALIDO'},400);
  const lim=await sb.rpc('hg_consumir_limite',{p_key:'aceptar:'+t.slice(0,16),p_max:10,p_segundos:60});if(lim.error||lim.data===false)return json({error:'DEMASIADOS_INTENTOS'},429);
  const r=await sb.rpc('hg_reposicion_aceptar',{p_token:t});
  if(r.error)return json({error:/PROPUESTA_NO_EXISTE/.test(r.error.message||'')?'PROPUESTA_NO_EXISTE':'NO_SE_PUDO_ACEPTAR'},/PROPUESTA_NO_EXISTE/.test(r.error.message||'')?404:503);
  const p=r.data?.pedido||{};
  // refleja ya el cambio en el privado, el telegrama y la tarjeta (sin esperar a la revisión de cada minuto)
  try{await runReposicion(sb,c,fetch,String(p.id||''));}catch{/* la revisión de cada minuto lo terminará */}
  return json({ok:true,aceptado:!!r.data?.aceptado,ya:!!r.data?.ya,cerrado:!!r.data?.cerrado,proveedor:p.proveedor||'',items:(p.items||[]).map((x:any)=>({material:x.material,qty:x.qty})),totalCents:p.totalCents||0,
   telegrama:p.aceptadoAt?telegramaIC(p):'',aceptadoAt:p.aceptadoAt||0,motivo:p.propuestaCerrada||''});
 }
 if(!c.secreto||c.secreto.length<20||body?.secreto!==c.secreto)return json({error:'NO'},403);
 if(body.preview)return json({ok:true,ready:!!c.token});
 try{return json({ok:true,...await runReposicion(sb,c)});}catch{return json({error:'REPOSICION_PENDIENTE'},503);}
});
