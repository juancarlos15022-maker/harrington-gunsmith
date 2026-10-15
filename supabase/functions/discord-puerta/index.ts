// HARRINGTON GUNSMITH · V3 · Señor Harrington: bienvenidas y despedidas en Discord
// Discord no avisa al instante de quién entra o sale a un bot sin conexión permanente, así que el Señor Harrington
// «revisa la puerta» cada medio minuto (tarea programada harrington-puerta): compara la lista de miembros con la
// que guardó la vez anterior (tabla protegida bot_miembros) y publica:
//   · una bienvenida, con la foto de perfil y los pasos para entrar, en el canal de bienvenida;
//   · una despedida, con la foto de perfil, en el canal de despedidas.
// Seguridades: la primera vez solo apunta a todos (no saluda a nadie); solo saluda a quien entró hace menos de 30 minutos;
// si la lista llega incompleta, no despide a nadie; como mucho 5 mensajes de cada tipo por revisión.
// En cada revisión, además: fichas de la plantilla, aviso de tienda abierta/cerrada, panel de fichar y ausencias,
// lista de precios al día con la web y recordatorios para la dirección (10:00 cada día; domingo 17:00, día de paga).
import { revisarTelegramas } from "./telegramas.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalogo, fecha as fechaMs, hora, hoyNum, listaPrecios, madrid, ORO, PIE } from "./comun.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const gotica = (s: string) => [...s].map((ch) => {
  const n = ch.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return ch;
}).join("");
const limpio = (s: unknown, n: number) => String(s ?? "").replace(/@(everyone|here)/gi, "@​$1").replace(/[*_~`|>]/g, "").trim().slice(0, n);
type Miembro = { user: { id: string; username: string; global_name?: string; avatar?: string; bot?: boolean }; nick?: string; avatar?: string; joined_at?: string };

function foto(g: string, m: Miembro) {
  const u = m.user;
  if (m.avatar) return `https://cdn.discordapp.com/guilds/${g}/users/${u.id}/avatars/${m.avatar}.${m.avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
}
const nombreDe = (m: Miembro) => limpio(m.nick || m.user.global_name || m.user.username, 60) || "Un forastero";

// ── Plantilla: una ficha por empleado en el canal de la dirección, con los botones Ascender y Despedir ──
type Emp = Record<string, unknown> & { id: string; name: string; puesto?: string; sueldo?: number; inicio?: string; prueba?: string; fijo?: boolean; sinPrueba?: boolean; telegrama?: string; discord?: string };
const ASC: Record<string, string> = { "Aprendiz de armero": "Armero", "Armero": "Armero experto", "Armero experto": "Gerente" };
const COLOR: Record<string, number> = { "Jefe": 0x8b2e25, "Gerente": 0x3498db, "Armero experto": 0xa85d00, "Armero": 0xa86400, "Aprendiz de armero": 0xf1c40f };
const dolar = (c: unknown) => "$" + (Number(c || 0) / 100).toFixed(2);
const fecha = (iso: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? String(iso).split("-").reverse().join("/") : "—";
const EMO: Record<string, string> = { venta1: "🪙", venta50: "💰", venta100: "🏆", horas10: "⏱", horas50: "🕰", horas100: "⚙️", mes1: "📜", mes3: "🎖", anio1: "👑", ascenso: "⬆️", examen: "📚" };
function ficha(e: Emp, med: string[] = [], form?: { nota: number; aprobado: boolean }) {
  const jefe = e.puesto === "Jefe", sig = ASC[e.puesto || ""];
  const contrato = jefe ? "Dueño de la casa" : e.fijo ? "Fijo" : e.sinPrueba ? "Sin periodo de prueba (ascendido)" : e.prueba ? `En prueba hasta el ${fecha(e.prueba)}` : "—";
  const botones = [];
  if (sig) botones.push({ type: 2, style: 1, label: `Ascender a ${sig}`, emoji: { name: "⬆️" }, custom_id: `plt:asc:${e.id}` });
  if (!jefe) botones.push({ type: 2, style: 4, label: "Despedir", emoji: { name: "🚪" }, custom_id: `plt:desp:${e.id}` });
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${jefe ? "👑" : e.puesto === "Gerente" ? "🌟" : e.puesto === "Aprendiz de armero" ? "🔰" : "⚒"} ${limpio(e.name, 80)}`,
      color: COLOR[e.puesto || ""] ?? 0xd7ae54,
      fields: [
        { name: "Rango", value: limpio(e.puesto, 40) || "—", inline: true },
        { name: "Telegrama", value: limpio(e.telegrama, 20) || "—", inline: true },
        { name: "Discord", value: e.discord ? `<@${e.discord}>` : "sin enlazar", inline: true },
        { name: "Sueldo", value: Number(e.sueldo) > 0 ? dolar(e.sueldo) + " a la semana" : "—", inline: true },
        { name: "En la casa desde", value: fecha(e.inicio), inline: true },
        { name: "Contrato", value: contrato, inline: true },
        { name: "Medallas", value: med.length ? med.map((k) => EMO[k] || (k.startsWith("mes-") ? "🏅" : "🎖")).join(" ") : "—", inline: true },
        { name: "Examen de la casa", value: form ? (form.aprobado ? `✅ aprobado (${form.nota}/10)` : `❌ ${form.nota}/10, sin aprobar`) : "Sin hacer", inline: true },
      ],
      footer: { text: jefe ? "Al Jefe no se le asciende ni se le despide desde aquí" : !sig ? "Gerente: el rango más alto del personal" : "Señor Harrington · Plantilla de la casa" },
    }],
    components: botones.length ? [{ type: 1, components: botones }] : [],
  };
}
async function plantilla(c: Record<string, string>, H: Record<string, string>) {
  const canal = c.canal_plantilla;
  if (!canal) return { sin: true };
  const api = (m: string, ruta: string, cuerpo?: unknown) => fetch("https://discord.com/api/v10" + ruta, { method: m, headers: H, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  // cabecera explicativa (una sola vez)
  if (!c.msg_plantilla) {
    const r = await api("POST", `/channels/${canal}/messages`, { embeds: [{
      title: "📋 " + gotica("Plantilla de la Casa"), color: 0xd7ae54,
      description: "Aquí tiene una ficha por cada miembro del personal, siempre al día con la web.\n\n" +
        "⬆️ **Ascender** — le sube al rango siguiente con su nuevo sueldo (desde mañana), le cambia el rol en Discord y se publica su contrato nuevo en el canal de contratos.\n\n" +
        "🚪 **Despedir** — se borra su ficha de la web y pierde la entrada a ella, se le quitan los canales de la casa, queda como visita y recibe una carta avisándole.\n\n" +
        "Ambos botones piden confirmación y solo los puede usar la Dirección.",
      footer: { text: "Señor Harrington · Harrington Gunsmith · Saint Denis, 1880" } }] });
    if (r.ok) { const d = await r.json(); await sb.from("bot_cfg").upsert({ clave: "msg_plantilla", valor: d.id }); await api("PUT", `/channels/${canal}/pins/${d.id}`); }
  }
  const { data: fila } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  const emps = (Array.isArray(fila?.valor) ? fila!.valor : []) as Emp[];
  const { data: hechas } = await sb.from("bot_fichas").select("emp_id,mensaje_id,firma,creada");
  const { data: Md } = await sb.from("bot_medallas").select("emp_id,medalla").order("fecha");
  const { data: Fo } = await sb.from("bot_formacion").select("emp_id,nota,aprobado");
  const MED: Record<string, string[]> = {};
  for (const x of (Md ?? []) as Array<{ emp_id: string; medalla: string }>) (MED[x.emp_id] ||= []).push(x.medalla);
  const FOR = Object.fromEntries(((Fo ?? []) as Array<{ emp_id: string; nota: number; aprobado: boolean }>).filter((x) => x.emp_id).map((x) => [x.emp_id, x]));
  const F = new Map(((hechas ?? []) as Array<{ emp_id: string; mensaje_id: string | null; firma: string; creada: string }>).map((r) => [r.emp_id, r]));
  let n = 0;
  for (const e of emps.filter((x) => x && x.id && x.name)) {
    const cuerpo = ficha(e, MED[e.id] || [], FOR[e.id]), firma = JSON.stringify(cuerpo);
    const f = F.get(e.id);
    if (f && f.firma === firma && f.mensaje_id) continue;
    if (f && !f.mensaje_id && Date.now() - Date.parse(f.creada) < 120000) continue; // otra revisión la está creando
    if (f?.mensaje_id) {
      const r = await api("PATCH", `/channels/${canal}/messages/${f.mensaje_id}`, cuerpo);
      if (r.ok) { await sb.from("bot_fichas").update({ firma }).eq("emp_id", e.id); n++; continue; }
      if (r.status !== 404) continue;
    }
    if (!f) { const { data: ok } = await sb.from("bot_fichas").insert({ emp_id: e.id, firma: "" }).select("emp_id"); if (!ok?.length) continue; }
    else await sb.from("bot_fichas").update({ mensaje_id: null, creada: new Date().toISOString() }).eq("emp_id", e.id);
    const r = await api("POST", `/channels/${canal}/messages`, cuerpo);
    if (r.ok) { const d = await r.json(); await sb.from("bot_fichas").update({ mensaje_id: d.id, firma }).eq("emp_id", e.id); n++; }
    else await sb.from("bot_fichas").delete().eq("emp_id", e.id);
  }
  // quien ya no está en la plantilla: se retira su ficha
  const vivos = new Set(emps.map((e) => e && e.id));
  for (const [id, f] of F) {
    if (vivos.has(id)) continue;
    if (f.mensaje_id) { const r = await api("DELETE", `/channels/${canal}/messages/${f.mensaje_id}`); if (!r.ok && r.status !== 404) continue; }
    await sb.from("bot_fichas").delete().eq("emp_id", id); n++;
  }
  return { cambios: n };
}

// ── mensaje fijo que el Señor Harrington mantiene al día (se crea una vez y se edita solo si cambia) ──
async function fijo(c: Record<string, string>, H: Record<string, string>, canal: string | undefined, clave: string, cuerpo: Record<string, unknown>) {
  if (!canal) return false;
  const firma = JSON.stringify(cuerpo);
  if (c["firma_" + clave] === firma && c[clave]) return false;
  const api = (m: string, ruta: string, b?: unknown) => fetch("https://discord.com/api/v10" + ruta, { method: m, headers: H, body: b === undefined ? undefined : JSON.stringify(b) });
  let id = c[clave];
  if (id) {
    const r = await api("PATCH", `/channels/${canal}/messages/${id}`, cuerpo);
    if (r.status === 404) id = "";
    else if (!r.ok) return false;
  }
  if (!id) {
    const r = await api("POST", `/channels/${canal}/messages`, cuerpo);
    if (!r.ok) return false;
    id = (await r.json()).id;
    await api("PUT", `/channels/${canal}/pins/${id}`);
    await sb.from("bot_cfg").upsert({ clave, valor: id });
  }
  await sb.from("bot_cfg").upsert({ clave: "firma_" + clave, valor: firma });
  return true;
}
type Turno = { name: string; empId: string; start: number };
type Aus = { id: string; empId: string; name: string; start: number; end: number; returned?: boolean; cancelled?: boolean };
async function registros<T>(prefijo: string) {
  const { data } = await sb.from("datos").select("clave,valor").like("clave", prefijo + "%");
  return ((data ?? []) as Array<{ valor: T & { deleted?: boolean } }>).map((r) => r.valor).filter((v) => v && !v.deleted) as T[];
}
// tienda abierta o cerrada (visitas) y panel de fichar y ausencias (personal)
async function paneles(c: Record<string, string>, H: Record<string, string>) {
  const turnos = (await registros<Turno>("fichaje:")).filter((t) => t.empId && t.start).sort((a, b) => a.start - b.start);
  const ahora = Date.now();
  const ausentes = (await registros<Aus>("ausencia:")).filter((a) => !a.cancelled && !a.returned && a.start <= ahora && (!a.end || a.end > ahora));
  const abierto = turnos.length > 0;
  // telegramas de la Dirección para dejar recado con la tienda cerrada (los de las fichas de la web; Vincent, el de la casa)
  const { data: fe } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  const tels = ((Array.isArray(fe?.valor) ? fe!.valor : []) as Array<Record<string, string>>).filter((e) => e && e.puesto === "Jefe")
    .map((e) => ({ n: limpio(e.name, 40), t: limpio(e.telegrama || (e.name === "Vincent Harrington" ? "SD8112" : ""), 12) })).filter((x) => x.t);
  await fijo(c, H, c.canal_estado, "msg_estado", { allowed_mentions: { parse: [] }, components: [], embeds: [{
    title: abierto ? "🟢 " + gotica("Abierto") : "🔴 " + gotica("Cerrado"), color: abierto ? 0x3d8b52 : 0x8b2e25,
    description: abierto
      ? `Las puertas de la Casa Harrington están abiertas. Pase usted.\n\n**Le atienden:** ${turnos.map((t) => limpio(t.name, 40)).join(", ")}\n**Abierto desde las** ${hora(turnos[0].start)}`
      : "Ahora mismo no hay nadie tras el mostrador.\n\nVuelva más tarde o deje un telegrama: le atenderemos en cuanto abramos." + (tels.length ? "\n\n📨 **Telegramas de la Dirección:**\n" + tels.map((x) => `${x.n} · **${x.t}**`).join("\n") : ""),
    footer: { text: "Se pone al día solo con los fichajes · Señor Harrington" } }] });
  await fijo(c, H, c.canal_fichar, "msg_fichar", { allowed_mentions: { parse: [] }, embeds: [{
    title: "🕰 " + gotica("Fichar y Ausencias"), color: ORO,
    description: "**Al empezar a trabajar**, pulse **Entro de turno**. **Al terminar**, pulse **Salgo de turno**. Es lo mismo que fichar en la web.\n\n" +
      "**¿No podrá venir unos días?** Pulse **Avisar una ausencia** y rellene la ficha. Cuando regrese, pulse **He vuelto**.",
    fields: [
      { name: "🛠 En el taller ahora", value: turnos.length ? turnos.map((t) => `${limpio(t.name, 40)} · desde las ${hora(t.start)}`).join("\n") : "Nadie", inline: true },
      { name: "✉️ Ausentes", value: ausentes.length ? ausentes.map((a) => `${limpio(a.name, 40)} · ${a.end ? "hasta el " + fechaMs(a.end) : "sin fecha de vuelta"}`).join("\n") : "Nadie", inline: true },
    ], footer: PIE }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Entro de turno", emoji: { name: "🟢" }, custom_id: "fch:in" },
      { type: 2, style: 2, label: "Salgo de turno", emoji: { name: "🔴" }, custom_id: "fch:out" },
      { type: 2, style: 1, label: "Avisar una ausencia", emoji: { name: "✉️" }, custom_id: "aus:new" },
      { type: 2, style: 2, label: "He vuelto", emoji: { name: "🏠" }, custom_id: "aus:back" },
    ] }] });
  return { abierto, turnos: turnos.length, ausentes: ausentes.length };
}
// lista de precios: se reescribe sola en cuanto cambia un precio o un producto en la web
async function precios(c: Record<string, string>, H: Record<string, string>) {
  return await fijo(c, H, c.canal_precios, "msg_precios", listaPrecios(await catalogo(sb)) as unknown as Record<string, unknown>);
}
// recordatorios para la dirección (en el despacho): cada día a las 10:00 y el domingo a las 17:00 (hora de Madrid)
async function recordatorios(c: Record<string, string>, H: Record<string, string>) {
  const m = madrid(Date.now()), hoy = hoyNum(), clave = `${m.year}-${m.month}-${m.day}`;
  const marcar = async (k: string) => { const { data } = await sb.from("bot_hechos").insert({ clave: k }).select("clave"); return !!data?.length; };
  const post = (embed: Record<string, unknown>) => fetch(`https://discord.com/api/v10/channels/${c.canal_despacho}/messages`, { method: "POST", headers: H, body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{ color: ORO, footer: PIE, ...embed }] }) });
  if (!c.canal_despacho) return null;
  const { data: fe } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  const emps = (Array.isArray(fe?.valor) ? fe!.valor : []) as Array<Record<string, string | number | boolean>>;
  const isoDe = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
  if (+m.hour === 10 && await marcar("diario-" + clave)) {
    const L: string[] = [];
    for (const e of emps) {
      if (e.puesto === "Jefe" || e.fijo || e.sinPrueba || !e.prueba) continue;
      if (e.prueba === isoDe(hoy)) L.push(`📜 El periodo de prueba de **${limpio(e.name, 40)}** termina **hoy**.`);
      else if (e.prueba === isoDe(hoy + 1)) L.push(`📜 El periodo de prueba de **${limpio(e.name, 40)}** termina **mañana**.`);
    }
    const { data: mn } = await sb.from("datos").select("valor").eq("clave", "stockmin").maybeSingle();
    const minimos = (mn?.valor && typeof mn.valor === "object") ? mn.valor as Record<string, number> : {};
    if (Object.keys(minimos).length) {
      const { data: st } = await sb.from("stock").select("producto,cantidad");
      const S = Object.fromEntries(((st ?? []) as Array<{ producto: string; cantidad: number }>).map((r) => [r.producto, r.cantidad]));
      for (const [k, min] of Object.entries(minimos)) if (Number(min) > 0 && Number(S[k] ?? 0) < Number(min)) L.push(`📦 Quedan **${S[k] ?? 0}** de **${k.replace(/^mat:/, "")}** (el mínimo es ${min}).`);
    }
    const aus = await registros<Aus>("ausencia:");
    for (const a of aus) if (!a.cancelled && !a.returned && a.end && hoyNum(a.end) === hoy) L.push(`🏠 **${limpio(a.name, 40)}** debería volver hoy de su ausencia.`);
    if (L.length) await post({ title: "🔔 " + gotica("Recordatorios de Hoy"), description: "Buenos días. Esto es lo que conviene tener presente hoy:\n\n" + L.join("\n") });
  }
  if (m.weekday?.startsWith("dom") && +m.hour === 17 && await marcar("paga-" + clave)) {
    const lunes = hoy - 6;
    const { data: pagos } = await sb.from("datos").select("clave").like("clave", `sueldo-${lunes}-%`);
    const pagados = new Set(((pagos ?? []) as Array<{ clave: string }>).map((r) => r.clave.split("-").slice(2).join("-")));
    const L = emps.filter((e) => Number(e.sueldo) > 0).map((e) => `${pagados.has(String(e.id)) ? "✅" : "⏳"} ${limpio(e.name, 40)} · ${dolar(e.sueldo)}`);
    await post({ title: "💵 " + gotica("Domingo de Paga"), description: "Es domingo: toca pagar los sueldos de la semana en la web (**Dirección → SUELDOS**).\n\n" + (L.join("\n") || "No hay sueldos que pagar.") + "\n\n✅ ya pagado · ⏳ pendiente" });
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor");
  const c: Record<string, string> = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  if (!c.secreto || c.secreto.length < 20 || b.secreto !== c.secreto) return json({ error: "NO" }, 403);
  const H = { Authorization: "Bot " + c.token, "Content-Type": "application/json" };
  const G = c.guild_id;
  let telegramas: unknown = null;
  try { telegramas = await revisarTelegramas(sb, c, H); } catch(e) { telegramas = {error:String(e).slice(0,120)}; console.error("Agenda de telegramas", String(e)); }
  if (b.solo === "telegramas") return json({ok:true,telegramas});
  // fichas de la plantilla (en cada revisión, o al momento tras Ascender o Despedir)
  let pl: unknown = null;
  try { pl = await plantilla(c, H); } catch (e) { pl = { error: String(e).slice(0, 120) }; }
  if (b.solo === "plantilla") return json({ ok: true, plantilla: pl });
  let pa: unknown = null;
  try { pa = await paneles(c, H); } catch (e) { pa = { error: String(e).slice(0, 120) }; }
  if (b.solo === "paneles") return json({ ok: true, paneles: pa });
  try { await precios(c, H); } catch { /* */ }
  try { await recordatorios(c, H); } catch { /* */ }

  // 1 · lista completa de miembros (de 1000 en 1000)
  const todos: Miembro[] = [];
  let after = "0";
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const r = await fetch(`https://discord.com/api/v10/guilds/${G}/members?limit=1000&after=${after}`, { headers: H });
    if (r.status !== 200) return json({ error: "MIEMBROS", st: r.status }, 502);
    const lote = await r.json() as Miembro[];
    todos.push(...lote);
    if (lote.length < 1000) break;
    after = lote[lote.length - 1].user.id;
  }
  const personas = todos.filter((m) => !m.user.bot);
  const { data: antes } = await sb.from("bot_miembros").select("user_id,nombre,avatar");
  type Fila = { user_id: string; nombre: string; avatar: string };
  const previos = new Map<string, Fila>(((antes ?? []) as Fila[]).map((r) => [r.user_id, r]));
  const ahora = new Set(personas.map((m) => m.user.id));
  const filasNuevas = personas.map((m) => ({ user_id: m.user.id, nombre: nombreDe(m), avatar: foto(G, m), entrada: m.joined_at || null, visto: new Date().toISOString() }));

  // primera revisión: se apunta a todos sin saludar a nadie
  if (!previos.size) {
    await sb.from("bot_miembros").upsert(filasNuevas);
    return json({ ok: true, primera: true, miembros: personas.length });
  }
  const post = (canal: string, cuerpo: unknown) => fetch(`https://discord.com/api/v10/channels/${canal}/messages`, { method: "POST", headers: H, body: JSON.stringify(cuerpo) });
  const ch = (k: string) => c[k] ? `<#${c[k]}>` : "su canal";
  let saludos = 0, despedidas = 0;

  // 2 · bienvenidas (solo a quien ha entrado hace poco)
  for (const m of personas) {
    if (previos.has(m.user.id) || saludos >= 5) continue;
    const reciente = !m.joined_at || Date.now() - Date.parse(m.joined_at) < 30 * 60000;
    if (!reciente || !c.canal_bienvenida_puerta) continue;
    const r = await post(c.canal_bienvenida_puerta, {
      content: `<@${m.user.id}>`,
      allowed_mentions: { users: [m.user.id] },
      embeds: [{
        title: "🕯 " + gotica("Bienvenido a la Casa Harrington"),
        color: 0xd7ae54,
        thumbnail: { url: foto(G, m) },
        description: `Suena la campanilla de la puerta: **${nombreDe(m)}** acaba de llegar a Harrington Gunsmith, la armería de Saint Denis.\n\n` +
          `Para entrar, siga estos pasos:\n` +
          `**1.** Lea las normas en ${ch("canal_normativa")} y pulse **Doy mi palabra**.\n` +
          `**2.** En ${ch("canal_seleccion")}, diga si viene **de visita** o **a trabajar**.\n` +
          `**3.** Si viene a trabajar, se le irán abriendo las normas de la casa y, al final, la solicitud de empleo.\n\n` +
          `Sea usted muy bienvenido.`,
        footer: { text: `Es usted la persona n.º ${personas.length} de esta casa · Señor Harrington` },
        timestamp: new Date().toISOString(),
      }],
    });
    if (r.ok) saludos++;
  }

  // 3 · despedidas (solo si la lista ha llegado entera: nunca más de la mitad de golpe)
  const idos = [...previos.keys()].filter((id) => !ahora.has(id));
  if (c.canal_despedidas && idos.length && idos.length <= Math.max(3, previos.size / 2)) {
    for (const id of idos.slice(0, 5)) {
      const p = previos.get(id)!;
      const r = await post(c.canal_despedidas, {
        allowed_mentions: { parse: [] },
        embeds: [{
          title: "🚪 " + gotica("Hasta Siempre"),
          color: 0x6b4c1d,
          thumbnail: p.avatar ? { url: p.avatar } : undefined,
          description: `**${limpio(p.nombre, 60) || "Un viejo conocido"}** ha recogido su sombrero y ha salido por la puerta de la Casa Harrington.\n\n` +
            `Gracias por el tiempo compartido. Le deseamos buen camino y mejor fortuna; si algún día vuelve por Saint Denis, aquí encontrará siempre la puerta abierta.`,
          footer: { text: "Señor Harrington · Harrington Gunsmith · Saint Denis, 1880" },
          timestamp: new Date().toISOString(),
        }],
      });
      if (r.ok) { despedidas++; await sb.from("bot_miembros").delete().eq("user_id", id); }
    }
  }
  // 4 · se guarda la lista nueva (nombres y fotos al día)
  await sb.from("bot_miembros").upsert(filasNuevas);
  if (saludos || despedidas) await sb.from("bot_registro").insert({ metodo: "PUERTA", ruta: "/bienvenidas", motivo: `${saludos} bienvenidas, ${despedidas} despedidas`, estado: 200 });
  return json({ ok: true, miembros: personas.length, saludos, despedidas });
});
