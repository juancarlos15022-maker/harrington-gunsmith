export async function canalCancelados(sb:any,api:any,origen:string){
 const source=await api('GET','/channels/'+origen);
 const list=await api('GET','/guilds/'+source.guild_id+'/channels');
 let target=list.find((x:any)=>x.parent_id===source.parent_id&&x.name==='❌・pedidos-cancelados');
 if(!target)target=await api('POST','/guilds/'+source.guild_id+'/channels',{name:'❌・pedidos-cancelados',type:0,parent_id:source.parent_id,permission_overwrites:source.permission_overwrites,topic:'Pedidos cancelados y propuestas anuladas. Archivo de cancelaciones de proveedores.'});
 if(target.position!==source.position+1)await api('PATCH','/guilds/'+source.guild_id+'/channels',[{id:target.id,position:source.position+1}]);
 const r=await sb.from('bot_cfg').upsert({clave:'canal_pedidos_cancelados',valor:target.id});if(r.error)throw Error('CANAL_CANCELADOS_CONFIG');return target.id;
}
export function esCancelado(m:any,orders:any[]){const text=[m.content||'',...(m.embeds||[]).map((x:any)=>[x.title,x.description,x.footer?.text].join('\n'))].join('\n');const known=orders.find(p=>p.code&&text.includes(p.code));if(known&&!known.cancelled)return false;return orders.some(p=>p.cancelled&&p.code&&text.includes(p.code))||/pedido cancelado|propuesta[^\n]{0,100}anulada|cancelaci[oó]n[^\n]{0,30}pedido|\bCANCELADO\b|\bANULADA\b/i.test(text)}
async function archivarSinCerrojo(sb:any,api:any,source:string,target:string){
 const r=await sb.from('datos').select('valor').like('clave','pedido:%');if(r.error)throw Error('CANCELADOS_DATOS');const orders=(r.data||[]).map((x:any)=>x.valor);
 let before='',moved=0,scanned=0;
 for(let page=0;page<20;page++){
  const messages=await api('GET','/channels/'+source+'/messages?limit=100'+(before?'&before='+before:''));if(!messages.length)break;
  for(const m of messages){scanned++;if(!m.author?.bot||!esCancelado(m,orders))continue;
   const old=await sb.from('hg_pedidos_cancelados_archivo').select('*').eq('origen',m.id).maybeSingle();if(old.error)throw Error('ARCHIVO_LECTURA');let id=old.data?.destino;
   if(!id){
    const order=orders.find((p:any)=>p.cancelled&&p.code&&[m.content||'',...(m.embeds||[]).map((e:any)=>e.title||'')].join(' ').includes(p.code));
    const payload:any={content:('❌ PEDIDO CANCELADO'+(order?' · '+order.code+' · '+order.proveedor:'')+'\n'+(m.content||'')).slice(0,2000),embeds:(m.embeds||[]).map((e:any)=>({title:e.title,description:e.description,color:0x8b3a32,fields:e.fields,footer:e.footer,image:e.image?{url:e.image.url}:undefined})),allowed_mentions:{parse:[]},nonce:('can'+m.id).slice(0,25),enforce_nonce:true};
    // Copiar los archivos antes de borrar el original: sus imágenes no dependen del mensaje eliminado.
    const files=[];for(const a of m.attachments||[]){const f=await fetch(a.url);if(!f.ok)throw Error('ARCHIVO_DESCARGA');files.push({name:a.filename,blob:await f.blob(),url:a.url})}
    for(const e of payload.embeds){if(e.image?.url&&!files.some((f:any)=>f.url===e.image.url)){const f=await fetch(e.image.url);if(!f.ok)throw Error('ARCHIVO_IMAGEN');files.push({name:'Albaran_'+files.length+'.png',blob:await f.blob(),url:e.image.url})}const image=files.find((f:any)=>f.url===e.image?.url);if(image)e.image={url:'attachment://'+image.name}}
    const form=new FormData();payload.attachments=files.map((f:any,i:number)=>({id:i,filename:f.name}));form.set('payload_json',JSON.stringify(payload));files.forEach((f:any,i:number)=>form.set('files['+i+']',new File([f.blob],f.name)));const posted=await api('POST','/channels/'+target+'/messages',form);id=posted.id;
    const saved=await sb.from('hg_pedidos_cancelados_archivo').insert({origen:m.id,destino:id,canal_origen:source});if(saved.error)throw Error('ARCHIVO_GUARDAR');
   }
   // Verificar existencia de la copia antes de retirar el mensaje original.
   await api('GET','/channels/'+target+'/messages/'+id);const ref=await sb.from('hg_albaranes_pedidos').update({mensaje:id,canal:target}).eq('mensaje',m.id).eq('canal',source);if(ref.error)throw Error('ARCHIVO_REFERENCIA');await api('DELETE','/channels/'+source+'/messages/'+m.id);const saved=await sb.from('hg_pedidos_cancelados_archivo').update({borrado:true}).eq('origen',m.id);if(saved.error)throw Error('ARCHIVO_CONFIRMAR');moved++;if(moved>=12)return {moved,scanned,pendiente:true};
  }
  before=messages.at(-1).id;if(messages.length<100)break;
 }
 return {moved,scanned,pendiente:false};
}

export async function archivarCancelados(sb:any,api:any,source:string,target:string){const key='archivo:pedidos-cancelados';const lock=await sb.rpc('hg_discord_reservar',{p_key:key});if(lock.error)throw Error('ARCHIVO_CERROJO');if(lock.data!==true)return {moved:0,ocupado:true};try{return await archivarSinCerrojo(sb,api,source,target)}finally{await sb.from('hg_discord_leases').delete().eq('clave',key)}}
