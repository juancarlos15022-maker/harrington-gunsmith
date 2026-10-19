// HARRINGTON GUNSMITH · V3 · Señor Harrington, tercera tanda (dentro de discord-bot)
// Órdenes y botones (los reenvía discord-interacciones tras comprobar la firma, igual que la segunda tanda):
//   /pedidos y «Recibido entero» · /compra (compra a un particular) · /agenda · /se-busca y «Retirar cartel» ·
//   «Se queda» al terminar el periodo de prueba · el Veintiuno de la mesa de juego · nota de la bitácora al fichar la salida.
// Tareas de la crónica (cada minuto): pedidos pendientes con botón · nóminas por carta · plazo de los encargos ·
//   registro IC al vendedor · ofertas y sorteo para las visitas · ascensos sugeridos · fin del periodo de prueba ·
//   panel y ranking de la mesa de juego · notas de la bitácora escritas en la web.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { catalogo, dolar, duracion, fecha, gotica, hora, hoyNum, limpio, madrid, medianoche, ORO, PIE } from "./comun.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const efimero = (content: string, extra: Record<string, unknown> = {}) => json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...extra } });
type C = Record<string, string>;
// deno-lint-ignore no-explicit-any
type Any = any;
const WEB = "https://juancarlos15022-maker.github.io/harrington-gunsmith/";
const FIRMA = "\n\nDios guarde a usted muchos años.\n— *Señor Harrington*";
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const u36 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const ddmm = (d: number) => { const x = new Date(d * 86400000); return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
const ts = (ms: number, f = "R") => `<t:${Math.floor(ms / 1000)}:${f}>`;

async function api(c: C, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: { Authorization: "Bot " + c.token, "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const t = await r.text();
  try { return { st: r.status, d: t ? JSON.parse(t) : null }; } catch { return { st: r.status, d: t }; }
}
const post = (c: C, canal: string | undefined, cuerpo: Record<string, unknown>) => canal ? api(c, "POST", `/channels/${canal}/messages`, { allowed_mentions: { parse: [] }, ...cuerpo }) : Promise.resolve({ st: 0, d: null as Any });
async function carta(c: C, uid: string, texto: string) {
  try { const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid }); if (dm.d?.id) { const r = await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: "🎩 **Casa Harrington · Saint Denis**\n\n" + texto + FIRMA }); return r.st < 300; } } catch { /* */ }
  return false;
}
const marcar = async (k: string) => { const { data } = await sb.from("bot_hechos").insert({ clave: k }).select("clave"); return !!data?.length; };
// primera vez que se vio algo (para contar plazos cuando la web no guarda la fecha)
async function primeraVez(k: string) {
  await sb.from("bot_hechos").upsert({ clave: k }, { onConflict: "clave", ignoreDuplicates: true });
  const { data } = await sb.from("bot_hechos").select("ts").eq("clave", k).maybeSingle();
  return data?.ts ? Date.parse(data.ts) : Date.now();
}
// escribe en la base de datos igual que la web (y avisa a todas las webs abiertas con «rev»)
async function guardar(filas: Array<[string, unknown]>) {
  const t = new Date().toISOString();
  const { error } = await sb.from("datos").upsert([...filas.map(([clave, valor]) => ({ clave, valor, actualizado: t })), { clave: "rev", valor: { n: Date.now() + "-" + Math.random().toString(36).slice(2, 6) }, actualizado: t }], { onConflict: "clave" });
  if (error) throw new Error(error.message);
}
async function valor(clave: string) { const { data } = await sb.from("datos").select("valor").eq("clave", clave).maybeSingle(); return data?.valor as Any; }
async function lista(prefijo: string, desde?: string) {
  let q = sb.from("datos").select("clave,valor,actualizado").like("clave", prefijo + "%");
  if (desde) q = q.gte("actualizado", desde);
  const { data } = await q;
  return ((data ?? []) as Array<{ clave: string; valor: Any; actualizado: string }>).filter((r) => r.valor && !r.valor.deleted);
}
const empleados = async () => { const v = await valor("empleados"); return (Array.isArray(v) ? v : []) as Array<Record<string, Any>>; };
async function fijo(c: C, canal: string | undefined, clave: string, cuerpo: Record<string, unknown>) {
  if (!canal) return false;
  const firma = JSON.stringify(cuerpo);
  if (c["firma_" + clave] === firma && c[clave]) return false;
  let id = c[clave];
  if (id) { const r = await api(c, "PATCH", `/channels/${canal}/messages/${id}`, cuerpo); if (r.st === 404) id = ""; else if (r.st >= 300) return false; }
  if (!id) {
    const r = await api(c, "POST", `/channels/${canal}/messages`, cuerpo);
    if (r.st >= 300) return false;
    id = r.d.id; await api(c, "PUT", `/channels/${canal}/pins/${id}`);
    await sb.from("bot_cfg").upsert({ clave, valor: id }); c[clave] = id;
  }
  await sb.from("bot_cfg").upsert({ clave: "firma_" + clave, valor: firma }); c["firma_" + clave] = firma;
  return true;
}
async function auditar(quien: string, cat: string, linea: string) {
  const now = Date.now(), id = "d" + now.toString(36) + Math.random().toString(36).slice(2, 5);
  await sb.from("datos").insert({ clave: "log:" + id, valor: { id, ts: now, who: quien || "Discord", cat, lines: [linea + " (desde Discord)"] }, actualizado: new Date().toISOString() });
}

// ── materiales: el mismo nombre de almacén que usa la web (mena de hierro → Hierro; la pólvora es material sin «mat:») ──
const MAT_ALIAS: Record<string, string> = { "mena de hierro": "Hierro", "menas de hierro": "Hierro", "mena de carbon": "Carbón", "menas de carbon": "Carbón", "tablones": "Tabla de madera", "tablon": "Tabla de madera", "tablas de madera": "Tabla de madera", "trozo madera": "Trozo de madera", "trozos de madera": "Trozo de madera" };
const MAT_PROD = ["Pólvora"];
async function materiales() {
  const { data } = await sb.from("stock").select("producto").like("producto", "mat:%");
  return [...new Set([...((data ?? []) as Array<{ producto: string }>).map((r) => r.producto.slice(4)), ...MAT_PROD])].sort((a, b) => a.localeCompare(b, "es"));
}
async function claveMaterial(nombre: string) {
  let n = String(nombre || "").trim().replace(/\s+/g, " ");
  if (MAT_ALIAS[norm(n)]) n = MAT_ALIAS[norm(n)];
  const mp = MAT_PROD.find((x) => norm(x) === norm(n));
  if (mp) return { k: mp, n: mp };
  const f = (await materiales()).find((x) => norm(x) === norm(n));
  return { k: "mat:" + (f || n), n: f || n };
}
function mov(now: number, name: string, delta: number, why: string, who: string, despues: number) {
  const uid = "m" + now.toString(36) + Math.random().toString(36).slice(2, 5);
  return ["mov:" + uid, { uid, ts: now, name, delta, why, date: fecha(now), time: hora(now), who, antes: despues - delta, despues }] as [string, unknown];
}

