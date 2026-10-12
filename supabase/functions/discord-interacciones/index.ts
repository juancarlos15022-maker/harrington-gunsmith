// HARRINGTON GUNSMITH · V3 · Señor Harrington: botones, formularios y órdenes de Discord
// Discord llama aquí cada vez que alguien pulsa un botón del bot. Se comprueba la firma de Discord (clave pública)
// y se responde. Todo lo que escribe el Señor Harrington va con el habla de 1880 y los títulos en letra gótica.
//   0. Recorrido de entrada con botones: normas de Discord → visita o servir en la casa → normas del servidor →
//      normas de la casa → aspirante (cada paso exige el anterior y quita el rol del paso ya hecho).
//   1. El aspirante pulsa «Presentar mi solicitud» → formulario (nombre IC y telegrama obligatorios; motivo opcional).
//   2. La solicitud llega a Dirección con botones APRENDIZ · ARMERO · COLABORADOR · RECHAZAR.
//   3. Un JEFE o GERENTE pulsa: aprendiz o armero → ficha en la web (la web publica después el contrato) y rol;
//      colaborador → solo el rol (mismos canales que el personal, sin ficha ni web). Nadie más puede aprobar.
//   4. /despedir o clic derecho → Apps → «Despedir de Harrington»: quita la ficha de la web y deja a la persona como visita.
//   5. La web (Jefe o Gerente con sesión) avisa de altas, ascensos y despidos para ajustar los roles.
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
// trabajo que sigue después de contestar a Discord (tiene 3 segundos para recibir la respuesta)
function enSegundoPlano(p: Promise<unknown>) {
  const er = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p.catch(() => {})); else p.catch(() => {});
}
const efimero = (content: string) => json({ type: 4, data: { content, flags: 64 } });
// letra gótica de imprenta para los títulos (sin tildes ni eñes: esas letras no existen en gótica)
const gotica = (s: string) => [...s].map((ch) => {
  const n = ch.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return ch;
}).join("");
const PIE = { text: "Señor Harrington · Harrington Gunsmith · Saint Denis, 1880" };
const FIRMA = "\n\nDios guarde a usted muchos años.\n— *Señor Harrington*";
const NO_PUEDO = "Disculpe usted: no he podido abrirle paso en este momento. Tenga la bondad de intentarlo de nuevo dentro de un instante.";
const PUESTOS: Record<string, { k: string; n: string; web: string }> = {
  aprendiz: { k: "rol_aprendiz", n: "Aprendiz", web: "Aprendiz de armero" },
  armero: { k: "rol_armero", n: "Armero", web: "Armero" },
  colaborador: { k: "rol_colaborador", n: "Colaborador", web: "" }, // sin ficha ni web: solo los canales
};
// rol de Discord según el puesto de la web
const ROL_DE: Record<string, string> = { "Aprendiz de armero": "rol_aprendiz", "Armero": "rol_armero", "Armero experto": "rol_armero", "Gerente": "rol_gerente" };
const ROLES_EMPRESA = ["rol_aprendiz", "rol_armero", "rol_gerente", "rol_colaborador", "rol_aspirante", "rol_paso1", "rol_paso2", "rol_paso3"];
const PLANTILLA = ["rol_aprendiz", "rol_armero", "rol_gerente", "rol_jefe", "rol_colaborador"];
// deja a una persona con el rol que le toca según la web: el de su puesto o, si ya no está en la plantilla, visitante
async function ajustarRoles(c: Record<string, string>, uid: string, motivo: string) {
  const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  const emp = Array.isArray(data?.valor) ? (data!.valor as Array<Record<string, string>>).find((e) => e && e.discord === uid) : null;
  if (emp?.puesto === "Jefe") return { puesto: "Jefe", cambios: 0 };
  const m = await api(c, "GET", `/guilds/${c.guild_id}/members/${uid}`);
  if (m.st !== 200) return { fuera: true };
  const tiene: string[] = m.d?.roles || [];
  const quiero = emp ? c[ROL_DE[emp.puesto] || "rol_aprendiz"] : c.rol_visitante;
  let n = 0;
  for (const k of ROLES_EMPRESA) if (c[k] && c[k] !== quiero && tiene.includes(c[k])) { await api(c, "DELETE", `/guilds/${c.guild_id}/members/${uid}/roles/${c[k]}`, undefined, motivo); n++; }
  if (quiero && !tiene.includes(quiero)) { await api(c, "PUT", `/guilds/${c.guild_id}/members/${uid}/roles/${quiero}`, undefined, motivo); n++; }
  return { puesto: emp?.puesto || null, cambios: n };
}
const limpio = (s: unknown, n: number) => String(s ?? "").replace(/@(everyone|here)/gi, "@​$1").replace(/<@[!&]?\d+>/g, "").trim().slice(0, n);

