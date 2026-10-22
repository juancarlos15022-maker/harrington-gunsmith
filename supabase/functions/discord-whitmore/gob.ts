import {actualizarCuentas} from './cuentas.ts';
// Señor Whitmore · funciones de gobierno (22/10/2026). Todo es interno del equipo de gobierno:
// agenda, audiencias, reuniones y actas, actos de campaña, telegramas, decretos con firma, propuestas con votación,
// programa, tareas, contactos, negocios, cuentas, cuenta atrás y avisos automáticos. Datos en gob_registros / gob_votos.
type Any = any;
const AZUL = 0x2f4a6d, ORO = 0xc9a24a, VERDE = 0x3e8e4e, ROJO = 0x8b2e25, GRIS = 0x6b6b6b;
const PIE = { text: "Sr. Whitmore · Consejo de Gobierno" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const limpio = (s: unknown, n = 300) => String(s ?? "").replace(/@(everyone|here)/g, "@​$1").trim().slice(0, n);
export const dolar = (c: number) => (c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- fechas (hora de Madrid) ---------- */
function partes(ms: number) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
const desfase = (ms: number) => { const p = partes(ms); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000; };
export function madridMs(y: number, mo: number, d: number, h: number, mi: number) {
  const g = Date.UTC(y, mo - 1, d, h, mi); let r = g - desfase(g); const o2 = desfase(r); if (g - o2 !== r) r = g - o2; return r;
}
export function leerFecha(f: string, h = "09:00"): number | null {
  const ahora = partes(Date.now()); let y = ahora.y, mo = ahora.mo, d = ahora.d, conAnio = false;
  const t = String(f || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (t === "hoy") { /* hoy */ } else if (t === "manana") { const x = partes(Date.now() + 86400000); y = x.y; mo = x.mo; d = x.d; }
  else if (t === "pasado manana") { const x = partes(Date.now() + 2 * 86400000); y = x.y; mo = x.mo; d = x.d; }
  else { const m = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(t); if (!m) return null; d = +m[1]; mo = +m[2]; if (m[3] && +m[3] !== 1880) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; conAnio = true; } }
  const hm = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(String(h || "").trim()); if (!hm) return null;
  const hh = +hm[1], mi = +(hm[2] || 0); if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
  let ms = madridMs(y, mo, d, hh, mi);
  if (!conAnio && ms < Date.now() - 30 * 86400000) ms = madridMs(y + 1, mo, d, hh, mi);
  const c = partes(ms); if (c.d !== d) return null; // 31/02 y similares
  return ms;
}
export function fechaTxt(ms: number, conHora = true) {
  const p = partes(ms), wd = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return `${DIAS[wd]} ${p.d} de ${MESES[p.mo - 1]} de 1880` + (conHora ? ` a las ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}` : "");
}
const ts = (ms: number, f = "F") => f === "R" ? `<t:${Math.floor(ms / 1000)}:R>` : fechaTxt(ms);
const diaMadrid = (ms = Date.now()) => { const p = partes(ms); return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
export const inicioDia = (ms = Date.now()) => { const p = partes(ms); return madridMs(p.y, p.mo, p.d, 0, 0); };

/* ---------- respuestas a Discord ---------- */
const R = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
export const eph = (content: string, extra: Any = {}) => R({ type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, content: content.slice(0, 2000), ...extra } });
const actualizar = (payload: Any) => R({ type: 7, data: { allowed_mentions: { parse: [] }, ...payload } });
function modal(custom_id: string, title: string, campos: Any[]) {
  return R({ type: 9, data: { custom_id, title: title.slice(0, 45), components: campos.map((f) => ({ type: 1, components: [{ type: 4, custom_id: f.id, label: f.label.slice(0, 45), style: f.largo ? 2 : 1, required: f.req !== false, max_length: f.max || (f.largo ? 3500 : 200), ...(f.value ? { value: String(f.value).slice(0, f.max || 3500) } : {}), ...(f.ph ? { placeholder: f.ph.slice(0, 100) } : {}) }] })) } });
}
const btn = (label: string, custom_id: string, style = 2, emoji?: string) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) });
const fila = (...b: Any[]) => ({ type: 1, components: b });

/* ---------- contexto ---------- */
export type Ctx = { sb: Any; c: Record<string, string>; avisos?: string[]; api: (m: string, p: string, b?: unknown) => Promise<Any> };
function quien(i: Any) {
  const m = i.member || {}, u = m.user || i.user || {};
  const roles: string[] = m.roles || [];
  let admin = false; try { admin = (BigInt(m.permissions || "0") & 8n) === 8n; } catch { /* */ }
  return { id: String(u.id || ""), nombre: limpio(m.nick || u.global_name || u.username || "—", 60), roles, admin };
}
const tiene = (x: ReturnType<typeof quien>, c: Record<string, string>, ...k: string[]) => x.admin || k.some((r) => c["rol_" + r] && x.roles.includes(c["rol_" + r]));
const enConsejo = (x: ReturnType<typeof quien>, c: Record<string, string>) => tiene(x, c, "consejo", "gobernador", "gobernacion", "economia");

export async function nuevo(ctx: Ctx, tipo: string, campos: Any, numerar = true) {
  const numero = numerar ? (await ctx.sb.rpc("gob_siguiente", { p_tipo: tipo })).data : null;
  const { data, error } = await ctx.sb.from("gob_registros").insert({ tipo, numero, ...campos }).select("*").single();
  if (error) throw Error("No he podido guardarlo. Inténtelo de nuevo.");
  return data;
}
export const cambiar = async (ctx: Ctx, id: number, v: Any) => {const r=await ctx.sb.from("gob_registros").update({ ...v, actualizado: new Date().toISOString() }).eq("id", id).select("*").single();if(r.error||!r.data)throw Error("No he podido guardar el cambio.");return r.data;};
export const leer = async (ctx: Ctx, id: number) => (await ctx.sb.from("gob_registros").select("*").eq("id", id).maybeSingle()).data;
// La copia de Discord pendiente queda unida al registro; el aviso periódico reintenta.
async function sincronizar(ctx: Ctx, r: Any, canal: string, payload: Any) {
  const {data: actual,error} = await ctx.sb.from("gob_registros").select("*").eq("id",r.id).single();
  if(error || !actual) throw Error("No he podido consultar el expediente.");
  const pendiente={canal,payload}, datos={...actual.datos,_discord:pendiente};
  const saved=await ctx.sb.from("gob_registros").update({datos}).eq("id",r.id);
  if(saved.error) throw Error("No he podido registrar el envío.");
  try {
    const ruta=actual.mensaje_id ? `/channels/${actual.canal_id}/messages/${actual.mensaje_id}` : `/channels/${canal}/messages`;
    let m;
    try { m=await ctx.api(actual.mensaje_id?"PATCH":"POST",ruta,{...payload,...(!actual.mensaje_id?{nonce:String(r.id),enforce_nonce:true}:{})}); }
    catch(e){ if(actual.mensaje_id && String(e).includes("404"))m=await ctx.api("POST",`/channels/${canal}/messages`,{...payload,nonce:String(r.id),enforce_nonce:true});else throw e; }
    // Solo retirar la copia que acabamos de entregar: conservar una edición concurrente.
    const fin={...actual.datos};delete fin._discord;
    const u=await ctx.sb.from("gob_registros").update({canal_id:canal,mensaje_id:m.id,datos:fin}).eq("id",r.id).eq("datos",JSON.stringify(datos));
    if(u.error)throw Error("No he podido confirmar el envío.");
    return m;
  } catch(e) { (ctx.avisos ||= []).push("El escrito está guardado. La copia para Discord queda en la bandeja de salida y el Sr. Whitmore volverá a intentarlo.");return null; }
}
export async function publicar(ctx: Ctx,r:Any,canal:string,payload:Any,menciones:Any={parse:[]}) {return sincronizar(ctx,r,canal,{allowed_mentions:menciones,...payload});}
export async function repintar(ctx:Ctx,r:Any,payload:Any) {
 const canal=r.canal_id || (r.tipo==='decreto'?ctx.c.canal_documentos:r.tipo==='telegrama'?ctx.c.canal_telegramas:r.tipo==='propuesta'?ctx.c.canal_propuestas:['acto','campana','idea_campana','hito_electoral'].includes(r.tipo)?ctx.c.canal_campana:ctx.c.canal_agenda);
 return sincronizar(ctx,r,canal,{allowed_mentions:{parse:[]},...payload});
}
const enlace = (ctx: Ctx, canal: string, msg?: string) => `https://discord.com/channels/${ctx.c.guild_id}/${canal}${msg ? "/" + msg : ""}`;
export async function votos(ctx: Ctx, id: number) {
  const { data } = await ctx.sb.from("gob_votos").select("usuario_id,nombre,voto").eq("registro_id", id);
  const si = (data || []).filter((v: Any) => v.voto === "si"), no = (data || []).filter((v: Any) => v.voto === "no");
  return { si, no, txt: (l: Any[]) => l.length ? l.map((v: Any) => v.nombre).join(", ") : "—" };
}
export async function votar(ctx: Ctx, id: number, x: Any, voto: string) {
  await ctx.sb.from("gob_votos").upsert({ registro_id: id, usuario_id: x.id, nombre: x.nombre, voto, creado: new Date().toISOString() }, { onConflict: "registro_id,usuario_id" });
}

