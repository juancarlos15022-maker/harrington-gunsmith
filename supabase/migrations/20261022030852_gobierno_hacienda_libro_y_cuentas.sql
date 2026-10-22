-- Hacienda de Silver Peak. Las reglas y dotaciones generan un expediente y un escrito para firma.
create or replace function public.gob_hacienda_expediente(p_id bigint,p_titulo text,p_texto text,p_importe bigint,p_clase text,p_autor text,p_autor_id text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.gob_registros; d public.gob_registros;
begin
 p_titulo=left(p_titulo,100);
 insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id)
 values('secretaria',public.gob_siguiente('secretaria'),'pendiente_firma',jsonb_build_object('area','economia','area_nombre','Economía','clase',p_clase,'titulo',p_titulo,'texto',p_texto,'importeCents',p_importe,'requiereFirma',true,'hacienda_id',p_id,'historial',jsonb_build_array(jsonb_build_object('acto','Elevado por Hacienda para firma','por',p_autor,'ms',(extract(epoch from clock_timestamp())*1000)::bigint))),p_autor,p_autor_id) returning * into r;
 insert into public.gob_registros(tipo,estado,datos,autor,autor_id)
 values('decreto','borrador',jsonb_build_object('clase','decreto','titulo',p_titulo,'texto',p_texto,'area','economia','area_nombre','Economía','expediente',r.id,'importeCents',p_importe,'hacienda_id',p_id),p_autor,p_autor_id) returning * into d;
 update public.gob_registros set datos=datos||jsonb_build_object('doc_id',d.id) where id=r.id returning * into r;
 update public.gob_registros set datos=datos||jsonb_build_object('expediente_id',r.id) where id=p_id;
 return jsonb_build_object('expediente',to_jsonb(r),'documento',to_jsonb(d));
