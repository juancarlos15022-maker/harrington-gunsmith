-- Navegación privada exclusiva del propietario, independiente de los cargos de las webs.
create function hg_interno.admin_web_panel(p_pedidos boolean default false) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r jsonb;ps jsonb;begin
 r:=jsonb_build_object('rol','administrador_web','enlaces',jsonb_build_array(
 jsonb_build_object('id','armeria','nombre','Armería','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/'),
 jsonb_build_object('id','gobierno','nombre','Gobierno','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/'),
 jsonb_build_object('id','pedidos','nombre','Pedidos automáticos','url','https://juancarlos15022-maker.github.io/harrington-gunsmith/pedidos-automaticos.html')));
 if p_pedidos then
 select coalesce(jsonb_agg(x.f order by x.actualizado desc),'[]') into ps from (
 select d.actualizado,jsonb_build_object('id',a.pedido_id,'codigo',d.valor->>'code','proveedor',d.valor->>'proveedor','fecha',d.valor->>'date','items',coalesce(d.valor->'items','[]'),
 'totalCents',coalesce(d.valor->'totalCents','0'),'propuesta',coalesce(d.valor->'propuesta','false'),'cerrado',a.cerrado,'estado',a.ultimo_estado,
 'url',case when a.token ~ '^[0-9a-f]{64}$' then 'https://juancarlos15022-maker.github.io/harrington-gunsmith/aceptar.html?t='||a.token else null end) f
 from public.hg_reposicion_avisos a join public.datos d on d.clave='pedido:'||a.pedido_id join public.hg_security_config cfg on cfg.id=1 and a.recipient_id=cfg.owner_discord
 where not coalesce((d.valor->>'deleted')::boolean,false) order by d.actualizado desc limit 100) x;
 r:=r||jsonb_build_object('pedidos',ps);
 end if;return r;
end $$;
revoke all on function hg_interno.admin_web_panel(boolean) from public,anon,authenticated;

create function public.hg_admin_web_panel(p_pedidos boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.hg_empleado_ok(true) or auth.uid() is distinct from (select owner_uid from public.hg_security_config where id=1) then raise exception 'SOLO_ADMIN_WEB' using errcode='42501';end if;
 return hg_interno.admin_web_panel(p_pedidos);
end $$;
revoke all on function public.hg_admin_web_panel(boolean) from public,anon;
grant execute on function public.hg_admin_web_panel(boolean) to authenticated;

-- Solo el servidor de Whitmore lo llama después de validar su sesión del gobierno.
create function public.hg_admin_web_gobierno(p_usuario text,p_pedidos boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_usuario is null or p_usuario is distinct from (select owner_discord from public.hg_security_config where id=1) then raise exception 'SOLO_ADMIN_WEB' using errcode='42501';end if;
 return hg_interno.admin_web_panel(p_pedidos);
end $$;
revoke all on function public.hg_admin_web_gobierno(text,boolean) from public,anon,authenticated;
grant execute on function public.hg_admin_web_gobierno(text,boolean) to service_role;
