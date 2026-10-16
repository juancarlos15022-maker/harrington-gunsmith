import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {discord,isStaff,sourceVoiceChannels} from './equipo.ts';
type Any=Record<string,any>;type C=Record<string,string>;
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),T='bot_equipo';
async function notify(c:C,uid:string,channel:string){
 const {data:watchers}=await sb.from(T).select('*').eq('kind','voice_watch').eq('status','pending').eq('data->>target',uid).gt('due_at',new Date().toISOString());
 for(const w of watchers||[]){try{const [requester,target]=await Promise.all([discord(c,'GET',`/guilds/${c.guild_id}/members/${w.owner}`),discord(c,'GET',`/guilds/${c.guild_id}/members/${uid}`)]);if(!isStaff(c,requester)||!isStaff(c,target)){await sb.from(T).update({status:'cancelled'}).eq('id',w.id);continue;}const channels=await sourceVoiceChannels(c,{member:requester});if(!channels.some((x:Any)=>x.id===channel))continue;
 const {data:claim}=await sb.from(T).update({status:'sending',updated_at:new Date().toISOString()}).eq('id',w.id).eq('status','pending').select('id');if(!claim?.length)continue;
 try{await discord(c,'POST',`/channels/${w.data.dm}/messages`,{content:'🔔 **'+String(w.data.name).replace(/@/g,'@\u200b')+' está en voz**, en <#'+channel+'>.',allowed_mentions:{parse:[]}});await sb.from(T).update({status:'delivered',updated_at:new Date().toISOString()}).eq('id',w.id);}catch(e){await sb.from(T).update({status:'pending',data:{...w.data,error:String(e).slice(0,180)}}).eq('id',w.id);}
 }catch(e){console.error('voz aviso:',String(e).slice(0,150));}}
}
export async function startVoice(c:C){
 const {count}=await sb.from(T).select('id',{count:'exact',head:true}).eq('kind','voice_watch').eq('status','pending').gt('due_at',new Date().toISOString());if(!count)return {voice:'sin avisos pendientes'};
 await sb.from(T).upsert({id:'gateway',kind:'gateway',owner:'system',guild_id:c.guild_id,due_at:'1970-01-01T00:00:00Z',data:{}},{onConflict:'id',ignoreDuplicates:true});
 const run=crypto.randomUUID(),now=new Date().toISOString();
 const {data:lease,error}=await sb.from(T).update({status:'running',due_at:new Date(Date.now()+115000).toISOString(),updated_at:now}).eq('id','gateway').lte('due_at',now).select().maybeSingle();if(error)throw error;if(!lease)return {voice:'conexión activa'};
 const task=gateway(c,lease.data,run).catch(async e=>{console.error('gateway:',String(e));await sb.from(T).update({data:{error:String(e).slice(0,200)},due_at:new Date().toISOString()}).eq('id','gateway');});
 (globalThis as any).EdgeRuntime.waitUntil(task);return {voice:'conexión iniciada'};
}
async function gateway(c:C,saved:Any,run:string){
 let session=saved.session||'',seq=saved.seq??null,resume=saved.resume||'wss://gateway.discord.gg',lastType=saved.last_type||'',acked=true,heartbeat:any,initial:any,timer:any,queue=Promise.resolve(),ending=false,invalid=false;
 // Only Discord's gateway host may be used for resume URLs.
 if(!/^wss:\/\/gateway(?:-[a-z0-9-]+)?\.discord\.gg\/?$/.test(resume))resume='wss://gateway.discord.gg';
 const ws=new WebSocket(resume.replace(/\/$/,'')+'/?v=10&encoding=json');
 const send=(op:number,d:any)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op,d}));};
 const save=async()=>{await sb.from(T).update({data:{session:invalid?'':session,seq:invalid?null:seq,resume,run,last_type:lastType,last_event:new Date().toISOString()},updated_at:new Date().toISOString()}).eq('id','gateway');};
 const heartbeatNow=()=>{if(!acked){ws.close(4000,'heartbeat perdido');return;}acked=false;send(1,seq);};
 await new Promise<void>((resolve)=>{
 const stop=()=>{if(ending)return;ending=true;clearTimeout(initial);clearInterval(heartbeat);clearTimeout(timer);try{ws.close(4000,'rotación de conexión');}catch{}resolve();};
 timer=setTimeout(stop,95000);
 ws.onerror=()=>stop();ws.onclose=(event)=>{if([4004,4010,4011,4012,4013,4014].includes(event.code))invalid=true;stop();};
 ws.onmessage=event=>{let packet:Any;try{packet=JSON.parse(String(event.data));}catch{return;}
 if(packet.op===10){const interval=packet.d.heartbeat_interval;initial=setTimeout(()=>{heartbeatNow();heartbeat=setInterval(heartbeatNow,interval);},Math.random()*interval);if(session&&seq!==null)send(6,{token:c.token,session_id:session,seq});else send(2,{token:c.token,intents:129,properties:{os:'linux',browser:'Harrington equipo',device:'Harrington equipo'}});return;}
 if(packet.op===11){acked=true;return;}if(packet.op===1){send(1,seq);return;}if(packet.op===7){stop();return;}if(packet.op===9){if(!packet.d){invalid=true;session='';seq=null;}stop();return;}
 if(packet.op!==0)return;
 queue=queue.then(async()=>{const d=packet.d;if(packet.t==='READY'){session=d.session_id;resume=d.resume_gateway_url||resume;}
 if(packet.t==='GUILD_CREATE'&&d.id===c.guild_id){await sb.from(T).update({data:{channel:null},updated_at:new Date().toISOString()}).eq('kind','voice_state').eq('guild_id',c.guild_id);for(const s of d.voice_states||[]){if(!s.channel_id)continue;await sb.from(T).upsert({id:'voice:'+s.user_id,kind:'voice_state',owner:s.user_id,guild_id:c.guild_id,data:{channel:s.channel_id},updated_at:new Date().toISOString()});await notify(c,s.user_id,s.channel_id);}}
 if(packet.t==='VOICE_STATE_UPDATE'&&d.guild_id===c.guild_id){const {data:old}=await sb.from(T).select('data').eq('id','voice:'+d.user_id).maybeSingle();await sb.from(T).upsert({id:'voice:'+d.user_id,kind:'voice_state',owner:d.user_id,guild_id:c.guild_id,data:{channel:d.channel_id||null},updated_at:new Date().toISOString()});if(d.channel_id&&!old?.data.channel)await notify(c,d.user_id,d.channel_id);}
 seq=packet.s??seq;lastType=packet.t;await save();}).catch(e=>{console.error('gateway evento:',String(e).slice(0,160));stop();});
 };
 });
 await queue;await save();await sb.from(T).update({status:'idle',due_at:new Date().toISOString()}).eq('id','gateway');
}
