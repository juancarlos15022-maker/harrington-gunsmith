// HARRINGTON GUNSMITH · V3 · Señor Harrington: la crónica de la casa (tarea programada cada minuto, dentro de discord-bot)
// Cada minuto: campanilla al abrir y cerrar, objetivo de la semana con barra y ranking, escaparate y lista de órdenes al día,
// paneles del buzón, del libro del aprendiz, del libro de visitas y cuadro de honor, encargos listos, aviso de reuniones.
// Cada 10 minutos: medallas. Una vez al día (hora de Madrid): 9:00 el tiempo y un refrán; 10:00 aniversarios y cumpleaños;
// 11:00 inactividad y armas sin registrar. Domingo 18:00 resumen del personal; domingo 21:00 la Gaceta de Saint Denis.
// Día 1 a las 12:00: empleado del mes. Cada aviso diario se apunta en bot_hechos para no repetirse nunca.
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalogo, CATS, dolar, duracion, fecha, gotica, hora, hoyNum, limpio, madrid, medianoche, ORO, PIE, versalita } from "./comun.ts";
import { cronicaMas } from "./mas.ts";
import { bancoExamen, botonAvisado, cronAprobaciones, cronAvisos, ia, informeLunes, menciones, parteManana, textoEncargoListo } from "./ia.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const WEB = "https://juancarlos15022-maker.github.io/harrington-gunsmith/";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
let c: Record<string, string> = {};
const H = () => ({ Authorization: "Bot " + c.token, "Content-Type": "application/json" });
async function api(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: H(), body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const t = await r.text();
  try { return { st: r.status, d: t ? JSON.parse(t) : null }; } catch { return { st: r.status, d: t }; }
}
const post = (canal: string | undefined, cuerpo: Record<string, unknown>) => canal ? api("POST", `/channels/${canal}/messages`, { allowed_mentions: { parse: [] }, ...cuerpo }) : Promise.resolve({ st: 0, d: null });
async function carta(uid: string, texto: string) {
  try { const dm = await api("POST", "/users/@me/channels", { recipient_id: uid }); if (dm.d?.id) await api("POST", `/channels/${dm.d.id}/messages`, { content: "🎩 **Casa Harrington · Saint Denis**\n\n" + texto + "\n\nDios guarde a usted muchos años.\n— *Señor Harrington*" }); } catch { /* */ }
}
const marcar = async (k: string) => { const { data } = await sb.from("bot_hechos").insert({ clave: k }).select("clave"); return !!data?.length; };
// mensaje fijo: se crea una vez (y se fija) y se edita solo si cambia
async function fijo(canal: string | undefined, clave: string, cuerpo: Record<string, unknown>) {
  if (!canal) return false;
  const firma = JSON.stringify(cuerpo);
  if (c["firma_" + clave] === firma && c[clave]) return false;
  let id = c[clave];
  if (id) { const r = await api("PATCH", `/channels/${canal}/messages/${id}`, cuerpo); if (r.st === 404) id = ""; else if (r.st >= 300) return false; }
  if (!id) {
    const r = await api("POST", `/channels/${canal}/messages`, cuerpo);
    if (r.st >= 300) return false;
    id = r.d.id; await api("PUT", `/channels/${canal}/pins/${id}`);
    await sb.from("bot_cfg").upsert({ clave, valor: id }); c[clave] = id;
  }
  await sb.from("bot_cfg").upsert({ clave: "firma_" + clave, valor: firma }); c["firma_" + clave] = firma;
  return true;
}
type Emp = Record<string, any> & { id: string; name: string; puesto?: string; sueldo?: number; horas?: number; inicio?: string; discord?: string; alta?: number };
async function empleados() { const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle(); return (Array.isArray(data?.valor) ? data!.valor : []) as Emp[]; }
async function registros<T>(prefijo: string, filtro?: (q: any) => any) {
  let q = sb.from("datos").select("clave,valor,actualizado").like("clave", prefijo + "%");
  if (filtro) q = filtro(q);
  const { data } = await q;
  return ((data ?? []) as Array<{ clave: string; valor: T & { deleted?: boolean }; actualizado: string }>).filter((r) => r.valor && !r.valor.deleted);
}
const diaSem = (n: number) => new Date(n * 86400000).getUTCDay();
const ddmm = (n: number) => { const x = new Date(n * 86400000); return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
type Venta = { id?: string; op?: string; dueCents?: number; totalCents?: number; employee?: string; items?: Array<{ qty: number; name: string }>; voided?: boolean; date?: string };
async function ventasDe(dias: number[]) {
  const out: Venta[] = [];
  for (let k = 0; k < dias.length; k += 10) {
    const pat = dias.slice(k, k + 10).map((d) => { const x = new Date(d * 86400000); return `clave.like.venta:HG-${String(x.getUTCDate()).padStart(2, "0")}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCFullYear()).slice(2)}-*`; });
    const { data } = await sb.from("datos").select("valor").or(pat.join(","));
    for (const r of (data ?? []) as Array<{ valor: Venta & { deleted?: boolean } }>) if (r.valor && !r.valor.deleted && !r.valor.voided) out.push(r.valor);
  }
  return out;
}
const cobrado = (r: Venta) => r.op === "encargo" ? Number(r.totalCents || 0) - Number(r.dueCents || 0) : Number(r.dueCents || 0);
async function horasPorNombre(desde: number, hasta: number) {
  const T = await registros<{ name: string; start: number; end: number }>("turno:");
  const H: Record<string, number> = {};
  for (const { valor: t } of T) if (t.start >= desde && t.start < hasta) H[t.name] = (H[t.name] || 0) + Math.max(0, t.end - t.start);
  return H;
}
const barra = (p: number) => { const b = Math.max(0, Math.min(10, Math.round(p * 10))); return "▰".repeat(b) + "▱".repeat(10 - b); };
const azar = (sem: number, n: number) => Math.abs(Math.floor(Math.sin(sem * 9301 + 49297) * 233280)) % n;

// ── 1 · campanilla al abrir y cerrar la tienda ──
async function campanilla() {
  const F = (await registros<{ name: string; start: number }>("fichaje:")).map((r) => r.valor).filter((t) => t.start);
  const abierto = F.length ? "1" : "0";
  if (c.tienda_abierta === undefined) { await sb.from("bot_cfg").upsert({ clave: "tienda_abierta", valor: abierto }); return; }
  if (c.tienda_abierta === abierto) return;
  await sb.from("bot_cfg").upsert({ clave: "tienda_abierta", valor: abierto }); c.tienda_abierta = abierto;
  await post(c.canal_charla_ic, { embeds: [abierto === "1"
    ? { color: 0x3d8b52, description: `🔔 *Suena la campanilla de la puerta.* La **Casa Harrington** abre sus puertas. Hoy atiende: **${F.map((t) => limpio(t.name, 40)).join(", ")}**.` }
    : { color: 0x6b4c1d, description: "🌙 *Se echa el cerrojo y se apagan los quinqués.* La **Casa Harrington** cierra por hoy. ¡Buenas noches, Saint Denis!" }] });
}

// ── 2 · objetivo de la semana con barra y ranking (semana de viernes a jueves, como en la web) ──
async function objetivo() {
  const hoy = hoyNum(), ws = hoy - ((diaSem(hoy) + 2) % 7);
  const V = await ventasDe(Array.from({ length: hoy - ws + 1 }, (_, k) => ws + k));
  const total = V.reduce((a, r) => a + cobrado(r), 0);
  const por: Record<string, number> = {};
  for (const r of V) if (r.employee) por[r.employee] = (por[r.employee] || 0) + cobrado(r);
  const rank = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const { data: o } = await sb.from("datos").select("valor").eq("clave", "cfg:objetivo").maybeSingle();
  const meta = Number((o?.valor as { cents?: number } | null)?.cents || 0);
  const p = meta > 0 ? total / meta : 0;
  await fijo(c.canal_objetivo, "msg_objetivo", { allowed_mentions: { parse: [] }, embeds: [{
    title: "🎯 " + gotica("Objetivo de la Semana"), color: meta > 0 && total >= meta ? 0x3d8b52 : ORO,
    description: `Semana del viernes ${ddmm(ws)} al jueves ${ddmm(ws + 6)}.\n\n` + (meta > 0
      ? `${barra(p)} **${Math.floor(p * 100)} %**\n**${dolar(total)}** de **${dolar(meta)}**${total >= meta ? "\n\n🏆 **¡Objetivo conseguido!** Enhorabuena a toda la casa." : `\nFaltan **${dolar(meta - total)}**.`}`
      : `Cobrado esta semana: **${dolar(total)}**.\n\n*La Dirección aún no ha fijado un objetivo (en la web: Dirección → OBJETIVO).*`),
    fields: [{ name: "🏅 Quién va en cabeza", value: rank.length ? rank.map(([n, v], k) => `${["🥇", "🥈", "🥉"][k] || `**${k + 1}.**`} ${limpio(n, 40)} · ${dolar(v)}`).join("\n") : "Nadie ha vendido todavía esta semana." }],
    footer: { text: "Se pone al día solo con cada venta · Señor Harrington" } }] });
  if (meta > 0 && total >= meta && await marcar("objetivo-" + ws)) await post(c.canal_bandos, { embeds: [{ title: "🎯 " + gotica("Objetivo Conseguido"), color: 0x3d8b52, description: `Por orden de la Dirección se hace saber que la casa ha alcanzado el objetivo de la semana: **${dolar(total)}** de ${dolar(meta)}.\n\n¡Enhorabuena a todo el personal!${rank[0] ? `\nMención especial para **${limpio(rank[0][0], 40)}**, que va en cabeza.` : ""}`, footer: PIE }] });
}

// ── 3 · escaparate (con las ilustraciones de la web) y lista de órdenes ──
const IMG: Record<string, string> = { Revolveres: "revolveres", Pistolas: "pistolas", Repetidoras: "repetidoras", Rifles: "rifles", Escopetas: "escopetas", Blancas: "armas-blancas", Municion: "municion", Suministros: "suministros" };
async function escaparate() {
  const L = await catalogo(sb);
  const embeds = CATS.map(([k, emo, nom]) => {
    const P = L.filter((p) => p.categoria === k);
    if (!P.length) return null;
    return { title: `${emo} ${versalita(nom)}`, color: ORO, image: IMG[k] ? { url: `${WEB}${IMG[k]}-ancha.webp` } : undefined,
      description: P.map((p) => p.precio > 0 ? `${p.nombre} · **${dolar(p.precio)}**` : `${p.nombre} · *por encargo*`).join("\n").slice(0, 2000) };
  }).filter(Boolean).slice(0, 10);
  await fijo(c.canal_escaparate, "msg_escaparate", { allowed_mentions: { parse: [] }, content: "🖼 **El escaparate de la Casa Harrington** · precios del mostrador, siempre al día con la web.\nPara comprar o encargar, hable con cualquier empleado de la casa o mande un telegrama.", embeds, components: [{ type: 1, components: [{ type: 2, style: 5, label: "Ver el catálogo completo", url: WEB + "clientes.html", emoji: { name: "🛒" } }] }] });
}
const ORDENES = [
  ["🌐 Para todos", [["/precio", "Precio de mostrador de cualquier artículo. Empiece a escribir el nombre y elíjalo. 🔒"], ["/duelo @persona", "Reta a alguien a un duelo al amanecer: gana quien dispare primero al oír «¡FUEGO!»."], ["/tiradores", "Ranking de los mejores tiradores de los duelos."]]],
  ["🛠 Para el personal", [["/harrington pregunta", "Pregúntele al Señor Harrington lo que quiera sobre la casa: existencias, encargos, pedidos, ausencias, cómo se hace algo en la web… También puede mencionarle (@Sr Harrington) en los canales del personal. 🔒"], ["/resumen", "Lo que ha pasado en este canal en las últimas horas, resumido. 🔒"], ["/redactar", "Le escribe un telegrama para un cliente o proveedor, el aviso de un encargo o un anuncio, listo para copiar. 🔒"], ["/mis-horas", "Sus horas de esta semana, las que le faltan y lo que cobraría si la semana acabara hoy. 🔒"], ["/pedidos", "Pedidos a proveedores pendientes de recibir, con el botón «Recibido entero». 🔒"], ["/stock", "Cuántas unidades quedan de un producto o material. 🔒"], ["/encargos", "Encargos por fabricar o por entregar. 🔒"], ["/cliente", "Ficha resumida de un cliente: telegrama y armas registradas. 🔒"], ["/telegrama @persona texto", "Manda un telegrama de la época por mensaje privado."], ["/cumpleanos día mes", "Apunta el cumpleaños de su personaje: ese día la casa le felicitará. 🔒"], ["/examen", "Examen de la casa (también con el botón del libro del aprendiz). 🔒"]]],
  ["🎩 Para la Dirección", [["/caja", "Lo cobrado y lo gastado hoy y esta semana. 🔒"], ["/compra material cantidad precio", "Apunta una compra a un particular: entra al almacén como lote con su precio y, si sale de la caja, como gasto. 🔒"], ["/agenda nombre", "Ficha de un contacto de la agenda (telegrama y observaciones). 🔒"], ["/se-busca nombre motivo", "Cuelga un cartel de Se busca; la web avisará si alguien compra a ese nombre."], ["/evento", "Anuncia un evento con los botones Me apunto / Me borro."], ["/reunion", "Convoca una reunión; aviso a todo el personal una hora antes."], ["/votacion", "Abre una votación con botones (2 a 5 opciones)."], ["/despedir @persona", "Despide a alguien (también: clic derecho → Aplicaciones → Despedir de Harrington)."]]],
];
async function ordenes() {
  await fijo(c.canal_ordenes, "msg_ordenes", { allowed_mentions: { parse: [] }, embeds: [
    { title: "📜 " + gotica("Libro de Mandatos"), color: ORO, description: "Escriba **/** en cualquier canal y elija la orden de la lista.\nLas marcadas con 🔒 solo le responden a usted: nadie más ve la respuesta." },
    ...ORDENES.map(([t, L]) => ({ title: t as string, color: ORO, description: (L as string[][]).map(([o, d]) => `**${o}**\n${d}`).join("\n\n") })),
    { title: "🔘 Botones", color: ORO, description: [
      `${c.canal_fichar ? `<#${c.canal_fichar}>` : "Fichar y ausencias"} — entrar y salir de turno, avisar una ausencia y volver.`,
      `${c.canal_aprendiz ? `<#${c.canal_aprendiz}>` : "Libro del aprendiz"} — examen de la casa.`,
      `${c.canal_buzon ? `<#${c.canal_buzon}>` : "Buzón"} — sugerencias anónimas para la Dirección.`,
      `${c.canal_libro_visitas ? `<#${c.canal_libro_visitas}>` : "Libro de visitas"} — deje su recomendación de la casa.`,
      `${c.canal_eventos ? `<#${c.canal_eventos}>` : "Eventos"} — Me apunto / Me borro en cada anuncio.`,
      `${c.canal_pedidos ? `<#${c.canal_pedidos}>` : "Pedidos"} — «Recibido entero» cuando llega un pedido: el material entra solo en la web.`,
      `${c.canal_juego ? `<#${c.canal_juego}>` : "Mesa de juego"} — el Veintiuno, con fichas de mentira y ranking semanal.`,
      "Al pulsar **Salgo de turno**, puede apuntar en la bitácora del taller lo que ha hecho.",
      "Dirección: fichas de la **plantilla** (Ascender / Despedir), **sanciones** y **solicitudes de empleo**.",
    ].join("\n"), footer: PIE },
  ] });
}

// ── 4 · paneles con botón y cuadro de honor ──
const MEDALLAS: Record<string, string> = { venta1: "🪙 Primera venta", venta50: "💰 50 ventas", venta100: "🏆 100 ventas", horas10: "⏱ 10 horas de taller", horas50: "🕰 50 horas de taller", horas100: "⚙️ 100 horas de taller", mes1: "📜 Un mes en la casa", mes3: "🎖 Tres meses en la casa", anio1: "👑 Un año en la casa", ascenso: "⬆️ Primer ascenso", examen: "📚 Examen de la casa aprobado" };
const nombreMedalla = (k: string) => MEDALLAS[k] || (k.startsWith("mes-") ? `🏅 Empleado del mes (${MESES[+k.slice(10, 12) - 1] || ""} ${k.slice(4, 8)})` : k);
async function paneles() {
  await fijo(c.canal_buzon, "msg_buzon", { allowed_mentions: { parse: [] }, embeds: [{ title: "📮 " + gotica("Sugerencias para la Casa"), color: ORO, description: "¿Tiene una idea para mejorar la casa, o algo que le preocupa?\n\nPulse **Escribir al buzón** y cuéntelo. **Nadie sabrá que ha sido usted**: la Dirección solo verá el mensaje.", footer: PIE }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "Escribir al buzón", emoji: { name: "📮" }, custom_id: "buz:new" }] }] });
  await fijo(c.canal_aprendiz, "msg_aprendiz", { allowed_mentions: { parse: [] }, embeds: [{ title: "📚 " + gotica("Libro del Aprendiz"), color: ORO, description: "Examen de la casa: **10 preguntas** sobre las normas, el oficio y los precios del mostrador. Se aprueba con **8 aciertos**.\n\nSi lo aprueba, constará en su ficha de la plantilla y la Dirección lo tendrá en cuenta para los ascensos. Puede repetirlo cuantas veces quiera.", footer: PIE }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "Hacer el examen", emoji: { name: "📚" }, custom_id: "exa:start" }] }] });
  await fijo(c.canal_libro_visitas, "msg_visitas", { allowed_mentions: { parse: [] }, embeds: [{ title: "📖 " + gotica("Libro de Visitas"), color: ORO, description: "¿Le ha atendido bien la Casa Harrington?\n\nPulse **Dejar una recomendación** y escríbala con la firma de su personaje. La Dirección la leerá y, si procede, la publicará aquí.", footer: PIE }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "Dejar una recomendación", emoji: { name: "✒️" }, custom_id: "vis:new" }] }] });
  const E = await empleados();
  const { data: M } = await sb.from("bot_medallas").select("emp_id,medalla");
  const por: Record<string, string[]> = {};
  for (const m of (M ?? []) as Array<{ emp_id: string; medalla: string }>) (por[m.emp_id] ||= []).push(m.medalla);
  const lin = E.filter((e) => por[e.id]?.length).map((e) => `**${limpio(e.name, 40)}**\n${por[e.id].map(nombreMedalla).join(" · ")}`);
  await fijo(c.canal_honor, "msg_honor", { allowed_mentions: { parse: [] }, embeds: [{ title: "🏅 " + gotica("Cuadro de Honor"), color: ORO, description: (c.mes_actual_nombre ? `**Empleado del mes:** 🏅 ${c.mes_actual_nombre}\n\n` : "") + (lin.join("\n\n") || "Aún no hay medallas. Las primeras llegarán con la primera venta y las primeras horas de taller."), footer: { text: "Las medallas se ganan solas · Señor Harrington" } }] });
}

