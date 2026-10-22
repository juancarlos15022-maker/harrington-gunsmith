create function hg_interno.potencial_historial() returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
with mov as (
 select valor v,case when valor->>'ts' ~ '^[0-9]{10,16}$' then to_timestamp((valor->>'ts')::numeric/1000) else actualizado end momento
 from public.datos where clave like 'mov:%' and not coalesce((valor->>'deleted')::boolean,false) and coalesce(valor->>'why','') ~* '^(fabricaci[oó]n|fabricar)'
),m as (select v,momento,coalesce(v->>'who','Sin autor') autor,coalesce(v->>'ts',momento::text)||'|'||coalesce(v->>'who','') lote,regexp_replace(v->>'name',' \(material\)$','') nombre,(v->>'delta')::int delta from mov where momento>=now()-interval '30 days'),
 fallback as (select d.valor->>'prod' nombre,(d.valor->>'q')::int delta,coalesce(d.valor->>'emp','Sin autor') autor,(d.valor->>'ts')||'|'||coalesce(d.valor->>'emp','') lote,to_timestamp((d.valor->>'ts')::numeric/1000) momento from public.datos d where d.clave like 'fablote:%' and not coalesce((d.valor->>'deleted')::boolean,false) and d.valor->>'ts' ~ '^[0-9]{10,16}$' and (d.valor->>'q')::numeric>0 and to_timestamp((d.valor->>'ts')::numeric/1000)>=now()-interval '30 days' and not exists(select 1 from m where m.delta>0 and m.nombre=d.valor->>'prod' and m.lote=(d.valor->>'ts')||'|'||coalesce(d.valor->>'emp',''))),
 registros as (select nombre,delta,autor,lote,momento from m union all select nombre,delta,autor,lote,momento from fallback),
 fabricados as (select nombre producto,sum(delta) unidades,sum(delta) filter(where momento>=now()-interval '7 days') recientes from registros where delta>0 group by nombre),
 ventas as (select d.valor v,x,case when d.valor->>'ts' ~ '^[0-9]{10,16}$' then to_timestamp((d.valor->>'ts')::numeric/1000) when d.valor->>'ts' ~ '^20[0-9]{2}-' then (d.valor->>'ts')::timestamptz else d.actualizado end momento from public.datos d cross join lateral jsonb_array_elements(coalesce(d.valor->'items','[]')) x where d.clave like 'venta:%' and coalesce(d.valor->>'op','venta')='venta' and not coalesce((d.valor->>'voided')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)),
 vendidos as (select x->>'name' producto,sum((x->>'qty')::int) unidades,sum((x->>'qty')::int) filter(where momento>=now()-interval '7 days') recientes,round(sum((x->>'qty')::numeric*(x->>'cents')::numeric*case when coalesce((v->>'baseCents')::numeric,0)>0 then (v->>'totalCents')::numeric/(v->>'baseCents')::numeric else 1 end)/nullif(sum((x->>'qty')::numeric),0),4) precio_medio from ventas where momento>=now()-interval '30 days' and (x->>'qty')::numeric>0 group by x->>'name'),
 consumos as (select nombre material,sum(-delta) unidades,sum(-delta) filter(where momento>=now()-interval '7 days') recientes from m where delta<0 group by nombre),
 lotes as (select lote,min(momento) momento,max(autor) autor,coalesce(jsonb_agg(jsonb_build_object('producto',nombre,'cantidad',delta)) filter(where delta>0),'[]') productos,coalesce(jsonb_agg(jsonb_build_object('material',nombre,'cantidad',-delta)) filter(where delta<0),'[]') materiales from registros group by lote)
 select jsonb_build_object('desde',now()-interval '30 days','hasta',now(),'fabricacion',coalesce((select jsonb_agg(to_jsonb(f)) from fabricados f),'[]'),'ventas',coalesce((select jsonb_agg(to_jsonb(v)) from vendidos v),'[]'),'consumos',coalesce((select jsonb_agg(to_jsonb(c)) from consumos c),'[]'),'lotes',coalesce((select jsonb_agg(to_jsonb(l)) from lotes l),'[]'),'cobertura','Movimientos de fabricación registrados y fablotes solo cuando no existe su alta de producción (sin duplicados) y ventas no anuladas. Recetas y tarifas actuales; precio medio cobrado cuando consta. No reconstruye movimientos que no se registraron.');
$$;
revoke all on function hg_interno.potencial_historial() from public,anon,authenticated;
grant execute on function hg_interno.potencial_historial() to service_role;
create or replace function hg_interno.potencial_snapshot(p_desde bigint default 0) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
select jsonb_build_object(
 'historial',hg_interno.potencial_historial(),'momento',now(),'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock),
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

update public.hg_potencial_estado set sucio=true,generacion=generacion+1 where id=1;

select hg_interno.potencial_encolar('modelo-historico-v1','analisis_historico');
