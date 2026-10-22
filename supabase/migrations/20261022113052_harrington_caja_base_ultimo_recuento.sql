alter table public.hg_caja_recuentos alter column creado set default clock_timestamp();
create or replace function hg_interno.caja_snapshot() returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare filas jsonb;ing bigint;gas bigint;b public.hg_caja_recuentos;s jsonb;begin
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
 s:=jsonb_build_object('inicial',19000,'ingresos',ing,'gastos',gas,'esperado',19000+ing-gas,'movimientos',filas,'version',md5(filas::text),'calculado',now());
 select * into b from public.hg_caja_recuentos order by creado desc,id desc limit 1;
 s:=s||jsonb_build_object('version_movimientos',s->>'version','teorico_desde_inicio',19000+ing-gas,'ajuste_recuentos',0);
 if b.id is not null then
  s:=s||jsonb_build_object('esperado',b.contado+ing-(b.snapshot->>'ingresos')::bigint-gas+(b.snapshot->>'gastos')::bigint,'base_recuento',b.id,'base_fecha',b.creado,'base_contado',b.contado,'base_ingresos',(b.snapshot->>'ingresos')::bigint,'base_gastos',(b.snapshot->>'gastos')::bigint,'diferencia_ultimo_recuento',b.diferencia,'version',md5((s->>'version')||':'||b.id::text));
  s:=s||jsonb_build_object('ajuste_recuentos',(s->>'esperado')::bigint-(19000+ing-gas));
 end if;
 return s;
end $$;
create or replace function hg_interno.potencial_encolar(p_clave text,p_tipo text,p_fuente jsonb default '{}') returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare prev jsonb;s jsonb;begin
 select snapshot into prev from public.hg_potencial_estado where id=1 for update;
 if exists(select 1 from public.hg_potencial_eventos where clave=p_clave) then return;end if;
 s:=hg_interno.potencial_snapshot(coalesce((prev->>'diario_hasta')::bigint,0));
 if p_tipo='inventario' then s:=s||jsonb_build_object('ultimo_inventario',p_fuente||jsonb_build_object('momento',now()));end if;
 if p_tipo='caja' then s:=s||jsonb_build_object('ultimo_recuento',p_fuente);end if;
 insert into public.hg_potencial_eventos(clave,tipo,fuente,snapshot,anterior) values(p_clave,p_tipo,p_fuente,s,prev);
 update public.hg_potencial_estado set snapshot=s,sucio=false where id=1;
end $$;

update public.hg_potencial_estado set sucio=true,generacion=generacion+1 where id=1;
