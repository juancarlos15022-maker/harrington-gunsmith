// HARRINGTON GUNSMITH · V3 · 20/10/2026
// Publica o actualiza una tarjeta en el canal de Discord de un tipo (proveedores, clientes…) con su propio webhook,
// igual que la web. Para mantenimiento: solo responde con la contraseña interna del bot (bot_cfg.secreto).
// En bot_registro queda apuntada cada llamada, sin el token del webhook.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: any = {}; try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const { data: s } = await sb.from("bot_cfg").select("valor").eq("clave", "secreto").maybeSingle();
  if (!s?.valor || s.valor.length < 20 || b.secreto !== s.valor) return json({ error: "NO" }, 403);
  const kind = String(b.kind || ""); if (!/^[a-z_]{3,30}$/.test(kind)) return json({ error: "TIPO" }, 400);
  const { data: d } = await sb.from("datos").select("valor").eq("clave", "discord").single();
  const hook = d?.valor?.urls?.[kind] || d?.valor?.url; if (!hook) return json({ error: "CANAL_NO_CONFIGURADO" }, 409);
  const u = new URL(hook); if (!/^(ptb\.|canary\.)?discord(app)?\.com$/.test(u.hostname) || !/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(u.pathname)) return json({ error: "DESTINO" }, 400);
  const wid = u.pathname.split("/")[3], mensaje = b.mensaje ? String(b.mensaje) : "";
  if (mensaje && !/^\d{15,22}$/.test(mensaje)) return json({ error: "MENSAJE" }, 400);
  u.search = ""; if (mensaje) u.pathname = u.pathname.replace(/\/$/, "") + "/messages/" + mensaje; else u.searchParams.set("wait", "true");
  const payload = { ...(b.payload || {}) }; delete payload._hg; payload.allowed_mentions = { parse: [] };
  const r = await fetch(u, { method: mensaje ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const t = await r.text(); let id = mensaje; try { id = String(JSON.parse(t).id || mensaje); } catch { /* */ }
  await sb.from("bot_registro").insert({ metodo: mensaje ? "PATCH" : "POST", ruta: `/webhooks/${wid}/…/messages/${mensaje || id}`, motivo: String(b.motivo || "Tarjeta de " + kind).slice(0, 300), estado: r.status });
  return json({ ok: r.ok, st: r.status, id, webhook: wid, error: r.ok ? undefined : t.slice(0, 300) });
});