// ── 1 · pedidos a proveedores ──
type Ped = Record<string, Any> & { id: string; code: string; proveedor: string; items: Array<{ material: string; qty: number; rq?: number; price?: number }> };
const pendiente = (p: Ped) => !p.deleted && !p.cancelled && !p.received && !p.completedAt;
const falta = (x: { qty: number; rq?: number }) => Math.max(0, Number(x.qty) - Math.min(Number(x.qty), Number(x.rq || 0)));
function tarjetaPedido(p: Ped) {
  const abierto = pendiente(p);
  return {
    embeds: [{ title: `🚂 Pedido ${p.code} · ${limpio(p.proveedor, 60)}`, color: abierto ? ORO : p.cancelled ? 0x6b4c1d : 0x3d8b52,
      description: (p.items || []).map((x) => `• ${x.qty} × ${limpio(x.material, 50)}${x.price ? ` a ${dolar(x.price)}` : ""}`).join("\n") + `\n\n**Total:** ${dolar(p.totalCents)} · ${p.paid ? "pagado por adelantado" : "se paga a la entrega"}` + (abierto ? "\n\nCuando llegue la mercancía, pulse **Recibido entero** y el material entrará en el almacén de la web. Si llega solo una parte, apúntelo en la web (PEDIDOS)." : ""),
      footer: { text: abierto ? `Emitido el ${p.date || fecha(p.ts || Date.now())} ${p.time || ""} · Señor Harrington` : p.cancelled ? "Pedido cancelado · Señor Harrington" : `✅ Recibido por ${p.receivedBy || "—"} el ${fecha(p.receivedAt || Date.now())} a las ${hora(p.receivedAt || Date.now())} · material en el almacén` } }],
    components: abierto ? [{ type: 1, components: [{ type: 2, style: 3, label: "Recibido entero", emoji: { name: "📦" }, custom_id: "ped:rec:" + p.id }] }] : [],
  };
}
async function recibirPedido(pid: string, por: string) {
  const p = await valor("pedido:" + pid) as Ped | null;
  if (!p || p.deleted) return { err: "Ese pedido ya no existe." };
  if (p.cancelled) return { err: "Ese pedido está cancelado.", p };
  if (p.received || p.completedAt) return { err: `Ese pedido ya lo recibió ${p.receivedBy || "otra persona"}.`, p };
  const now = Date.now();
  const { data: ok } = await sb.from("datos").upsert({ clave: "recibido-" + pid, valor: { ts: now, by: por }, actualizado: new Date().toISOString() }, { onConflict: "clave", ignoreDuplicates: true }).select("clave");
  if (!ok?.length) return { err: "Otra persona acaba de registrar este pedido." };
  const mi: Record<string, { n: string; q: number }> = {};
  for (const x of p.items || []) { const q = falta(x); if (!q) continue; const m = await claveMaterial(x.material); (mi[m.k] ||= { n: m.n, q: 0 }).q += q; }
  let st: Record<string, number> = {};
  const mv = Object.entries(mi).map(([k, o]) => ({ producto: k, delta: o.q }));
  if (mv.length) {
    const r = await sb.rpc("mover_stock", { p_items: mv });
    if (r.error) { await sb.from("datos").delete().eq("clave", "recibido-" + pid); return { err: "No he podido sumar el material al almacén. Inténtelo de nuevo." }; }
    st = (r.data || {}) as Record<string, number>;
  }
  const got = (p.items || []).filter((x) => falta(x) > 0).map((x) => ({ material: x.material, qty: falta(x) }));
  const rec: Ped = { ...p, items: (p.items || []).map((x) => ({ ...x, rq: x.qty })), recs: [...(p.recs || []), ...(got.length ? [{ ts: now, by: por, items: got, full: true }] : [])], received: true, receivedBy: por, receivedAt: now, matIn: true };
  const filas: Array<[string, unknown]> = Object.entries(mi).map(([k, o]) => mov(now, o.n + " (material)", o.q, "Pedido " + p.code, por, Number(st[k] ?? o.q)));
  if (rec.paid) { rec.completedAt = now; filas.push(["gasto:gp" + p.id, { id: "gp" + p.id, cat: "proveedor", concepto: `Pedido ${p.code} · ${p.proveedor}`, cents: p.totalCents, day: hoyNum(now), date: fecha(now), time: hora(now), pedido: p.id }]); }
  filas.push(["pedido:" + pid, rec]);
  await guardar(filas);
  await auditar(por, "Pedidos", `Recibió el pedido ${p.code} de ${p.proveedor}`);
  return { p: rec };
}
async function cronPedidos(c: C) {
  if (!c.canal_pedidos) return;
  const P = (await lista("pedido:")).map((r) => r.valor as Ped);
  const { data: M } = await sb.from("bot_pedmsg").select("pedido_id,mensaje_id,cerrado");
  const ya = new Map(((M ?? []) as Array<{ pedido_id: string; mensaje_id: string | null; cerrado: boolean }>).map((r) => [r.pedido_id, r]));
  for (const p of P) {
    const f = ya.get(p.id);
    if (pendiente(p) && !f) {
      if (p.ts && Date.now() - p.ts > 14 * 86400000) continue;
      const { data: ok } = await sb.from("bot_pedmsg").insert({ pedido_id: p.id }).select("pedido_id");
      if (!ok?.length) continue;
      const m = await post(c, c.canal_pedidos, tarjetaPedido(p));
      await sb.from("bot_pedmsg").update({ mensaje_id: m.d?.id || null }).eq("pedido_id", p.id);
    } else if (!pendiente(p) && f && !f.cerrado) {
      if (f.mensaje_id) await api(c, "PATCH", `/channels/${c.canal_pedidos}/messages/${f.mensaje_id}`, tarjetaPedido(p));
      await sb.from("bot_pedmsg").update({ cerrado: true }).eq("pedido_id", p.id);
    }
  }
}

