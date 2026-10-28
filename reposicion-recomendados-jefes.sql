-- Objetivos orientativos, bloqueo de duplicados y copias privadas para jefes vinculados.
create table if not exists public.hg_reposicion_copias(
 pedido_id text not null references public.hg_reposicion_avisos(pedido_id), emp_id text not null,
 recipient_id text not null, token text not null unique default public.hg_reposicion_token(),
 channel_id text,message_id text,sent_version text,attempts int not null default 0,
 next_at timestamptz not null default now(),last_error text, primary key(pedido_id,emp_id)
);
alter table public.hg_reposicion_copias enable row level security;
revoke all on public.hg_reposicion_copias from public,anon,authenticated;
grant all on public.hg_reposicion_copias to service_role;
create or replace function public.hg_reposicion_copias_preparar(p_pedido text default null) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR';end if;
 insert into public.hg_reposicion_copias(pedido_id,emp_id,recipient_id)
 select a.pedido_id,e->>'id',b.discord_id from public.hg_reposicion_avisos a
 join public.datos p on p.clave='pedido:'||a.pedido_id
 cross join public.datos d cross join lateral jsonb_array_elements(d.valor) e
 join public.hg_discord_bindings b on b.emp_id=e->>'id'
 where d.clave='empleados' and e->>'puesto'='Jefe' and not coalesce((e->>'deleted')::boolean,false)
 and b.discord_id<>a.recipient_id and coalesce((p.valor->>'propuesta')::boolean,false)
 and not coalesce((p.valor->>'cancelled')::boolean,false) and (p_pedido is null or a.pedido_id=p_pedido)
 on conflict(pedido_id,emp_id) do nothing;
 return (select coalesce(jsonb_agg(j),'[]') from (
 select c.*,p.valor as pedido,md5(p.valor::text) as version_actual from public.hg_reposicion_copias c
 join public.datos p on p.clave='pedido:'||c.pedido_id
 join public.hg_discord_bindings b on b.emp_id=c.emp_id and b.discord_id=c.recipient_id
 where exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=c.emp_id and e->>'puesto'='Jefe' and not coalesce((e->>'deleted')::boolean,false))
 and c.next_at<=now() and c.sent_version is distinct from md5(p.valor::text)
 and (p_pedido is null or c.pedido_id=p_pedido) order by c.next_at,c.pedido_id limit 8) j);
end $$;
revoke all on function public.hg_reposicion_copias_preparar(text) from public,anon,authenticated;
grant execute on function public.hg_reposicion_copias_preparar(text) to service_role;
-- Ampliar los objetivos de herrería, sin tocar stockmin ni lo ya encargado.
do $$declare def text; n text;begin
 select pg_get_functiondef('public.hg_reponer_herreria()'::regprocedure) into def;
 if position('cfg->''recomendados''' in def)=0 then
 def:=replace(def,'wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);','wanted:=greatest(coalesce((limits->>target.key)::integer,(target.value)::integer),coalesce((cfg->''recomendados''->>target.key)::integer,0));');
 def:=replace(def,'wanted:=greatest(0,wanted-qty-incoming);','if incoming>0 then continue;end if; wanted:=greatest(0,wanted-qty-incoming);');execute def;
 end if;
 foreach n in array array['public.hg_reponer_mina()','public.hg_reponer_lotes(text)'] loop
 if to_regprocedure(n) is not null then
 select pg_get_functiondef(to_regprocedure(n)) into def;
 def:=replace(def,'if qty+incoming>=wanted then continue;end if;','if incoming>0 or qty+incoming>=wanted then continue;end if;');execute def;
 end if;end loop;
 select pg_get_functiondef('public.hg_reposicion_aceptar(text)'::regprocedure) into def;
 def:=replace(def,$old$e->>'id'=cfg->>'ownerEmp'$old$,$new$e->>'id'=coalesce(nullif(current_setting('hg.jefe_acepta',true),''),cfg->>'ownerEmp')$new$);execute def;
end $$;
create or replace function public.hg_reposicion_jefe_aceptar(p_token text) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare principal text; emp text; result jsonb;begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR';end if;
 select a.token,c.emp_id into principal,emp from public.hg_reposicion_copias c join public.hg_reposicion_avisos a on a.pedido_id=c.pedido_id
 join public.hg_discord_bindings b on b.emp_id=c.emp_id and b.discord_id=c.recipient_id
 where c.token=p_token and exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=c.emp_id and e->>'puesto'='Jefe' and not coalesce((e->>'deleted')::boolean,false));
 if principal is null then select token into principal from public.hg_reposicion_avisos where token=p_token;end if;
 if principal is null then raise exception 'PROPUESTA_NO_EXISTE';end if;
 perform set_config('hg.jefe_acepta',coalesce(emp,''),true);
 result:=public.hg_reposicion_aceptar(principal);
 return result||jsonb_build_object('tokenDocumento',principal);
end $$;
revoke all on function public.hg_reposicion_jefe_aceptar(text) from public,anon,authenticated;
grant execute on function public.hg_reposicion_jefe_aceptar(text) to service_role;
update public.datos set valor=jsonb_set(valor,'{recomendados}','{"mat:Pieza de arma":150,"mat:Pieza de arma especial":50,"mat:Tornillo":1200,"mat:Barra de hierro":20,"mat:Cañon de revólver":35,"mat:Culata de revólver":35,"mat:Cañon de pistola":20,"mat:Culata de pistola":20,"mat:Cañon de repetidora":20,"mat:Culata de repetidora":20,"mat:Cañon de rifle":20,"mat:Culata de rifle":20,"mat:Cañon de escopeta":20,"mat:Culata de escopeta":20}'::jsonb),actualizado=now() where clave='cfg:reposicion-herreria';
