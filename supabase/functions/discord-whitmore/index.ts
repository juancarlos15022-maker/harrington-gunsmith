import {difundir,difundirEnSegundoPlano} from "./difusion.ts";
// Señor Whitmore · bot de Discord del gobierno (22/10/2026).
// Recibe las órdenes con /, los botones y los formularios de Whitmore (Interactions Endpoint URL del portal de Discord).
// Va aparte del Señor Harrington y de la web de la armería: configuración en whitmore_cfg, datos en gob_registros / gob_votos.
// Además: control desde aquí ({secreto, ops}), registro de órdenes ({secreto, registrar:true}) y avisos ({secreto, cron:true}).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { COMANDOS } from "./comandos.ts";
import { orden, boton, formulario, revision, eph, type Ctx } from "./gob.ts";
import { web, CORS } from "./web.ts";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const hex = (h: string) => new Uint8Array((h.match(/../g) || []).map((b) => parseInt(b, 16)));
let CFG: { t: number; c: Record<string, string> } | null = null;
async function cfg() {
  // Consultar la configuración vigente: retirar una delegación económica tiene efecto inmediato.
  const { data } = await sb.from("whitmore_cfg").select("clave,valor");
  const c = Object.fromEntries((data || []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  CFG = { t: Date.now(), c };
  return c;
}
async function firmaOk(req: Request, cuerpo: string, pub: string) {
  const sig = req.headers.get("x-signature-ed25519") || "", ts = req.headers.get("x-signature-timestamp") || "";
  if (!sig || !ts || !/^[0-9a-f]{64}$/i.test(pub || "") || !/^[0-9a-f]{128}$/i.test(sig)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(pub), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + cuerpo));
  } catch { return false; }
}
const token = (c: Record<string, string>) => Deno.env.get("WHITMORE_TOKEN") || c.token || "";
function ctxDe(c: Record<string, string>): Ctx {
  const tk = token(c);
  return { sb, c, api: async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: { Authorization: "Bot " + tk, "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(8000) });
    const d = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) { await sb.from("whitmore_registro").insert({ metodo, ruta: ruta.slice(0, 300), estado: r.status, motivo: "Error: " + JSON.stringify(d).slice(0, 300) }); throw Error("DISCORD_" + r.status); }
    return d;
  } };
}
// Control desde aquí (Claude): {secreto, ops:[{metodo, ruta, cuerpo, motivo, imagenes}]} → llamadas a Discord con el token de Whitmore.
// Solo rutas de la API de Discord; cada llamada queda en whitmore_registro. Nada de la web de la armería.
async function control(body: any, c: Record<string, string>) {
  if (!c.secreto || c.secreto.length < 32 || body?.secreto !== c.secreto) return json({ error: "NO" }, 403);
  const tk = token(c);
  if (body.preview) return json({ ok: true, token: !!tk, app: c.app_id });
  if (!tk) return json({ error: "FALTA_TOKEN" }, 503);
  if (body.cron) { try { const ctx=ctxDe(c);const hecho=await revision(ctx);const publicados=await difundir(ctx,12);return json({ ok: true, hecho, publicados }); } catch (e) { return json({ error: String((e as Error).message || e) }, 500); } }
  if (body.registrar) {
    const r = await fetch(`https://discord.com/api/v10/applications/${c.app_id}/guilds/${c.guild_id}/commands`, { method: "PUT", headers: { Authorization: "Bot " + tk, "Content-Type": "application/json" }, body: JSON.stringify(COMANDOS) });
    const d = await r.json().catch(() => null);
    await sb.from("whitmore_registro").insert({ metodo: "PUT", ruta: "/applications/commands", estado: r.status, motivo: "Registrar órdenes de gobierno" });
    return json({ ok: r.ok, st: r.status, n: Array.isArray(d) ? d.length : 0, error: r.ok ? null : d });
  }
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 25) : [];
  const res = [];
  for (const o of ops) {
    const metodo = String(o.metodo || "GET").toUpperCase(), ruta = String(o.ruta || "");
    if (!/^(GET|POST|PATCH|PUT|DELETE)$/.test(metodo) || !/^\/[A-Za-z0-9_\-\/?=&.%:@]+$/.test(ruta)) { res.push({ ruta, metodo, st: 400, datos: "RUTA_NO_VALIDA" }); continue; }
    // imágenes (foto de perfil, banner): se descargan del repositorio de la casa y van como data URI
    let fallo = false;
    if (o.imagenes && typeof o.imagenes === "object") {
      o.cuerpo = { ...(o.cuerpo || {}) };
      for (const [campo, url] of Object.entries(o.imagenes)) {
        const u = String(url);
        if (!/^https:\/\/(raw\.githubusercontent\.com\/juancarlos15022-maker\/|juancarlos15022-maker\.github\.io\/)/.test(u)) { res.push({ ruta, metodo, st: 400, datos: "IMAGEN_NO_PERMITIDA" }); fallo = true; break; }
        const im = await fetch(u); if (!im.ok) { res.push({ ruta, metodo, st: im.status, datos: "IMAGEN_NO_DESCARGADA" }); fallo = true; break; }
        const bytes = new Uint8Array(await im.arrayBuffer()); let bin = ""; for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        const tipo = /\.png$/i.test(u) ? "image/png" : /\.gif$/i.test(u) ? "image/gif" : "image/jpeg";
        o.cuerpo[campo] = "data:" + tipo + ";base64," + btoa(bin);
      }
    }
    if (fallo) continue;
    const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: { Authorization: "Bot " + tk, "Content-Type": "application/json", "X-Audit-Log-Reason": encodeURIComponent(String(o.motivo || "Señor Whitmore").slice(0, 400)) }, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) });
    const datos = r.status === 204 ? null : await r.json().catch(() => null);
    await sb.from("whitmore_registro").insert({ metodo, ruta: ruta.slice(0, 300), estado: r.status, motivo: String(o.motivo || "").slice(0, 400) });
    res.push({ ruta, metodo, st: r.status, datos });
    if (r.status === 429) break;
  }
  return json({ ok: true, res });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Señor Whitmore", { status: 200 });
  const cuerpo = await req.text();
  const c = await cfg();
  if (!req.headers.get("x-signature-ed25519")) {
    let b: any = null; try { b = JSON.parse(cuerpo); } catch { /* */ }
    // la web del gobierno (con su sesión), sin la clave de control
    if (b && b.web === true) {const ctx=ctxDe(c);const respuesta=await web(ctx,b);if(respuesta.ok)difundirEnSegundoPlano(ctx);return respuesta;}
    return control(b, c);
  }
  if (!(await firmaOk(req, cuerpo, c.public_key))) return new Response("firma no válida", { status: 401 });
  let i: any;
  try { i = JSON.parse(cuerpo); } catch { return new Response("JSON", { status: 400 }); }
  if (i.type === 1) return json({ type: 1 }); // PING de Discord al guardar el enlace
  if (i.guild_id && c.guild_id && i.guild_id !== c.guild_id) return eph("El Sr. Whitmore solo atiende en el servidor de la casa.");
  try {
    const ctx = ctxDe(c);
    if ([2,3,5].includes(i.type)) {const respuesta=await (i.type===2?orden(ctx,i):i.type===3?boton(ctx,i):formulario(ctx,i));difundirEnSegundoPlano(ctx);return respuesta;}
    return eph("No sé qué hacer con esto.");
  } catch (e) {
    const m = String((e as Error)?.message || e);
    await sb.from("whitmore_registro").insert({ metodo: "ORDEN", ruta: String(i?.data?.name || i?.data?.custom_id || "?").slice(0, 300), estado: 500, motivo: m.slice(0, 400) });
    return eph(/^No /.test(m) ? m : "Ha habido un problema y no he podido hacerlo. Inténtelo otra vez en un momento.");
  }
});