// ── 5 · encargos recién fabricados y reuniones que empiezan en una hora ──
async function encargosListos() {
  const desde = new Date(Date.now() - 2 * 3600000).toISOString();
  const L = await registros<Record<string, any>>("encargo:", (q) => q.gte("actualizado", desde));
  for (const { valor: e } of L) {
    if (e.fab !== "FABRICADO" || e.finished || e.cancelled || e.avisado || !e.id) continue;
    if (!(await marcar("enc-listo-" + e.id))) continue;
    const items = (e.items || []).map((x: any) => x.qty + " × " + x.name).join(", ");
    const ia_t = await textoEncargoListo(c, e).catch(() => null);
    const txt = ia_t || `Nos complace anunciarle, Sr./Sra. ${e.client}, que su encargo en Armería Harrington Gunsmith ya está fabricado (${items}).${e.pendingCents > 0 ? `\n\nImporte pendiente al recogerlo: ${dolar(e.pendingCents)}.` : ""}\n\nPuede pasar a recogerlo cuando quiera. Dispone de un plazo de 10 días para hacerlo: transcurrido ese plazo, perderá el producto y el dinero depositado como fianza.\n\nAtentamente, Vincent Harrington · Telegrama SD8112\n\nEl precio de un apellido.`;
    await post(c.canal_encargos, { embeds: [{ title: "📦 Encargo listo · " + limpio(e.client, 60), color: 0x3d8b52, description: `**${items}**\nTelegrama del cliente: **${limpio(e.telegram, 12) || "—"}**\n\nCopie este aviso y mándeselo por telegrama; luego pulse **Ya le he avisado** (o márquelo en la web):\n\`\`\`\n${txt}\n\`\`\``, footer: PIE }], components: botonAvisado(e.id) });
  }
}
async function reuniones() {
  const ahora = Date.now();
  const { data } = await sb.from("bot_reuniones").select("*").eq("avisada", false).lte("cuando", new Date(ahora + 3600000).toISOString()).gte("cuando", new Date(ahora - 600000).toISOString());
  for (const r of (data ?? []) as Array<Record<string, any>>) {
    const { data: ok } = await sb.from("bot_reuniones").update({ avisada: true }).eq("id", r.id).eq("avisada", false).select("id");
    if (!ok?.length) continue;
    const roles = ["rol_aprendiz", "rol_armero", "rol_gerente", "rol_colaborador", "rol_jefe"].map((k) => c[k]).filter(Boolean);
    const t = Date.parse(r.cuando);
    await api("POST", `/channels/${c.canal_bandos}/messages`, { content: roles.map((x) => `<@&${x}>`).join(" "), allowed_mentions: { roles }, embeds: [{ title: "⏰ La reunión empieza pronto", color: ORO, description: `**${r.tema}**\nHoy a las **${hora(t)}**${r.lugar ? ` · ${r.lugar}` : ""}.\n\nSe ruega puntualidad.`, footer: PIE }] });
  }
}

