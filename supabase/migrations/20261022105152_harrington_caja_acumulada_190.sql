-- Caja acumulada: apertura fija de 190 dólares; cierres sin reiniciar el saldo.
create table public.hg_caja_recuentos (
 id uuid primary key, creado timestamptz not null default now(), emp_id text not null,
 nombre text not null, contado bigint not null check(contado>=0), esperado bigint not null,
 diferencia bigint not null, estado text not null check(estado in ('cerrada','pendiente')),
 nota text not null default '', snapshot jsonb not null, conceptos jsonb not null default '[]',
 discord_id text, discord_canal text, discord_error text, discord_lease timestamptz,
 check(diferencia=contado-esperado),check((estado='cerrada')=(diferencia=0))
);
alter table public.hg_caja_recuentos enable row level security;
revoke all on public.hg_caja_recuentos from public,anon,authenticated;
grant all on public.hg_caja_recuentos to service_role;

create or replace function hg_interno.caja_bloquear() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if (case when tg_op='DELETE' then old.clave else new.clave end) ~ '^(venta|gasto):' then perform pg_advisory_xact_lock(190221026);end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function hg_interno.caja_bloquear() from public,anon,authenticated;
create trigger hg_aa_caja before insert or update or delete on public.datos for each row execute function hg_interno.caja_bloquear();

create or replace function hg_interno.caja_snapshot() returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare filas jsonb;ing bigint;gas bigint;begin
 -- Normalización en céntimos; se conservan también anulaciones y costes sin salida.
 with r as (select clave,valor v from public.datos where clave ~ '^(venta|gasto):' and not coalesce((valor->>'deleted')::boolean,false)),
 x as (select clave,v,case when clave like 'venta:%' then 'ingreso' else 'gasto' end tipo,
 case when coalesce((v->>'voided')::boolean,false) then 'Venta anulada'
 when coalesce((v->>'sinSalidaCaja')::boolean,false) then 'Coste sin salida de caja'
 when clave like 'venta:%' and v->>'op' in ('personal','regalo','presupuesto') then 'Operación sin cobro' else '' end excluido,
 case when clave like 'gasto:%' then (v->>'cents')::bigint
 when v->>'op'='encargo' then (v->>'totalCents')::bigint-(v->>'dueCents')::bigint
 else (v->>'dueCents')::bigint end importe from r),
 l as (select jsonb_build_object('clave',clave,'tipo',tipo,'fecha',coalesce(v->>'date',''),'hora',coalesce(v->>'time',''),'concepto',coalesce(v->>'concepto',v->>'client','Sin concepto'),'por',coalesce(v->>'employee',v->>'por',''),'cents',case when excluido<>'' then 0 else importe end,'excluido',excluido) f,tipo,excluido,importe from x)
 select coalesce(jsonb_agg(f order by f->>'clave'),'[]'),coalesce(sum(importe) filter(where tipo='ingreso' and excluido=''),0),coalesce(sum(importe) filter(where tipo='gasto' and excluido=''),0) into filas,ing,gas from l;
 if exists(select 1 from jsonb_array_elements(filas) f where f->>'excluido'='' and (f->>'cents' is null or (f->>'cents')::bigint<0)) then raise exception 'MOVIMIENTO_INVALIDO';end if;
 return jsonb_build_object('inicial',19000,'ingresos',ing,'gastos',gas,'esperado',19000+ing-gas,'movimientos',filas,'version',md5(filas::text),'calculado',now());
end $$;
revoke all on function hg_interno.caja_snapshot() from public,anon,authenticated;
grant execute on function hg_interno.caja_snapshot() to service_role;

create or replace function public.hg_caja_preparar() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s jsonb;h jsonb;begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES';end if;
 perform pg_advisory_xact_lock(190221026);s:=hg_interno.caja_snapshot();
 select coalesce(jsonb_agg(to_jsonb(t)-'snapshot'-'discord_lease' order by creado desc),'[]') into h from (select * from public.hg_caja_recuentos order by creado desc limit 100) t;
 return s||jsonb_build_object('historial',h);
