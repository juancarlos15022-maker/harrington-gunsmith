// HARRINGTON GUNSMITH · V3 · Señor Harrington: órdenes y botones de la segunda tanda
// discord-interacciones comprueba la firma de Discord y reenvía aquí (discord-bot, modo «extra») lo que es de esta tanda.
//   /encargos /cliente /mis-horas /telegrama /cumpleanos (personal) · /caja /reunion /votacion (Dirección)
//   /duelo /tiradores (todos) · examen del libro del aprendiz · buzón anónimo · libro de visitas
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalogo, diaNum, dolar, duracion, fecha, gotica, hora, hoyNum, limpio, madrid, medianoche, ORO, PIE } from "./comun.ts";
import { atenderMas } from "./mas.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const efimero = (content: string, extra: Record<string, unknown> = {}) => json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra } });
const FIRMA = "\n\nDios guarde a usted muchos años.\n— *Señor Harrington*";
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const H = (c: Record<string, string>) => ({ Authorization: "Bot " + c.token, "Content-Type": "application/json" });
async function api(c: Record<string, string>, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: H(c), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const t = await r.text();
  try { return { st: r.status, d: t ? JSON.parse(t) : null }; } catch { return { st: r.status, d: t }; }
}
function enSegundoPlano(p: Promise<unknown>) {
  const er = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p.catch(() => {})); else p.catch(() => {});
}
async function carta(c: Record<string, string>, uid: string, texto: string) {
  try { const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid }); if (dm.d?.id) { const r = await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: texto }); return r.st < 300; } } catch { /* */ }
  return false;
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Emp = Record<string, string> & { sueldo?: string; horas?: string };
async function empleados() { const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle(); return (Array.isArray(data?.valor) ? data!.valor : []) as Emp[]; }
async function registros<T>(prefijo: string) {
  const { data } = await sb.from("datos").select("valor").like("clave", prefijo + "%");
  return ((data ?? []) as Array<{ valor: T & { deleted?: boolean } }>).map((r) => r.valor).filter((v) => v && !v.deleted) as T[];
}
// ventas de unos días concretos (el número de venta lleva la fecha: HG-ddmmaa-nnn)
async function ventasDe(dias: number[]) {
  const pat = dias.map((d) => { const x = new Date(d * 86400000); return `clave.like.venta:HG-${String(x.getUTCDate()).padStart(2, "0")}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCFullYear()).slice(2)}-*`; });
  const { data } = await sb.from("datos").select("valor").or(pat.join(","));
  return ((data ?? []) as Array<{ valor: Record<string, unknown> }>).map((r) => r.valor).filter((v) => v && !v.deleted && !v.voided) as Array<Record<string, unknown> & { op?: string; dueCents?: number; totalCents?: number; employee?: string }>;
}
const cobrado = (r: { op?: string; dueCents?: number; totalCents?: number }) => r.op === "encargo" ? Number(r.totalCents || 0) - Number(r.dueCents || 0) : Number(r.dueCents || 0);
const diaSem = (n: number) => new Date(n * 86400000).getUTCDay();

// ── preguntas del examen de la casa (normas, oficio y, al azar, precios del mostrador) ──
const PREGUNTAS: Array<[string, string[], number]> = [
  ["¿Puede usted hacer un descuento o regalar un producto sin autorización?", ["Sí, si el cliente es conocido", "No: está prohibido sin autorización de la Dirección", "Sí, hasta un 10 %"], 1],
  ["Se ha equivocado usted al cobrar en caja. ¿Qué debe hacer?", ["Callarlo y cuadrarlo otro día", "Comunicarlo: ocultarlo es falta grave", "Poner la diferencia de su bolsillo sin decir nada"], 1],
  ["Va a estar varios días sin poder venir. ¿Qué hace?", ["Nada, ya volverá", "Avisar la ausencia en la web o con el botón «Avisar una ausencia»", "Decírselo a un cliente"], 1],
  ["¿Se pueden trasladar los problemas fuera del papel (OOC) al rol?", ["Nunca", "Solo si son graves", "Sí, si el otro empezó"], 0],
  ["¿Puede usted contar a alguien de fuera las cuentas, proveedores o inventario de la casa?", ["Sí, a otros armeros", "No: es información confidencial", "Solo los precios de los proveedores"], 1],
  ["¿Puede un miembro de una banda criminal trabajar en la armería?", ["Sí, si es buen tirador", "No: las bandas no pueden trabajar en una armería", "Solo como aprendiz"], 1],
  ["¿Puede llevarse material de la casa para fabricar algo para usted?", ["No, salvo con autorización", "Sí, si luego lo repone", "Sí, los tornillos no cuentan"], 0],
  ["¿Qué ha de hacer al empezar a trabajar?", ["Fichar la entrada (en la web o con «Entro de turno»)", "Nada, basta con estar", "Avisar en la charla"], 0],
  ["Un cliente no recoge su encargo fabricado. ¿Cuánto plazo tiene para hacerlo?", ["Un día", "10 días; después pierde el producto y la fianza", "No hay plazo"], 1],
  ["Al vender un arma de fuego, ¿qué hay que apuntar en la ficha del cliente?", ["Su número de serie", "Su color favorito", "Nada"], 0],
  ["¿Quién puede admitir a un aspirante en la casa?", ["Cualquier armero", "La Dirección: el Jefe o el Gerente", "El propio aspirante"], 1],
  ["¿Cuánto dura el periodo de prueba de un empleado nuevo?", ["Un mes", "Una semana", "Un día"], 1],
  ["¿Qué día se pagan los sueldos de la semana?", ["El domingo", "El lunes", "Cuando cada uno lo pida"], 0],
  ["¿Cómo se trata a los clientes en la casa?", ["Con trato correcto y profesional", "Como a cada uno le parezca", "Solo se atiende a los conocidos"], 0],
];
async function examenNuevo() {
  const P = [...PREGUNTAS].sort(() => Math.random() - 0.5).slice(0, 7).map(([q, o, k]) => ({ q, o, k }));
  const L = (await catalogo(sb)).filter((p) => p.precio > 0);
  for (let n = 0; n < 3 && L.length >= 3; n++) {
    const p = L.splice(Math.floor(Math.random() * L.length), 1)[0];
    const otros = [...new Set(L.map((x) => x.precio).filter((x) => x !== p.precio))].sort(() => Math.random() - 0.5).slice(0, 2);
    const ops = [p.precio, ...otros].sort(() => Math.random() - 0.5);
    P.push({ q: `¿Cuál es el precio de mostrador de **${p.nombre}**?`, o: ops.map((x) => dolar(x)), k: ops.indexOf(p.precio) });
  }
  return P.sort(() => Math.random() - 0.5);
}
function pregunta(P: Array<{ q: string; o: string[]; k: number }>, n: number, aviso = "") {
  const p = P[n];
  return { content: `${aviso}${aviso ? "\n\n" : ""}📚 **Pregunta ${n + 1} de ${P.length}**\n${p.q}`, components: [{ type: 1, components: p.o.map((t, k) => ({ type: 2, style: 2, label: t.replace(/\*\*/g, "").slice(0, 80), custom_id: `exa:r:${n}:${k}` })) }] };
}

