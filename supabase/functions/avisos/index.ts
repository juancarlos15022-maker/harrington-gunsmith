// HARRINGTON GUNSMITH · V2 · Avisos en el móvil (Web Push)
// La web la llama para: darse de alta un dispositivo, darse de baja y enviar un aviso a los demás.
// Las claves y las suscripciones están en tablas protegidas: solo esta función las lee (con la clave de servicio).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "https://juancarlos15022-maker.github.io",
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
    const tk=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+tk}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:permitido}=await caller.rpc('hg_permitido');if(!tk||!permitido)return json({error:'SIN_CUENTA'},401);
    const {data:u}=await caller.auth.getUser();const emp=u.user?.app_metadata?.emp_id;if(!emp)return json({error:'SIN_CUENTA'},401);
    const {data:owner}=await caller.rpc('hg_es_jefe');
    const {data:limit,error:limitError}=await sb.rpc('hg_consumir_limite',{p_key:'push:'+u.user!.id,p_max:20,p_segundos:600});if(limitError||limit!==true)return json({error:'LIMITE'},429);
    if(acc==='baja'){
      const ep=corta(b.endpoint,2000);await sb.from('push_subs').delete().eq('endpoint',ep).eq('emp_id',emp);return json({ok:true});
    }
    if (acc === "suscribir") {
      const sub = b.sub as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "suscripción no válida" }, 400);
      const url=new URL(sub.endpoint);if(url.port&&url.port!=='443'||url.username||url.password||!(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(url.hostname)||/(^|\.)notify\.windows\.com$/.test(url.hostname)))return json({error:'SERVICIO_PUSH_NO_PERMITIDO'},400);
      const {data:prev}=await sb.from('push_subs').select('emp_id').eq('endpoint',sub.endpoint).maybeSingle();if(prev?.emp_id&&prev.emp_id!==emp)return json({error:'DISPOSITIVO_AJENO'},403);
      const { error } = await sb.from("push_subs").upsert({ endpoint: sub.endpoint, sub, emp_id: emp, jefe: !!owner, vista: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (acc === "enviar") {
      const tipo = String(b.tipo || "");
      if (!TIPOS.has(tipo)) return json({ error: "tipo no válido" }, 400);
      let titulo=corta(b.titulo,80),texto=corta(b.texto,240);let destino=String(b.para||'todos');
      if(!owner){
       const ref=String(b.ref||'');
       if(tipo==='encargo-nuevo'||tipo==='encargo-listo'){
        const {data:e}=await sb.from('datos').select('valor').eq('clave','encargo:'+ref).maybeSingle();if(!e||tipo==='encargo-listo'&&e.valor.fab!=='FABRICADO')return json({error:'ENCARGO_NO_CONFIRMADO'},403);
        titulo=(tipo==='encargo-nuevo'?'Nuevo encargo · ':'Encargo listo · ')+e.valor.client;texto=(e.valor.items||[]).map((x:any)=>x.qty+' × '+x.name).join(', ');destino='todos';
       }else if(tipo==='material-bajo'){
        const {data:st}=await sb.from('stock').select('cantidad,minimo').eq('producto',ref).maybeSingle();if(!st||st.cantidad>st.minimo)return json({error:'NO_ESTA_BAJO_MINIMO'},403);titulo='Material bajo mínimo · '+ref.replace(/^mat:/,'');texto='Quedan '+st.cantidad+' (mínimo '+st.minimo+').';destino='jefes';
       }else if(tipo==='npc-pendiente'){
        const {data:n}=await sb.from('datos').select('valor').eq('clave','npc:estado').maybeSingle();if(!n?.valor?.rev?.pending)return json({error:'NPC_SIN_REVISION_PENDIENTE'},403);titulo='Revisión del NPC pendiente';texto='Comprueba las existencias del NPC.';destino='jefes';
       }else if(tipo==='prueba'){
        const ep=String(b.solo||'');const {data:p}=await sb.from('push_subs').select('emp_id').eq('endpoint',ep).maybeSingle();if(p?.emp_id!==emp)return json({error:'SOLO_DISPOSITIVO_PROPIO'},403);titulo='Avisos de Harrington';texto='Prueba de avisos en tu dispositivo.';
       }else return json({error:'TIPO_NO_PERMITIDO'},403);
      }
      const aviso = JSON.stringify({ title: titulo || "Harrington Gunsmith", body: texto, tag: tipo + "-" + corta(b.ref, 60), url: "./" });
      let q = sb.from("push_subs").select("endpoint,sub").limit(300);
      if (destino === "jefes") q = q.eq("jefe", true);
      const { data, error } = await q;
      if (error) throw error;
      const excepto = corta(b.excepto, 2000);
      const solo = corta(b.solo, 2000);
      let enviados = 0, borrados = 0;
      await Promise.all((data ?? []).filter((r: { endpoint: string }) => solo ? r.endpoint === solo : r.endpoint !== excepto).map(async (r: { endpoint: string; sub: webpush.PushSubscription }) => {
        try { const ep=new URL(r.endpoint);if(ep.protocol!=='https:'||ep.port&&ep.port!=='443'||ep.username||ep.password||r.sub.endpoint!==r.endpoint||!(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(ep.hostname)||/(^|\.)notify\.windows\.com$/.test(ep.hostname)))return;await webpush.sendNotification(r.sub, aviso, { TTL: 6 * 3600, urgency: "normal" }); enviados++; }
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

