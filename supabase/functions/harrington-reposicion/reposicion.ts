type Any=any;
// 20/10/2026: el pedido automático es una PROPUESTA hasta que la Dirección la acepta desde su privado.
// Mientras tanto se ajusta solo cada minuto (SQL) y aquí se refleja en el privado y en la tarjeta del canal de pedidos.
// Al aceptarla se bloquea y llega al privado un telegrama IC de Vincent Harrington para el proveedor.
export const WEB='https://juancarlos15022-maker.github.io/harrington-gunsmith/';
const COMPRAS=0xC2702A, VERDE=0x3E8E4E, APAGADO=0x6B4C1D;
export const dolar=(c:unknown)=>'$'+(Number(c||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function madrid(ms:number){const p:Record<string,string>={};for(const x of new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ms)))p[x.type]=x.value;return p;}
const fechaHora=(ms:number)=>{const m=madrid(ms);return m.day+'/'+m.month+' a las '+m.hour+':'+m.minute;};
export const abierto=(o:Any)=>!!o&&!o.deleted&&!o.cancelled&&!o.received&&!o.completedAt;
export const gestionada=(o:Any)=>!!o&&(o.propuesta!==undefined||String(o.origen||'').startsWith('reposicion-'));
const lineas=(o:Any)=>(o.items||[]).map((x:Any)=>'• '+x.qty+' × '+x.material+(x.price?' a '+dolar(x.price):'')).join('\n');

/* ---------- telegrama IC: Vincent Harrington escribe al establecimiento, sin números de pedido ---------- */
const MASA=new Set(['hierro','carbón','carbon','sal','azufre','pólvora','polvora','fibra','tela','grasa animal','papel']);
function plural(w:string){const l=w.toLowerCase();if(/[aeiouáéó]$/.test(l))return w+'s';if(/ón$/.test(l))return w.slice(0,-2)+'ones';if(/on$/.test(l))return w+'es';if(/z$/.test(l))return w.slice(0,-1)+'ces';return w+'es';}
export function nombreIC(material:string,qty:number){
 const m=String(material||'').trim(), l=m.toLowerCase();
 if(l==='hierro'||l==='mena de hierro')return qty+(qty===1?' mena':' menas')+' de hierro';
 if(l==='carbón'||l==='carbon'||l==='mena de carbón')return qty+(qty===1?' mena':' menas')+' de carbón';
 if(MASA.has(l))return qty+' unidades de '+l;
 if(qty===1)return '1 '+l;
 const w=l.split(' ');w[0]=plural(w[0]);if(w.length>1&&w[w.length-1]==='especial')w[w.length-1]='especiales';
 return qty+' '+w.join(' ').replace(/^canones/,'cañones').replace(/^cañons/,'cañones');
}
function pick<T>(a:T[],seed:string){let h=0;for(const ch of seed)h=(h*31+ch.charCodeAt(0))>>>0;return a[h%a.length];}
export function telegramaIC(o:Any){
 const ms=Number(o.aceptadoAt||o.ts||Date.now()), h=+madrid(ms).hour, seed=String(o.id||o.code||'');
 const saludo=h>=6&&h<14?'Buenos días':h>=14&&h<21?'Buenas tardes':'Buenas noches';
 const nombre=String(o.aceptadoPor||'Vincent Harrington'), telegram=String(o.aceptadoTelegram||(nombre==='Chester Harrington'?'SD2399':nombre==='Vincent Harrington'?'SD8112':''));
 const prov=String(o.proveedor||'el establecimiento');
 const intro=pick(['Les escribe Vincent Harrington, de la Armería Harrington Gunsmith de Saint Denis. Quisiera hacerles el siguiente encargo:',
  'Soy Vincent Harrington, de la Armería Harrington Gunsmith. Les agradecería que me prepararan el siguiente encargo:',
  'Les saluda Vincent Harrington, de la Armería Harrington Gunsmith de Saint Denis. Necesitaría que me tuvieran listo lo siguiente:'],seed).replace(/Vincent Harrington/g,nombre);
 const pago=o.paid?'El importe ya está abonado.':pick(['Abonaré el importe cuando lo reciba, como de costumbre.','Pagaré en cuanto me llegue la mercancía, como acostumbramos.','El pago, como siempre, a la recepción del encargo.'],seed+'p');
 const aviso=pick(['Les ruego que me avisen por telegrama cuando vayan a traérmelo a la armería.','Avísenme, por favor, cuando esté listo para traérmelo.','Quedo a la espera de recibirlo en la armería.'],seed+'a');
 const gracias=pick(['Les quedo muy agradecido por su diligencia.','Muchas gracias de antemano por su atención.','Les agradezco de veras su buen hacer.'],seed+'g');
 const adios=pick(['Reciban un cordial saludo,','Atentamente,','Sin otro particular, les saluda atentamente,'],seed+'d');
 const lista=(o.items||[]).map((x:Any)=>'— '+nombreIC(x.material,Number(x.qty))).join('\n');
 return `${prov}:\n\n${saludo}. ${intro}\n\n${lista}\n\n${pago} ${aviso}\n\n${gracias}\n\n${adios}\n${nombre}\nArmería Harrington Gunsmith · Saint Denis${telegram?' · Telegrama '+telegram:''}`;
}

