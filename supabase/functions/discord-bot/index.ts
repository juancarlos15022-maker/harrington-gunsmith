// HARRINGTON GUNSMITH · V3 · Bot de Discord «Señor Harrington»
// Puerta segura para manejar el servidor de Discord (crear o borrar canales, roles, webhooks, mensajes…).
// Solo responde con la contraseña interna guardada en la tabla protegida bot_cfg; el token del bot nunca sale de aquí.
// Cada operación queda apuntada en bot_registro.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
let CFG: Record<string, string> | null = null, CFG_T = 0;
async function cfg() {
  if (CFG && Date.now() - CFG_T < 60000) return CFG;
  const { data } = await sb.from("bot_cfg").select("clave,valor");
  CFG = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  CFG_T = Date.now();
  return CFG;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  try {
    const c = await cfg();
    if (!c.secreto || c.secreto.length < 20 || b.secreto !== c.secreto) return json({ error: "NO" }, 403);
    if (!c.token) return json({ error: "SIN_TOKEN" }, 503);
    // una o varias llamadas a la API de Discord, en orden
    const ops = (Array.isArray(b.ops) ? b.ops : [b]).slice(0, 25) as Array<Record<string, unknown>>;
    const out = [];
    for (const op of ops) {
      const metodo = String(op.metodo || "GET").toUpperCase();
      const ruta = String(op.ruta || "");
      if (!/^\/[A-Za-z0-9_\-\/.?=&%@:]+$/.test(ruta) || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(metodo)) { out.push({ ruta, error: "RUTA" }); continue; }
      const h: Record<string, string> = { Authorization: "Bot " + c.token, "User-Agent": "HarringtonGunsmith (https://juancarlos15022-maker.github.io/harrington-gunsmith/, 3.0)" };
      if (op.motivo) h["X-Audit-Log-Reason"] = encodeURIComponent(String(op.motivo).slice(0, 400));
      let body: string | undefined;
      if (op.cuerpo !== undefined && metodo !== "GET") { h["Content-Type"] = "application/json"; body = JSON.stringify(op.cuerpo); }
      let r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: h, body });
      if (r.status === 429) { // límite de Discord: se espera lo que pide y se repite una vez
        const j = await r.json().catch(() => ({}));
        await new Promise((res) => setTimeout(res, Math.min(5000, Math.ceil((Number(j?.retry_after) || 1) * 1000))));
        r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: h, body });
      }
      const t = await r.text();
      let d: unknown = t;
      try { d = t ? JSON.parse(t) : null; } catch { /* texto */ }
      out.push({ ruta, metodo, st: r.status, datos: d });
      await sb.from("bot_registro").insert({ metodo, ruta, motivo: String(op.motivo || "").slice(0, 300), estado: r.status });
    }
    return json({ ok: true, res: out });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