// ── 2 · nóminas por carta cuando la Dirección paga el sueldo en la web ──
async function horasDe(nombre: string, desde: number, hasta: number) {
  const T = await lista("turno:");
  return T.map((r) => r.valor).filter((t: Any) => t.name === nombre && t.start >= desde && t.start < hasta).reduce((a: number, t: Any) => a + Math.max(0, t.end - t.start), 0);
}
async function cronNominas(c: C) {
  const R = await lista("sueldo-", new Date(Date.now() - 3 * 3600000).toISOString());
  if (!R.length) return;
  const E = await empleados();
  for (const r of R.slice(0, 15)) {
    const m = /^sueldo-(\d+)-(.+)$/.exec(r.clave);
    if (!m) continue;
    const e = E.find((x) => x.id === m[2]);
    if (!e?.discord || !(await marcar("nomina-" + r.clave))) continue;
    const lunes = +m[1], cents = Number(r.valor?.cents || 0), base = Number(e.sueldo || 0), ms = await horasDe(e.name, medianoche(lunes), medianoche(lunes + 7));
    await carta(c, e.discord, `💵 **Nómina de la semana** del lunes ${ddmm(lunes)} al domingo ${ddmm(lunes + 6)}.\n\nHa cobrado **${dolar(cents)}**.\nSueldo de su contrato: ${dolar(base)} · Horas en el taller: **${duracion(0, ms)}** (le tocaban ${e.horas || 10} h).` +
      (cents < base ? `\nSe le han descontado ${dolar(base - cents)} por las horas que faltaron.` : cents > base ? `\nIncluye ${dolar(cents - base)} por horas de más.` : "") + "\n\nGracias por su trabajo en la casa.");
  }
}

// ── 3 · plazo de 10 días para recoger los encargos avisados ──
async function cronEncargos(c: C) {
  const L = (await lista("encargo:")).map((r) => r.valor).filter((e: Any) => e.id && !e.finished && !e.cancelled && e.fab === "FABRICADO" && e.avisado);
  for (const e of L as Any[]) {
    const t0 = Number(e.avisadoAt) || await primeraVez("enc-av-" + e.id), dias = (Date.now() - t0) / 86400000;
    const items = (e.items || []).map((x: Any) => x.qty + " × " + x.name).join(", ");
    if (dias >= 8 && dias < 10 && await marcar("enc-plazo8-" + e.id)) {
      const txt = `Sr./Sra. ${e.client}: le recordamos que su encargo (${items}) le espera en Armería Harrington Gunsmith, Saint Denis.${e.pendingCents > 0 ? ` Importe pendiente: ${dolar(e.pendingCents)}.` : ""}\n\nRecuerde que dispone de 10 días desde el aviso para recogerlo; pasado ese plazo, perderá el producto y la fianza.\n\nAtentamente, Vincent Harrington · Telegrama SD8112\n\nEl precio de un apellido.`;
      await post(c, c.canal_encargos, { embeds: [{ title: "⏳ Quedan 2 días · " + limpio(e.client, 60), color: ORO, description: `**${items}**\nTelegrama del cliente: **${limpio(e.telegram, 12) || "—"}**\nAvisado ${ts(t0)}.\n\nMándele este recordatorio por telegrama:\n\`\`\`\n${txt}\n\`\`\``, footer: PIE }] });
    }
    if (dias >= 10 && await marcar("enc-plazo10-" + e.id)) {
      await post(c, c.canal_despacho, { embeds: [{ title: "⌛ Vence el plazo · " + limpio(e.client, 60), color: 0x8b2e25, description: `Hoy se cumplen **10 días** desde que se avisó a **${limpio(e.client, 60)}** de que su encargo estaba listo (${items}) y no lo ha recogido.\n\nSegún las normas de la casa, pierde el producto y la fianza${e.depositCents ? ` (${dolar(e.depositCents)})` : ""}. Decida en la web (ENCARGOS) qué se hace con él.`, footer: PIE }] });
    }
  }
}

// ── 4 · aviso al vendedor de un arma sin registrar IC ──
async function cronIC(c: C) {
  const CL = await valor("clientes"), E = await empleados();
  let n = 0;
  for (const x of (Array.isArray(CL) ? CL : []) as Any[]) for (const s of (x.series || []) as Any[]) {
    if (n >= 10 || s.ic !== false || !s.v || !s.t || Date.now() - s.t < 2 * 3600000 || Date.now() - s.t > 30 * 86400000) continue;
    const e = E.find((k) => norm(k.name) === norm(s.v));
    if (!e?.discord || !(await marcar(`ic-vend-${x.id || norm(x.name)}-${s.s}`))) continue;
    n++;
    await carta(c, e.discord, `El arma **${limpio(s.a, 40) || "vendida"}** n.º **${limpio(s.s, 30)}** que vendió a **${limpio(x.name, 60)}** sigue **sin registrar IC**.\n\nRegístrela dentro del juego a nombre del cliente y márquela como registrada en su ficha de la web (**CLIENTES → Armas → Ya registrada**). No hacerlo es sancionable.`);
  }
}