// ── 6 · medallas (cada 10 minutos) ──
async function medallas() {
  const E = await empleados();
  const { count } = await sb.from("bot_medallas").select("*", { count: "exact", head: true });
  const primera = !count;
  const { data: V } = await sb.from("datos").select("e:valor->>employee,v:valor->>voided").like("clave", "venta:%");
  const nV: Record<string, number> = {};
  for (const r of (V ?? []) as Array<{ e: string; v: string }>) if (r.e && r.v !== "true") nV[r.e] = (nV[r.e] || 0) + 1;
  const hT = await horasPorNombre(0, Number.MAX_SAFE_INTEGER);
  const { data: F } = await sb.from("bot_formacion").select("emp_id,aprobado");
  const aprob = new Set(((F ?? []) as Array<{ emp_id: string; aprobado: boolean }>).filter((x) => x.aprobado && x.emp_id).map((x) => x.emp_id));
  const hoy = hoyNum(), nuevas: Array<{ e: Emp; k: string }> = [];
  for (const e of E) {
    const v = nV[e.name] || 0, h = (hT[e.name] || 0) / 3600000;
    const ini = /^\d{4}-\d{2}-\d{2}$/.test(e.inicio || "") ? Math.floor(Date.parse(e.inicio + "T00:00:00Z") / 86400000) : hoy;
    const ganadas = [v >= 1 && "venta1", v >= 50 && "venta50", v >= 100 && "venta100", h >= 10 && "horas10", h >= 50 && "horas50", h >= 100 && "horas100",
      hoy - ini >= 30 && "mes1", hoy - ini >= 91 && "mes3", hoy - ini >= 365 && "anio1", Array.isArray(e.ascensos) && e.ascensos.length && "ascenso", aprob.has(e.id) && "examen"].filter(Boolean) as string[];
    for (const k of ganadas) {
      const { data: ok } = await sb.from("bot_medallas").upsert({ emp_id: e.id, medalla: k, nombre: e.name }, { onConflict: "emp_id,medalla", ignoreDuplicates: true }).select("emp_id");
      if (ok?.length) nuevas.push({ e, k });
    }
  }
  if (!nuevas.length) return;
  if (primera) {
    await post(c.canal_honor, { embeds: [{ title: "🏅 " + gotica("Se Inaugura el Muro de Honor"), color: ORO, description: "Desde hoy, el Señor Harrington premia con medallas el buen hacer del personal: ventas, horas de taller, antigüedad, ascensos y el examen de la casa.\n\nYa se han concedido las primeras; se ven en el cuadro de honor fijado arriba.", footer: PIE }] });
    return;
  }
  for (const { e, k } of nuevas.slice(0, 10)) await post(c.canal_honor, { content: e.discord ? `<@${e.discord}>` : "", allowed_mentions: { users: e.discord ? [e.discord] : [] }, embeds: [{ color: ORO, description: `🏅 **${limpio(e.name, 40)}** ha ganado la medalla **${nombreMedalla(k)}**. ¡Enhorabuena!` }] });
}