end $$;
revoke all on function public.hg_caja_preparar() from public,anon;
grant execute on function public.hg_caja_preparar() to authenticated;

create or replace function public.hg_caja_guardar(p_id uuid,p_version text,p_contado bigint,p_conceptos jsonb default '[]',p_nota text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s jsonb;r public.hg_caja_recuentos;g jsonb;total bigint:=0;n integer:=0;emp text;nom text;faltante bigint;begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES';end if;
 perform pg_advisory_xact_lock(190221026);
 select * into r from public.hg_caja_recuentos where id=p_id;
 if found then return to_jsonb(r)-'snapshot'-'discord_lease';end if;
 if p_id is null or p_contado is null or p_contado<0 or p_contado>100000000000 then raise exception 'CONTADO_INVALIDO';end if;
 if p_conceptos is null or jsonb_typeof(p_conceptos)<>'array' or jsonb_array_length(p_conceptos)>20 or length(coalesce(p_nota,''))>1000 then raise exception 'CONCEPTOS_INVALIDOS';end if;
 s:=hg_interno.caja_snapshot();if p_version is distinct from s->>'version' then raise exception 'CAJA_CAMBIADA';end if;
 faltante:=(s->>'esperado')::bigint-p_contado;
 for g in select * from jsonb_array_elements(p_conceptos) loop
  if length(trim(coalesce(g->>'concepto','')))<3 or length(g->>'concepto')>200 or coalesce(g->>'cents','') !~ '^[0-9]{1,11}$' then raise exception 'CONCEPTOS_INVALIDOS';end if;
  if (g->>'cents')::bigint<=0 then raise exception 'CONCEPTOS_INVALIDOS';end if;total:=total+(g->>'cents')::bigint;
 end loop;
 if total>0 and (faltante<=0 or total>faltante) then raise exception 'GASTOS_SUPERAN_FALTANTE';end if;
 emp:=public.hg_claims()->'app_metadata'->>'emp_id';
 select e->>'name' into nom from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
 if emp is null or nom is null then raise exception 'SOLO_JEFES';end if;
 for g in select * from jsonb_array_elements(p_conceptos) loop
 n:=n+1;
 insert into public.datos(clave,valor,actualizado) values('gasto:caja-'||p_id||'-'||n,jsonb_build_object('id','caja-'||p_id||'-'||n,'cat','otros','concepto',trim(g->>'concepto'),'cents',(g->>'cents')::bigint,'date',to_char(now() at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(now() at time zone 'Europe/Madrid','HH24:MI'),'day',((now() at time zone 'Europe/Madrid')::date-date '1970-01-01'),'empId',emp,'por',nom,'recuento',p_id,'registradoAhora',true),now());
 end loop;
 s:=hg_interno.caja_snapshot();
 insert into public.hg_caja_recuentos(id,emp_id,nombre,contado,esperado,diferencia,estado,nota,snapshot,conceptos)
 values(p_id,emp,nom,p_contado,(s->>'esperado')::bigint,p_contado-(s->>'esperado')::bigint,case when p_contado=(s->>'esperado')::bigint then 'cerrada' else 'pendiente' end,trim(coalesce(p_nota,'')),s,p_conceptos) returning * into r;
 return to_jsonb(r)-'snapshot'-'discord_lease';
end $$;
revoke all on function public.hg_caja_guardar(uuid,text,bigint,jsonb,text) from public,anon;
grant execute on function public.hg_caja_guardar(uuid,text,bigint,jsonb,text) to authenticated;

create or replace function public.hg_caja_ver(p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r jsonb;begin if not public.hg_es_jefe() then raise exception 'SOLO_JEFES';end if;
 select to_jsonb(t)-'discord_lease' into r from public.hg_caja_recuentos t where id=p_id;return r;end $$;
revoke all on function public.hg_caja_ver(uuid) from public,anon;
grant execute on function public.hg_caja_ver(uuid) to authenticated;