// La web avisa de un cambio de plantilla (alta, ascenso, despido): se ajustan los roles según lo que diga la base de datos
async function desdeLaWeb(req: Request, cuerpo: string, c: Record<string, string>) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = tk ? await sb.auth.getUser(tk) : { data: null };
  const yo = u?.user?.app_metadata?.emp_id as string | undefined;
  const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  const lista = Array.isArray(data?.valor) ? data!.valor as Array<Record<string, string>> : [];
  const quien = lista.find((e) => e.id === yo);
  if (!quien || !["Jefe", "Gerente"].includes(quien.puesto)) return new Response(JSON.stringify({ error: "SOLO_DIRECCION" }), { status: 403, headers: cors });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(cuerpo); } catch { /* */ }
  const ids = (Array.isArray(b.discord) ? b.discord : [b.discord]).map((x) => String(x || "")).filter((x) => /^\d{15,22}$/.test(x)).slice(0, 10);
  const out = [];
  for (const d of ids) out.push({ discord: d, ...(await ajustarRoles(c, d, "Cambio de plantilla en la web (" + (quien.name || "Dirección") + ")")) });
  return new Response(JSON.stringify({ ok: true, res: out }), { status: 200, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const cuerpo = await req.text();
  const c = await cfg();
  if (!req.headers.get("x-signature-ed25519") && req.headers.get("authorization")) return desdeLaWeb(req, cuerpo, c);
  if (!(await firmaOk(req, cuerpo, c.public_key))) return new Response("firma no válida", { status: 401 });
  let i: Record<string, any> = {};
  try { i = JSON.parse(cuerpo); } catch { return json({ error: "JSON" }, 400); }
  if (i.type === 1) return json({ type: 1 }); // PING de Discord
  if (i.guild_id && c.guild_id && i.guild_id !== c.guild_id) return efimero("Esta no es la Casa Harrington: aquí no puedo servirle.");
  const user = i.member?.user || i.user || {}, roles: string[] = i.member?.roles || [];
  const id = String(i.data?.custom_id || "");
  const ch = (k: string) => c[k] ? `<#${c[k]}>` : "el canal siguiente";
  const esDireccion = () => [c.rol_jefe, c.rol_gerente].filter(Boolean).some((r) => roles.includes(r));

  // 0 · recorrido de entrada: aceptar normas y elegir acceso (cada botón exige el paso anterior)
  if (i.type === 3 && id.startsWith("onb:")) {
    const tiene = (k: string) => !!c[k] && roles.includes(c[k]);
    const esPlantilla = PLANTILLA.some(tiene);
    const poner = (k: string, why: string) => api(c, "PUT", `/guilds/${c.guild_id}/members/${user.id}/roles/${c[k]}`, undefined, why);
    const quitar = (k: string, why: string) => tiene(k) ? api(c, "DELETE", `/guilds/${c.guild_id}/members/${user.id}/roles/${c[k]}`, undefined, why) : Promise.resolve({ st: 204, d: null });
    const paso = id.slice(4);
    if (paso === "discord") {
      if (esPlantilla || ["rol_visitante", "rol_paso1", "rol_paso2", "rol_paso3", "rol_aspirante"].some(tiene)) return efimero("Ya dio usted su palabra sobre las normas de esta casa. ✅");
      const r = await poner("rol_paso1", "Aceptó la normativa de Discord");
      if (r.st >= 300) return efimero(NO_PUEDO);
      return efimero(`✅ Queda usted enterado de las normas. Sírvase pasar ahora a ${ch("canal_seleccion")} y declarar a qué viene.`);
    }
    if (paso === "visitante" || paso === "empleado") {
      if (!tiene("rol_paso1") && !tiene("rol_visitante")) return efimero("Antes ha de dar usted su palabra sobre las normas de esta casa.");
      if (esPlantilla) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
      if (paso === "visitante") {
        if (tiene("rol_visitante")) return efimero("Ya es usted visita de esta casa. 🚪");
        const r = await poner("rol_visitante", "Eligió acceso de visitante");
        if (r.st >= 300) return efimero(NO_PUEDO);
        await quitar("rol_paso1", "Ya eligió acceso");
        return efimero("🚪 Sea usted bienvenido. Tiene a su disposición el salón de visitas y el catálogo de la casa. Si algún día desea servir en ella, vuelva aquí y pulse «Para servir en la casa».");
      }
      if (tiene("rol_paso2") || tiene("rol_paso3") || tiene("rol_aspirante")) return efimero("Su trámite de ingreso ya está en curso.");
      const r = await poner("rol_paso2", "Eligió entrar como empleado");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso1", "Ya eligió acceso");
      return efimero(`🛠️ Excelente disposición. Sírvase leer y acatar ${ch("canal_normas_servidor")}.`);
    }
    if (paso === "servidor") {
      if (esPlantilla || tiene("rol_paso3") || tiene("rol_aspirante")) return efimero("Ya dio usted fe de las normas del servidor. ✅");
      if (!tiene("rol_paso2")) return efimero("Antes ha de declarar, en la elección de acceso, que viene a servir en la casa.");
      const r = await poner("rol_paso3", "Aceptó la normativa del servidor");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso2", "Paso completado");
      return efimero(`✅ Normas del servidor acatadas. Último requisito: ${ch("canal_normas_empresa")}.`);
    }
    if (paso === "empresa") {
      if (esPlantilla) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
      if (tiene("rol_aspirante")) return efimero(`Ya empeñó usted su palabra. Presente su solicitud en ${ch("canal_solicitud")}.`);
      if (!tiene("rol_paso3")) return efimero("Antes ha de acatar las normas del servidor.");
      const r = await poner("rol_aspirante", "Aceptó la normativa de Harrington Gunsmith");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso3", "Paso completado");
      return efimero(`✅ Palabra empeñada. Presente ahora su solicitud en ${ch("canal_solicitud")}.`);
    }
    return efimero("Este botón ha caído en desuso.");
  }

  // despedir: /despedir @persona o clic derecho → Apps → «Despedir de Harrington»
  if (i.type === 2 && (i.data?.name === "despedir" || i.data?.name === "Despedir de Harrington")) {
    if (!esDireccion()) return efimero("Solo la Dirección puede despedir a un miembro de la casa.");
    const uid = String(i.data?.target_id || (i.data?.options || [])[0]?.value || "");
    const objetivo = i.data?.resolved?.members?.[uid], usuario = i.data?.resolved?.users?.[uid];
    const nom = limpio(objetivo?.nick || usuario?.global_name || usuario?.username || uid, 60);
    const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
    const emp = Array.isArray(data?.valor) ? (data!.valor as Array<Record<string, string>>).find((e) => e && e.discord === uid) : null;
    if (emp?.puesto === "Jefe") return efimero("A un Jefe no se le despide desde Discord.");
    const esColab = !!c.rol_colaborador && (objetivo?.roles || []).includes(c.rol_colaborador);
    const info = emp ? ` (ficha en la web: **${limpio(emp.name, 60)}**, ${limpio(emp.puesto, 40)})` : esColab ? " (colaborador, sin ficha en la web)" : " (sin ficha en la web)";
    return json({ type: 4, data: { flags: 64, content: `¿Ha resuelto la Dirección despedir a **${nom}**${info}? Se retirará su ficha de la web, perderá la entrada a la web y a las dependencias de la casa, y quedará como mera visita.`,
      components: [{ type: 1, components: [{ type: 2, style: 4, label: "Sí, despedir", custom_id: `desp:si:${uid}` }, { type: 2, style: 2, label: "Mejor no", custom_id: "desp:no" }] }] } });
  }
  if (i.type === 3 && id.startsWith("desp:")) {
    if (!esDireccion()) return efimero("Solo la Dirección puede despedir a un miembro de la casa.");
    if (id === "desp:no") return json({ type: 7, data: { content: "Despido cancelado. Aquí no ha pasado nada.", components: [] } });
    const uid = id.split(":")[2];
    const quien = limpio(i.member?.nick || user.global_name || user.username, 60);
    const b = await sb.rpc("hg_baja_empleado", { p_discord: uid, p_por: quien });
    if (b.error) return json({ type: 7, data: { content: b.error.message.includes("JEFE") ? "A un Jefe no se le despide desde Discord." : "No he podido despedirle: " + b.error.message, components: [] } });
    const r = await ajustarRoles(c, uid, "Despedido por " + quien);
    enSegundoPlano((async () => {
      try {
        const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
        if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: "🎩 **Casa Harrington · Saint Denis**\n\nPor la presente se le comunica que ha dejado usted de servir en esta casa. Sigue siendo bienvenido en el salón de visitas." + FIRMA });
      } catch { /* */ }
    })());
    const bd = b.data as Record<string, string> | null;
    const fic = bd?.estaba ? `Su ficha «${bd.nombre}» se ha retirado de la web y ya no podrá entrar en ella` : "No tenía ficha en la web";
    return json({ type: 7, data: { content: `✅ Queda despedido. ${fic}; ${("fuera" in r && r.fuera) ? "ya no se halla en el servidor" : "en Discord ha quedado como visita"}.`, components: [] } });
  }

  // 1 · el aspirante pide entrar: formulario
  if (i.type === 3 && id === "sol:pedir") {
    if (PLANTILLA.some((k) => c[k] && roles.includes(c[k]))) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
    if (c.rol_aspirante && !roles.includes(c.rol_aspirante)) return efimero("Antes ha de acatar las normas del servidor y las de la Casa.");
    const { data: ya } = await sb.from("bot_solicitudes").select("estado").eq("user_id", user.id).maybeSingle();
    if (ya?.estado === "pendiente") return efimero("Su solicitud obra ya en poder de la Dirección. Tenga a bien aguardar respuesta.");
    return json({ type: 9, data: { custom_id: "sol:form", title: "Solicitud · Casa Harrington", components: [
      { type: 1, components: [{ type: 4, custom_id: "nombre", label: "Nombre y apellido de su personaje", style: 1, min_length: 3, max_length: 60, required: true, placeholder: "Ej.: Arthur Morgan" }] },
      { type: 1, components: [{ type: 4, custom_id: "telegrama", label: "Telegrama de su personaje", style: 1, min_length: 1, max_length: 10, required: true, placeholder: "Letras, números y guiones (máx. 10)" }] },
      { type: 1, components: [{ type: 4, custom_id: "motivo", label: "¿Por qué desea servir en la casa? (opcional)", style: 2, max_length: 500, required: false }] },
    ] } });
  }

  // 2 · formulario enviado: la solicitud va a Dirección con los botones
  if (i.type === 5 && id === "sol:form") {
    const v: Record<string, string> = {};
    for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
    const nombre = limpio(v.nombre, 60).replace(/\s+/g, " "), motivo = limpio(v.motivo, 500), tel = String(v.telegrama || "").toUpperCase().replace(/\s+/g, "");
    if (nombre.length < 3) return efimero("Falta el nombre de su personaje. Tenga la bondad de pulsar de nuevo el botón.");
    if (!/^[A-Z0-9-]{1,10}$/.test(tel)) return efimero("El telegrama solo admite letras, números y guiones (diez como mucho). Tenga la bondad de pulsar de nuevo el botón y enmendarlo.");
    if (!c.canal_solicitudes) return efimero("La Dirección aún no ha dispuesto la mesa de solicitudes.");
    const m = await api(c, "POST", `/channels/${c.canal_solicitudes}/messages`, {
      content: (c.rol_jefe ? `<@&${c.rol_jefe}> ` : "") + "ha llegado una solicitud a la mesa de la Dirección",
      allowed_mentions: { roles: c.rol_jefe ? [c.rol_jefe] : [] },
      embeds: [{ title: "✉️ " + gotica("Solicitud de Empleo"), color: 0xd7ae54, fields: [
        { name: "Discord", value: `<@${user.id}> (${limpio(user.username, 40)})`, inline: true },
        { name: "Personaje", value: nombre || "—", inline: true },
        { name: "Telegrama", value: tel, inline: true },
        { name: "Motivo", value: motivo || "—" },
      ], footer: PIE, timestamp: new Date().toISOString() }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "Admitir como aprendiz", custom_id: `sol:ok:${user.id}:aprendiz` },
        { type: 2, style: 1, label: "Admitir como armero", custom_id: `sol:ok:${user.id}:armero` },
        { type: 2, style: 2, label: "Admitir como colaborador", custom_id: `sol:ok:${user.id}:colaborador` },
        { type: 2, style: 4, label: "Rechazar", custom_id: `sol:no:${user.id}` },
      ] }],
    });
    if (m.st >= 300) return efimero("No he podido hacer llegar su solicitud. Inténtelo de nuevo dentro de un instante.");
    await sb.from("bot_solicitudes").upsert({ user_id: user.id, usuario: limpio(user.username, 60), nombre, telegrama: tel, motivo, estado: "pendiente", mensaje_id: m.d?.id || null, creada: new Date().toISOString(), decidida: null, decidida_por: null, puesto: null });
    return efimero("✅ Su solicitud obra ya en poder de la Dirección de la Casa Harrington. Recibirá usted aviso por carta privada en cuanto se resuelva.");
  }

  // 3 · Dirección decide
  if (i.type === 3 && (id.startsWith("sol:ok:") || id.startsWith("sol:no:"))) {
    if (!esDireccion()) return efimero("Solo la Dirección (Jefe o Gerente) puede resolver solicitudes.");
    const [, accion, uid, puesto] = id.split(":");
    const quien = limpio(i.member?.nick || user.global_name || user.username, 60);
    const embed = (i.message?.embeds || [])[0] || { title: "✉️ " + gotica("Solicitud de Empleo") };
    if (accion === "ok") {
      const p = PUESTOS[puesto];
      if (!p || !c[p.k]) return efimero("Ese puesto no está dispuesto todavía.");
      // 1) aprendiz o armero: ficha de empleado en la web (la web publica después su contrato). El colaborador no tiene ficha.
      if (p.web) {
        const { data: sol } = await sb.from("bot_solicitudes").select("nombre,telegrama").eq("user_id", uid).maybeSingle();
        const campo = (n: string) => String(((embed.fields || []) as Array<{ name: string; value: string }>).find((f) => f.name === n)?.value || "").trim();
        const nombreIC = (sol?.nombre || campo("Personaje")).replace(/^—$/, "");
        const telIC = (sol?.telegrama || campo("Telegrama")).replace(/^—$/, "");
        if (!nombreIC) return efimero("A esta solicitud le falta el nombre del personaje: pídale que la presente de nuevo.");
        const alta = await sb.rpc("hg_alta_empleado", { p_nombre: nombreIC, p_puesto: p.web, p_tel: telIC, p_discord: uid, p_por: quien });
        if (alta.error) return efimero("No he podido abrir su ficha en la web: " + alta.error.message);
      }
      const a = await api(c, "PUT", `/guilds/${c.guild_id}/members/${uid}/roles/${c[p.k]}`, undefined, `Solicitud aceptada por ${quien} como ${p.n}`);
      if (a.st === 404) return efimero("Esa persona ya no se halla en el servidor.");
      if (a.st >= 300) return efimero("No he podido otorgarle el rol (" + a.st + "). Compruebe que el rol del Señor Harrington esté por encima del de " + p.n + ".");
      // lo demás (quitar roles de los pasos, apuntarlo, avisarle) sigue en segundo plano para responder a tiempo a Discord
      const resto = (async () => {
        for (const k of ["rol_aspirante", "rol_paso1", "rol_paso2", "rol_paso3", "rol_visitante"]) if (c[k]) await api(c, "DELETE", `/guilds/${c.guild_id}/members/${uid}/roles/${c[k]}`, undefined, "Ya forma parte de la casa");
        await sb.from("bot_solicitudes").update({ estado: "aceptada", puesto: p.n, decidida: new Date().toISOString(), decidida_por: quien }).eq("user_id", uid);
        try {
          const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
          const web = p.web ? `\n\nEn ${ch("canal_enlaces_personal")} hallará la web de la casa: la primera vez que entre, se le pedirá que cree su contraseña. Su contrato se le extenderá en el canal de contratos.` : "";
          if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: `🎩 **Casa Harrington · Saint Denis**\n\nDistinguido aspirante:\n\nTengo el gusto de comunicarle que la Dirección ha tenido a bien admitirle como **${p.n}** de esta casa. Desde este momento tiene usted abiertas las dependencias del personal en nuestro Discord.${web}` + FIRMA });
        } catch { /* mensajes privados cerrados */ }
        const como = p.web ? `que desde hoy sirve en la Casa Harrington como **${p.n}**` : "que desde hoy colabora con la Casa Harrington";
        if (c.canal_bienvenida) await api(c, "POST", `/channels/${c.canal_bienvenida}/messages`, { content: `🎩 Sírvanse dar la bienvenida a <@${uid}>, ${como}.`, allowed_mentions: { users: [uid] } });
      })();
      enSegundoPlano(resto);
      return json({ type: 7, data: { content: "", embeds: [{ ...embed, color: 0x3d8b52, footer: { text: `✅ Admitido como ${p.n} por ${quien}${p.web ? " · ficha abierta en la web" : " · sin ficha en la web"}` } }], components: [] } });
    }
    enSegundoPlano((async () => {
      await sb.from("bot_solicitudes").update({ estado: "rechazada", decidida: new Date().toISOString(), decidida_por: quien }).eq("user_id", uid);
      try {
        const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
        if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: "🎩 **Casa Harrington · Saint Denis**\n\nDistinguido aspirante:\n\nLe agradecemos sinceramente su interés por esta casa. Lamento comunicarle que, por el momento, la Dirección no ha tenido a bien admitir su solicitud. Sigue usted siendo bienvenido en el salón de visitas." + FIRMA });
      } catch { /* */ }
    })());
    return json({ type: 7, data: { content: "", embeds: [{ ...embed, color: 0x8b2e25, footer: { text: `❌ Rechazada por ${quien}` } }], components: [] } });
  }
  return efimero("Este botón ha caído en desuso.");
});