end $$;
revoke all on function public.gob_hacienda_expediente(bigint,text,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.gob_hacienda_expediente(bigint,text,text,bigint,text,text,text) to service_role;

create or replace function public.gob_hacienda_asentar(p_accion text,p_id bigint,p_datos jsonb,p_autor text,p_autor_id text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare r public.gob_registros; fuente public.gob_registros; contrib public.gob_registros; ayto public.gob_registros; exp public.gob_registros; doc public.gob_registros; mov public.gob_registros; fondos jsonb; enlace jsonb; total bigint; cobrado bigint; cents bigint; clave text; especie text; etiqueta text; cuerpo text;
begin
 if p_accion='arqueo' then
  perform pg_advisory_xact_lock(hashtext('hci:tesoreria'));
  if coalesce((p_datos->>'importeCents')::bigint,-1)<0 then raise exception 'IMPORTE_NO_VALIDO';end if;
  fondos=public.gob_hacienda_tesoreria();
  p_datos=p_datos||jsonb_build_object('saldoAnterior',fondos->'fondos','saldoPosterior',(p_datos->>'importeCents')::bigint,'diferencia',case when (fondos->>'conocido')::boolean then (p_datos->>'importeCents')::bigint-(fondos->>'fondos')::bigint else null end);
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id,creado) values('hci_arqueo',public.gob_siguiente('hci_arqueo'),'asentado',p_datos,p_autor,p_autor_id,clock_timestamp()) returning * into r;
 elsif p_accion in ('localidad','padron') then
  especie=case p_accion when 'localidad' then 'hci_localidad' else 'hci_padron' end;
  clave=p_datos->>'clave';if coalesce(clave,'')='' or coalesce(p_datos->>'nombre','')='' then raise exception 'FALTAN_DATOS';end if;
  perform pg_advisory_xact_lock(hashtext('hci:registro:'||especie||':'||clave));
  if p_datos->>'localidad_id' is not null then select * into ayto from public.gob_registros where id=(p_datos->>'localidad_id')::bigint and tipo='hci_localidad' and estado='activo';if not found then raise exception 'LOCALIDAD_NO_VALIDA';end if;end if;
  if exists(select 1 from public.gob_registros where tipo=especie and datos->>'clave'=clave and id<>coalesce(p_id,0)) then raise exception 'YA_REGISTRADO';end if;
  if p_id is not null then
   select * into r from public.gob_registros where id=p_id and tipo=especie for update;if not found then raise exception 'NO_EXISTE';end if;
   if r.actualizado<>(p_datos->>'version')::timestamptz then raise exception 'VERSION_CAMBIADA';end if;
   update public.gob_registros set datos=p_datos-'version',actualizado=clock_timestamp() where id=r.id returning * into r;
  else
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values(especie,public.gob_siguiente(especie),'activo',p_datos-'version',p_autor,p_autor_id) returning * into r;
  end if;
 elsif p_accion in ('presupuesto','dotacion') then
  clave=p_datos->>'clave';especie=case p_accion when 'presupuesto' then 'hci_presupuesto' else 'hci_dotacion' end;
  perform pg_advisory_xact_lock(hashtext('hci:propuesta:'||especie||':'||clave));
  if exists(select 1 from public.gob_registros s join public.gob_registros e on e.id=(s.datos->>'expediente_id')::bigint join public.gob_registros d on d.id=(e.datos->>'doc_id')::bigint where s.tipo=especie and s.datos->>'clave'=clave and d.estado='borrador') then raise exception 'PROPUESTA_PENDIENTE';end if;
  if p_datos->>'localidad_id' is not null then select * into ayto from public.gob_registros where id=(p_datos->>'localidad_id')::bigint and tipo='hci_localidad' and estado='activo';if not found then raise exception 'LOCALIDAD_NO_VALIDA';end if;end if;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values(especie,public.gob_siguiente(especie),'propuesta',p_datos,p_autor,p_autor_id) returning * into r;
  enlace=public.gob_hacienda_expediente(r.id,p_datos->>'titulo',p_datos->>'escrito',coalesce((p_datos->>'importeCents')::bigint,0),case when p_accion='presupuesto' then 'presupuesto' else 'informe' end,p_autor,p_autor_id);
 elsif p_accion='nomina' then
  select * into fuente from public.gob_registros where id=(p_datos->>'dotacion_id')::bigint and tipo='hci_dotacion';if not found then raise exception 'DOTACION_NO_VALIDA';end if;
  select * into exp from public.gob_registros where id=(fuente.datos->>'expediente_id')::bigint;select * into doc from public.gob_registros where id=(exp.datos->>'doc_id')::bigint;
  if doc.estado is distinct from 'firmado' then raise exception 'FALTA_FIRMA';end if;
  if exists(select 1 from public.gob_registros s join public.gob_registros e on e.id=(s.datos->>'expediente_id')::bigint join public.gob_registros d on d.id=(e.datos->>'doc_id')::bigint where s.tipo='hci_dotacion' and s.datos->>'clave'=fuente.datos->>'clave' and s.id>fuente.id and d.estado='firmado') then raise exception 'RESOLUCION_SUSTITUIDA';end if;
  if not exists(select 1 from public.gob_registros where id=(p_datos->>'presupuesto_id')::bigint and tipo='hci_presupuesto') then raise exception 'PRESUPUESTO_NO_VALIDO';end if;
  clave=(fuente.datos->>'clave')||':'||(p_datos->>'periodo');perform pg_advisory_xact_lock(hashtext('hci:nomina:'||clave));
  if exists(select 1 from public.gob_registros s join public.gob_registros e on e.id=(s.datos->>'expediente_id')::bigint join public.gob_registros d on d.id=(e.datos->>'doc_id')::bigint where s.tipo='hci_nomina' and s.datos->>'clave'=clave and d.estado<>'descartado') then raise exception 'NOMINA_YA_PREPARADA';end if;
  cents=(fuente.datos->>'importeCents')::bigint;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id)
   values('hci_nomina',public.gob_siguiente('hci_nomina'),'propuesta',fuente.datos-'expediente_id'||p_datos||jsonb_build_object('clave',clave,'dotacion_id',fuente.id),p_autor,p_autor_id) returning * into r;
  cuerpo='Se somete a autorización el pago de '||(fuente.datos->>'nombre')||', en calidad de '||(fuente.datos->>'cargo')||', correspondiente al periodo cerrado el '||(p_datos->>'periodoNombre')||'.'||E'\n\nDotación por periodo: $'||to_char(cents/100.0,'FM9999999990.00')||'.'||E'\n\nEl pago se asentará en Tesorería únicamente al ejecutarse y presentar su justificante.';
  enlace=public.gob_hacienda_expediente(r.id,'Nómina · '||(fuente.datos->>'nombre')||' · '||(p_datos->>'periodoNombre'),cuerpo,cents,'gasto',p_autor,p_autor_id);
 elsif p_accion='orden' then
  cents=(p_datos->>'importeCents')::bigint;
  if cents<=0 or p_datos->>'sentido' not in ('ingreso','gasto') or coalesce(p_datos->>'origen','')='' or coalesce(p_datos->>'destino','')='' then raise exception 'FALTAN_DATOS';end if;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('hci_orden',public.gob_siguiente('hci_orden'),'propuesta',p_datos,p_autor,p_autor_id) returning * into r;
  enlace=public.gob_hacienda_expediente(r.id,p_datos->>'titulo',(p_datos->>'escrito'),cents,p_datos->>'sentido',p_autor,p_autor_id);
 elsif p_accion='alcaldia' then
  select * into ayto from public.gob_registros where id=(p_datos->>'localidad_id')::bigint and tipo='hci_localidad' and estado='activo';if not found then raise exception 'LOCALIDAD_NO_VALIDA';end if;
  if not exists(select 1 from public.gob_registros where id=(p_datos->>'presupuesto_id')::bigint and tipo='hci_presupuesto') then raise exception 'PRESUPUESTO_NO_VALIDO';end if;
  cents=(p_datos->>'importeCents')::bigint;if cents<=0 or cents>(p_datos->>'solicitadoCents')::bigint then raise exception 'ASIGNACION_NO_VALIDA';end if;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id)
   values('hci_alcaldia',public.gob_siguiente('hci_alcaldia'),'propuesta',p_datos||jsonb_build_object('localidad',ayto.datos->>'nombre','alcalde',ayto.datos->>'alcalde'),p_autor,p_autor_id) returning * into r;
  cuerpo='La Alcaldía de '||(ayto.datos->>'nombre')||' presenta la siguiente propuesta:'||E'\n\n'||(p_datos->>'texto')||E'\n\nImporte solicitado: $'||to_char((p_datos->>'solicitadoCents')::bigint/100.0,'FM9999999990.00')||'.'||E'\nAsignación propuesta para autorización: $'||to_char(cents/100.0,'FM9999999990.00')||'.'||E'\n\nLa transferencia y su justificante quedarán asentados en Tesorería; el expediente conservará el seguimiento del destino de los fondos.';
  enlace=public.gob_hacienda_expediente(r.id,'Asignación a '||(ayto.datos->>'nombre')||' · '||(p_datos->>'titulo'),cuerpo,cents,'gasto',p_autor,p_autor_id);
 else raise exception 'ACCION_NO_VALIDA';end if;
 return jsonb_build_object('registro',to_jsonb(r),'documento',enlace->'documento','expediente',enlace->'expediente','movimiento',case when mov.id is not null then to_jsonb(mov) else null end);
