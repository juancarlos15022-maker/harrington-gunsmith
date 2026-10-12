-- =====================================================================
--  HARRINGTON GUNSMITH · PARCHE FINAL V1 · reglas en la base de datos
--  Cómo usarlo: en Supabase abre «SQL Editor» → «New query», pega TODO
--  este archivo y pulsa «Run». Se puede ejecutar más de una vez.
--  No borra ni cambia ningún dato que ya tengas.
--
--  Qué añade:
--   1) Registros de solo adición: la auditoría (act:), los recuentos (recu:),
--      las revisiones del NPC (npcrev:) y las fabricaciones de empleados
--      (fablote:) no se pueden cambiar ni borrar una vez guardados.
--   2) vender_stock: al vender, comprueba en la base de datos que no se
--      venden a otro cliente las armas reservadas con anticipo.
--   3) fabricar_empleado: al fabricar un empleado, comprueba en la base de
--      datos que no tiene unidades fabricadas sin vender, y apunta su lote.
--  Mientras no lo pegues, la web hace esas mismas comprobaciones ella sola.
-- =====================================================================

-- 1) Registros de solo adición -----------------------------------------
create or replace function public.hg_solo_adicion()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    return null;                       -- no se borra
  end if;
  return old;                          -- no se cambia: se queda como estaba
end $$;

drop trigger if exists hg_solo_adicion on public.datos;
create trigger hg_solo_adicion
  before update or delete on public.datos
  for each row
  when (old.clave like 'act:%' or old.clave like 'recu:%' or old.clave like 'npcrev:%' or old.clave like 'fablote:%')
  execute function public.hg_solo_adicion();

-- Fecha de un registro en milisegundos (si no se puede leer, 0)
create or replace function public.hg_ms(t text)
returns bigint
language plpgsql
immutable
as $$
begin
  if t is null or t = '' then return 0; end if;
  if t ~ '^[0-9]+$' then return t::bigint; end if;
  return (extract(epoch from t::timestamptz) * 1000)::bigint;
exception when others then
  return 0;
end $$;

-- 2) Venta con reservas -------------------------------------------------
--  Unidades reservadas de un producto: encargos FABRICADOS, sin entregar,
--  con anticipo, salvo el encargo que se está entregando ahora (p_excluir).
create or replace function public.hg_reservadas(p_producto text, p_excluir text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum((it->>'qty')::integer), 0)::integer
  from datos d, jsonb_array_elements(coalesce(d.valor->'items', '[]'::jsonb)) it
  where d.clave like 'encargo:%'
    and d.clave <> 'encargo:' || coalesce(p_excluir, '')
    and coalesce((d.valor->>'deleted')::boolean, false) = false
    and coalesce((d.valor->>'finished')::boolean, false) = false
    and coalesce((d.valor->>'cancelled')::boolean, false) = false
    and d.valor->>'fab' = 'FABRICADO'
    and coalesce((d.valor->>'depositCents')::numeric, 0) > 0
    and it->>'name' = p_producto
$$;

--  Recibe: p_items [{"producto":"Nombre","delta":-1}, ...]
--          p_ctx   {"encargo":"ID del encargo que se entrega o vacío","cliente":"Nombre"}
--  Si se quiere vender a otro cliente algo reservado: error RESERVADA (no cambia nada).
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

-- 3) Fabricación de empleados con bloqueo -------------------------------
--  Unidades que le quedan por vender a un empleado de sus fabricaciones.
--  Las ventas de cada producto se cuentan primero para la fabricación más
--  antigua de ese producto (igual que en la web).
create or replace function public.hg_pendientes_empleado(p_emp text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prod   text;
  lot    record;
  s      record;
  ids    text[];
  emps   text[];
  ts     bigint[];
  q      integer[];
  vend   integer[];
  i      integer;
  n      integer;
  rest   integer;
  f      integer;
  total  integer := 0;
begin
  for prod in
    select distinct valor->>'prod' from datos
    where clave like 'fablote:%' and valor->>'empId' = p_emp and valor->>'prod' is not null
  loop
    ids := '{}'; emps := '{}'; ts := '{}'; q := '{}'; vend := '{}';
    for lot in
      select l.clave, l.valor->>'empId' as emp, hg_ms(l.valor->>'ts') as t, coalesce((l.valor->>'q')::integer, 0) as cant
      from datos l
      where l.clave like 'fablote:%' and l.valor->>'prod' = prod
        -- las fabricaciones deshechas se anulan con otro registro («anula»)
        and not exists (select 1 from datos a where a.clave like 'fablote:%' and a.valor->>'anula' = substr(l.clave, 9))
      order by hg_ms(l.valor->>'ts'), l.clave
    loop
      ids := ids || lot.clave; emps := emps || lot.emp; ts := ts || lot.t; q := q || lot.cant; vend := vend || 0;
    end loop;
    n := coalesce(array_length(ids, 1), 0);
    for s in
      select hg_ms(d.valor->>'ts') as t, coalesce((it->>'qty')::integer, 0) as cant
      from datos d, jsonb_array_elements(coalesce(d.valor->'items', '[]'::jsonb)) it
      where d.clave like 'venta:%'
        and coalesce((d.valor->>'voided')::boolean, false) = false
        and coalesce((d.valor->>'deleted')::boolean, false) = false
        and coalesce(d.valor->>'op', '') <> 'encargo'
        and it->>'name' = prod
      order by 1
    loop
      rest := s.cant;
      i := 1;
      while rest > 0 and i <= n loop
        exit when ts[i] > s.t;
        f := least(rest, q[i] - vend[i]);
        if f > 0 then vend[i] := vend[i] + f; rest := rest - f; end if;
        i := i + 1;
      end loop;
    end loop;
    for i in 1..n loop
      if emps[i] = p_emp then total := total + greatest(0, q[i] - vend[i]); end if;
    end loop;
  end loop;
  return total;
end $$;

--  Recibe: p_emp (id del empleado), p_items (como mover_stock) y p_lote
--  {"id","ts","empId","emp","prod","q","seq"}. Si tiene unidades sin vender:
--  error FAB_BLOQUEADA (no cambia nada).
create or replace function public.fabricar_empleado(p_emp text, p_items jsonb, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  res jsonb;
begin
  if coalesce(p_emp, '') = '' or p_lote->>'id' is null or p_lote->>'empId' is distinct from p_emp then
    raise exception 'FAB_DATOS';
  end if;
  -- una fabricación de cada empleado a la vez
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

-- 4) Permisos -------------------------------------------------------------
grant execute on function public.vender_stock(jsonb, jsonb)              to anon, authenticated;
grant execute on function public.fabricar_empleado(text, jsonb, jsonb)   to anon, authenticated;
grant execute on function public.hg_reservadas(text, text)               to anon, authenticated;
grant execute on function public.hg_pendientes_empleado(text)            to anon, authenticated;

-- Listo. En «Database → Functions» deben aparecer vender_stock y fabricar_empleado.
