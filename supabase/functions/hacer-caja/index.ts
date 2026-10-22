import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {informeCaja,tarjetaCaja} from './informe.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const sb=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const out=(o:any,status=200)=>new Response(JSON.stringify(o),{status,headers});
async function publicar(id:string,c:any){
 const now=new Date().toISOString(),lease=new Date(Date.now()+90000).toISOString();
 const {data:rows,error}=await sb.from('hg_caja_recuentos').update({discord_lease:lease}).eq('id',id).eq('estado','cerrada').is('discord_id',null).or('discord_lease.is.null,discord_lease.lt.'+now).select('*');
 if(error)throw Error('COLA_NO_DISPONIBLE');const r=rows?.[0];if(!r)return {pendiente:true};
 try{
  let channel=c.canal_cierres;
  if(!channel){const {data:d}=await sb.from('datos').select('valor').eq('clave','discord').single();const hook=d?.valor?.urls?.cierres;if(typeof hook!=='string'||!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(hook))throw Error('CANAL_CIERRES_NO_CONFIGURADO');const h=await fetch(hook,{signal:AbortSignal.timeout(10000)});const x=await h.json();if(!h.ok||!x.channel_id)throw Error('CANAL_CIERRES_NO_DISPONIBLE');channel=x.channel_id;}
  if(!/^\d{15,22}$/.test(channel)||!c.token)throw Error('CANAL_CIERRES_NO_CONFIGURADO');
  const fd=new FormData();fd.set('payload_json',JSON.stringify(tarjetaCaja(r)));fd.set('files[0]',new File([informeCaja(r)],'Cierre_'+r.id+'.txt',{type:'text/plain;charset=utf-8'}));
  const resp=await fetch('https://discord.com/api/v10/channels/'+channel+'/messages',{method:'POST',headers:{Authorization:'Bot '+c.token},body:fd,signal:AbortSignal.timeout(20000)});const m=await resp.json();if(!resp.ok||!m.id)throw Error('DISCORD_'+resp.status);
  const {error:e}=await sb.from('hg_caja_recuentos').update({discord_id:m.id,discord_canal:channel,discord_error:null,discord_lease:null}).eq('id',id).eq('discord_lease',lease);if(e)throw Error('CONFIRMACION_PENDIENTE');
  return {publicado:true,url:'https://discord.com/channels/'+c.guild_id+'/'+channel+'/'+m.id};
 }catch(e){const code=e instanceof Error?e.message:'ENVIO_PENDIENTE';await sb.from('hg_caja_recuentos').update({discord_error:/^[A-Z_0-9]+$/.test(code)?code:'ENVIO_PENDIENTE',discord_lease:new Date(Date.now()+60000).toISOString()}).eq('id',id).eq('discord_lease',lease);return {pendiente:true};}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return out({error:'METODO'},405);
 try{
 if(Number(req.headers.get('content-length')||0)>2048)return out({error:'TAMANO'},413);const b=await req.json();
 const {data:cfg,error}=await sb.from('bot_cfg').select('clave,valor').in('clave',['token','secreto','guild_id','canal_cierres']);if(error)throw Error('CONFIGURACION');const c=Object.fromEntries((cfg||[]).map(x=>[x.clave,x.valor]));
 if(b.cron===true){if(!c.secreto||c.secreto.length<32||b.secreto!==c.secreto)return out({error:'NO'},403);const {data}=await sb.from('hg_caja_recuentos').select('id').eq('estado','cerrada').is('discord_id',null).or('discord_lease.is.null,discord_lease.lt.'+new Date().toISOString()).order('creado').limit(5);let enviados=0;for(const r of data||[])if((await publicar(r.id,c)).publicado)enviados++;return out({ok:true,enviados});}
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return out({error:'SIN_CUENTA'},401);
 const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const {data:chief,error:ae}=await caller.rpc('hg_es_jefe');if(ae||!chief)return out({error:'SOLO_JEFES'},403);
 if(!/^[0-9a-f-]{36}$/.test(String(b.id||'')))return out({error:'RECUENTO'},400);
 const {data:r}=await sb.from('hg_caja_recuentos').select('estado,discord_id,discord_canal').eq('id',b.id).maybeSingle();if(!r||r.estado!=='cerrada')return out({error:'CAJA_NO_CERRADA'},409);
 if(r.discord_id)return out({ok:true,publicado:true,url:'https://discord.com/channels/'+c.guild_id+'/'+r.discord_canal+'/'+r.discord_id});
 return out({ok:true,...await publicar(b.id,c)});
 }catch{return out({error:'NO_DISPONIBLE'},503);}
});
