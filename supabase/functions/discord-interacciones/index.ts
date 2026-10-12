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
//   6. Canal de plantilla (dirección): cada ficha tiene Ascender y Despedir, con confirmación; cambian la web, el rol y avisan por carta.
//   7. /precio y /stock (con autocompletado); fichar y ausencias con botones (mismos registros que la web);
//      /evento con «Me apunto»; sanciones con formulario y carta. Las piezas comunes están en comun.ts.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { catalogo, diaNum, duracion, fecha, hora, hoyNum, madrid, medianoche, ORO } from "./comun.ts";

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
const SIGUIENTE: Record<string, string> = { "Aprendiz de armero": "Armero", "Armero": "Armero experto", "Armero experto": "Gerente" };
const SUELDO: Record<string, number> = { "Gerente": 4000, "Armero experto": 3000, "Armero": 2500, "Aprendiz de armero": 2000 };
const dolar = (c: unknown) => "$" + (Number(c || 0) / 100).toFixed(2);
const CARTA_DESPIDO = "Por la presente se le comunica que **ha sido despedido de Harrington Gunsmith**.\n\nDesde este momento deja de pertenecer al personal de la casa: ya no tiene entrada a la web ni a los canales de la empresa. Sigue siendo bienvenido en el salón de visitas.";
// carta privada del Señor Harrington (si la persona tiene los mensajes privados cerrados, no pasa nada)
async function carta(c: Record<string, string>, uid: string, texto: string) {
  try {
    const dm = await api(c, "POST", "/users/@me/channels", { recipient_id: uid });
    if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: "🎩 **Casa Harrington · Saint Denis**\n\n" + texto + FIRMA });
  } catch { /* */ }
}
// las fichas del canal de plantilla se ponen al día al momento (si no, la revisión de cada medio minuto lo hace)
const refrescarPlantilla = (c: Record<string, string>) => fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/discord-puerta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secreto: c.secreto, solo: "plantilla" }) }).catch(() => null);
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const AUS_CATS = ["Viaje", "Trabajo", "Estudios", "Salud", "Asuntos personales", "Otro"];
type Aus = { id: string; empId: string; name: string; start: number; end: number; returned?: boolean; cancelled?: boolean };
// empleado de la web enlazado con este usuario de Discord
async function empleadoDe(uid: string) {
  const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  return (Array.isArray(data?.valor) ? data!.valor as Array<Record<string, string>> : []).find((e) => e && e.discord === uid) || null;
}
// escribe registros en la base de datos igual que la web (y avisa a todas las webs abiertas con «rev»)
async function guardar(filas: Array<[string, unknown]>) {
  const t = new Date().toISOString();
  const { error } = await sb.from("datos").upsert([...filas.map(([clave, valor]) => ({ clave, valor, actualizado: t })), { clave: "rev", valor: { n: Date.now() + "-" + Math.random().toString(36).slice(2, 6) }, actualizado: t }], { onConflict: "clave" });
  if (error) throw new Error(error.message);
}
async function registros<T>(prefijo: string) {
  const { data } = await sb.from("datos").select("valor").like("clave", prefijo + "%");
  return ((data ?? []) as Array<{ valor: T & { deleted?: boolean } }>).map((r) => r.valor).filter((v) => v && !v.deleted) as T[];
}
const activas = async (empId: string) => { const ahora = Date.now(); return (await registros<Aus>("ausencia:")).filter((a) => a.empId === empId && !a.cancelled && !a.returned && a.start <= ahora && (!a.end || a.end > ahora)); };
const publicar = (c: Record<string, string>, canal: string | undefined, embed: Record<string, unknown>) => canal ? api(c, "POST", `/channels/${canal}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ footer: PIE, ...embed }] }) : Promise.resolve(null);
const refrescarPaneles = (c: Record<string, string>) => fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/discord-puerta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secreto: c.secreto, solo: "paneles" }) }).catch(() => null);
// anuncio de un evento con su lista de apuntados y los botones
function anuncio(ev: { id: string; titulo: string; cuando: string; lugar?: string; detalles?: string; creador?: string; inscritos: Array<{ id: string; n: string }> }) {
  const L = ev.inscritos || [];
  return {
    embeds: [{ title: "📅 " + ev.titulo, color: ORO, description: ev.detalles || "",
      fields: [{ name: "Cuándo", value: ev.cuando || "—", inline: true }, ...(ev.lugar ? [{ name: "Dónde", value: ev.lugar, inline: true }] : []),
        { name: `Apuntados (${L.length})`, value: L.length ? L.map((x) => `<@${x.id}>`).join(", ").slice(0, 1024) : "Nadie todavía. ¡Sea usted el primero!" }],
      footer: { text: `Anunciado por ${ev.creador || "la Dirección"} · Señor Harrington` } }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Me apunto", emoji: { name: "✋" }, custom_id: "ev:si:" + ev.id }, { type: 2, style: 2, label: "Me borro", custom_id: "ev:no:" + ev.id }] }],
  };
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
      return efimero(`✅ Gracias. Ahora pase a ${ch("canal_seleccion")} y díganos si viene de visita o a trabajar.`);
    }
    if (paso === "visitante" || paso === "empleado") {
      if (!tiene("rol_paso1") && !tiene("rol_visitante")) return efimero("Antes ha de dar usted su palabra sobre las normas de esta casa.");
      if (esPlantilla) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
      if (paso === "visitante") {
        if (tiene("rol_visitante")) return efimero("Ya es usted visita de esta casa. 🚪");
        const r = await poner("rol_visitante", "Eligió acceso de visitante");
        if (r.st >= 300) return efimero(NO_PUEDO);
        await quitar("rol_paso1", "Ya eligió acceso");
        return efimero("🚪 Sea usted bienvenido. Ya tiene abierto el salón de visitas, con el catálogo y la aplicación de la casa. Si algún día quiere trabajar con nosotros, vuelva aquí y pulse «Para servir en la casa».");
      }
      if (tiene("rol_paso2") || tiene("rol_paso3") || tiene("rol_aspirante")) return efimero("Su trámite de ingreso ya está en curso.");
      const r = await poner("rol_paso2", "Eligió entrar como empleado");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso1", "Ya eligió acceso");
      return efimero(`🛠️ Muy bien. **Paso 1 de 3:** lea ${ch("canal_normas_servidor")} y pulse «Leídas y acatadas».`);
    }
    if (paso === "servidor") {
      if (esPlantilla || tiene("rol_paso3") || tiene("rol_aspirante")) return efimero("Ya dio usted fe de las normas del servidor. ✅");
      if (!tiene("rol_paso2")) return efimero("Antes ha de declarar, en la elección de acceso, que viene a servir en la casa.");
      const r = await poner("rol_paso3", "Aceptó la normativa del servidor");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso2", "Paso completado");
      return efimero(`✅ Hecho. **Paso 2 de 3:** lea ${ch("canal_normas_empresa")} y pulse «Empeño mi palabra».`);
    }
    if (paso === "empresa") {
      if (esPlantilla) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
      if (tiene("rol_aspirante")) return efimero(`Ya empeñó usted su palabra. Presente su solicitud en ${ch("canal_solicitud")}.`);
      if (!tiene("rol_paso3")) return efimero("Antes ha de acatar las normas del servidor.");
      const r = await poner("rol_aspirante", "Aceptó la normativa de Harrington Gunsmith");
      if (r.st >= 300) return efimero(NO_PUEDO);
      await quitar("rol_paso3", "Paso completado");
      return efimero(`✅ Hecho. **Paso 3 de 3:** presente su solicitud en ${ch("canal_solicitud")}.`);
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
    enSegundoPlano((async () => { await carta(c, uid, CARTA_DESPIDO); await refrescarPlantilla(c); })());
    const bd = b.data as Record<string, string> | null;
    const fic = bd?.estaba ? `Su ficha «${bd.nombre}» se ha retirado de la web y ya no podrá entrar en ella` : "No tenía ficha en la web";
    return json({ type: 7, data: { content: `✅ Queda despedido. ${fic}; ${("fuera" in r && r.fuera) ? "ya no se halla en el servidor" : "en Discord ha quedado como visita"}.`, components: [] } });
  }

  // plantilla: botones Ascender y Despedir de cada ficha (canal de la dirección)
  if (i.type === 3 && id.startsWith("plt:")) {
    if (!esDireccion()) return efimero("Solo la Dirección puede usar estos botones.");
    const [, acc, empId] = id.split(":");
    if (acc === "no") return json({ type: 7, data: { content: "Cancelado. Todo sigue como estaba.", components: [] } });
    const quien = limpio(i.member?.nick || user.global_name || user.username, 60);
    const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
    const e = (Array.isArray(data?.valor) ? data!.valor as Array<Record<string, string>> : []).find((x) => x && x.id === empId);
    if (!e) { enSegundoPlano(refrescarPlantilla(c)); return efimero("Esa persona ya no está en la plantilla. Retiro su ficha."); }
    const nom = limpio(e.name, 60), sig = SIGUIENTE[e.puesto];
    if (acc === "asc") {
      if (!sig) return efimero(`${nom} no tiene un rango superior al que ascender.`);
      return json({ type: 4, data: { flags: 64, content: `¿Ascender a **${nom}** de **${e.puesto}** a **${sig}**?\n\nSueldo: ${dolar(e.sueldo)} → **${dolar(SUELDO[sig])}** a la semana (el nuevo cuenta desde mañana).\n${e.discord ? "Se le cambiará el rol en Discord y se" : "No tiene Discord enlazado, así que su rol no cambiará; sí se"} publicará su contrato nuevo en el canal de contratos.`,
        components: [{ type: 1, components: [{ type: 2, style: 3, label: "Sí, ascender", custom_id: `plt:asc-si:${empId}` }, { type: 2, style: 2, label: "Mejor no", custom_id: "plt:no" }] }] } });
    }
    if (acc === "desp") {
      if (e.puesto === "Jefe") return efimero("Al Jefe no se le despide desde Discord.");
      return json({ type: 4, data: { flags: 64, content: `¿Despedir a **${nom}** (${limpio(e.puesto, 40)})?\n\nSe borrará su ficha de la web y perderá la entrada a ella${e.discord ? ", se le quitarán los canales de la casa, quedará como visita y recibirá una carta avisándole" : ". No tiene Discord enlazado: sus roles no se tocarán"}.`,
        components: [{ type: 1, components: [{ type: 2, style: 4, label: "Sí, despedir", custom_id: `plt:desp-si:${empId}` }, { type: 2, style: 2, label: "Mejor no", custom_id: "plt:no" }] }] } });
    }
    // lo que tarda (base de datos, roles, carta) se hace después de contestar; luego se cambia el mensaje con el resultado
    const fin = (content: string) => fetch(`https://discord.com/api/v10/webhooks/${c.app_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, components: [] }) });
    if (acc === "asc-si") {
      enSegundoPlano((async () => {
        const r = await sb.rpc("hg_ascenso_empleado", { p_id: empId, p_por: quien });
        if (r.error) return fin(r.error.message.includes("SIN_ASCENSO") ? `${nom} ya no tiene un rango superior.` : r.error.message.includes("SIN_CONTRATO") ? `A ${nom} le faltan los datos del contrato en la web: complételos primero.` : "No he podido ascenderle: " + r.error.message);
        const a = r.data as Record<string, string>;
        let rol = "";
        if (a.discord) { const x = await ajustarRoles(c, a.discord, `Ascendido a ${a.a} por ${quien}`); rol = ("fuera" in x && x.fuera) ? " Ya no está en el servidor, así que su rol no ha cambiado." : " Su rol de Discord ya está cambiado."; }
        await fin(`✅ **${nom}** asciende a **${a.a}** (${dolar(a.nuevo)} a la semana desde mañana).${rol} Su contrato nuevo saldrá en el canal de contratos en cuanto haya una web abierta.`);
        if (a.discord) await carta(c, a.discord, `Tengo el gusto de comunicarle que la Dirección le ha **ascendido a ${a.a}**. Su nuevo sueldo es de **${dolar(a.nuevo)}** a la semana, desde mañana, y su contrato nuevo se publicará en el canal de contratos.\n\nEnhorabuena, y siga sirviendo a la casa con el mismo empeño.`);
        await refrescarPlantilla(c);
      })());
      return json({ type: 6 });
    }
    if (acc === "desp-si") {
      enSegundoPlano((async () => {
        const r = await sb.rpc("hg_baja_por_id", { p_id: empId, p_por: quien });
        if (r.error) return fin(r.error.message.includes("JEFE") ? "Al Jefe no se le despide desde Discord." : "No he podido despedirle: " + r.error.message);
        const d = r.data as Record<string, string>;
        let rol = " No tenía Discord enlazado.";
        if (d.discord) { const x = await ajustarRoles(c, d.discord, "Despedido por " + quien); rol = ("fuera" in x && x.fuera) ? " Ya no estaba en el servidor." : " En Discord ha quedado como visita, sin los canales de la casa."; await carta(c, d.discord, CARTA_DESPIDO); }
        await fin(`✅ **${nom}** ha sido despedido. Su ficha se ha borrado de la web y ya no puede entrar en ella.${rol}`);
        await refrescarPlantilla(c);
      })());
      return json({ type: 6 });
    }
    return efimero("Este botón ha caído en desuso.");
  }

  // ── consultas rápidas: /precio y /stock (con autocompletado del nombre) ──
  if (i.type === 4 && (i.data?.name === "precio" || i.data?.name === "stock")) {
    const q = norm(String((i.data?.options || [])[0]?.value || ""));
    let nombres = (await catalogo(sb)).map((p) => p.nombre);
    if (i.data.name === "stock") { const { data } = await sb.from("stock").select("producto"); nombres = [...new Set([...nombres, ...((data ?? []) as Array<{ producto: string }>).map((r) => r.producto)])]; }
    const elegidos = nombres.filter((n) => !q || norm(n).includes(q)).slice(0, 25);
    return json({ type: 8, data: { choices: elegidos.map((n) => ({ name: n.startsWith("mat:") ? n.slice(4) + " (material)" : n, value: n })) } });
  }
  if (i.type === 2 && i.data?.name === "precio") {
    const q = String((i.data?.options || [])[0]?.value || ""), L = await catalogo(sb);
    const p = L.find((x) => x.nombre === q) || L.find((x) => norm(x.nombre).includes(norm(q)));
    if (!p) return efimero(`No conozco «${limpio(q, 40)}» en el catálogo de la casa. Empiece a escribir y elija de la lista.`);
    return efimero(`🏷️ **${p.nombre}** · ${p.precio > 0 ? `**${dolar(p.precio)}** la unidad` : "*por encargo*: el precio se pacta con el cliente"}.`);
  }
  if (i.type === 2 && i.data?.name === "stock") {
    if (!PLANTILLA.some((k) => c[k] && roles.includes(c[k]))) return efimero("Las existencias de la casa solo puede consultarlas el personal.");
    const q = String((i.data?.options || [])[0]?.value || "");
    const { data } = await sb.from("stock").select("producto,cantidad");
    const S = (data ?? []) as Array<{ producto: string; cantidad: number }>;
    const s = S.find((x) => x.producto === q) || S.find((x) => x.producto === "mat:" + q) || S.find((x) => norm(x.producto).includes(norm(q)));
    if (!s) return efimero(`No hay existencias apuntadas de «${limpio(q, 40)}». Si es un producto de la casa, ahora mismo quedan **0**.`);
    return efimero(`📦 **${s.producto.replace(/^mat:/, "")}**${s.producto.startsWith("mat:") ? " (material)" : ""}: quedan **${s.cantidad}** en el almacén.`);
  }

  // ── fichar desde Discord (lo mismo que en la web) ──
  if (i.type === 3 && (id === "fch:in" || id === "fch:out")) {
    const e = await empleadoDe(user.id);
    if (!e) return efimero("Solo el personal con ficha en la web puede fichar. Si es usted empleado y ve este aviso, pida a la Dirección que enlace su ficha con su Discord.");
    const { data: f } = await sb.from("datos").select("valor").eq("clave", "fichaje:" + e.id).maybeSingle();
    const abierto = f?.valor && !(f.valor as Record<string, unknown>).deleted ? f.valor as { start: number } : null;
    const ahora = Date.now();
    if (id === "fch:in") {
      if (abierto) return efimero(`Ya está usted dentro desde las ${hora(abierto.start)}. Cuando termine, pulse **Salgo de turno**.`);
      await guardar([["fichaje:" + e.id, { name: e.name, empId: e.id, start: ahora }]]);
      enSegundoPlano((async () => {
        await publicar(c, c.canal_turnos, { title: "🟢 Entrada · " + limpio(e.name, 60), color: 0x3d8b52, description: `${fecha(ahora)} ${hora(ahora)}\nFichada desde Discord.` });
        const aus = await activas(e.id);
        for (const a of aus) { await guardar([["ausencia:" + a.id, { ...a, returned: true, returnedAt: ahora }]]); await publicar(c, c.canal_ausencias, { title: "🏠 Regreso · " + limpio(e.name, 60), color: 0x3d8b52, description: `Ha vuelto el ${fecha(ahora)} ${hora(ahora)}${a.end && a.end > ahora ? " (antes de lo previsto)" : ""}.` }); }
        await refrescarPaneles(c);
      })());
      const h = +madrid(ahora).hour;
      return efimero(`${h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches"}, ${limpio(e.name, 40)}. Entrada a las **${hora(ahora)}**: que sea una jornada próspera. 🟢`);
    }
    if (!abierto) return efimero("No consta que haya fichado la entrada. Pulse **Entro de turno** al empezar.");
    const uid = "t" + ahora.toString(36) + Math.random().toString(36).slice(2, 5);
    await guardar([["turno:" + uid, { uid, name: e.name, start: abierto.start, end: ahora }], ["fichaje:" + e.id, { ts: ahora, deleted: true }]]);
    enSegundoPlano((async () => {
      const mismo = fecha(abierto.start) === fecha(ahora);
      await publicar(c, c.canal_turnos, { title: "🔴 Salida · " + limpio(e.name, 60), color: 0x8b2e25,
        description: (mismo ? `Fecha: ${fecha(ahora)}\nEntrada: ${hora(abierto.start)}\nSalida: ${hora(ahora)}` : `Entrada: ${fecha(abierto.start)} ${hora(abierto.start)}\nSalida: ${fecha(ahora)} ${hora(ahora)}`) + `\nTiempo: ${duracion(abierto.start, ahora)}\nFichada desde Discord.` });
      await refrescarPaneles(c);
    })());
    return efimero(`Buen trabajo, ${limpio(e.name, 40)}. Salida a las **${hora(ahora)}** tras ${duracion(abierto.start, ahora)}. ¡Hasta la próxima jornada! 🔴`);
  }

  // ── ausencias desde Discord: motivo (lista) → ficha (formulario) → apuntada en la web ──
  if (i.type === 3 && id === "aus:new") {
    const e = await empleadoDe(user.id);
    if (!e) return efimero("Solo el personal con ficha en la web puede avisar de una ausencia aquí.");
    return json({ type: 4, data: { flags: 64, content: "¿Cuál es el motivo de su ausencia?", components: [{ type: 1, components: [{ type: 3, custom_id: "aus:cat", placeholder: "Elija el motivo…", options: AUS_CATS.map((x, k) => ({ label: x, value: String(k) })) }] }] } });
  }
  if (i.type === 3 && id === "aus:cat") {
    const k = String((i.data?.values || [])[0] || "0");
    return json({ type: 9, data: { custom_id: "aus:form:" + k, title: "Aviso de ausencia · " + (AUS_CATS[+k] || "Otro"), components: [
      { type: 1, components: [{ type: 4, custom_id: "desde", label: "¿Desde cuándo?", style: 1, required: true, max_length: 20, placeholder: "hoy, mañana o una fecha: 20/10", value: "hoy" }] },
      { type: 1, components: [{ type: 4, custom_id: "dias", label: "¿Cuántos días? (vacío si no lo sabe)", style: 1, required: false, max_length: 3, placeholder: "Ej.: 3" }] },
      { type: 1, components: [{ type: 4, custom_id: "motivo", label: "Explique el motivo", style: 2, required: true, min_length: 3, max_length: 300, placeholder: "Ej.: Me voy de viaje con la familia y no podré conectarme." }] },
    ] } });
  }
  if (i.type === 5 && id.startsWith("aus:form:")) {
    const e = await empleadoDe(user.id);
    if (!e) return efimero("Solo el personal con ficha en la web puede avisar de una ausencia aquí.");
    const v: Record<string, string> = {};
    for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
    const cat = AUS_CATS[+id.split(":")[2]] || "Otro", ahora = Date.now(), hoy = hoyNum();
    const d = norm(v.desde || "hoy");
    let st = 0;
    if (!d || d === "hoy" || d === "ahora") st = ahora;
    else if (d === "manana") st = medianoche(hoy + 1);
    else if (d === "pasado manana" || d === "pasado") st = medianoche(hoy + 2);
    else { const mm = /^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/.exec(d); if (mm) { const y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : +madrid(ahora).year; const dn = diaNum(y, +mm[2], +mm[1]); if (dn >= hoy) st = dn === hoy ? ahora : medianoche(dn); } }
    if (!st) return efimero("No he entendido desde cuándo. Escriba **hoy**, **mañana** o una fecha como **20/10**, y vuelva a pulsar **Avisar una ausencia**.");
    const nd = String(v.dias || "").trim();
    if (nd && !/^\d{1,3}$/.test(nd)) return efimero("Los días han de ser un número (por ejemplo 3), o déjelo vacío si no sabe cuándo volverá.");
    const n = nd ? Math.max(1, Math.min(90, +nd)) : 0;
    const unit = !n ? "indef" : n % 7 === 0 && n / 7 <= 4 ? "semanas" : "dias", cuantos = unit === "semanas" ? n / 7 : n;
    const en = n ? st + n * 86400000 : 0;
    const todas = await registros<Aus>("ausencia:");
    if (todas.some((a) => a.empId === e.id && !a.cancelled && !a.returned && a.start < (en || Infinity) && (a.end || Infinity) > st)) return efimero("Ya tiene usted una ausencia avisada en esas fechas.");
    const rec = { id: "a" + ahora.toString(36) + Math.random().toString(36).slice(2, 5), empId: e.id, name: e.name, start: st, end: en, unit, n: cuantos, cat, motivo: limpio(v.motivo, 300).replace(/\s+/g, " "), ts: ahora, returned: false, cancelled: false };
    await guardar([["ausencia:" + rec.id, rec]]);
    const largo = unit === "indef" ? "sin fecha de vuelta" : `${cuantos} ${unit === "semanas" ? (cuantos === 1 ? "semana" : "semanas") : (cuantos === 1 ? "día" : "días")}`;
    enSegundoPlano((async () => {
      await publicar(c, c.canal_ausencias, { title: "✉️ Ausencia · " + limpio(e.name, 60), color: ORO, description: [`Desde: ${fecha(st)} ${hora(st)}`, `Duración: ${largo}`, `Vuelve: ${en ? fecha(en) + " " + hora(en) : "sin fecha de vuelta"}`, `Motivo: ${cat}`, `Explicación: ${rec.motivo}`, "Avisada desde Discord."].join("\n") });
      await refrescarPaneles(c);
    })());
    return efimero(`✅ Ausencia apuntada en la web: desde el ${fecha(st)}${en ? `, vuelve el ${fecha(en)}` : ", sin fecha de vuelta"}. Cuando regrese, pulse **He vuelto** (o fiche la entrada).`);
  }
  if (i.type === 3 && id === "aus:back") {
    const e = await empleadoDe(user.id);
    if (!e) return efimero("Solo el personal con ficha en la web usa este botón.");
    const ahora = Date.now(), todas = (await registros<Aus>("ausencia:")).filter((a) => a.empId === e.id && !a.cancelled && !a.returned && (!a.end || a.end > ahora));
    if (!todas.length) return efimero("No tiene ninguna ausencia en curso ni avisada.");
    for (const a of todas) {
      const fut = a.start > ahora;
      await guardar([["ausencia:" + a.id, { ...a, ...(fut ? { cancelled: true, cancelledAt: ahora } : { returned: true, returnedAt: ahora }) }]]);
      enSegundoPlano(publicar(c, c.canal_ausencias, fut ? { title: "Ausencia anulada · " + limpio(e.name, 60), color: ORO, description: `Ya no se ausentará desde el ${fecha(a.start)} ${hora(a.start)}.` } : { title: "🏠 Regreso · " + limpio(e.name, 60), color: 0x3d8b52, description: `Ha vuelto el ${fecha(ahora)} ${hora(ahora)}${a.end && a.end > ahora ? " (antes de lo previsto)" : ""}.` }));
    }
    enSegundoPlano(refrescarPaneles(c));
    return efimero(`¡Bienvenido de vuelta, ${limpio(e.name, 40)}! 🏠`);
  }

  // ── eventos con inscripción: /evento (Dirección) → anuncio con «Me apunto» ──
  if (i.type === 2 && i.data?.name === "evento") {
    if (!esDireccion()) return efimero("Solo la Dirección puede anunciar eventos.");
    return json({ type: 9, data: { custom_id: "ev:form", title: "Nuevo evento de la casa", components: [
      { type: 1, components: [{ type: 4, custom_id: "titulo", label: "Título", style: 1, required: true, max_length: 80, placeholder: "Ej.: Tirada al blanco en el campo de Saint Denis" }] },
      { type: 1, components: [{ type: 4, custom_id: "cuando", label: "¿Cuándo?", style: 1, required: true, max_length: 80, placeholder: "Ej.: Sábado 17 a las 21:00" }] },
      { type: 1, components: [{ type: 4, custom_id: "lugar", label: "¿Dónde? (opcional)", style: 1, required: false, max_length: 80 }] },
      { type: 1, components: [{ type: 4, custom_id: "detalles", label: "Detalles (opcional)", style: 2, required: false, max_length: 800 }] },
    ] } });
  }
  if (i.type === 5 && id === "ev:form") {
    if (!esDireccion()) return efimero("Solo la Dirección puede anunciar eventos.");
    const v: Record<string, string> = {};
    for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
    const ev = { id: "v" + Date.now().toString(36), titulo: limpio(v.titulo, 80), cuando: limpio(v.cuando, 80), lugar: limpio(v.lugar, 80), detalles: limpio(v.detalles, 800), creador: limpio(i.member?.nick || user.global_name || user.username, 60), inscritos: [] as Array<{ id: string; n: string }> };
    if (!c.canal_eventos) return efimero("No está dispuesto el canal de eventos.");
    const m = await api(c, "POST", `/channels/${c.canal_eventos}/messages`, { allowed_mentions: { parse: [] }, ...anuncio(ev) });
    if (m.st >= 300) return efimero("No he podido publicar el evento ahora. Inténtelo de nuevo.");
    await sb.from("bot_eventos").insert({ id: ev.id, mensaje_id: m.d?.id, titulo: ev.titulo, cuando: ev.cuando, lugar: ev.lugar, detalles: ev.detalles, creador: ev.creador });
    return efimero(`✅ Evento anunciado en ${ch("canal_eventos")}. El personal ya puede apuntarse.`);
  }
  if (i.type === 3 && (id.startsWith("ev:si:") || id.startsWith("ev:no:"))) {
    const evId = id.split(":")[2];
    const { data: f } = await sb.from("bot_eventos").select("*").eq("id", evId).maybeSingle();
    if (!f) return efimero("Este evento ya no existe.");
    const yo = { id: user.id, n: limpio(i.member?.nick || user.global_name || user.username, 40) };
    let L = (Array.isArray(f.inscritos) ? f.inscritos : []) as Array<{ id: string; n: string }>;
    const esta = L.some((x) => x.id === yo.id);
    if (id.startsWith("ev:si:")) { if (esta) return efimero("Ya estaba usted apuntado. ✋"); L = [...L, yo]; }
    else { if (!esta) return efimero("No estaba usted apuntado."); L = L.filter((x) => x.id !== yo.id); }
    await sb.from("bot_eventos").update({ inscritos: L }).eq("id", evId);
    return json({ type: 7, data: anuncio({ ...f, inscritos: L }) });
  }

  // ── sanciones con formulario (Dirección): empleado → falta y sanción → libro y carta ──
  if (i.type === 3 && id === "san:new") {
    if (!esDireccion()) return efimero("Solo la Dirección puede anotar sanciones.");
    const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
    const L = (Array.isArray(data?.valor) ? data!.valor as Array<Record<string, string>> : []).filter((e) => e && e.puesto !== "Jefe").slice(0, 25);
    if (!L.length) return efimero("No hay empleados a los que sancionar (a los Jefes no se les sanciona desde aquí).");
    return json({ type: 4, data: { flags: 64, content: "¿A quién se le anota la sanción?", components: [{ type: 1, components: [{ type: 3, custom_id: "san:emp", placeholder: "Elija al empleado…", options: L.map((e) => ({ label: limpio(e.name, 80), description: limpio(e.puesto, 50) || undefined, value: e.id })) }] }] } });
  }
  if (i.type === 3 && id === "san:emp") {
    if (!esDireccion()) return efimero("Solo la Dirección puede anotar sanciones.");
    const empId = String((i.data?.values || [])[0] || "");
    return json({ type: 9, data: { custom_id: "san:form:" + empId, title: "Anotar una sanción", components: [
      { type: 1, components: [{ type: 4, custom_id: "falta", label: "Falta cometida", style: 2, required: true, min_length: 3, max_length: 500, placeholder: "Ej.: Vendió por debajo del precio sin autorización." }] },
      { type: 1, components: [{ type: 4, custom_id: "sancion", label: "Sanción", style: 1, required: true, min_length: 3, max_length: 120, placeholder: "Ej.: Advertencia, descenso de rango, suspensión de 3 días…" }] },
    ] } });
  }
  if (i.type === 5 && id.startsWith("san:form:")) {
    if (!esDireccion()) return efimero("Solo la Dirección puede anotar sanciones.");
    const empId = id.split(":")[2];
    const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
    const e = (Array.isArray(data?.valor) ? data!.valor as Array<Record<string, string>> : []).find((x) => x && x.id === empId);
    if (!e) return efimero("Esa persona ya no está en la plantilla.");
    const v: Record<string, string> = {};
    for (const row of i.data?.components || []) for (const x of row.components || []) v[x.custom_id] = x.value;
    const falta = limpio(v.falta, 500), sancion = limpio(v.sancion, 120), quien = limpio(i.member?.nick || user.global_name || user.username, 60), ahora = Date.now();
    const m = c.canal_sanciones ? await api(c, "POST", `/channels/${c.canal_sanciones}/messages`, { allowed_mentions: { parse: [] }, embeds: [{ title: "⚖ Sanción · " + limpio(e.name, 60), color: 0x8b2e25, fields: [
      { name: "Fecha", value: `${fecha(ahora)} ${hora(ahora)}`, inline: true }, { name: "Rango", value: limpio(e.puesto, 40) || "—", inline: true }, { name: "Anotada por", value: quien || "Dirección", inline: true },
      { name: "Falta", value: falta || "—" }, { name: "Sanción", value: sancion || "—" }], footer: PIE }] }) : { st: 0, d: null };
    await sb.from("bot_sanciones").insert({ emp_id: e.id, nombre: e.name, discord: e.discord || null, falta, sancion, por: quien, mensaje_id: m.d?.id || null });
    await sb.from("datos").insert({ clave: "log:s" + ahora.toString(16) + e.id, valor: { id: "s" + ahora.toString(16) + e.id, ts: ahora, who: quien || "Dirección", cat: "Personal", lines: [`Sanción desde Discord a ${e.name}: ${sancion} (falta: ${falta.slice(0, 200)})`] }, actualizado: new Date().toISOString() });
    if (e.discord) enSegundoPlano(carta(c, e.discord, `Por la presente se le comunica que la Dirección le ha impuesto una **sanción**.\n\n**Falta:** ${falta}\n**Sanción:** ${sancion}\n\nConfiamos en que no vuelva a repetirse.`));
    return efimero(`✅ Sanción anotada en ${ch("canal_sanciones")}${e.discord ? " y comunicada por carta a " + limpio(e.name, 40) : ". No tiene Discord enlazado: no se le ha enviado carta"}.`);
  }

  // 1 · el aspirante pide entrar: formulario
  if (i.type === 3 && id === "sol:pedir") {
    if (PLANTILLA.some((k) => c[k] && roles.includes(c[k]))) return efimero("Usted ya pertenece a la Casa Harrington. 🎩");
    if (c.rol_aspirante && !roles.includes(c.rol_aspirante)) return efimero("Antes ha de acatar las normas del servidor y las de la Casa.");
    const { data: ya } = await sb.from("bot_solicitudes").select("estado").eq("user_id", user.id).maybeSingle();
    if (ya?.estado === "pendiente") return efimero("Su solicitud ya está en manos de la Dirección. En cuanto la lea, le contestará por mensaje privado.");
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
    return efimero("✅ Solicitud entregada. La Dirección la leerá y le contestará por mensaje privado.");
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
          const web = p.web ? `\n\n**Para empezar:**\n**1.** Lea los avisos en ${ch("canal_bandos")}.\n**2.** Entre en la web desde ${ch("canal_enlaces_personal")}: toque su tarjeta y cree su contraseña.\n**3.** Su contrato aparecerá en el canal de contratos.` : `\n\nComo colaborador no necesita la web: le basta con los canales de Discord. Empiece por ${ch("canal_bandos")}.`;
          if (dm.d?.id) await api(c, "POST", `/channels/${dm.d.id}/messages`, { content: `🎩 **Casa Harrington · Saint Denis**\n\nDistinguido aspirante:\n\nTengo el gusto de comunicarle que la Dirección ha tenido a bien admitirle como **${p.n}** de esta casa. Desde este momento tiene usted abiertas las dependencias del personal en nuestro Discord.${web}` + FIRMA });
        } catch { /* mensajes privados cerrados */ }
        const como = p.web ? `que desde hoy sirve en la Casa Harrington como **${p.n}**` : "que desde hoy colabora con la Casa Harrington";
        if (c.canal_bienvenida) await api(c, "POST", `/channels/${c.canal_bienvenida}/messages`, { content: `🎩 Sírvanse dar la bienvenida a <@${uid}>, ${como}.`, allowed_mentions: { users: [uid] } });
        await refrescarPlantilla(c);
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
