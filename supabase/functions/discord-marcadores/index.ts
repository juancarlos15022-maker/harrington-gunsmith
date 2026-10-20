// HARRINGTON GUNSMITH · V3 · 20/10/2026
// Marcadores de color: repinta las tarjetas ya publicadas en los canales de Discord de cada categoría de Dirección
// con el color de su categoría (el lateral izquierdo de la tarjeta). No cambia textos, imágenes, adjuntos ni botones.
// Antes de editar un mensaje guarda su versión original en hg_discord_respaldo (para poder deshacerlo).
// Solo responde con la contraseña interna del bot (bot_cfg.secreto). Cada edición queda apuntada en bot_registro.
// Modos: «contar» (no cambia nada), «uno» (un mensaje, para probar), «todo» (con límite de tiempo; se puede repetir),
//        «deshacer» (vuelve a poner las tarjetas guardadas en el respaldo).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const API = "https://discord.com/api/v10";
const CAT_COLOR: Record<string, number> = { DINERO: 0xD4A93A, PERSONAL: 0x3F6FB0, TIENDA: 0xA8322A, ALMACEN: 0x3E8E4E, COMPRAS: 0xC2702A };
const KIND_CAT: Record<string, string> = { ventas: "DINERO", ventas_semanales: "DINERO", cierres: "DINERO", gastos: "DINERO", gastos_semanales: "DINERO", balance: "DINERO", anulaciones: "DINERO", mensual: "DINERO", resumen: "DINERO", empleados: "PERSONAL", fichajes: "PERSONAL", ausencias: "PERSONAL", sueldos: "PERSONAL", clientes: "TIENDA", agenda: "TIENDA", eventos: "TIENDA", encargos: "TIENDA", stock: "ALMACEN", materiales: "ALMACEN", fabricacion: "ALMACEN", proveedores: "COMPRAS", pedidos: "COMPRAS" };
// En los canales que comparten varias categorías se decide por el título de la tarjeta.
const POR_TITULO: Array<[RegExp, string]> = [
  [/ANULAD|ANULACI/i, "DINERO"], [/ENCARGO/i, "TIENDA"], [/ENTRADA|SALIDA|FICHAJE|TURNO/i, "PERSONAL"],
  [/BALANCE DE FABRICACI|FABRICACI|STOCK|MATERIAL|ALMAC/i, "ALMACEN"], [/PEDIDO|PROVEEDOR|ENTREGA (PARCIAL|FINAL)|ALBAR/i, "COMPRAS"],
  [/VENTA|TICKET|GASTO|CIERRE|CAJA|BALANCE|RESUMEN|INGRESO/i, "DINERO"],
  [/CLIENTE|CONTACTO|EVENTO|AGENDA/i, "TIENDA"], [/EMPLEADO|CONTRATO|SUELDO|N[OÓ]MINA|AUSENCIA|ASCENSO|PAGA/i, "PERSONAL"],
];
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pedir(url: string, init: RequestInit, intentos = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (r.status === 429 && i < intentos) { let s = 1; try { s = (await r.json()).retry_after || 1; } catch { /* */ } await espera(Math.min(8000, s * 1000 + 250)); continue; }
    if (r.headers.get("x-ratelimit-remaining") === "0") await espera(Math.min(5000, Number(r.headers.get("x-ratelimit-reset-after") || 1) * 1000));
    return r;
  }
}
const limpiar = (e: any) => {
  const o: any = {};
  for (const k of ["title", "description", "url", "timestamp", "color"]) if (e[k] !== undefined) o[k] = e[k];
  if (e.footer) o.footer = { text: e.footer.text, ...(e.footer.icon_url ? { icon_url: e.footer.icon_url } : {}) };
  if (e.author) o.author = { name: e.author.name, ...(e.author.url ? { url: e.author.url } : {}), ...(e.author.icon_url ? { icon_url: e.author.icon_url } : {}) };
  if (e.fields) o.fields = e.fields.map((f: any) => ({ name: f.name, value: f.value, ...(f.inline ? { inline: true } : {}) }));
  return o;
};
// Las imágenes que son adjuntos del propio mensaje se vuelven a referenciar como attachment:// para que no salgan duplicadas.
function imagen(u: string | undefined, adj: any[]) {
  if (!u) return undefined;
  try { const p = new URL(u).pathname; const a = adj.find((x) => p.endsWith("/" + x.filename)); return a ? "attachment://" + a.filename : u; } catch { return u; }
}
function nuevasTarjetas(m: any, color: number | null, convertir: boolean) {
  const ricas = (m.embeds || []).filter((e: any) => !e.type || e.type === "rich");
  const adj = m.attachments || [];
  if (ricas.length) {
    const embeds = ricas.map((e: any) => { const o = limpiar(e); if (color !== null) o.color = color; const im = imagen(e.image?.url, adj), th = imagen(e.thumbnail?.url, adj); if (im) o.image = { url: im }; if (th) o.thumbnail = { url: th }; return o; });
    return { embeds };
  }
  if (convertir && m.content && m.content.length <= 4000) return { content: "", embeds: [{ description: m.content, ...(color !== null ? { color } : {}) }] };
  return null;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: any = {}; try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor").in("clave", ["secreto", "token"]);
  const c = Object.fromEntries((filas ?? []).map((r: any) => [r.clave, r.valor]));
  if (!c.secreto || c.secreto.length < 20 || b.secreto !== c.secreto) return json({ error: "NO" }, 403);
  if (!c.token) return json({ error: "SIN_TOKEN" }, 503);
  const BOT = { Authorization: "Bot " + c.token, "User-Agent": "HarringtonGunsmith (https://juancarlos15022-maker.github.io/harrington-gunsmith/, 3.0)" };
  const modo = String(b.modo || "contar"), convertir = b.convertir === true, inicio = Date.now(), presupuesto = Math.min(140000, Number(b.ms) || 120000);
  const log = (metodo: string, ruta: string, motivo: string, estado: number) => sb.from("bot_registro").insert({ metodo, ruta, motivo: motivo.slice(0, 300), estado });

  if (modo === "deshacer") {
    const { data: rs } = await sb.from("hg_discord_respaldo").select("message_id,channel_id,original").limit(500);
    const hecho: any[] = [];
    for (const r of rs ?? []) {
      if (Date.now() - inicio > presupuesto) break;
      const o = r.original, ruta = o.webhook ? `${API}/webhooks/${o.webhook.id}/${o.webhook.token}/messages/${r.message_id}` : `${API}/channels/${r.channel_id}/messages/${r.message_id}`;
      const res = await pedir(ruta, { method: "PATCH", headers: { ...(o.webhook ? {} : BOT), "Content-Type": "application/json" }, body: JSON.stringify({ content: o.content ?? "", embeds: o.embeds, allowed_mentions: { parse: [] } }) });
      await log("PATCH", o.webhook ? `/webhooks/${o.webhook.id}/…/messages/${r.message_id}` : `/channels/${r.channel_id}/messages/${r.message_id}`, "Deshacer marcador de color", res.status);
      if (res.ok) await sb.from("hg_discord_respaldo").delete().eq("message_id", r.message_id);
      hecho.push({ id: r.message_id, st: res.status });
    }
    return json({ ok: true, deshechos: hecho.filter((x) => x.st < 300).length, fallos: hecho.filter((x) => x.st >= 300) });
  }

  const me = await (await pedir(`${API}/users/@me`, { headers: BOT })).json();
  const { data: d } = await sb.from("datos").select("valor").eq("clave", "discord").single();
  const urls: Record<string, string> = { ...(d?.valor?.urls || {}) }; if (d?.valor?.url) urls.general = d.valor.url;
  const hooks: Record<string, { token: string; kinds: string[] }> = {};
  for (const [k, u] of Object.entries(urls)) { try { const p = new URL(u).pathname.split("/"); const id = p[3], tk = p[4]; if (!/^\d+$/.test(id)) continue; (hooks[id] ||= { token: tk, kinds: [] }).kinds.push(k); } catch { /* */ } }
  const canales: Record<string, { kinds: string[]; hooks: string[] }> = {};
  const errores: any[] = [];
  for (const [id, h] of Object.entries(hooks)) {
    const r = await pedir(`${API}/webhooks/${id}/${h.token}`, {});
    if (!r.ok) { errores.push({ webhook: id, kinds: h.kinds, st: r.status }); continue; }
    const w = await r.json(); const ch = (canales[w.channel_id] ||= { kinds: [], hooks: [] }); ch.kinds.push(...h.kinds); ch.hooks.push(id);
  }
  const resumen: any[] = []; let editados = 0, pendiente = false; const muestras: any[] = [];
  const objetivo = b.mensaje ? String(b.mensaje) : "";
  for (const [cid, ch] of Object.entries(canales)) {
    const cats = [...new Set(ch.kinds.filter((k) => k !== "general").map((k) => KIND_CAT[k]).filter(Boolean))];
    const compartido = cats.length !== 1 || ch.kinds.includes("general");
    const base = cats[0] || "DINERO";
    const st = { canal: cid, kinds: ch.kinds, color: base, mensajes: 0, tarjetas: 0, yaBien: 0, aCambiar: 0, soloTexto: 0, ajenos: 0, bot: 0, editados: 0, fallos: 0, porCat: {} as Record<string, number> };
    let antes = "";
    for (let pag = 0; pag < 50; pag++) {
      const r = await pedir(`${API}/channels/${cid}/messages?limit=100${antes ? "&before=" + antes : ""}`, { headers: BOT });
      if (!r.ok) { errores.push({ canal: cid, kinds: ch.kinds, st: r.status }); break; }
      const lote: any[] = await r.json(); if (!lote.length) break; antes = lote[lote.length - 1].id;
      for (const m of lote) {
        if (objetivo && m.id !== objetivo) continue;
        st.mensajes++;
        const ricas = (m.embeds || []).filter((e: any) => !e.type || e.type === "rich");
        const titulo = ricas.map((e: any) => (e.title || "") + " " + String(e.description || "").slice(0, 80)).join(" ") || String(m.content || "").slice(0, 160);
        let cat = base; if (compartido) { const t = POR_TITULO.find(([re]) => re.test(titulo)); if (t && (cats.includes(t[1]) || ch.kinds.includes("general"))) cat = t[1]; }
        const color = CAT_COLOR[cat];
        const porWebhook = m.webhook_id && hooks[m.webhook_id] ? m.webhook_id : "";
        const delBot = !m.webhook_id && m.author?.id === me.id;
        if (!porWebhook && !delBot) { st.ajenos++; continue; }
        if (delBot) st.bot++;
        if (!ricas.length) { if (m.content) st.soloTexto++; if (!convertir || !m.content) continue; } else st.tarjetas++;
        if (ricas.length && ricas.every((e: any) => e.color === color)) { st.yaBien++; continue; }
        st.aCambiar++; st.porCat[cat] = (st.porCat[cat] || 0) + 1;
        if (muestras.length < 12 && modo === "contar") muestras.push({ canal: cid, id: m.id, titulo: titulo.slice(0, 70), de: porWebhook ? "webhook" : "bot", antes: ricas.map((e: any) => e.color), cat });
        if (modo === "contar") continue;
        if (Date.now() - inicio > presupuesto) { pendiente = true; continue; }
        const cuerpo = nuevasTarjetas(m, color, convertir); if (!cuerpo) continue;
        const original = { content: m.content || "", embeds: nuevasTarjetas(m, null, false)?.embeds || [], ...(porWebhook ? { webhook: { id: porWebhook, token: hooks[porWebhook].token } } : {}) };
        const g = await sb.from("hg_discord_respaldo").upsert({ message_id: m.id, channel_id: cid, original }, { onConflict: "message_id", ignoreDuplicates: true });
        if (g.error) { errores.push({ id: m.id, error: "RESPALDO" }); st.fallos++; continue; }
        const ruta = porWebhook ? `${API}/webhooks/${porWebhook}/${hooks[porWebhook].token}/messages/${m.id}` : `${API}/channels/${cid}/messages/${m.id}`;
        const res = await pedir(ruta, { method: "PATCH", headers: { ...(porWebhook ? {} : BOT), "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, allowed_mentions: { parse: [] } }) });
        await log("PATCH", porWebhook ? `/webhooks/${porWebhook}/…/messages/${m.id}` : `/channels/${cid}/messages/${m.id}`, "Marcador de color " + cat + " (" + titulo.slice(0, 60) + ")", res.status);
        let ok = res.ok, detalle: any = null;
        if (ok) {
          const n = await res.json();
          const adjOk = (n.attachments || []).length >= (m.attachments || []).length;
          const imgOk = ricas.every((e: any, i: number) => !!e.image === !!n.embeds?.[i]?.image && !!e.thumbnail === !!n.embeds?.[i]?.thumbnail);
          const colOk = (n.embeds || []).every((e: any) => e.color === color);
          const txtOk = ricas.length ? ricas.every((e: any, i: number) => (e.title || "") === (n.embeds?.[i]?.title || "") && (e.description || "") === (n.embeds?.[i]?.description || "")) : n.embeds?.[0]?.description === m.content;
          ok = adjOk && imgOk && colOk && txtOk; detalle = { adjOk, imgOk, colOk, txtOk, adjuntos: (n.attachments || []).length, adjAntes: (m.attachments || []).length, imagen: !!n.embeds?.[0]?.image, img: n.embeds?.[0]?.image?.url?.slice(0, 60) };
          if (modo === "uno") muestras.push({ id: m.id, canal: cid, titulo: titulo.slice(0, 70), cat, antes: ricas.map((e: any) => e.color), despues: (n.embeds || []).map((e: any) => e.color), ...detalle });
        }
        if (!ok) { st.fallos++; errores.push({ id: m.id, canal: cid, st: res.status, detalle, cuerpo: res.ok ? null : (await res.text().catch(() => "")).slice(0, 300) }); return json({ ok: false, parado: "La comprobación de la tarjeta editada no cuadra; me paro aquí", resumen: [...resumen, st], errores, muestras }); }
        st.editados++; editados++;
        if (modo === "uno") return json({ ok: true, modo, resumen: [st], muestras, errores });
      }
      if (lote.length < 100) break;
    }
    resumen.push(st);
  }
  return json({ ok: true, modo, editados, pendiente, segundos: Math.round((Date.now() - inicio) / 1000), resumen, errores, muestras });
});
