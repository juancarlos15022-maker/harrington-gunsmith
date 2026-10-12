// HARRINGTON GUNSMITH · V2 · Avisos en el móvil (Web Push)
// La web la llama para: darse de alta un dispositivo, darse de baja y enviar un aviso a los demás.
// Las claves y las suscripciones están en tablas protegidas: solo esta función las lee (con la clave de servicio).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...CORS, "Content-Type": "application/json" } });
const TIPOS = new Set(["encargo-nuevo", "encargo-listo", "material-bajo", "npc-pendiente", "prueba"]);
const corta = (s: unknown, n: number) => String(s ?? "").slice(0, n);

let PUB = "";
async function vapid() {
  if (PUB) return PUB;
  const { data, error } = await sb.from("push_cfg").select("clave,valor");
  if (error) throw error;
  const m = Object.fromEntries((data ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  webpush.setVapidDetails("https://juancarlos15022-maker.github.io/harrington-gunsmith/", m.vapid_publica, m.vapid_privada);
  PUB = m.vapid_publica;
  return PUB;
}

async function cerrado() {
  const { data } = await sb.from("datos").select("valor").eq("clave", "acceso").maybeSingle();
  return !!(data?.valor as { cerrado?: boolean } | null)?.cerrado;
}
async function empleadoOk(req: Request) {
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tk) return false;
  const { data: u } = await sb.auth.getUser(tk);
  const id = u?.user?.app_metadata?.emp_id;
  if (!id) return false;
  const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  return Array.isArray(data?.valor) && (data!.valor as Array<{ id?: string }>).some((e) => e && e.id === id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON no válido" }, 400); }
  try {
    const pub = await vapid();
    const acc = String(b.accion || "");
    if (acc === "clave") return json({ publicKey: pub });
    if (acc === "baja") {
      const ep = corta(b.endpoint, 2000);
      if (ep) await sb.from("push_subs").delete().eq("endpoint", ep);
      return json({ ok: true });
    }
    // con la base de datos cerrada, darse de alta y enviar avisos solo con la cuenta segura de un empleado
    if (await cerrado() && !(await empleadoOk(req))) return json({ error: "SIN_CUENTA" }, 401);

    if (acc === "suscribir") {
      const sub = b.sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "suscripción no válida" }, 400);
      const { error } = await sb.from("push_subs").upsert({ endpoint: sub.endpoint, sub, emp_id: corta(b.empId, 40) || null, jefe: !!b.jefe, vista: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (acc === "enviar") {
      const tipo = String(b.tipo || "");
      if (!TIPOS.has(tipo)) return json({ error: "tipo no válido" }, 400);
      const aviso = JSON.stringify({ title: corta(b.titulo, 80) || "Harrington Gunsmith", body: corta(b.texto, 240), tag: tipo + "-" + corta(b.ref, 60), url: "./" });
      let q = sb.from("push_subs").select("endpoint,sub").limit(300);
      if (b.para === "jefes") q = q.eq("jefe", true);
      const { data, error } = await q;
      if (error) throw error;
      const excepto = corta(b.excepto, 2000);
      const solo = corta(b.solo, 2000);
      let enviados = 0, borrados = 0;
      await Promise.all((data ?? []).filter((r: { endpoint: string }) => solo ? r.endpoint === solo : r.endpoint !== excepto).map(async (r: { endpoint: string; sub: webpush.PushSubscription }) => {
        try { await webpush.sendNotification(r.sub, aviso, { TTL: 6 * 3600, urgency: "normal" }); enviados++; }
        catch (e) {
          const st = (e as { statusCode?: number }).statusCode;
          if (st === 404 || st === 410) { await sb.from("push_subs").delete().eq("endpoint", r.endpoint); borrados++; }
        }
      }));
      return json({ ok: true, enviados, borrados });
    }
    return json({ error: "acción no válida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
