type Any=any;
export async function runReposicion(sb:Any,c:Record<string,string>,request=fetch){
 const checked=(r:Any)=>{if(r.error)throw Error('REPOSICION_BASE_DE_DATOS');return r.data;};
 const plan=checked(await sb.rpc('hg_reponer_herreria'));
 const jobs=checked(await sb.from('hg_reposicion_avisos').select('*').eq('status','pending').lte('next_at',new Date().toISOString()).order('created_at').limit(3))||[];
 let sent=0,pending=0;
 async function api(method:string,path:string,body?:Any){
  const r=await request('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const value=await r.json().catch(()=>null);
  if(!r.ok){const e:Any=Error('DISCORD_'+r.status);e.status=r.status;e.code=value?.code;throw e;}
  return value;
 }
 for(const job of jobs){
  const key='reposicion:'+job.pedido_id;
  if(checked(await sb.rpc('hg_discord_reservar',{p_key:key}))!==true){pending++;continue;}
  try{
   const cfg=checked(await sb.from('datos').select('valor').eq('clave','cfg:reposicion-herreria').single())?.valor;
   const binding=checked(await sb.from('hg_discord_bindings').select('discord_id').eq('emp_id',cfg?.ownerEmp||'').maybeSingle());
   if(!cfg?.enabled||job.recipient_id!==cfg.recipientId||binding?.discord_id!==job.recipient_id)throw Error('DESTINATARIO_REPOSICION_CAMBIADO');
   const order=checked(await sb.from('datos').select('valor').eq('clave','pedido:'+job.pedido_id).maybeSingle())?.valor;
   if(!order||order.deleted||order.cancelled||order.received||order.completedAt){checked(await sb.from('hg_reposicion_avisos').update({status:'cancelled'}).eq('pedido_id',job.pedido_id));continue;}
   let channel=job.channel_id;
   if(!channel){channel=(await api('POST','/users/@me/channels',{recipient_id:job.recipient_id}))?.id;if(!channel)throw Error('CANAL_PRIVADO_INVALIDO');checked(await sb.from('hg_reposicion_avisos').update({channel_id:channel}).eq('pedido_id',job.pedido_id));}
   let message=job.message_id;
   // Tras una respuesta perdida, busca la referencia antes de volver a enviar.
   if(!message&&job.attempts>0){
    let before='',complete=false;
    for(let page=0;page<10;page++){
     const batch=await api('GET','/channels/'+channel+'/messages?limit=100'+(before?'&before='+before:''));if(!Array.isArray(batch))throw Error('RECUPERACION_PRIVADA_INVALIDA');
     message=batch.find((m:Any)=>(m.embeds||[]).some((e:Any)=>e.footer?.text==='Reposición '+job.pedido_id))?.id;
     if(message||batch.length<100||batch.some((m:Any)=>Date.parse(m.timestamp)<Date.parse(job.created_at))){complete=true;break;}before=batch[batch.length-1].id;
    }
    if(!complete)throw Error('RECUPERACION_PRIVADA_INCOMPLETA');
   }
   if(!message){
    checked(await sb.from('hg_reposicion_avisos').update({attempts:job.attempts+1}).eq('pedido_id',job.pedido_id));
    const response=await api('POST','/channels/'+channel+'/messages',{allowed_mentions:{parse:[]},nonce:job.nonce,enforce_nonce:true,
     content:'🎩 He creado el pedido **'+order.code+'** por mínimos de almacén. Está **sin pagar y sin recibir**. Aquí tienes el telegrama listo para copiar y enviarlo a la herrería:',
     embeds:[{title:'Telegrama para '+order.proveedor,description:job.texto,color:0xC9A24A,footer:{text:'Reposición '+job.pedido_id}}]});
    message=response?.id;if(!message)throw Error('RESPUESTA_PRIVADA_INVALIDA');
   }
   checked(await sb.from('hg_reposicion_avisos').update({status:'sent',message_id:message,sent_at:new Date().toISOString(),last_error:null}).eq('pedido_id',job.pedido_id));sent++;
  }catch(e){
   const err=e as Any,code=/^[A-Z_0-9]+$/.test(err.message)?err.message:'REPOSICION_ENVIO_PENDIENTE';
   const delay=err.code===50007?3600000:Math.min(900000,30000*2**Math.min(job.attempts,5));
   checked(await sb.from('hg_reposicion_avisos').update({attempts:job.attempts+1,last_error:code,next_at:new Date(Date.now()+delay).toISOString()}).eq('pedido_id',job.pedido_id));pending++;
  }finally{await sb.from('hg_discord_leases').delete().eq('clave',key);}
 }
 return {created:!!plan?.created,pedido:plan?.pedido?.code||null,sent,pending};
}
