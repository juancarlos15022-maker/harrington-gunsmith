// Señor Whitmore · bot de Discord del gobierno (22/10/2026).
// Recibe las órdenes con / y los botones de Whitmore (Interactions Endpoint URL del portal de Discord).
// Va aparte del Señor Harrington: su configuración está en whitmore_cfg y su token en el secreto WHITMORE_TOKEN
// (o en whitmore_cfg.token). De momento solo se presenta; las funciones de gobierno se añaden después.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const hex = (h: string) => new Uint8Array((h.match(/../g) || []).map((b) => parseInt(b, 16)));
const AZUL = 0x2f4a6d;
let CFG: { t: number; c: Record<string, string> } | null = null;
async function cfg() {
  if (CFG && Date.now() - CFG.t < 60000) return CFG.c;
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
// Control desde aquí (Claude): {secreto, ops:[{metodo, ruta, cuerpo, motivo}]} → llamadas a Discord con el token de Whitmore.
// Solo rutas de la API de Discord; cada llamada queda en whitmore_registro. Nada de la web de la armería.
async function control(body: any, c: Record<string, string>) {
  if (!c.secreto || c.secreto.length < 32 || body?.secreto !== c.secreto) return json({ error: "NO" }, 403);
  const tk = token(c);
  if (body.preview) return json({ ok: true, token: !!tk, app: c.app_id });
  if (!tk) return json({ error: "FALTA_TOKEN" }, 503);
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 25) : [];
  const res = [];
  for (const o of ops) {
    const metodo = String(o.metodo || "GET").toUpperCase(), ruta = String(o.ruta || "");
    if (!/^(GET|POST|PATCH|PUT|DELETE)$/.test(metodo) || !/^\/[A-Za-z0-9_\-\/?=&.%:@]+$/.test(ruta)) { res.push({ ruta, metodo, st: 400, datos: "RUTA_NO_VALIDA" }); continue; }
    const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: { Authorization: "Bot " + tk, "Content-Type": "application/json", "X-Audit-Log-Reason": encodeURIComponent(String(o.motivo || "Señor Whitmore").slice(0, 400)) }, body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo) });
    const datos = r.status === 204 ? null : await r.json().catch(() => null);
    await sb.from("whitmore_registro").insert({ metodo, ruta: ruta.slice(0, 300), estado: r.status, motivo: String(o.motivo || "").slice(0, 400) });
    res.push({ ruta, metodo, st: r.status, datos });
    if (r.status === 429) break;
  }
  return json({ ok: true, res });
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Señor Whitmore", { status: 200 });
  const cuerpo = await req.text();
  const c = await cfg();
  if (!req.headers.get("x-signature-ed25519")) { let b: any = null; try { b = JSON.parse(cuerpo); } catch { /* */ } return control(b, c); }
  if (!(await firmaOk(req, cuerpo, c.public_key))) return new Response("firma no válida", { status: 401 });
  let i: any;
  try { i = JSON.parse(cuerpo); } catch { return new Response("JSON", { status: 400 }); }
  if (i.type === 1) return json({ type: 1 }); // PING de Discord al guardar el enlace
  // Por ahora, cualquier orden o botón recibe su presentación (solo la ve quien la usa).
  return json({ type: 4, data: { flags: 64, allowed_mentions: { parse: [] }, embeds: [{
    title: "🏛️ Señor Whitmore",
    description: "A su servicio. Soy el secretario del Consejo de Gobierno.\nMis funciones se están preparando: muy pronto me ocuparé de los asuntos de gobierno.",
    color: AZUL, footer: { text: "Consejo de Gobierno · Saint Denis · 1880" } }] } });
});
