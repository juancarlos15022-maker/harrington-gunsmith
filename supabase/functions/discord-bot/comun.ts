// HARRINGTON GUNSMITH · V3 · Piezas comunes del Señor Harrington (fechas de Madrid, catálogo y precios, letras de la época)
// Se despliega igual dentro de discord-puerta y de discord-interacciones.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const PIE = { text: "Señor Harrington · Harrington Gunsmith · Saint Denis, 1880" };
export const ORO = 0xd7ae54;
export const gotica = (s: string) => [...s].map((ch) => {
  const n = ch.charCodeAt(0);
  if (n >= 65 && n <= 90) return String.fromCodePoint(0x1D56C + n - 65);
  if (n >= 97 && n <= 122) return String.fromCodePoint(0x1D586 + n - 97);
  return ch;
}).join("");
const SC: Record<string, string> = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz"].map((c, i) => [c, [..."ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ"][i]]));
export const versalita = (s: string) => [...s.toLowerCase()].map((c) => SC[c] ?? c).join("");
export const limpio = (s: unknown, n: number) => String(s ?? "").replace(/@(everyone|here)/gi, "@\u200b$1").replace(/<@[!&]?\d+>/g, "").trim().slice(0, n);
export const dolar = (c: unknown) => "$" + (Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── fechas en hora de Madrid (igual que la web) ──
const FMT = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
export function madrid(ms: number) {
  const o: Record<string, string> = {};
  for (const p of FMT.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = p.value;
  return o;
}
export const diaNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export const hoyNum = (ms = Date.now()) => { const m = madrid(ms); return diaNum(+m.year, +m.month, +m.day); };
const desfase = (ms: number) => { const m = madrid(ms); return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute) - Math.floor(ms / 60000) * 60000; };
export function medianoche(dia: number) { const g = dia * 86400000; let r = g - desfase(g); r = g - desfase(r); return r; }
export const fecha = (ms: number) => { const m = madrid(ms); return `${m.day}/${m.month}/${m.year}`; };
export const hora = (ms: number) => { const m = madrid(ms); return `${m.hour}:${m.minute}`; };
export const duracion = (a: number, b: number) => { const m = Math.max(0, Math.round((b - a) / 60000)); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };

// ── catálogo con los precios de verdad: la lista base, los cambios de precio de la web y los productos añadidos ──
export type Prod = { nombre: string; categoria: string; precio: number; orden: number };
export const CATS: Array<[string, string, string]> = [["Revolveres", "🔫", "Revólveres"], ["Pistolas", "🔫", "Pistolas"], ["Repetidoras", "🎯", "Rifles de repetición"],
  ["Rifles", "🎯", "Rifles"], ["Escopetas", "💥", "Escopetas"], ["Blancas", "🗡️", "Armas blancas y arcos"], ["Municion", "🧨", "Munición y flechas"], ["Suministros", "🧰", "Suministros"]];
// Dirección en Discord (19/10/2026): el director de la web o cualquier empleado con puesto «Jefe» enlazado a ese Discord.
export const DIRECTOR_DISCORD = "1398183011232518164";
export async function esJefeDiscord(sb: SupabaseClient, uid: string) {
  if (uid === DIRECTOR_DISCORD) return true;
  const { data } = await sb.from("datos").select("valor").eq("clave", "empleados").maybeSingle();
  return (Array.isArray(data?.valor) ? data!.valor as Array<Record<string, unknown>> : []).some((e) => e && String(e.discord || "") === uid && e.puesto === "Jefe");
}
export async function catalogo(sb: SupabaseClient): Promise<Prod[]> {
  const [{ data: base }, { data: filas }] = await Promise.all([
    sb.from("bot_catalogo").select("nombre,categoria,precio,orden").order("orden"),
    sb.from("datos").select("clave,valor").in("clave", ["precios", "productos"]),
  ]);
  const cfg = Object.fromEntries((filas ?? []).map((r: { clave: string; valor: unknown }) => [r.clave, r.valor]));
  const pr = (cfg.precios && typeof cfg.precios === "object") ? cfg.precios as Record<string, number> : {};
  const L: Prod[] = ((base ?? []) as Prod[]).map((p) => ({ ...p, precio: pr[p.nombre] != null && Number(pr[p.nombre]) >= 0 ? Math.round(Number(pr[p.nombre]) * 100) : p.precio }));
  const extra = Array.isArray(cfg.productos) ? cfg.productos as Array<{ name: string; cat?: string; price?: number }> : [];
  extra.forEach((x, i) => { if (x?.name && !L.some((p) => p.nombre === x.name)) L.push({ nombre: x.name, categoria: x.cat || "Suministros", precio: Math.round(Number(x.price || 0) * 100), orden: 1000 + i }); });
  return L;
}
export function listaPrecios(L: Prod[]) {
  const cats = [...CATS];
  for (const p of L) if (!cats.some((c) => c[0] === p.categoria)) cats.push([p.categoria, "🏷️", p.categoria]);
  const fields = cats.map(([k, emo, nom]) => {
    const P = L.filter((p) => p.categoria === k);
    return P.length ? { name: `${emo} ${versalita(nom)}`, value: P.map((p) => p.precio > 0 ? `${p.nombre} · **${dolar(p.precio)}**` : `${p.nombre} · *por encargo*`).join("\n").slice(0, 1024), inline: true } : null;
  }).filter(Boolean);
  return { embeds: [{ title: "🏷️ " + gotica("Lista de Precios"), color: ORO, footer: { text: "Se pone al día sola cuando cambia un precio en la web · Señor Harrington" },
    description: "Precios del mostrador, en dólares y por unidad.\nLo marcado *por encargo* se pacta con el cliente.\nSi un cliente tiene precio especial, lo verá usted en su ficha de la web.", fields }], components: [] };
}
