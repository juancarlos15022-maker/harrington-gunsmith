import {oficina} from "./oficina.ts";
import {actualizarCuentas} from './cuentas.ts';
// Web del Gobierno de Silver Peak (22/10/2026): la web llama aquí ({web:true, accion, sesion, …}).
// Entrada con el enlace de /acceso; sesiones de 30 días; los roles se vuelven a mirar en Discord cada 10 minutos
// (si alguien pierde el rol del Consejo, su sesión se cierra). Lo que se hace en la web se publica en Discord igual que con las órdenes.
import { hacienda } from "./hacienda.ts";
import { secretarias } from "./secretarias.ts";
import { campana } from "./campana.ts";
import { type Ctx, nuevo, publicar, repintar, cambiar, leer, tarjetaCita, tarjetaAudiencia, tarjetaDecreto, tarjetaTelegrama, tarjetaPropuesta,
  telegramaTxt, firmaDe, votos, votar, saldo, textoDocumento, leerFecha, fechaTxt, inicioDia, limpio, TIPO_DOC } from "./gob.ts";
type Any = any;
const ORIGEN = "https://juancarlos15022-maker.github.io";
export const CORS = { "Access-Control-Allow-Origin": ORIGEN, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin" };
const respuesta = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (t: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const nuevoToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
class Fallo extends Error { codigo: string; st: number; constructor(codigo: string, st = 400) { super(codigo); this.codigo = codigo; this.st = st; } }

/* ---------- quién es y qué puede ---------- */
let GUILD: { t: number; owner: string; admins: Set<string> } | null = null;
async function guild(ctx: Ctx) {
  if (GUILD && Date.now() - GUILD.t < 600000) return GUILD;
  const [g, roles] = await Promise.all([ctx.api("GET", `/guilds/${ctx.c.guild_id}`),ctx.api("GET", `/guilds/${ctx.c.guild_id}/roles`)]);
  const admins = new Set<string>((roles || []).filter((r: Any) => (BigInt(r.permissions || "0") & 8n) === 8n).map((r: Any) => String(r.id)));
  GUILD = { t: Date.now(), owner: String(g.owner_id || ""), admins };
  return GUILD;
}
async function miembro(ctx: Ctx, uid: string) {
  let m: Any;
  try { m = await ctx.api("GET", `/guilds/${ctx.c.guild_id}/members/${uid}`); } catch { return null; }
  const roles: string[] = m.roles || [], c = ctx.c, g = await guild(ctx);
  const admin = !!g && (g.owner === uid || roles.some((r) => g.admins.has(r)));
  const tiene = (k: string) => admin || (!!c["rol_" + k] && roles.includes(c["rol_" + k]));
  const flags = { gobernador: tiene("gobernador"), gobernacion: tiene("gobernacion"), economia: tiene("economia"), festejos: tiene("festejos"), consejo: tiene("consejo") || tiene("gobernador") || tiene("gobernacion") || tiene("economia") || tiene("festejos"), admin };
  const u = m.user || {};
  const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=96` : "";
  return { nombre: limpio(m.nick || u.global_name || u.username || "—", 60), avatar, roles: flags };
}
function cargo(r: Any) { return r.gobernador ? "Gobernador" : r.gobernacion ? "Secretaría de Gobernación" : r.economia ? "Secretaría de Economía y Comercio" : r.festejos ? "Secretaría de Festejos y Cultura" : "Consejo de Gobierno"; }

async function entrar(ctx: Ctx, t: string) {
  if (!/^[0-9a-f]{64}$/.test(t)) throw new Fallo("ENLACE_NO_VALIDO");
  const h = await sha(t);
  const { data: a } = await ctx.sb.from("gob_accesos").update({ usado: new Date().toISOString() }).eq("token_hash", h).is("usado", null).gt("expira", new Date().toISOString()).select("*").maybeSingle();
  if (!a) throw new Fallo("ENLACE_CADUCADO", 401);
  const m = await miembro(ctx, a.usuario_id);
  if (!m || !m.roles.consejo) throw new Fallo("SIN_ROL", 403);
  const sesion = nuevoToken();
  await ctx.sb.from("gob_sesiones").insert({ token_hash: await sha(sesion), usuario_id: a.usuario_id, nombre: m.nombre, avatar: m.avatar, roles: m.roles, expira: new Date(Date.now() + 30 * 86400000).toISOString() });
  return { sesion, yo: { id: a.usuario_id, nombre: m.nombre, avatar: m.avatar, roles: m.roles, cargo: cargo(m.roles) } };
}
async function sesionDe(ctx: Ctx, s: string) {
  if (!/^[0-9a-f]{64}$/.test(s || "")) throw new Fallo("SIN_SESION", 401);
  const h = await sha(s);
  const { data: r } = await ctx.sb.from("gob_sesiones").select("*").eq("token_hash", h).is("revocado", null).gt("expira", new Date().toISOString()).maybeSingle();
  if (!r) throw new Fallo("SIN_SESION", 401);
  if (Date.now() - new Date(r.comprobado).getTime() > 10 * 60000) {
    const m = await miembro(ctx, r.usuario_id);
    if (!m || !m.roles.consejo) { await ctx.sb.from("gob_sesiones").update({ revocado: new Date().toISOString() }).eq("usuario_id", r.usuario_id).is("revocado", null); throw new Fallo("SIN_ROL", 403); }
    await ctx.sb.from("gob_sesiones").update({ nombre: m.nombre, avatar: m.avatar, roles: m.roles, comprobado: new Date().toISOString() }).eq("token_hash", h);
    Object.assign(r, { nombre: m.nombre, avatar: m.avatar, roles: m.roles });
  }
  return { h, id: r.usuario_id as string, nombre: r.nombre as string, avatar: r.avatar as string, roles: r.roles as Record<string, boolean> };
}

/* ---------- datos para la web ---------- */
const ms = (v: Any) => v ? new Date(v).getTime() : 0;
function plano(r: Any) { return { id: r.id, tipo: r.tipo, numero: r.numero, estado: r.estado, cuando: ms(r.cuando), creado: ms(r.creado), autor: r.autor, datos: r.datos }; }
async function lista(ctx: Ctx, tipo: string | string[], f: (q: Any) => Any = (q) => q, lim = 50) {
  let q = ctx.sb.from("gob_registros").select("*");
  q = Array.isArray(tipo) ? q.in("tipo", tipo) : q.eq("tipo", tipo);
  const { data } = await f(q).limit(lim);
  return (data || []).map(plano);
}
async function conVotos(ctx: Ctx, l: Any[]) {
  for (const p of l) { const v = await votos(ctx, p.id); p.si = v.si.map((x: Any) => x.nombre); p.no = v.no.map((x: Any) => x.nombre); }
  return l;
}
const necesita = (y: Any, ...k: string[]) => { if (!k.some((r) => y.roles[r] || y.roles.admin)) throw new Fallo("SIN_PERMISO", 403); };
const quien = (y: Any) => ({ id: y.id, nombre: y.nombre });

async function organizacion(ctx:Ctx){
 const claves=['web','comandos','chat','agenda','campana','telegramas','documentos','cuentas','area_economia','area_comercio','area_justicia','area_seguridad','area_festejos','festejos_calendario','festejos_presupuestos','festejos_cultura','festejos_programa','festejos_despacho','registro','actas','seguimiento','peticiones','presidencia'];
 const canales=Object.fromEntries(claves.filter(k=>/^\d{17,20}$/.test(ctx.c['canal_'+k]||'')).map(k=>[k,'https://discord.com/channels/'+ctx.c.guild_id+'/'+ctx.c['canal_'+k]]));
 const pendientes=await ctx.sb.from('gob_difusion').select('id',{count:'exact',head:true}).is('enviado',null);
 const fallos=await ctx.sb.from('gob_difusion').select('id',{count:'exact',head:true}).is('enviado',null).not('error','is',null);
 return {canales,pendientes:pendientes.error?null:pendientes.count,reintentos:fallos.error?null:fallos.count};
}
export async function web(ctx: Ctx, b: Any): Promise<Response> {
  const J=(o:any,status=200)=>respuesta({...o,...(ctx.avisos?.length?{avisos:[...new Set(ctx.avisos)]}:{})},status);
  try {
    const c = ctx.c, a = String(b?.accion || "");
    if (a === "entrar") return J({ ok: true, ...(await entrar(ctx, String(b.t || ""))) });
    const y = await sesionDe(ctx, String(b.sesion || ""));
    if(a==='admin_web'){const r=await ctx.sb.rpc('hg_admin_web_gobierno',{p_usuario:y.id,p_pedidos:b.pedidos===true});if(r.error)throw new Fallo('SIN_PERMISO',403);return J({ok:true,administracion:r.data});}
    const base = { autor: y.nombre, autor_id: y.id };
    if(a==="yo")return J({ok:true,yo:{...y,cargo:cargo(y.roles),h:undefined},organizacion:await organizacion(ctx)});
    const yo = { id: y.id, nombre: y.nombre, avatar: y.avatar, roles: y.roles, cargo: cargo(y.roles) };

    if(a==='constancias'){
      const r=await leer(ctx,Number(b.id));if(!r||!['secretaria','decreto'].includes(r.tipo))throw new Fallo('NO_EXISTE',404);
      const ids=[r.id];if(r.tipo==='secretaria'&&r.datos.doc_id)ids.push(Number(r.datos.doc_id));
      const [p,n]=await Promise.all([
        ctx.sb.from('gob_difusion').select('id,registro_id,destino,creado,enviado,canal_id,mensaje_id,error').in('registro_id',ids).order('id',{ascending:false}).limit(40),
        ctx.sb.from('gob_difusion').select('id',{count:'exact',head:true}).in('registro_id',ids).is('enviado',null)
      ]);
      if(p.error||n.error)throw Error('No he podido consultar las constancias del expediente.');
      return J({ok:true,pendientes:n.count||0,publicaciones:(p.data||[]).map((x:Any)=>({id:x.id,registro_id:x.registro_id,destino:x.destino,creado:x.creado,enviado:x.enviado,reintento:!!x.error,url:x.enviado&&/^\d{17,20}$/.test(x.canal_id||'')&&/^\d{17,20}$/.test(x.mensaje_id||'')?'https://discord.com/channels/'+ctx.c.guild_id+'/'+x.canal_id+'/'+x.mensaje_id:null}))});
    }
    if(a==='archivo'){
      let q=ctx.sb.from('gob_registros').select('*').in('tipo',['decreto','acta']).neq('estado','descartado').order('id',{ascending:false}).limit(61);
      if(b.antes)q=q.lt('id',Number(b.antes));
      const r=await q;if(r.error)throw Error('No he podido consultar el archivo.');
      const rows=r.data||[],mas=rows.length>60;rows.splice(60);
      return J({ok:true,yo,registros:rows.map((x:Any)=>({...plano(x),datos:{...x.datos,_discord:undefined}})),mas,antes:rows.at(-1)?.id,organizacion:await organizacion(ctx)});
    }
    if(a.startsWith("oficina")){return J({ok:true,...await oficina(ctx,b,y)});}
    if(a.startsWith("hacienda")) {const r=await hacienda(ctx,b,y);return J({ok:true,...r});}
    if(a.startsWith("secretarias")) {const r=await secretarias(ctx,b,y);if(a!=="secretarias")await actualizarCuentas(ctx);return J({ok:true,...r});}
    if(a.startsWith("campana")) {const r=await campana(ctx,b,y);return J({ok:true,...r});}
    if (a === "salir") { await ctx.sb.from("gob_sesiones").update({ revocado: new Date().toISOString() }).eq("token_hash", y.h); return J({ ok: true }); }
    if (a === "despacho") {
      const hoy0 = inicioDia(), hasta = hoy0 + 8 * 86400000;
      const agenda = await lista(ctx, ["cita", "reunion", "acto"], (q) => q.not("estado", "in", "(cancelada,cerrada)").gte("cuando", new Date(Date.now() - 2 * 3600000).toISOString()).lt("cuando", new Date(hasta).toISOString()).order("cuando"), 30);
      const borradores = await lista(ctx, "decreto", (q) => q.eq("estado", "borrador").order("creado", { ascending: false }), 10);
      const audiencias = await lista(ctx, "audiencia", (q) => q.eq("estado", "pendiente").order("creado"), 10);
      const propuestas = await conVotos(ctx, await lista(ctx, "propuesta", (q) => q.eq("estado", "abierta").order("creado"), 10));
      const tareas = await lista(ctx, "tarea", (q) => q.eq("estado", "abierto").order("cuando", { nullsFirst: false }), 15);
      const telegramas = await lista(ctx, "telegrama", (q) => q.order("creado", { ascending: false }), 6);
      const parte=await ctx.sb.rpc("gob_secretaria_resumen");if(parte.error)throw Error("No he podido consultar el parte de las Secretarías.");
      const arqueo=await ctx.sb.rpc("gob_hacienda_tesoreria");if(arqueo.error)throw Error("No he podido consultar el arqueo de Tesorería.");
      const verCuentas = y.roles.economia || y.roles.gobernador || y.roles.admin;
      return J({ ok: true, yo, agenda, borradores, audiencias, propuestas, tareas, telegramas, secretarias:parte.data,tesoreria:arqueo.data,saldo: verCuentas ? await saldo(ctx) : null, elecciones: Number(c.elecciones || 0), hoy: hoy0 });
    }
    if (a === "agenda") {
      const desde = Number(b.desde) || inicioDia(), hasta = Number(b.hasta) || desde + 7 * 86400000;
      const agenda = await lista(ctx, ["cita", "reunion", "acto"], (q) => q.neq("estado", "cancelada").gte("cuando", new Date(desde).toISOString()).lt("cuando", new Date(hasta).toISOString()).order("cuando"), 200);
      return J({ ok: true, yo, agenda });
    }
    if (a === "cita_crear") {
      const t = leerFecha(String(b.fecha || ""), String(b.hora || "")); if (!t) throw new Fallo("FECHA");
      if (!String(b.con || "").trim()) throw new Fallo("FALTA_CON");
      const r = await nuevo(ctx, "cita", { ...base, cuando: new Date(t).toISOString(), datos: { con: limpio(b.con, 100), lugar: limpio(b.lugar, 100), motivo: limpio(b.motivo, 300), web: true } });
      await publicar(ctx, r, c.canal_agenda, tarjetaCita(r));
      return J({ ok: true, cita: plano(r), texto: fechaTxt(t) });
    }
    if (a === "cita_cancelar") {
      const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "cita") throw new Fallo("NO_EXISTE", 404);
      if (r.estado !== "cancelada") { const r2 = await cambiar(ctx, r.id, { estado: "cancelada", datos: { ...r.datos, canceladaPor: y.nombre } }); await repintar(ctx, r2, tarjetaCita(r2)); }
      return J({ ok: true });
    }
    if (a === "audiencia_crear") {
      if (!String(b.quien || "").trim() || !String(b.motivo || "").trim()) throw new Fallo("FALTAN_DATOS");
      const r = await nuevo(ctx, "audiencia", { ...base, estado: "pendiente", datos: { quien: limpio(b.quien, 100), motivo: limpio(b.motivo, 400), telegrama: limpio(b.telegrama, 20), cuando: limpio(b.cuando, 60) } });
      await publicar(ctx, r, c.canal_agenda, { content: c.rol_gobernador ? `<@&${c.rol_gobernador}>, nueva solicitud de audiencia.` : "", ...tarjetaAudiencia(r) }, c.rol_gobernador ? { roles: [c.rol_gobernador] } : { parse: [] });
      return J({ ok: true });
    }
    if (a === "audiencia_decidir") {
      necesita(y, "gobernador");
      const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "audiencia") throw new Fallo("NO_EXISTE", 404);
      if (r.estado !== "pendiente") throw new Fallo("YA_CONTESTADA", 409);
      if (!b.aceptar) { const r2 = await cambiar(ctx, r.id, { estado: "rechazada", datos: { ...r.datos, decide: y.nombre, razon: limpio(b.razon, 400) } }); await repintar(ctx, r2, tarjetaAudiencia(r2)); return J({ ok: true }); }
      const t = leerFecha(String(b.fecha || ""), String(b.hora || "")); if (!t) throw new Fallo("FECHA");
      const cita = await nuevo(ctx, "cita", { ...base, cuando: new Date(t).toISOString(), datos: { con: r.datos.quien, lugar: limpio(b.lugar, 100), motivo: r.datos.motivo, audiencia: r.numero,peticion_id:r.datos.peticion_id||null } });
      await publicar(ctx, cita, c.canal_agenda, tarjetaCita(cita));
      const r2 = await cambiar(ctx, r.id, { estado: "aceptada", cuando: new Date(t).toISOString(), datos: { ...r.datos, decide: y.nombre, lugar: limpio(b.lugar, 100), cita: cita.numero } });
      await repintar(ctx, r2, tarjetaAudiencia(r2));
      const tel = telegramaTxt(ctx, quien(y), r.datos.quien, `Le confirmo que el gobernador le recibirá el ${fechaTxt(t)}${b.lugar ? " en " + limpio(b.lugar, 100) : ""}, para tratar el asunto que nos planteó`);
      return J({ ok: true, telegrama: tel });
    }
    if (a === "docs") {
      const docs = await lista(ctx, "decreto", (q) => q.neq("estado", "descartado").order("creado", { ascending: false }), 60);
      if(b.id&&!docs.some((d:Any)=>d.id===Number(b.id))){const elegido=await leer(ctx,Number(b.id));if(elegido?.tipo==='decreto'&&elegido.estado!=='descartado')docs.unshift(plano(elegido));}
      for (const d of docs) d.texto = textoDocumento({ datos: d.datos });
      return J({ ok: true, yo, docs, firma: { nombre: c.firma_nombre || "", cargo: c.firma_cargo || "Gobernador" } });
    }
    if (a === "doc_guardar") {
      const clase = TIPO_DOC[String(b.clase)] ? String(b.clase) : "decreto";
      const titulo = limpio(b.titulo, 100), texto = limpio(b.texto, 3000);
      if (!titulo || !texto) throw new Fallo("FALTAN_DATOS");
      if (b.id) {
        const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "decreto") throw new Fallo("NO_EXISTE", 404);
        if (r.estado !== "borrador") throw new Fallo("YA_FIRMADO", 409);
        if(r.datos.hacienda_id)throw Error("Este escrito conserva la propuesta de Hacienda. Descártelo y prepare una propuesta nueva para enmendar importes o destinatarios.");
        if(r.datos.area&&!y.roles.gobernador&&!y.roles.admin)throw new Fallo("SIN_PERMISO",403);
        const r2 = await cambiar(ctx, r.id, { datos: { ...r.datos, clase, titulo, texto, editadoPor: y.nombre } }); await repintar(ctx, r2, tarjetaDecreto(r2));await actualizarCuentas(ctx);
        return J({ ok: true, doc: plano(r2) });
      }
      const r = await nuevo(ctx, "decreto", { ...base, estado: "borrador", datos: { clase, titulo, texto } }, false);
      await publicar(ctx, r, c.canal_documentos, { content: c.rol_gobernador ? `<@&${c.rol_gobernador}>, hay un documento para firmar.` : "", ...tarjetaDecreto(r) }, c.rol_gobernador ? { roles: [c.rol_gobernador] } : { parse: [] });
      return J({ ok: true, doc: plano(r) });
    }
    if (a === "doc_firmar" || a === "doc_descartar") {
      necesita(y, "gobernador");
      const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "decreto") throw new Fallo("NO_EXISTE", 404);
      if (r.estado !== "borrador") throw new Fallo("YA_FIRMADO", 409);
      if (a === "doc_descartar") { const r2 = await cambiar(ctx, r.id, { estado: "descartado" }); await repintar(ctx, r2, tarjetaDecreto(r2));await actualizarCuentas(ctx); return J({ ok: true }); }
      const { data: r2,error:firmaError } = await ctx.sb.rpc("gob_firmar", { p_id: r.id, p_firma: firmaDe(ctx, quien(y)), p_por: y.nombre });
      if(firmaError)throw Error(String(firmaError.message).includes("PRESUPUESTO_INSUFICIENTE")?"La asignación supera el crédito libre de ese presupuesto.":String(firmaError.message).includes("PRESUPUESTO_SIN_FIRMA")?"Debe firmar primero el presupuesto que respalda este pago.":"No he podido firmar este escrito. Revise su presupuesto de origen.");
      if (!r2 || !r2.id) throw new Fallo("YA_FIRMADO", 409);
      await repintar(ctx, r2, tarjetaDecreto(r2));await actualizarCuentas(ctx);
      const d = plano(r2); (d as Any).texto = textoDocumento(r2);
      return J({ ok: true, doc: d });
    }
    if (a === "tels") {
      const tels = await lista(ctx, "telegrama", (q) => q.order("creado", { ascending: false }), 80);
      return J({ ok: true, yo, tels });
    }
    if (a === "tel_recibido") {
      if (!String(b.de || "").trim() || !String(b.texto || "").trim()) throw new Fallo("FALTAN_DATOS");
      const r = await nuevo(ctx, "telegrama", { ...base, datos: { sentido: "entrada", de: limpio(b.de, 100), texto: limpio(b.texto, 1500), telegrama: limpio(b.telegrama, 20) } });
      await publicar(ctx, r, c.canal_telegramas, tarjetaTelegrama(r));
      return J({ ok: true, tel: plano(r) });
    }
    if (a === "tel_borrador") return J({ ok: true, texto: telegramaTxt(ctx, quien(y), limpio(b.para, 100) || "[Destinatario]", limpio(b.texto, 1500) || "…") });
    if (a === "tel_enviar") {
      const para = limpio(b.para, 100); if (!para || !String(b.texto || "").trim()) throw new Fallo("FALTAN_DATOS");
      const texto = telegramaTxt(ctx, quien(y), para, limpio(b.texto, 1500));
      let respuestaA: Any = null;
      if (b.respondeA) { const r0 = await leer(ctx, Number(b.respondeA)); if (r0 && r0.tipo === "telegrama") { respuestaA = r0; } }
      const r = await nuevo(ctx, "telegrama", { ...base, datos: { sentido: "salida", para, texto, telegrama: limpio(b.telegrama, 20) || respuestaA?.datos?.telegrama || "", respuestaA: respuestaA?.numero || null } });
      await publicar(ctx, r, c.canal_telegramas, tarjetaTelegrama(r));
      if (respuestaA) { const r2 = await cambiar(ctx, respuestaA.id, { datos: { ...respuestaA.datos, respondido: y.nombre } }); await repintar(ctx, r2, tarjetaTelegrama(r2)); }
      return J({ ok: true, texto, tel: plano(r) });
    }
    if (a === "propuesta_votar") {
      const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "propuesta" || r.estado !== "abierta") throw new Fallo("NO_EXISTE", 404);
      await votar(ctx, r.id, quien(y), b.voto === "no" ? "no" : "si"); await repintar(ctx, r, await tarjetaPropuesta(ctx, r));
      return J({ ok: true });
    }
    if (a === "propuesta_cerrar") {
      necesita(y, "gobernador");
      const r = await leer(ctx, Number(b.id)); if (!r || r.tipo !== "propuesta" || r.estado !== "abierta") throw new Fallo("NO_EXISTE", 404);
      const v = await votos(ctx, r.id);
      const r2 = await cambiar(ctx, r.id, { estado: v.si.length > v.no.length ? "aprobada" : "rechazada", datos: { ...r.datos, cierra: y.nombre } });
      await repintar(ctx, r2, await tarjetaPropuesta(ctx, r2));
      return J({ ok: true, estado: r2.estado });
    }
    throw new Fallo("ACCION_DESCONOCIDA");
  } catch (e) {
    if (e instanceof Fallo) return J({ ok: false, error: e.codigo }, e.st);
    const m = String((e as Error)?.message || e);
    try { await ctx.sb.from("whitmore_registro").insert({ metodo: "WEB", ruta: String(b?.accion || "?").slice(0, 100), estado: 500, motivo: m.slice(0, 400) }); } catch { /* */ }
    return J({ ok: false, error: "ERROR", detalle: m.startsWith("DISCORD_")?"La oficina de correspondencia no está disponible.":m.slice(0,200) }, 500);
  }
}
