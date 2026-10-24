// La misma instantánea que genera el albarán actualiza los mensajes de texto existentes.
export function textoPedido(p:any){
 const closed=!!(p.cancelled||p.received||p.completedAt),money=(n:any)=>'$'+(Number(n||0)/100).toFixed(2);
 const lines=(p.items||[]).map((x:any)=>'• '+x.qty+' × '+x.material+' · '+money(x.price)+' / ud.'+(x.rq?' · recibidas '+x.rq:''));
 const total='\n\n**Total actualizado: '+money(p.totalCents)+'**\n'+(p.paid?'Pagado':p.abonoCents?'Abonado: '+money(p.abonoCents)+' · Pendiente: '+money(Number(p.totalCents)-Number(p.abonoCents)):'Pendiente de pago')+' · '+(p.cancelled?'Cancelado':p.received?'Recibido':'Pendiente de recibir');
 return {allowed_mentions:{parse:[]},embeds:[{title:('🚂 Pedido '+(p.code||p.id)+' · '+(p.proveedor||'')).slice(0,256),description:lines.join('\n').slice(0,3900-total.length)+total,color:closed?0x3e684c:0xc2702a,footer:{text:'Harrington Gunsmith'+(p.ediciones?' · ampliación '+p.ediciones:'')}}],components:!closed&&!p.propuesta?[{type:1,components:[{type:2,style:3,label:'Recibido entero',emoji:{name:'📦'},custom_id:'ped:rec:'+p.id}]}]:[]};
}
export async function sincronizarTexto(sb:any,api:any,canal:string,p:any,id:string){
 const {data:f,error}=await sb.from('bot_pedmsg').select('mensaje_id').eq('pedido_id',id).maybeSingle();if(error)throw Error('TEXTO_REFERENCIA');
 // Si fue borrado, no creamos una segunda tarjeta: el albarán conserva el pedido vigente.
 const patch=async(path:string,payload:any)=>{try{await api('PATCH',path,payload)}catch(e){if(!String(e).includes('DISCORD_404'))throw e}};
 const text=textoPedido(p);
 if(f?.mensaje_id)await patch('/channels/'+canal+'/messages/'+f.mensaje_id,text);
 const {data:a,error:ae}=await sb.from('hg_reposicion_avisos').select('message_id,channel_id,ic_message_id').eq('pedido_id',id).maybeSingle();if(ae)throw Error('TEXTO_PRIVADO_REFERENCIA');
 if(a?.message_id&&a.channel_id){const {components,...body}=text;await patch('/channels/'+a.channel_id+'/messages/'+a.message_id,{...body,content:'🎩 Pedido actualizado · '+p.proveedor});}
 if(a?.ic_message_id&&a.channel_id){const content=String(p.proveedor||'Estimados señores')+':\n\nLes escribe Vincent Harrington, de la Armería Harrington Gunsmith. El encargo actualizado queda de la siguiente manera:\n\n'+(p.items||[]).map((x:any)=>'— '+x.qty+' × '+x.material).join('\n')+'\n\nTotal: $'+(Number(p.totalCents||0)/100).toFixed(2)+'.\n'+(p.paid?'El importe está abonado.':'El importe pendiente se abonará a la recepción.')+'\n\nMuchas gracias por su atención.\nAtentamente,\nVincent Harrington\nArmería Harrington Gunsmith · Saint Denis · Telegrama SD8112';if(content.length>2000)throw Error('TELEGRAMA_DEMASIADO_LARGO');await patch('/channels/'+a.channel_id+'/messages/'+a.ic_message_id,{content,allowed_mentions:{parse:[]}});}
}
