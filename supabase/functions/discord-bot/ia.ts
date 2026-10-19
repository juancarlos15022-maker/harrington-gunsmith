// HARRINGTON GUNSMITH · V3 · El Señor Harrington con IA (dentro de discord-bot)
// La misma IA que la web (harrington-ai, modo «interno» con la contraseña de bot_cfg). Aquí se preparan los DATOS desde la
// base de datos según quién pregunta: la plantilla ve lo del taller; solo el Jefe ve cuentas y personal.
// La IA solo ESCRIBE: nunca vende, fabrica ni cambia nada. Lo que haya que hacer se hace con las órdenes o en la web.
//   · /harrington pregunta — le pregunta lo que quiera sobre la casa (🔒 solo le contesta a usted)
//   · mencionarle (@Sr Harrington) en los canales del personal — contesta allí; en un canal que ven las visitas, por carta
//   · /resumen [horas] — lo que ha pasado en este canal mientras estaba fuera (🔒)
//   · /redactar — telegrama a un cliente o proveedor, aviso de un encargo o anuncio, listo para copiar (🔒)
//   · crónica: parte de la mañana redactado por la IA y banco de preguntas nuevas para el examen (sacadas del Tutorial)
// Cada conversación queda en ia_charla (la misma que la web): lo que le pregunta aquí lo ve luego en la web, y al revés.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { catalogo, dolar, fecha, hora, hoyNum, limpio, madrid, medianoche, ORO, PIE } from "./comun.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const efimero = (content: string, extra: Record<string, unknown> = {}) => json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra } });
type C = Record<string, string>;
// deno-lint-ignore no-explicit-any
type Any = any;
const IA_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/harrington-ai";
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const diaSem = (n: number) => new Date(n * 86400000).getUTCDay();
const NO_IA = "Disculpe usted: ahora mismo no consigo ordenar mis ideas (la IA no responde). Inténtelo dentro de un momento.";

