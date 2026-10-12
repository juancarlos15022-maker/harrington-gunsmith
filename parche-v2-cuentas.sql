-- =====================================================================
--  HARRINGTON GUNSMITH · V2 · Base de datos cerrada con cuentas seguras
--  Mientras la fila 'acceso' diga {"cerrado": false} todo funciona exactamente igual que antes.
--  Con {"cerrado": true} solo quien ha entrado con su tarjeta (cuenta segura de un empleado que
--  sigue en la plantilla) puede leer y escribir. Sin cuenta solo se ve lo justo para la puerta:
--  la lista de empleados, sus fotos y la propia fila 'acceso'.
--  Cerrar:  update datos set valor='{"cerrado":true}',  actualizado=now() where clave='acceso';
--  Abrir:   update datos set valor='{"cerrado":false}', actualizado=now() where clave='acceso';
--  No borra nada. Se puede ejecutar más de una vez.
-- =====================================================================

-- ¿Quién llama? (las tareas internas, como la copia de las 5:00, no traen sesión y siempre pueden)
create or replace function public.hg_claims()
returns jsonb
language sql
stable
as $$
  select case when coalesce(current_setting('request.jwt.claims', true), '') = '' then null
              else current_setting('request.jwt.claims', true)::jsonb end
$$;

create or replace function public.hg_cerrado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (valor->>'cerrado')::boolean from datos where clave = 'acceso'), false)
$$;

-- Empleado con cuenta segura que sigue en la plantilla
create or replace function public.hg_empleado_ok(p_jefe boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from datos d, jsonb_array_elements(case when jsonb_typeof(d.valor) = 'array' then d.valor else '[]'::jsonb end) e
    where d.clave = 'empleados'
      and e->>'id' = (hg_claims()->'app_metadata'->>'emp_id')
      and (not p_jefe or e->>'puesto' = 'Jefe')
  )
$$;

create or replace function public.hg_permitido()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select hg_claims() is null or not hg_cerrado() or hg_empleado_ok(false)
$$;

create or replace function public.hg_es_jefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select hg_claims() is null or not hg_cerrado() or hg_empleado_ok(true)
$$;

grant execute on function public.hg_claims(), public.hg_cerrado(), public.hg_empleado_ok(boolean), public.hg_permitido(), public.hg_es_jefe() to anon, authenticated;

-- La fila que abre o cierra (empieza abierta: no cambia nada hasta que se cierre)
insert into public.datos (clave, valor, actualizado) values ('acceso', '{"cerrado": false}'::jsonb, now())
  on conflict (clave) do nothing;

-- 'acceso' no entra en las copias ni se toca al restaurar una
create or replace function public.hg_fuera_de_copia(c text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select c like 'presencia-%' or c in ('rev', 'reset', 'jefe', 'acceso') or c like 'clave-%'
$$;

-- ---------- Reglas de las tablas ----------
alter policy acceso_total on public.datos
  using ((select public.hg_permitido()))
  with check ((select public.hg_permitido()) and (clave not in ('acceso', 'jefe') or (select public.hg_es_jefe())));
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'datos' and policyname = 'puerta_lectura') then
    create policy puerta_lectura on public.datos for select to anon, authenticated
      using (clave in ('empleados', 'acceso') or clave like 'foto-%');
  end if;
end $$;
alter policy acceso_total on public.stock    using ((select public.hg_permitido())) with check ((select public.hg_permitido()));
alter policy acceso_total on public.contador using ((select public.hg_permitido())) with check ((select public.hg_permitido()));
do $$ declare t text; begin
  foreach t in array array['ventas', 'encargos', 'fichajes_activos', 'registros'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'acceso_total') then
      execute format('alter policy acceso_total on public.%I using ((select public.hg_permitido())) with check ((select public.hg_permitido()))', t);
    end if;
  end loop;
end $$;