end $$;
revoke all on function public.gob_hacienda_asentar(text,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.gob_hacienda_asentar(text,bigint,jsonb,text,text) to service_role;
create index if not exists gob_hacienda_tipos on public.gob_registros(tipo,id desc) where tipo like 'hci_%';
create index if not exists gob_hacienda_claves on public.gob_registros(tipo,(datos->>'clave')) where tipo in ('hci_padron','hci_localidad','hci_presupuesto','hci_dotacion','hci_liquidacion','hci_nomina');

-- El arqueo es una referencia manual de la cuenta del juego, sin conexión al servidor.
create or replace function public.gob_hacienda_tesoreria()
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 with ultimo as (select * from public.gob_registros where tipo='hci_arqueo' order by creado desc,id desc limit 1),
 pagos as (select coalesce(sum((datos->>'cents')::bigint),0) as variacion from public.gob_registros where tipo='movimiento' and creado>(select creado from ultimo)),
 pendientes as (select coalesce(sum((e.datos->>'importeCents')::bigint),0) as importe from public.gob_registros e join public.gob_registros d on d.id=(e.datos->>'doc_id')::bigint where e.tipo='secretaria' and e.datos->>'clase'='gasto' and d.estado='firmado' and e.estado not in ('ejecutado','concluido','archivado'))
 select jsonb_build_object('conocido',exists(select 1 from ultimo),'arqueo',(select to_jsonb(ultimo) from ultimo),'fondos',(select (datos->>'importeCents')::bigint from ultimo)+(select variacion from pagos),'pendientePago',(select importe from pendientes));
$$;
revoke all on function public.gob_hacienda_tesoreria() from public,anon,authenticated;
grant execute on function public.gob_hacienda_tesoreria() to service_role;
create or replace function public.gob_hacienda_control_pago()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare e public.gob_registros; h public.gob_registros; d public.gob_registros; fondos jsonb; cambio bigint; origen text; destino text;
begin
 if new.tipo<>'movimiento' then return new;end if;
 cambio=(new.datos->>'cents')::bigint;
 if cambio is null or cambio=0 then raise exception 'IMPORTE_NO_VALIDO';end if;
 select * into e from public.gob_registros where id=nullif(new.datos->>'expediente','')::bigint and tipo='secretaria';
 select * into d from public.gob_registros where id=nullif(e.datos->>'doc_id','')::bigint and tipo='decreto';
 if e.id is null or d.estado is distinct from 'firmado' then raise exception 'FALTA_FIRMA';end if;
 if cambio<>(case when e.datos->>'clase'='gasto' then -1 else 1 end)*(e.datos->>'importeCents')::bigint then raise exception 'IMPORTE_NO_VALIDO';end if;
 if exists(select 1 from public.gob_registros where tipo='movimiento' and datos->>'expediente'=e.id::text) then raise exception 'YA_CONCLUIDO';end if;
 select * into h from public.gob_registros where id=nullif(e.datos->>'hacienda_id','')::bigint;
 origen=case when cambio<0 then 'Tesorería del Gobierno' else coalesce(h.datos->>'origen','Procedencia detallada en expediente') end;
 destino=case when cambio>0 then 'Tesorería del Gobierno' else coalesce(h.datos->>'destino',h.datos->>'nombre','Alcaldía de '||(h.datos->>'localidad'),e.datos->>'titulo') end;
 origen=coalesce(h.datos->>'origen',origen);destino=coalesce(h.datos->>'destino',destino);
 perform pg_advisory_xact_lock(hashtext('hci:tesoreria'));
 fondos=public.gob_hacienda_tesoreria();if not (fondos->>'conocido')::boolean then raise exception 'FALTA_ARQUEO';end if;
 if (fondos->>'fondos')::bigint+cambio<0 then raise exception 'FONDOS_INSUFICIENTES';end if;
 new.creado=clock_timestamp();
 new.datos=new.datos||jsonb_build_object('origen',origen,'destino',destino,'saldoAnterior',fondos->'fondos','saldoPosterior',(fondos->>'fondos')::bigint+cambio,'documento_id',d.id,'autorizadoPor',d.datos->>'firmadoPor','firma',d.datos->>'firma','hacienda_id',h.id,'localidad_id',h.datos->'localidad_id','localidad',h.datos->>'localidad','presupuesto_id',h.datos->'presupuesto_id');
 return new;
end $$;
revoke all on function public.gob_hacienda_control_pago() from public,anon,authenticated;
grant execute on function public.gob_hacienda_control_pago() to service_role;
drop trigger if exists gob_hacienda_pago on public.gob_registros;
create trigger gob_hacienda_pago before insert on public.gob_registros for each row execute function public.gob_hacienda_control_pago();

-- La firma comprueba el crédito disponible bajo bloqueo para evitar dos autorizaciones concurrentes.
create or replace function public.gob_hacienda_comprobar_credito()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare ficha public.gob_registros; presupuesto public.gob_registros; e public.gob_registros; d public.gob_registros; comprometido bigint;
begin
 if new.tipo<>'decreto' or new.estado<>'firmado' or old.estado='firmado' or new.datos->>'hacienda_id' is null then return new;end if;
 select * into ficha from public.gob_registros where id=(new.datos->>'hacienda_id')::bigint;
 if ficha.tipo not in ('hci_nomina','hci_alcaldia','hci_orden') or ficha.datos->>'sentido'='ingreso' then return new;end if;
 if ficha.tipo='hci_orden' and ficha.datos->>'presupuesto_id' is null then return new;end if;
 select * into presupuesto from public.gob_registros where id=(ficha.datos->>'presupuesto_id')::bigint and tipo='hci_presupuesto';if not found then raise exception 'PRESUPUESTO_NO_VALIDO';end if;
 perform pg_advisory_xact_lock(hashtext('hci:credito:'||presupuesto.id));
 select * into e from public.gob_registros where id=(presupuesto.datos->>'expediente_id')::bigint;select * into d from public.gob_registros where id=(e.datos->>'doc_id')::bigint;
 if d.estado is distinct from 'firmado' then raise exception 'PRESUPUESTO_SIN_FIRMA';end if;
 select coalesce(sum((s.datos->>'importeCents')::bigint),0) into comprometido from public.gob_registros s join public.gob_registros ex on ex.id=(s.datos->>'expediente_id')::bigint join public.gob_registros doc on doc.id=(ex.datos->>'doc_id')::bigint where s.tipo in ('hci_nomina','hci_alcaldia','hci_orden') and coalesce(s.datos->>'sentido','gasto')='gasto' and s.datos->>'presupuesto_id'=presupuesto.id::text and doc.estado='firmado' and s.id<>ficha.id;
 if comprometido+(ficha.datos->>'importeCents')::bigint>(presupuesto.datos->>'importeCents')::bigint then raise exception 'PRESUPUESTO_INSUFICIENTE';end if;
 return new;
end $$;
revoke all on function public.gob_hacienda_comprobar_credito() from public,anon,authenticated;
grant execute on function public.gob_hacienda_comprobar_credito() to service_role;
drop trigger if exists gob_hacienda_credito on public.gob_registros;
create trigger gob_hacienda_credito before update of estado on public.gob_registros for each row execute function public.gob_hacienda_comprobar_credito();

create or replace function public.gob_hacienda_libros()
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 with fichas as (
  select r.*,e.estado as estado_expediente,e.actualizado as version_expediente,d.id as documento_id,d.estado as estado_firma,
   case when e.estado='ejecutado' then 'pagado' when d.estado='firmado' then 'autorizado' when d.estado='descartado' then 'devuelto' else r.estado end as situacion
  from public.gob_registros r left join public.gob_registros e on e.id=nullif(r.datos->>'expediente_id','')::bigint and e.tipo='secretaria' left join public.gob_registros d on d.id=nullif(e.datos->>'doc_id','')::bigint and d.tipo='decreto' where r.tipo like 'hci_%'
 ), presupuestos as (
  select f.*,coalesce((select sum((a.datos->>'importeCents')::bigint) from fichas a where a.tipo in ('hci_nomina','hci_alcaldia','hci_orden') and coalesce(a.datos->>'sentido','gasto')='gasto' and a.datos->>'presupuesto_id'=f.id::text and a.situacion in ('autorizado','pagado')),0) as comprometido,
   coalesce((select sum((a.datos->>'importeCents')::bigint) from fichas a where a.tipo in ('hci_nomina','hci_alcaldia','hci_orden') and coalesce(a.datos->>'sentido','gasto')='gasto' and a.datos->>'presupuesto_id'=f.id::text and a.situacion='pagado'),0) as ejecutado
  from fichas f where tipo='hci_presupuesto'
 ) select jsonb_build_object(
  'localidades',coalesce((select jsonb_agg(to_jsonb(f) order by datos->>'nombre') from fichas f where tipo='hci_localidad'),'[]'::jsonb),
  'empresas',coalesce((select jsonb_agg(to_jsonb(f) order by datos->>'nombre') from fichas f where tipo='hci_padron'),'[]'::jsonb),
  'presupuestos',coalesce((select jsonb_agg(to_jsonb(f) order by id desc) from presupuestos f),'[]'::jsonb),
  'dotaciones',coalesce((select jsonb_agg(to_jsonb(f) order by id desc) from fichas f where tipo='hci_dotacion'),'[]'::jsonb),
  'nominas',coalesce((select jsonb_agg(to_jsonb(f) order by id desc) from fichas f where tipo='hci_nomina'),'[]'::jsonb),
  'alcaldias',coalesce((select jsonb_agg(to_jsonb(f) order by id desc) from fichas f where tipo='hci_alcaldia'),'[]'::jsonb),
  'ordenes',coalesce((select jsonb_agg(to_jsonb(f) order by id desc) from fichas f where tipo='hci_orden'),'[]'::jsonb),
  'tesoreria',public.gob_hacienda_tesoreria(),
  'arqueos',coalesce((select jsonb_agg(to_jsonb(q) order by creado desc) from (select * from fichas where tipo='hci_arqueo' order by creado desc limit 15)q),'[]'::jsonb),
  'resumen',jsonb_build_object('presupuestado',coalesce((select sum((datos->>'importeCents')::bigint) from presupuestos where situacion='autorizado'),0),'comprometido',coalesce((select sum(comprometido) from presupuestos where situacion='autorizado'),0),'ejecutado',coalesce((select sum(ejecutado) from presupuestos where situacion='autorizado'),0),'nominasPendientes',coalesce((select sum((datos->>'importeCents')::bigint) from fichas where tipo='hci_nomina' and situacion='autorizado'),0),'asignacionesPendientes',coalesce((select sum((datos->>'importeCents')::bigint) from fichas where tipo='hci_alcaldia' and situacion='autorizado'),0)),
  'municipios',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'nombre',l.datos->>'nombre','alcalde',l.datos->>'alcalde',
   'solicitado',coalesce((select sum((a.datos->>'solicitadoCents')::bigint) from fichas a where a.tipo='hci_alcaldia' and a.datos->>'localidad_id'=l.id::text and a.situacion<>'devuelto'),0),
   'autorizado',coalesce((select sum((a.datos->>'importeCents')::bigint) from fichas a where a.tipo='hci_alcaldia' and a.datos->>'localidad_id'=l.id::text and a.situacion in ('autorizado','pagado')),0),
   'transferido',coalesce((select sum((a.datos->>'importeCents')::bigint) from fichas a where a.tipo='hci_alcaldia' and a.datos->>'localidad_id'=l.id::text and a.situacion='pagado'),0))) from fichas l where l.tipo='hci_localidad'),'[]'::jsonb)
 );
