// Mejoras de Discord: consultas privadas, ranking en vivo y aviso sin compras automáticas.
import { hoyNum, medianoche } from './comun.ts';
type Any = Record<string, any>;
type Config = Record<string,string>;
const OWNER='1398183011232518164';
const WEB='https://juancarlos15022-maker.github.io/harrington-gunsmith/';
const GOLD=0xC9A24A;
export const normal=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const aliases:Record<string,string>={'mena de hierro':'hierro','menas de hierro':'hierro','mena de carbon':'carbon','menas de carbon':'carbon','tablones':'tabla de madera','tablon':'tabla de madera','tablas de madera':'tabla de madera','trozo madera':'trozo de madera','trozos de madera':'trozo de madera','tornillos':'tornillo','pieza de armas':'pieza de arma','piezas de arma':'pieza de arma','piezas de armas':'pieza de arma','canon de reptidora':'canon de repetidora','canones de repetidora':'canon de repetidora'};
export const materialKey=(s:unknown)=>{const n=normal(String(s??'').replace(/^mat:/,''));return aliases[n]||n;};
const safe=(s:unknown,n=1000)=>String(s??'').replace(/([\\*_~`|>])/g,'\\$1').replace(/@/g,'@\u200b').slice(0,n);
const answer=(title:string,description:string)=>({allowed_mentions:{parse:[]},embeds:[{title,color:GOLD,description:description.slice(0,3900),footer:{text:'Señor Harrington · Casa Harrington'}}]});
const json=(x:unknown)=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
export function direction(c:Config,i:Any){return String(i.member?.user?.id||i.user?.id)===OWNER||['rol_jefe','rol_gerente'].some(k=>c[k]&&(i.member?.roles||[]).includes(c[k]));}
export function staff(c:Config,i:Any){return direction(c,i)||['rol_armero','rol_aprendiz','rol_colaborador'].some(k=>c[k]&&(i.member?.roles||[]).includes(c[k]));}
async function discord(c:Config,method:string,path:string,body?:unknown){
 const send=()=>fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 let r=await send();
 if(r.status===429){const d=await r.json();if(Number(d.retry_after)>5)throw Error('Discord está ocupado; inténtelo en unos segundos.');await new Promise(x=>setTimeout(x,Math.max(100,Number(d.retry_after)*1000)));r=await send();}
 const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error('Discord no ha podido completar la consulta ('+r.status+').'),{status:r.status});return d;
}
const checked=(r:Any)=>{if(r.error)throw Error('No se ha podido consultar la base de datos.');return r.data;};
async function value(sb:Any,key:string){return checked(await sb.from('datos').select('valor').eq('clave',key).maybeSingle())?.valor;}
export function pendingFor(product:string,peds:Any[]){
 const n=materialKey(product);
 return peds.filter(p=>!p.deleted&&!p.cancelled&&!p.received&&!p.completedAt).flatMap(p=>(p.items||[]).filter((x:Any)=>materialKey(x.material)===n).map((x:Any)=>({code:p.code,provider:p.proveedor,qty:Math.max(0,Number(x.qty||0)-Number(x.rq||0))}))).filter(x=>x.qty>0);
}
export function materialRows(stock:Any[],mins:Any,peds:Any[]){
 return stock.filter(s=>String(s.producto).startsWith('mat:')||s.producto==='Pólvora').map(s=>{const min=Number(mins?.[s.producto]??s.minimo??0);return {...s,min,pending:pendingFor(s.producto,peds)};}).filter(s=>Number(s.cantidad)<=0||(s.min>0&&Number(s.cantidad)<s.min));
}
async function materials(sb:Any){
 const [st,mins,peds]=await Promise.all([sb.from('stock').select('producto,cantidad,minimo').order('producto'),value(sb,'stockmin'),sb.from('datos').select('valor').like('clave','pedido:%')]);
 const stocks=checked(st)||[],rows=materialRows(stocks,mins, (checked(peds)||[]).map((x:Any)=>x.valor));
 const configured=stocks.filter((s:Any)=>Number(mins?.[s.producto]??s.minimo??0)>0).length;
 const lines=rows.map((s:Any)=>{const incoming=s.pending.reduce((a:number,x:Any)=>a+x.qty,0);return '**'+safe(s.producto.replace(/^mat:/,''),90)+'** · quedan '+s.cantidad+(s.min>0?' / mínimo '+s.min:' · agotado')+'\n'+(incoming?'🚂 '+incoming+' por recibir: '+s.pending.map((p:Any)=>safe(p.code,35)+' · '+safe(p.provider,70)+' ('+p.qty+')').join('; '):'Sin pedido pendiente de recibir.');});
 return {rows,configured,payload:answer('📦 Materiales y pedidos en camino',(lines.slice(0,18).join('\n\n')||'✅ No hay materiales agotados ni por debajo de los mínimos configurados.')+(lines.length>18?'\n\nHay '+(lines.length-18)+' materiales más; consulte el almacén de la web.':'')+'\n\n'+(configured?'Los mínimos se toman de la web.':'No hay mínimos configurados: se avisa de agotados. Configure los mínimos en el almacén de la web para avisar antes.'))};
}
export async function contacts(sb:Any,query:string,privateAgenda:boolean){
 const q=normal(query);if(q.length<2)return answer('📇 Buscar contactos','Escriba al menos dos caracteres del nombre, negocio o telegrama.');
 const keys=privateAgenda?['clientes','proveedores','agenda']:['clientes','proveedores'];
 const data=checked(await sb.from('datos').select('clave,valor').in('clave',keys))||[];
 const all:Any[]=[];
 for(const r of data)for(const x of Array.isArray(r.valor)?r.valor:[]){if(x.deleted)continue;all.push({name:x.name,tel:x.telegram||x.tel,who:x.tipo||x.type,obs:r.clave==='agenda'?x.obs:x.ubic,source:r.clave});}
 if(privateAgenda){const rows=checked(await sb.from('bot_telegramas_mensajes').select('ficha,publicado_id').order('creada',{ascending:false}).limit(500))||[];for(const r of rows)if(r.publicado_id)all.push({name:r.ficha?.nombre,tel:r.ficha?.tel,who:r.ficha?.quien,obs:r.ficha?.obs,source:'telegramas'});}
 const found=all.filter(x=>normal([x.name,x.tel,x.who,x.obs].join(' ')).includes(q));
 const unique=[...new Map(found.map(x=>[normal(x.name)+'|'+normal(x.tel),x])).values()];
 return answer('📇 Contactos · '+unique.length+' coincidencias',unique.slice(0,10).map(x=>'**'+safe(x.name,100)+'** · '+safe(x.tel||'Sin telegrama',25)+'\n'+safe(x.who||'—',100)+(x.obs&&x.obs!=='—'?' · '+safe(x.obs,120):'')+' · '+safe(x.source,20)).join('\n\n')||'No he encontrado coincidencias.');
}
export function weekStart(now=Date.now()){const d=hoyNum(now);return medianoche(d-((new Date(d*86400000).getUTCDay()+6)%7));}
export function isClip(m:Any){return !m.author?.bot&&((m.attachments||[]).some((a:Any)=>String(a.content_type||'').startsWith('video/')||/\.(mp4|mov|webm|mkv)(?:\?|$)/i.test(a.filename||''))||/https?:\/\/(?:www\.)?(?:youtu\.be|youtube\.com|twitch\.tv|clips\.twitch\.tv|medal\.tv|streamable\.com|outplayed\.tv)\//i.test(m.content||''));}
export async function clips(c:Config){
 if(!c.canal_clips)throw Error('No está configurado el canal de clips.');
 const since=weekStart(),messages:Any[]=[];let before='',limited=false;
 for(let p=0;p<5;p++) {const batch=await discord(c,'GET','/channels/'+c.canal_clips+'/messages?limit=100'+(before?'&before='+before:''));if(!Array.isArray(batch))throw Error('No se pudieron leer los clips.');messages.push(...batch.filter((m:Any)=>Date.parse(m.timestamp)>=since));if(batch.length<100||batch.some((m:Any)=>Date.parse(m.timestamp)<since))break;before=batch[batch.length-1].id;if(p===4)limited=true;}
 const candidates=messages.filter(isClip),scored:Any[]=[];
 for(const m of candidates.slice(0,50)){
  const star=(m.reactions||[]).find((r:Any)=>r.emoji?.name==='⭐'&&!r.emoji?.id),voters=new Set<string>();
  if(star){for(const type of [0,1]){if(type===1&&!star.count_details?.burst)continue;let after='';for(let p=0;p<10;p++){const users=await discord(c,'GET','/channels/'+c.canal_clips+'/messages/'+m.id+'/reactions/%E2%AD%90?limit=100&type='+type+(after?'&after='+after:''));for(const u of users)if(!u.bot)voters.add(u.id);if(users.length<100)break;after=users[users.length-1].id;if(p===9)limited=true;}}}
  if(voters.size)scored.push({m,votes:voters.size});
 }
 scored.sort((a,b)=>b.votes-a.votes||Date.parse(a.m.timestamp)-Date.parse(b.m.timestamp));
 return answer('⭐ Clips destacados de esta semana',(scored.slice(0,10).map((x,k)=>String(k+1)+'. **'+x.votes+' ⭐** · '+safe(x.m.author?.global_name||x.m.author?.username,70)+' · [Ver clip](https://discord.com/channels/'+c.guild_id+'/'+c.canal_clips+'/'+x.m.id+')').join('\n')||'Todavía no hay clips votados esta semana. Suba un vídeo y vote los que le gusten con ⭐.')+'\n\nSemana desde el lunes a las 00:00 (Madrid). Una persona, un voto por clip; no cuentan los bots.'+(limited||candidates.length>50?'\nConsulta limitada a los últimos 500 mensajes y 50 clips de la semana.':''));
}
export async function health(sb:Any,c:Config){
 const start=Date.now();
 const [db,queue,bot,web]=await Promise.allSettled([sb.from('stock').select('producto',{head:true,count:'exact'}),sb.from('hg_discord_outbox').select('kind,attempts,next_at,last_error'),discord(c,'GET','/users/@me'),fetch(WEB,{method:'HEAD',signal:AbortSignal.timeout(6000)})]);
 const good=(r:PromiseSettledResult<any>)=>r.status==='fulfilled'&&!r.value?.error;
 const jobs=good(queue)?(queue as PromiseFulfilledResult<any>).value.data||[]:null;
 const old=checked(await sb.from('bot_equipo').select('updated_at,data').eq('id','mejoras:materiales').maybeSingle());
 return answer('🔒 Estado de conexiones · Dirección',[
  (good(db)?'✅':'⚠️')+' Base de datos: '+(good(db)?'consulta correcta':'no disponible'),
  (good(bot)?'✅':'⚠️')+' Discord / Señor Harrington: '+(good(bot)?'conexión correcta':'no disponible'),
  (web.status==='fulfilled'&&web.value.ok?'✅':'⚠️')+' Web publicada: '+(web.status==='fulfilled'?'HTTP '+web.value.status:'no se pudo comprobar'),
  jobs?'📨 Entregas pendientes a Discord: **'+jobs.length+'** · con reintentos: '+jobs.filter((x:Any)=>x.attempts>0).length:'⚠️ No se pudo consultar la cola de envíos.',
  old?'🕰 Última revisión de materiales: '+new Date(old.updated_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}):'🕰 Todavía no consta la primera revisión de materiales.',
  '\nConsulta realizada en '+(Date.now()-start)+' ms. No mide la conexión de cada jugador ni las operaciones que sigan guardadas únicamente en su dispositivo.'
 ].join('\n'));
}
export function handleMejoras(i:Any,c:Config,sb:Any):Response|null{
 const name=i.data?.name,id=String(i.data?.custom_id||''),cmd=['contactos','clips','conexiones','materiales'].includes(name)?name:id.startsWith('mej:')?id.slice(4):'';
 if(!['contactos','clips','conexiones','materiales'].includes(cmd))return null;
 if(i.guild_id!==c.guild_id||!staff(c,i))return json({type:4,data:{content:'Solo el personal de Harrington puede usar esta consulta.',flags:64}});
 if((cmd==='conexiones'||cmd==='materiales')&&!direction(c,i))return json({type:4,data:{content:'Esta consulta es exclusiva de Dirección.',flags:64}});
 if(cmd==='contactos'&&i.type!==5&&!i.data?.options?.length)return json({type:9,data:{custom_id:'mej:contactos',title:'Buscar contactos',components:[{type:1,components:[{type:4,custom_id:'query',label:'Nombre, negocio o telegrama',style:1,min_length:2,max_length:100,required:true}]}]}});
 const options=Object.fromEntries((i.data?.options||[]).map((o:Any)=>[o.name,o.value]));
 const query=options.buscar||(i.data?.components||[]).flatMap((r:Any)=>r.components||[]).find((x:Any)=>x.custom_id==='query')?.value||'';
 const work=(async()=>{let payload;try{payload=cmd==='contactos'?await contacts(sb,String(query),direction(c,i)):cmd==='clips'?await clips(c):cmd==='conexiones'?await health(sb,c):(await materials(sb)).payload;}catch{payload=answer('⚠️ Consulta no disponible','No he podido completar la consulta. Inténtelo de nuevo en unos segundos.');}
 const r=await fetch('https://discord.com/api/v10/webhooks/'+i.application_id+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});if(!r.ok)console.error('Respuesta mejoras no disponible',r.status);})();
 const er=(globalThis as Any).EdgeRuntime;if(er?.waitUntil)er.waitUntil(work.catch(()=>console.error('Consulta mejoras interrumpida')));else work.catch(()=>{});
 return json({type:5,data:{flags:64}});
}
export async function cronMateriales(sb:Any,c:Config){
 if(!c.canal_despacho)return {disabled:true};
 const claim=await sb.rpc('hg_discord_reservar',{p_key:'mejoras:materiales'});if(claim.error)throw Error('RESERVA_MATERIALES');if(!claim.data)return {busy:true};
 try{
  const report=await materials(sb),old=checked(await sb.from('bot_equipo').select('message_id,channel_id,data').eq('id','mejoras:materiales').maybeSingle());
  const signature=JSON.stringify(report.payload);let message=old?.message_id;
  if(message&&old.channel_id===c.canal_despacho){try{await discord(c,'GET','/channels/'+c.canal_despacho+'/messages/'+message);}catch(e){if((e as Any).status===404)message=null;else throw e;}}
  if(!message||old.channel_id!==c.canal_despacho){const m=await discord(c,'POST','/channels/'+c.canal_despacho+'/messages',{...report.payload,nonce:'hg-materiales-v1',enforce_nonce:true,components:[{type:1,components:[{type:2,style:2,label:'Consultar materiales',custom_id:'mej:materiales'},{type:2,style:2,label:'Estado de conexiones',custom_id:'mej:conexiones'}]}]});message=m.id;}
  else if(old.data?.signature!==signature)await discord(c,'PATCH','/channels/'+c.canal_despacho+'/messages/'+message,report.payload);
  const saved=await sb.from('bot_equipo').upsert({id:'mejoras:materiales',kind:'materiales',owner:OWNER,guild_id:c.guild_id,status:'active',data:{signature,low:report.rows.length},channel_id:c.canal_despacho,message_id:message,updated_at:new Date().toISOString()},{onConflict:'id'});if(saved.error)throw Error('GUARDAR_MATERIALES');
  return {low:report.rows.length,configured:report.configured,message_id:message};
 }finally{await sb.from('hg_discord_leases').delete().eq('clave','mejoras:materiales');}
}
