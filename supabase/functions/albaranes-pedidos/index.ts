import {canalCancelados,archivarCancelados} from './cancelados.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {sincronizarTexto,formularioAlbaran} from './texto.ts';
import {pngPedido} from './render.ts';import {estado} from './modelo.ts';
const url=Deno.env.get('SUPABASE_URL')!,sb=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin','Cache-Control':'private, no-store'};
const J=(x:any,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...CORS,'Content-Type':'application/json'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});if(req.method!=='POST')return J({error:'METODO'},405);try{const b=await req.json();
 if(b.accion==='ver'||b.accion==='imagen'){
  let id=String(b.id||''),p:any;
  if(b.token){const {data:a}=await sb.from('hg_reposicion_avisos').select('pedido_id').eq('token',String(b.token)).maybeSingle();if(!a||id&&a.pedido_id!==id)return J({error:'SIN_PERMISO'},403);id=a.pedido_id;}
  if(!id||id.length>200)return J({error:'PEDIDO_INVALIDO'},400);
  const bearer=req.headers.get('Authorization')||'';
  if(bearer.startsWith('Bearer ')){const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});const r=await user.rpc('hg_albaran_ver',{p_id:id});if(r.error)return J({error:'SIN_PERMISO'},403);p=r.data;}
  else{const r=await sb.rpc('hg_albaran_acceso',{p_id:id,p_gob_hash:b.sesion?await hash(String(b.sesion)):null,p_token:b.token||null});if(r.error)return J({error:'SIN_PERMISO'},403);p=r.data;}
  const png=await pngPedido(p);
  if(b.accion==='imagen'){
   const {data:a}=await sb.from('hg_reposicion_avisos').select('channel_id,img_message_id').eq('pedido_id',id).maybeSingle();if(!a?.channel_id)return J({ok:true,imagen:false});
   const {data:cfg}=await sb.from('bot_cfg').select('valor').eq('clave','token').single();if(!cfg?.valor)return J({error:'CONFIGURACION'},503);
   const name='Albaran_'+String(p.code||id).replace(/[^\w-]/g,'_')+'.png',form=formularioAlbaran({},p,png,name);
   const rr=await fetch('https://discord.com/api/v10/channels/'+a.channel_id+'/messages'+(a.img_message_id?'/'+a.img_message_id:''),{method:a.img_message_id?'PATCH':'POST',headers:{Authorization:'Bot '+cfg.valor},body:form,signal:AbortSignal.timeout(15000)});if(!rr.ok)return J({error:'DISCORD_PENDIENTE'},503);const m=await rr.json();await sb.from('hg_reposicion_avisos').update({img_message_id:m.id}).eq('pedido_id',id);return J({ok:true,imagen:true});
  }
  return new Response(png,{headers:{...CORS,'Content-Type':'image/png','Content-Disposition':'inline; filename="Albaran_'+String(p.code||id).replace(/[^\w-]/g,'_')+'.png"'}});
 }
 const {data:cfg}=await sb.from('bot_cfg').select('clave,valor').in('clave',['secreto','token','canal_pedidos','canal_pedidos_cancelados']);const c=Object.fromEntries((cfg||[]).map(x=>[x.clave,x.valor]));if(!c.secreto||c.secreto.length<32||b.secreto!==c.secreto)return J({error:'NO'},403);
 if(!c.token||!c.canal_pedidos)return J({error:'CONFIGURACION'},503);
 const api=async(method:string,path:string,body?:any)=>{const r=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok){const detail=await r.text();throw Error('DISCORD_'+r.status+':'+detail.slice(0,140))}return r.status===204?null:r.json()};
 c.canal_pedidos_cancelados=c.canal_pedidos_cancelados||await canalCancelados(sb,api,c.canal_pedidos);
 if(b.accion==='archivar_cancelados')return J({ok:true,canal:c.canal_pedidos_cancelados,...await archivarCancelados(sb,api,c.canal_pedidos,c.canal_pedidos_cancelados)});
 const {data:jobs,error}=await sb.rpc('hg_albaranes_pendientes');if(error)throw Error('COLA');let enviados=0;
 for(const job of jobs||[]){const lease=new Date(Date.now()+90000).toISOString();const {data:claimed,error:ce}=await sb.from('hg_albaranes_pedidos').update({lease}).eq('pedido_id',job.pedido_id).eq('version',job.version).or('lease.is.null,lease.lt.'+new Date().toISOString()).select('*');if(ce||!claimed?.length)continue;
 try{const p=job.snapshot,png=await pngPedido(p),filename='Albaran_'+String(p.code||p.id).replace(/[^\w-]/g,'_')+'.png';const target=p.cancelled?c.canal_pedidos_cancelados:c.canal_pedidos;let message=job.canal&&job.canal!==target?null:job.mensaje;const footer='Albarán Harrington · '+job.pedido_id;
 if(!message){const recent=await api('GET','/channels/'+target+'/messages?limit=100');message=recent.find((m:any)=>m.author?.bot&&m.embeds?.some((e:any)=>e.footer?.text===footer))?.id}
 const payload={allowed_mentions:{parse:[]},embeds:[{title:'🧾 '+(p.code||p.id)+' · '+String(p.proveedor||'Proveedor').slice(0,80),description:estado(p)+'\nDocumento firmado de Vincent Harrington. Cantidades, entregas y pagos detallados en la imagen adjunta.',color:p.received&&p.paid?0x3e684c:0xb38a42,image:{url:'attachment://'+filename},footer:{text:footer}}],attachments:[{id:0,filename}],nonce:'alb-'+job.version.slice(0,20),enforce_nonce:true};const form=formularioAlbaran(payload,p,png,filename);let m;try{m=await api(message?'PATCH':'POST','/channels/'+target+'/messages'+(message?'/'+message:''),form)}catch(e){if(message&&String(e).includes('404'))m=await api('POST','/channels/'+target+'/messages',form);else throw e}
 // El albarán ya enviado al privado automático se actualiza con la misma imagen, sin duplicarlo.
 const {data:a}=await sb.from('hg_reposicion_avisos').select('img_message_id,channel_id').eq('pedido_id',job.pedido_id).maybeSingle();if(a?.img_message_id&&a.channel_id){const dm=formularioAlbaran({},p,png,filename);await api('PATCH','/channels/'+a.channel_id+'/messages/'+a.img_message_id,dm).catch(e=>{if(!String(e).includes('404'))throw e});} if(!p.cancelled)await sincronizarTexto(sb,api,c.canal_pedidos,p,job.pedido_id); const saved=await sb.from('hg_albaranes_pedidos').update({mensaje:m.id,canal:target,enviado_version:job.version,error:null,lease:null}).eq('pedido_id',job.pedido_id).eq('lease',lease);if(saved.error)throw Error('CONFIRMACION');
enviados++;
 }catch(e){await sb.from('hg_albaranes_pedidos').update({error:String(e).slice(0,180),lease:null,next_at:new Date(Date.now()+60000).toISOString()}).eq('pedido_id',job.pedido_id).eq('lease',lease);}}
 const archivo=await archivarCancelados(sb,api,c.canal_pedidos,c.canal_pedidos_cancelados);return J({ok:true,enviados,archivo});
 }catch(e){return J({error:'ALBARAN_NO_DISPONIBLE',detalle:String(e).slice(0,100)},503)}});