// ── 5 · ofertas, convenios y sorteo a la vista de las visitas ──
const GRUPO: Record<string, string> = { suministros: "suministros", municiones: "munición", ambos: "suministros y munición" };
const TIPO: Record<string, string> = { particular: "particulares", empresa: "empresas", sheriff: "el Departamento del Sheriff" };
const IMG: Record<string, string> = { Revolveres: "revolveres", Pistolas: "pistolas", Repetidoras: "repetidoras", Rifles: "rifles", Escopetas: "escopetas", Blancas: "armas-blancas", Municion: "municion", Suministros: "suministros" };
async function cronOfertas(c: C) {
  if (!c.canal_ofertas) return;
  const D = ((await valor("descuentos")) || []) as Any[], ahora = Date.now();
  const act = (Array.isArray(D) ? D : []).filter((d) => d && Number(d.endMs) > ahora);
  const ben = (d: Any) => d.group ? (d.benefit === "gratis" ? `${d.freeUnits} ${d.freeUnits === 1 ? "unidad gratis" : "unidades gratis"} por cada ${d.threshold} de ${GRUPO[d.group] || d.group}` : `${d.pct} % de descuento en ${GRUPO[d.group] || d.group} desde ${d.threshold} unidades`) : `${d.pct} % de descuento`;
  const ofertas = act.filter((d) => d.kind !== "convenio"), conv = act.filter((d) => d.kind === "convenio");
  const EV = (await lista("evento:")).map((r) => r.valor).filter((e: Any) => e.status === "activo" && e.tipo === "sorteo" && Number(e.end) > ahora) as Any[];
  const cat = await catalogo(sb);
  const embeds: Any[] = [{ title: "🎟 " + gotica("Ofertas y Sorteos"), color: ORO, description: "Lo que la Casa Harrington ofrece ahora mismo a sus clientes. Para aprovecharlo, hable con cualquier empleado en el mostrador." + (!ofertas.length && !conv.length && !EV.length ? "\n\n*Ahora mismo no hay ofertas ni sorteos. ¡Vuelva pronto!*" : "") }];
  if (ofertas.length) embeds.push({ title: "🏷 Ofertas", color: 0x3d8b52, description: ofertas.map((d) => `**${limpio(d.nombre, 60)}**\n${ben(d)} · termina ${ts(d.endMs)}`).join("\n\n").slice(0, 4000) });
  if (conv.length) embeds.push({ title: "🤝 Convenios", color: 0x3a5a8c, description: conv.map((d) => `**${limpio(d.nombre, 60)}** · para ${TIPO[d.clientType] || "clientes con convenio"}\n${ben(d)} · hasta ${ts(d.endMs, "D")}`).join("\n\n").slice(0, 4000) });
  for (const e of EV.slice(0, 3)) {
    const { count } = await sb.from("datos").select("clave", { count: "exact", head: true }).like("clave", `sorteo-${e.id}-%`);
    const p = cat.find((x) => x.nombre === e.arma);
    embeds.push({ title: "🎟 Sorteo · " + limpio(e.arma, 60), color: 0xd7ae54, image: p && IMG[p.categoria] ? { url: `${WEB}${IMG[p.categoria]}-ancha.webp` } : undefined,
      description: `Se sortea **${limpio(e.arma, 60)}** entre los clientes de la casa.\n\n**Cómo participar:** cada compra${Number(e.min) > 0 ? ` desde **${dolar(e.min)}**` : ""} da un número.\n**Termina:** ${ts(e.end, "f")} (${ts(e.end)})\n**Números repartidos:** ${count || 0}${e.nota ? `\n\n${limpio(e.nota, 300)}` : ""}` });
  }
  embeds[embeds.length - 1].footer = { text: "Se pone al día solo con la web · Señor Harrington" };
  await fijo(c, c.canal_ofertas, "msg_ofertas", { allowed_mentions: { parse: [] }, embeds: embeds.slice(0, 10) });
}

// ── 8 · ascensos sugeridos y 9 · fin del periodo de prueba ──
const SIG: Record<string, string> = { "Aprendiz de armero": "Armero", "Armero": "Armero experto", "Armero experto": "Gerente" };
const REQ: Record<string, { h: number; v: number; d: number; examen?: boolean; texto: string }> = {
  "Aprendiz de armero": { h: 10, v: 0, d: 7, examen: true, texto: "10 h de taller, una semana en la casa y el examen aprobado" },
  "Armero": { h: 50, v: 50, d: 30, texto: "50 h de taller, 50 ventas y un mes en la casa" },
  "Armero experto": { h: 100, v: 100, d: 90, texto: "100 h de taller, 100 ventas y tres meses en la casa" },
};
async function totales() {
  const { data: V } = await sb.from("datos").select("e:valor->>employee,v:valor->>voided").like("clave", "venta:%");
  const nV: Record<string, number> = {};
  for (const r of (V ?? []) as Array<{ e: string; v: string }>) if (r.e && r.v !== "true") nV[r.e] = (nV[r.e] || 0) + 1;
  const hT: Record<string, number> = {};
  for (const r of await lista("turno:")) { const t = r.valor; hT[t.name] = (hT[t.name] || 0) + Math.max(0, t.end - t.start); }
  const { data: F } = await sb.from("bot_formacion").select("emp_id,aprobado,nota");
  const fo = Object.fromEntries(((F ?? []) as Any[]).filter((x) => x.emp_id).map((x) => [x.emp_id, x]));
  return { nV, hT, fo };
}
const diasEn = (e: Any) => /^\d{4}-\d{2}-\d{2}$/.test(e.inicio || "") ? hoyNum() - Math.floor(Date.parse(e.inicio + "T00:00:00Z") / 86400000) : 0;
async function cronAscensos(c: C) {
  if (!c.canal_despacho) return;
  const E = (await empleados()).filter((e) => SIG[e.puesto]), T = await totales();
  for (const e of E) {
    const r = REQ[e.puesto], h = (T.hT[e.name] || 0) / 3600000, v = T.nV[e.name] || 0, d = diasEn(e), ex = !!T.fo[e.id]?.aprobado;
    if (h < r.h || v < r.v || d < r.d || (r.examen && !ex)) continue;
    if (!(await marcar(`asc-sug-${e.id}-${e.puesto}`))) continue;
    await post(c, c.canal_despacho, { embeds: [{ title: "⬆️ Propuesta de ascenso · " + limpio(e.name, 60), color: 0x3498db,
      description: `**${limpio(e.name, 60)}** cumple ya lo que la casa pide para pasar de **${e.puesto}** a **${SIG[e.puesto]}** (${r.texto}).\n\n• Horas de taller: **${Math.floor(h)} h**\n• Ventas: **${v}**\n• En la casa desde hace **${d} días**\n• Examen de la casa: ${ex ? "✅ aprobado" : "sin aprobar"}\n\nSi la Dirección lo tiene a bien, pulse **Ascender**: le pedirá confirmación.`, footer: PIE }],
      components: [{ type: 1, components: [{ type: 2, style: 1, label: `Ascender a ${SIG[e.puesto]}`, emoji: { name: "⬆️" }, custom_id: "plt:asc:" + e.id }, { type: 2, style: 2, label: "Ahora no", custom_id: "prb:no" }] }] });
  }
}
async function cronPrueba(c: C) {
  const m = madrid(Date.now());
  if (+m.hour < 10 || !c.canal_despacho) return;
  const hoy = iso(hoyNum()), E = (await empleados()).filter((e) => e.puesto !== "Jefe" && !e.fijo && !e.sinPrueba && e.prueba === hoy);
  if (!E.length) return;
  const T = await totales();
  for (const e of E) {
    if (!(await marcar(`prueba-fin-${e.id}-${e.prueba}`))) continue;
    const ini = /^\d{4}-\d{2}-\d{2}$/.test(e.inicio || "") ? Date.parse(e.inicio + "T00:00:00Z") / 86400000 : hoyNum() - 7;
    const ms = await horasDe(e.name, medianoche(ini), Date.now()), fo = T.fo[e.id];
    await post(c, c.canal_despacho, { embeds: [{ title: "📜 Termina el periodo de prueba · " + limpio(e.name, 60), color: ORO,
      description: `Hoy acaba la semana de prueba de **${limpio(e.name, 60)}** (${limpio(e.puesto, 40)}).\n\n• Horas de taller en la prueba: **${duracion(0, ms)}**\n• Ventas en total: **${T.nV[e.name] || 0}**\n• Examen de la casa: ${fo ? (fo.aprobado ? `✅ aprobado (${fo.nota}/10)` : `❌ ${fo.nota}/10`) : "sin hacer"}\n\nSi se queda, la web le pasa sola a **fijo** al terminar el día y publica su contrato nuevo.`, footer: PIE }],
      components: [{ type: 1, components: [{ type: 2, style: 3, label: "Se queda", emoji: { name: "✅" }, custom_id: "prb:ok:" + e.id }, { type: 2, style: 4, label: "Despedir", emoji: { name: "🚪" }, custom_id: "plt:desp:" + e.id }] }] });
  }
}

