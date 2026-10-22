-- Una comprobación física conjunta, indivisible e idempotente; solo jefes vigentes.
create table public.hg_negocio_comprobaciones(id uuid primary key,creado timestamptz not null default clock_timestamp(),emp_id text not null,huella text not null,resultado jsonb not null);
alter table public.hg_negocio_comprobaciones enable row level security;
revoke all on public.hg_negocio_comprobaciones from public,anon,authenticated;
grant all on public.hg_negocio_comprobaciones to service_role;

create function public.hg_negocio_preparar() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s jsonb;h jsonb;begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES';end if;
 s:=public.hg_caja_preparar();
 select coalesce(jsonb_agg(resultado order by creado desc),'[]') into h from (select creado,resultado from public.hg_negocio_comprobaciones order by creado desc limit 30) t;
 return jsonb_build_object('caja',s-'movimientos'-'historial','stock',public.inventario_preparar(),'historial',h);
end $$;
revoke all on function public.hg_negocio_preparar() from public,anon;
grant execute on function public.hg_negocio_preparar() to authenticated;

create function public.hg_negocio_guardar(p_id uuid,p_version text,p_contado bigint,p_items jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare r public.hg_negocio_comprobaciones;inv jsonb;caja jsonb;res jsonb;emp text;huella text;prev jsonb;it jsonb;fechas jsonb:='{}';stamp timestamptz:=clock_timestamp();begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES';end if;
 emp:=public.hg_claims()->'app_metadata'->>'emp_id';
 huella:=md5(jsonb_build_array(p_version,p_contado,p_items)::text);
 perform pg_advisory_xact_lock(190221026);
 select * into r from public.hg_negocio_comprobaciones where id=p_id;
 if found then
  if r.emp_id is distinct from emp or r.huella<>huella then raise exception 'PETICION_REUTILIZADA';end if;
  return r.resultado||jsonb_build_object('replayed',true,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if p_id is null then raise exception 'PETICION_INVALIDA';end if;
 if exists(select 1 from public.hg_caja_recuentos where id=p_id) or exists(select 1 from public.datos where clave='inventario:'||p_id) then raise exception 'PETICION_REUTILIZADA';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 5000 then raise exception 'RECUENTO_VACIO';end if;
 -- La fecha anterior corresponde a cada artículo, aunque se cuenten selecciones distintas.
 for it in select * from jsonb_array_elements(p_items) loop
  select jsonb_build_object('id',d.valor->>'id','fecha',d.actualizado) into prev from public.datos d
  where d.clave like 'inventario:%' and exists(select 1 from jsonb_array_elements(coalesce(d.valor->'items','[]')) x where x->>'k'=it->>'k') order by d.actualizado desc limit 1;
  fechas:=fechas||jsonb_build_object(it->>'k',prev);
 end loop;
 -- Ambas operaciones están dentro de esta transacción: cualquier conflicto revierte todo.
 inv:=public.inventario_guardar(p_id::text,p_items);
 caja:=public.hg_caja_guardar(p_id,p_version,p_contado,'[]','Comprobación conjunta de negocio');
 res:=jsonb_build_object('id',p_id,'creado',stamp,'nombre',caja->'nombre','caja',caja,'items',(select jsonb_agg(x||jsonb_build_object('npcTeo',coalesce(y->'npcTeo','0'::jsonb))) from jsonb_array_elements(inv->'items') x join jsonb_array_elements(p_items) y on x->>'k'=y->>'k'),'warnings',inv->'warnings','anteriores',fechas,'desde_caja',hg_interno.caja_snapshot()->'base_fecha','cuadra',(caja->>'diferencia')::bigint=0 and (inv->>'changed')::int=0,'replayed',false);
 -- La base temporal de caja es la anterior, conservada en el snapshot del recuento.
 res:=res||jsonb_build_object('desde_caja',(select snapshot->'base_fecha' from public.hg_caja_recuentos where id=p_id));
 insert into public.hg_negocio_comprobaciones(id,emp_id,huella,resultado) values(p_id,emp,huella,res);
 -- Se conserva un solo asiento público de la comprobación, además del cierre de caja normal.
 update public.hg_potencial_eventos set tipo='actualizacion' where enviado is null and clave in ('inventario:inventario:'||p_id,'caja:'||p_id);
 perform hg_interno.potencial_encolar('negocio:'||p_id,'comprobacion',res);
 return res||jsonb_build_object('stock',inv->'stock','records',inv->'records');
end $$;
revoke all on function public.hg_negocio_guardar(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.hg_negocio_guardar(uuid,text,bigint,jsonb) to authenticated;