$$;
revoke all on function public.gob_hacienda_libros() from public,anon,authenticated;
grant execute on function public.gob_hacienda_libros() to service_role;

-- Los asientos financieros son permanentes; Discord solo puede actualizar su copia y metadatos.
create or replace function public.gob_hacienda_inmutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.tipo in ('hci_orden','hci_nomina','hci_alcaldia','hci_presupuesto','hci_dotacion') and old.datos->>'expediente_id' is not null then
  if tg_op='DELETE' then raise exception 'ASIENTO_INMUTABLE';end if;
  if (new.datos-'_discord') is distinct from (old.datos-'_discord') then raise exception 'ASIENTO_INMUTABLE';end if;
 end if;
 if old.tipo in ('movimiento','hci_arqueo','hci_cierre') then
  if tg_op='DELETE' then raise exception 'ASIENTO_INMUTABLE';end if;
  if (new.datos-'_discord') is distinct from (old.datos-'_discord') or (new.tipo,new.numero,new.estado,new.autor,new.autor_id,new.creado) is distinct from (old.tipo,old.numero,old.estado,old.autor,old.autor_id,old.creado) then raise exception 'ASIENTO_INMUTABLE';end if;
 end if;return new;
end $$;
revoke all on function public.gob_hacienda_inmutable() from public,anon,authenticated;
grant execute on function public.gob_hacienda_inmutable() to service_role;
drop trigger if exists gob_hacienda_inmutable on public.gob_registros;
create trigger gob_hacienda_inmutable before update or delete on public.gob_registros for each row execute function public.gob_hacienda_inmutable();
create unique index if not exists gob_hacienda_un_pago on public.gob_registros((datos->>'expediente')) where tipo='movimiento' and datos->>'expediente' is not null;