/* ---------- tarjetas ---------- */
export function tarjetaCita(r: Any) {
  const d = r.datos, can = r.estado === "cancelada";
  return { embeds: [{ title: `📅 Cita n.º ${r.numero} · ${d.con}`, color: can ? GRIS : AZUL,
    description: (can ? "~~" : "") + `**Cuándo:** ${ts(new Date(r.cuando).getTime())} (${ts(new Date(r.cuando).getTime(), "R")})` + (can ? "~~" : "") + (d.lugar ? `\n**Lugar:** ${d.lugar}` : "") + (d.motivo ? `\n**Motivo:** ${d.motivo}` : "") + (d.audiencia ? `\n*Viene de la audiencia n.º ${d.audiencia}.*` : "") + (can ? `\n\n❌ **Cancelada** por ${d.canceladaPor || "—"}.` : ""),
    footer: { text: `Apuntada por ${r.autor} · Sr. Whitmore` } }], components: can ? [] : [fila(btn("Cancelar cita", "cita:cancel:" + r.id, 4))] };
}
export function tarjetaAudiencia(r: Any) {
  const d = r.datos, est = r.estado;
  const col = est === "aceptada" ? VERDE : est === "rechazada" ? ROJO : ORO;
  return { embeds: [{ title: `🏛️ Audiencia n.º ${r.numero} · ${d.quien}`, color: col,
    description: `**Motivo:** ${d.motivo}` + (d.telegrama ? `\n**Telegrama:** ${d.telegrama}` : "") + (d.cuando ? `\n**Le vendría bien:** ${d.cuando}` : "") +
      (est === "aceptada" ? `\n\n✅ **Aceptada** por ${d.decide}: ${ts(new Date(r.cuando).getTime())}${d.lugar ? " · " + d.lugar : ""}. Ya está en la agenda (cita n.º ${d.cita}).` : est === "rechazada" ? `\n\n❌ **Rechazada** por ${d.decide}${d.razon ? ": " + d.razon : "."}` : "\n\n⏳ **Pendiente** de que el gobernador la acepte o la rechace."),
    footer: { text: `Apuntada por ${r.autor} · Sr. Whitmore` } }],
    components: est === "pendiente" ? [fila(btn("Aceptar", "aud:ok:" + r.id, 3, "✅"), btn("Rechazar", "aud:no:" + r.id, 4, "✖️"))] : [] };
}
export async function tarjetaReunion(ctx: Ctx, r: Any) {
  const d = r.datos, v = await votos(ctx, r.id), ms = new Date(r.cuando).getTime(), acto = r.tipo === "acto";
  const orden = (d.orden || "").split(";").map((s: string) => s.trim()).filter(Boolean);
  const cerrada = ["cerrada","cancelada"].includes(r.estado);
  return { embeds: [{ title: (acto ? "🗳️ Acto de campaña · " : "🤝 Reunión n.º " + r.numero + " · ") + d.titulo, color: cerrada ? GRIS : acto ? ORO : AZUL,
    description: `**Cuándo:** ${ts(ms)} (${ts(ms, "R")})` + (d.lugar ? `\n**Lugar:** ${d.lugar}` : "") + (d.notas ? `\n**Notas:** ${d.notas}` : "") +
      (orden.length ? "\n\n**Orden del día**\n" + orden.map((x: string, k: number) => `${k + 1}. ${x}`).join("\n") : "") +
      `\n\n✅ **Asistirán:** ${v.txt(v.si)}\n❌ **No podrán:** ${v.txt(v.no)}` + (d.acta ? `\n\n📜 Acta n.º ${d.acta} en documentos.` : ""),
    footer: { text: `Convocada por ${r.autor} · Sr. Whitmore` } }],
    components: cerrada ? [] : [fila(btn("Asistiré", (acto ? "act" : "reu") + ":si:" + r.id, 3), btn("No podré", (acto ? "act" : "reu") + ":no:" + r.id, 2), ...(acto ? [] : [btn("Escribir acta", "reu:acta:" + r.id, 1, "📜")]))] };
}
export function tarjetaActa(r: Any) {
  const d = r.datos;
  return { embeds: [{ title: `📜 Acta n.º ${r.numero} · ${d.titulo}`, color: GRIS, thumbnail:{url:"https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/img/escudo-republicano.webp"},url:"https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#archivo",
    description: `**Reunión del** ${fechaTxt(d.fecha)}\n**Asistentes:** ${d.asistentes || "—"}\n\n**Acuerdos**\n${d.acuerdos}` + (d.notas ? `\n\n**Notas**\n${d.notas}` : ""), footer: { text: `Redactada por ${r.autor} · Sr. Whitmore` } }] };
}
function saludo() { const h = partes(Date.now()).h; return h >= 6 && h < 14 ? "Buenos días" : h >= 14 && h < 21 ? "Buenas tardes" : "Buenas noches"; }
export function firmaDe(ctx: Ctx, x: Any) { return `${ctx.c.firma_nombre || x.nombre}\n${ctx.c.firma_cargo || "Gobernador"} · Silver Peak`; }
export function telegramaTxt(ctx: Ctx, x: Any, para: string, texto: string) {
  const t = texto.trim().replace(/\s+$/, ""), fin = /[.!?…]$/.test(t) ? "" : ".";
  return `${para}:\n\n${saludo()}. ${t}${fin}\n\nReciba un cordial saludo,\n${firmaDe(ctx, x)}`;
}
export function tarjetaTelegrama(r: Any) {
  const d = r.datos, entra = d.sentido === "entrada";
  return { embeds: [{ title: (entra ? "📥 Telegrama recibido · de " : "📤 Telegrama para ") + (entra ? d.de : d.para), color: entra ? ORO : AZUL,
    description: (entra ? d.texto : "```\n" + d.texto.replace(/```/g, "ˋˋˋ") + "\n```") + (d.telegrama ? `\n**Telegrama:** ${d.telegrama}` : "") + (d.respondido ? `\n\n✅ Respondido por ${d.respondido}.` : ""),
    footer: { text: `${entra ? "Registrado" : "Redactado"} por ${r.autor} · n.º ${r.numero} · Sr. Whitmore` } }],
    components: entra && !d.respondido ? [fila(btn("Redactar respuesta", "tel:resp:" + r.id, 1, "✍️"))] : [] };
}
export const TIPO_DOC: Record<string, string> = { decreto: "DECRETO", comunicado: "COMUNICADO", carta: "CARTA" };
export function textoDocumento(r: Any) {
  const d = r.datos, p = partes(d.firmadoMs || Date.now());
  const cab = `${TIPO_DOC[d.clase] || "DOCUMENTO"}${d.numDoc ? " N.º " + d.numDoc : ""}\n${String(d.titulo).toUpperCase()}`;
  return `${cab}\n\n${d.texto}\n\nDado en Silver Peak, a ${p.d} de ${MESES[p.mo - 1]} de 1880.\n\n${d.firma || "(pendiente de firma)"}`;
}
export function tarjetaDecreto(r: Any) {
  const d = r.datos, est = r.estado;
  return { embeds: [{ title: `${est === "firmado" ? "🖋️" : est === "descartado" ? "🗑️" : "📝"} ${TIPO_DOC[d.clase] || "Documento"}${d.numDoc ? " n.º " + d.numDoc : ""} · ${d.titulo}`, color: est === "firmado" ? ORO : est === "descartado" ? GRIS : AZUL,
    thumbnail:{url:"https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/img/escudo-republicano.webp"},
    url:"https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#documentos/"+r.id,
    description: (d.area_nombre ? `**Secretaría de ${d.area_nombre} · Expediente ${d.expediente}**\n${d.importeCents ? "Importe del expediente: "+dolar(d.importeCents)+"\n" : ""}` : "") + (est === "borrador" ? "*Borrador pendiente de la firma del gobernador.*\n\n" : "") + "```\n" + textoDocumento(r).replace(/```/g, "ˋˋˋ").slice(0, 3800) + "\n```",
    footer: { text: (est === "firmado" ? `Firmado el ${fechaTxt(d.firmadoMs)}` : est === "descartado" ? "Descartado" : `Redactado por ${r.autor}`) + " · Sr. Whitmore" } }],
    components: est === "borrador" ? [fila(btn("Firmar", "dec:firmar:" + r.id, 3, "🖋️"), btn("Editar", "dec:editar:" + r.id, 2, "✏️"), btn("Descartar", "dec:descartar:" + r.id, 4))] : [] };
}
export async function tarjetaPropuesta(ctx: Ctx, r: Any) {
  const d = r.datos, v = await votos(ctx, r.id), est = r.estado;
  return { embeds: [{ title: `💡 Propuesta n.º ${r.numero} · ${d.titulo}`, color: est === "aprobada" ? VERDE : est === "rechazada" ? ROJO : AZUL,
    description: `${d.texto}\n\n👍 **A favor (${v.si.length}):** ${v.txt(v.si)}\n👎 **En contra (${v.no.length}):** ${v.txt(v.no)}` +
      (est === "aprobada" ? "\n\n✅ **Aprobada por el Consejo.** Sigue pendiente de la autorización de la Presidencia; no constituye un compromiso de ejecución ni un plazo." : est === "rechazada" ? "\n\n❌ **Rechazada.**" : ""),
    footer: { text: `Presentada por ${r.autor}${d.cierra ? " · votación cerrada por " + d.cierra : ""} · Sr. Whitmore` } }],
    components: est === "abierta" ? [fila(btn("A favor", "pro:si:" + r.id, 3, "👍"), btn("En contra", "pro:no:" + r.id, 4, "👎"), btn("Cerrar votación", "pro:cerrar:" + r.id, 2, "🔒"))] : [] };
}
export function tarjetaTarea(r: Any) {
  const d = r.datos, hecha = r.estado === "hecha";
  return { content: hecha ? "" : `<@${d.para}>`, embeds: [{ title: `${hecha ? "✅" : "📋"} Tarea n.º ${r.numero}`, color: hecha ? VERDE : AZUL,
    description: `${d.texto}\n\n**Para:** <@${d.para}>` + (r.cuando ? `\n**Plazo:** ${ts(new Date(r.cuando).getTime(), "D")} (${ts(new Date(r.cuando).getTime(), "R")})` : "") + (hecha ? `\n\n✅ Hecha por ${d.hechaPor}.` : ""),
    footer: { text: `Encargada por ${r.autor} · Sr. Whitmore` } }], components: hecha ? [] : [fila(btn("Hecha", "tar:hecha:" + r.id, 3, "✅"))] };
}

/* ---------- ayuda ---------- */
const AYUDA = [
  "🏛️ **Sr. Whitmore · lo que hago por el gobierno**",
  "**Agenda** — `/cita nueva`, `/cita hoy`, `/cita semana`, `/cita cancelar`. Aviso una hora antes en #agenda-y-reuniones.",
  "**Audiencias** — `/audiencia nueva` (quien la pide); el gobernador pulsa **Aceptar** (va a la agenda) o **Rechazar**. `/audiencia pendientes`.",
  "**Reuniones** — `/reunion nueva` con orden del día (puntos separados por ;). Botones Asistiré / No podré y **Escribir acta** (queda numerada en #documentos).",
  "**Campaña** — `/acto nuevo`, `/acto proximos`, `/elecciones fijar` y `/elecciones ver`, `/programa` (propuestas aprobadas).",
  "**Telegramas** — `/telegrama recibido` (con botón para redactar la respuesta), `/telegrama redactar`, `/telegrama lista`. Te los dejo listos para copiar, con la firma.",
  "**Documentos** — `/decreto nuevo` (decreto, comunicado o carta): queda como borrador y el gobernador pulsa **Firmar**; se numera y se archiva. `/firma` cambia el cargo y el nombre de la firma.",
  "**Propuestas** — `/propuesta nueva`: votación A favor / En contra; el gobernador la cierra. Las votadas favorablemente se trasladan para valoración; no autorizan compromisos.",
  "**Tareas** — `/tarea nueva` con plazo; aviso el día del plazo. `/tarea lista`.",
  "**Contactos y negocios** — `/contacto nuevo|buscar|lista`, `/negocio nuevo|buscar|lista`.",
  "**Cuentas** — `/cuenta ingreso`, `/cuenta gasto`, `/cuenta saldo` (Economía y el gobernador). Informe cada domingo en #economía.",
  "**Resumen** — `/resumen`; además, cada día a las 9:00 dejo el resumen del día en #agenda-y-reuniones.",
  "**Web del gobierno** — `/acceso` le da un enlace personal (10 minutos, un solo uso) para entrar en la web.",
].join("\n");

/* ---------- órdenes ---------- */
const opciones = (i: Any) => { const s = (i.data.options || [])[0]; const sub = s && s.type === 1 ? s : null; const arr = sub ? sub.options || [] : i.data.options || []; return { sub: sub?.name || "", o: Object.fromEntries(arr.map((x: Any) => [x.name, x.value])) as Record<string, Any> }; };

export async function orden(ctx: Ctx, i: Any): Promise<Response> {
  const x = quien(i), c = ctx.c;
  if (!enConsejo(x, c)) return eph("Estas órdenes son solo para el Consejo de Gobierno.");
  const { sub, o } = opciones(i), n = i.data.name;
  const base = { autor: x.nombre, autor_id: x.id };
  if (n === "whitmore") return eph(AYUDA);
  if (n === "acceso") {
    const bytes = crypto.getRandomValues(new Uint8Array(32)), token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await ctx.sb.from("gob_accesos").insert({ token_hash: hash, usuario_id: x.id, nombre: x.nombre, expira: new Date(Date.now() + 10 * 60000).toISOString() });
    if (error) return eph("No he podido preparar su entrada. Inténtelo de nuevo.");
    const web = c.web_gobierno || "https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/";
    return eph("🔐 Aquí tiene su entrada al despacho. Es personal: no la comparta. Sirve una sola vez y caduca en 10 minutos.", { components: [fila({ type: 2, style: 5, label: "Entrar en el despacho", url: web + "?t=" + token })] });
  }

  if (n === "cita") {
    if (sub === "nueva") {
      const ms = leerFecha(o.fecha, o.hora); if (!ms) return eph("No entiendo la fecha o la hora. Ejemplo: fecha `25/10`, hora `18:30`.");
      const r = await nuevo(ctx, "cita", { ...base, cuando: new Date(ms).toISOString(), datos: { con: limpio(o.con, 100), lugar: limpio(o.lugar, 100), motivo: limpio(o.motivo, 300) } });
      const m = await publicar(ctx, r, c.canal_agenda, tarjetaCita(r));
      return eph(`📅 Cita n.º ${r.numero} apuntada: **${r.datos.con}**, ${fechaTxt(ms)}. ${m?.id ? enlace(ctx, c.canal_agenda, m.id) : ""}`);
    }
    if (sub === "cancelar") {
      const { data: r } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "cita").eq("numero", o.numero).maybeSingle();
      if (!r || r.estado === "cancelada") return eph("No encuentro esa cita, o ya estaba cancelada.");
      const r2 = await cambiar(ctx, r.id, { estado: "cancelada", datos: { ...r.datos, canceladaPor: x.nombre } }); await repintar(ctx, r2, tarjetaCita(r2));
      return eph(`Cita n.º ${r.numero} cancelada.`);
    }
    const desde = sub === "hoy" ? inicioDia() : Date.now() - 3600000, hasta = sub === "hoy" ? inicioDia() + 86400000 : inicioDia() + 8 * 86400000;
    return eph(await agendaTxt(ctx, desde, hasta, sub === "hoy" ? "📅 **Agenda de hoy**" : "📅 **Agenda de los próximos 7 días**"));
  }

  if (n === "audiencia") {
    if (sub === "nueva") {
      const r = await nuevo(ctx, "audiencia", { ...base, estado: "pendiente", datos: { quien: limpio(o.quien, 100), motivo: limpio(o.motivo, 400), telegrama: limpio(o.telegrama, 20), cuando: limpio(o.cuando, 60) } });
      const menc = c.rol_gobernador ? { roles: [c.rol_gobernador] } : { parse: [] };
      const m = await publicar(ctx, r, c.canal_agenda, { content: c.rol_gobernador ? `<@&${c.rol_gobernador}>, nueva solicitud de audiencia.` : "", ...tarjetaAudiencia(r) }, menc);
      return eph(`🏛️ Audiencia n.º ${r.numero} apuntada. El gobernador la verá en #agenda-y-reuniones. ${m?.id ? enlace(ctx, c.canal_agenda, m.id) : ""}`);
    }
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "audiencia").eq("estado", "pendiente").order("creado").limit(15);
    return eph((data || []).length ? "🏛️ **Audiencias pendientes**\n" + data.map((r: Any) => `• n.º ${r.numero} · **${r.datos.quien}**: ${r.datos.motivo}${r.mensaje_id ? " · " + enlace(ctx, r.canal_id, r.mensaje_id) : ""}`).join("\n") : "No hay audiencias pendientes.");
  }

  if (n === "reunion" || n === "acto") {
    const acto = n === "acto";
    if (sub === "nueva" || sub === "nuevo") {
      const ms = leerFecha(o.fecha, o.hora); if (!ms) return eph("No entiendo la fecha o la hora. Ejemplo: fecha `25/10`, hora `18:30`.");
      const r = await nuevo(ctx, acto ? "acto" : "reunion", { ...base, cuando: new Date(ms).toISOString(), datos: { titulo: limpio(o.titulo, 100), lugar: limpio(o.lugar, 100), orden: limpio(o.orden, 900), notas: limpio(o.notas, 500) } });
      const canal = acto ? c.canal_campana : c.canal_agenda;
      const m = await publicar(ctx, r, canal, { content: c.rol_consejo ? `<@&${c.rol_consejo}>` : "", ...(await tarjetaReunion(ctx, r)) }, c.rol_consejo ? { roles: [c.rol_consejo] } : { parse: [] });
      return eph(`${acto ? "🗳️ Acto apuntado" : "🤝 Reunión convocada"}: **${r.datos.titulo}**, ${fechaTxt(ms)}. Aviso una hora antes. ${m?.id ? enlace(ctx, canal, m.id) : ""}`);
    }
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", acto ? "acto" : "reunion").neq("estado", "cerrada").gte("cuando", new Date(Date.now() - 3 * 3600000).toISOString()).order("cuando").limit(10);
    return eph((data || []).length ? (acto ? "🗳️ **Próximos actos**\n" : "🤝 **Próximas reuniones**\n") + data.map((r: Any) => `• ${ts(new Date(r.cuando).getTime())} · **${r.datos.titulo}**${r.datos.lugar ? " · " + r.datos.lugar : ""}`).join("\n") : acto ? "No hay actos apuntados." : "No hay reuniones convocadas.");
  }

  if (n === "telegrama") {
    if (sub === "recibido") {
      const r = await nuevo(ctx, "telegrama", { ...base, datos: { sentido: "entrada", de: limpio(o.de, 100), texto: limpio(o.texto, 1500), telegrama: limpio(o.telegrama, 20) } });
      const m = await publicar(ctx, r, c.canal_telegramas, tarjetaTelegrama(r));
      return eph(`📥 Telegrama de **${r.datos.de}** registrado. ${m?.id ? enlace(ctx, c.canal_telegramas, m.id) : ""}`);
    }
    if (sub === "redactar") {
      const texto = telegramaTxt(ctx, x, limpio(o.para, 100), limpio(o.texto, 1500));
      const r = await nuevo(ctx, "telegrama", { ...base, datos: { sentido: "salida", para: limpio(o.para, 100), texto, telegrama: limpio(o.telegrama, 20) } });
      await publicar(ctx, r, c.canal_telegramas, tarjetaTelegrama(r));
      return eph("📤 Telegrama listo para copiar (también queda en #telegramas):\n```\n" + texto + "\n```");
    }
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "telegrama").order("creado", { ascending: false }).limit(10);
    return eph((data || []).length ? "📨 **Últimos telegramas**\n" + data.map((r: Any) => `• ${r.datos.sentido === "entrada" ? "📥 de **" + r.datos.de + "**" : "📤 para **" + r.datos.para + "**"} · ${fechaTxt(new Date(r.creado).getTime())}${r.mensaje_id ? " · " + enlace(ctx, r.canal_id, r.mensaje_id) : ""}`).join("\n") : "Todavía no hay telegramas.");
  }

  if (n === "decreto") {
    if (sub === "nuevo") return modal("dec:nuevo:" + (o.tipo || "decreto"), "Nuevo " + (o.tipo || "decreto"), [{ id: "titulo", label: "Título", max: 100 }, { id: "texto", label: "Texto", largo: true, max: 3000 }]);
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "decreto").neq("estado", "descartado").order("creado", { ascending: false }).limit(15);
    return eph((data || []).length ? "📜 **Documentos**\n" + data.map((r: Any) => `• ${r.estado === "firmado" ? "🖋️" : "📝"} ${TIPO_DOC[r.datos.clase]}${r.datos.numDoc ? " n.º " + r.datos.numDoc : " (borrador)"} · **${r.datos.titulo}**${r.mensaje_id ? " · " + enlace(ctx, r.canal_id, r.mensaje_id) : ""}`).join("\n") : "Todavía no hay documentos.");
  }

  if (n === "propuesta") {
    if (sub === "nueva") return modal("pro:nueva", "Nueva propuesta", [{ id: "titulo", label: "Título", max: 100 }, { id: "texto", label: "Propuesta", largo: true, max: 2000 }]);
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "propuesta").eq("estado", "abierta").order("creado").limit(15);
    return eph((data || []).length ? "💡 **Propuestas en votación**\n" + data.map((r: Any) => `• n.º ${r.numero} · **${r.datos.titulo}**${r.mensaje_id ? " · " + enlace(ctx, r.canal_id, r.mensaje_id) : ""}`).join("\n") : "No hay propuestas abiertas.");
  }

  if (n === "programa") {
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "propuesta").eq("estado", "aprobada").order("numero").limit(40);
    if (!(data || []).length) return eph("El programa está vacío: todavía no se ha aprobado ninguna propuesta.");
    const txt = data.map((r: Any, k: number) => `**${k + 1}. ${r.datos.titulo}**\n${r.datos.texto}`).join("\n\n");
    if (o.publicar) {
      await ctx.api("POST", `/channels/${c.canal_campana}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📘 Propuestas del Consejo para valoración de la Presidencia", color: ORO, description: txt.slice(0, 4000), footer: { text: `${data.length} propuestas votadas por el Consejo; pendientes de autorización · Sr. Whitmore` } }] });
      return eph("📘 Propuestas internas publicadas en campaña; no constituyen compromisos autorizados.");
    }
    return eph("📘 **Propuestas del Consejo pendientes de valoración de la Presidencia**\n\n" + txt);
  }

  if (n === "tarea") {
    if (sub === "nueva") {
      let plazo: number | null = null; if (o.plazo) { plazo = leerFecha(o.plazo, "09:00"); if (!plazo) return eph("No entiendo el plazo. Ejemplo: `25/10`, `hoy` o `mañana`."); }
      const para = String(o.para), nombre = limpio(i.data.resolved?.members?.[para]?.nick || i.data.resolved?.users?.[para]?.global_name || i.data.resolved?.users?.[para]?.username || "—", 60);
      const r = await nuevo(ctx, "tarea", { ...base, cuando: plazo ? new Date(plazo).toISOString() : null, avisado: !plazo, datos: { para, paraNombre: nombre, texto: limpio(o.texto, 500) } });
      const m = await publicar(ctx, r, c.canal_tareas, tarjetaTarea(r), { users: [para] });
      return eph(`📋 Tarea n.º ${r.numero} encargada a **${nombre}**. ${m?.id ? enlace(ctx, c.canal_tareas, m.id) : ""}`);
    }
    let q = ctx.sb.from("gob_registros").select("*").eq("tipo", "tarea").eq("estado", "abierto").order("cuando", { nullsFirst: false }).limit(20);
    if (o.de) q = q.eq("datos->>para", String(o.de));
    const { data } = await q;
    return eph((data || []).length ? "📋 **Tareas pendientes**\n" + data.map((r: Any) => `• n.º ${r.numero} · ${r.datos.texto} — **${r.datos.paraNombre}**${r.cuando ? " · plazo " + ts(new Date(r.cuando).getTime(), "D") : ""}`).join("\n") : "No hay tareas pendientes.");
  }

  if (n === "contacto" || n === "negocio") {
    const tipo = n;
    if (sub === "nuevo") {
      const datos = tipo === "contacto" ? { nombre: limpio(o.nombre, 100), telegrama: limpio(o.telegrama, 20), clase: limpio(o.tipo, 60), notas: limpio(o.notas, 500) }
        : { nombre: limpio(o.nombre, 100), dueno: limpio(o.dueno, 100), clase: limpio(o.tipo, 60), ubicacion: limpio(o.ubicacion, 60), telegrama: limpio(o.telegrama, 20), notas: limpio(o.notas, 500) };
      const r = await nuevo(ctx, tipo, { ...base, datos });
      if (tipo === "negocio") await publicar(ctx, r, c.canal_economia, { embeds: [{ title: "🏪 Negocio · " + datos.nombre, color: ORO, description: ficha(r), footer: { text: `Apuntado por ${x.nombre} · Sr. Whitmore` } }] });
      return eph(`${tipo === "contacto" ? "📇 Contacto" : "🏪 Negocio"} **${datos.nombre}** apuntado.`);
    }
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", tipo).order("creado", { ascending: false }).limit(200);
    let l = data || [];
    if (sub === "buscar") { const t = norm(o.texto); l = l.filter((r: Any) => norm(Object.values(r.datos).join(" ")).includes(t)); }
    if (!l.length) return eph(sub === "buscar" ? "No encuentro nada con ese texto." : tipo === "contacto" ? "Todavía no hay contactos." : "Todavía no hay negocios.");
    return eph((tipo === "contacto" ? "📇 **Contactos**\n" : "🏪 **Negocios**\n") + l.slice(0, 15).map((r: Any) => "• " + ficha(r).replace(/\n/g, " · ")).join("\n") + (l.length > 15 ? `\n…y ${l.length - 15} más (usa buscar).` : ""));
  }

  if (n === "cuenta") {
    if (sub === "ingreso" || sub === "gasto") {
      if (!tiene(x, c, "economia", "gobernador")) return eph("Las cuentas las lleva la Secretaría de Economía y Comercio (y el gobernador).");
      return eph("Prepare el ingreso o pago en el libro de Hacienda: https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#hacienda/movimientos . El Gobernador lo autorizará y su ejecución quedará asentada una sola vez.");
    }
    const { data } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "movimiento").order("creado", { ascending: false }).limit(10);
    return eph(`💰 **Balance de asientos históricos:** ${dolar(await saldo(ctx))}` + ((data || []).length ? "\n\n**Últimos movimientos**\n" + data.map((r: Any) => `• ${dolar(r.datos.cents)} · ${r.datos.concepto} · ${fechaTxt(new Date(r.creado).getTime(), false)}`).join("\n") : ""));
  }

  if (n === "elecciones") {
    if (sub === "fijar") {
      const ms = leerFecha(o.fecha, o.hora); if (!ms) return eph("No entiendo la fecha o la hora.");
      await ctx.sb.from("whitmore_cfg").upsert({ clave: "elecciones", valor: String(ms), actualizado: new Date().toISOString() });
      return eph(`🗳️ Elecciones fijadas para el ${fechaTxt(ms)} (${ts(ms, "R")}).`);
    }
    const ms = Number(c.elecciones || 0); if (!ms) return eph("Todavía no se ha fijado la fecha. Usa `/elecciones fijar`.");
    const falta = ms - Date.now(); if (falta <= 0) return eph(`🗳️ Las elecciones fueron el ${fechaTxt(ms)}.`);
    const d = Math.floor(falta / 86400000), h = Math.floor(falta % 86400000 / 3600000);
    return eph(`🗳️ **Faltan ${d} ${d === 1 ? "día" : "días"} y ${h} ${h === 1 ? "hora" : "horas"}** para las elecciones (${fechaTxt(ms)}).`);
  }

  if (n === "resumen") return eph(await resumenTxt(ctx));

  if (n === "firma") {
    if (!tiene(x, c, "gobernador")) return eph("La firma solo la cambia el gobernador.");
    const filas = [{ clave: "firma_cargo", valor: limpio(o.cargo, 60) }, ...(o.nombre ? [{ clave: "firma_nombre", valor: limpio(o.nombre, 60) }] : [])];
    await ctx.sb.from("whitmore_cfg").upsert(filas.map((f) => ({ ...f, actualizado: new Date().toISOString() })));
    return eph(`🖋️ A partir de ahora firmo así:\n${o.nombre ? limpio(o.nombre, 60) : c.firma_nombre || x.nombre}\n${limpio(o.cargo, 60)} · Silver Peak`);
  }
  return eph("No conozco esa orden. Escribe `/whitmore` para ver lo que hago.");
}
const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function ficha(r: Any) {
  const d = r.datos;
  return `**${d.nombre}**` + (d.clase ? ` (${d.clase})` : "") + (d.dueno ? `\nDueño: ${d.dueno}` : "") + (d.ubicacion ? `\nUbicación: ${d.ubicacion}` : "") + (d.telegrama ? `\nTelegrama: ${d.telegrama}` : "") + (d.notas ? `\n${d.notas}` : "");
}
export async function saldo(ctx: Ctx) {const {data,error}=await ctx.sb.rpc('gob_secretaria_cuentas');if(error)throw Error('No he podido consultar el balance de asientos.');return Number(data.ingresos)-Number(data.gastos);}
async function agendaTxt(ctx: Ctx, desde: number, hasta: number, titulo: string) {
  const { data } = await ctx.sb.from("gob_registros").select("*").in("tipo", ["cita", "reunion", "acto"]).not("estado", "in", "(cancelada,cerrada)").gte("cuando", new Date(desde).toISOString()).lt("cuando", new Date(hasta).toISOString()).order("cuando").limit(30);
  if (!(data || []).length) return titulo + "\nNada apuntado.";
  const ico: Record<string, string> = { cita: "📅", reunion: "🤝", acto: "🗳️" };
  return titulo + "\n" + data.map((r: Any) => `${ico[r.tipo]} ${ts(new Date(r.cuando).getTime(), "f")} · **${r.tipo === "cita" ? r.datos.con : r.datos.titulo}**${r.datos.lugar ? " · " + r.datos.lugar : ""}${r.tipo === "cita" && r.datos.motivo ? " — " + r.datos.motivo : ""}`).join("\n");
}
async function resumenTxt(ctx: Ctx) {
  const hoy = await agendaTxt(ctx, inicioDia(), inicioDia() + 86400000, "📅 **Hoy**");
  const { data: t } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "tarea").eq("estado", "abierto").order("cuando", { nullsFirst: false }).limit(10);
  const { data: p } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "propuesta").eq("estado", "abierta").limit(10);
  const { data: a } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "audiencia").eq("estado", "pendiente").limit(10);
  const { data: d } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "decreto").eq("estado", "borrador").limit(10);
  const el = Number(ctx.c.elecciones || 0);
  return [`🏛️ **Resumen del ${fechaTxt(Date.now(), false)}**`, "", hoy,
    "", "📋 **Tareas pendientes:** " + ((t || []).length ? "\n" + t.map((r: Any) => `• ${r.datos.texto} — ${r.datos.paraNombre}${r.cuando ? " (plazo " + ts(new Date(r.cuando).getTime(), "D") + ")" : ""}`).join("\n") : "ninguna"),
    "🏛️ **Audiencias por contestar:** " + ((a || []).length ? a.map((r: Any) => r.datos.quien).join(", ") : "ninguna"),
    "🖋️ **Documentos por firmar:** " + ((d || []).length ? d.map((r: Any) => r.datos.titulo).join(", ") : "ninguno"),
    "💡 **Propuestas en votación:** " + ((p || []).length ? p.map((r: Any) => r.datos.titulo).join(", ") : "ninguna"),
    ...(el > Date.now() ? ["", `🗳️ Elecciones ${ts(el, "R")}.`] : [])].join("\n").slice(0, 1990);
}

/* ---------- botones ---------- */
export async function boton(ctx: Ctx, i: Any): Promise<Response> {
  const x = quien(i), c = ctx.c;
  if (!enConsejo(x, c)) return eph("Esto es solo para el Consejo de Gobierno.");
  const [k, accion, sid] = String(i.data.custom_id).split(":"), id = Number(sid);
  const r = await leer(ctx, id); if (!r) return eph("Ya no encuentro ese registro.");

  if (k === "cita" && accion === "cancel") {
    if (r.estado === "cancelada") return actualizar(tarjetaCita(r));
    const r2 = await cambiar(ctx, id, { estado: "cancelada", datos: { ...r.datos, canceladaPor: x.nombre } });
    return actualizar(tarjetaCita(r2));
  }
  if (k === "aud") {
    if (!tiene(x, c, "gobernador")) return eph("Las audiencias las acepta o rechaza el gobernador.");
    if (r.estado !== "pendiente") return actualizar(tarjetaAudiencia(r));
    if (accion === "ok") return modal("aud:ok:" + id, "Aceptar audiencia", [{ id: "fecha", label: "Día (25/10, hoy, mañana)", max: 20 }, { id: "hora", label: "Hora (18:30)", max: 5 }, { id: "lugar", label: "Lugar", req: false, max: 100 }]);
    return modal("aud:no:" + id, "Rechazar audiencia", [{ id: "razon", label: "Motivo (opcional)", req: false, largo: true, max: 400 }]);
  }
  if (k === "reu" || k === "act") {
    if (accion === "si" || accion === "no") { await votar(ctx, id, x, accion); return actualizar(await tarjetaReunion(ctx, r)); }
    if (accion === "acta") return modal("reu:acta:" + id, "Acta de la reunión", [{ id: "acuerdos", label: "Acuerdos", largo: true, max: 2500 }, { id: "notas", label: "Otras notas", largo: true, req: false, max: 1000 }]);
  }
  if (k === "tel" && accion === "resp") return modal("tel:resp:" + id, "Respuesta a " + r.datos.de, [{ id: "texto", label: "Lo que quieres decir", largo: true, max: 1500 }]);
  if (k === "dec") {
    if (r.estado !== "borrador") return actualizar(tarjetaDecreto(r));
    if(accion === "editar" && r.datos.area && !tiene(x,c,"gobernador"))return eph("Este escrito ya está en la mesa del Gobernador. Las enmiendas deben hacerse tras su devolución.");
    if (accion === "editar" && r.datos.hacienda_id)return eph("Este escrito reproduce una propuesta de Hacienda. Descártelo y prepare una propuesta nueva para conservar importes y destinatarios.");
    if (accion === "editar") return modal("dec:editar:" + id, "Editar documento", [{ id: "titulo", label: "Título", max: 100, value: r.datos.titulo }, { id: "texto", label: "Texto", largo: true, max: 3000, value: r.datos.texto }]);
    if (!tiene(x, c, "gobernador")) return eph("Solo el gobernador puede " + (accion === "firmar" ? "firmar" : "descartar") + " documentos.");
    if (accion === "descartar") { const r2 = await cambiar(ctx, id, { estado: "descartado" }); return actualizar(tarjetaDecreto(r2)); }
    if (accion === "firmar") {
      // numeración oficial propia de cada clase (decreto n.º 1, 2…; comunicado n.º 1, 2…), solo al firmar y de una vez
      const { data: r2,error:firmaError } = await ctx.sb.rpc("gob_firmar", { p_id: id, p_firma: firmaDe(ctx, x), p_por: x.nombre });
      if(firmaError)return eph(String(firmaError.message).includes("PRESUPUESTO_INSUFICIENTE")?"La asignación supera el crédito libre del presupuesto.":"Compruebe que el presupuesto de origen esté firmado y tenga crédito disponible.");
      if (!r2 || !r2.id) return actualizar(tarjetaDecreto((await leer(ctx, id)) || r));
      return actualizar(tarjetaDecreto(r2));
    }
  }
  if (k === "pro") {
    if (r.estado !== "abierta") return actualizar(await tarjetaPropuesta(ctx, r));
    if (accion === "si" || accion === "no") { await votar(ctx, id, x, accion); return actualizar(await tarjetaPropuesta(ctx, r)); }
    if (accion === "cerrar") {
      if (!tiene(x, c, "gobernador")) return eph("La votación la cierra el gobernador.");
      const v = await votos(ctx, id);
      const r2 = await cambiar(ctx, id, { estado: v.si.length > v.no.length ? "aprobada" : "rechazada", datos: { ...r.datos, cierra: x.nombre } });
      return actualizar(await tarjetaPropuesta(ctx, r2));
    }
  }
  if (k === "tar" && accion === "hecha") {
    if (r.datos.para !== x.id && !tiene(x, c, "gobernador")) return eph("La marca como hecha quien la tiene encargada (o el gobernador).");
    const r2 = await cambiar(ctx, id, { estado: "hecha", avisado: true, datos: { ...r.datos, hechaPor: x.nombre } });
    return actualizar(tarjetaTarea(r2));
  }
  return eph("Este botón ya no está activo.");
}

/* ---------- formularios (modales) ---------- */
export async function formulario(ctx: Ctx, i: Any): Promise<Response> {
  const x = quien(i), c = ctx.c;
  if (!enConsejo(x, c)) return eph("Esto es solo para el Consejo de Gobierno.");
  const v: Record<string, string> = {};
  for (const row of i.data.components || []) for (const f of row.components || []) v[f.custom_id] = String(f.value || "");
  const [k, accion, sid] = String(i.data.custom_id).split(":"), id = Number(sid);
  const base = { autor: x.nombre, autor_id: x.id };

  if (k === "dec" && accion === "nuevo") {
    const clase = TIPO_DOC[sid] ? sid : "decreto";
    const r = await nuevo(ctx, "decreto", { ...base, estado: "borrador", datos: { clase, titulo: limpio(v.titulo, 100), texto: limpio(v.texto, 3000) } }, false);
    const menc = c.rol_gobernador ? { roles: [c.rol_gobernador] } : { parse: [] };
    const m = await publicar(ctx, r, c.canal_documentos, { content: c.rol_gobernador ? `<@&${c.rol_gobernador}>, hay un documento para firmar.` : "", ...tarjetaDecreto(r) }, menc);
    return eph(`📝 Borrador guardado en #documentos; el gobernador lo firmará. ${m?.id ? enlace(ctx, c.canal_documentos, m.id) : ""}`);
  }
  if (k === "pro" && accion === "nueva") {
    const r = await nuevo(ctx, "propuesta", { ...base, estado: "abierta", datos: { titulo: limpio(v.titulo, 100), texto: limpio(v.texto, 2000) } });
    const m = await publicar(ctx, r, c.canal_propuestas, { content: c.rol_consejo ? `<@&${c.rol_consejo}>, nueva propuesta para votar.` : "", ...(await tarjetaPropuesta(ctx, r)) }, c.rol_consejo ? { roles: [c.rol_consejo] } : { parse: [] });
    return eph(`💡 Propuesta n.º ${r.numero} presentada. ${m?.id ? enlace(ctx, c.canal_propuestas, m.id) : ""}`);
  }
  const r = await leer(ctx, id); if (!r) return eph("Ya no encuentro ese registro.");
  if (k === "dec" && accion === "editar") {
    if(r.datos.area && !tiene(x,c,"gobernador"))return eph("Este escrito ya está elevado al Gobernador.");
    if (r.estado !== "borrador") return eph("Ese documento ya no es un borrador.");
    if(r.datos.hacienda_id)return eph("Las enmiendas financieras se preparan mediante una nueva propuesta en Hacienda.");
    const r2 = await cambiar(ctx, id, { datos: { ...r.datos, titulo: limpio(v.titulo, 100), texto: limpio(v.texto, 3000), editadoPor: x.nombre } });
    await repintar(ctx, r2, tarjetaDecreto(r2)); return eph("✏️ Borrador actualizado.");
  }
  if (k === "aud") {
    if (!tiene(x, c, "gobernador")) return eph("Las audiencias las acepta o rechaza el gobernador.");
    if (r.estado !== "pendiente") return eph("Esa audiencia ya estaba contestada.");
    if (accion === "no") { const r2 = await cambiar(ctx, id, { estado: "rechazada", datos: { ...r.datos, decide: x.nombre, razon: limpio(v.razon, 400) } }); await repintar(ctx, r2, tarjetaAudiencia(r2)); return eph("Audiencia rechazada."); }
    const ms = leerFecha(v.fecha, v.hora); if (!ms) return eph("No entiendo la fecha o la hora. Ejemplo: `25/10` y `18:30`. Vuelve a pulsar Aceptar.");
    const cita = await nuevo(ctx, "cita", { ...base, cuando: new Date(ms).toISOString(), datos: { con: r.datos.quien, lugar: limpio(v.lugar, 100), motivo: r.datos.motivo, audiencia: r.numero,peticion_id:r.datos.peticion_id||null } });
    await publicar(ctx, cita, c.canal_agenda, tarjetaCita(cita));
    const r2 = await cambiar(ctx, id, { estado: "aceptada", cuando: new Date(ms).toISOString(), datos: { ...r.datos, decide: x.nombre, lugar: limpio(v.lugar, 100), cita: cita.numero } });
    await repintar(ctx, r2, tarjetaAudiencia(r2));
    const tel = telegramaTxt(ctx, x, r.datos.quien, `Le confirmo que el gobernador le recibirá el ${fechaTxt(ms)}${v.lugar ? " en " + limpio(v.lugar, 100) : ""}, para tratar el asunto que nos planteó`);
    return eph(`✅ Audiencia aceptada y apuntada en la agenda (cita n.º ${cita.numero}).\nTelegrama para avisarle, listo para copiar:\n\`\`\`\n${tel}\n\`\`\``);
  }
  if (k === "reu" && accion === "acta") {
    if(["cerrada","cancelada"].includes(r.estado))return eph("La reunión ya está cerrada; consulte el acta archivada.");
    const vt = await votos(ctx, id);
    const acta = await nuevo(ctx, "acta", { ...base, datos: { reunion: id,reunion_id:id,asuntos:r.datos.asuntos||[], titulo: r.datos.titulo, fecha: new Date(r.cuando).getTime(), asistentes: vt.si.map((z: Any) => z.nombre).join(", "), acuerdos: limpio(v.acuerdos, 2500), notas: limpio(v.notas, 1000) } });
    await publicar(ctx, acta, (c.canal_actas||c.canal_documentos), tarjetaActa(acta));
    const r2 = await cambiar(ctx, id, { estado: "cerrada", datos: { ...r.datos, acta: acta.numero } }); await repintar(ctx, r2, await tarjetaReunion(ctx, r2));
    return eph(`📜 Acta n.º ${acta.numero} archivada en #documentos.`);
  }
  if (k === "tel" && accion === "resp") {
    const texto = telegramaTxt(ctx, x, r.datos.de, limpio(v.texto, 1500));
    const out = await nuevo(ctx, "telegrama", { ...base, datos: { sentido: "salida", para: r.datos.de, texto, telegrama: r.datos.telegrama, respuestaA: r.numero } });
    await publicar(ctx, out, c.canal_telegramas, tarjetaTelegrama(out));
    const r2 = await cambiar(ctx, id, { datos: { ...r.datos, respondido: x.nombre } }); await repintar(ctx, r2, tarjetaTelegrama(r2));
    return eph("📤 Respuesta lista para copiar (también queda en #telegramas):\n```\n" + texto + "\n```");
  }
  return eph("No he entendido el formulario.");
}

