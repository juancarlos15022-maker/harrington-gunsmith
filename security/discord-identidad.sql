begin;
create table if not exists public.hg_discord_checks(id uuid primary key,emp_id text not null,discord_id text not null,purpose text not null check(purpose in ('entrar','crear','recuperar')),secret_hash text not null,created_at timestamptz not null default now(),expires_at timestamptz not null,approved_at timestamptz);
alter table public.hg_discord_checks enable row level security;
revoke all on public.hg_discord_checks from public,anon,authenticated;
grant all on public.hg_discord_checks to service_role;
create index if not exists hg_discord_checks_emp_time on public.hg_discord_checks(emp_id,created_at);
create or replace function public.hg_discord_consumir(p_id uuid,p_emp text,p_hash text,p_purpose text,p_discord text) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$declare n integer;begin
delete from public.hg_discord_checks where id=p_id and emp_id=p_emp and secret_hash=p_hash and purpose=p_purpose and discord_id=p_discord and approved_at is not null and expires_at>now();get diagnostics n=row_count;return n=1;end $$;
revoke all on function public.hg_discord_consumir(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.hg_discord_consumir(uuid,text,text,text,text) to service_role;
create table if not exists public.hg_owner_recovery(id integer primary key check(id=1),hash text not null,salt text not null,iterations integer not null);
alter table public.hg_owner_recovery enable row level security;
revoke all on public.hg_owner_recovery from public,anon,authenticated;grant all on public.hg_owner_recovery to service_role;
commit;
