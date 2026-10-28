import {enviarCopias} from './copias.ts';
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
  const r=await sb.rpc('hg_reposicion_jefe_aceptar',{p_token:t});
  if(r.error)return json({error:/PROPUESTA_NO_EXISTE/.test(r.error.message||'')?'PROPUESTA_NO_EXISTE':'NO_SE_PUDO_ACEPTAR'},/PROPUESTA_NO_EXISTE/.test(r.error.message||'')?404:503);
  const p=r.data?.pedido||{};const tokenDocumento=r.data?.tokenDocumento||t;
  // refleja ya el cambio en el privado, el telegrama y la tarjeta (sin esperar a la revisión de cada minuto)
  try{await runReposicion(sb,c,fetch,String(p.id||''));await enviarCopias(sb,c,fetch,String(p.id||''));}catch{/* la revisión de cada minuto lo terminará */}
  const {data:av}=await sb.from('hg_reposicion_avisos').select('img_message_id').eq('token',tokenDocumento).maybeSingle();
  return json({ok:true,tokenDocumento,imagen:!!av?.img_message_id,code:p.code||'',fecha:p.date||'',proveedorTel:p.proveedorTel||'',itemsPrecio:(p.items||[]).map((x:any)=>({material:x.material,qty:x.qty,price:x.price})),aceptadoPor:p.aceptadoPor||'',aceptado:!!r.data?.aceptado,ya:!!r.data?.ya,cerrado:!!r.data?.cerrado,proveedor:p.proveedor||'',items:(p.items||[]).map((x:any)=>({material:x.material,qty:x.qty})),totalCents:p.totalCents||0,
   telegrama:p.aceptadoAt?telegramaIC(p):'',aceptadoAt:p.aceptadoAt||0,motivo:p.propuestaCerrada||''});
 }
 // imagen del albarán: la dibuja la página al aceptar y aquí se manda al privado una sola vez
 if(body?.accion==='imagen'){
  const t=String(body.token||'');if(!/^[0-9a-f]{64}$/.test(t))return json({error:'ENLACE_NO_VALIDO'},400);
  const lim=await sb.rpc('hg_consumir_limite',{p_key:'albaran:'+t.slice(0,16),p_max:4,p_segundos:300});if(lim.error||lim.data===false)return json({error:'DEMASIADOS_INTENTOS'},429);
  const {data:a}=await sb.from('hg_reposicion_avisos').select('pedido_id,channel_id,aceptado_at,img_message_id').eq('token',t).maybeSingle();
  if(!a||!a.aceptado_at||!a.channel_id)return json({error:'PROPUESTA_NO_ACEPTADA'},409);
  if(a.img_message_id)return json({ok:true,ya:true});
  const b64=String(body.png||'').replace(/^data:image\/png;base64,/,'');if(b64.length<100||b64.length>2800000)return json({error:'IMAGEN_NO_VALIDA'},400);
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));}catch{return json({error:'IMAGEN_NO_VALIDA'},400);}
  if(bytes[0]!==0x89||bytes[1]!==0x50||bytes[2]!==0x4e||bytes[3]!==0x47)return json({error:'IMAGEN_NO_VALIDA'},400);
  const {data:o}=await sb.from('datos').select('valor').eq('clave','pedido:'+a.pedido_id).maybeSingle();const p=o?.valor||{};
  const fd=new FormData();fd.append('payload_json',JSON.stringify({allowed_mentions:{parse:[]},content:'🧾 Albarán del pedido aceptado para **'+String(p.proveedor||'el proveedor')+'**.',attachments:[{id:0,filename:'Albaran_'+String(p.code||'pedido')+'.png'}]}));
  fd.append('files[0]',new Blob([bytes],{type:'image/png'}),'Albaran_'+String(p.code||'pedido')+'.png');
  const r=await fetch('https://discord.com/api/v10/channels/'+a.channel_id+'/messages',{method:'POST',headers:{Authorization:'Bot '+c.token},body:fd});
  const m=await r.json().catch(()=>null);if(!r.ok||!m?.id)return json({error:'DISCORD_'+r.status},502);
  await sb.from('hg_reposicion_avisos').update({img_message_id:String(m.id)}).eq('pedido_id',a.pedido_id);
  return json({ok:true});
 }
 if(!c.secreto||c.secreto.length<20||body?.secreto!==c.secreto)return json({error:'NO'},403);
 if(body.preview)return json({ok:true,ready:!!c.token});
 try{const result=await runReposicion(sb,c);const copias=await enviarCopias(sb,c);return json({ok:true,...result,copias});}catch{return json({error:'REPOSICION_PENDIENTE'},503);}
});
