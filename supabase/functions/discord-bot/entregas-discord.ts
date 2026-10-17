// Entregas confirmadas en la misma transacción que el stock o el fichaje.
export function textoFichaje(f:any){
 const salida=String(f.ref).startsWith('turno:');
 if(f.deleted||!Number.isFinite(f.start)||f.start<=0||!f.name||salida&&(!Number.isFinite(f.end)||f.end<f.start))throw Error('FICHAJE_NO_CONFIRMADO');
 const fecha=(n:number)=>new Date(n).toLocaleString('es-ES',{timeZone:'Europe/Madrid'});
 return {title:(salida?'SALIDA · ':'ENTRADA · ')+f.name,description:'Desde: '+fecha(f.start)+(salida?'\nHasta: '+fecha(f.end):'')};
}
export async function entregarDiscord(sb:any,request=fetch){
 const now=()=>new Date().toISOString();
 const {data:jobs,error}=await sb.from('hg_discord_outbox').select('*').lte('next_at',now()).order('next_at').limit(8);
 if(error)throw Error('COLA_DISCORD_NO_DISPONIBLE');
 let sent=0,pending=0;const started=Date.now();
 for(const job of jobs||[]){
  if(Date.now()-started>20000)break;
  const key=job.kind+':'+job.record_key;
  const claim=await sb.rpc('hg_discord_reservar',{p_key:key});
  if(claim.error)throw Error('RESERVA_DISCORD_NO_DISPONIBLE');
  if(claim.data!==true){pending++;continue;}
  try{
   const {data:cfg,error:ce}=await sb.from('datos').select('valor').eq('clave','discord').single();
   if(ce||!cfg?.valor?.ev?.[job.kind])throw Error('CANAL_DESACTIVADO');
   const hook=cfg.valor.urls?.[job.kind]||cfg.valor.url;
   if(!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?(?:\?.*)?$/.test(hook||''))throw Error('CANAL_NO_CONFIGURADO');
   const url=new URL(hook);url.search='';url.searchParams.set('wait','true');const wid=url.pathname.split('/')[3];
   let msg:any;
   if(job.kind==='fichajes')msg=textoFichaje(job.snapshot);
   else{
    const {data:rows,error:se}=await sb.from('stock').select('producto,cantidad,minimo').order('producto');if(se)throw Error('STOCK_NO_DISPONIBLE');
    msg={title:job.kind==='stock'?'STOCK DE PRODUCTOS':'ALMACÉN DE MATERIALES',description:(rows||[]).filter((x:any)=>(x.producto.startsWith('mat:')||x.producto==='Pólvora')===(job.kind==='materiales')).map((x:any)=>x.producto.replace(/^mat:/,'')+' · '+x.cantidad+(x.minimo>0&&x.cantidad<=x.minimo?' ⚠':'')).join('\n')||'Sin existencias registradas.'};
   }
   const {data:old,error:me}=await sb.from('hg_discord_messages').select('message_id,webhook_id').eq('kind',job.kind).eq('record_key',job.record_key).maybeSingle();if(me)throw Error('REFERENCIA_NO_DISPONIBLE');
   const base=url.toString(),edit=old?.webhook_id===wid&&old.message_id;
   if(edit)url.pathname=url.pathname.replace(/\/$/,'')+'/messages/'+edit;
   const body=JSON.stringify({username:'Harrington Gunsmith',allowed_mentions:{parse:[]},embeds:[{title:String(msg.title).slice(0,250),description:String(msg.description).slice(0,3900),color:0xC9A24A,footer:{text:'Harrington · Registro confirmado'},timestamp:now()}]});
   const send=(u:string,method:string)=>request(u,{method,headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(10000)});
   let response=await send(url.toString(),edit?'PATCH':'POST');
   if(response.status===404&&edit)response=await send(base,'POST');
   if(!response.ok)throw Error('DISCORD_'+response.status);
   const result=await response.json();if(!result.id)throw Error('RESPUESTA_DISCORD_INVALIDA');
   const saved=await sb.from('hg_discord_messages').upsert({kind:job.kind,record_key:job.record_key,message_id:String(result.id),webhook_id:wid},{onConflict:'kind,record_key'});if(saved.error)throw Error('REFERENCIA_NO_GUARDADA');
   if(job.kind!=='fichajes'){const ref=await sb.rpc('hg_discord_referencia',{p_kind:job.kind,p_id:String(result.id),p_webhook:wid});if(ref.error)throw Error('REFERENCIA_NO_GUARDADA');}
   // No borrar una modificación que haya llegado mientras se enviaba.
   const removed=await sb.from('hg_discord_outbox').delete().eq('kind',job.kind).eq('record_key',job.record_key).eq('version',job.version);if(removed.error)throw Error('CONFIRMACION_NO_GUARDADA');
   await sb.from('datos').upsert({clave:'dcerr:'+job.kind,valor:{deleted:true,ts:Date.now()},actualizado:now()},{onConflict:'clave'});
   sent++;
  }catch(e){
   const code=/^[A-Z_0-9]+$/.test((e as Error).message)?(e as Error).message:'ENVIO_NO_DISPONIBLE';
   const attempts=job.attempts+1,next=new Date(Date.now()+Math.min(300000,15000*2**Math.min(attempts,5))).toISOString();
   await sb.from('hg_discord_outbox').update({attempts,next_at:next,last_error:code}).eq('kind',job.kind).eq('record_key',job.record_key).eq('version',job.version);
   await sb.from('datos').upsert({clave:'dcerr:'+job.kind,valor:{kind:job.kind,st:Number(code.match(/\d{3}$/)?.[0]||0),ts:Date.now(),since:Date.now(),by:'Servidor',code},actualizado:now()},{onConflict:'clave'});
   pending++;
  }finally{await sb.from('hg_discord_leases').delete().eq('clave',key);}
 }
 return {sent,pending};
}
