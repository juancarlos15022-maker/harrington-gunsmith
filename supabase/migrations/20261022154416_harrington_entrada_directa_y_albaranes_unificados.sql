-- Entrada delegada del propietario: token efímero, de un uso, sin credenciales en enlaces.
create function public.hg_admin_web_entrada_gobierno() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare t text;u text;begin
 if not public.hg_empleado_ok(true) or auth.uid() is distinct from (select owner_uid from public.hg_security_config where id=1) then raise exception 'SOLO_ADMIN_WEB' using errcode='42501';end if;
 select owner_discord into u from public.hg_security_config where id=1;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.gob_accesos(token_hash,usuario_id,nombre,expira) values(encode(extensions.digest(t,'sha256'),'hex'),u,'Administrador web',now()+interval '60 seconds');
 return jsonb_build_object('entrada',t);
end $$;
revoke all on function public.hg_admin_web_entrada_gobierno() from public,anon;
grant execute on function public.hg_admin_web_entrada_gobierno() to authenticated;

create or replace function hg_interno.admin_web_panel(p_pedidos boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r jsonb;ps jsonb;begin
 r:=jsonb_build_object('rol','administrador_web','enlaces',jsonb_build_array(
 jsonb_build_object('id','armeria','nombre','Armería','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/'),
 jsonb_build_object('id','gobierno','nombre','Gobierno','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/'),
 jsonb_build_object('id','pedidos','nombre','Pedidos y albaranes','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/pedidos-automaticos.html')));
 if p_pedidos then
 select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(d.valor->>'id',substr(d.clave,8)),'codigo',d.valor->>'code','proveedor',d.valor->>'proveedor','fecha',d.valor->>'date','items',coalesce(d.valor->'items','[]'),'totalCents',coalesce(d.valor->'totalCents','0'),'propuesta',coalesce(d.valor->'propuesta','false'),'cerrado',coalesce((d.valor->>'cancelled')::boolean,false),'pedido',d.valor,'url',case when d.valor->>'propuesta'='true' and a.token ~ '^[0-9a-f]{64}$' then 'https://juancarlos15022-maker.github.io/harrington-gunsmith/aceptar.html?t='||a.token else null end) order by d.actualizado desc),'[]') into ps
 from public.datos d left join public.hg_reposicion_avisos a on a.pedido_id=coalesce(d.valor->>'id',substr(d.clave,8))
 where d.clave like 'pedido:%' and not coalesce((d.valor->>'deleted')::boolean,false);
 r:=r||jsonb_build_object('pedidos',ps);
 end if;return r;
end $$;

create function public.hg_albaran_ver(p_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb;begin
 if not public.hg_empleado_ok(false) then raise exception 'SIN_PERMISO' using errcode='42501';end if;
 select valor into p from public.datos where clave='pedido:'||p_id and not coalesce((valor->>'deleted')::boolean,false);
 if p is null then raise exception 'PEDIDO_NO_EXISTE';end if;return p;
end $$;
revoke all on function public.hg_albaran_ver(text) from public,anon;
grant execute on function public.hg_albaran_ver(text) to authenticated;

create function public.hg_albaran_acceso(p_id text,p_gob_hash text default null,p_token text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb;begin
 if not exists(select 1 from public.gob_sesiones s join public.hg_security_config c on c.id=1 and c.owner_discord=s.usuario_id where s.token_hash=p_gob_hash and s.revocado is null and s.expira>now())
 and not exists(select 1 from public.hg_reposicion_avisos a where a.pedido_id=p_id and a.token=p_token and length(p_token)=64) then raise exception 'SIN_PERMISO' using errcode='42501';end if;
 select valor into p from public.datos where clave='pedido:'||p_id and not coalesce((valor->>'deleted')::boolean,false);
 if p is null then raise exception 'PEDIDO_NO_EXISTE';end if;return p;
end $$;
revoke all on function public.hg_albaran_acceso(text,text,text) from public,anon,authenticated;
grant execute on function public.hg_albaran_acceso(text,text,text) to service_role;

create table public.hg_albaranes_pedidos(pedido_id text primary key,snapshot jsonb not null,version text not null,enviado_version text,mensaje text,canal text,error text,lease timestamptz,next_at timestamptz not null default now());
alter table public.hg_albaranes_pedidos enable row level security;
revoke all on public.hg_albaranes_pedidos from public,anon,authenticated;
grant all on public.hg_albaranes_pedidos to service_role;
create function hg_interno.albaran_pedido() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.valor->>'propuesta'='true' or coalesce((new.valor->>'deleted')::boolean,false) then return null;end if;
 insert into public.hg_albaranes_pedidos(pedido_id,snapshot,version) values(substr(new.clave,8),new.valor,md5(new.valor::text)) on conflict(pedido_id) do update set snapshot=excluded.snapshot,version=excluded.version,next_at=now() where hg_albaranes_pedidos.version<>excluded.version;
 return null;
end $$;
revoke all on function hg_interno.albaran_pedido() from public,anon,authenticated;
create trigger hg_albaran_pedido after insert or update on public.datos for each row when(new.clave like 'pedido:%') execute function hg_interno.albaran_pedido();
-- El archivo incluye pedidos históricos; el trabajador firma y publica sus estados reales.
insert into public.hg_albaranes_pedidos(pedido_id,snapshot,version) select substr(clave,8),valor,md5(valor::text) from public.datos where clave like 'pedido:%' and not coalesce((valor->>'deleted')::boolean,false) and not coalesce((valor->>'propuesta')::boolean,false);
create function public.hg_albaranes_pendientes() returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.hg_albaranes_pedidos where enviado_version is distinct from version and next_at<=now() and (lease is null or lease<now()) order by next_at,pedido_id limit 4) x
$$;
revoke all on function public.hg_albaranes_pendientes() from public,anon,authenticated;
grant execute on function public.hg_albaranes_pendientes() to service_role;