-- Libro completo paginado, sin recortar el historial. Incluye arqueos sin disfrazarlos de ingresos.
create or replace function public.gob_hacienda_movimientos(p_antes bigint default null,p_buscar text default '',p_desde date default null,p_hasta date default null)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 with filtrados as (select * from public.gob_registros where tipo in ('movimiento','hci_arqueo') and (p_antes is null or id<p_antes) and (coalesce(p_buscar,'')='' or position(lower(p_buscar) in lower(concat_ws(' ',autor,datos->>'concepto',datos->>'origen',datos->>'destino',datos->>'localidad',datos->>'nota',datos->>'justificante',id::text)))>0) and (p_desde is null or creado>=p_desde::timestamp at time zone 'Europe/Madrid') and (p_hasta is null or creado<(p_hasta+1)::timestamp at time zone 'Europe/Madrid') order by id desc limit 101),
 pagina as(select * from filtrados order by id desc limit 100)
 select jsonb_build_object('asientos',coalesce((select jsonb_agg(to_jsonb(p) order by id desc) from pagina p),'[]'::jsonb),'mas',(select count(*)>100 from filtrados),'siguiente',(select min(id) from pagina));
$$;
revoke all on function public.gob_hacienda_movimientos(bigint,text,date,date) from public,anon,authenticated;
grant execute on function public.gob_hacienda_movimientos(bigint,text,date,date) to service_role;

