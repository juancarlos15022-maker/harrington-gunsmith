-- Escritura atómica de los expedientes; solo el servidor autenticado de Whitmore puede invocarla.
create or replace function public.gob_secretaria_asentar(p_accion text,p_id bigint,p_version timestamptz,p_datos jsonb,p_autor text,p_autor_id text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.gob_registros; doc public.gob_registros; mov public.gob_registros; hist jsonb; nuevo_estado text;
begin
 if p_accion='nuevo' then
  if coalesce(p_datos->>'area','')='' or coalesce(p_datos->>'titulo','')='' then raise exception 'FALTAN_DATOS'; end if;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id,cuando)
   values('secretaria',public.gob_siguiente('secretaria'),'en_tramite',p_datos||jsonb_build_object('historial',jsonb_build_array(jsonb_build_object('acto','Apertura del expediente','por',p_autor,'ms',(extract(epoch from clock_timestamp())*1000)::bigint))),p_autor,p_autor_id,nullif(p_datos->>'plazo','')::timestamptz) returning * into r;
  return jsonb_build_object('registro',to_jsonb(r));
 end if;
 select * into r from public.gob_registros where id=p_id and tipo='secretaria' for update;
 if not found then raise exception 'NO_EXISTE'; end if;
 if p_version is null or r.actualizado<>p_version then raise exception 'VERSION_CAMBIADA'; end if;
 if r.datos->>'doc_id' is not null then select * into doc from public.gob_registros where id=(r.datos->>'doc_id')::bigint and tipo='decreto' for update; end if;
 hist=coalesce(r.datos->'historial','[]'::jsonb)||jsonb_build_array(jsonb_build_object('acto',case p_accion when 'guardar' then 'Enmienda del expediente' when 'remitir' then 'Remitido al Gobernador' when 'devolver' then 'Devuelto para enmienda' when 'ejecutar' then 'Asiento de ejecución' when 'cerrar' then 'Conclusión del asunto' else 'Nota de seguimiento' end,'por',p_autor,'nota',coalesce(p_datos->>'nota',''),'ms',(extract(epoch from clock_timestamp())*1000)::bigint));
 if p_accion='guardar' then
  if doc.estado in ('borrador','firmado') or r.estado in ('ejecutado','concluido','archivado') or (r.estado='pendiente_firma' and doc.estado is distinct from 'descartado') then raise exception 'EXPEDIENTE_CERRADO'; end if;
  update public.gob_registros set datos=p_datos||jsonb_build_object('historial',hist),cuando=nullif(p_datos->>'plazo','')::timestamptz,actualizado=clock_timestamp(),estado='en_tramite' where id=r.id returning * into r;
 elsif p_accion='remitir' then
  if r.estado in ('pendiente_firma','ejecutado','concluido','archivado') or doc.estado='firmado' then raise exception 'YA_REMITIDO'; end if;
  if length(coalesce(p_datos->>'texto',''))<1 then raise exception 'FALTA_ESCRITO'; end if;
  insert into public.gob_registros(tipo,estado,datos,autor,autor_id)
   values('decreto','borrador',jsonb_build_object('clase',coalesce(p_datos->>'clase','decreto'),'titulo',r.datos->>'titulo','texto',p_datos->>'texto','area',r.datos->>'area','area_nombre',r.datos->>'area_nombre','expediente',r.id,'importeCents',r.datos->'importeCents','clase_expediente',r.datos->>'clase'),p_autor,p_autor_id) returning * into doc;
  update public.gob_registros set estado='pendiente_firma',datos=r.datos||jsonb_build_object('doc_id',doc.id,'historial',hist),actualizado=clock_timestamp() where id=r.id returning * into r;
 elsif p_accion='devolver' then
  if doc.id is null or doc.estado<>'borrador' then raise exception 'NO_PENDIENTE'; end if;
  if coalesce(p_datos->>'nota','')='' then raise exception 'FALTA_NOTA'; end if;
  update public.gob_registros set estado='descartado',datos=datos||jsonb_build_object('devuelto',p_datos->>'nota'),actualizado=clock_timestamp() where id=doc.id returning * into doc;
  update public.gob_registros set estado='devuelto',datos=r.datos||jsonb_build_object('historial',hist,'devolucion',p_datos->>'nota'),actualizado=clock_timestamp() where id=r.id returning * into r;
 elsif p_accion in ('ejecutar','cerrar') then
  if r.estado in ('ejecutado','concluido','archivado') then raise exception 'YA_CONCLUIDO'; end if;
  if ((r.datos->>'requiereFirma')::boolean is true or r.datos->>'doc_id' is not null) and (doc.id is null or doc.estado<>'firmado') then raise exception 'FALTA_FIRMA'; end if;
  if p_accion='cerrar' and r.datos->>'clase' in ('ingreso','gasto') then raise exception 'USE_EJECUTAR'; end if;
  if p_accion='ejecutar' then
   if r.datos->>'clase' not in ('ingreso','gasto') or (r.datos->>'importeCents')::bigint<=0 then raise exception 'IMPORTE_NO_VALIDO'; end if;
   if coalesce(p_datos->>'nota','')='' then raise exception 'FALTA_JUSTIFICANTE'; end if;
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id)
    values('movimiento',public.gob_siguiente('movimiento'),'abierto',jsonb_build_object('cents',(case when r.datos->>'clase'='gasto' then -1 else 1 end)*(r.datos->>'importeCents')::bigint,'concepto',r.datos->>'titulo','area',r.datos->>'area','expediente',r.id,'justificante',p_datos->>'nota'),p_autor,p_autor_id) returning * into mov;
   r.datos=r.datos||jsonb_build_object('movimiento_id',mov.id);
  end if;
  update public.gob_registros set estado=case p_accion when 'ejecutar' then 'ejecutado' else 'concluido' end,datos=r.datos||jsonb_build_object('historial',hist),actualizado=clock_timestamp() where id=r.id returning * into r;
 elsif p_accion='nota' then
  if coalesce(p_datos->>'nota','')='' then raise exception 'FALTA_NOTA'; end if;
  update public.gob_registros set datos=r.datos||jsonb_build_object('historial',hist),actualizado=clock_timestamp() where id=r.id returning * into r;
 else raise exception 'ACCION_NO_VALIDA'; end if;
 return jsonb_build_object('registro',to_jsonb(r),'documento',case when doc.id is not null then to_jsonb(doc) else null end,'movimiento',case when mov.id is not null then to_jsonb(mov) else null end);
