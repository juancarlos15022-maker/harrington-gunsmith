type Any=any;
export function esEnlaceGobierno(value:unknown){try{const u=new URL(String(value));return u.hostname==='juancarlos15022-maker.github.io'&&/^\/harrington-gunsmith\/gobierno(?:\/|\.html|$)/i.test(u.pathname)&&! /\.(webp|png|jpg|jpeg|svg|gif|mp4|webm|woff2?)$/i.test(u.pathname)}catch{return false}}
export function textoSinEnlaces(text:string){if(!(text.match(/https?:\/\/[^\s<>"')\]]+/g)||[]).some(esEnlaceGobierno))return text;return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(all,label,url)=>esEnlaceGobierno(url)?label:all).replace(/https?:\/\/[^\s<>"')\]]+/g,url=>esEnlaceGobierno(url)?'':url).replace(/\n{3,}/g,'\n\n').trim()}
export function sinEnlaceWeb(value:Any):Any{
 if(typeof value==='string')return textoSinEnlaces(value);if(Array.isArray(value))return value.map(sinEnlaceWeb).filter(x=>x!==null);
 if(!value||typeof value!=='object')return value;if(value.type===2&&value.style===5&&esEnlaceGobierno(value.url))return null;
 const out:Any={};for(const [k,v] of Object.entries(value)){if(k==='url'&&esEnlaceGobierno(v))continue;if(['image','thumbnail','icon_url','proxy_icon_url'].includes(k)){out[k]=v;continue}out[k]=sinEnlaceWeb(v)}if(out.type===1&&!out.components?.length)return null;return out;
}
export function mensajeEditable(m:Any){const embeds=(m.embeds||[]).map((e:Any)=>{const o:Any={};for(const k of ['title','description','url','timestamp','color','fields','footer','author','image','thumbnail'])if(e[k]!==undefined){o[k]=e[k];if(['image','thumbnail'].includes(k))o[k]={url:e[k].url};if(k==='footer')o[k]={text:e[k].text,...(e[k].icon_url?{icon_url:e[k].icon_url}:{})};if(k==='author')o[k]={name:e[k].name,...(e[k].url?{url:e[k].url}:{}),...(e[k].icon_url?{icon_url:e[k].icon_url}:{})}}return o});return {content:m.content||'',embeds,components:m.components||[],allowed_mentions:{parse:[]}}}
export async function limpiarEnlaces(ctx:Any){
 const lock=await ctx.sb.rpc('hg_discord_reservar',{p_key:'gob:limpiar-enlaces'});if(lock.error)throw Error('No he podido reservar la limpieza.');if(lock.data!==true)return {ocupado:true};
 try{
 const {data:r}=await ctx.sb.from('whitmore_cfg').select('valor').eq('clave','limpieza_enlaces_estado').maybeSingle();let state:Any;try{state=JSON.parse(r?.valor||'{}')}catch{state={}};
 const channels=[...new Set(Object.entries(ctx.c).filter(([k,v])=>k.startsWith('canal_')&&k!=='canal_web'&&/^\d{17,20}$/.test(String(v))).map(([,v])=>String(v)))];if(state.terminado)return state;
 let index=state.index||0,before=state.before||'',changed=0,scanned=0;const started=Date.now();
 while(index<channels.length&&changed<8&&scanned<400&&Date.now()-started<22000){
  const channel=channels[index],batch=await ctx.api('GET','/channels/'+channel+'/messages?limit=100'+(before?'&before='+before:''));if(!batch.length){index++;before='';continue}
  let complete=true;
  for(const m of batch){scanned++;const original=mensajeEditable(m),clean=sinEnlaceWeb(original);if(JSON.stringify(original)!==JSON.stringify(clean)){
    if(String(m.author?.id)!==String(ctx.c.app_id)){state.otros=(state.otros||[]);if(!state.otros.some((x:Any)=>x.mensaje===m.id))state.otros.push({canal:channel,mensaje:m.id,autor:m.author?.id});}
    else {try{await ctx.api('PATCH','/channels/'+channel+'/messages/'+m.id,clean);changed++}catch(e){if(String(e).includes('429')){complete=false;break}throw e}}
   }
   before=m.id;if(changed>=8||scanned>=400||Date.now()-started>=22000){complete=false;break}
  }
  if(complete&&batch.length<100){index++;before=''}
  if(!complete)break;
 }
 state={...state,index,before,terminado:index>=channels.length,modificados:Number(state.modificados||0)+changed,revisados:Number(state.revisados||0)+scanned};const saved=await ctx.sb.from('whitmore_cfg').upsert({clave:'limpieza_enlaces_estado',valor:JSON.stringify(state),actualizado:new Date().toISOString()});if(saved.error)throw Error('No he podido guardar el estado de limpieza.');return state;
 }finally{await ctx.sb.from('hg_discord_leases').delete().eq('clave','gob:limpiar-enlaces')}
}
