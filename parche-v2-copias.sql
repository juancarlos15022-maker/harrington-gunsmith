-- =====================================================================
--  HARRINGTON GUNSMITH · V2 · Copias de seguridad diarias en la base de datos
--  Se guardan siempre las 7 últimas: 7 huecos, uno por día de la semana; la copia de hoy
--  sustituye a la de hace 7 días. Más una copia «antes de restaurar» por si acaso. Nada se guarda en los teléfonos.
--  Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.copias (
  id        text primary key,
  tipo      text not null,                 -- 'diaria' | 'antes-restaurar'
  creada    timestamptz not null default now(),
  datos     jsonb not null,                -- { clave: { "v": valor, "a": actualizado } }
  stock     jsonb not null,                -- { producto: { cantidad, ... } }
  contador  integer,
  filas     integer,
  bytes     integer
);
create index if not exists copias_tipo_creada_idx on public.copias (tipo, creada desc);
-- Nadie la lee ni la escribe directamente: solo con las funciones de abajo
alter table public.copias enable row level security;

-- Qué no entra en una copia ni se toca al restaurar: presencia de dispositivos, avisos internos
-- y las contraseñas (al restaurar se conservan las actuales)
create or replace function public.hg_fuera_de_copia(c text)
returns boolean
language sql
immutable
as $$
  select c like 'presencia-%' or c in ('rev', 'reset', 'jefe') or c like 'clave-%'
$$;

-- Hace la copia. 'diaria': una por día (si ya existe la de hoy, no hace nada).
create or replace function public.hacer_copia(p_tipo text default 'diaria')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  text;
  v_dat jsonb;
  v_stk jsonb;
  v_cnt integer;
  v_n   integer;
  v_dia date;
begin
  if p_tipo not in ('diaria', 'antes-restaurar') then raise exception 'COPIA_TIPO'; end if;
  -- 7 huecos fijos (uno por día de la semana): la copia de hoy sustituye a la de hace 7 días
  v_dia := (now() at time zone 'Europe/Madrid')::date;
  v_id := case when p_tipo = 'diaria' then 'diaria-' || extract(isodow from v_dia)::int else 'antes-restaurar' end;
  if p_tipo = 'diaria' and exists (select 1 from copias where id = v_id and (creada at time zone 'Europe/Madrid')::date = v_dia) then
    return jsonb_build_object('id', v_id, 'hecha', false);
  end if;
  select coalesce(jsonb_object_agg(clave, jsonb_build_object('v', valor, 'a', actualizado)), '{}'::jsonb), count(*)
    into v_dat, v_n from datos where not hg_fuera_de_copia(clave);
  select coalesce(jsonb_object_agg(producto, to_jsonb(s) - 'producto'), '{}'::jsonb) into v_stk from stock s;
  select valor into v_cnt from contador where id = 1;
  insert into copias (id, tipo, creada, datos, stock, contador, filas, bytes)
    values (v_id, p_tipo, now(), v_dat, v_stk, v_cnt, v_n, pg_column_size(v_dat) + pg_column_size(v_stk))
    on conflict (id) do update set creada = excluded.creada, datos = excluded.datos, stock = excluded.stock,
      contador = excluded.contador, filas = excluded.filas, bytes = excluded.bytes;
  return jsonb_build_object('id', v_id, 'hecha', true, 'filas', v_n);
end $$;

-- Lista de copias (sin el contenido)
create or replace function public.listar_copias()
returns table (id text, tipo text, creada timestamptz, filas integer, bytes integer)
language sql
stable
security definer
set search_path = public
as $$
  select id, tipo, creada, filas, bytes from copias order by creada desc
$$;

-- Contenido de una copia (para descargarla)
create or replace function public.ver_copia(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', id, 'tipo', tipo, 'creada', creada, 'datos', datos, 'stock', stock, 'contador', contador)
  from copias where id = p_id
$$;

-- Restaura una copia: los datos y el stock vuelven a como estaban ese día.
--  · Antes se guarda una copia «antes de restaurar».
--  · Las contraseñas, la presencia y los registros de solo adición (auditoría…) no se tocan.
--  · El contador de ventas nunca retrocede (no se repiten números de venta).
--  · Se avisa a todos los dispositivos para que vuelvan a descargar los datos.
create or replace function public.restaurar_copia(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c     copias%rowtype;
  stamp timestamptz := now();
begin
  select * into c from copias where id = p_id;
  if not found then raise exception 'COPIA_NO_EXISTE'; end if;
  perform hacer_copia('antes-restaurar');
  -- lo que no estaba en la copia se marca como eliminado (igual que cuando se borra algo en la web; se puede recuperar)
  update datos d set valor = jsonb_build_object('deleted', true, 'ts', (extract(epoch from stamp) * 1000)::bigint), actualizado = stamp
   where not hg_fuera_de_copia(d.clave)
     and not (c.datos ? d.clave)
     and not coalesce((d.valor->>'deleted')::boolean, false);
  -- lo de la copia, tal cual estaba (con fecha nueva para que todos lo descarguen)
  insert into datos (clave, valor, actualizado)
    select k, e.value->'v', stamp from jsonb_each(c.datos) e(k, value)
    on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado;
  -- stock y materiales
  update stock s set cantidad = 0 where not (c.stock ? s.producto);
  insert into stock
    select * from jsonb_populate_recordset(null::stock,
      (select coalesce(jsonb_agg(e.value || jsonb_build_object('producto', e.key)), '[]'::jsonb) from jsonb_each(c.stock) e))
    on conflict (producto) do update set cantidad = excluded.cantidad;
  -- el contador de ventas no retrocede
  update contador set valor = greatest(valor, coalesce(c.contador, 0)) where id = 1;
  -- aviso a todos los dispositivos: borran lo suyo y vuelven a descargar
  insert into datos (clave, valor, actualizado)
    values ('reset', jsonb_build_object('what', jsonb_build_array('ventas','pedidos','encargos','gastos','cierres','fichajes','movimientos','stock','materiales'),
                                        'n', (extract(epoch from stamp) * 1000)::bigint, 'restaurada', p_id), stamp)
    on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado;
  insert into datos (clave, valor, actualizado)
    values ('rev', jsonb_build_object('n', (extract(epoch from stamp) * 1000)::bigint::text || '-restaurada'), stamp)
    on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado;
  return jsonb_build_object('restaurada', p_id, 'filas', c.filas);
end $$;

grant execute on function public.hacer_copia(text)     to anon, authenticated;
grant execute on function public.listar_copias()       to anon, authenticated;
grant execute on function public.ver_copia(text)       to anon, authenticated;
grant execute on function public.restaurar_copia(text) to anon, authenticated;