async function api(c: C, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: { Authorization: "Bot " + c.token, "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const t = await r.text();
  try { return { st: r.status, d: t ? JSON.parse(t) : null }; } catch { return { st: r.status, d: t }; }
}
async function valor(clave: string) { const { data } = await sb.from("datos").select("valor").eq("clave", clave).maybeSingle(); return data?.valor as Any; }
async function lista(prefijo: string) {
  const { data } = await sb.from("datos").select("valor").like("clave", prefijo + "%");
  return ((data ?? []) as Array<{ valor: Any }>).map((r) => r.valor).filter((v) => v && !v.deleted);
}
export const empleados = async () => { const v = await valor("empleados"); return (Array.isArray(v) ? v : []) as Array<Record<string, Any>>; };
const cobrado = (r: Any) => r.op === "encargo" ? Number(r.totalCents || 0) - Number(r.dueCents || 0) : Number(r.dueCents || 0);
async function ventasDe(dias: number[]) {
  const out: Any[] = [];
  for (let k = 0; k < dias.length; k += 10) {
    const pat = dias.slice(k, k + 10).map((d) => { const x = new Date(d * 86400000); return `clave.like.venta:HG-${String(x.getUTCDate()).padStart(2, "0")}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCFullYear()).slice(2)}-*`; });
    const { data } = await sb.from("datos").select("valor").or(pat.join(","));
    for (const r of (data ?? []) as Array<{ valor: Any }>) if (r.valor && !r.valor.deleted && !r.valor.voided) out.push(r.valor);
  }
  return out;
}

// ── la llamada a la IA ──
export async function ia(c: C, tarea: string, datos: unknown, extra = "", o: { jefe?: boolean; quien?: string; emp_id?: string; historial?: Array<{ r: string; t: string }> } = {}) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(IA_URL, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-hg-secreto": c.secreto },
      body: JSON.stringify({ accion: "interno", tarea, datos, extra, jefe: !!o.jefe, quien: o.quien || "", emp_id: o.emp_id || "", historial: o.historial || [] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.texto) return { error: String(j?.error || r.status) };
    return { texto: String(j.texto) };
  } catch { return { error: "IA_CAIDA" }; } finally { clearTimeout(to); }
}

// ── la conversación compartida con la web (ia_charla) ──
export async function charla(empId: string, n = 8) {
  const { data } = await sb.from("ia_charla").select("rol,texto").eq("emp_id", empId).order("id", { ascending: false }).limit(n);
  return ((data ?? []) as Array<{ rol: string; texto: string }>).reverse().map((x) => ({ r: x.rol, t: x.texto }));
}
export async function apuntar(empId: string, nombre: string, origen: string, pregunta: string, respuesta: string) {
  await sb.from("ia_charla").insert([{ emp_id: empId, emp: nombre, origen, rol: "u", texto: pregunta.slice(0, 600) }, { emp_id: empId, emp: nombre, origen, rol: "a", texto: respuesta.slice(0, 1500) }]);
}

// ── el estado de la casa para la IA (según quién pregunta) ──
export const ORDENES_IA: Array<[string, string, boolean?]> = [
  ["/precio", "precio de un artículo"], ["/stock", "existencias de un artículo"], ["/encargos", "encargos pendientes"], ["/cliente", "ficha de un cliente"],
  ["/pedidos", "pedidos a proveedores y botón «Recibido entero»"], ["/mis-horas", "horas de la semana y sueldo"], ["/examen", "examen de la casa"],
  ["/redactar", "telegrama a un cliente o proveedor, aviso de encargo o anuncio"], ["/resumen", "resumen de lo que ha pasado en un canal"],
  ["/caja", "lo cobrado y gastado", true], ["/compra", "apuntar una compra a un particular", true], ["/agenda", "contactos de la casa", true], ["/se-busca", "cartel de Se busca", true],
];
export async function estado(jefe: boolean, pregunta = "") {
  const ahora = Date.now(), hoy = hoyNum(), lunes = hoy - ((diaSem(hoy) + 6) % 7);
  const [{ data: st }, cat, E, encs, peds, aus, fich, V, cl, prov, tutRow] = await Promise.all([
    sb.from("stock").select("producto,cantidad,minimo"), catalogo(sb), empleados(), lista("encargo:"), lista("pedido:"), lista("ausencia:"), lista("fichaje:"),
    ventasDe(Array.from({ length: hoy - lunes + 1 }, (_, k) => lunes + k)), valor("clientes"), valor("proveedores"),
    /como|cómo|donde|dónde|web|boton|botón|apartado|se hace|tutorial/i.test(pregunta) ? sb.from("ia_cfg").select("valor").eq("clave", "tutorial").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const S = (st ?? []) as Array<{ producto: string; cantidad: number; minimo: number | null }>;
  const prod = S.filter((x) => !x.producto.startsWith("mat:"));
  const mats = S.filter((x) => x.producto.startsWith("mat:")).map((x) => ({ material: x.producto.slice(4), cantidad: x.cantidad, minimo: x.minimo || 0 }));
  const precio: Record<string, number> = Object.fromEntries(cat.map((p) => [p.nombre, p.precio]));
  const hoyV = V.filter((r) => r.date === fecha(ahora)), art: Record<string, number> = {};
  for (const r of V) for (const x of r.items || []) art[x.name] = (art[x.name] || 0) + Number(x.qty || 0);
  const nombreDe = (id: string) => (E.find((e) => e.id === id) || {}).name || "";
  const pq = norm(pregunta);
  const clientes = (Array.isArray(cl) ? cl : []) as Array<Record<string, Any>>;
  const mencionados = clientes.filter((x) => x?.name && norm(x.name).length > 2 && (pq.includes(norm(x.name)) || norm(x.name).split(" ").some((w) => w.length > 3 && pq.includes(w)))).slice(0, 3);
  const d: Record<string, unknown> = {
    ahora: `${fecha(ahora)} ${hora(ahora)} (hora de Madrid)`,
    catalogo_con_existencias: prod.map((x) => ({ producto: x.producto, precio: precio[x.producto] != null ? dolar(precio[x.producto]) : "", stock: x.cantidad, minimo: x.minimo || 0 })),
    materiales: mats,
    bajo_minimo: [...prod.filter((x) => (x.minimo || 0) > 0 && x.cantidad < (x.minimo || 0)).map((x) => `${x.producto} (${x.cantidad}/${x.minimo})`), ...mats.filter((x) => x.minimo > 0 && x.cantidad < x.minimo).map((x) => `${x.material} (${x.cantidad}/${x.minimo})`)],
    agotados: prod.filter((x) => x.cantidad <= 0).map((x) => x.producto),
    encargos_pendientes: encs.filter((e) => !e.finished && !e.cancelled).slice(0, 25).map((e) => ({ cliente: e.client, productos: (e.items || []).map((x: Any) => x.qty + " × " + x.name).join(", "), estado: e.fab === "FABRICADO" ? (e.avisado ? "fabricado, cliente avisado" : "fabricado, FALTA AVISAR") : "por fabricar", fianza: e.depositCents ? dolar(e.depositCents) : "", pendiente: e.pendingCents ? dolar(e.pendingCents) : "" })),
    pedidos_pendientes: peds.filter((p) => !p.cancelled && !p.received && !p.completedAt).slice(0, 20).map((p) => ({ pedido: p.code, proveedor: p.proveedor, materiales: (p.items || []).map((x: Any) => x.qty + " × " + x.material + (x.rq ? ` (llegadas ${x.rq})` : "")).join(", "), pagado: p.paid ? "sí" : "no", emitido: p.date })),
    ausencias: aus.filter((a) => !a.cancelled && !a.returned && (!a.end || a.end > ahora)).map((a) => ({ empleado: a.name, desde: fecha(a.start), hasta: a.end ? fecha(a.end) : "sin fecha", ahora: a.start <= ahora ? "ausente" : "próxima" })),
    fichados_ahora: fich.filter((f) => f.empId).map((f) => nombreDe(f.empId)).filter(Boolean),
    ventas_hoy: { numero: hoyV.length, cobrado: jefe ? dolar(hoyV.reduce((a, r) => a + cobrado(r), 0)) : undefined },
    lo_mas_vendido_semana: Object.entries(art).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, q]) => `${n} (${q})`),
    plantilla: E.map((e) => ({ nombre: e.name, puesto: e.puesto })),
    proveedores: (Array.isArray(prov) ? prov : []).map((p: Any) => ({ nombre: p.name, tipo: p.tipo || "", vende: (p.prods || []).map((x: Any) => `${x.name} ($${Number(x.price || 0).toFixed(2)})`).slice(0, 15), ubicacion: p.ubic || "" })),
    ordenes_discord: ORDENES_IA.filter((o) => jefe || !o[2]).map((o) => `${o[0]}: ${o[1]}`),
    numero_de_clientes: clientes.length,
  };
  if (mencionados.length) d.clientes_mencionados = mencionados.map((x) => ({ nombre: x.name, telegrama: x.telegram || x.tel || "", tipo: x.type || "", armas: (x.series || []).map((s: Any) => `${s.a || "arma"} n.º ${s.s}${s.ic === false ? " (SIN REGISTRAR IC)" : ""}`).slice(0, 10), se_busca: x.sebusca ? "sí" : undefined, notas: limpio(x.notes || x.nota || "", 200) }));
  if (jefe) {
    const { data: G } = await sb.from("datos").select("valor").like("clave", "gasto:%");
    const g = ((G ?? []) as Array<{ valor: Any }>).map((r) => r.valor).filter((x) => x && !x.deleted && Number(x.day) >= lunes);
    const H: Record<string, number> = {};
    for (const t of await lista("turno:")) if (t.start >= medianoche(lunes)) H[t.name] = (H[t.name] || 0) + Math.max(0, (t.end || ahora) - t.start);
    d.cuentas_semana = { desde: fecha(medianoche(lunes)), ventas: V.length, cobrado: dolar(V.reduce((a, r) => a + cobrado(r), 0)), gastos: dolar(g.reduce((a, x) => a + Number(x.cents || 0), 0)), gastos_por_tipo: Object.entries(g.reduce((m: Record<string, number>, x) => { m[x.cat || "otros"] = (m[x.cat || "otros"] || 0) + Number(x.cents || 0); return m; }, {})).map(([k, v]) => `${k}: ${dolar(v)}`) };
    d.personal_semana = E.map((e) => ({ nombre: e.name, puesto: e.puesto, horas: Math.round((H[e.name] || 0) / 360000) / 10, horas_que_le_tocan: Number(e.horas || 10), ventas: V.filter((r) => r.employee === e.name).length }));
  }
  const tut = (tutRow as Any)?.data?.valor;
  if (tut) {
    try {
      const T = JSON.parse(tut) as { caps: Array<{ t: string; jefe: boolean; txt: string }> };
      const w = pq.split(" ").filter((x) => x.length > 3);
      const sc = T.caps.filter((x) => jefe || !x.jefe).map((x) => ({ x, s: w.reduce((a, k) => a + (norm(x.t).includes(k) ? 4 : 0) + (norm(x.txt).includes(k) ? 1 : 0), 0) })).sort((a, b) => b.s - a.s);
      d.tutorial = sc.slice(0, 2).map((y) => ({ capitulo: y.x.t, texto: y.x.txt.slice(0, 2500) }));
    } catch { /* */ }
  }
  return d;
}