/* ---------- vistas ---------- */
// botón para volver a abrir la página del pedido aceptado (telegrama + albarán descargable); no pide inicio de sesión
const verAlbaran=(job:Any)=>job.token?[{type:1,components:[{type:2,style:5,label:'Ver pedido y albarán',emoji:{name:'🧾'},url:WEB+'aceptar.html?t='+job.token}]}]:[];
export function vistaPrivada(o:Any,job:Any){
 const foot={text:'Reposición '+job.pedido_id};
 const total='\n\n**Total:** '+dolar(o.totalCents)+(o.paid?' · pagado':' · se paga a la entrega');
 if(o.propuesta&&abierto(o)){
  const act=o.propActualizadaTs&&o.propVersion>1?'\n\n*Actualizada el '+fechaHora(o.propActualizadaTs)+'.*':'';
  return {content:'🎩 **Propuesta de pedido** para **'+o.proveedor+'**. Se ajusta sola mientras se gasta el material del almacén. Cuando la des por buena, pulsa **Aceptar propuesta**: queda cerrada y te preparo el telegrama para el proveedor.',
   embeds:[{title:'📝 Propuesta · '+o.proveedor,description:lineas(o)+total+act,color:COMPRAS,footer:foot}],
   components:[{type:1,components:[{type:2,style:5,label:'Aceptar propuesta',emoji:{name:'✅'},url:WEB+'aceptar.html?t='+job.token}]}]};
 }
 if(o.cancelled){
  const motivo=o.propuestaCerrada==='sin-faltas'?'Ya no hace falta: el almacén está cubierto por las existencias o por otros pedidos.':'El pedido se ha cancelado.';
  return {content:'🎩 Propuesta para **'+o.proveedor+'** anulada. '+motivo,embeds:[{title:'Anulada · '+o.proveedor,description:lineas(o),color:APAGADO,footer:foot}],components:[]};
 }
 if(o.received||o.completedAt)return {content:'🎩 El pedido a **'+o.proveedor+'** ya está recibido y en el almacén.',embeds:[{title:'📦 Recibido · '+o.proveedor,description:lineas(o)+total,color:VERDE,footer:foot}],components:o.aceptadoAt?verAlbaran(job):[]};
 if(o.aceptadoAt)return {content:'✅ **Propuesta aceptada** el '+fechaHora(o.aceptadoAt)+'. Ya no se suman más materiales a este pedido. Debajo tienes el telegrama para **'+o.proveedor+'**, listo para copiar.',
  embeds:[{title:'✅ Pedido aceptado · '+o.proveedor,description:lineas(o)+total,color:COMPRAS,footer:foot},{title:'Telegrama para el proveedor',description:telegramaIC(o),color:COMPRAS}],components:verAlbaran(job)};
 // pedido que dejó de ser propuesta por otra vía (pagado o recibido en parte desde la web)
 return {content:'🎩 El pedido a **'+o.proveedor+'** ya está en marcha (pagado o recibido en parte desde la web): ya no se ajusta solo.',embeds:[{title:'Pedido en marcha · '+o.proveedor,description:lineas(o)+total,color:VERDE,footer:foot}],components:[]};
}
export function tarjetaEmpresa(o:Any){
 const a=abierto(o);
 const nota=a?(o.propuesta?'\n\n📝 **Propuesta automática, aún sin encargar.** Las cantidades se ajustan solas según se gasta el material, hasta que la Dirección la acepte.':'\n\nCuando llegue la mercancía, pulse **Recibido entero** y el material entrará en el almacén de la web. Si llega solo una parte, apúntelo en la web (PEDIDOS).'):'';
 const pie=a?(o.propuesta?'Propuesta del '+(o.date||'')+' '+(o.time||'')+(o.propVersion>1?' · actualizada el '+fechaHora(o.propActualizadaTs):'')+' · Señor Harrington':o.aceptadoAt?'Aceptado por '+(o.aceptadoPor||'la Dirección')+' el '+fechaHora(o.aceptadoAt)+' · Señor Harrington':'Emitido el '+(o.date||'')+' '+(o.time||'')+' · Señor Harrington')
  :o.cancelled?(o.propuestaCerrada==='sin-faltas'?'Propuesta anulada: ya no hacía falta · Señor Harrington':'Pedido cancelado · Señor Harrington'):'✅ Recibido por '+(o.receivedBy||'—')+' · material en el almacén';
 return {embeds:[{title:(o.propuesta&&a?'📝 Propuesta ':'🚂 Pedido ')+o.code+' · '+String(o.proveedor||'').slice(0,60),color:a?COMPRAS:o.cancelled?APAGADO:VERDE,
  description:lineas(o)+'\n\n**Total:** '+dolar(o.totalCents)+' · '+(o.paid?'pagado por adelantado':'se paga a la entrega')+nota,footer:{text:pie}}],
  // una propuesta sin aceptar aún no está encargada: no se puede recibir (20/10/2026, tras pulsarlo por error)
  components:a&&!o.propuesta?[{type:1,components:[{type:2,style:3,label:'Recibido entero',emoji:{name:'📦'},custom_id:'ped:rec:'+o.id}]}]:[]};
}

