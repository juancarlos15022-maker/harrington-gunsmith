-- 20/10/2026 · Copia de las tarjetas de Discord antes de pintarles el marcador de color (aplicada como migración respaldo_marcadores_discord).
create table if not exists public.hg_discord_respaldo(
 message_id text primary key,
 channel_id text not null,
 original jsonb not null,
 creado timestamptz not null default now()
);
alter table public.hg_discord_respaldo enable row level security;
revoke all on public.hg_discord_respaldo from anon, authenticated;
