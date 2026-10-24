create table public.hg_pedidos_cancelados_archivo(origen text primary key,destino text not null,canal_origen text not null,creado timestamptz not null default now(),borrado boolean not null default false);
alter table public.hg_pedidos_cancelados_archivo enable row level security;
revoke all on public.hg_pedidos_cancelados_archivo from public,anon,authenticated;
grant all on public.hg_pedidos_cancelados_archivo to service_role;
