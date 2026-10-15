create table public.bot_telegramas_control(id integer primary key check(id=1), cursor text not null, lease_owner text, lease_until timestamptz not null default 'epoch');
create table public.bot_telegramas_mensajes(origen_id text primary key, canal_id text not null, autor_id text not null, original text not null, ficha jsonb not null, publicado_id text, borrado boolean not null default false, creada timestamptz not null default now());
alter table public.bot_telegramas_control enable row level security;
alter table public.bot_telegramas_mensajes enable row level security;
revoke all on public.bot_telegramas_control,public.bot_telegramas_mensajes from public,anon,authenticated;
grant all on public.bot_telegramas_control,public.bot_telegramas_mensajes to service_role;
insert into public.bot_telegramas_control(id,cursor) values(1,'1559355403748376617');
insert into public.bot_cfg(clave,valor) values('canal_telegramas','1520882335128752258'),('telegramas_autor','1398183011232518164') on conflict(clave) do update set valor=excluded.valor;