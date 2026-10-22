-- Ventas potenciales y auditoría automática. Ningún cierre automático inventa conteos físicos.
create table public.hg_potencial_estado(id integer primary key check(id=1),snapshot jsonb,ultimo_dia date not null default (now() at time zone 'Europe/Madrid')::date,sucio boolean not null default true,generacion bigint not null default 0,mensaje text,canal text,worker_hasta timestamptz);
insert into public.hg_potencial_estado(id) values(1);
create table public.hg_potencial_diario(id bigint generated always as identity primary key,creado timestamptz not null default now(),producto text not null,antes integer not null,despues integer not null,delta integer not null,operacion text,transaccion bigint not null default txid_current());
create table public.hg_potencial_eventos(id bigint generated always as identity primary key,clave text unique not null,tipo text not null,creado timestamptz not null default now(),fuente jsonb not null default '{}',snapshot jsonb not null,anterior jsonb,resultado jsonb,mensaje text,enviado timestamptz,error text,bloqueado_hasta timestamptz);
alter table public.hg_potencial_estado enable row level security;
alter table public.hg_potencial_diario enable row level security;
alter table public.hg_potencial_eventos enable row level security;
revoke all on public.hg_potencial_estado,public.hg_potencial_diario,public.hg_potencial_eventos from public,anon,authenticated;
grant all on public.hg_potencial_estado,public.hg_potencial_diario,public.hg_potencial_eventos to service_role;
grant usage,select on sequence public.hg_potencial_diario_id_seq,public.hg_potencial_eventos_id_seq to service_role;
alter function hg_interno.caja_snapshot() stable;

create function hg_interno.potencial_snapshot(p_desde bigint default 0) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
select jsonb_build_object(
 'momento',now(),'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock),
 'reservas',(select coalesce(jsonb_object_agg(producto,public.hg_reservadas(producto,'')),'{}') from public.stock),
 'recetas',coalesce((select valor from public.datos where clave='recetas'),'{}'),
 'precios',coalesce((select valor from public.datos where clave='precios'),'{}'),
 'productos',coalesce((select valor from public.datos where clave='productos'),'[]'),
 'npc',coalesce((select valor from public.datos where clave='npc:estado'),'{}'),
 'caja',hg_interno.caja_snapshot(),
 'ultimo_recuento',(select to_jsonb(c)-'discord_lease' from public.hg_caja_recuentos c order by creado desc limit 1),
 'ultimo_inventario',(select jsonb_build_object('id',valor->'id','items',valor->'items','momento',actualizado) from public.datos where clave like 'inventario:%' order by actualizado desc limit 1),
 'diario_hasta',(select coalesce(max(id),0) from public.hg_potencial_diario),
 'diario',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.hg_potencial_diario d where id>p_desde)
);
$$;
revoke all on function hg_interno.potencial_snapshot(bigint) from public,anon,authenticated;
grant execute on function hg_interno.potencial_snapshot(bigint) to service_role;

create function hg_interno.potencial_encolar(p_clave text,p_tipo text,p_fuente jsonb default '{}') returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prev jsonb;s jsonb;begin
 select snapshot into prev from public.hg_potencial_estado where id=1 for update;
 if exists(select 1 from public.hg_potencial_eventos where clave=p_clave) then return;end if;
 s:=hg_interno.potencial_snapshot(coalesce((prev->>'diario_hasta')::bigint,0));
 if p_tipo='inventario' then s:=s||jsonb_build_object('ultimo_inventario',p_fuente||jsonb_build_object('momento',now()));end if;
 if p_tipo='caja' then s:=s||jsonb_build_object('ultimo_recuento',p_fuente,'caja',p_fuente->'snapshot');end if;
 insert into public.hg_potencial_eventos(clave,tipo,fuente,snapshot,anterior) values(p_clave,p_tipo,p_fuente,s,prev);
 update public.hg_potencial_estado set snapshot=s,sucio=false where id=1;
end $$;
revoke all on function hg_interno.potencial_encolar(text,text,jsonb) from public,anon,authenticated;
grant execute on function hg_interno.potencial_encolar(text,text,jsonb) to service_role;

create function hg_interno.potencial_stock() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;a integer;d integer;begin
 k:=case when tg_op='DELETE' then old.producto else new.producto end;a:=case when tg_op='INSERT' then 0 else old.cantidad end;d:=case when tg_op='DELETE' then 0 else new.cantidad end;
 if a is distinct from d then
 insert into public.hg_potencial_diario(producto,antes,despues,delta,operacion) values(k,a,d,d-a,current_setting('hg.operacion',true));
 update public.hg_potencial_estado set sucio=true,generacion=generacion+1 where id=1;
 end if;return null;end $$;