/* ---------- avisos automáticos (cada minuto) ---------- */
export async function revision(ctx: Ctx) {
  const c = ctx.c, hecho: string[] = [];
  await actualizarCuentas(ctx,true);
  const {data:pendientes}=await ctx.sb.from("gob_registros").select("*").not("datos->_discord","is",null).order("actualizado").limit(10);
  for(const r of pendientes||[]) {const q=r.datos._discord;if(q)await sincronizar(ctx,r,q.canal,q.payload);}

  const pet=await ctx.sb.from('gob_registros').select('*').eq('tipo','peticion').in('estado',['recibida','en_valoracion','aclaraciones']).eq('avisado',false).lte('cuando',new Date().toISOString()).limit(8);
  for(const r of pet.data||[]){await ctx.api('POST',`/channels/${c.canal_tareas}/messages`,{allowed_mentions:{parse:[]},content:`Revisión interna de la petición n.º ${r.numero}: **${r.datos.titulo}**. Compruebe si hay respuesta de la Presidencia. Esta revisión no es un plazo de ejecución comunicado al ciudadano.`,components:[{type:1,components:[{type:2,style:5,label:'Consultar petición',url:'https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#oficina/peticiones/'+r.id}]}]});await ctx.sb.from('gob_registros').update({avisado:true}).eq('id',r.id);}
  const ahora = Date.now();
  // 1) una hora antes: citas, reuniones y actos
  const { data: prox } = await ctx.sb.from("gob_registros").select("*").in("tipo", ["cita", "reunion", "acto"]).eq("avisado", false).not("estado", "in", "(cancelada,cerrada)")
    .gte("cuando", new Date(ahora - 5 * 60000).toISOString()).lte("cuando", new Date(ahora + 61 * 60000).toISOString()).limit(10);
  for (const r of prox || []) {
    const ms = new Date(r.cuando).getTime();
    const roles = r.tipo === "cita" ? [c.rol_gobernador, c.rol_gobernacion].filter(Boolean) : [c.rol_consejo].filter(Boolean);
    const que = r.tipo === "cita" ? `cita con **${r.datos.con}**` : r.tipo === "reunion" ? `reunión **${r.datos.titulo}**` : `acto de campaña **${r.datos.titulo}**`;
    const canal = r.tipo === "acto" ? c.canal_campana : c.canal_agenda;
    await ctx.api("POST", `/channels/${canal}/messages`, { allowed_mentions: { roles }, content: `${roles.map((x) => `<@&${x}>`).join(" ")} ⏰ ${ts(ms, "R")}: ${que}${r.datos.lugar ? " en " + r.datos.lugar : ""}.`, ...(r.mensaje_id ? { message_reference: { message_id: r.mensaje_id, fail_if_not_exists: false } } : {}) });
    await ctx.sb.from("gob_registros").update({ avisado: true }).eq("id", r.id); hecho.push("aviso " + r.tipo);
  }
  // 2) tareas que vencen hoy
  const { data: tar } = await ctx.sb.from("gob_registros").select("*").eq("tipo", "tarea").eq("estado", "abierto").eq("avisado", false).lte("cuando", new Date(ahora).toISOString()).limit(10);
  for (const r of tar || []) {
    await ctx.api("POST", `/channels/${c.canal_tareas}/messages`, { allowed_mentions: { users: [r.datos.para] }, content: `<@${r.datos.para}> 📋 Hoy vence la tarea n.º ${r.numero}: ${r.datos.texto}`, ...(r.mensaje_id ? { message_reference: { message_id: r.mensaje_id, fail_if_not_exists: false } } : {}) });
    await ctx.sb.from("gob_registros").update({ avisado: true }).eq("id", r.id); hecho.push("tarea");
  }
  // 3) resumen del día a las 9:00 y 4) cuentas los domingos a las 21:00
  const p = partes(ahora), hoy = diaMadrid(ahora);
  const marca = async (clave: string) => { const { data } = await ctx.sb.from("whitmore_cfg").select("valor").eq("clave", clave).maybeSingle(); if (data?.valor === hoy) return false; return true; };
  if (p.h >= 9 && p.h < 12 && await marca("ultimo_resumen")) {
    const roles = [c.rol_gobernador, c.rol_gobernacion].filter(Boolean);
    await ctx.api("POST", `/channels/${c.canal_agenda}/messages`, { allowed_mentions: { roles }, content: roles.map((x) => `<@&${x}>`).join(" ") + "\n" + await resumenTxt(ctx) }); await ctx.sb.from("whitmore_cfg").upsert({clave:"ultimo_resumen",valor:hoy,actualizado:new Date().toISOString()}); hecho.push("resumen");
  }
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  if (dow === 0 && p.h >= 21 && await marca("ultimo_informe")) {
    const desde = new Date(ahora - 7 * 86400000).toISOString();
    const total=await ctx.sb.rpc('gob_hacienda_balance',{p_desde:desde});if(total.error)throw Error('No he podido preparar el informe semanal.');
    const ing=Number(total.data.ingresos),gas=Number(total.data.gastos);
    await ctx.api("POST", `/channels/${c.canal_economia}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📊 Informe semanal de cuentas", color: ORO, description: `**Ingresos:** ${dolar(ing)}\n**Gastos:** ${dolar(gas)}\n**Resultado:** ${dolar(ing - gas)}\n**Balance de asientos históricos:** ${dolar(await saldo(ctx))}\n\n${total.data.cantidad} movimientos esta semana.`, footer: PIE }] }); await ctx.sb.from("whitmore_cfg").upsert({clave:"ultimo_informe",valor:hoy,actualizado:new Date().toISOString()}); hecho.push("informe");
  }
  return hecho;
}
