-- HARRINGTON GUNSMITH · 19/10/2026 · Director de la web y jefes.
-- Petición del dueño: «Quiero que cualquier jefe pueda hacer la mayoría de cosas que hago yo. Menos resetear contraseñas
-- y poner los webhook de Discord, ver parches… Quiero que yo sea el director de la web y que todos los jefes puedan hacer
-- las funciones de jefe».
--   · hg_es_director(): el propietario técnico (lo que antes era hg_es_jefe): servidor o la cuenta de hg_security_config.
--   · hg_es_jefe(): el director o cualquier empleado activo con puesto «Jefe». Todas las reglas que ya usaban
--     hg_es_jefe (stock, ventas, encargos, recetas, precios, inventario, NPC, entregas, copias…) pasan a valer para los jefes.
--   · Solo el director: claves técnicas (discord, jefe, acceso, reset, clave-*, security:*), ver y restaurar copias,
--     su propia ficha, nombrar o quitar jefes, cambiar el Discord vinculado de alguien y expulsar a un jefe.
--   · Los jefes no pueden borrar historial (ventas, movimientos, registro, turnos, gastos…) ni modificar el registro.
-- Reversión: volver a definir hg_es_jefe() como «select public.hg_servidor() or public.hg_empleado_ok(true)» y restaurar
-- las funciones desde hg_security.snapshots / security-before.json. No borra ni cambia ningún dato.

create or replace function public.hg_es_director()
 returns boolean language sql stable security definer set search_path to 'pg_catalog','public'
as $$ select public.hg_servidor() or public.hg_empleado_ok(true) $$;

create or replace function public.hg_es_jefe()
 returns boolean language sql stable security definer set search_path to 'pg_catalog','public'
as $$
 select public.hg_es_director() or (public.hg_empleado_ok(false) and exists(
  select 1 from public.datos d cross join lateral jsonb_array_elements(d.valor) e
  where d.clave='empleados' and e->>'id'=public.hg_claims()->'app_metadata'->>'emp_id' and e->>'puesto'='Jefe'))
$$;
revoke all on function public.hg_es_director() from public;
grant execute on function public.hg_es_director() to anon, authenticated;

create or replace function public.hg_dato_escritura(k text, v jsonb)
 returns boolean language sql stable set search_path to 'pg_catalog','public'
as $$
select public.hg_es_director()
or (public.hg_es_jefe() and not (k in ('discord','jefe','acceso','reset') or k like 'clave-%' or k like 'security:%'))
or (public.hg_contexto() and (k='npc:estado' or k='rev' or k like 'sorteo-%' or split_part(k,':',1) in ('venta','encargo','gasto','autoventa','fablote','act','mov','invc','npcop','npcrev')))
or (public.hg_contexto() and current_setting('hg.operacion',true)='pedido' and (k like 'pedido:%' or k like 'recibido-%'))
or (public.hg_permitido() and (not coalesce((v->>'deleted')::boolean,false) or k like 'fichaje:%') and (k in ('rev','clientes','agenda') or split_part(k,':',1) in ('turno','fichaje','ausencia','log','act','dcerr','nota') or k like 'presencia-%' or k like 'fab-%')) $$;

-- Lectura: el director lo ve todo; los jefes, todo salvo lo técnico; el resto, como hasta ahora.
create or replace function hg_sync_private.contexto_lectura()
 returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','auth'
as $$
declare permitido boolean:=false;jefe boolean:=false;director boolean:=false;emp text;nombre text;puesto text;begin
 if public.hg_servidor() then return '{"jefe":true,"director":true,"permitido":true}'::jsonb;end if;
 if auth.uid() is not null then
  permitido:=public.hg_empleado_ok(false);
  if permitido then
   director:=public.hg_empleado_ok(true);emp:=public.hg_claims()->'app_metadata'->>'emp_id';
   select e->>'name',e->>'puesto' into nombre,puesto from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp limit 1;
   jefe:=director or puesto='Jefe';
  end if;
 end if;
 return jsonb_build_object('permitido',permitido,'jefe',jefe,'director',director,'emp',emp,'nombre',nombre);
end $$;

create or replace function hg_sync_private.visible(k text, v jsonb, c jsonb)
 returns boolean language sql immutable set search_path to 'pg_catalog'
as $$
select case
 when coalesce((c->>'director')::boolean,false) then true
 when coalesce((c->>'jefe')::boolean,false) then not (k in ('discord','jefe') or k like 'clave-%' or k like 'security:%')
 when k='acceso' or k like 'foto-%' then true
 when not coalesce((c->>'permitido')::boolean,false) then false
 when k in ('empleados','jefe','discord') or k like 'clave-%' or k like 'security:%' or k like 'gasto:%' or k like 'cierre:%' or k like 'log:%' or k like 'invc:%' or k like 'entrega:%' then false
 when k like 'turno:%' or k like 'ausencia:%' or k like 'act:%' then
  v->>'empId'=c->>'emp' or (k like 'turno:%' and v->>'name'=c->>'nombre')
 else true end $$;