revoke all on function hg_interno.potencial_stock() from public,anon,authenticated;
create trigger hg_potencial_stock after insert or update or delete on public.stock for each row execute function hg_interno.potencial_stock();

create function hg_interno.potencial_dato() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare nr bigint;pr bigint:=0;begin
 if new.clave like 'inventario:%' and (tg_op='INSERT' or new.valor is distinct from old.valor) then
  perform hg_interno.potencial_encolar('inventario:'||new.clave,'inventario',jsonb_build_object('id',new.valor->'id','items',new.valor->'items'));
 elsif new.clave like 'pedido:%' and not coalesce((new.valor->>'deleted')::boolean,false) then
  select coalesce(sum(case when new.valor->>'received'='true' then (x->>'qty')::int else coalesce((x->>'rq')::int,0) end),0) into nr from jsonb_array_elements(coalesce(new.valor->'items','[]')) x;
  if tg_op='UPDATE' then select coalesce(sum(case when old.valor->>'received'='true' then (x->>'qty')::int else coalesce((x->>'rq')::int,0) end),0) into pr from jsonb_array_elements(coalesce(old.valor->'items','[]')) x;end if;
  if nr>pr then
   update public.hg_potencial_estado set sucio=true,generacion=generacion+1 where id=1;
   insert into public.hg_potencial_eventos(clave,tipo,fuente,snapshot) values('pedido:'||new.clave||':'||nr,'pedido',jsonb_build_object('id',new.valor->'code'),'{}') on conflict(clave) do nothing;
  end if;
 elsif new.clave in ('recetas','precios','productos','npc:estado') or new.clave like 'encargo:%' or new.clave like 'venta:%' or new.clave like 'gasto:%' then
  update public.hg_potencial_estado set sucio=true,generacion=generacion+1 where id=1;
 end if;return null;end $$;
revoke all on function hg_interno.potencial_dato() from public,anon,authenticated;
create trigger hg_potencial_dato after insert or update on public.datos for each row when(new.clave like 'inventario:%' or new.clave like 'pedido:%' or new.clave like 'encargo:%' or new.clave like 'venta:%' or new.clave like 'gasto:%' or new.clave in ('recetas','precios','productos','npc:estado')) execute function hg_interno.potencial_dato();

create function hg_interno.potencial_caja() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform hg_interno.potencial_encolar('caja:'||new.id,'caja',to_jsonb(new)-'discord_lease');return null;end $$;
revoke all on function hg_interno.potencial_caja() from public,anon,authenticated;
create trigger hg_potencial_caja after insert on public.hg_caja_recuentos for each row execute function hg_interno.potencial_caja();

create function public.hg_potencial_preparar() returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e public.hg_potencial_estado;hoy date:=(now() at time zone 'Europe/Madrid')::date;j public.hg_potencial_eventos;begin
 select * into e from public.hg_potencial_estado where id=1 for update;
 -- Captura diferida de pedidos recibidos antes de publicar, tras confirmar su transacción.
 for j in select * from public.hg_potencial_eventos where tipo='pedido' and snapshot='{}' order by id loop
  update public.hg_potencial_eventos set snapshot=hg_interno.potencial_snapshot(coalesce((e.snapshot->>'diario_hasta')::bigint,0)),anterior=e.snapshot where id=j.id;
 end loop;
 if e.ultimo_dia<hoy then
  perform hg_interno.potencial_encolar('dia:'||(hoy-1),'diario',jsonb_build_object('dia',hoy-1,'zona','Europe/Madrid'));
  update public.hg_potencial_estado set ultimo_dia=hoy where id=1;
 elsif e.sucio then perform hg_interno.potencial_encolar('actualizacion:'||e.generacion,'actualizacion');end if;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from (select * from public.hg_potencial_eventos where enviado is null and (bloqueado_hasta is null or bloqueado_hasta<now()) order by id limit 2) t);
end $$;
revoke all on function public.hg_potencial_preparar() from public,anon,authenticated;
grant execute on function public.hg_potencial_preparar() to service_role;
-- Primera fotografía real: no transforma registros históricos en falsos conteos nuevos.
select hg_interno.potencial_encolar('activacion','activacion');