-- Una versión del estado contable; la copia de Discord solo avanza, incluso ante dos peticiones concurrentes.
create or replace function public.gob_hacienda_parte()
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('tesoreria',public.gob_hacienda_tesoreria(),'ultimo',coalesce((select max(id) from public.gob_registros where tipo in ('movimiento','hci_arqueo','decreto','hci_cierre')),0),'movimientos',coalesce((select jsonb_agg(to_jsonb(m) order by id desc) from (select * from public.gob_registros where tipo in ('movimiento','hci_arqueo') order by id desc limit 8)m),'[]'::jsonb));
$$;
revoke all on function public.gob_hacienda_parte() from public,anon,authenticated;
grant execute on function public.gob_hacienda_parte() to service_role;

create or replace function public.gob_hacienda_cerrar_dias()
returns void language plpgsql set search_path=pg_catalog,public as $$
declare dia date; fin timestamptz; ultimo public.gob_registros; v bigint; ing bigint; gas bigint; ajustes bigint;
begin
 perform pg_advisory_xact_lock(hashtext('hci:cierre'));
 for dia in select d::date from generate_series((select min(creado at time zone 'Europe/Madrid')::date from public.gob_registros where tipo='hci_arqueo'),((clock_timestamp() at time zone 'Europe/Madrid')::date-1)::timestamp,interval '1 day')d loop
  if exists(select 1 from public.gob_registros where tipo='hci_cierre' and datos->>'dia'=dia::text) then continue;end if;
  fin=(dia+1)::timestamp at time zone 'Europe/Madrid';
  select * into ultimo from public.gob_registros where tipo='hci_arqueo' and creado<fin order by creado desc,id desc limit 1;
  select coalesce(sum((datos->>'cents')::bigint),0) into v from public.gob_registros where tipo='movimiento' and creado>ultimo.creado and creado<fin;
  select coalesce(sum(greatest((datos->>'cents')::bigint,0)),0),coalesce(sum(greatest(-(datos->>'cents')::bigint,0)),0) into ing,gas from public.gob_registros where tipo='movimiento' and creado>=dia::timestamp at time zone 'Europe/Madrid' and creado<fin;
  select coalesce(sum((datos->>'diferencia')::bigint),0) into ajustes from public.gob_registros where tipo='hci_arqueo' and creado>=dia::timestamp at time zone 'Europe/Madrid' and creado<fin;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('hci_cierre',public.gob_siguiente('hci_cierre'),'cerrado',jsonb_build_object('dia',dia,'ingresos',ing,'salidas',gas,'ajustes',ajustes,'fondos',case when ultimo.id is not null then (ultimo.datos->>'importeCents')::bigint+v else null end,'arqueo_id',ultimo.id),'Sr. Whitmore','sistema');
 end loop;
end $$;
revoke all on function public.gob_hacienda_cerrar_dias() from public,anon,authenticated;
grant execute on function public.gob_hacienda_cerrar_dias() to service_role;

create or replace function public.gob_hacienda_panel()
returns public.gob_registros language plpgsql set search_path=pg_catalog,public as $$
declare r public.gob_registros;
begin
 perform pg_advisory_xact_lock(hashtext('hci:panel'));
 select * into r from public.gob_registros where tipo='hci_panel' order by id limit 1;
 if not found then insert into public.gob_registros(tipo,estado,datos,autor,autor_id) values('hci_panel','abierto','{}','Sr. Whitmore','sistema') returning * into r;end if;
 return r;
end $$;
revoke all on function public.gob_hacienda_panel() from public,anon,authenticated;
grant execute on function public.gob_hacienda_panel() to service_role;