// ── quién es (empleado de la web enlazado con su Discord) ──
async function quienEs(uid: string) {
  const e = (await empleados()).find((x) => x && x.discord === uid);
  return e ? { id: String(e.id), nombre: String(e.name || ""), jefe: uid === "1398183011232518164" } : null;
}
// responde a una pregunta y la apunta en la conversación compartida
async function contestar(c: C, yo: { id: string; nombre: string; jefe: boolean }, texto: string, origen: string) {
  const [datos, hist] = await Promise.all([estado(yo.jefe, texto), charla(yo.id)]);
  const r = await ia(c, "discord_pregunta", datos, texto, { jefe: yo.jefe, quien: yo.nombre, emp_id: yo.id, historial: hist });
  if ("error" in r) return r.error === "DEMASIADAS" ? "Con calma, se lo ruego: deme un minuto entre tantas preguntas." : NO_IA;
  await apuntar(yo.id, yo.nombre, origen, texto, r.texto).catch(() => {});
  return r.texto;
}

// ── órdenes con IA: /harrington, /resumen, /redactar ──
// Discord da 3 segundos para contestar y la IA tarda más: se contesta «pensando…» y el trabajo lo hace una llamada aparte
// a esta misma función (modo «ia»), que cambia luego el mensaje con el resultado.
export type CtxIA = { i: Any; c: C; user: Any; yoNombre: string; orden: string; opt: (n: string) => unknown; esPersonal: boolean };
const encargar = (c: C, trabajo: string, i: Any) => encargarCon(c, trabajo, i, {});
async function encargarCon(c: C, trabajo: string, i: Any, extra: Record<string, unknown>) {
  const cuerpo = { ...extra, trabajo, i: { token: i.token, channel_id: i.channel_id, channel: { name: i.channel?.name || "" }, data: i.data, member: i.member, user: i.user } };
  const p = fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/discord-bot", { method: "POST", headers: { "Content-Type": "application/json", "x-hg-secreto": c.secreto, "x-hg-modo": "ia" }, body: JSON.stringify(cuerpo) }).catch(() => null);
  await Promise.race([p, new Promise((r) => setTimeout(r, 700))]);
}
export async function atenderIA(x: CtxIA): Promise<Response | null> {
  const { i, c, user, orden, opt } = x;
  if (i.type !== 2 || !["harrington", "resumen", "redactar"].includes(orden)) return null;
  if (!x.esPersonal) return efimero("Con mucho gusto le atendería, pero mis consejos son solo para la plantilla de la casa. 🎩");
  const yo = await quienEs(user.id);
  if (!yo) return efimero("Aún no tiene su Discord enlazado con su ficha de la web. Pida a la Dirección que lo enlace (web → Dirección → Empleados).");
  if (orden === "harrington" && !limpio(opt("pregunta"), 500)) return efimero("Dígame qué desea saber.");
  await encargar(c, orden, i);
  return json({ type: 5, data: { flags: 64 } });
}
// el trabajo de verdad (modo «ia»): se espera a la IA y se cambia el mensaje «pensando…»
export async function tareaIA(req: Request): Promise<Response> {
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor");
  const c: C = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  if (!c.secreto || req.headers.get("x-hg-secreto") !== c.secreto) return json({ error: "NO" }, 403);
  let b: Any = {};
  try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const i = b.i || {}, user = i.member?.user || i.user || {};
  const opt = (n: string) => ((i.data?.options || []) as Array<{ name: string; value: unknown }>).find((o) => o.name === n)?.value;
  const fin = (content: string, embeds?: unknown[]) => fetch(`https://discord.com/api/v10/webhooks/${c.app_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: content.slice(0, 1990), embeds: embeds || [], allowed_mentions: { parse: [] } }) });
  const tarjeta = (titulo: string, t: string) => [{ title: titulo, color: ORO, description: t.slice(0, 4000), footer: PIE }];
  const yo = await quienEs(user.id);
  const por = yo?.nombre || limpio(i.member?.nick || user.global_name || user.username, 60);
  try {
    if (b.trabajo === "harrington" && yo) {
      const q = limpio(opt("pregunta"), 500);
      const t = await contestar(c, yo, q, "discord");
      await fin("", tarjeta("🎩 " + q.slice(0, 240), t));
    } else if (b.trabajo === "resumen" && yo) {
      const horas = Math.max(1, Math.min(72, Number(opt("horas")) || 12));
      const desde = Date.now() - horas * 3600000, M: Any[] = [];
      let antes = "";
      for (let k = 0; k < 3; k++) {
        const r = await api(c, "GET", `/channels/${i.channel_id}/messages?limit=100${antes ? "&before=" + antes : ""}`);
        if (r.st >= 300 || !Array.isArray(r.d) || !r.d.length) break;
        M.push(...r.d); antes = r.d[r.d.length - 1].id;
        if (Date.parse(r.d[r.d.length - 1].timestamp) < desde) break;
      }
      const L = M.filter((m) => Date.parse(m.timestamp) >= desde).reverse().map((m) => {
        const em = (m.embeds || []).map((e: Any) => [e.title, e.description, ...(e.fields || []).map((f: Any) => f.name + ": " + f.value)].filter(Boolean).join(" · ")).join(" | ");
        return { autor: m.author?.global_name || m.author?.username || "?", hora: hora(Date.parse(m.timestamp)), texto: limpio(((m.content || "") + (em ? " " + em : "")).replace(/\s+/g, " "), 400) };
      }).filter((m) => m.texto);
      if (!L.length) await fin(`No ha habido mensajes en este canal en las últimas ${horas} horas.`);
      else {
        const r = await ia(c, "discord_resumen", { canal: i.channel?.name || "", horas, mensajes: L.slice(-150) }, "", { jefe: yo.jefe, quien: yo.nombre, emp_id: yo.id });
        await fin("", tarjeta(`📋 Lo que ha pasado aquí · últimas ${horas} h (${L.length} mensajes)`, "error" in r ? NO_IA : r.texto));
      }
    } else if (b.trabajo === "redactar" && yo) {
      await redactarTrabajo(c, yo, opt, fin);
    } else if (b.trabajo === "avs_ped") {
      const r = await proponerPedido(c, String(b.material || ""), por);
      await fin(r.err ? r.err : `✅ Propuesta preparada: **${r.a!.titulo}**. Está aquí mismo, en el despacho, para aprobarla.`);
      if (!r.err) await cronAprobaciones(c);
    } else if (b.trabajo === "avs_fab") {
      const d = await estado(!!yo?.jefe);
      d.recetas = (await valor("recetas")) || {};
      const r = await ia(c, "discord_pregunta", d, `¿Qué conviene fabricar hoy? ${limpio(b.producto, 80)} está bajo mínimo. Dime qué fabricar y cuántas unidades, comprobando en «recetas» y «materiales» que hay material suficiente.`, { jefe: !!yo?.jefe, quien: por, emp_id: yo?.id || "discord" });
      await fin("", [{ title: "🛠 Qué fabricar hoy", color: ORO, description: ("error" in r ? NO_IA : r.texto).slice(0, 4000), footer: { text: "Fabríquelo en la web: botón FABRICACIÓN · Señor Harrington" } }]);
    } else await fin("No he podido atenderle: no le encuentro en la plantilla de la web.");
  } catch (e) {
    await fin("Disculpe usted: algo ha fallado al prepararlo (" + String((e as Error)?.message || e).slice(0, 80) + "). Inténtelo de nuevo.").catch(() => null);
  }
  return json({ ok: true });
}
async function redactarTrabajo(c: C, yo: { id: string; nombre: string; jefe: boolean }, opt: (n: string) => unknown, fin: (t: string) => Promise<unknown>) {
  const tipo = String(opt("tipo") || "cliente"), para = limpio(opt("para"), 80), ind = limpio(opt("indicacion"), 400);
  let tarea = "telegrama", datos: Record<string, unknown> = {};
  if (tipo === "proveedor") {
    const P = ((await valor("proveedores")) || []) as Any[], p = P.find((v) => norm(v.name).includes(norm(para))) || P.find((v) => norm(para).includes(norm(v.name).split(" ")[0]));
    const peds = (await lista("pedido:")).filter((x) => !x.cancelled && !x.received && (!p || x.proveedor === p.name));
    tarea = "telegrama_proveedor";
    datos = { proveedores: p ? [{ nombre: p.name, tipo: p.tipo || "", telegrama: p.tel || "" }] : [{ nombre: para }], pedidos_pendientes: peds.map((x) => ({ pedido: x.code, materiales: (x.items || []).map((y: Any) => y.qty + " × " + y.material).join(", "), emitido: x.date })), materiales: (await estado(false)).materiales };
  } else if (tipo === "encargo") {
    const E = (await lista("encargo:")).filter((e) => !e.finished && !e.cancelled && (!para || norm(e.client).includes(norm(para))));
    const e = E.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    if (!e) { await fin(`No encuentro ningún encargo pendiente${para ? " de **" + para + "**" : ""}.`); return; }
    tarea = "telegrama_encargo";
    datos = { cliente: e.client, telegrama: e.telegram || "", productos: (e.items || []).map((y: Any) => y.qty + " × " + y.name).join(", "), total: dolar(e.totalCents || 0), anticipo: dolar(e.depositCents || 0), pendiente: dolar(e.pendingCents || 0), tipo: /recuerd/i.test(ind) ? "recordatorio" : e.fab === "FABRICADO" ? "aviso" : "confirmacion" };
  } else if (tipo === "anuncio") {
    tarea = "anuncio_evento";
    datos = { evento: { titulo: para, detalles: ind }, eventos_activos: (await lista("evento:")).filter((e: Any) => e.status === "activo").map((e: Any) => ({ tipo: e.tipo || "sorteo", premio: e.arma || "", termina: e.end ? fecha(e.end) : "", nota: e.nota || "" })) };
  } else {
    const cl = ((await valor("clientes")) || []) as Any[], x = cl.find((v) => norm(v.name) === norm(para)) || cl.find((v) => para && norm(v.name).includes(norm(para)));
    datos = { persona: x ? { nombre: x.name, telegrama: x.telegram || x.tel || "", tipo: x.type || "" } : { nombre: para || "el cliente" } };
  }
  const r = await ia(c, tarea, datos, ind || "", { jefe: yo.jefe, quien: yo.nombre, emp_id: yo.id });
  if ("error" in r) { await fin(NO_IA); return; }
  await fin("Aquí lo tiene, listo para copiar y mandar por telegrama:\n```\n" + r.texto.replace(/```/g, "'''").slice(0, 1800) + "\n```");
}

// ── menciones en los canales: cada minuto, desde la crónica ──
const VER = 1n << 10n;
async function esPrivado(c: C, canal: string) {
  const r = await api(c, "GET", `/channels/${canal}`);
  const ow = (r.d?.permission_overwrites || []) as Array<{ id: string; allow: string; deny: string }>;
  const todos = ow.find((o) => o.id === c.guild_id), vis = ow.find((o) => o.id === c.rol_visitante);
  const todosNo = !!todos && (BigInt(todos.deny || "0") & VER) === VER;
  const visSi = !!vis && (BigInt(vis.allow || "0") & VER) === VER;
  return todosNo && !visSi;
}
export async function menciones(c: C) {
  const canales = [...new Set((c.canales_ia || [c.canal_charla_ic, c.canal_despacho, c.canal_turnos, c.canal_encargos, c.canal_pedidos, c.canal_aprendiz, c.canal_ooc].filter(Boolean).join(",")).split(",").map((x) => x.trim()).filter((x) => /^\d{15,22}$/.test(x)))];
  const yo = c.app_id, out: string[] = [];
  let atendidas = 0;
  for (const canal of canales) {
    const k = "ia_ult_" + canal, ult = c[k];
    const r = await api(c, "GET", `/channels/${canal}/messages?limit=20${ult ? "&after=" + ult : ""}`);
    if (r.st >= 300 || !Array.isArray(r.d)) { out.push(canal + ":" + r.st); continue; }
    const L = (r.d as Any[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    if (L.length) { await sb.from("bot_cfg").upsert({ clave: k, valor: L[L.length - 1].id }); c[k] = L[L.length - 1].id; }
    if (!ult) continue; // primera vez: se apunta dónde va el canal y no se contesta a lo antiguo
    const M = L.filter((m) => !m.author?.bot && !m.webhook_id && ((m.mentions || []).some((u: Any) => u.id === yo) || m.referenced_message?.author?.id === yo && /harrington/i.test(m.content || "")));
    let priv: boolean | null = null;
    for (const m of M) {
      if (atendidas >= 5) break;
      atendidas++;
      const q = limpio(String(m.content || "").replace(new RegExp(`<@!?${yo}>`, "g"), ""), 500);
      const ref = { message_reference: { message_id: m.id, fail_if_not_exists: false }, allowed_mentions: { parse: [], replied_user: true } };
      const quien = await quienEs(m.author.id);
      if (!quien) { await api(c, "POST", `/channels/${canal}/messages`, { content: "Con mucho gusto le atendería, pero mis consejos son solo para la plantilla de la casa. 🎩", ...ref }); continue; }
      if (!q) { await api(c, "POST", `/channels/${canal}/messages`, { content: `Dígame, ${limpio(quien.nombre.split(" ")[0], 30)}: ¿en qué puedo servirle?`, ...ref }); continue; }
      if (priv === null) priv = await esPrivado(c, canal);
      await api(c, "POST", `/channels/${canal}/typing`);
      const t = await contestar(c, quien, q, "discord");
      if (priv) await api(c, "POST", `/channels/${canal}/messages`, { embeds: [{ color: ORO, description: t.slice(0, 4000), footer: PIE }], ...ref });
      else {
        // canal que ven las visitas: la respuesta va por carta, para no enseñar datos de la casa
        const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: m.author.id });
        const ok = dm.d?.id ? (await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: `🎩 Sobre lo que me preguntó en <#${canal}>: «${q.slice(0, 200)}»`, embeds: [{ color: ORO, description: t.slice(0, 4000), footer: PIE }] })).st < 300 : false;
        await api(c, "POST", `/channels/${canal}/messages`, { content: ok ? "Le contesto por carta, que aquí nos leen las visitas. 📨" : "Aquí nos leen las visitas: pregúnteme con **/harrington** y le contesto solo a usted.", ...ref });
      }
    }
  }
  return { canales: canales.length, atendidas, errores: out.join(" ") };
}

// ── parte de la mañana (9:30) y banco de preguntas del examen ──
export async function parteManana(c: C, marcar: (k: string) => Promise<boolean>) {
  const m = madrid(Date.now());
  if (+m.hour !== 9 || +m.minute < 30 || !c.canal_turnos) return "no toca";
  if (!(await marcar(`parte-ia-${m.year}-${m.month}-${m.day}`))) return "hecho";
  const d = await estado(false);
  const { data: o } = await sb.from("datos").select("valor").eq("clave", "cfg:objetivo").maybeSingle();
  if ((o?.valor as Any)?.cents) d.objetivo_semana = dolar((o!.valor as Any).cents);
  const r = await ia(c, "discord_parte", d, "", { quien: "Señor Harrington", emp_id: "discord" });
  if ("error" in r) return r.error;
  await api(c, "POST", `/channels/${c.canal_turnos}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "☕ Parte de la mañana", color: ORO, description: r.texto.slice(0, 4000), footer: PIE }] });
  return "ok";
}
export type Pregunta = { q: string; o: string[]; k: number };
export async function bancoExamen(c: C) {
  const { data } = await sb.from("ia_cfg").select("clave,valor").in("clave", ["tutorial", "banco_examen"]);
  const m = Object.fromEntries(((data ?? []) as Array<{ clave: string; valor: string }>).map((r) => [r.clave, r.valor]));
  if (!m.tutorial) return "sin tutorial";
  let B: { ts: number; v: string; P: Pregunta[] } = { ts: 0, v: "", P: [] };
  try { if (m.banco_examen) B = JSON.parse(m.banco_examen); } catch { /* */ }
  const T = JSON.parse(m.tutorial) as { v: string; caps: Array<{ t: string; jefe: boolean; txt: string }> };
  if (B.v === T.v && B.P.length >= 24 && Date.now() - B.ts < 3 * 86400000) return "al día";
  const caps = T.caps.filter((x) => !x.jefe).sort(() => Math.random() - 0.5).slice(0, 4).map((x) => ({ capitulo: x.t, texto: x.txt.slice(0, 2200) }));
  const r = await ia(c, "examen_preguntas", { cuantas: 8, capitulos: caps, normas: ["Trato correcto y profesional con los clientes", "Las armas vendidas se apuntan con su número de serie en la ficha del cliente", "Los encargos se avisan por telegrama y hay 10 días para recogerlos"] }, "", { quien: "Señor Harrington", emp_id: "discord" });
  if ("error" in r) return r.error;
  let N: Pregunta[] = [];
  try {
    const j = JSON.parse(r.texto.replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim());
    N = (Array.isArray(j) ? j : []).filter((p: Any) => p && typeof p.q === "string" && Array.isArray(p.o) && p.o.length === 3 && p.o.every((x: Any) => typeof x === "string" && x.trim()) && Number.isInteger(p.k) && p.k >= 0 && p.k < 3)
      .map((p: Any) => ({ q: limpio(p.q, 240), o: p.o.map((x: string) => limpio(x, 80)), k: p.k })).filter((p: Pregunta) => p.q && new Set(p.o.map(norm)).size === 3);
  } catch { return "json"; }
  if (!N.length) return "vacío";
  const P = (B.v === T.v ? B.P : []).concat(N).filter((p, k, a) => a.findIndex((y) => norm(y.q) === norm(p.q)) === k).slice(-60);
  await sb.from("ia_cfg").upsert({ clave: "banco_examen", valor: JSON.stringify({ ts: Date.now(), v: T.v, P }) }, { onConflict: "clave" });
  return "nuevas " + N.length;
}
export async function preguntasDelBanco(n: number): Promise<Pregunta[]> {
  try {
    const { data } = await sb.from("ia_cfg").select("valor").eq("clave", "banco_examen").maybeSingle();
    const B = data?.valor ? JSON.parse(data.valor) as { P: Pregunta[] } : { P: [] };
    return [...B.P].sort(() => Math.random() - 0.5).slice(0, n).map((p) => { const ord = [0, 1, 2].sort(() => Math.random() - 0.5); return { q: p.q, o: ord.map((k) => p.o[k]), k: ord.indexOf(p.k) }; });
  } catch { return []; }
}

// ════════ En común con la web: aprobaciones, avisos con botón, informe del lunes y encargo listo ════════
// Una aprobación es un registro «aprobacion:<id>» en la base de datos (lo crea la web o el propio Harrington):
//   { id, tipo: "pedido" | "precio", titulo, resumen, propuesta, por, ts, estado: pendiente → aprobada/rechazada → hecha/fallida }
// Sale en el despacho de la Dirección con «Aprobar» / «Rechazar». Solo se aplica si alguien de Dirección la aprueba
// (aquí o en la web) y se aplica con la misma forma de guardar que la web; todo queda en el registro de cambios.
const u36 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
async function guardar(filas: Array<[string, unknown]>) {
  const t = new Date().toISOString();
  const { error } = await sb.from("datos").upsert([...filas.map(([clave, valor]) => ({ clave, valor, actualizado: t })), { clave: "rev", valor: { n: Date.now() + "-" + Math.random().toString(36).slice(2, 6) }, actualizado: t }], { onConflict: "clave" });
  if (error) throw new Error(error.message);
}
async function auditar(quien: string, cat: string, linea: string) {
  const now = Date.now(), id = "d" + now.toString(36) + Math.random().toString(36).slice(2, 5);
  await sb.from("datos").insert({ clave: "log:" + id, valor: { id, ts: now, who: quien || "Discord", cat, lines: [linea + " (desde Discord)"] }, actualizado: new Date().toISOString() });
}
const MAT_ALIAS: Record<string, string> = { "mena de hierro": "Hierro", "menas de hierro": "Hierro", "mena de carbon": "Carbón", "menas de carbon": "Carbón", "tablones": "Tabla de madera", "tablon": "Tabla de madera", "tablas de madera": "Tabla de madera", "trozo madera": "Trozo de madera", "trozos de madera": "Trozo de madera" };
const delAlmacen = (n: string) => MAT_ALIAS[norm(n)] || n;
const madridParts = (ms: number) => { const m = madrid(ms); return { day: m.day, month: m.month, year: m.year, hour: m.hour, minute: m.minute }; };

function tarjetaAprobacion(a: Any) {
  const abierta = a.estado === "pendiente";
  const est: Record<string, string> = { aprobada: "✅ Aprobada", rechazada: "✖️ Rechazada", hecha: "✅ Aprobada y aplicada", fallida: "⚠️ Aprobada, pero no se pudo aplicar" };
  return {
    allowed_mentions: { parse: [] },
    embeds: [{ title: (a.tipo === "pedido" ? "🚂 " : "🏷️ ") + "Para aprobar · " + limpio(a.titulo, 180), color: abierta ? ORO : a.estado === "rechazada" ? 0x6b4c1d : a.estado === "fallida" ? 0x8b2e25 : 0x3d8b52,
      description: limpio(a.resumen || "", 3500) + (a.tipo === "pedido" ? `\n\n${(a.propuesta?.items || []).map((x: Any) => `• ${x.qty} × ${limpio(x.material, 50)} a ${dolar(x.price)}`).join("\n")}\n**Total:** ${dolar((a.propuesta?.items || []).reduce((s: number, x: Any) => s + x.qty * x.price, 0))} · ${limpio(a.propuesta?.proveedor, 60)}` : a.tipo === "precio" ? `\n\n${(a.propuesta?.cambios || []).map((x: Any) => `• ${limpio(x.producto, 60)}: ${x.de != null ? "$" + Number(x.de).toFixed(2) : "—"} → **$${Number(x.a).toFixed(2)}**`).join("\n")}` : ""),
      footer: { text: abierta ? `Propuesto por ${a.por || "Harrington"} · solo la Dirección puede aprobarlo · Señor Harrington` : `${est[a.estado] || a.estado} por ${a.decide || "—"}${a.resultado ? " · " + limpio(a.resultado, 120) : ""}` } }],
    components: abierta ? [{ type: 1, components: [{ type: 2, style: 3, label: "Aprobar", emoji: { name: "✅" }, custom_id: "apr:si:" + a.id }, { type: 2, style: 4, label: "Rechazar", custom_id: "apr:no:" + a.id }] }] : [],
  };
}
// aplica una aprobación ya aprobada (lo mismo que haría la web)
async function aplicar(a: Any, por: string) {
  try {
    if (a.tipo === "pedido") {
      const P = ((await valor("proveedores")) || []) as Any[], prov = P.find((p) => p.id === a.propuesta?.proveedorId) || P.find((p) => p.name === a.propuesta?.proveedor);
      const items = (a.propuesta?.items || []).map((x: Any) => ({ material: limpio(x.material, 60), qty: Math.floor(Number(x.qty)), price: Math.round(Number(x.price)) })).filter((x: Any) => x.material && x.qty > 0 && x.qty <= 100000 && x.price > 0);
      if (!prov || !items.length) return { ok: false, t: "el proveedor o los materiales ya no son válidos" };
      const now = Date.now(), m = madridParts(now), total = items.reduce((s: number, x: Any) => s + x.qty * x.price, 0);
      const rec = { id: "p" + u36(), code: `PED-${m.day}${m.month}${m.year.slice(-2)}-${m.hour}${m.minute}`, ts: now, date: `${m.day}/${m.month}/${m.year}`, time: `${m.hour}:${m.minute}`, proveedorId: prov.id, proveedor: prov.name, proveedorTel: prov.tel || "", proveedorTipo: prov.tipo || "", items, totalCents: total, paid: false, paidInitial: false, paidBy: "", paidAt: 0, received: false, receivedBy: "", receivedAt: 0, completedAt: 0, cancelled: false, aprobacion: a.id };
      await guardar([["pedido:" + rec.id, rec]]);
      await auditar(por, "Pedidos", `Aprobó y emitió el pedido ${rec.code} a ${prov.name} (${items.map((x: Any) => x.qty + " × " + x.material).join(", ")}, ${dolar(total)})`);
      return { ok: true, t: `pedido ${rec.code} emitido` };
    }
    if (a.tipo === "precio") {
      const pr = { ...(((await valor("precios")) || {}) as Record<string, number>) }, L: string[] = [];
      for (const x of a.propuesta?.cambios || []) { const v = Math.round(Number(x.a) * 100) / 100; if (!x.producto || !(v > 0 && v < 100000)) continue; pr[x.producto] = v; L.push(`${x.producto}: $${v.toFixed(2)}`); }
      if (!L.length) return { ok: false, t: "no había precios válidos" };
      await guardar([["precios", pr]]);
      await auditar(por, "Precios", "Aprobó el cambio de precios: " + L.join(", "));
      return { ok: true, t: L.length + (L.length === 1 ? " precio cambiado" : " precios cambiados") };
    }
    return { ok: false, t: "tipo desconocido" };
  } catch (e) { return { ok: false, t: String((e as Error)?.message || e).slice(0, 100) }; }
}
async function decidir(c: C, id: string, si: boolean, por: string) {
  const a = await valor("aprobacion:" + id);
  if (!a || a.deleted) return { err: "Esa propuesta ya no existe." };
  if (a.estado !== "pendiente") return { err: `Esa propuesta ya está ${a.estado === "rechazada" ? "rechazada" : "aprobada"}${a.decide ? " por " + a.decide : ""}.`, a };
  // nadie más puede decidirla a la vez
  const { data: ok } = await sb.from("bot_hechos").insert({ clave: "apr-" + id }).select("clave");
  if (!ok?.length) return { err: "Otra persona acaba de decidir esta propuesta.", a };
  let n = { ...a, estado: si ? "aprobada" : "rechazada", decide: por, decidida: Date.now() };
  if (si) { const r = await aplicar(n, por); n = { ...n, estado: r.ok ? "hecha" : "fallida", resultado: r.t }; }
  else await auditar(por, "Aprobaciones", `Rechazó la propuesta «${limpio(a.titulo, 120)}»`);
  await guardar([["aprobacion:" + id, n]]);
  return { a: n };
}
// cada minuto: publicar las propuestas nuevas y aplicar las que la Dirección aprobó en la web
export async function cronAprobaciones(c: C) {
  if (!c.canal_despacho) return "sin canal";
  const L = await lista("aprobacion:");
  let n = 0;
  for (const a of L as Any[]) {
    if (!a.id) continue;
    if (a.estado === "aprobada" && !a.resultado) { // aprobada desde la web: se aplica aquí
      const { data: ok } = await sb.from("bot_hechos").insert({ clave: "apr-" + a.id }).select("clave");
      if (ok?.length) { const r = await aplicar(a, a.decide || "Dirección"); a.estado = r.ok ? "hecha" : "fallida"; a.resultado = r.t; await guardar([["aprobacion:" + a.id, a]]); }
    }
    const k = "aprmsg_" + a.id;
    const { data: f } = await sb.from("bot_hechos").select("clave").eq("clave", k + "-cerrado").maybeSingle();
    if (f) continue;
    const { data: m } = await sb.from("bot_cfg").select("valor").eq("clave", k).maybeSingle();
    if (!m && a.estado === "pendiente" && Date.now() - Number(a.ts || 0) < 7 * 86400000) {
      const r = await api(c, "POST", `/channels/${c.canal_despacho}/messages`, tarjetaAprobacion(a));
      if (r.d?.id) await sb.from("bot_cfg").upsert({ clave: k, valor: r.d.id });
      n++;
    } else if (m && a.estado !== "pendiente") {
      await api(c, "PATCH", `/channels/${c.canal_despacho}/messages/${m.valor}`, tarjetaAprobacion(a));
      await sb.from("bot_hechos").insert({ clave: k + "-cerrado" });
      await sb.from("bot_cfg").delete().eq("clave", k);
    }
  }
  return "publicadas " + n;
}
// propuesta de pedido para un material bajo mínimo: el proveedor más barato que lo vende
async function proponerPedido(c: C, material: string, por: string) {
  const { data: st } = await sb.from("stock").select("producto,cantidad,minimo").eq("producto", "mat:" + material).maybeSingle();
  const cant = Number(st?.cantidad || 0), min = Number(st?.minimo || 0);
  const qty = Math.max(1, min > 0 ? min * 2 - cant : 50);
  const P = ((await valor("proveedores")) || []) as Any[];
  const opc = P.flatMap((p) => (p.prods || []).filter((x: Any) => norm(delAlmacen(x.name)) === norm(material) || norm(x.name) === norm(material)).map((x: Any) => ({ p, nombre: x.name, precio: Math.round(Number(x.price || 0) * 100) }))).filter((o) => o.precio > 0).sort((a, b) => a.precio - b.precio);
  if (!opc.length) return { err: `Ningún proveedor de la agenda vende **${material}**. Añádalo en la ficha del proveedor (web → Dirección → Proveedores).` };
  const o = opc[0], id = "a" + u36();
  const prop = { proveedorId: o.p.id, proveedor: o.p.name, items: [{ material: o.nombre, qty, price: o.precio }] };
  const r = await ia(c, "aprobacion", { tipo: "pedido", propuesta: { ...prop, stock_actual: cant, minimo: min, otros_proveedores: opc.slice(1, 3).map((x) => `${x.p.name} a ${dolar(x.precio)}`) } }, "", { jefe: true, quien: por, emp_id: "discord" });
  const a = { id, tipo: "pedido", titulo: `Pedido de ${qty} × ${o.nombre} a ${o.p.name}`, resumen: "error" in r ? `${material} está bajo mínimo (${cant} de ${min}). Se propone pedir ${qty} a ${o.p.name}, el proveedor más barato.` : r.texto, propuesta: prop, por, ts: Date.now(), estado: "pendiente" };
  await guardar([["aprobacion:" + id, a]]);
  return { a };
}

// avisos con botón (cada 10 minutos; cada cosa, una vez al día como mucho)
export async function cronAvisos(c: C, marcar: (k: string) => Promise<boolean>) {
  const hoy = hoyNum(), out: string[] = [];
  const [{ data: st }, peds, aprs] = await Promise.all([sb.from("stock").select("producto,cantidad,minimo"), lista("pedido:"), lista("aprobacion:")]);
  const pidiendo = new Set([...peds.filter((p) => !p.cancelled && !p.received && !p.completedAt).flatMap((p) => (p.items || []).map((x: Any) => norm(delAlmacen(x.material)))), ...aprs.filter((a) => a.estado === "pendiente" && a.tipo === "pedido").flatMap((a) => (a.propuesta?.items || []).map((x: Any) => norm(delAlmacen(x.material))))]);
  for (const s of (st ?? []) as Array<{ producto: string; cantidad: number; minimo: number | null }>) {
    const min = Number(s.minimo || 0);
    if (!(min > 0 && s.cantidad < min)) continue;
    // Los materiales se mantienen en el panel de Dirección, con pedidos parciales.
    if (s.producto.startsWith("mat:") || s.producto === "Pólvora") continue;
    if (c.canal_turnos) {
      if (!(await marcar(`avs-prod-${norm(s.producto)}-${hoy}`))) continue;
      await api(c, "POST", `/channels/${c.canal_turnos}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: (s.cantidad <= 0 ? "⛔ Agotado · " : "⚠️ Bajo mínimo · ") + limpio(s.producto, 60), color: 0x8b2e25, description: `Quedan **${s.cantidad}** y el mínimo es **${min}**.\n\nPulse **¿Qué fabrico?** y le digo qué conviene fabricar hoy con lo que hay en el almacén.`, footer: PIE }],
        components: [{ type: 1, components: [{ type: 2, style: 2, label: "¿Qué fabrico?", emoji: { name: "🛠" }, custom_id: "avs:fab:" + s.producto.slice(0, 80) }] }] });
      out.push(s.producto);
    }
  }
  return out.length ? "avisos: " + out.join(", ") : "nada";
}

// encargo recién fabricado: el telegrama de aviso lo escribe la IA y un botón lo marca como avisado
export async function textoEncargoListo(c: C, e: Any) {
  const r = await ia(c, "telegrama_encargo", { cliente: e.client, telegrama: e.telegram || "", productos: (e.items || []).map((x: Any) => x.qty + " × " + x.name).join(", "), total: dolar(e.totalCents || 0), anticipo: dolar(e.depositCents || 0), pendiente: dolar(e.pendingCents || 0), tipo: "aviso" }, "", { quien: "Señor Harrington", emp_id: "discord" });
  return "error" in r ? null : r.texto;
}
export const botonAvisado = (id: string) => [{ type: 1, components: [{ type: 2, style: 3, label: "Ya le he avisado", emoji: { name: "✅" }, custom_id: "tlg:av:" + id }] }];

// informe del lunes (9:15): para la Dirección en el despacho, y queda guardado para verlo en la web
export async function informeLunes(c: C, marcar: (k: string) => Promise<boolean>) {
  const m = madrid(Date.now()), hoy = hoyNum();
  if (diaSem(hoy) !== 1 || +m.hour !== 9 || +m.minute < 15 || !c.canal_despacho) return "no toca";
  if (!(await marcar("informe-lunes-" + hoy))) return "hecho";
  const ant = hoy - 7, ant2 = hoy - 14;
  const [d, V1, V0] = await Promise.all([estado(true), ventasDe(Array.from({ length: 7 }, (_, k) => ant + k)), ventasDe(Array.from({ length: 7 }, (_, k) => ant2 + k))]);
  const art: Record<string, number> = {};
  for (const r of V1) for (const x of r.items || []) art[x.name] = (art[x.name] || 0) + Number(x.qty || 0);
  const { data: G } = await sb.from("datos").select("valor").like("clave", "gasto:%");
  const g = ((G ?? []) as Array<{ valor: Any }>).map((r) => r.valor).filter((x) => x && !x.deleted && Number(x.day) >= ant && Number(x.day) < hoy);
  const H: Record<string, number> = {};
  for (const t of await lista("turno:")) if (t.start >= medianoche(ant) && t.start < medianoche(hoy)) H[t.name] = (H[t.name] || 0) + Math.max(0, (t.end || t.start) - t.start);
  const datos = { semana: `${fecha(medianoche(ant))} a ${fecha(medianoche(hoy) - 1)}`, ventas: V1.length, cobrado: dolar(V1.reduce((a, r) => a + cobrado(r), 0)), semana_anterior: { ventas: V0.length, cobrado: dolar(V0.reduce((a, r) => a + cobrado(r), 0)) }, lo_mas_vendido: Object.entries(art).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, q]) => `${n} (${q})`), gastos: dolar(g.reduce((a, x) => a + Number(x.cents || 0), 0)), personal: (await empleados()).map((e) => ({ nombre: e.name, puesto: e.puesto, horas: Math.round((H[e.name] || 0) / 360000) / 10, horas_que_le_tocan: Number(e.horas || 10), ventas: V1.filter((r) => r.employee === e.name).length })), encargos_pendientes: d.encargos_pendientes, pedidos_pendientes: d.pedidos_pendientes, bajo_minimo: d.bajo_minimo };
  const r = await ia(c, "informe_lunes", datos, "", { jefe: true, quien: "Señor Harrington", emp_id: "discord" });
  if ("error" in r) return r.error;
  await api(c, "POST", `/channels/${c.canal_despacho}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "📈 Informe del lunes · semana del " + datos.semana, color: ORO, description: r.texto.slice(0, 4000), footer: { text: "También lo tiene en la web: Dirección → Informe del lunes · Señor Harrington" } }] });
  await guardar([["informe:" + hoy, { id: String(hoy), ts: Date.now(), semana: datos.semana, texto: r.texto }]]);
  return "ok";
}

// botones de todo lo anterior: apr: (aprobar/rechazar) · avs: (avisos) · tlg: (encargo avisado)
export async function botonesIA(x: CtxIA & { id: string; esDir: boolean }): Promise<Response | null> {
  const { i, c, id } = x;
  if (i.type !== 3 || !/^(apr|avs|tlg):/.test(id)) return null;
  const yo = await quienEs(x.user.id), por = yo?.nombre || x.yoNombre;
  if (id.startsWith("apr:")) {
    if (!x.esDir) return efimero("Solo la Dirección puede aprobar o rechazar propuestas.");
    const [, q, aid] = id.split(":");
    const r = await decidir(c, aid, q === "si", por);
    if (r.err) return r.a ? json({ type: 7, data: tarjetaAprobacion(r.a) }) : efimero(r.err);
    if (i.message?.id) await sb.from("bot_hechos").insert({ clave: "aprmsg_" + aid + "-cerrado" });
    return json({ type: 7, data: tarjetaAprobacion(r.a) });
  }
  if (id.startsWith("avs:ped:")) {
    if (!x.esDir) return efimero("Los pedidos a proveedores los prepara la Dirección.");
    await encargarCon(c, "avs_ped", i, { material: id.slice(8) });
    return json({ type: 5, data: { flags: 64 } });
  }
  if (id.startsWith("avs:fab:")) {
    if (!x.esPersonal) return efimero("Esto es para la plantilla de la casa.");
    await encargarCon(c, "avs_fab", i, { producto: id.slice(8) });
    return json({ type: 5, data: { flags: 64 } });
  }
  if (id.startsWith("tlg:av:")) {
    if (!x.esPersonal) return efimero("Esto es para la plantilla de la casa.");
    const eid = id.slice(7), e = await valor("encargo:" + eid);
    if (!e || e.deleted || e.cancelled || e.finished) return efimero("Ese encargo ya no está pendiente.");
    if (e.fab !== "FABRICADO") return efimero("Ese encargo aún no está fabricado.");
    const emb = (i.message?.embeds || [])[0] || {};
    if (e.avisado) return json({ type: 7, data: { embeds: [{ ...emb, footer: { text: `✅ Cliente avisado${e.avisadoBy ? " por " + e.avisadoBy : ""}` } }], components: [] } });
    await guardar([["encargo:" + eid, { ...e, avisado: true, avisadoAt: Date.now(), avisadoBy: por }]]);
    await auditar(por, "Encargos", `Marcó como avisado al cliente del encargo ${eid} (${limpio(e.client, 60)})`);
    return json({ type: 7, data: { embeds: [{ ...emb, footer: { text: `✅ Cliente avisado por ${por} · empieza el plazo de 10 días` } }], components: [] } });
  }
  return null;
}