-- Cambios puntuales en funciones existentes (sin reescribirlas): se comprueba que el texto esperado existe.
do $mig$
declare d text; n text;
begin
 -- hg_dato_lectura: los jefes leen todo salvo lo técnico
 d:=pg_get_functiondef('public.hg_dato_lectura(text)'::regprocedure);
 n:=replace(d,'if public.hg_es_jefe() then return true;end if;','if public.hg_es_director() then return true;end if;'||chr(10)||'if public.hg_es_jefe() then return not (k in (''discord'',''jefe'') or k like ''clave-%'' or k like ''security:%'');end if;');
 if n=d then raise exception 'hg_dato_lectura: texto no encontrado'; end if; execute n;
 -- hg_puerta: las direcciones de los webhooks solo las ve el director
 d:=pg_get_functiondef('public.hg_puerta()'::regprocedure);
 n:=replace(d,'if not es_owner and dc is not null then','if not public.hg_es_director() and dc is not null then');
 if n=d then raise exception 'hg_puerta: texto no encontrado'; end if; execute n;
 -- copias: ver y restaurar, solo el director (hacer y listar, cualquier jefe)
 d:=pg_get_functiondef('public.restaurar_copia(text)'::regprocedure);
 n:=replace(d,'if not hg_es_jefe() then raise exception','if not hg_es_director() then raise exception');
 if n=d then raise exception 'restaurar_copia: texto no encontrado'; end if; execute n;
 d:=pg_get_functiondef('public.ver_copia(text)'::regprocedure);
 n:=replace(d,'and hg_es_jefe()','and hg_es_director()');
 if n=d then raise exception 'ver_copia: texto no encontrado'; end if; execute n;
 -- hg_guardar_seguro: protecciones de lo técnico, del historial y de la plantilla para los jefes que no son el director
 d:=pg_get_functiondef('public.hg_guardar_seguro()'::regprocedure);
 n:=replace(d,'-- Trazabilidad protegida fuera del API',
'-- Jefes que no son el director (19/10/2026): nada técnico, nada de borrar historial, ni tocar la ficha del director, ni nombrar o quitar jefes.
if own and tg_table_name=''datos'' and not public.hg_es_director() then
 declare oe text:=(select owner_emp from public.hg_security_config where id=1); x jsonb; y jsonb; begin
  if k in (''discord'',''jefe'',''acceso'',''reset'') or k like ''clave-%'' or k like ''security:%'' then raise exception ''SOLO_DIRECTOR'' using errcode=''42501'';end if;
  if tg_op=''DELETE'' and (split_part(k,'':'',1) in (''log'',''act'',''mov'',''venta'',''gasto'',''turno'',''encargo'',''pedido'',''fablote'',''cierre'',''autoventa'',''invc'',''npcop'',''npcrev'',''entrega'',''compra'') or k like ''sueldo-%'' or k in (''empleados'',''clientes'',''agenda'',''recetas'',''proveedores'',''precios'',''productos'',''descuentos'')) then raise exception ''HISTORIAL_PROTEGIDO'' using errcode=''42501'';end if;
  if tg_op=''UPDATE'' and k like ''log:%'' then if (old.valor-''ts'')=(new.valor-''ts'') then return old;end if;raise exception ''HISTORIAL_PROTEGIDO'' using errcode=''42501'';end if;
  if k like ''expulsion:%'' and tg_op<>''DELETE'' and (substr(k,11)=oe or exists(select 1 from public.datos dd,jsonb_array_elements(dd.valor) z where dd.clave=''empleados'' and z->>''id''=substr(k,11) and z->>''puesto''=''Jefe'')) then raise exception ''SOLO_DIRECTOR'' using errcode=''42501'';end if;
  if k=''empleados'' and tg_op=''UPDATE'' then
   select z-''pw''-''hash''-''password'' into x from jsonb_array_elements(old.valor) z where z->>''id''=oe limit 1;
   select z-''pw''-''hash''-''password'' into y from jsonb_array_elements(new.valor) z where z->>''id''=oe limit 1;
   if x is distinct from y then raise exception ''FICHA_DEL_DIRECTOR'' using errcode=''42501'';end if;
   for x in select * from jsonb_array_elements(old.valor) loop
    y:=null;select z into y from jsonb_array_elements(new.valor) z where z->>''id''=x->>''id'' limit 1;
    if x->>''puesto''=''Jefe'' and (y is null or y->>''puesto'' is distinct from ''Jefe'') then raise exception ''SOLO_DIRECTOR_JEFES'' using errcode=''42501'';end if;
    if y is not null and coalesce(x->>''discord'','''')<>'''' and y->>''discord'' is distinct from x->>''discord'' then raise exception ''SOLO_DIRECTOR_DISCORD'' using errcode=''42501'';end if;
   end loop;
   for y in select * from jsonb_array_elements(new.valor) loop
    if y->>''puesto''=''Jefe'' and not exists(select 1 from jsonb_array_elements(old.valor) z where z->>''id''=y->>''id'' and z->>''puesto''=''Jefe'') then raise exception ''SOLO_DIRECTOR_JEFES'' using errcode=''42501'';end if;
   end loop;
  end if;
 end;
end if;
-- Trazabilidad protegida fuera del API');
 if n=d then raise exception 'hg_guardar_seguro: texto no encontrado'; end if; execute n;
end $mig$;
