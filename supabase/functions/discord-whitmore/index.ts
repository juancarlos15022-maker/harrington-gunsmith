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
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Señor Whitmore", { status: 200 });
  const cuerpo = await req.text();
  const c = await cfg();
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
