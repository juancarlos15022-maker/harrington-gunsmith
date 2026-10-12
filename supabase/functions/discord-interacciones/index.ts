// HARRINGTON GUNSMITH · V3 · Señor Harrington: botones y formularios de Discord
// Discord llama aquí cada vez que alguien pulsa un botón del bot. Se comprueba la firma de Discord (clave pública)
// y se responde. Flujo de solicitud de empleo:
//   1. El aspirante pulsa «📝 SOLICITAR ENTRAR» en su canal → rellena un formulario (nombre IC y por qué).
//   2. Señor Harrington publica la solicitud en el canal de Dirección con botones APRENDIZ · ARMERO · RECHAZAR.
//   3. Un JEFE o GERENTE pulsa un botón → se le da el rol del puesto (y se le quita el de aspirante) automáticamente,
//      se le avisa por mensaje privado y queda apuntado. Nadie más puede aprobar.
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
const hex = (h: string) => new Uint8Array((h.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));
async function firmaOk(req: Request, cuerpo: string, pub: string) {
  const sig = req.headers.get("x-signature-ed25519") || "", ts = req.headers.get("x-signature-timestamp") || "";
  if (!sig || !ts || !pub) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(pub), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex(sig), new TextEncoder().encode(ts + cuerpo));
  } catch { return false; }
}
async function api(c: Record<string, string>, metodo: string, ruta: string, cuerpo?: unknown, motivo?: string) {
  const h: Record<string, string> = { Authorization: "Bot " + c.token };
  if (motivo) h["X-Audit-Log-Reason"] = encodeURIComponent(motivo.slice(0, 400));
  if (cuerpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch("https://discord.com/api/v10" + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  await sb.from("bot_registro").insert({ metodo, ruta, motivo: (motivo || "").slice(0, 300), estado: r.status });
  const t = await r.text();
  try { return { st: r.status, d: t ? JSON.parse(t) : null }; } catch { return { st: r.status, d: t }; }
}
const efimero = (content: string) => json({ type: 4, data: { content, flags: 64 } });
const PUESTOS: Record<string, { k: string; n: string }> = { aprendiz: { k: "rol_aprendiz", n: "Aprendiz" }, armero: { k: "rol_armero", n: "Armero" } };
const limpio = (s: unknown, n: number) => String(s ?? "").replace(/@(everyone|here)/gi, "@​$1").replace(/<@[!&]?\d+>/g, "").trim().slice(0, n);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const cuerpo = await req.text();
  const c = await cfg();
  if (!(await firmaOk(req, cuerpo, c.public_key))) return new Response("firma no válida", { status: 401 });
  let i: Record<string, any> = {};
  try { i = JSON.parse(cuerpo); } catch { return json({ error: "JSON" }, 400); }
  if (i.type === 1) return json({ type: 1 }); // PING de Discord
  if (i.guild_id && c.guild_id && i.guild_id !== c.guild_id) return efimero("Este bot solo trabaja en el servidor de Harrington Gunsmith.");
  const user = i.member?.user || i.user || {}, roles: string[] = i.member?.roles || [];
  const id = String(i.data?.custom_id || "");

  // 1 · el aspirante pide entrar: formulario
  if (i.type === 3 && id === "sol:pedir") {
    if ([c.rol_aprendiz, c.rol_armero, c.rol_gerente, c.rol_jefe].some((r) => r && roles.includes(r))) return efimero("Ya formas parte de Harrington Gunsmith. 🎩");
    const { data: ya } = await sb.from("bot_solicitudes").select("estado").eq("user_id", user.id).maybeSingle();
    if (ya?.estado === "pendiente") return efimero("Tu solicitud ya está enviada. La Dirección te responderá pronto.");
    return json({ type: 9, data: { custom_id: "sol:form", title: "Solicitud · Harrington Gunsmith", components: [
      { type: 1, components: [{ type: 4, custom_id: "nombre", label: "Nombre y apellido de tu personaje (IC)", style: 1, min_length: 3, max_length: 60, required: true }] },
      { type: 1, components: [{ type: 4, custom_id: "motivo", label: "¿Por qué quieres trabajar en la armería?", style: 2, max_length: 500, required: false }] },
    ] } });
  }

  // 2 · formulario enviado: la solicitud va a Dirección con los botones
  if (i.type === 5 && id === "sol:form") {
    const v: Record<string, string> = {};
    for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
    const nombre = limpio(v.nombre, 60), motivo = limpio(v.motivo, 500);
    if (!c.canal_solicitudes) return efimero("La Dirección todavía no ha preparado el canal de solicitudes.");
    const m = await api(c, "POST", `/channels/${c.canal_solicitudes}/messages`, {
      content: (c.rol_jefe ? `<@&${c.rol_jefe}> ` : "") + "nueva solicitud de empleo",
      allowed_mentions: { roles: c.rol_jefe ? [c.rol_jefe] : [] },
      embeds: [{ title: "📝 Solicitud de empleo", color: 0xd7ae54, fields: [
        { name: "Discord", value: `<@${user.id}> (${limpio(user.username, 40)})`, inline: true },
        { name: "Personaje", value: nombre || "—", inline: true },
        { name: "Motivo", value: motivo || "—" },
      ], footer: { text: "Harrington Gunsmith · Saint Denis, 1880" }, timestamp: new Date().toISOString() }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "ACEPTAR COMO APRENDIZ", custom_id: `sol:ok:${user.id}:aprendiz` },
        { type: 2, style: 1, label: "ACEPTAR COMO ARMERO", custom_id: `sol:ok:${user.id}:armero` },
        { type: 2, style: 4, label: "RECHAZAR", custom_id: `sol:no:${user.id}` },
      ] }],
    });
    if (m.st >= 300) return efimero("No se ha podido enviar la solicitud ahora. Inténtalo en un momento.");
    await sb.from("bot_solicitudes").upsert({ user_id: user.id, usuario: limpio(user.username, 60), nombre, motivo, estado: "pendiente", mensaje_id: m.d?.id || null, creada: new Date().toISOString(), decidida: null, decidida_por: null, puesto: null });
    return efimero("✅ Solicitud enviada a la Dirección de Harrington Gunsmith. Te avisaremos en cuanto la revisen.");
  }

  // 3 · Dirección decide
  if (i.type === 3 && (id.startsWith("sol:ok:") || id.startsWith("sol:no:"))) {
    const aprob = [c.rol_jefe, c.rol_gerente].filter(Boolean);
    if (!roles.some((r) => aprob.includes(r))) return efimero("Solo la Dirección (JEFE o Gerente) puede aprobar solicitudes.");
    const [, accion, uid, puesto] = id.split(":");
    const quien = limpio(i.member?.nick || user.global_name || user.username, 60);
    const embed = (i.message?.embeds || [])[0] || { title: "📝 Solicitud de empleo" };
    if (accion === "ok") {
      const p = PUESTOS[puesto];
      if (!p || !c[p.k]) return efimero("Ese puesto no está configurado.");
      const a = await api(c, "PUT", `/guilds/${c.guild_id}/members/${uid}/roles/${c[p.k]}`, undefined, `Solicitud aceptada por ${quien} como ${p.n}`);
      if (a.st === 404) return efimero("Esa persona ya no está en el servidor.");
      if (a.st >= 300) return efimero("No he podido dar el rol (" + a.st + "). Revisa que el rol de Sr Harrington esté por encima de " + p.n + ".");
      if (c.rol_aspirante) await api(c, "DELETE", `/guilds/${c.guild_id}/members/${uid}/roles/${c.rol_aspirante}`, undefined, "Ya es empleado");
      await sb.from("bot_solicitudes").update({ estado: "aceptada", puesto: p.n, decidida: new Date().toISOString(), decidida_por: quien }).eq("user_id", uid);
      try {
        const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
        if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: `🎩 **¡Bienvenido a Harrington Gunsmith!** Tu solicitud ha sido aceptada como **${p.n}**. Ya tienes abiertos los canales de la empresa.` });
      } catch { /* mensajes privados cerrados */ }
      if (c.canal_bienvenida) await api(c, "POST", `/channels/${c.canal_bienvenida}/messages`, { content: `🎩 Demos la bienvenida a <@${uid}>, nuevo **${p.n}** de Harrington Gunsmith.`, allowed_mentions: { users: [uid] } });
      return json({ type: 7, data: { content: "", embeds: [{ ...embed, color: 0x3d8b52, footer: { text: `✅ Aceptado como ${p.n} por ${quien}` } }], components: [] } });
    }
    await sb.from("bot_solicitudes").update({ estado: "rechazada", decidida: new Date().toISOString(), decidida_por: quien }).eq("user_id", uid);
    try {
      const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
      if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: "Gracias por tu interés en Harrington Gunsmith. Por ahora tu solicitud no ha sido aceptada." });
    } catch { /* */ }
    return json({ type: 7, data: { content: "", embeds: [{ ...embed, color: 0x8b2e25, footer: { text: `❌ Rechazada por ${quien}` } }], components: [] } });
  }
  return efimero("Este botón ya no está disponible.");
});