// ── 11 · el Veintiuno de la mesa de juego (fichas de mentira, ranking semanal) ──
const semana = () => { const h = hoyNum(); return h - ((new Date(h * 86400000).getUTCDay() + 6) % 7); };
const PALOS = ["♠", "♥", "♦", "♣"], RANGOS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function mazo() { const M: string[] = []; for (const p of PALOS) for (const r of RANGOS) M.push(r + p); for (let i = M.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [M[i], M[j]] = [M[j], M[i]]; } return M; }
function puntos(L: string[]) { let s = 0, ases = 0; for (const x of L) { const r = x.slice(0, -1); if (r === "A") { s += 11; ases++; } else s += ["J", "Q", "K"].includes(r) ? 10 : +r; } while (s > 21 && ases) { s -= 10; ases--; } return s; }
async function saldoDe(uid: string, nombre: string) {
  const sem = semana();
  await sb.from("bot_juego").upsert({ user_id: uid, semana: sem, nombre, saldo: 100 }, { onConflict: "user_id,semana", ignoreDuplicates: true });
  const { data } = await sb.from("bot_juego").select("*").eq("user_id", uid).eq("semana", sem).maybeSingle();
  return data as Any;
}
const APUESTAS = [5, 10, 25];
const botonesApuesta = (saldo: number) => [{ type: 1, components: APUESTAS.map((n) => ({ type: 2, style: 1, label: `Apostar ${n} fichas`, custom_id: "bj:bet:" + n, disabled: saldo < n })) }];
function vistaMano(m: Any, saldo: number, fin?: string) {
  const oculta = !fin;
  const banca = oculta ? `${m.banca[0]} 🂠` : m.banca.join(" "), pb = oculta ? "?" : String(puntos(m.banca));
  return { content: "", embeds: [{ title: "🃏 " + gotica("El Veintiuno"), color: fin ? (fin.startsWith("🏆") ? 0x3d8b52 : fin.startsWith("🤝") ? ORO : 0x8b2e25) : 0x2e5a3a,
    description: `**La banca (Señor Harrington):** ${banca} · ${pb}\n**Usted:** ${m.jug.join(" ")} · **${puntos(m.jug)}**\n\nApuesta: **${m.apuesta}** fichas${fin ? `\n\n${fin}` : ""}`, footer: { text: `Le quedan ${saldo} fichas esta semana · el lunes vuelve a tener 100` } }],
    components: fin ? (saldo >= APUESTAS[0] ? botonesApuesta(saldo) : []) : [{ type: 1, components: [{ type: 2, style: 1, label: "Pedir carta", custom_id: "bj:hit:" + m.id }, { type: 2, style: 2, label: "Plantarse", custom_id: "bj:stand:" + m.id }] }] };
}
async function terminarMano(m: Any, uid: string) {
  let M = [...m.mazo], B = [...m.banca];
  const pj = puntos(m.jug);
  if (pj <= 21 && !(m.jug.length === 2 && pj === 21)) while (puntos(B) < 17) B.push(M.shift()!);
  const pb = puntos(B), natural = m.jug.length === 2 && pj === 21, bnat = B.length === 2 && pb === 21;
  let pago = 0, fin = "";
  if (pj > 21) fin = "💥 Se ha pasado de 21. La banca gana.";
  else if (natural && !bnat) { pago = Math.round(m.apuesta * 2.5); fin = `🏆 **¡Veintiuno a la primera!** Gana ${pago - m.apuesta} fichas.`; }
  else if (pb > 21) { pago = m.apuesta * 2; fin = `🏆 La banca se pasa con ${pb}. Gana ${m.apuesta} fichas.`; }
  else if (pj > pb) { pago = m.apuesta * 2; fin = `🏆 ${pj} contra ${pb}. Gana ${m.apuesta} fichas.`; }
  else if (pj === pb) { pago = m.apuesta; fin = `🤝 Empate a ${pj}. Recupera su apuesta.`; }
  else fin = `La banca gana: ${pb} contra ${pj}.`;
  const { data: ok } = await sb.from("bot_manos").update({ estado: "fin", banca: B, mazo: M }).eq("id", m.id).eq("estado", "jugando").select("id");
  const j = await saldoDe(uid, "");
  if (!ok?.length) return { m: { ...m, banca: B }, saldo: j.saldo, fin: "Esta mano ya terminó." };
  const saldo = j.saldo + pago;
  await sb.from("bot_juego").update({ saldo, manos: j.manos + 1, ganadas: j.ganadas + (pago > m.apuesta ? 1 : 0) }).eq("user_id", uid).eq("semana", m.semana);
  return { m: { ...m, banca: B }, saldo, fin };
}
async function panelJuego(c: C) {
  if (!c.canal_juego) return;
  const { data } = await sb.from("bot_juego").select("nombre,saldo,manos,ganadas").eq("semana", semana()).gt("manos", 0).order("saldo", { ascending: false }).limit(10);
  const L = (data ?? []) as Any[];
  await fijo(c, c.canal_juego, "msg_juego", { allowed_mentions: { parse: [] }, embeds: [{ title: "🎲 " + gotica("La Mesa del Veintiuno"), color: 0x2e5a3a,
    description: "Para el rato entre cliente y cliente. Se juega contra la banca (el Señor Harrington) con **fichas de mentira**: cada uno empieza la semana con **100 fichas**.\n\n**Reglas:** gana quien se acerque más a 21 sin pasarse. Las figuras valen 10 y el as, 1 u 11. La banca pide hasta 17. El veintiuno a la primera paga 3 a 2.\n\nPulse **Sentarse a la mesa**: la partida solo la ve usted.",
    fields: [{ name: `🏆 Ranking de la semana (desde el lunes ${ddmm(semana())})`, value: L.length ? L.map((x, k) => `${["🥇", "🥈", "🥉"][k] || `**${k + 1}.**`} ${limpio(x.nombre, 40)} · **${x.saldo}** fichas (${x.ganadas}/${x.manos} manos ganadas)`).join("\n") : "Nadie se ha sentado todavía esta semana." }], footer: PIE }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Sentarse a la mesa", emoji: { name: "🃏" }, custom_id: "bj:new" }] }] });
}

// ── 12 · bitácora del taller ──
async function publicarBitacora(c: C, b: Any) {
  if (!c.canal_bitacora || !(await marcar("bit-" + b.id))) return;
  await post(c, c.canal_bitacora, { embeds: [{ title: "📓 " + limpio(b.name, 60), color: 0x6b4c1d, description: limpio(b.texto, 1500),
    footer: { text: `Jornada del ${fecha(b.end || b.ts)}${b.start && b.end ? ` · ${hora(b.start)} – ${hora(b.end)} (${duracion(b.start, b.end)})` : ""} · Señor Harrington` } }] });
}
async function cronBitacora(c: C) {
  for (const r of (await lista("bitacora:", new Date(Date.now() - 6 * 3600000).toISOString())).slice(0, 10)) await publicarBitacora(c, r.valor);
}

// ── crónica: todo lo periódico de esta tanda ──
export async function cronicaMas(c: C, cada10: boolean) {
  const hecho: Record<string, string> = {};
  const paso = async (n: string, f: () => Promise<unknown>) => { try { if(c["control_off_cron_social_"+n]==="true"){hecho[n]="desactivado";return;} await f(); hecho[n] = "ok"; } catch (e) { hecho[n] = String((e as Error)?.message || e).slice(0, 120); } };
  await paso("pedidos", () => cronPedidos(c));
  await paso("nominas", () => cronNominas(c));
  await paso("bitacora", () => cronBitacora(c));
  await paso("ofertas", () => cronOfertas(c));
  await paso("juego", () => panelJuego(c));
  await paso("prueba", () => cronPrueba(c));
  if (cada10) { await paso("plazos", () => cronEncargos(c)); await paso("ic", () => cronIC(c)); await paso("ascensos", () => cronAscensos(c)); }
  return hecho;
}

// ── órdenes y botones de esta tanda ──
export type Ctx = { i: Any; c: C; user: Any; yoNombre: string; id: string; orden: string; opt: (n: string) => unknown; esDir: boolean; esPersonal: boolean; v: Record<string, string> };
export async function atenderMas(x: Ctx): Promise<Response | null> {
  const { i, c, user, yoNombre, id, orden, opt, esDir, esPersonal, v } = x;
  const nombreEmp = async () => (await empleados()).find((e) => e.discord === user.id)?.name || yoNombre;

  // /pedidos y «Recibido entero»
  if (i.type === 2 && orden === "pedidos") {
    if (!esPersonal) return efimero("Los pedidos de la casa solo los ve el personal.");
    const P = (await lista("pedido:")).map((r) => r.valor as Ped).filter(pendiente).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (!P.length) return efimero("🚂 No hay pedidos pendientes de recibir.");
    return efimero(`🚂 **Pedidos pendientes de recibir (${P.length})**${P.length > 5 ? " · se muestran los 5 más antiguos" : ""}`, { embeds: P.slice(0, 5).map((p) => tarjetaPedido(p).embeds[0]), components: P.slice(0, 5).map((p) => ({ type: 1, components: [{ type: 2, style: 3, label: `Recibido: ${p.code}`.slice(0, 80), emoji: { name: "📦" }, custom_id: "ped:rec:" + p.id }] })) });
  }
  if (i.type === 3 && id.startsWith("ped:rec:")) {
    if (!esPersonal) return efimero("Solo el personal de la casa puede recibir pedidos.");
    const pid = id.split(":")[2], r = await recibirPedido(pid, await nombreEmp());
    if (r.err && !r.p) return efimero(r.err);
    const p = r.p as Ped;
    const { data: f } = await sb.from("bot_pedmsg").select("mensaje_id,cerrado").eq("pedido_id", pid).maybeSingle();
    if (f?.mensaje_id && i.message?.id !== f.mensaje_id && c.canal_pedidos) { await api(c, "PATCH", `/channels/${c.canal_pedidos}/messages/${f.mensaje_id}`, tarjetaPedido(p)); }
    if (f && !f.cerrado) await sb.from("bot_pedmsg").update({ cerrado: true }).eq("pedido_id", pid);
    if (r.err) return efimero(r.err);
    return json({ type: 7, data: { allowed_mentions: { parse: [] }, ...tarjetaPedido(p) } });
  }

  // /compra: compra a un particular desde Discord (Dirección)
  if (i.type === 4 && (orden === "compra" || orden === "agenda")) {
    const foco = ((i.data?.options || []) as Any[]).find((o) => o.focused);
    const q = norm(String(foco?.value || ""));
    if (orden === "compra") {
      const L = (await materiales()).filter((n) => !q || norm(n).includes(q)).slice(0, 24).map((n) => ({ name: n, value: n }));
      if (q && !L.some((o) => norm(o.name) === q)) L.push({ name: `${String(foco?.value).slice(0, 80)} (material nuevo)`, value: String(foco?.value).slice(0, 80) });
      return json({ type: 8, data: { choices: L.slice(0, 25) } });
    }
    const A = ((await valor("agenda")) || []) as Any[];
    return json({ type: 8, data: { choices: (Array.isArray(A) ? A : []).filter((a) => a?.name && (!q || norm(a.name).includes(q) || norm(a.tipo || "").includes(q))).slice(0, 25).map((a) => ({ name: `${a.name}${a.tipo ? " · " + a.tipo : ""}`.slice(0, 100), value: String(a.id) })) } });
  }
  if (i.type === 2 && orden === "compra") {
    if (!esDir) return efimero("Solo la Dirección puede apuntar compras.");
    const m = await claveMaterial(String(opt("material") || "")), q = Math.floor(Number(opt("cantidad"))), p = Math.round(Number(opt("precio")) * 100);
    const vendedor = limpio(opt("vendedor"), 40), caja = opt("caja") !== false;
    if (!m.n) return efimero("Diga qué material ha comprado.");
    if (!(q > 0) || !(p > 0)) return efimero("La cantidad y el precio por unidad han de ser mayores que cero.");
    if ((await catalogo(sb)).some((x) => x.nombre === m.n) && !MAT_PROD.includes(m.n)) return efimero(`«${m.n}» es un producto de la tienda, no un material: súmelo en STOCK de la web.`);
    const por = await nombreEmp(), now = Date.now(), t = madrid(now), code = `CP-${t.day}${t.month}${t.year.slice(-2)}-${t.hour}${t.minute}${now.toString(36).slice(-2).toUpperCase()}`;
    const rec = { id: "cp" + u36(), code, ts: now, date: fecha(now), time: hora(now), material: m.n, q, price: p, vendedor, caja, por };
    const r = await sb.rpc("mover_stock", { p_items: [{ producto: m.k, delta: q }] });
    if (r.error) return efimero("No he podido sumar el material al almacén. Inténtelo de nuevo.");
    const filas: Array<[string, unknown]> = [["compra:" + rec.id, rec], mov(now, m.n + " (material)", q, "Compra " + code, por, Number((r.data as Any)?.[m.k] ?? q))];
    if (caja) filas.push(["gasto:gc" + rec.id, { id: "gc" + rec.id, cat: "proveedor", concepto: `Compra a un particular ${code} · ${q} × ${m.n}${vendedor ? " · " + vendedor : ""}`, cents: q * p, day: hoyNum(now), date: rec.date, time: rec.time, compra: rec.id }]);
    await guardar(filas);
    await auditar(por, "Pedidos", `Compra a un particular: ${q} × ${m.n} a ${dolar(p)} (total ${dolar(q * p)})${vendedor ? " · vendedor " + vendedor : ""}`);
    if (c.canal_pedidos) await post(c, c.canal_pedidos, { embeds: [{ title: "🧾 Compra a un particular · " + code, color: 0x6b5a2a, description: `**${q} × ${m.n}** a ${dolar(p)} la unidad · total **${dolar(q * p)}**\nVendedor: ${vendedor || "—"} · Apuntó: ${por}\n${caja ? "Pagado con dinero de la caja (apuntado como gasto)" : "No salió de la caja"}`, footer: PIE }] });
    return efimero(`✅ Entran **${q} de ${m.n}** en el almacén a ${dolar(p)} la unidad (total **${dolar(q * p)}**)${caja ? ", apuntado como gasto de caja" : ""}. Al fabricar, este lote se gastará en su turno y a su precio.`);
  }

  // /agenda: ficha de un contacto (Dirección)
  if (i.type === 2 && orden === "agenda") {
    if (!esDir) return efimero("La agenda de contactos es de la Dirección.");
    const A = ((await valor("agenda")) || []) as Any[], q = String(opt("nombre") || "");
    const a = (Array.isArray(A) ? A : []).find((k) => k.id === q) || A.find((k) => norm(k.name) === norm(q)) || A.find((k) => norm(k.name).includes(norm(q)));
    if (!a) return efimero(`No hay nadie en la agenda que se llame «${limpio(q, 40)}». Empiece a escribir y elija de la lista.`);
    return efimero("", { embeds: [{ title: "📇 " + limpio(a.name, 80), color: 0x5b4a8c, fields: [{ name: "Telegrama", value: limpio(a.tel, 20) || "—", inline: true }, { name: "Quién es", value: limpio(a.tipo, 40) || "—", inline: true }, { name: "Observaciones", value: limpio(a.obs, 1000) || "—" }], footer: { text: `Apuntado por ${a.por || "—"} el ${fecha(a.ts || Date.now())} · Señor Harrington` } }] });
  }

  // /se-busca y «Retirar cartel» (Dirección)
  if (i.type === 2 && orden === "se-busca") {
    if (!esDir) return efimero("Solo la Dirección puede colgar carteles de Se busca.");
    if (!c.canal_sebusca) return efimero("El tablón de Se busca no está dispuesto todavía.");
    const nombre = limpio(opt("nombre"), 60), motivo = limpio(opt("motivo"), 300), recomp = Math.round(Number(opt("recompensa") || 0) * 100);
    if (!nombre || !motivo) return efimero("Hacen falta el nombre y el motivo.");
    const b = { id: "b" + u36(), nombre, motivo, recompensa: recomp > 0 ? recomp : 0, ts: Date.now(), por: await nombreEmp(), activo: true, msg: "" };
    const m = await post(c, c.canal_sebusca, cartel(b));
    if (m.st >= 300) return efimero("No he podido colgar el cartel. Inténtelo de nuevo.");
    b.msg = m.d?.id || "";
    const L = ((await valor("sebusca")) || []) as Any[];
    await guardar([["sebusca", [...(Array.isArray(L) ? L : []), b]]]);
    await auditar(b.por, "Clientes", `Cuelga un cartel de Se busca: ${nombre} (${motivo})`);
    return efimero(`📜 Cartel colgado en <#${c.canal_sebusca}>. Si alguien intenta comprar en la web a nombre de **${nombre}**, la web avisará antes de cobrar.`);
  }
  if (i.type === 3 && id.startsWith("sb:del:")) {
    if (!esDir) return efimero("Solo la Dirección puede retirar carteles.");
    const L = ((await valor("sebusca")) || []) as Any[], bid = id.split(":")[2], b = (Array.isArray(L) ? L : []).find((k) => k.id === bid);
    if (!b) return json({ type: 7, data: { components: [] } });
    b.activo = false; b.retirado = Date.now(); b.retiradoPor = await nombreEmp();
    await guardar([["sebusca", L]]);
    await auditar(b.retiradoPor, "Clientes", `Retira el cartel de Se busca de ${b.nombre}`);
    return json({ type: 7, data: cartel(b) });
  }

  // «Se queda» / «Ahora no» en el despacho
  if (i.type === 3 && (id.startsWith("prb:ok:") || id === "prb:no")) {
    if (!esDir) return efimero("Solo la Dirección decide sobre el personal.");
    const emb = (i.message?.embeds || [])[0] || {};
    if (id === "prb:no") return json({ type: 7, data: { embeds: [{ ...emb, footer: { text: `Lo deja para más adelante ${yoNombre} · Señor Harrington` } }], components: [] } });
    const e = (await empleados()).find((k) => k.id === id.split(":")[2]);
    if (e?.discord) await carta(c, e.discord, `Tengo el gusto de comunicarle que ha **superado el periodo de prueba**: la Dirección ha decidido que se queda en la casa. Desde mañana es usted trabajador **fijo** y su contrato nuevo se publicará en el canal de contratos.\n\nEnhorabuena, y bienvenido de veras a la Casa Harrington.`);
    return json({ type: 7, data: { embeds: [{ ...emb, color: 0x3d8b52, footer: { text: `✅ Se queda · decidido por ${yoNombre}${e?.discord ? " · se le ha mandado una carta" : ""}` } }], components: [] } });
  }

  // el Veintiuno
  if (i.type === 3 && (id === "bj:new" || id.startsWith("bj:"))) {
    const j = await saldoDe(user.id, yoNombre);
    if (id === "bj:new") return json({ type: 4, data: { flags: 64, embeds: [{ title: "🃏 " + gotica("El Veintiuno"), color: 0x2e5a3a, description: `Tome asiento, ${yoNombre}. Tiene **${j.saldo} fichas** esta semana.\n\n¿Cuánto apuesta?`, footer: PIE }], components: j.saldo >= APUESTAS[0] ? botonesApuesta(j.saldo) : [] } });
    if (id.startsWith("bj:bet:")) {
      const n = +id.split(":")[2];
      if (!APUESTAS.includes(n)) return efimero("Esa apuesta no está permitida.");
      if (j.saldo < n) return json({ type: 7, data: { content: `No le quedan fichas suficientes (tiene ${j.saldo}). El lunes vuelve a tener 100.`, embeds: [], components: [] } });
      await sb.from("bot_juego").update({ saldo: j.saldo - n, nombre: yoNombre }).eq("user_id", user.id).eq("semana", j.semana);
      const M = mazo(), m = { id: "j" + u36(), user_id: user.id, semana: j.semana, apuesta: n, jug: [M.shift()!, M.shift()!], banca: [M.shift()!, M.shift()!], mazo: M, estado: "jugando" };
      await sb.from("bot_manos").insert(m);
      if (puntos(m.jug) === 21) { const r = await terminarMano(m, user.id); return json({ type: 7, data: vistaMano(r.m, r.saldo, r.fin) }); }
      return json({ type: 7, data: vistaMano(m, j.saldo - n) });
    }
    const [, acc, mid] = id.split(":");
    const { data: m } = await sb.from("bot_manos").select("*").eq("id", mid).maybeSingle();
    if (!m || m.user_id !== user.id) return efimero("Esta mano no es suya.");
    if (m.estado !== "jugando") return json({ type: 7, data: { content: "Esta mano ya terminó.", embeds: [], components: botonesApuesta(j.saldo) } });
    if (acc === "hit") {
      const M = [...m.mazo], J = [...m.jug, M.shift()!];
      const { data: ok } = await sb.from("bot_manos").update({ jug: J, mazo: M }).eq("id", mid).eq("estado", "jugando").select("id");
      if (!ok?.length) return efimero("Esta mano ya terminó.");
      const nm = { ...m, jug: J, mazo: M };
      if (puntos(J) >= 21) { const r = await terminarMano(nm, user.id); return json({ type: 7, data: vistaMano(r.m, r.saldo, r.fin) }); }
      return json({ type: 7, data: vistaMano(nm, j.saldo) });
    }
    const r = await terminarMano(m, user.id);
    return json({ type: 7, data: vistaMano(r.m, r.saldo, r.fin) });
  }

  // bitácora del taller (botón tras fichar la salida en Discord)
  if (i.type === 3 && id === "bit:new") {
    if (!esPersonal) return efimero("La bitácora es del personal de la casa.");
    return json({ type: 9, data: { custom_id: "bit:form", title: "Bitácora del taller", components: [{ type: 1, components: [{ type: 4, custom_id: "texto", label: "¿Qué ha hecho hoy?", style: 2, required: true, min_length: 3, max_length: 800, placeholder: "Ej.: Fabriqué 30 de munición, atendí a 4 clientes y recibí el pedido de la mina." }] }] } });
  }
  if (i.type === 5 && id === "bit:form") {
    if (!esPersonal) return efimero("La bitácora es del personal de la casa.");
    const now = Date.now(), name = await nombreEmp();
    const T = (await lista("turno:", new Date(now - 12 * 3600000).toISOString())).map((r) => r.valor).filter((t: Any) => t.name === name).sort((a: Any, b: Any) => b.end - a.end)[0];
    const b = { id: "k" + u36(), ts: now, name, texto: limpio(v.texto, 800), start: T?.start || 0, end: T?.end || now, origen: "discord" };
    await guardar([["bitacora:" + b.id, b]]);
    await publicarBitacora(c, b);
    return efimero(`📓 Apuntado en ${c.canal_bitacora ? `<#${c.canal_bitacora}>` : "la bitácora"}. ¡Buen trabajo!`);
  }
  return null;
}
function cartel(b: Any) {
  const vivo = b.activo !== false;
  return { allowed_mentions: { parse: [] }, embeds: [{ title: vivo ? "📜 " + gotica("Se Busca") : "📜 ~~SE BUSCA~~ · retirado", color: vivo ? 0x8b5a2b : 0x555555, thumbnail: { url: WEB + "cartel-se-busca.webp" },
    description: `## ${limpio(b.nombre, 60).toUpperCase()}\n\n**Motivo:** ${limpio(b.motivo, 300)}${b.recompensa ? `\n**Recompensa:** ${dolar(b.recompensa)}` : ""}\n\n${vivo ? "Si lo ve, avise a la Casa Harrington (telegrama **SD8112**). La casa no le venderá nada." : `Cartel retirado el ${fecha(b.retirado || Date.now())}${b.retiradoPor ? " por " + limpio(b.retiradoPor, 40) : ""}.`}`,
    footer: { text: `Por orden de la Dirección · ${fecha(b.ts)} · Casa Harrington, Saint Denis` } }],
    components: vivo ? [{ type: 1, components: [{ type: 2, style: 2, label: "Retirar cartel (Dirección)", custom_id: "sb:del:" + b.id }] }] : [] };
}