-- ---------- Funciones que se saltan las reglas: comprueban la cuenta ellas mismas ----------
create or replace function public.vender_stock(p_items jsonb, p_ctx jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it  jsonb;
  p   text;
  d   integer;
  v   integer;
  r   integer;
  exc text := coalesce(p_ctx->>'encargo', '');
begin
  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    p := it->>'producto';
    d := coalesce((it->>'delta')::integer, 0);
    if d < 0 then
      select cantidad into v from stock where producto = p for update;
      r := hg_reservadas(p, exc);
      if r > 0 and coalesce(v, 0) + d >= 0 and coalesce(v, 0) + d < r then
        raise exception 'RESERVADA: % (% reservadas)', p, r;
      end if;
    end if;
  end loop;
  return mover_stock(p_items);
end $$;

create or replace function public.fabricar_empleado(p_emp text, p_items jsonb, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  if coalesce(p_emp, '') = '' or p_lote->>'id' is null or p_lote->>'empId' is distinct from p_emp then
    raise exception 'FAB_DATOS';
  end if;
  perform pg_advisory_xact_lock(hashtext('hg-fab-' || p_emp));
  if hg_pendientes_empleado(p_emp) > 0 then
    raise exception 'FAB_BLOQUEADA';
  end if;
  res := mover_stock(p_items);
  insert into datos (clave, valor, actualizado) values ('fablote:' || (p_lote->>'id'), p_lote, now());
  insert into datos (clave, valor, actualizado)
    values ('rev', jsonb_build_object('n', (extract(epoch from now()) * 1000)::bigint::text || '-fab'), now())
    on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado;
  return res;
end $$;

-- Copias: hacerlas y verlas, cualquier empleado con cuenta; restaurar, solo un jefe
create or replace function public.listar_copias()
returns table (id text, tipo text, creada timestamptz, filas integer, bytes integer)
language sql
stable
security definer
set search_path = public
as $$
  select id, tipo, creada, filas, bytes from copias where hg_permitido() order by creada desc
$$;

create or replace function public.ver_copia(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', id, 'tipo', tipo, 'creada', creada, 'datos', datos, 'stock', stock, 'contador', contador)
  from copias where id = p_id and hg_permitido()
$$;

do $$
declare
  src text;
begin
  -- hacer_copia y restaurar_copia: se les añade la comprobación al principio, sin tocar el resto
  select pg_get_functiondef('public.hacer_copia(text)'::regprocedure) into src;
  if position('SIN_CUENTA' in src) = 0 then
    src := regexp_replace(src, E'\nbegin\n', E'\nbegin\n  if not hg_permitido() then raise exception ''SIN_CUENTA''; end if;\n');
    execute src;
  end if;
  select pg_get_functiondef('public.restaurar_copia(text)'::regprocedure) into src;
  if position('SIN_CUENTA' in src) = 0 then
    src := regexp_replace(src, E'\nbegin\n', E'\nbegin\n  if not hg_es_jefe() then raise exception ''SIN_CUENTA''; end if;\n');
    execute src;
  end if;
end $$;

-- Stock y número de venta: también comprueban la cuenta (por si se llaman directamente)
create or replace function public.mover_stock(p_items jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare it jsonb;
begin
  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    update public.stock set cantidad = cantidad + (it->>'delta')::int where producto = it->>'producto';
    if not found then
      if (it->>'delta')::int < 0 then raise exception 'STOCK_INSUFICIENTE'; end if;
      insert into public.stock(producto, cantidad) values (it->>'producto', (it->>'delta')::int);
    end if;
  end loop;
  return (select coalesce(jsonb_object_agg(producto, cantidad), '{}'::jsonb) from public.stock);
exception when check_violation then
  raise exception 'STOCK_INSUFICIENTE';
end $$;

create or replace function public.siguiente_numero()
returns bigint
language plpgsql
set search_path = public
as $$
declare n bigint;
begin
  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  update public.contador set valor = valor + 1 where id = 1 returning valor into n;
  return n;
end $$;
