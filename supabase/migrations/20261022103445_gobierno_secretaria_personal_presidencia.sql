create or replace function public.gob_oficina_asentar(p_accion text,p_id bigint,p_version timestamptz,p_datos jsonb,p_autor text,p_autor_id text,p_superior boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.gob_registros; hijo public.gob_registros; otro public.gob_registros; cambios jsonb:='[]'; hist jsonb; ref jsonb; asuntos jsonb:='[]'; item jsonb; destino text; resultado text; nota text; plazo text;
begin
 if p_accion in ('peticion_nueva','reunion_nueva','relevo_nuevo') then
  if nullif(trim(p_datos->>'titulo'),'') is null or nullif(trim(p_datos->>'texto'),'') is null then raise exception 'FALTAN_DATOS'; end if;
  if p_accion='peticion_nueva' then
   if nullif(trim(p_datos->>'ciudadano'),'') is null then raise exception 'FALTA_CIUDADANO'; end if;
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id,cuando) values('peticion',public.gob_siguiente('peticion'),'recibida',p_datos-'plazo_autorizado'-'resolucion'-'resultado'||jsonb_build_object('historial',jsonb_build_array(jsonb_build_object('acto','Petición recibida, sin compromiso de ejecución','por',p_autor,'ms',(extract(epoch from clock_timestamp())*1000)::bigint))),p_autor,p_autor_id,nullif(p_datos->>'revision_interna','')::timestamptz) returning * into r;
  else
   for ref in select value from jsonb_array_elements(coalesce(p_datos->'asuntos','[]')) loop
    select * into otro from public.gob_registros where id=(ref->>'id')::bigint and tipo in ('peticion','secretaria','decreto','audiencia','telegrama','tarea');
    if not found then raise exception 'ASUNTO_NO_EXISTE'; end if;
    asuntos=asuntos||jsonb_build_array(jsonb_build_object('id',otro.id,'tipo',otro.tipo,'titulo',coalesce(otro.datos->>'titulo',otro.datos->>'texto',otro.datos->>'quien','Asunto del Consejo')));
   end loop;
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id,cuando) values(case p_accion when 'reunion_nueva' then 'reunion' else 'relevo' end,public.gob_siguiente(case p_accion when 'reunion_nueva' then 'reunion' else 'relevo' end),case p_accion when 'reunion_nueva' then 'abierta' else 'asentado' end,p_datos||jsonb_build_object('asuntos',asuntos,'orden',replace(coalesce(p_datos->>'texto',''),E'\n',';')||coalesce((select '; '||string_agg(x->>'titulo','; ') from jsonb_array_elements(asuntos) x),'')),p_autor,p_autor_id,nullif(p_datos->>'cuando','')::timestamptz) returning * into r;
  end if;
  return jsonb_build_object('registro',to_jsonb(r),'publicar',jsonb_build_array(to_jsonb(r)));
 end if;
 select * into r from public.gob_registros where id=p_id for update;
 if not found or r.tipo not in ('peticion','reunion') then raise exception 'NO_EXISTE'; end if;
 if p_version is null or r.actualizado<>p_version then raise exception 'VERSION_CAMBIADA'; end if;
 nota=coalesce(p_datos->>'nota','');
 hist=coalesce(r.datos->'historial','[]');
 if p_accion='acta' then
  if r.tipo<>'reunion' or r.estado in ('cerrada','cancelada') then raise exception 'REUNION_CERRADA'; end if;
  if nullif(trim(p_datos->>'acuerdos'),'') is null then raise exception 'FALTAN_ACUERDOS'; end if;
  insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('acta',public.gob_siguiente('acta'),'cerrada',jsonb_build_object('titulo',r.datos->>'titulo','fecha',(extract(epoch from r.cuando)*1000)::bigint,'asistentes',p_datos->>'asistentes','acuerdos',p_datos->>'acuerdos','notas',p_datos->>'notas','reunion_id',r.id,'asuntos',coalesce(r.datos->'asuntos','[]')),p_autor,p_autor_id) returning * into hijo;
  cambios=cambios||jsonb_build_array(to_jsonb(hijo));
  for item in select value from jsonb_array_elements(coalesce(p_datos->'tareas','[]')) loop
   if nullif(trim(item->>'texto'),'') is null then continue; end if;
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id,cuando) values('tarea',public.gob_siguiente('tarea'),'abierto',jsonb_build_object('texto',item->>'texto','para',p_datos->>'para','paraNombre',p_datos->>'paraNombre','reunion_id',r.id,'acta_id',hijo.id,'asuntos',coalesce(r.datos->'asuntos','[]')),p_autor,p_autor_id,nullif(p_datos->>'plazo_interno','')::timestamptz) returning * into otro;
   cambios=cambios||jsonb_build_array(to_jsonb(otro));
  end loop;
  update public.gob_registros set estado='cerrada',actualizado=clock_timestamp(),datos=datos||jsonb_build_object('acta',hijo.numero,'acta_id',hijo.id) where id=r.id returning * into r;
 elsif r.tipo='peticion' then
  if p_accion='consulta_preparar' then
   if r.estado not in ('recibida','aclaraciones') then raise exception 'ESTADO_NO_PERMITE_CONSULTA'; end if;
   if nullif(trim(p_datos->>'escrito'),'') is null then raise exception 'FALTA_ESCRITO'; end if;
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('oficio_presidencia',public.gob_siguiente('oficio_presidencia'),'borrador',jsonb_build_object('peticion_id',r.id,'titulo','Consulta a la Presidencia · '||(r.datos->>'titulo'),'texto',p_datos->>'escrito'),p_autor,p_autor_id) returning * into hijo;
   cambios=cambios||jsonb_build_array(to_jsonb(hijo));
   r.datos=r.datos||jsonb_build_object('consulta_id',hijo.id);
  elsif p_accion='consulta_enviada' then
   if r.estado not in ('recibida','aclaraciones') or r.datos->>'consulta_id' is null then raise exception 'PREPARE_LA_CONSULTA'; end if;
   if nullif(trim(p_datos->>'referencia'),'') is null then raise exception 'FALTA_REFERENCIA_ENVIO'; end if;
   update public.gob_registros set estado='enviada',actualizado=clock_timestamp(),datos=datos||jsonb_build_object('referencia_envio',p_datos->>'referencia','enviadaPor',p_autor) where id=(r.datos->>'consulta_id')::bigint and tipo='oficio_presidencia' returning * into hijo;
   cambios=cambios||jsonb_build_array(to_jsonb(hijo));r.estado='en_valoracion';r.datos=r.datos||jsonb_build_object('referencia_envio',p_datos->>'referencia');
  elsif p_accion='resolucion' then
   if p_superior is not true then raise exception 'SOLO_SUPERIOR_REGISTRA_RESPUESTA'; end if;
   if r.estado<>'en_valoracion' then raise exception 'CONSULTA_NO_ENVIADA'; end if;
   resultado=p_datos->>'resultado';
   if resultado is null or resultado not in ('autorizada','condicionada','denegada','aclaraciones') then raise exception 'RESULTADO_NO_VALIDO'; end if;
   if nullif(trim(p_datos->>'resolucion'),'') is null or nullif(trim(p_datos->>'referencia'),'') is null then raise exception 'FALTA_RESPUESTA_REAL_Y_REFERENCIA'; end if;
   if resultado='condicionada' and nullif(trim(p_datos->>'condiciones'),'') is null then raise exception 'FALTAN_CONDICIONES'; end if;
   plazo=coalesce(p_datos->>'plazo_autorizado','');
   if resultado is null or resultado not in ('autorizada','condicionada') and plazo<>'' then raise exception 'NO_PUEDE_ANUNCIAR_PLAZOS'; end if;
   r.estado=resultado;r.datos=r.datos||jsonb_build_object('resolucion',p_datos->>'resolucion','referencia_respuesta',p_datos->>'referencia','condiciones',coalesce(p_datos->>'condiciones',''),'plazo_autorizado',plazo,'registradaPor',p_autor,'respuestaMs',(extract(epoch from clock_timestamp())*1000)::bigint);
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('oficio_presidencia',public.gob_siguiente('oficio_presidencia'),'respuesta_registrada',jsonb_build_object('peticion_id',r.id,'titulo','Respuesta de la Presidencia · '||(r.datos->>'titulo'),'texto',p_datos->>'resolucion','referencia',p_datos->>'referencia','resultado',resultado),p_autor,p_autor_id) returning * into hijo;cambios=cambios||jsonb_build_array(to_jsonb(hijo));
  elsif p_accion='iniciar' then
   if r.estado not in ('autorizada','condicionada') then raise exception 'FALTA_AUTORIZACION_PRESIDENCIA'; end if;
   if nota='' then raise exception 'FALTA_NOTA'; end if;
   r.estado='en_curso';
  elsif p_accion='cumplir' then
   if r.estado<>'en_curso' then raise exception 'COMPROMISO_NO_INICIADO'; end if;
   if nota='' then raise exception 'FALTA_CONSTANCIA'; end if;r.estado='cumplida';
  elsif p_accion='audiencia' then
   insert into public.gob_registros(tipo,numero,estado,datos,autor,autor_id) values('audiencia',public.gob_siguiente('audiencia'),'pendiente',jsonb_build_object('quien',r.datos->>'ciudadano','motivo',r.datos->>'titulo','telegrama',r.datos->>'telegrama','peticion_id',r.id),p_autor,p_autor_id) returning * into hijo;cambios=cambios||jsonb_build_array(to_jsonb(hijo));
  elsif p_accion='vincular' then
   select * into otro from public.gob_registros where id=(p_datos->>'vinculo_id')::bigint and tipo in ('secretaria','telegrama','decreto','audiencia','cita');
   if not found then raise exception 'VINCULO_NO_EXISTE'; end if;
   ref=jsonb_build_object('id',otro.id,'tipo',otro.tipo,'titulo',coalesce(otro.datos->>'titulo',otro.datos->>'texto','Asunto vinculado'));
   if not coalesce(r.datos->'vinculos','[]')@>jsonb_build_array(ref) then r.datos=r.datos||jsonb_build_object('vinculos',coalesce(r.datos->'vinculos','[]')||jsonb_build_array(ref)); end if;
  elsif p_accion='nota' then
   if nota='' then raise exception 'FALTA_NOTA'; end if;
  else raise exception 'ACCION_NO_VALIDA'; end if;
  hist=hist||jsonb_build_array(jsonb_build_object('acto',p_accion,'por',p_autor,'nota',nota,'ms',(extract(epoch from clock_timestamp())*1000)::bigint));
  update public.gob_registros set estado=r.estado,datos=r.datos||jsonb_build_object('historial',hist),actualizado=clock_timestamp(),avisado=false where id=r.id returning * into r;
 else raise exception 'ACCION_NO_VALIDA'; end if;
 return jsonb_build_object('registro',to_jsonb(r),'publicar',cambios||jsonb_build_array(to_jsonb(r)));
end $$;
revoke all on function public.gob_oficina_asentar(text,bigint,timestamptz,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.gob_oficina_asentar(text,bigint,timestamptz,jsonb,text,text,boolean) to service_role;