export async function runReposicion(sb:Any,c:Record<string,string>,request=fetch,solo?:string){
 const checked=(r:Any)=>{if(r.error)throw Error('REPOSICION_BASE_DE_DATOS');return r.data;};
 const plan=solo?null:checked(await sb.rpc('hg_reponer_herreria'));
 const mina=solo?null:checked(await sb.rpc('hg_reponer_mina'));
 // 20/10/2026: la Tala Annesburg, con su lote por material (un fallo aquí no frena la herrería ni la mina)
 let tala:Any=null;if(!solo){const t=await sb.rpc('hg_reponer_tala');if(!t.error)tala=t.data;}
 let q=sb.from('hg_reposicion_avisos').select('*').eq('status','pending').lte('next_at',new Date().toISOString()).order('created_at').limit(3);
 if(solo)q=sb.from('hg_reposicion_avisos').select('*').eq('status','pending').eq('pedido_id',solo).limit(1);
 const jobs=checked(await q)||[];
 let sent=0,pending=0,updated=0;
 async function api(method:string,path:string,body?:Any){
  const r=await request('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const value=await r.json().catch(()=>null);
  if(!r.ok){const e:Any=Error('DISCORD_'+r.status);e.status=r.status;e.code=value?.code;throw e;}
  return value;
 }
 const avisos=(v:Any,id:string)=>sb.from('hg_reposicion_avisos').update(v).eq('pedido_id',id);
 for(const job of jobs){
  const key='reposicion:'+job.pedido_id;
  if(checked(await sb.rpc('hg_discord_reservar',{p_key:key}))!==true){pending++;continue;}
  try{
   const cfg=checked(await sb.from('datos').select('valor').eq('clave',job.config_key||'cfg:reposicion-herreria').single())?.valor;
   const binding=checked(await sb.from('hg_discord_bindings').select('discord_id').eq('emp_id',cfg?.ownerEmp||'').maybeSingle());
   if(!cfg?.enabled||job.recipient_id!==cfg.recipientId||binding?.discord_id!==job.recipient_id)throw Error('DESTINATARIO_REPOSICION_CAMBIADO');
   const order=checked(await sb.from('datos').select('valor').eq('clave','pedido:'+job.pedido_id).maybeSingle())?.valor;
   if(!order||order.deleted||order.cancelled||order.received||order.completedAt){checked(await avisos({status:'cancelled'},job.pedido_id));continue;}
   let channel=job.channel_id;
   if(!channel){channel=(await api('POST','/users/@me/channels',{recipient_id:job.recipient_id}))?.id;if(!channel)throw Error('CANAL_PRIVADO_INVALIDO');checked(await avisos({channel_id:channel},job.pedido_id));}
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
    checked(await avisos({attempts:job.attempts+1},job.pedido_id));
    const body=gestionada(order)&&job.token?vistaPrivada(order,job):{
     content:'🎩 He '+(order.ampliacion?'actualizado':'creado')+' el pedido **'+order.code+'** por mínimos de almacén. Está **pendiente de completar el pago y de recibir**. Aquí tienes el telegrama listo para copiar y enviarlo al proveedor:',
     embeds:[{title:'Telegrama para '+order.proveedor,description:job.texto,color:0xC9A24A,footer:{text:'Reposición '+job.pedido_id}}]};
    const response=await api('POST','/channels/'+channel+'/messages',{allowed_mentions:{parse:[]},nonce:job.nonce,enforce_nonce:true,...body});
    message=response?.id;if(!message)throw Error('RESPUESTA_PRIVADA_INVALIDA');
   }
   checked(await avisos({status:'sent',message_id:message,sent_at:new Date().toISOString(),last_error:null,sent_version:job.version??1},job.pedido_id));sent++;
  }catch(e){
   const err=e as Any,code=/^[A-Z_0-9]+$/.test(err.message)?err.message:'REPOSICION_ENVIO_PENDIENTE';
   const delay=err.code===50007?3600000:Math.min(900000,30000*2**Math.min(job.attempts,5));
   checked(await avisos({attempts:job.attempts+1,last_error:code,next_at:new Date(Date.now()+delay).toISOString()},job.pedido_id));pending++;
  }finally{await sb.from('hg_discord_leases').delete().eq('clave',key);}
 }
 // Propuestas ya enviadas: reflejar cambios (privado + canal de pedidos), mandar el telegrama IC al aceptarla y cerrar.
 let q2=sb.from('hg_reposicion_avisos').select('*').eq('status','sent').eq('cerrado',false).order('created_at').limit(10);
 if(solo)q2=sb.from('hg_reposicion_avisos').select('*').eq('status','sent').eq('pedido_id',solo).limit(1);
 const vivos=checked(await q2)||[];
 for(const job of vivos){
  const key='reposicion:'+job.pedido_id;
  if(checked(await sb.rpc('hg_discord_reservar',{p_key:key}))!==true)continue;
  try{
   const order=checked(await sb.from('datos').select('valor').eq('clave','pedido:'+job.pedido_id).maybeSingle())?.valor;
   if(!order||!gestionada(order)){if(!order||!abierto(order))checked(await avisos({cerrado:true},job.pedido_id));continue;}
   const ver=Number(job.version||1);
   // Mientras es propuesta, el cerrojo «recibido-» impide recibirla desde el bot o la web; al aceptarla (o dejar de ser propuesta) se quita.
   const cerrojo='recibido-'+job.pedido_id;
   if(order.propuesta&&abierto(order))await sb.from('datos').upsert({clave:cerrojo,valor:{ts:Date.now(),by:'Propuesta sin aceptar',bloqueo:'propuesta'},actualizado:new Date().toISOString()},{onConflict:'clave',ignoreDuplicates:true});
   else await sb.from('datos').delete().eq('clave',cerrojo).eq('valor->>bloqueo','propuesta');
   // un cambio de estado que no pasó por la propuesta (recibido, pagado, cancelado desde la web) también se refleja
   const firma=(o:Any)=>[!!o.propuesta,!!o.cancelled,!!(o.received||o.completedAt),!!o.paid,!!o.aceptadoAt].join('');
   const cambioExterno=job.ultimo_estado!==undefined&&job.ultimo_estado!==null&&job.ultimo_estado!==firma(order);
   if(job.message_id&&job.channel_id&&(ver>Number(job.sent_version||0)||cambioExterno)){
    await api('PATCH','/channels/'+job.channel_id+'/messages/'+job.message_id,{allowed_mentions:{parse:[]},...vistaPrivada(order,job)});
    checked(await avisos({sent_version:ver},job.pedido_id));updated++;
   }
   if(job.ic_status==='pending'&&job.channel_id){
    const r=await api('POST','/channels/'+job.channel_id+'/messages',{allowed_mentions:{parse:[]},nonce:('ic'+job.nonce).slice(0,25),enforce_nonce:true,content:telegramaIC(order)});
    checked(await avisos({ic_status:'sent',ic_message_id:r?.id||null},job.pedido_id));
   }
   if(!order.propuesta&&!order.cancelled&&c.canal_pedidos&&Number(job.card_version||0)<ver){
    const {data:f}=await sb.from('bot_pedmsg').select('mensaje_id').eq('pedido_id',job.pedido_id).maybeSingle();
    if(f?.mensaje_id){await api('PATCH','/channels/'+c.canal_pedidos+'/messages/'+f.mensaje_id,{allowed_mentions:{parse:[]},...tarjetaEmpresa(order)});checked(await avisos({card_version:ver},job.pedido_id));}
   }
   const fin=!abierto(order)&&job.ic_status!=='pending';
   checked(await avisos({ultimo_estado:firma(order),...(fin?{cerrado:true}:{})},job.pedido_id));
  }catch{/* se reintenta en la próxima revisión */}finally{await sb.from('hg_discord_leases').delete().eq('clave',key);}
 }
 return {created:!!plan?.created||!!mina?.created||!!tala?.created,pedido:plan?.pedido?.code||null,pedidoMina:mina?.pedido?.code||null,pedidoTala:tala?.pedido?.code||null,sent,pending,updated};
}
