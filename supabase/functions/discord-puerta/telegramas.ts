// Agenda de contactos: solo mensajes del autor autorizado y en el canal configurado.
// Publicar -> guardar prueba -> borrar original; nonce estable para reintentos.
export function parsear(texto: string) {
  const s = texto.trim().replace(/\r/g, "");
  if (!s || s.length > 1500) return null;
  const marcado = /(?:telegrama|telegram|tel[eé]grafo|tel)\b\s*[:=\-]?\s*([A-Za-z0-9][A-Za-z0-9-]{0,9})(?![A-Za-z0-9-])/i.exec(s);
  let nombre = "", tel = "", obs = "";
  if (marcado) {
    nombre = s.slice(0, marcado.index).trim().replace(/[\s,:;|—-]+$/, "");
    tel = marcado[1]; obs = s.slice(marcado.index + marcado[0].length).trim();
  } else {
    const m = /^(.+?)(?:\s*[,;|\n]\s*|\s+)([A-Za-z]{1,4}-?\d{2,8})\s*(\([^\n]+\))?\s*$/.exec(s);
    if (!m) return null;
    nombre = m[1].trim(); tel = m[2]; obs = m[3] || "";
  }
  // Separar etiquetas explícitas, estén antes o después del telegrama.
  let quien = "";
  const separar = (texto: string) => {
    let campo = "libre";
    const campos: Record<string,string[]> = { libre: [], quien: [], obs: [] };
    for (const parte of texto.split(/((?:quien|quién)\s+es\s*[:=]|observaciones\s*[:=])/i)) {
      if (/^(?:quien|quién)\s+es\s*[:=]$/i.test(parte)) campo = "quien";
      else if (/^observaciones\s*[:=]$/i.test(parte)) campo = "obs";
      else if (parte.trim()) campos[campo].push(parte.trim());
    }
    return campos;
  };
  const antes = separar(nombre), despues = separar(obs);
  nombre = antes.libre.join("\n").replace(/^(?:nombre|persona|empresa)\s*:\s*/i, "").replace(/\n+/g, " · ");
  quien = [...antes.quien, ...despues.quien].join("\n");
  obs = [...antes.obs, ...despues.libre, ...despues.obs].join("\n");
  if (!nombre || nombre.length > 150 || !/[\p{L}]/u.test(nombre) || !/^[A-Za-z0-9-]{1,10}$/.test(tel)) return null;
  return { nombre, tel: tel.toUpperCase(), quien: quien || "—", obs: obs || "—" };
}
const seguro = (s: string) => s.replace(/([\\*_~`|>])/g, "\\$1").replace(/@/g, "@\u200b");
export function tarjeta(p: {nombre:string;tel:string;obs:string;quien?:string}, autor:string, fecha:string) {
  const dia = new Intl.DateTimeFormat("es-ES", {timeZone:"Europe/Madrid",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(fecha));
  return {allowed_mentions:{parse:[]}, embeds:[{
    title:"FICHA DE CONTACTO · AGENDA DE LA CASA",
    description:`**Nombre:** ${seguro(p.nombre)}\n**Telegrama:** ${seguro(p.tel)}\n**Quién es:** ${seguro(p.quien || "—")}\n**Observaciones:** ${seguro(p.obs)}\n**Apuntado por:** ${seguro(autor)} · ${dia}`,
    color:5982860, timestamp:fecha,
    footer:{text:"Harrington Gunsmith · Saint Denis · 1880",icon_url:"https://juancarlos15022-maker.github.io/harrington-gunsmith/emblema-harrington.png"}
  }]};
}
export async function revisarTelegramas(sb:any, c:Record<string,string>, H:Record<string,string>) {
  const canal = c.canal_telegramas, autor = c.telegramas_autor;
  if (!canal || !autor) return {desactivado:true};
  const dueno = crypto.randomUUID(), ahora = new Date().toISOString();
  const {data:lock,error:le} = await sb.from("bot_telegramas_control").update({lease_owner:dueno,lease_until:new Date(Date.now()+120000).toISOString()}).eq("id",1).lt("lease_until",ahora).select("cursor").maybeSingle();
  if (le) throw new Error("TELEGRAMAS_LOCK");
  if (!lock) return {ocupado:true};
  let cursor = lock.cursor, publicados=0, borrados=0;
  const api = async (metodo:string,ruta:string,cuerpo?:any) => {
    const r=await fetch("https://discord.com/api/v10"+ruta,{method:metodo,headers:H,body:cuerpo===undefined?undefined:JSON.stringify(cuerpo)});
    const texto=await r.text(); let d:any=null; try{d=texto?JSON.parse(texto):null;}catch{}
    return {st:r.status,d};
  };
  try {

    // Corregir fichas antiguas con «Quién es» enviado por error a observaciones.
    const {data:antiguas,error:ae}=await sb.from("bot_telegramas_mensajes").select("origen_id,publicado_id,original,ficha").eq("canal_id",canal).order("origen_id",{ascending:false}).limit(100);
    if(ae) throw new Error("TELEGRAMAS_REPARAR_LECTURA");
    for(const fila of antiguas || []) {
      if(!fila.publicado_id || fila.ficha?.quien !== undefined) continue;
      const p=parsear(fila.original);
      if(!p || p.quien==="—") continue;
      const actual=await api("GET",`/channels/${canal}/messages/${fila.publicado_id}`);
      if(actual.st===404) continue;
      if(actual.st!==200 || !actual.d?.author?.bot || actual.d?.webhook_id) throw new Error("TELEGRAMAS_REPARAR_MENSAJE");
      const emb=actual.d.embeds?.[0];
      if(!emb?.timestamp) throw new Error("TELEGRAMAS_REPARAR_FECHA");
      const nuevo=tarjeta(p,"Vincent Harrington",emb.timestamp).embeds[0].description;
      const anterior=tarjeta(fila.ficha,"Vincent Harrington",emb.timestamp).embeds[0].description;
      // No sobrescribir una edición manual; reintentar si Discord cambió pero falló guardar.
      if(emb.description!==nuevo) {
        if(emb.description!==anterior) throw new Error("TELEGRAMAS_REPARAR_EDITADO");
        const r=await api("PATCH",`/channels/${canal}/messages/${fila.publicado_id}`,{allowed_mentions:{parse:[]},embeds:[{...tarjeta(p,"Vincent Harrington",emb.timestamp).embeds[0]}]});
        if(r.st!==200 || r.d?.embeds?.[0]?.description!==nuevo) throw new Error("TELEGRAMAS_REPARAR_PATCH");
      }
      const ver=await api("GET",`/channels/${canal}/messages/${fila.publicado_id}`);
      if(ver.st!==200 || ver.d?.embeds?.[0]?.description!==nuevo) throw new Error("TELEGRAMAS_REPARAR_VERIFICAR");
      const {error}=await sb.from("bot_telegramas_mensajes").update({ficha:p}).eq("origen_id",fila.origen_id);
      if(error) throw new Error("TELEGRAMAS_REPARAR_GUARDAR");
    }
    for(let pagina=0;pagina<5;pagina++) {
      const lote=await api("GET",`/channels/${canal}/messages?limit=100&after=${cursor}`);
      if(lote.st!==200 || !Array.isArray(lote.d)) throw new Error("TELEGRAMAS_LECTURA_"+lote.st);
      const mensajes=lote.d.sort((a:any,b:any)=>BigInt(a.id)<BigInt(b.id)?-1:1);
      for(const m of mensajes) {
        if(m.author?.id===autor && !m.author.bot && !m.webhook_id && m.type===0) {
          const p=parsear(m.content||"");
          // Nunca borrar archivos adjuntos ni textos ambiguos.
          if(p && !(m.attachments?.length) && !(m.embeds?.length)) {
            const {data:prev,error:pe}=await sb.from("bot_telegramas_mensajes").select("publicado_id,original").eq("origen_id",m.id).maybeSingle();
            if(pe) throw new Error("TELEGRAMAS_ESTADO");
            if(prev && prev.original!==m.content) throw new Error("TELEGRAMAS_ORIGINAL_EDITADO");
            let publicado=prev?.publicado_id;
            if(!prev) {
              const {error}=await sb.from("bot_telegramas_mensajes").insert({origen_id:m.id,canal_id:canal,autor_id:autor,original:m.content,ficha:p});
              if(error) throw new Error("TELEGRAMAS_RESPALDO");
            }
            if(!publicado) {
              const cuerpo={...tarjeta(p,"Vincent Harrington",m.timestamp),nonce:m.id,enforce_nonce:true};
              // Recupera una publicación previa aunque se interrumpiera antes de guardar su ID.
              const recientes=await api("GET",`/channels/${canal}/messages?limit=100`);
              if(recientes.st!==200) throw new Error("TELEGRAMAS_RECONCILIAR");
              const existente=recientes.d.find((x:any)=>x.author?.bot && !x.webhook_id && (x.nonce===m.id || JSON.stringify(x.embeds?.[0]?.description)===JSON.stringify(cuerpo.embeds[0].description)));
              if(existente) publicado=existente.id;
              else {
                const r=await api("POST",`/channels/${canal}/messages`,cuerpo);
                if(r.st!==200 || !r.d?.id) throw new Error("TELEGRAMAS_PUBLICAR_"+r.st);
                publicado=r.d.id; publicados++;
              }
              const {error}=await sb.from("bot_telegramas_mensajes").update({publicado_id:publicado}).eq("origen_id",m.id);
              if(error) throw new Error("TELEGRAMAS_GUARDAR_PUBLICACION");
            }
            const ver=await api("GET",`/channels/${canal}/messages/${publicado}`);
            if(ver.st!==200 || ver.d?.embeds?.[0]?.description!==tarjeta(p,"Vincent Harrington",m.timestamp).embeds[0].description) throw new Error("TELEGRAMAS_VERIFICAR_FICHA");
            // Releer antes de borrar para no perder una edición posterior del usuario.
            const original=await api("GET",`/channels/${canal}/messages/${m.id}`);
            if(original.st!==404) {
              if(original.st!==200 || original.d?.content!==m.content || original.d?.attachments?.length) throw new Error("TELEGRAMAS_REVISAR_ORIGINAL");
              const del=await api("DELETE",`/channels/${canal}/messages/${m.id}`);
              if(![204,404].includes(del.st)) throw new Error("TELEGRAMAS_BORRAR_"+del.st);
              borrados++;
            }
            const {error}=await sb.from("bot_telegramas_mensajes").update({borrado:true}).eq("origen_id",m.id);
            if(error) throw new Error("TELEGRAMAS_GUARDAR_BORRADO");
          }
        }
        cursor=m.id;
        const {error}=await sb.from("bot_telegramas_control").update({cursor}).eq("id",1).eq("lease_owner",dueno);
        if(error) throw new Error("TELEGRAMAS_CURSOR");
      }
      if(mensajes.length<100) break;
    }
    if(publicados||borrados) await sb.from("bot_registro").insert({metodo:"TELEGRAMAS",ruta:`/channels/${canal}`,motivo:`${publicados} fichas publicadas; ${borrados} originales sustituidos`,estado:200});
    return {publicados,borrados};
  } finally {
    await sb.from("bot_telegramas_control").update({lease_until:new Date(0).toISOString(),lease_owner:null}).eq("id",1).eq("lease_owner",dueno);
  }
}
