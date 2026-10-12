// HARRINGTON GUNSMITH · V3 · Señor Harrington: bienvenidas y despedidas en Discord
// Discord no avisa al instante de quién entra o sale a un bot sin conexión permanente, así que el Señor Harrington
// «revisa la puerta» cada medio minuto (tarea programada harrington-puerta): compara la lista de miembros con la
// que guardó la vez anterior (tabla protegida bot_miembros) y publica:
//   · una bienvenida, con la foto de perfil y los pasos para entrar, en el canal de bienvenida;
//   · una despedida, con la foto de perfil, en el canal de despedidas.
// Seguridades: la primera vez solo apunta a todos (no saluda a nadie); solo saluda a quien entró hace menos de 30 minutos;
// si la lista llega incompleta, no despide a nadie; como mucho 5 mensajes de cada tipo por revisión.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json" } });
const gotica = (s: string) => [...s].map((ch) => {
  const n = ch.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return ch;
}).join("");
const limpio = (s: unknown, n: number) => String(s ?? "").replace(/@(everyone|here)/gi, "@​$1").replace(/[*_~`|>]/g, "").trim().slice(0, n);
type Miembro = { user: { id: string; username: string; global_name?: string; avatar?: string; bot?: boolean }; nick?: string; avatar?: string; joined_at?: string };

function foto(g: string, m: Miembro) {
  const u = m.user;
  if (m.avatar) return `https://cdn.discordapp.com/guilds/${g}/users/${u.id}/avatars/${m.avatar}.${m.avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
}
const nombreDe = (m: Miembro) => limpio(m.nick || m.user.global_name || m.user.username, 60) || "Un forastero";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "JSON" }, 400); }
  const { data: filas } = await sb.from("bot_cfg").select("clave,valor");
  const c: Record<string, string> = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: string }) => [r.clave, r.valor]));
  if (!c.secreto || c.secreto.length < 20 || b.secreto !== c.secreto) return json({ error: "NO" }, 403);
  const H = { Authorization: "Bot " + c.token, "Content-Type": "application/json" };
  const G = c.guild_id;

  // 1 · lista completa de miembros (de 1000 en 1000)
  const todos: Miembro[] = [];
  let after = "0";
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const r = await fetch(`https://discord.com/api/v10/guilds/${G}/members?limit=1000&after=${after}`, { headers: H });
    if (r.status !== 200) return json({ error: "MIEMBROS", st: r.status }, 502);
    const lote = await r.json() as Miembro[];
    todos.push(...lote);
    if (lote.length < 1000) break;
    after = lote[lote.length - 1].user.id;
  }
  const personas = todos.filter((m) => !m.user.bot);
  const { data: antes } = await sb.from("bot_miembros").select("user_id,nombre,avatar");
  type Fila = { user_id: string; nombre: string; avatar: string };
  const previos = new Map<string, Fila>(((antes ?? []) as Fila[]).map((r) => [r.user_id, r]));
  const ahora = new Set(personas.map((m) => m.user.id));
  const filasNuevas = personas.map((m) => ({ user_id: m.user.id, nombre: nombreDe(m), avatar: foto(G, m), entrada: m.joined_at || null, visto: new Date().toISOString() }));

  // primera revisión: se apunta a todos sin saludar a nadie
  if (!previos.size) {
    await sb.from("bot_miembros").upsert(filasNuevas);
    return json({ ok: true, primera: true, miembros: personas.length });
  }
  const post = (canal: string, cuerpo: unknown) => fetch(`https://discord.com/api/v10/channels/${canal}/messages`, { method: "POST", headers: H, body: JSON.stringify(cuerpo) });
  const ch = (k: string) => c[k] ? `<#${c[k]}>` : "su canal";
  let saludos = 0, despedidas = 0;

  // 2 · bienvenidas (solo a quien ha entrado hace poco)
  for (const m of personas) {
    if (previos.has(m.user.id) || saludos >= 5) continue;
    const reciente = !m.joined_at || Date.now() - Date.parse(m.joined_at) < 30 * 60000;
    if (!reciente || !c.canal_bienvenida_puerta) continue;
    const r = await post(c.canal_bienvenida_puerta, {
      content: `<@${m.user.id}>`,
      allowed_mentions: { users: [m.user.id] },
      embeds: [{
        title: "🕯 " + gotica("Bienvenido a la Casa Harrington"),
        color: 0xd7ae54,
        thumbnail: { url: foto(G, m) },
        description: `Suena la campanilla de la puerta: **${nombreDe(m)}** acaba de llegar a Harrington Gunsmith, la armería de Saint Denis.\n\n` +
          `Para entrar, siga estos pasos:\n` +
          `**1.** Lea las normas en ${ch("canal_normativa")} y pulse **Doy mi palabra**.\n` +
          `**2.** En ${ch("canal_seleccion")}, diga si viene **de visita** o **a trabajar**.\n` +
          `**3.** Si viene a trabajar, se le irán abriendo las normas de la casa y, al final, la solicitud de empleo.\n\n` +
          `Sea usted muy bienvenido.`,
        footer: { text: `Es usted la persona n.º ${personas.length} de esta casa · Señor Harrington` },
        timestamp: new Date().toISOString(),
      }],
    });
    if (r.ok) saludos++;
  }

  // 3 · despedidas (solo si la lista ha llegado entera: nunca más de la mitad de golpe)
  const idos = [...previos.keys()].filter((id) => !ahora.has(id));
  if (c.canal_despedidas && idos.length && idos.length <= Math.max(3, previos.size / 2)) {
    for (const id of idos.slice(0, 5)) {
      const p = previos.get(id)!;
      const r = await post(c.canal_despedidas, {
        allowed_mentions: { parse: [] },
        embeds: [{
          title: "🚪 " + gotica("Hasta Siempre"),
          color: 0x6b4c1d,
          thumbnail: p.avatar ? { url: p.avatar } : undefined,
          description: `**${limpio(p.nombre, 60) || "Un viejo conocido"}** ha recogido su sombrero y ha salido por la puerta de la Casa Harrington.\n\n` +
            `Gracias por el tiempo compartido. Le deseamos buen camino y mejor fortuna; si algún día vuelve por Saint Denis, aquí encontrará siempre la puerta abierta.`,
          footer: { text: "Señor Harrington · Harrington Gunsmith · Saint Denis, 1880" },
          timestamp: new Date().toISOString(),
        }],
      });
      if (r.ok) { despedidas++; await sb.from("bot_miembros").delete().eq("user_id", id); }
    }
  }
  // 4 · se guarda la lista nueva (nombres y fotos al día)
  await sb.from("bot_miembros").upsert(filasNuevas);
  if (saludos || despedidas) await sb.from("bot_registro").insert({ metodo: "PUERTA", ruta: "/bienvenidas", motivo: `${saludos} bienvenidas, ${despedidas} despedidas`, estado: 200 });
  return json({ ok: true, miembros: personas.length, saludos, despedidas });
});
