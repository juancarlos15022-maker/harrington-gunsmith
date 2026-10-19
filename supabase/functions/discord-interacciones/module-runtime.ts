import {canView} from "./module-access.ts";
import {readFeed} from "./module-feed.ts";
import {restoreStructure} from "./module-restore.ts";
import {catalog,defaults,moduleById} from './module-catalog.ts';
import {plan,text} from './module-engine.ts';
import {sample} from './module-samples.ts';
type A=Record<string,any>;type C=Record<string,string>;
const cfgId=(g:string)=>'modules:config:'+g;
const groupState=(id:string)=>['responsables','estados'].includes(id)?'tickets':id;
const stateId=(g:string,id:string)=>'modules:state:'+g+':'+groupState(id);
const ok=(r:A)=>{if(r.error)throw Error('No se pudo consultar o guardar el módulo');return r.data;};
export async function readConfig(sb:A,g:string){const r=ok(await sb.from('bot_equipo').select('data,revision').eq('id',cfgId(g)).maybeSingle());return {modules:{...defaults(),...(r?.data?.modules||{})},activationLocked:r?.data?.activationLocked!==false,revision:r?.revision||0};}
async function saveRecord(sb:A,c:C,id:string,kind:string,data:A,uid:string){const r=await sb.from('bot_equipo').upsert({id,kind,owner:uid,guild_id:c.guild_id,status:'active',data,updated_at:new Date().toISOString()},{onConflict:'id'});ok(r);}
export async function installModules(sb:A,c:C){const existing=ok(await sb.from('bot_equipo').select('id').eq('id',cfgId(c.guild_id)).maybeSingle());if(existing)return readConfig(sb,c.guild_id);await saveRecord(sb,c,cfgId(c.guild_id),'modules_config',{modules:defaults(),activationLocked:true},'1398183011232518164');return readConfig(sb,c.guild_id);}
export function isChief(c:C,i:A){return i.guild_id===c.guild_id&&((c.guild_id==='1520875506214371439'&&String(i.member?.user?.id)==='1398183011232518164')||(BigInt(i.member?.permissions||'0')&8n)===8n||!!c.rol_jefe&&Array.isArray(i.member?.roles)&&i.member.roles.includes(c.rol_jefe));}
const json=(x:unknown)=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const payload=(title:string,description:string,components:any[]=[])=>({allowed_mentions:{parse:[]},embeds:[{title,color:0xC9A24A,description:description.slice(0,3900),footer:{text:'Configuración Bot · Solo jefes · módulos nuevos independientes'}}],components});
export async function discordAPI(c:C,method:string,path:string,body?:unknown){
 const send=()=>fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:'Bot '+c.token,'Content-Type':'application/json','X-Audit-Log-Reason':'Configuracion%20modular%20de%20Harrington'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 let r=await send();if(r.status===429){const d=await r.json();if(Number(d.retry_after)>5)throw Error('Discord pide esperar antes de continuar');await new Promise(x=>setTimeout(x,Math.max(100,Number(d.retry_after)*1000)));r=await send();}const d=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error('Discord '+r.status),{status:r.status});return d;
}
export async function modulePanel(sb:A,c:C,page=0){
 const cfg=await readConfig(sb,c.guild_id),selected=catalog.slice(page*20,page*20+20),on=catalog.filter(m=>cfg.modules[m.id]?.enabled===true).length;
 return payload('⚙️ Configuración del Señor Harrington','**'+catalog.length+' módulos instalados · '+on+' activados.**\n'+(cfg.activationLocked?'🔒 Activación bloqueada por petición del propietario. Se permiten consultas y simulaciones; no se aplican cambios.':'La activación requiere una decisión explícita por módulo.')+'\n\n'+selected.map(m=>'**'+m.number+'. '+m.title+'** · '+(cfg.modules[m.id]?.enabled?'ACTIVO':'DESACTIVADO')+(m.requires.length?'\nRequisitos: '+m.requires.join(', '):'')).join('\n')+'\n\nLas funciones históricas que ya usáis siguen con su funcionamiento anterior. Las pruebas no modifican Discord ni la base de datos.',[
  {type:1,components:[{type:3,custom_id:'mod:select',placeholder:'Activar, desactivar o configurar una función',options:selected.map(m=>({label:m.number+'. '+m.title,value:m.id,description:(cfg.modules[m.id]?.enabled?'Activado':'Desactivado')+' · '+m.group}))}]},
  {type:1,components:[0,1,2].map(n=>({type:2,style:2,label:'Página '+(n+1),custom_id:'mod:page:'+n,disabled:n===page}))}
 ]);
}
export function previewModule(id:string){const s=sample(id),p=plan(s.module,s.action,s.input,s.state,s.settings,s.context);return {module:id,simulation:true,networkCalls:0,databaseWrites:0,plannedOperations:p.operations.length,result:p.result,state:p.state,operations:p.operations};}
async function readState(sb:A,g:string,id:string){const r=ok(await sb.from('bot_equipo').select('data,revision').eq('id',stateId(g,id)).maybeSingle());return r?.data||{};}
function permitted(cfg:A,module:string,action:string,actor:A){if(actor.chief)return true;const rule=cfg.modules[module]?.permissions?.[action];return !!rule&&(rule.users?.includes(actor.uid)||rule.roles?.some((r:string)=>actor.roles?.includes(r)));}
async function lock(sb:A,key:string){const r=await sb.rpc('hg_discord_reservar',{p_key:key});if(r.error||r.data!==true)throw Error('Hay otra operación del módulo en curso');}
async function release(sb:A,key:string){await sb.from('hg_discord_leases').delete().eq('clave',key);}
function active(cfg:A,id:string){if(cfg.activationLocked||cfg.modules[id]?.enabled!==true)throw Error('MODULO_DESACTIVADO: '+id);for(const dep of moduleById(id)?.requires||[])if(moduleById(dep)&&cfg.modules[dep]?.enabled!==true)throw Error('DEPENDENCIA_DESACTIVADA: '+dep);}
// Se inyecta traductor o fuente cuando proceda. Ninguna dependencia externa se llama al estar desactivado.
export async function executeModule(sb:A,c:C,id:string,action:string,input:A,actor:A,ports:A={}){
 const config=await readConfig(sb,c.guild_id);active(config,id);if(!permitted(config,id,action,actor))throw Error('ACCION_NO_PERMITIDA');
 const setting=config.modules[id].settings||{};const lease='modules:'+c.guild_id+':'+groupState(id);await lock(sb,lease);
 try{
  const current=await readConfig(sb,c.guild_id);active(current,id);
  const previous=await readState(sb,c.guild_id,id),context={...ports.context,...actor,guild:c.guild_id,bot:c.app_id,now:Date.now(),newId:crypto.randomUUID(),protectedRoles:[c.rol_jefe,c.rol_gerente,c.rol_armero,c.rol_aprendiz,c.rol_colaborador].filter(Boolean)};
  if(id==='voz')setting.createdChannels=Object.keys(previous.entries||{});
  if(id==='novedades'||id==='transcripciones'||id==='palabras'&&action==='suscribir'){
    const [roles,member,channels,guild]=await Promise.all([discordAPI(c,'GET','/guilds/'+c.guild_id+'/roles'),discordAPI(c,'GET','/guilds/'+c.guild_id+'/members/'+actor.uid),discordAPI(c,'GET','/guilds/'+c.guild_id+'/channels'),discordAPI(c,'GET','/guilds/'+c.guild_id)]);member.guild_owner=guild.owner_id;
    context.visibleChannels=channels.filter((ch:A)=>canView(c.guild_id,roles,member,ch)).map((ch:A)=>ch.id);
    if(id==='novedades'){input={...input,messages:[]};for(const ch of (setting.channels||[]).filter((x:string)=>context.visibleChannels.includes(x)).slice(0,10)){const messages=await discordAPI(c,'GET','/channels/'+ch+'/messages?limit=100');input.messages.push(...messages.map((m:A)=>({id:m.id,channel:ch,at:Date.parse(m.timestamp),content:m.content})));}}
    if(id==='transcripciones'){if(!context.visibleChannels.includes(input.channel))throw Error('CANAL_NO_VISIBLE');input={...input,messages:await discordAPI(c,'GET','/channels/'+input.channel+'/messages?limit=100')};}
    if(id==='palabras'&&input.channels?.some((x:string)=>!context.visibleChannels.includes(x)))throw Error('CANAL_NO_VISIBLE');
  }
  if(id==='sorteos')context.randomOrder=Array.from(crypto.getRandomValues(new Uint32Array(1000)));
  // No se aceptan permisos del bot, funciones del servidor ni propiedad de mensajes aportados por el solicitante.
  if(id==='roles-estilo'){input=structuredClone(input);input.roles=await discordAPI(c,'GET','/guilds/'+c.guild_id+'/roles');input.guild=await discordAPI(c,'GET','/guilds/'+c.guild_id);const member=await discordAPI(c,'GET','/guilds/'+c.guild_id+'/members/'+c.app_id);input.botTop=Math.max(0,...input.roles.filter((r:A)=>member.roles.includes(r.id)).map((r:A)=>r.position));}
  if(id==='caducidad'&&action==='tick'){context.ownedMessages=[];for(const r of Object.values(previous.entries||{}) as A[])if(!r.done&&r.dueAt<=context.now){const m=await discordAPI(c,'GET','/channels/'+r.channel+'/messages/'+r.message);if(m.author?.id===c.app_id)context.ownedMessages.push(r.message);}}
  if(input.requestId&&previous.requests?.[String(input.requestId)])return {replayed:true,result:previous.requests[String(input.requestId)]};
  if(id==='copias'&&action==='restaurar'){if(!actor.chief)throw Error('SOLO_JEFES');const backup=previous.entries?.[input.id];if(!backup||input.confirm!==backup.id)throw Error('CONFIRME_ID_COPIA');active(await readConfig(sb,c.guild_id),id);return restoreStructure(discordAPI,c,backup);}
  const result=plan(id,action,input,previous,setting,context);
  // Un lote siempre comprueba la activación y los permisos de todos sus módulos destino.
  if(id==='lotes'){for(const p of result.result.plans){active(current,p.module);if(!permitted(current,p.module,p.action,actor))throw Error('ACCION_NO_PERMITIDA');}return {preview:true,plans:result.result.plans};}
  if(id==='traduccion'){if(!ports.translate)throw Error('FALTA_PROVEEDOR_TRADUCCION');result.result.translation=await ports.translate(result.result.translationRequest);}
  const request=input.requestId?String(input.requestId):null;
  if(request&&previous.requests?.[request])return {replayed:true,result:previous.requests[request]};
  const applied:any[]=[];
  for(const op of result.operations){active(await readConfig(sb,c.guild_id),id);applied.push(await discordAPI(c,op.method,op.path,op.body));}
  if(result.result.bindChannel&&applied[0]?.id)result.state.entries[result.result.bindChannel].channel=applied[0].id;
  if(result.result.bindVoice&&applied[0]?.id){result.state.entries[applied[0].id]={channel:applied[0].id,owner:result.result.moveUser,createdAt:Date.now()};await discordAPI(c,'PATCH','/guilds/'+c.guild_id+'/members/'+result.result.moveUser,{channel_id:applied[0].id});}
  if(request){result.state.requests={...(previous.requests||{}),[request]:result.result};const keys=Object.keys(result.state.requests);for(const k of keys.slice(0,Math.max(0,keys.length-500)))delete result.state.requests[k];}
  await saveRecord(sb,c,stateId(c.guild_id,id),'module_state',result.state,actor.uid);
  await sb.from('bot_registro').insert({metodo:'MODULE',ruta:id+'/'+action,motivo:'Acción de '+actor.uid,estado:200});
  return {result:result.result,operations:applied.length};
 }finally{await release(sb,lease);}
}
export async function configureModule(sb:A,c:C,id:string,patch:A,actor:A){
 if(!actor.chief||!moduleById(id))throw Error('SOLO_JEFES');const key='modules:config:'+c.guild_id;await lock(sb,key);
 try{const cfg=await readConfig(sb,c.guild_id);if(patch.enabled===true&&cfg.activationLocked)throw Error('ACTIVACION_BLOQUEADA_POR_EL_PROPIETARIO');if(patch.enabled===false){const dependents=catalog.filter(m=>m.requires.includes(id as never)&&cfg.modules[m.id]?.enabled);if(dependents.length)throw Error('Desactiva primero: '+dependents.map(m=>m.title).join(', '));}cfg.modules[id]={...cfg.modules[id],...patch};if(patch.enabled===true)for(const dep of moduleById(id)?.requires||[])if(moduleById(dep)&&cfg.modules[dep]?.enabled!==true)throw Error('Falta activar dependencia '+dep);await saveRecord(sb,c,cfgId(c.guild_id),'modules_config',{modules:cfg.modules,activationLocked:cfg.activationLocked},actor.uid);return {id,...cfg.modules[id]};}finally{await release(sb,key);}
}
export async function tickModules(sb:A,c:C){const cfg=await readConfig(sb,c.guild_id);if(cfg.activationLocked)return {disabled:catalog.length,active:0};const out:A={};for(const id of ['recurrentes','recordatorios','caducidad','fuentes'])if(cfg.modules[id]?.enabled)try{out[id]=await executeModule(sb,c,id,id==='fuentes'?'publicaciones':'tick',id==='fuentes'?{items:await readFeed(cfg.modules[id].settings.url)}:{}, {uid:c.app_id,chief:true});}catch(e){out[id]={error:text((e as Error).message,100)};}return out;}
export async function eventModules(sb:A,c:C,event:A){
 const cfg=await readConfig(sb,c.guild_id);if(cfg.activationLocked)return {disabled:catalog.length,handled:0};
 const actor={uid:c.app_id,chief:true},out:any[]=[];
 const run=async(id:string,a:string,p:A)=>{if(cfg.modules[id]?.enabled)out.push(await executeModule(sb,c,id,a,p,actor));};
 if(event.type==='GUILD_MEMBER_ADD')await run('antiraid','evento',{actor:event.user?.id,type:'join'});
 if(event.type==='GUILD_AUDIT_LOG_ENTRY_CREATE'&&[12,20,22,30,32,50,52].includes(event.action_type))await run('antinuke','evento',{actor:event.user_id,type:event.action_type});
 if(event.type==='MESSAGE_CREATE'&&!event.author?.bot){
  await run('estadisticas','evento',{user:event.author?.id,channel:event.channel_id,type:'mensaje'});
  if(cfg.modules.palabras?.enabled){const state=await readState(sb,c.guild_id,'palabras'),roles=await discordAPI(c,'GET','/guilds/'+c.guild_id+'/roles'),ch=await discordAPI(c,'GET','/channels/'+event.channel_id);if(ch.guild_id!==c.guild_id)throw Error('OTRO_SERVIDOR');
   for(const r of Object.values(state.entries||{}) as A[])if(r.channels?.includes(event.channel_id)&&String(event.content||'').toLowerCase().includes(r.term)&&r.user!==event.author?.id){const m=await discordAPI(c,'GET','/guilds/'+c.guild_id+'/members/'+r.user);if(!canView(c.guild_id,roles,m,ch))continue;const prefs=await readState(sb,c.guild_id,'preferencias'),pr=prefs.entries?.[r.user];const {quietAt}=await import('./module-engine.ts');if(pr&&quietAt(pr,Date.now()))continue;const dm=await discordAPI(c,'POST','/users/@me/channels',{recipient_id:r.user});await discordAPI(c,'POST','/channels/'+dm.id+'/messages',{content:'Coincidencia con su suscripción: https://discord.com/channels/'+c.guild_id+'/'+event.channel_id+'/'+event.id,allowed_mentions:{parse:[]}});}
  }
 }
 if(['GUILD_CREATE','VOICE_STATE_UPDATE'].includes(event.type)&&(cfg.modules.voz?.enabled||cfg.modules.estadisticas?.enabled)){
  const key='modules:voice:'+c.guild_id;await lock(sb,key);try{
   const saved=ok(await sb.from('bot_equipo').select('data').eq('id',key).maybeSingle()),state=saved?.data||{members:{}};
   if(event.type==='GUILD_CREATE'){for(const v of event.voice_states||[])state.members[v.user_id]={channel:v.channel_id,start:Date.now()};}
   else {const before=state.members[event.user_id],after=event.channel_id;if(before?.channel!==after){if(before?.channel&&before.start)await run('estadisticas','evento',{user:event.user_id,channel:before.channel,type:'voz',durationMs:Math.min(86400000,Date.now()-before.start)});if(after)state.members[event.user_id]={channel:after,start:Date.now()};else delete state.members[event.user_id];
    if(after&&cfg.modules.voz?.enabled&&after===cfg.modules.voz.settings.creatorChannel)await run('voz','entrada',{user:event.user_id,channel:after,name:'Sala de '+event.user_id});
    if(before?.channel&&cfg.modules.voz?.enabled&&!Object.values(state.members).some((m:any)=>m.channel===before.channel)){const rooms=await readState(sb,c.guild_id,'voz');if(rooms.entries?.[before.channel])await run('voz','vacio',{channel:before.channel,members:0});}
   }}await saveRecord(sb,c,key,'module_voice_gateway',state,c.app_id);
  }finally{await release(sb,key);}
 }
 return {handled:out.length};
}
export {handleControlPanel as handleModulePanel} from './module-control.ts';