end $$;
revoke all on function public.gob_secretaria_asentar(text,bigint,timestamptz,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.gob_secretaria_asentar(text,bigint,timestamptz,jsonb,text,text) to service_role;
create index if not exists gob_secretarias_area on public.gob_registros ((datos->>'area'),actualizado desc) where tipo='secretaria';
create or replace function public.gob_secretaria_cuentas()
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('ingresos',coalesce(sum(greatest((datos->>'cents')::bigint,0)),0),'gastos',coalesce(sum(greatest(-(datos->>'cents')::bigint,0)),0)) from public.gob_registros where tipo='movimiento';
$$;
revoke all on function public.gob_secretaria_cuentas() from public,anon,authenticated;
grant execute on function public.gob_secretaria_cuentas() to service_role;
create or replace function public.gob_secretaria_resumen()
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 with asientos as (
  select r.*,d.estado as firma from public.gob_registros r left join public.gob_registros d on d.id=nullif(r.datos->>'doc_id','')::bigint and d.tipo='decreto' where r.tipo='secretaria'
 ), areas as (
  select datos->>'area' as area,count(*) filter(where estado not in ('ejecutado','concluido','archivado')) as abiertos,
  count(*) filter(where estado='pendiente_firma' and firma='borrador') as por_firmar,
  count(*) filter(where estado='pendiente_firma' and firma='firmado') as autorizados,
  count(*) filter(where estado not in ('ejecutado','concluido','archivado') and cuando is not null and (cuando at time zone 'Europe/Madrid')::date <= (now() at time zone 'Europe/Madrid')::date) as plazos
  from asientos group by datos->>'area'
 ), proximos as (
  select id,numero,datos->>'titulo' as titulo,datos->>'area' as area,datos->>'area_nombre' as area_nombre,cuando from asientos where estado not in ('ejecutado','concluido','archivado') and cuando is not null order by cuando limit 8
 ) select jsonb_build_object('areas',coalesce((select jsonb_agg(to_jsonb(areas)) from areas),'[]'::jsonb),'proximos',coalesce((select jsonb_agg(to_jsonb(proximos)) from proximos),'[]'::jsonb));
$$;
revoke all on function public.gob_secretaria_resumen() from public,anon,authenticated;
grant execute on function public.gob_secretaria_resumen() to service_role;
