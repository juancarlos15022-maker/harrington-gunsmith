import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {historico} from './historico.ts';
import {potencial,auditarStock,impactoInventario} from './calculo.ts';
import {informe,tarjeta,rango} from './informe.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const out=(x:any,n=200)=>new Response(JSON.stringify(x),{status:n,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return out({error:'METODO'},405);let lease='';
 try{const b=await req.json();const {data:cfg}=await sb.from('bot_cfg').select('clave,valor').in('clave',['secreto','token','canal_ventas_potenciales']);const c=Object.fromEntries((cfg||[]).map(x=>[x.clave,x.valor]));if(!c.secreto||c.secreto.length<32||b.secreto!==c.secreto)return out({error:'NO'},403);if(!c.token||!/^\d{15,22}$/.test(c.canal_ventas_potenciales||''))throw Error('CONFIGURACION');
 lease=new Date(Date.now()+90000).toISOString();const {data:claimed}=await sb.from('hg_potencial_estado').update({worker_hasta:lease}).eq('id',1).or('worker_hasta.is.null,worker_hasta.lt.'+new Date().toISOString()).select('*');if(!claimed?.length){lease='';return out({ok:true,ocupado:true});}
 const api=async(method:string,path:string,body?:any)=>{const multipart=body instanceof FormData;const r=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,...(!multipart?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>null);if(!r.ok)throw Error('DISCORD_'+r.status);return d;};
 const {data:events,error}=await sb.rpc('hg_potencial_preparar');if(error)throw Error('PREPARACION');let n=0;
 for(const e of events||[]){try{
  const p=potencial(e.snapshot),audit=auditarStock(e.snapshot,e.anterior),impact=e.tipo==='inventario'?impactoInventario(e.snapshot,e.fuente.items||[]):null,hist=historico(e.snapshot),result={potencial:p,auditoria:audit,impacto:impact,historico:hist};
  // Un solo tablero actualizado. Los cierres, recepciones y recuentos conservan además su asiento.
  const dashboard={allowed_mentions:{parse:[]},embeds:[{title:'📈 Ventas potenciales · situación del almacén',color:0xD4A93A,description:'**Estimación según fabricación habitual (30 días):** '+(hist.mes?'$'+(hist.mes.estimado/100).toFixed(2):'histórico insuficiente')+(hist.semana?'\nEscenario de los últimos 7 días: $'+(hist.semana.estimado/100).toFixed(2):'')+'\n\n**Máximo técnico a tarifa (otro cálculo):** '+rango(p)+(p.exacto?' · cifra exacta para el modelo':' · intervalo certificado')+'\n\nLa estimación sigue el reparto de productos del histórico; el máximo técnico busca la combinación más rentable. Sin compras nuevas, NPC, reservas ni materiales duplicados. No es dinero cobrado ni beneficio.\n\nCaja esperada por registros: **$'+(e.snapshot.caja.esperado/100).toFixed(2)+'**. El efectivo real requiere Hacer caja.\n\nCada pedido recibido, inventario y recuento actualiza este libro. Cierre documental diario a las 00:00 (Madrid). Los movimientos ordinarios actualizan el tablero sin llenar el canal de mensajes.'+(p.advertencias.length?'\n\nRevisión: '+p.advertencias.slice(0,3).join('; '):''),footer:{text:'Tablero actualizado · registro '+e.id},timestamp:e.snapshot.momento}]};
  const {data:control}=await sb.from('hg_potencial_estado').select('mensaje,canal').eq('id',1).single();let msg=control?.mensaje;
  if(msg){try{await api('PATCH','/channels/'+c.canal_ventas_potenciales+'/messages/'+msg,dashboard)}catch(x){if(String(x).includes('404'))msg=null;else throw x;}}
  if(!msg){const d=await api('POST','/channels/'+c.canal_ventas_potenciales+'/messages',{...dashboard,nonce:'hg-pot-dashboard',enforce_nonce:true});msg=d.id;await sb.from('hg_potencial_estado').update({mensaje:msg,canal:c.canal_ventas_potenciales}).eq('id',1);await api('PUT','/channels/'+c.canal_ventas_potenciales+'/pins/'+msg).catch(()=>{});}
  let message=e.mensaje;
  if(e.tipo!=='actualizacion'){
   // Recupera entregas ya aceptadas por Discord si se perdió la confirmación de la base de datos.
   if(!message){const history=await api('GET','/channels/'+c.canal_ventas_potenciales+'/messages?limit=100');message=history.find((m:any)=>m.author?.bot&&m.embeds?.some((x:any)=>x.footer?.text==='Ventas potenciales · registro '+e.id))?.id;}
   const filename='Ventas_potenciales_'+e.id+'.txt',f=new FormData();f.set('payload_json',JSON.stringify({...tarjeta(e,p,audit,impact,hist),attachments:[{id:0,filename}]}));f.set('files[0]',new File([informe(e,p,audit,impact,hist)],filename,{type:'text/plain;charset=utf-8'}));message=(await api(message?'PATCH':'POST','/channels/'+c.canal_ventas_potenciales+'/messages'+(message?'/'+message:''),f)).id;
  }
  const {error:save}=await sb.from('hg_potencial_eventos').update({resultado:result,mensaje:message||null,enviado:new Date().toISOString(),error:null,bloqueado_hasta:null}).eq('id',e.id);if(save)throw Error('CONFIRMACION_PENDIENTE');n++;
 }catch(err){await sb.from('hg_potencial_eventos').update({error:String(err).slice(0,200),bloqueado_hasta:new Date(Date.now()+60000).toISOString()}).eq('id',e.id);break;}}
 return out({ok:true,procesados:n});
 }catch{return out({error:'NO_DISPONIBLE'},503);}finally{if(lease)await sb.from('hg_potencial_estado').update({worker_hasta:null}).eq('id',1).eq('worker_hasta',lease);}
});
