import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {discord,isStaff} from './equipo.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),T='bot_equipo';
type C=Record<string,string>;
async function message(c:C,channel:string,id:string){try{return await discord(c,'GET',`/channels/${channel}/messages/${id}`);}catch(e){if(String(e).includes('Discord 404:'))return null;throw e;}}
export function usableRumor(m:any){return !m.author?.bot&&!m.webhook_id&&[0,19].includes(m.type)&&typeof m.content==='string'&&m.content.trim().length>0;}
export function formatRumor(text:string){const body=text.trim().replace(/^(?:\/rumor(?:\s+|$))+/i,'').replace(/\s+/g,' ').trim();if(!body)return null;const full='/rumor '+body;return full.length<=160?full:null;}
export function canDelete(original:any,latest:any,reply:any,text:string){return !!latest&&latest.id===original.id&&latest.author?.id===original.author?.id&&latest.content===original.content&&!(latest.attachments?.length)&&reply?.embeds?.[0]?.description===text.replace(/@(everyone|here)/gi,'@\u200b$1');}
export function rumorCard(text:string,id:string){return {content:'```text\n'+text.replace(/`/g,'')+'\n```',allowed_mentions:{parse:[],replied_user:false},embeds:[{title:'🗞 Rumor pasado a limpio',description:text.replace(/@(everyone|here)/gi,'@\u200b$1'),color:0xd7ae54,footer:{text:'Señor Harrington · '+text.length+'/160 caracteres, incluido /rumor'}}],components:[{type:1,components:[{type:2,style:2,label:'Ver texto para copiar',emoji:{name:'📋'},custom_id:'eq:rumor:copy:'+id}]}]};}
export async function rumorCron(c:C){
 if(!c.canal_rumores)return {desactivado:true};
 await sb.from(T).upsert({id:'rumor-control',kind:'rumor_control',owner:'system',guild_id:c.guild_id,due_at:'1970-01-01T00:00:00Z',data:{cursor:'0'}},{onConflict:'id',ignoreDuplicates:true});
 const now=new Date().toISOString();const {data:lock,error}=await sb.from(T).update({due_at:new Date(Date.now()+125000).toISOString(),status:'running'}).eq('id','rumor-control').lte('due_at',now).select().maybeSingle();if(error)throw error;if(!lock)return {ocupado:true};
 let cursor=lock.data.cursor||'0';
 try{
 const messages=await discord(c,'GET',`/channels/${c.canal_rumores}/messages?limit=100&after=${cursor}`);messages.sort((a:any,b:any)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 const members=new Map();
 for(const m of messages){if(usableRumor(m)){if(!members.has(m.author.id))members.set(m.author.id,await discord(c,'GET',`/guilds/${c.guild_id}/members/${m.author.id}`).catch(()=>null));if(isStaff(c,members.get(m.author.id))){const {error}=await sb.from(T).upsert({id:'rumor:'+m.id,kind:'rumor',owner:m.author.id,guild_id:c.guild_id,status:'pending',channel_id:c.canal_rumores,data:{original:m.content,source:m.id,author:m.author.global_name||m.author.username,attempts:0}},{onConflict:'id',ignoreDuplicates:true});if(error)throw error;}}cursor=m.id;}
 await sb.from(T).update({data:{cursor},updated_at:new Date().toISOString()}).eq('id','rumor-control');
 const {data:pending,error:pe}=await sb.from(T).select('*').eq('kind','rumor').in('status',['pending','published']).eq('channel_id',c.canal_rumores).order('created_at',{ascending:true}).limit(1);if(pe)throw pe;let processed=0;
 for(const r of pending||[]){
 const source=r.data.form?{id:r.data.source,author:{id:r.owner},content:r.data.original,type:0,attachments:[]}:await message(c,c.canal_rumores,r.data.source);
 if(!source||!usableRumor(source)){await sb.from(T).update({status:r.status==='published'?'done':'cancelled'}).eq('id',r.id);continue;}
 if(!r.data.legacy&&!formatRumor(source.content)){await discord(c,'POST',`/channels/${c.canal_rumores}/messages`,{content:'El rumor supera 160 caracteres contando /rumor y el espacio. Use el botón Escribir rumor: admite 153 caracteres y añade /rumor automáticamente.',allowed_mentions:{parse:[]},...(r.data.form?{}:{message_reference:{message_id:source.id,fail_if_not_exists:false}}),nonce:source.id,enforce_nonce:true});await sb.from(T).update({status:'skipped'}).eq('id',r.id);continue;}
 let text=r.data.original===source.content?r.data.clean:null;
 if(!text||!formatRumor(text)){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),85000);try{await discord(c,'POST',`/channels/${c.canal_rumores}/typing`);const response=await fetch(Deno.env.get('SUPABASE_URL')+'/functions/v1/harrington-ai',{method:'POST',headers:{'Content-Type':'application/json','x-hg-secreto':c.secreto},signal:ctl.signal,body:JSON.stringify({accion:'interno',tarea:'discord_rumor',datos:{rumor:source.content,maximo_caracteres_sin_prefijo:153},quien:r.data.author,emp_id:r.owner})});const j=await response.json();if(!response.ok||!j.texto)throw Error(j.error||'IA_NO_DISPONIBLE');text=formatRumor(String(j.texto));if(!text)throw Error('RESPUESTA_SUPERA_160_CARACTERES');const {error}=await sb.from(T).update({data:{...r.data,original:source.content,clean:text},updated_at:new Date().toISOString()}).eq('id',r.id);if(error)throw error;}finally{clearTimeout(timer);}}else text=formatRumor(text);
 const latest=await discord(c,'GET',`/channels/${c.canal_rumores}/messages?limit=100`);
 const previous=latest.find((m:any)=>m.author?.id===c.app_id&&(m.components||[]).some((row:any)=>(row.components||[]).some((b:any)=>b.custom_id==='eq:rumor:copy:'+r.id)));
 const reply=previous?(previous.embeds?.[0]?.description===text.replace(/@(everyone|here)/gi,'@\u200b$1')?previous:await discord(c,'PATCH',`/channels/${c.canal_rumores}/messages/${previous.id}`,rumorCard(text,r.id))):await discord(c,'POST',`/channels/${c.canal_rumores}/messages`,{...rumorCard(text,r.id),nonce:source.id,enforce_nonce:true});
 const saved={...r.data,original:source.content,clean:text};const {error:saveError}=await sb.from(T).update({status:'published',message_id:reply.id,data:saved,updated_at:new Date().toISOString()}).eq('id',r.id);if(saveError)throw saveError;
 const confirmed=await discord(c,'GET',`/channels/${c.canal_rumores}/messages/${reply.id}`),latestOriginal=r.data.form?null:await message(c,c.canal_rumores,source.id);
 if(r.data.form&&confirmed.embeds?.[0]?.description!==text.replace(/@(everyone|here)/gi,'@\u200b$1'))throw Error('NO_SE_PUDO_VERIFICAR_LA_COPIA');
 if(latestOriginal&&latestOriginal.content!==source.content){await sb.from(T).update({status:'pending',data:{...r.data,original:latestOriginal.content,clean:null,attempts:0}}).eq('id',r.id);continue;}
 if(canDelete(source,latestOriginal,confirmed,text))await discord(c,'DELETE',`/channels/${c.canal_rumores}/messages/${source.id}`);
 else if(latestOriginal&&!latestOriginal.attachments?.length)throw Error('NO_SE_PUDO_VERIFICAR_LA_COPIA');
 await sb.from(T).update({status:'done',data:{...saved,original_deleted:!latestOriginal||!latestOriginal.attachments?.length},updated_at:new Date().toISOString()}).eq('id',r.id);processed++;
 }return {capturados:messages.length,procesados:processed};
 }catch(e){const {data:p}=await sb.from(T).select('id,data,status').eq('kind','rumor').in('status',['pending','published']).eq('channel_id',c.canal_rumores).order('created_at').limit(1);const r=p?.[0];if(r){const attempts=(r.data.attempts||0)+1;await sb.from(T).update({status:attempts>=3?'failed':r.status,data:{...r.data,attempts,error:String(e).slice(0,200)}}).eq('id',r.id);if(attempts>=3)await discord(c,'POST',`/channels/${c.canal_rumores}/messages`,{content:'No he podido completar este rumor. El texto disponible sigue guardado; puede reenviarlo para intentarlo de nuevo.',allowed_mentions:{parse:[]},message_reference:{message_id:r.data.source,fail_if_not_exists:false}}).catch(()=>{});}await sb.from(T).update({data:{cursor,error:String(e).slice(0,200)}}).eq('id','rumor-control');return {error:String(e).slice(0,200)};
 }finally{await sb.from(T).update({due_at:new Date().toISOString(),status:'idle'}).eq('id','rumor-control');}
}
