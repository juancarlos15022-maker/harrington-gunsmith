// HARRINGTON GUNSMITH · V2 · Cuentas seguras de los empleados (Supabase Auth)
// Al entrar con la tarjeta, la web manda aquí la contraseña. Se comprueba en el servidor (igual que la comprobaba
// la web) y se abre una sesión de Supabase a nombre de ese empleado. Así la base de datos sabe quién es quién.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...CORS, "Content-Type": "application/json" } });
const sha = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("harrington|" + t)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const fallos = new Map<string, { n: number; hasta: number }>();
const wnorm = (v: string) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const emailDe = (id: string) => `emp-${id.toLowerCase().replace(/[^a-z0-9]/g, "")}@empleados.harrington-gunsmith.invalid`;

async function fila(clave: string) {
  const { data, error } = await admin.from("datos").select("valor").eq("clave", clave).maybeSingle();
  if (error) throw error;
  return data ? data.valor : null;
}

async function abrirSesion(emp: { id: string; name?: string; puesto?: string }, modo: string) {
  const jefe = emp.puesto === "Jefe";
  const meta = { emp_id: emp.id, jefe, modo };
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { data: c } = await admin.from("cuentas").select("uid").eq("emp_id", emp.id).maybeSingle();
  let uid = c?.uid as string | undefined;
  if (uid) {
    const { error } = await admin.auth.admin.updateUserById(uid, { password, app_metadata: meta, user_metadata: { nombre: emp.name ?? "" } });
    if (error) uid = undefined;
  }
  if (!uid) {
    const { data, error } = await admin.auth.admin.createUser({ email: emailDe(emp.id), password, email_confirm: true, app_metadata: meta, user_metadata: { nombre: emp.name ?? "" } });
    if (error) {
      // ya existía en Auth pero no estaba apuntada: se busca por su correo
      const { data: l } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = l?.users?.find((x) => x.email === emailDe(emp.id));
      if (!u) throw error;
      uid = u.id;
      const { error: e2 } = await admin.auth.admin.updateUserById(uid, { password, app_metadata: meta });
      if (e2) throw e2;
    } else uid = data.user!.id;
  }
  await admin.from("cuentas").upsert({ emp_id: emp.id, uid, ultima: new Date().toISOString() });
  const pub = createClient(URL_, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: e3 } = await pub.auth.signInWithPassword({ email: emailDe(emp.id), password });
  if (e3 || !s.session) throw e3 || new Error("sin sesión");
  return { access_token: s.session.access_token, refresh_token: s.session.refresh_token, expires_at: s.session.expires_at, uid, jefe };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON no válido" }, 400); }
  try {
    const acc = String(b.accion || "");
    const id = String(b.empId || "").slice(0, 40);
    if (acc === "resumen") {
      // solo lo ve un jefe que ya ha entrado con su cuenta segura
      const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = tk ? await admin.auth.getUser(tk) : { data: null };
      if (!u?.user?.app_metadata?.jefe) return json({ error: "SOLO_JEFES" }, 401);
      const { data } = await admin.from("cuentas").select("emp_id,ultima");
      return json({ cuentas: data ?? [] });
    }
    const emps = (await fila("empleados")) as Array<{ id: string; name?: string; puesto?: string }> | null;
    const emp = Array.isArray(emps) ? emps.find((e) => e && e.id === id) : null;
    if (!emp || id === "prueba") return json({ error: "EMPLEADO" }, 404);
    if (acc === "estado") {
      if (emp.puesto === "Jefe") {
        const j = (await fila("jefe")) as { pw?: string } | null;
        return json({ tiene: !!(j && j.pw), jefe: true });
      }
      const h = await fila("clave-" + id);
      return json({ tiene: !!(h && (h as { h?: string }).h), jefe: false });
    }
    const pw = String(b.pw || "");
    if (!pw || pw.length > 80) return json({ error: "CONTRASENA" }, 400);
    const f = fallos.get(id);
    if (f && f.hasta > Date.now()) return json({ error: "BLOQUEADA" }, 429);

    if (acc === "crear") {
      // primera vez: la tarjeta todavía no tiene contraseña (si ya la tiene, no se pisa)
      if (emp.puesto === "Jefe") return json({ error: "JEFE" }, 400);
      if (pw.length < 4) return json({ error: "CONTRASENA" }, 400);
      const h = await sha("emp|" + id + "|" + pw);
      const { error } = await admin.from("datos").insert({ clave: "clave-" + id, valor: { h, ts: Date.now() }, actualizado: new Date().toISOString() });
      if (error) return json({ error: "YA_TIENE" }, 409);
      return json({ ok: true, ...(await abrirSesion(emp, "tarjeta")) });
    }

    if (acc === "nueva_jefe") {
      // contraseña de jefe olvidada: con la palabra de seguridad se pone una nueva
      if (emp.puesto !== "Jefe") return json({ error: "NO_JEFE" }, 400);
      const j = (await fila("jefe")) as { pw?: string; word?: string } | null;
      const ok = !!(j && j.word && (await sha(wnorm(String(b.word || "")))) === j.word);
      if (!ok) {
        const n = (f?.n ?? 0) + 1;
        fallos.set(id, n >= 5 ? { n: 0, hasta: Date.now() + 60000 } : { n, hasta: 0 });
        return json({ error: "MAL" }, 401);
      }
      if ((await sha(wnorm(pw))) === j!.word) return json({ error: "IGUAL_PALABRA" }, 400);
      fallos.delete(id);
      const { error } = await admin.from("datos").update({ valor: { ...j, pw: await sha(pw) }, actualizado: new Date().toISOString() }).eq("clave", "jefe");
      if (error) throw error;
      return json({ ok: true, ...(await abrirSesion(emp, "tarjeta")) });
    }

    if (acc === "entrar") {
      let ok = false;
      if (emp.puesto === "Jefe") {
        const j = (await fila("jefe")) as { pw?: string } | null;
        ok = !!(j && j.pw && (await sha(pw)) === j.pw);
      } else {
        const c = (await fila("clave-" + id)) as { h?: string } | null;
        if (!c || !c.h) return json({ error: "SIN_CONTRASENA" }, 404);
        ok = (await sha("emp|" + id + "|" + pw)) === c.h;
      }
      if (!ok) {
        const n = (f?.n ?? 0) + 1;
        fallos.set(id, n >= 5 ? { n: 0, hasta: Date.now() + 60000 } : { n, hasta: 0 });
        return json({ error: "MAL" }, 401);
      }
      fallos.delete(id);
      return json({ ok: true, ...(await abrirSesion(emp, "tarjeta")) });
    }
    return json({ error: "acción no válida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
