import {diplomaPNG} from "./diploma-render.ts";
export const DIPLOMAS_DESDE=1792500821371;
export function promociones(lista,only=""){return lista.filter(e=>!only||e.id===only).flatMap(e=>(Array.isArray(e.ascensos)?e.ascensos:[]).filter(a=>Number(a.ts)>=DIPLOMAS_DESDE&&Number.isFinite(Number(a.nuevo))&&Number(a.nuevo)>=0&&a.a).map(a=>({e,a,key:"diploma:"+e.id+":"+a.ts,filename:"Diploma_"+e.id+"_"+a.ts+".png"}))).sort((x,y)=>Number(x.a.ts)-Number(y.a.ts));}
export async function enviarDiplomas(sb,c,only=""){
 const {data,error}=await sb.from("datos").select("valor").eq("clave","empleados").single();if(error)throw Error("PLANTILLA_NO_DISPONIBLE");
 const jobs=promociones(Array.isArray(data?.valor)?data.valor:[],only);let sent=0,pending=0,processed=0;const outcomes=[];
 const api=async(path,options={})=>{const r=await fetch("https://discord.com/api/v10"+path,{...options,headers:{Authorization:"Bot "+c.token,...options.headers},signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error("DISCORD_"+r.status+"_"+(d.code||""));return d;};
 for(const j of jobs){
  const {data:old,error:oe}=await sb.from("datos").select("valor").eq("clave",j.key).maybeSingle();if(oe)throw Error("ESTADO_DIPLOMA_NO_DISPONIBLE");
  if(old?.valor?.status==="sent"){outcomes.push({empleado:j.e.name,status:"already_sent",message:old.valor.message});continue;}
  if(!/^\d{15,22}$/.test(String(j.e.discord||""))){outcomes.push({empleado:j.e.name,status:"no_discord"});continue;}
  if(Number(old?.valor?.retryAt)>Date.now()||processed>=2){pending++;continue;}
  const lease=await sb.rpc("hg_discord_reservar",{p_key:j.key});if(lease.error||lease.data!==true){pending++;continue;}
  processed++;
  const fresh=await sb.from("datos").select("valor").eq("clave",j.key).maybeSingle();
  let state={...(fresh.data?.valor||old?.valor||{}),empId:j.e.id,discord:j.e.discord,ascenso:j.a.ts};
  const save=async v=>{const r=await sb.from("datos").upsert({clave:j.key,valor:{...state,...v},actualizado:new Date().toISOString()},{onConflict:"clave"});if(r.error)throw Error("ESTADO_DIPLOMA_NO_GUARDADO");state={...state,...v};};
  try{
   if(state.status==="sent")continue;
   const dm=await api("/users/@me/channels",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient_id:j.e.discord})});if(!dm.id)throw Error("PRIVADO_NO_DISPONIBLE");
   if(state.channel&&state.status!=="sent"){
    const messages=await api("/channels/"+dm.id+"/messages?limit=50");
    const prior=Array.isArray(messages)&&messages.find(m=>m.author?.bot&&((m.attachments||[]).some(a=>a.filename===j.filename)||(m.embeds||[]).some(e=>String(e.image?.url||"").includes("/"+j.filename))));
    if(prior){await save({status:"sent",message:prior.id,channel:dm.id,sentAt:Date.now()});outcomes.push({empleado:j.e.name,status:"recovered",message:prior.id});continue;}
   }
   const png=await diplomaPNG(j.e,j.a);
   await save({status:"sending",channel:dm.id,attemptAt:Date.now()});
   const effective=new Date(Number(j.a.desde)*86400000).toLocaleDateString("es-ES",{timeZone:"UTC"});
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(j.key)))).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,22);
   const payload={content:"🎩 **Casa Harrington · Saint Denis**\n\nEstimado **"+j.e.name+"**:\n\nTengo el honor de comunicarle su ascenso de **"+j.a.de+"** a **"+j.a.a+"**. Su nuevo sueldo será de **$"+(Number(j.a.nuevo)/100).toFixed(2)+" semanales**, con efecto desde el **"+effective+"**.\n\nAdjunto su diploma de ascenso. Enhorabuena y gracias por su servicio a la casa.\n\n— **Señor Harrington**",allowed_mentions:{parse:[]},nonce:"dip"+hash,enforce_nonce:true,attachments:[{id:0,filename:j.filename}],embeds:[{title:"Diploma de ascenso · "+j.e.name,color:0xC9A24A,image:{url:"attachment://"+j.filename}}]};
   const form=new FormData();form.append("payload_json",JSON.stringify(payload));form.append("files[0]",new Blob([png],{type:"image/png"}),j.filename);
   const message=await api("/channels/"+dm.id+"/messages",{method:"POST",body:form});
   if(!message.id||!((message.attachments||[]).some(a=>a.filename===j.filename)||(message.embeds||[]).some(e=>String(e.image?.url||"").includes("/"+j.filename))))throw Error("DIPLOMA_NO_CONFIRMADO");
   await save({status:"sent",message:message.id,channel:dm.id,sentAt:Date.now(),retryAt:0});sent++;outcomes.push({empleado:j.e.name,status:"sent",message:message.id});
  }catch(e){
   pending++;const error=/^[A-Z_0-9]+$/.test(e.message)?e.message:"DIPLOMA_NO_DISPONIBLE";
   await save({status:"pending",error,retryAt:Date.now()+(/50007/.test(error)?3600000:60000)}).catch(()=>{});
   outcomes.push({empleado:j.e.name,status:"pending",error});
  }finally{await sb.from("hg_discord_leases").delete().eq("clave",j.key);}
 }
 return {sent,pending,outcomes};
}