// ── votación: barras con el recuento ──
function votacion(v: { id: string; pregunta: string; opciones: string[]; votos: Record<string, number>; cerrada: boolean; creador?: string }) {
  const cuenta = v.opciones.map((_, k) => Object.values(v.votos || {}).filter((x) => x === k).length), tot = cuenta.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...cuenta);
  const lineas = v.opciones.map((o, k) => { const p = tot ? cuenta[k] / tot : 0, b = Math.round(p * 10); return `**${o}**\n${"▰".repeat(b)}${"▱".repeat(10 - b)} ${cuenta[k]} ${cuenta[k] === 1 ? "voto" : "votos"} (${Math.round(p * 100)} %)${v.cerrada && cuenta[k] === max && max > 0 ? " 🏆" : ""}`; });
  return {
    embeds: [{ title: "🗳️ " + v.pregunta, color: ORO, description: lineas.join("\n\n") + `\n\n${v.cerrada ? "**Votación cerrada.**" : `Total: ${tot} ${tot === 1 ? "voto" : "votos"} · puede cambiar su voto pulsando otra opción.`}`, footer: { text: `Propuesta por ${v.creador || "la Dirección"} · Señor Harrington` } }],
    components: v.cerrada ? [] : [
      { type: 1, components: v.opciones.map((o, k) => ({ type: 2, style: 1, label: o.slice(0, 80), custom_id: `vot:v:${v.id}:${k}` })) },
      { type: 1, components: [{ type: 2, style: 4, label: "Cerrar votación (Dirección)", custom_id: `vot:fin:${v.id}` }] },
    ],
  };
}
// ── reunión: anuncio con quién asistirá ──
function reunion(r: { id: string; tema: string; lugar?: string; cuando: string; creador?: string; asistentes: string[]; ausentes: string[] }) {
  const t = Date.parse(r.cuando);
  return {
    embeds: [{ title: "⏳ " + gotica("Junta de la Casa"), color: ORO, description: `**${r.tema}**`, fields: [
      { name: "Cuándo", value: `${fecha(t)} a las ${hora(t)}`, inline: true }, ...(r.lugar ? [{ name: "Dónde", value: r.lugar, inline: true }] : []),
      { name: `Asistirán (${r.asistentes.length})`, value: r.asistentes.length ? r.asistentes.map((x) => `<@${x}>`).join(", ").slice(0, 1024) : "Nadie todavía" },
      { name: `No podrán (${r.ausentes.length})`, value: r.ausentes.length ? r.ausentes.map((x) => `<@${x}>`).join(", ").slice(0, 1024) : "—" }],
      footer: { text: `Convocada por ${r.creador || "la Dirección"} · aviso una hora antes · Señor Harrington` } }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Asistiré", emoji: { name: "✅" }, custom_id: `reu:si:${r.id}` }, { type: 2, style: 2, label: "No podré", custom_id: `reu:no:${r.id}` }] }],
  };
}

export async function atender(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor");
  const c: Record<string, string> = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  if (!c.secreto || req.headers.get("x-hg-secreto") !== c.secreto) return json({ error: "NO" }, 403);
  let i: Record<string, any> = {};
  try { i = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  if (i.calentar) return json({ ok: true });
  const user = i.member?.user || i.user || {}, roles: string[] = i.member?.roles || [];
  const yoNombre = limpio(i.member?.nick || user.global_name || user.username, 60);
  const id = String(i.data?.custom_id || ""), orden = String(i.data?.name || "");
  const opt = (n: string) => ((i.data?.options || []) as Array<{ name: string; value: unknown }>).find((o) => o.name === n)?.value;
  const esDir = [c.rol_jefe, c.rol_gerente].filter(Boolean).some((r) => roles.includes(r));
  const esPersonal = esDir || ["rol_aprendiz", "rol_armero", "rol_colaborador"].some((k) => c[k] && roles.includes(c[k]));
  const v: Record<string, string> = {};
  for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
  const ch = (k: string) => c[k] ? `<#${c[k]}>` : "su canal";

  // ── autocompletado de /cliente ──
  if (i.type === 4 && orden === "cliente") {
    const q = norm(String(opt("nombre") || ""));
    const { data } = await sb.from("datos").select("valor").eq("clave", "clientes").maybeSingle();
    const L = (Array.isArray(data?.valor) ? data!.valor : []) as Array<{ name: string }>;
    return json({ type: 8, data: { choices: L.filter((x) => x?.name && (!q || norm(x.name).includes(q))).slice(0, 25).map((x) => ({ name: x.name.slice(0, 100), value: x.name.slice(0, 100) })) } });
  }

  // ── /encargos: lo que queda por fabricar o entregar ──
  if (i.type === 2 && orden === "encargos") {
    if (!esPersonal) return efimero("Los encargos de la casa solo puede consultarlos el personal.");
    const L = (await registros<Record<string, any>>("encargo:")).filter((e) => !e.finished && !e.cancelled).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (!L.length) return efimero("📦 No hay encargos pendientes. ¡Todo entregado!");
    const lin = L.slice(0, 15).map((e) => `• **${limpio(e.client, 40)}** — ${(e.items || []).map((x: any) => x.qty + " × " + x.name).join(", ").slice(0, 120)}\n  ${e.fab === "FABRICADO" ? (e.avisado ? "✅ fabricado · cliente avisado" : "✅ fabricado · **falta avisar al cliente**") : "🛠 por fabricar"}${e.depositCents ? ` · fianza ${dolar(e.depositCents)}` : ""}${e.telegram ? ` · telegrama ${limpio(e.telegram, 12)}` : ""}`);
    return efimero("", { embeds: [{ title: `📦 Encargos pendientes (${L.length})`, color: ORO, description: lin.join("\n") + (L.length > 15 ? `\n… y ${L.length - 15} más (véalos en la web).` : ""), footer: PIE }] });
  }
  // ── /cliente: ficha resumida ──
  if (i.type === 2 && orden === "cliente") {
    if (!esPersonal) return efimero("Las fichas de clientes solo puede consultarlas el personal.");
    const q = String(opt("nombre") || "");
    const { data } = await sb.from("datos").select("valor").eq("clave", "clientes").maybeSingle();
    const L = (Array.isArray(data?.valor) ? data!.valor : []) as Array<Record<string, any>>;
    const x = L.find((k) => k.name === q) || L.find((k) => norm(k.name).includes(norm(q)));
    if (!x) return efimero(`No hay ningún cliente que se llame «${limpio(q, 40)}». Empiece a escribir y elíjalo de la lista.`);
    const S = (Array.isArray(x.series) ? x.series : []) as Array<{ s: string; a?: string; ic?: boolean }>;
    const esp = x.precios && typeof x.precios === "object" ? Object.keys(x.precios).length : 0;
    const extra = Array.isArray(x.extra) ? (x.extra as Array<{ k?: string; v?: string; n?: string }>).map((e) => `${limpio(e.k || e.n, 30)}: ${limpio(e.v, 60)}`).filter((t) => t.length > 2) : [];
    return efimero("", { embeds: [{ title: "📇 " + limpio(x.name, 80), color: ORO, fields: [
      { name: "Tipo", value: limpio(x.type, 30) || "—", inline: true }, { name: "Telegrama", value: limpio(x.telegram, 20) || "—", inline: true }, { name: "Identificación", value: limpio(x.ident, 30) || "—", inline: true },
      { name: `Armas (${S.length})`, value: S.length ? S.slice(0, 15).map((s) => `${s.ic === false ? "⚠️ SIN REGISTRAR" : s.ic ? "✅" : "▫️"} ${limpio(s.a, 40) || "Arma"} · n.º ${limpio(s.s, 30)}`).join("\n") : "Ninguna" },
      { name: "Precios especiales", value: esp ? `${esp} ${esp === 1 ? "artículo" : "artículos"} (véalos en la web)` : "No", inline: true },
      ...(extra.length ? [{ name: "Otros datos", value: extra.join("\n").slice(0, 1024) }] : []),
    ], footer: PIE }] });
  }
  // ── /caja (Dirección): lo cobrado y lo gastado hoy y esta semana ──
  if (i.type === 2 && orden === "caja") {
    if (!esDir) return efimero("La caja solo puede consultarla la Dirección.");
    const hoy = hoyNum(), ws = hoy - ((diaSem(hoy) + 2) % 7);
    const dias = Array.from({ length: hoy - ws + 1 }, (_, k) => ws + k);
    const V = await ventasDe(dias);
    const vh = V.filter((r) => (r as { date?: string }).date === fecha(Date.now()));
    const vHoy = vh.reduce((a, r) => a + cobrado(r), 0), vSem = V.reduce((a, r) => a + cobrado(r), 0);
    const G = (await registros<{ cents?: number; day?: number }>("gasto:")).filter((g) => (g.day || 0) >= ws && (g.day || 0) <= hoy);
    const gHoy = G.filter((g) => g.day === hoy).reduce((a, g) => a + Number(g.cents || 0), 0), gSem = G.reduce((a, g) => a + Number(g.cents || 0), 0);
    const f = (d: number) => new Date(d * 86400000).toISOString().slice(5, 10).split("-").reverse().join("/");
    return efimero("", { embeds: [{ title: "💰 Caja de la casa", color: ORO, fields: [
      { name: "Hoy · cobrado", value: `${dolar(vHoy)} (${vh.length} ${vh.length === 1 ? "operación" : "operaciones"})`, inline: true }, { name: "Hoy · gastado", value: dolar(gHoy), inline: true }, { name: "Hoy · balance", value: dolar(vHoy - gHoy), inline: true },
      { name: `Semana (${f(ws)} – ${f(ws + 6)}) · cobrado`, value: `${dolar(vSem)} (${V.length})`, inline: true }, { name: "Semana · gastado", value: dolar(gSem), inline: true }, { name: "Semana · balance", value: dolar(vSem - gSem), inline: true },
    ], footer: { text: "La semana de ventas va de viernes a jueves, como en la web · Señor Harrington" } }] });
  }
  // ── /mis-horas: horas de la semana y sueldo si la semana acabara ahora ──
  if (i.type === 2 && orden === "mis-horas") {
    const E = await empleados(), e = E.find((x) => x.discord === user.id);
    if (!e) return efimero("No tiene ficha enlazada en la web. Si es empleado, pida a la Dirección que la enlace con su Discord.");
    const hoy = hoyNum(), ws = hoy - ((diaSem(hoy) + 6) % 7), a = medianoche(ws), b = medianoche(ws + 7), ahora = Date.now();
    const { data: T } = await sb.from("datos").select("valor").like("clave", "turno:%").eq("valor->>name", e.name);
    let ms = ((T ?? []) as Array<{ valor: { start: number; end: number } }>).map((r) => r.valor).filter((t) => t && t.start >= a && t.start < b).reduce((s, t) => s + Math.max(0, t.end - t.start), 0);
    const { data: f } = await sb.from("datos").select("valor").eq("clave", "fichaje:" + e.id).maybeSingle();
    const ab = f?.valor && !(f.valor as any).deleted ? f.valor as { start: number } : null;
    if (ab && ab.start >= a && ab.start < b) ms += Math.max(0, Math.min(ahora, b) - ab.start);
    const aus = (await registros<{ name: string; start: number; end: number; returned?: boolean; returnedAt?: number; cancelled?: boolean }>("ausencia:")).filter((x) => x.name === e.name && !x.cancelled);
    const dAus = Math.min(7, Math.round(aus.reduce((s, x) => { const fin = x.returned ? (x.returnedAt || x.start) : (x.end || Infinity); const o = Math.min(fin, b) - Math.max(x.start, a); return s + (o > 0 ? o : 0); }, 0) / 86400000));
    const c0 = Number(e.horas || 10), req = dAus > 4 ? 0 : dAus >= 3 ? c0 / 2 : c0, need = req * 3600000, base = Number(e.sueldo || 0);
    const miss = Math.max(0, need - ms), extra = need ? Math.max(0, ms - need) : 0;
    const desc = Math.min(base, Math.round(base * miss / (c0 * 3600000))), ext = Math.round(base * extra / (c0 * 3600000));
    const f2 = (d: number) => new Date(d * 86400000).toISOString().slice(5, 10).split("-").reverse().join("/");
    return efimero("", { embeds: [{ title: "🕰 Sus horas de esta semana", color: ORO, description: `Semana de sueldo del lunes ${f2(ws)} al domingo ${f2(ws + 6)}.${ab ? `\nAhora mismo está usted **dentro** desde las ${hora(ab.start)}.` : ""}`, fields: [
      { name: "Trabajadas", value: duracion(0, ms), inline: true }, { name: "Le tocan", value: `${req} h${dAus ? ` (ausente ${dAus} ${dAus === 1 ? "día" : "días"})` : ""}`, inline: true },
      { name: miss ? "Le faltan" : "Horas de más", value: miss ? duracion(0, miss) : duracion(0, extra), inline: true },
      { name: "Sueldo si la semana acabara ahora", value: `**${dolar(base - desc + ext)}**${desc ? ` (${dolar(base)} − ${dolar(desc)} por las horas que faltan)` : ext ? ` (${dolar(base)} + ${dolar(ext)} por horas de más)` : ""}` },
    ], footer: { text: "Cálculo orientativo: el pago lo hace la Dirección el domingo en la web · Señor Harrington" } }] });
  }
  // ── /telegrama: carta en forma de telegrama a otra persona ──
  if (i.type === 2 && orden === "telegrama") {
    if (!esPersonal) return efimero("El telégrafo de la casa es solo para el personal.");
    const para = String(opt("para") || ""), u = i.data?.resolved?.users?.[para], m = i.data?.resolved?.members?.[para];
    if (!para || u?.bot) return efimero("Elija a una persona (no a un bot).");
    const texto = limpio(opt("texto"), 300).toUpperCase().replace(/\s*[.!?]+\s*/g, " STOP ").replace(/\s+/g, " ").trim();
    const cuerpo = texto.endsWith("STOP") ? texto : texto + " STOP";
    const dest = limpio(m?.nick || u?.global_name || u?.username, 60);
    const ok = await carta(c, para, `📨 **TELEGRAMA** · Oficina de telégrafos de Saint Denis\n**De:** ${yoNombre}\n**Para:** ${dest}\n\`\`\`\n${cuerpo}\n\`\`\`\n*Servicio de telegramas de la Casa Harrington*`);
    return efimero(ok ? `📨 Telegrama entregado a **${dest}**:\n> ${cuerpo}` : `No he podido entregar el telegrama: **${dest}** no admite mensajes privados.`);
  }
  // ── /cumpleanos: cumpleaños del personaje ──
  if (i.type === 2 && orden === "cumpleanos") {
    if (!esPersonal) return efimero("Esta orden es para el personal de la casa.");
    const d = Number(opt("dia")), m = Number(opt("mes"));
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12) || d > new Date(Date.UTC(2024, m, 0)).getUTCDate()) return efimero("Esa fecha no existe. Escriba el día (1-31) y el mes (1-12).");
    const E = await empleados(), e = E.find((x) => x.discord === user.id);
    await sb.from("bot_cumples").upsert({ user_id: user.id, nombre: e?.name || yoNombre, dia: d, mes: m });
    return efimero(`🎂 Apuntado: el cumpleaños de **${e?.name || yoNombre}** es el **${d}/${m}**. Ese día la casa le felicitará.`);
  }

  // ── /reunion (Dirección) ──
  if (i.type === 2 && orden === "reunion") {
    if (!esDir) return efimero("Solo la Dirección puede convocar reuniones.");
    return json({ type: 9, data: { custom_id: "reu:form", title: "Convocar una reunión", components: [
      { type: 1, components: [{ type: 4, custom_id: "tema", label: "Tema", style: 1, required: true, max_length: 100, placeholder: "Ej.: Precios de invierno y turnos" }] },
      { type: 1, components: [{ type: 4, custom_id: "cuando", label: "Día y hora (DD/MM HH:MM)", style: 1, required: true, max_length: 20, placeholder: "Ej.: 18/10 21:30" }] },
      { type: 1, components: [{ type: 4, custom_id: "lugar", label: "Dónde (opcional)", style: 1, required: false, max_length: 80, placeholder: "Ej.: Trastienda" }] },
    ] } });
  }
  if (i.type === 5 && id === "reu:form") {
    if (!esDir) return efimero("Solo la Dirección puede convocar reuniones.");
    const mm = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\s+(\d{1,2})[:.h](\d{2})$/.exec(String(v.cuando || "").trim());
    if (!mm) return efimero("No he entendido la fecha. Escríbala así: **18/10 21:30**.");
    const y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : +madrid(Date.now()).year;
    const t = medianoche(diaNum(y, +mm[2], +mm[1])) + (+mm[4]) * 3600000 + (+mm[5]) * 60000;
    if (!(t > Date.now())) return efimero("Esa fecha ya ha pasado. Elija una fecha futura.");
    const r = { id: "r" + Date.now().toString(36), tema: limpio(v.tema, 100), lugar: limpio(v.lugar, 80), cuando: new Date(t).toISOString(), creador: yoNombre, asistentes: [] as string[], ausentes: [] as string[] };
    const m = await api(c, "POST", `/channels/${c.canal_bandos}/messages`, { allowed_mentions: { parse: [] }, ...reunion(r) });
    if (m.st >= 300) return efimero("No he podido publicar la reunión. Inténtelo de nuevo.");
    await sb.from("bot_reuniones").insert({ ...r, mensaje_id: m.d?.id });
    return efimero(`✅ Reunión convocada en ${ch("canal_bandos")}. Una hora antes avisaré a todo el personal.`);
  }
  if (i.type === 3 && (id.startsWith("reu:si:") || id.startsWith("reu:no:"))) {
    const rid = id.split(":")[2];
    const { data: r } = await sb.from("bot_reuniones").select("*").eq("id", rid).maybeSingle();
    if (!r) return efimero("Esta reunión ya no existe.");
    if (Date.parse(r.cuando) < Date.now()) return efimero("Esta reunión ya pasó.");
    const si = id.startsWith("reu:si:");
    const A = (r.asistentes as string[]).filter((x) => x !== user.id), N = (r.ausentes as string[]).filter((x) => x !== user.id);
    (si ? A : N).push(user.id);
    await sb.from("bot_reuniones").update({ asistentes: A, ausentes: N }).eq("id", rid);
    return json({ type: 7, data: reunion({ ...r, asistentes: A, ausentes: N }) });
  }

  // ── /votacion (Dirección) ──
  if (i.type === 2 && orden === "votacion") {
    if (!esDir) return efimero("Solo la Dirección puede abrir votaciones.");
    return json({ type: 9, data: { custom_id: "vot:form", title: "Abrir una votación", components: [
      { type: 1, components: [{ type: 4, custom_id: "pregunta", label: "Pregunta", style: 1, required: true, max_length: 150, placeholder: "Ej.: ¿Qué evento hacemos el sábado?" }] },
      { type: 1, components: [{ type: 4, custom_id: "opciones", label: "Opciones (una por línea, de 2 a 5)", style: 2, required: true, max_length: 400, placeholder: "Tirada al blanco\nFeria de armas\nCena en el salón" }] },
    ] } });
  }
  if (i.type === 5 && id === "vot:form") {
    if (!esDir) return efimero("Solo la Dirección puede abrir votaciones.");
    const ops = String(v.opciones || "").split(/\n+/).map((x) => limpio(x, 80)).filter(Boolean).slice(0, 5);
    if (ops.length < 2) return efimero("Hacen falta al menos dos opciones, una por línea.");
    const vt = { id: "o" + Date.now().toString(36), pregunta: limpio(v.pregunta, 150), opciones: ops, votos: {} as Record<string, number>, cerrada: false, creador: yoNombre };
    await sb.from("bot_votaciones").insert({ ...vt, canal: i.channel_id });
    return json({ type: 4, data: { allowed_mentions: { parse: [] }, ...votacion(vt) } });
  }
  if (i.type === 3 && id.startsWith("vot:")) {
    const [, acc, vid, k] = id.split(":");
    const { data: vt } = await sb.from("bot_votaciones").select("*").eq("id", vid).maybeSingle();
    if (!vt) return efimero("Esta votación ya no existe.");
    if (acc === "fin") {
      if (!esDir) return efimero("Solo la Dirección puede cerrar la votación.");
      await sb.from("bot_votaciones").update({ cerrada: true }).eq("id", vid);
      return json({ type: 7, data: votacion({ ...vt, cerrada: true }) });
    }
    if (vt.cerrada) return efimero("La votación ya está cerrada.");
    const votos = { ...(vt.votos || {}), [user.id]: +k };
    await sb.from("bot_votaciones").update({ votos }).eq("id", vid);
    return json({ type: 7, data: votacion({ ...vt, votos }) });
  }

  // ── /duelo: duelo al amanecer (reflejos) ──
  if (i.type === 2 && orden === "duelo") {
    const rival = String(opt("rival") || ""), u = i.data?.resolved?.users?.[rival], m = i.data?.resolved?.members?.[rival];
    if (!rival || u?.bot) return efimero("Hay que retar a una persona, no a un bot.");
    if (rival === user.id) return efimero("Batirse en duelo con uno mismo no es cosa de caballeros.");
    const d = { id: "d" + Date.now().toString(36), canal: i.channel_id, retador: user.id, retador_n: yoNombre, rival, rival_n: limpio(m?.nick || u?.global_name || u?.username, 60) };
    await sb.from("bot_duelos").insert(d);
    return json({ type: 4, data: { allowed_mentions: { users: [rival] }, content: `<@${rival}>`, embeds: [{ title: "🔫 " + gotica("Duelo al Amanecer"), color: 0x8b2e25, description: `**${d.retador_n}** reta a **${d.rival_n}** a un duelo.\n\nCuando el Señor Harrington grite **¡FUEGO!**, gana quien dispare primero. Quien dispare antes de tiempo, pierde.\n\n${d.rival_n}, ¿acepta el desafío?`, footer: PIE }],
      components: [{ type: 1, components: [{ type: 2, style: 4, label: "Acepto el duelo", emoji: { name: "🔫" }, custom_id: `duel:si:${d.id}` }, { type: 2, style: 2, label: "Rehúso", custom_id: `duel:no:${d.id}` }] }] } });
  }
  if (i.type === 3 && id.startsWith("duel:")) {
    const [, acc, did] = id.split(":");
    const { data: d } = await sb.from("bot_duelos").select("*").eq("id", did).maybeSingle();
    if (!d) return efimero("Este duelo ya no existe.");
    if (acc === "si" || acc === "no") {
      if (user.id !== d.rival) return efimero("Solo el retado puede responder.");
      if (d.estado !== "reto") return efimero("Ese duelo ya está en marcha o terminado.");
      if (acc === "no") { await sb.from("bot_duelos").update({ estado: "rehusado" }).eq("id", did); return json({ type: 7, data: { content: "", embeds: [{ title: "🏳️ Duelo rehusado", color: 0x6b4c1d, description: `**${d.rival_n}** ha declinado el desafío de **${d.retador_n}**. Quizá otro día.`, footer: PIE }], components: [] } }); }
      await sb.from("bot_duelos").update({ estado: "armado" }).eq("id", did);
      const boton = [{ type: 1, components: [{ type: 2, style: 4, label: "Disparar", emoji: { name: "🔫" }, custom_id: `duel:tiro:${did}` }] }];
      enSegundoPlano((async () => {
        await dormir(2500 + Math.floor(Math.random() * 3500));
        const t = Date.now();
        const { data: ok } = await sb.from("bot_duelos").update({ estado: "fuego", fuego: t }).eq("id", did).eq("estado", "armado").select("id");
        if (ok?.length) await fetch(`https://discord.com/api/v10/webhooks/${c.app_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "", embeds: [{ title: "💥 ¡FUEGO!", color: 0xd7ae54, description: `**${d.retador_n}** contra **${d.rival_n}**: ¡disparen!`, footer: PIE }], components: boton }) });
      })());
      return json({ type: 7, data: { content: "", embeds: [{ title: "🌅 Espalda con espalda…", color: 0x6b4c1d, description: `**${d.retador_n}** y **${d.rival_n}** caminan diez pasos.\n\nUno… dos… tres…\n\n*No dispare hasta oír **¡FUEGO!***`, footer: PIE }], components: boton } });
    }
    if (acc === "tiro") {
      const { data: r } = await sb.rpc("hg_duelo_disparo", { p_id: did, p_user: user.id, p_ahora: Date.now() });
      const x = r as Record<string, any>;
      if (x?.error === "AJENO") return efimero("Este duelo no es suyo, caballero.");
      if (x?.error) return efimero("El duelo ya ha terminado.");
      const gan = x.ganador as string, per = gan === d.retador ? d.rival : d.retador;
      const gn = gan === d.retador ? d.retador_n : d.rival_n, pn = gan === d.retador ? d.rival_n : d.retador_n;
      for (const [uid, nombre, win] of [[gan, gn, true], [per, pn, false]] as Array<[string, string, boolean]>) {
        const { data: t } = await sb.from("bot_tiradores").select("*").eq("user_id", uid).maybeSingle();
        const mejor = win && !x.pronto ? Math.min(Number(t?.mejor_ms ?? 1e9), Number(x.ms)) : t?.mejor_ms ?? null;
        await sb.from("bot_tiradores").upsert({ user_id: uid, nombre, victorias: (t?.victorias || 0) + (win ? 1 : 0), derrotas: (t?.derrotas || 0) + (win ? 0 : 1), mejor_ms: mejor === 1e9 ? null : mejor });
      }
      return json({ type: 7, data: { content: "", embeds: [{ title: "🏆 " + gn + " gana el duelo", color: 0x3d8b52, description: x.pronto ? `**${pn}** disparó antes de tiempo y la bala se perdió entre la niebla. La victoria es para **${gn}**.` : `**${gn}** desenfundó en **${x.ms} milésimas** y ganó a **${pn}**.`, footer: { text: "Ranking: /tiradores · Señor Harrington" } }], components: [] } });
    }
  }
  if (i.type === 2 && orden === "tiradores") {
    const { data } = await sb.from("bot_tiradores").select("*").order("victorias", { ascending: false }).limit(10);
    const L = (data ?? []) as Array<{ nombre: string; victorias: number; derrotas: number; mejor_ms: number | null }>;
    return json({ type: 4, data: { allowed_mentions: { parse: [] }, embeds: [{ title: "🎯 " + gotica("Los Mejores Tiradores"), color: ORO, description: L.length ? L.map((t, k) => `${["🥇", "🥈", "🥉"][k] || `**${k + 1}.**`} **${limpio(t.nombre, 40)}** · ${t.victorias} ${t.victorias === 1 ? "victoria" : "victorias"}, ${t.derrotas} ${t.derrotas === 1 ? "derrota" : "derrotas"}${t.mejor_ms ? ` · mejor tiro ${t.mejor_ms} ms` : ""}`).join("\n") : "Aún no se ha celebrado ningún duelo. Rete a alguien con **/duelo**.", footer: PIE }] } });
  }

  // ── libro del aprendiz: examen ──
  if ((i.type === 2 && orden === "examen") || (i.type === 3 && id === "exa:start")) {
    if (!esPersonal) return efimero("El examen de la casa es para el personal.");
    const P = await examenNuevo();
    await sb.from("bot_examenes").upsert({ user_id: user.id, preguntas: P, idx: 0, aciertos: 0, creado: new Date().toISOString() });
    return json({ type: 4, data: { flags: 64, ...pregunta(P, 0, "Comienza el examen de la casa: 10 preguntas, se aprueba con 8. ¡Suerte!") } });
  }
  if (i.type === 3 && id.startsWith("exa:r:")) {
    const [, , n, k] = id.split(":");
    const { data: ex } = await sb.from("bot_examenes").select("*").eq("user_id", user.id).maybeSingle();
    if (!ex || +n !== ex.idx) return json({ type: 7, data: { content: "Esta pregunta ya está contestada. Si quiere repetir el examen, pulse **Hacer el examen** otra vez.", components: [] } });
    const P = ex.preguntas as Array<{ q: string; o: string[]; k: number }>, bien = +k === P[+n].k, aciertos = ex.aciertos + (bien ? 1 : 0), sig = +n + 1;
    const aviso = bien ? "✅ **¡Correcto!**" : `❌ **No.** La respuesta era: *${P[+n].o[P[+n].k].replace(/\*\*/g, "")}*`;
    await sb.from("bot_examenes").update({ idx: sig, aciertos }).eq("user_id", user.id);
    if (sig < P.length) return json({ type: 7, data: pregunta(P, sig, aviso) });
    const aprobado = aciertos >= 8;
    const E = await empleados(), e = E.find((x) => x.discord === user.id);
    const { data: prev } = await sb.from("bot_formacion").select("*").eq("user_id", user.id).maybeSingle();
    await sb.from("bot_formacion").upsert({ user_id: user.id, emp_id: e?.id || prev?.emp_id || null, nombre: e?.name || yoNombre, nota: Math.max(aciertos, prev?.nota || 0), aprobado: aprobado || !!prev?.aprobado, intentos: (prev?.intentos || 0) + 1, fecha: new Date().toISOString() });
    await sb.from("bot_examenes").delete().eq("user_id", user.id);
    if (aprobado && !prev?.aprobado && c.canal_despacho) enSegundoPlano(api(c, "POST", `/channels/${c.canal_despacho}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📚 Examen de la casa aprobado", color: 0x3d8b52, description: `**${e?.name || yoNombre}** ha aprobado el examen de la casa con **${aciertos}/10**. Ya consta en su ficha de la plantilla.`, footer: PIE }] }));
    return json({ type: 7, data: { content: `${aviso}\n\n${aprobado ? `🎓 **¡Aprobado!** Ha acertado **${aciertos} de 10**. Queda apuntado en su ficha de la plantilla.` : `📖 Ha acertado **${aciertos} de 10**: hacen falta 8. Repase las normas de la casa y vuelva a intentarlo cuando guste.`}`, components: [] } });
  }

  // ── buzón de sugerencias (anónimo) ──
  if (i.type === 3 && id === "buz:new") {
    if (!esPersonal) return efimero("El buzón es para el personal de la casa.");
    return json({ type: 9, data: { custom_id: "buz:form", title: "Buzón de sugerencias (anónimo)", components: [
      { type: 1, components: [{ type: 4, custom_id: "asunto", label: "Asunto (opcional)", style: 1, required: false, max_length: 80 }] },
      { type: 1, components: [{ type: 4, custom_id: "texto", label: "Su sugerencia o queja", style: 2, required: true, min_length: 5, max_length: 1000 }] },
    ] } });
  }
  if (i.type === 5 && id === "buz:form") {
    if (!c.canal_despacho) return efimero("El buzón no está dispuesto todavía.");
    const r = await api(c, "POST", `/channels/${c.canal_despacho}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📮 Buzón de sugerencias" + (v.asunto ? " · " + limpio(v.asunto, 80) : ""), color: ORO, description: limpio(v.texto, 1000), footer: { text: "Mensaje anónimo del personal · Señor Harrington" }, timestamp: new Date().toISOString() }] });
    return efimero(r.st < 300 ? "✅ Su mensaje está en el buzón. La Dirección lo leerá **sin saber quién lo ha escrito**." : "No he podido dejar su mensaje en el buzón. Inténtelo de nuevo.");
  }

  // ── libro de visitas: recomendación → la Dirección la aprueba → se publica ──
  if (i.type === 3 && id === "vis:new") {
    return json({ type: 9, data: { custom_id: "vis:form", title: "Libro de visitas · Casa Harrington", components: [
      { type: 1, components: [{ type: 4, custom_id: "texto", label: "Su recomendación", style: 2, required: true, min_length: 10, max_length: 500, placeholder: "Ej.: Me atendieron de maravilla y mi Schofield quedó como nuevo." }] },
      { type: 1, components: [{ type: 4, custom_id: "firma", label: "Firma (nombre de su personaje)", style: 1, required: true, max_length: 60 }] },
    ] } });
  }
  if (i.type === 5 && id === "vis:form") {
    const vis = { id: "l" + Date.now().toString(36), autor_id: user.id, autor: limpio(v.firma, 60) || yoNombre, texto: limpio(v.texto, 500) };
    await sb.from("bot_visitas").insert(vis);
    if (c.canal_despacho) await api(c, "POST", `/channels/${c.canal_despacho}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📖 Recomendación para el libro de visitas", color: ORO, description: `«${vis.texto}»\n\n— **${vis.autor}** (<@${user.id}>)`, footer: { text: "¿Se publica? · Señor Harrington" } }],
      components: [{ type: 1, components: [{ type: 2, style: 3, label: "Publicar", custom_id: `vis:ok:${vis.id}` }, { type: 2, style: 2, label: "Descartar", custom_id: `vis:no:${vis.id}` }] }] });
    return efimero("✒️ Muchas gracias por su recomendación. La Dirección la leerá y, si procede, la publicará en el libro de visitas.");
  }
  if (i.type === 3 && (id.startsWith("vis:ok:") || id.startsWith("vis:no:"))) {
    if (!esDir) return efimero("Solo la Dirección decide qué se publica.");
    const lid = id.split(":")[2];
    const { data: vis } = await sb.from("bot_visitas").select("*").eq("id", lid).maybeSingle();
    if (!vis || vis.estado !== "pendiente") return json({ type: 7, data: { components: [] } });
    const emb = (i.message?.embeds || [])[0] || { title: "📖 Recomendación" };
    if (id.startsWith("vis:no:")) { await sb.from("bot_visitas").update({ estado: "descartada" }).eq("id", lid); return json({ type: 7, data: { embeds: [{ ...emb, footer: { text: `Descartada por ${yoNombre}` } }], components: [] } }); }
    const m = await api(c, "POST", `/channels/${c.canal_libro_visitas}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "✒️ " + gotica("Del Libro de Visitas"), color: ORO, description: `«${vis.texto}»\n\n— *${vis.autor}*`, footer: { text: `Saint Denis, ${fecha(Date.parse(vis.creada))} · Señor Harrington` } }] });
    await sb.from("bot_visitas").update({ estado: "publicada", mensaje_id: m.d?.id || null }).eq("id", lid);
    return json({ type: 7, data: { embeds: [{ ...emb, footer: { text: `✅ Publicada por ${yoNombre}` } }], components: [] } });
  }
  // tercera tanda (mas.ts): pedidos, compra, agenda, se busca, periodo de prueba, Veintiuno y bitácora
  const mas = await atenderMas({ i, c, user, yoNombre, id, orden, opt, esDir, esPersonal, v });
  if (mas) return mas;
  return efimero("Este botón ha caído en desuso.");
}