// ── 7 · avisos diarios ──
const TIEMPO: Record<string, string[]> = {
  invierno: ["Mañana fría y gris sobre el Lannahechee; conviene abrigarse.", "Llovizna helada en los muelles; los caminos estarán embarrados.", "Cielo despejado y frío seco. Buen día para el tiro al blanco.", "Niebla espesa hasta media mañana; cuidado en los caminos."],
  primavera: ["Mañana templada y luminosa; flores en los balcones de Saint Denis.", "Chubascos breves por la tarde; lleve paraguas.", "Brisa suave del río y cielo azul. Día de mucho trajín en el mercado.", "Bochorno creciente; tormenta posible al anochecer."],
  verano: ["Calor húmedo desde primera hora; agua fresca a mano.", "Tormenta de verano por la tarde, con truenos sobre el pantano.", "Sol de justicia en Saint Denis: mejor trabajar a la sombra.", "Noche cálida y estrellada tras un día bochornoso."],
  otono: ["Mañana neblinosa junto al río; despeja a mediodía.", "Cielo cubierto y aire fresco. Huele a hojas mojadas en las calles.", "Lluvia fina toda la jornada; cuide que la pólvora no se humedezca.", "Día templado y sereno, de los mejores del año para viajar."],
};
const REFRANES = ["Arma limpia no falla dos veces.", "Quien guarda la pólvora seca, guarda la vida.", "Más vale un buen cañón que mil promesas.", "El buen armero mide dos veces y lima una.", "Cliente bien atendido vuelve con un amigo.", "Paciencia y aceite: la llave de todo mecanismo.", "No hay mal revólver, sino mal cuidado.", "La palabra de un Harrington vale lo que su acero.", "Quien presume de puntería, falla al primer viento.", "Tornillo flojo hoy, disgusto mañana.", "El que madruga encuentra la fragua caliente.", "Ni prestes el arma ni des la palabra en vano.", "Cuenta las balas antes del duelo, no después.", "Precio justo y trato honrado hacen la casa grande.", "Mano firme, pulso tranquilo y ojo atento."];
async function diarios() {
  const m = madrid(Date.now()), h = +m.hour, hoy = hoyNum(), clave = `${m.year}-${m.month}-${m.day}`, mes = +m.month, dia = +m.day;
  if (h === 9 && await marcar("tiempo-" + clave)) {
    const est = [12, 1, 2].includes(mes) ? "invierno" : mes <= 5 ? "primavera" : mes <= 8 ? "verano" : "otono";
    const grados = { invierno: [44, 58], primavera: [62, 78], verano: [82, 95], otono: [60, 76] }[est]!;
    await post(c.canal_charla_ic, { embeds: [{ title: "🌤 " + gotica("El Tiempo en Saint Denis"), color: ORO, description: `${TIEMPO[est][azar(hoy, 4)]}\nTemperatura: unos **${grados[0] + azar(hoy + 7, grados[1] - grados[0])} °F**.\n\n📜 *Refrán del armero:* «${REFRANES[azar(hoy + 3, REFRANES.length)]}»`, footer: { text: `Saint Denis, ${dia} de ${MESES[mes - 1]} de 1880 · Señor Harrington` } }] });
  }
  if (h === 10 && await marcar("aniv-" + clave)) {
    const E = await empleados();
    for (const e of E) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.inicio || "")) continue;
      const [y, mm, d] = e.inicio!.split("-").map(Number);
      const meses = (+m.year - y) * 12 + (mes - mm);
      const finMes = new Date(Date.UTC(+m.year, mes, 0)).getUTCDate();
      if (meses < 1 || !(d === dia || (d > finMes && dia === finMes))) continue;
      const t = meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? "año" : "años"}` : `${meses} ${meses === 1 ? "mes" : "meses"}`;
      await post(c.canal_ooc, { content: e.discord ? `<@${e.discord}>` : "", allowed_mentions: { users: e.discord ? [e.discord] : [] }, embeds: [{ color: ORO, description: `🎩 Hoy hace **${t}** que **${limpio(e.name, 40)}** sirve en la Casa Harrington. ¡Enhorabuena y gracias por su trabajo!` }] });
    }
    const { data: C } = await sb.from("bot_cumples").select("*").eq("dia", dia).eq("mes", mes);
    for (const x of (C ?? []) as Array<{ user_id: string; nombre: string }>) {
      await post(c.canal_ooc, { content: `<@${x.user_id}>`, allowed_mentions: { users: [x.user_id] }, embeds: [{ title: "🎂 " + gotica("Muchas Felicidades"), color: ORO, description: `Hoy es el cumpleaños de **${limpio(x.nombre, 40)}**. La Casa Harrington en pleno le desea muchas felicidades. 🥃`, footer: PIE }] });
      await carta(x.user_id, `En el día de su cumpleaños, la Casa Harrington le desea **muchas felicidades**. Que cumpla muchos más, y que todos sean con el pulso firme y la pólvora seca.`);
    }
  }
  if (h === 11 && await marcar("inact-" + clave)) {
    const E = (await empleados()).filter((e) => e.puesto !== "Jefe");
    const T = await registros<{ name: string; start: number; end: number }>("turno:");
    const F = (await registros<{ empId: string }>("fichaje:")).map((r) => r.valor.empId);
    const A = (await registros<{ name: string; start: number; end: number; returned?: boolean; cancelled?: boolean }>("ausencia:")).map((r) => r.valor);
    const L: string[] = [];
    for (const e of E) {
      if (F.includes(e.id)) continue;
      if (A.some((a) => a.name === e.name && !a.cancelled && !a.returned && a.start <= Date.now() && (!a.end || a.end > Date.now()))) continue;
      const ult = Math.max(Number(e.alta || 0), ...T.filter((t) => t.valor.name === e.name).map((t) => t.valor.end || 0));
      const dias = Math.floor((Date.now() - ult) / 86400000);
      if (dias < 5 || !ult) continue;
      L.push(`⏳ **${limpio(e.name, 40)}** lleva **${dias} días** sin fichar y no ha avisado de ninguna ausencia.`);
      if (e.discord && await marcar(`inact-carta-${e.id}-${Math.floor(ult / 86400000)}`)) await carta(e.discord, `Hace **${dias} días** que no le vemos por el taller y no consta ninguna ausencia.\n\nSi va a estar fuera, avísenos con el botón **Avisar una ausencia** del canal de fichar. Si todo va bien, le esperamos con el banco de trabajo preparado.`);
    }
    const { data: cl } = await sb.from("datos").select("valor").eq("clave", "clientes").maybeSingle();
    const S: string[] = [];
    for (const x of (Array.isArray(cl?.valor) ? cl!.valor : []) as Array<Record<string, any>>) for (const s of (x.series || []) as Array<{ s: string; a?: string; ic?: boolean }>) if (s.ic === false) S.push(`⚠️ **${limpio(x.name, 40)}** · ${limpio(s.a, 40) || "arma"} · n.º ${limpio(s.s, 30)}`);
    if (L.length) await post(c.canal_despacho, { embeds: [{ title: "⏳ " + gotica("Personal Ausente sin Aviso"), color: 0x8b2e25, description: L.join("\n") + "\n\nSe les ha mandado una carta amable preguntando por ellos.", footer: PIE }] });
    if (S.length) await post(c.canal_despacho, { embeds: [{ title: "📝 Armas vendidas sin registrar IC", color: 0x8b2e25, description: S.slice(0, 20).join("\n") + (S.length > 20 ? `\n… y ${S.length - 20} más.` : "") + "\n\nMárquelas como registradas en la ficha del cliente (web → CLIENTES) en cuanto se registren.", footer: PIE }] });
  }
}

// ── 8 · domingo: resumen del personal (18:00) y Gaceta de Saint Denis (21:00) ──
async function domingo() {
  const m = madrid(Date.now()), h = +m.hour, hoy = hoyNum(), clave = `${m.year}-${m.month}-${m.day}`;
  if (diaSem(hoy) !== 0) return;
  const lunes = hoy - 6, dias = Array.from({ length: 7 }, (_, k) => lunes + k);
  if (h === 18 && await marcar("resumen-" + clave)) {
    const E = await empleados(), V = await ventasDe(dias), HH = await horasPorNombre(medianoche(lunes), medianoche(lunes + 7));
    const L = E.map((e) => {
      const vs = V.filter((r) => r.employee === e.name), hs = HH[e.name] || 0, req = Number(e.horas || 10) * 3600000;
      return `**${limpio(e.name, 40)}** (${limpio(e.puesto, 20)})\n${hs ? `${duracion(0, hs)} de ${e.horas || 10} h ${hs >= req ? "✅" : "⚠️"}` : "⚠️ **No ha fichado esta semana**"} · ${vs.length} ${vs.length === 1 ? "venta" : "ventas"} (${dolar(vs.reduce((a, r) => a + cobrado(r), 0))})`;
    });
    await post(c.canal_despacho, { embeds: [{ title: "📋 " + gotica("Resumen Semanal del Personal"), color: ORO, description: `Semana del lunes ${ddmm(lunes)} al domingo ${ddmm(hoy)}.\n\n` + (L.join("\n\n") || "No hay personal en la plantilla.") + "\n\n✅ ha cumplido sus horas · ⚠️ le faltan horas", footer: PIE }] });
  }
  if (h === 21 && await marcar("gaceta-" + clave)) {
    const E = await empleados(), V = await ventasDe(dias);
    const total = V.reduce((a, r) => a + cobrado(r), 0), por: Record<string, number> = {}, art: Record<string, number> = {};
    for (const r of V) { if (r.employee) por[r.employee] = (por[r.employee] || 0) + cobrado(r); for (const x of r.items || []) art[x.name] = (art[x.name] || 0) + Number(x.qty || 0); }
    const mejor = Object.entries(por).sort((a, b) => b[1] - a[1])[0], top = Object.entries(art).sort((a, b) => b[1] - a[1])[0];
    const desde = medianoche(lunes);
    const nuevos = E.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.inicio || "") && Math.floor(Date.parse(e.inicio + "T00:00:00Z") / 86400000) >= lunes);
    const asc = E.flatMap((e) => (Array.isArray(e.ascensos) ? e.ascensos : []).filter((a: any) => a.ts >= desde).map((a: any) => `**${limpio(e.name, 40)}**, ascendido a ${a.a}`));
    const { data: md } = await sb.from("bot_medallas").select("nombre,medalla").gte("fecha", new Date(desde).toISOString());
    const { data: ev } = await sb.from("bot_eventos").select("titulo,cuando").gte("creada", new Date(desde).toISOString());
    const { data: du } = await sb.from("bot_duelos").select("ganador,retador,retador_n,rival_n").eq("estado", "fin").gte("creado", new Date(desde).toISOString());
    const gan: Record<string, number> = {};
    for (const d of (du ?? []) as Array<{ ganador: string; retador: string; retador_n: string; rival_n: string }>) { const n = d.ganador === d.retador ? d.retador_n : d.rival_n; gan[n] = (gan[n] || 0) + 1; }
    const tirador = Object.entries(gan).sort((a, b) => b[1] - a[1])[0];
    const dia = +m.day, mes = +m.month;
    const fields = [
      { name: "💰 " + versalita("Comercio"), value: V.length ? `La casa despachó **${V.length}** ${V.length === 1 ? "venta" : "ventas"} por un total de **${dolar(total)}**.${top ? ` El artículo más solicitado fue **${top[0]}** (${top[1]} ${top[1] === 1 ? "unidad" : "unidades"}).` : ""}${mejor ? ` Destaca tras el mostrador **${limpio(mejor[0], 40)}**, con ${dolar(mejor[1])}.` : ""}` : "Semana tranquila en el mostrador: no constan ventas." },
      { name: "🎩 " + versalita("Noticias de la casa"), value: [...nuevos.map((e) => `Se incorpora a la casa **${limpio(e.name, 40)}** como ${limpio(e.puesto, 30)}.`), ...asc.map((t) => t + "."), ...((md ?? []) as Array<{ nombre: string; medalla: string }>).slice(0, 6).map((x) => `**${limpio(x.nombre, 40)}** recibe la medalla ${nombreMedalla(x.medalla)}.`)].join("\n").slice(0, 1024) || "Sin novedades en la plantilla esta semana." },
      { name: "📅 " + versalita("Sociedad"), value: [((ev ?? []) as Array<{ titulo: string; cuando: string }>).map((x) => `Se anuncia: **${limpio(x.titulo, 60)}** (${limpio(x.cuando, 40)}).`).join("\n"), tirador ? `En el campo del honor, **${limpio(tirador[0], 40)}** se lleva ${tirador[1]} ${tirador[1] === 1 ? "duelo" : "duelos"}.` : ""].filter(Boolean).join("\n").slice(0, 1024) || "La semana transcurrió sin eventos ni duelos." },
      { name: "📜 " + versalita("Pensamiento del armero"), value: `«${REFRANES[azar(hoy + 11, REFRANES.length)]}»` },
    ];
    // la crónica de la semana la escribe la IA con estos mismos datos (si no responde, se queda la de siempre)
    try {
      const r = await ia(c, "discord_gaceta", { ventas: V.length, total: dolar(total), mas_vendido: top ? `${top[0]} (${top[1]})` : "", destaca: mejor ? `${mejor[0]} (${dolar(mejor[1])})` : "", noticias: fields[1].value, sociedad: fields[2].value }, "", { quien: "Señor Harrington", emp_id: "discord" });
      if (!("error" in r)) { const [a1, a2] = r.texto.split(/\n\s*\n/); if (a1) fields[0].value = a1.trim().slice(0, 1024); if (a2) fields[1].value = a2.trim().slice(0, 1024); }
    } catch { /* la de siempre */ }
    await post(c.canal_bandos, { embeds: [{ title: "📰 " + gotica("La Gaceta de Saint Denis"), color: 0xe8dcc0, description: `*Edición dominical · ${dia} de ${MESES[mes - 1]} de 1880 · Precio: un centavo*`, fields, footer: { text: "Impreso por el Señor Harrington en la Casa Harrington, Saint Denis" } }] });
  }
}

// ── 9 · día 1: empleado del mes ──
async function empleadoDelMes() {
  const m = madrid(Date.now());
  if (+m.day !== 1 || +m.hour !== 12) return;
  const pm = +m.month === 1 ? 12 : +m.month - 1, py = +m.month === 1 ? +m.year - 1 : +m.year, clave = `${py}-${String(pm).padStart(2, "0")}`;
  if (!(await marcar("mes-" + clave))) return;
  const ini = Math.floor(Date.UTC(py, pm - 1, 1) / 86400000), fin = Math.floor(Date.UTC(py, pm, 1) / 86400000);
  const V = await ventasDe(Array.from({ length: fin - ini }, (_, k) => ini + k)), HH = await horasPorNombre(medianoche(ini), medianoche(fin));
  const E = (await empleados()).filter((e) => e.puesto !== "Jefe");
  const pts = E.map((e) => ({ e, v: V.filter((r) => r.employee === e.name).reduce((a, r) => a + cobrado(r), 0), h: HH[e.name] || 0 })).filter((x) => x.v > 0 || x.h > 0).sort((a, b) => b.v - a.v || b.h - a.h);
  if (!pts.length) return;
  const g = pts[0];
  if (c.mes_actual_uid && c.rol_mes) await api("DELETE", `/guilds/${c.guild_id}/members/${c.mes_actual_uid}/roles/${c.rol_mes}`);
  if (g.e.discord && c.rol_mes) await api("PUT", `/guilds/${c.guild_id}/members/${g.e.discord}/roles/${c.rol_mes}`);
  await sb.from("bot_cfg").upsert([{ clave: "mes_actual_uid", valor: g.e.discord || "" }, { clave: "mes_actual_nombre", valor: `${g.e.name} (${MESES[pm - 1]})` }]);
  await sb.from("bot_medallas").upsert({ emp_id: g.e.id, medalla: `mes-${clave}`, nombre: g.e.name }, { onConflict: "emp_id,medalla", ignoreDuplicates: true });
  const texto = `Por orden de la Dirección se hace saber que el **empleado del mes de ${MESES[pm - 1]}** es **${limpio(g.e.name, 40)}**, con **${dolar(g.v)}** despachados y **${duracion(0, g.h)}** de taller.\n\nLuce desde hoy el distintivo 🏅 en el Discord. ¡Enhorabuena!`;
  await post(c.canal_bandos, { content: g.e.discord ? `<@${g.e.discord}>` : "", allowed_mentions: { users: g.e.discord ? [g.e.discord] : [] }, embeds: [{ title: "🏅 " + gotica("Empleado del Mes"), color: 13938487, description: texto, footer: PIE }] });
  if (g.e.discord) await carta(g.e.discord, `Tengo el honor de comunicarle que ha sido nombrado **empleado del mes de ${MESES[pm - 1]}** de la Casa Harrington. La Dirección le agradece su esfuerzo.`);
}

export async function atender(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor");
  c = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  if (!c.secreto || c.secreto.length < 20 || b.secreto !== c.secreto) return json({ error: "NO" }, 403);
  const hecho: Record<string, string> = {};
  const paso = async (n: string, f: () => Promise<unknown>) => { try { await f(); hecho[n] = "ok"; } catch (e) { hecho[n] = String((e as Error)?.message || e).slice(0, 120); } };
  // mantener despiertas las funciones de los botones para que Discord no espere
  const base = Deno.env.get("SUPABASE_URL") + "/functions/v1/";
  await Promise.all([fetch(base + "discord-bot", { method: "POST", headers: { "Content-Type": "application/json", "x-hg-secreto": c.secreto, "x-hg-modo": "extra" }, body: '{"calentar":true}' }).catch(() => null), fetch(base + "discord-interacciones", { method: "POST", headers: { "Content-Type": "application/json", "x-signature-ed25519": "00", "x-signature-timestamp": "0" }, body: "{}" }).catch(() => null)]);
  await paso("campanilla", campanilla);
  await paso("objetivo", objetivo);
  await paso("escaparate", escaparate);
  await paso("ordenes", ordenes);
  await paso("paneles", paneles);
  await paso("encargos", encargosListos);
  await paso("reuniones", reuniones);
  if (+madrid(Date.now()).minute % 10 === 0 || b.todo) await paso("medallas", medallas);
  await paso("diarios", diarios);
  await paso("domingo", domingo);
  await paso("mes", empleadoDelMes);
  // con IA: contestar a quien le menciona, parte de la mañana y preguntas nuevas para el examen
  let menc: unknown = null;
  await paso("menciones", async () => { menc = await menciones(c); });
  await paso("parte_ia", async () => { hecho.parte_ia_r = String(await parteManana(c, marcar)); });
  await paso("aprobaciones", async () => { hecho.apr_r = String(await cronAprobaciones(c)); });
  await paso("informe_lunes", async () => { hecho.informe_r = String(await informeLunes(c, marcar)); });
  if (+madrid(Date.now()).minute % 10 === 3 || b.todo) await paso("avisos", async () => { hecho.avisos_r = String(await cronAvisos(c, marcar)); });
  if (+madrid(Date.now()).minute % 30 === 7 || b.todo) await paso("banco_examen", async () => { hecho.banco_r = String(await bancoExamen(c)); });
  let mas: Record<string, string> = {};
  try { mas = await cronicaMas(c, +madrid(Date.now()).minute % 10 === 0 || !!b.todo); } catch (e) { mas = { error: String((e as Error)?.message || e).slice(0, 120) }; }
  return json({ ok: true, hecho, mas, menc });
}
