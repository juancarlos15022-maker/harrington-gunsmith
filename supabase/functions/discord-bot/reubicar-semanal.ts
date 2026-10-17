const rutas:Record<string,string>={'1520880618735669441':'1520881877542502492','1520880697999360070':'1520882027056857178'};
export async function reubicarSemanal(sb:any,c:any,op:any,request=fetch){
 const from=String(op.origen||''),to=rutas[from],id=String(op.mensaje||'');
 if(!to||!/^\d{15,22}$/.test(id))throw Error('TRASLADO_INVALIDO');
 const headers={Authorization:'Bot '+c.token,'Content-Type':'application/json'},api=(method:string,path:string,body?:any)=>request('https://discord.com/api/v10'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const original=await api('GET',`/channels/${from}/messages/${id}`);if(!original.ok)throw Error('ORIGINAL_'+original.status);const m=await original.json();
 const text=JSON.stringify(m.embeds||[]),files=m.attachments||[];
 if(!m.webhook_id||!(/REGISTRO SEMANAL DE VENTAS|REGISTRO DE GASTOS.*SEMANAL/i.test(text))||files.some((x:any)=>!x.filename.endsWith('.txt')))throw Error('NO_ES_INFORME_SEMANAL');
 const key='informe-reubicado:'+id,{data:prev}=await sb.from('bot_cfg').select('valor').eq('clave',key).maybeSingle();let newId=prev?.valor||'';
 if(!newId){
  const data=new FormData();const attachments=[];
  for(let i=0;i<files.length;i++){
   const f=files[i],u=new URL(f.url);if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||!u.pathname.startsWith('/attachments/'+from+'/')||f.size>8000000)throw Error('ADJUNTO_INVALIDO');
   const r=await request(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('ADJUNTO_'+r.status);const bytes=await r.arrayBuffer();if(bytes.byteLength!==f.size)throw Error('ADJUNTO_INCOMPLETO');
   data.append('files['+i+']',new Blob([bytes],{type:'text/plain'}),f.filename);attachments.push({id:i,filename:f.filename});
  }
  const embeds=(m.embeds||[]).map((e:any)=>{const {type,provider,video,content_scan_version,...clean}=e;for(const k of ['thumbnail','image'])if(clean[k])clean[k]={url:clean[k].url};if(clean.footer)clean.footer={text:clean.footer.text,...(clean.footer.icon_url?{icon_url:clean.footer.icon_url}:{})};return clean;});
  data.append('payload_json',JSON.stringify({content:m.content||'',embeds,attachments,allowed_mentions:{parse:[]}}));
  const r=await request(`https://discord.com/api/v10/channels/${to}/messages`,{method:'POST',headers:{Authorization:headers.Authorization},body:data,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('PUBLICAR_'+r.status);newId=String((await r.json()).id||'');if(!newId)throw Error('SIN_MENSAJE');
  const save=await sb.from('bot_cfg').upsert({clave:key,valor:newId});if(save.error)throw Error('REFERENCIA_NO_GUARDADA');
 }
 const check=await api('GET',`/channels/${to}/messages/${newId}`);if(!check.ok)throw Error('VERIFICAR_'+check.status);const copy=await check.json();
 if(copy.channel_id!==to||copy.content!==(m.content||'')||JSON.stringify((copy.embeds||[]).map((e:any)=>[e.title,e.description]))!==JSON.stringify((m.embeds||[]).map((e:any)=>[e.title,e.description]))||copy.attachments?.length!==files.length||files.some((f:any,i:number)=>copy.attachments[i]?.filename!==f.filename||copy.attachments[i]?.size!==f.size))throw Error('COPIA_NO_VERIFICADA');
 const deleted=await api('DELETE',`/channels/${from}/messages/${id}`);if(!deleted.ok&&deleted.status!==404)throw Error('BORRAR_'+deleted.status);
 await sb.from('bot_registro').insert({metodo:'DELETE',ruta:`/channels/${from}/messages/${id}`,motivo:'Informe semanal verificado en '+to+'/'+newId,estado:deleted.status});
 return {origen:from,destino:to,original:id,mensaje:newId,verificado:true,borrado:true};
}
