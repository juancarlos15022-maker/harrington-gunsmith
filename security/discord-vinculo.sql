create table if not exists public.hg_discord_bindings(emp_id text primary key,discord_id text not null,verified_at timestamptz not null default now());
alter table public.hg_discord_bindings enable row level security;
revoke all on public.hg_discord_bindings from public,anon,authenticated;
grant all on public.hg_discord_bindings to service_role;
