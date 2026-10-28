import {vistaPrivada} from './reposicion.ts';
export async function enviarCopias(sb:any,c:any,request=fetch,solo?:string){
 const {data:jobs,error}=await sb.rpc('hg_reposicion_copias_preparar',{p_pedido:solo||null});if(error)throw Error('COPIAS_PENDIENTES');let sent=0;
 const api=async(method:string,path:string,body:any)=>{let r=await request('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(r.status===429){const j=await r.json();await new Promise(done=>setTimeout(done,Math.min(5000,Math.ceil(Number(j.retry_after||1)*1000))));r=await request('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}if(!r.ok)throw Error('DISCORD_'+r.status);return r.json();};
 for(const job of jobs||[]){const key='rep-jefe:'+job.pedido_id+':'+job.emp_id;const lock=await sb.rpc('hg_discord_reservar',{p_key:key});if(lock.data!==true)continue;
 try{let channel=job.channel_id,message=job.message_id;
 if(!channel){channel=(await api('POST','/users/@me/channels',{recipient_id:job.recipient_id})).id;const r=await sb.from('hg_reposicion_copias').update({channel_id:channel}).eq('pedido_id',job.pedido_id).eq('emp_id',job.emp_id);if(r.error)throw Error('COPIA_CANAL');}
 const payload={...vistaPrivada(job.pedido,job),allowed_mentions:{parse:[]},nonce:('j'+job.pedido_id+job.emp_id).replace(/[^a-zA-Z0-9]/g,'').slice(-25),enforce_nonce:true};
 const result=await api(message?'PATCH':'POST','/channels/'+channel+'/messages'+(message?'/'+message:''),payload);
 const save=await sb.from('hg_reposicion_copias').update({message_id:result.id,sent_version:job.version_actual,last_error:null}).eq('pedido_id',job.pedido_id).eq('emp_id',job.emp_id);if(save.error)throw Error('COPIA_CONFIRMACION');sent++;
 }catch(e){await sb.from('hg_reposicion_copias').update({attempts:job.attempts+1,last_error:String(e).slice(0,100),next_at:new Date(Date.now()+60000).toISOString()}).eq('pedido_id',job.pedido_id).eq('emp_id',job.emp_id);}
 finally{await sb.from('hg_discord_leases').delete().eq('clave',key);}}
 return sent;
}
