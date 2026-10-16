-- Herramientas internas del equipo. No accesibles a los clientes web.
create table if not exists public.bot_equipo (
 id text primary key,
 kind text not null,
 owner text not null,
 guild_id text not null,
 status text not null default 'active',
 data jsonb not null default '{}'::jsonb,
 channel_id text,
 message_id text,
 due_at timestamptz,
 revision integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.bot_equipo enable row level security;
revoke all on public.bot_equipo from public, anon, authenticated;
grant all on public.bot_equipo to service_role;
create index if not exists bot_equipo_owner_kind on public.bot_equipo(owner,kind,status);
create index if not exists bot_equipo_due on public.bot_equipo(due_at) where status='pending';
create index if not exists bot_equipo_vote on public.bot_equipo((data->>'idea')) where kind='vote';
create index if not exists bot_equipo_game on public.bot_equipo(updated_at) where kind='game' and status='done';
