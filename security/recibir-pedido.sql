-- HARRINGTON GUNSMITH · 19/10/2026 · Los empleados vuelven a poder registrar en la web la llegada de los pedidos.
-- Petición del dueño: «Que yo haga los pedidos y que cuando lleguen los marquen como recibidos».
-- Mismo patrón que vender_fabricando / entregar_sin_venta: función SECURITY INVOKER que abre la operación «pedido»
-- (hg.operacion) dentro de la transacción; solo en esa operación se permite escribir pedido:/recibido-.
-- El pago, los precios y la creación de pedidos siguen siendo solo del propietario.
-- Reversión: volver a crear hg_contexto y hg_dato_escritura sin «pedido» (ver security-before / blindaje) y
-- revocar execute de recibir_pedido. No borrar registros recibido-*, mov:*, act:* ni gasto:* creados por ella.

create or replace function public.hg_contexto()
 returns boolean language sql stable set search_path to 'pg_catalog','public'
as $$ select public.hg_permitido() and coalesce(current_setting('hg.operacion',true),'') in ('venta','fabricacion','inventario','npc','pedido') $$;

create or replace function public.hg_dato_escritura(k text, v jsonb)
 returns boolean language sql stable set search_path to 'pg_catalog','public'
as $$
select public.hg_es_jefe() or (public.hg_contexto() and (k='npc:estado' or k='rev' or k like 'sorteo-%' or split_part(k,':',1) in ('venta','encargo','gasto','autoventa','fablote','act','mov','invc','npcop','npcrev')))
or (public.hg_contexto() and current_setting('hg.operacion',true)='pedido' and (k like 'pedido:%' or k like 'recibido-%'))
or (public.hg_permitido() and (not coalesce((v->>'deleted')::boolean,false) or k like 'fichaje:%') and (k in ('rev','clientes','agenda') or split_part(k,':',1) in ('turno','fichaje','ausencia','log','act','dcerr','nota') or k like 'presencia-%' or k like 'fab-%')) $$;

-- Clave de almacén de un material de pedido, con los mismos alias que la web (canonMat/matKey) y el nombre ya existente en el almacén.
create or replace function public.hg_material_pedido(n text)
 returns text language plpgsql stable set search_path to 'pg_catalog','public'
as $$
declare c text; nombre text; k text;
begin
 nombre:=trim(regexp_replace(coalesce(n,''),'\s+',' ','g'));
 c:=translate(lower(nombre),'áéíóúüñàèìòù','aeiouunaeiou');
 if c='' then raise exception 'MATERIAL_INVALIDO'; end if;
 if c='polvora' then return 'Pólvora'; end if;
 nombre:=coalesce(case c
  when 'mena de hierro' then 'Hierro' when 'menas de hierro' then 'Hierro'
  when 'mena de carbon' then 'Carbón' when 'menas de carbon' then 'Carbón'
  when 'tablones' then 'Tabla de madera' when 'tablon' then 'Tabla de madera' when 'tablas de madera' then 'Tabla de madera'
  when 'trozo madera' then 'Trozo de madera' when 'trozos de madera' then 'Trozo de madera'
  when 'tornillos' then 'Tornillo'
  when 'pieza de armas' then 'Pieza de arma' when 'piezas de arma' then 'Pieza de arma' when 'piezas de armas' then 'Pieza de arma'
  when 'canon de revolver' then 'Cañón de revólver' when 'canones de revolver' then 'Cañón de revólver'
  when 'culata de revolver' then 'Culata de revólver' when 'culatas de revolver' then 'Culata de revólver'
  when 'canon de repetidora' then 'Cañón de repetidora' when 'canon de reptidora' then 'Cañón de repetidora' when 'canones de repetidora' then 'Cañón de repetidora'
  else null end, nombre);
 c:=translate(lower(nombre),'áéíóúüñàèìòù','aeiouunaeiou');
 select s.producto into k from public.stock s where s.producto like 'mat:%' and translate(lower(substr(s.producto,5)),'áéíóúüñàèìòù','aeiouunaeiou')=c order by s.producto limit 1;
 return coalesce(k,'mat:'||nombre);
end $$;

create or replace function public.recibir_pedido(p_peticion text, p_pedido text, p_lineas jsonb default null, p_por text default null)
 returns jsonb language plpgsql set search_path to 'pg_catalog','public'
as $$
declare
 ctx jsonb; emp text; nom text; por text; ped jsonb; items jsonb; it jsonb; ent record; prev jsonb;
 wants jsonb:='{}'; got jsonb:='[]'; mi jsonb:='{}'; moves jsonb:='[]'; records jsonb:='[]';
 i int; q int; rq int; want int; wn numeric; n int; ix int:=0; v int; d int; todo boolean; completo boolean:=false;
 k text; uid text; val jsonb; code text; prov text; running jsonb; g jsonb;
 stamp timestamptz:=clock_timestamp(); ms bigint; fecha text; hora text;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA' using errcode='42501'; end if;
 if p_peticion is null or p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' then raise exception 'PETICION_INVALIDA'; end if;
 if p_pedido is null or p_pedido !~ '^[A-Za-z0-9_-]{1,60}$' then raise exception 'PEDIDO_INVALIDO'; end if;
 perform set_config('hg.operacion','pedido',true);
 lock table public.datos, public.stock in share row exclusive mode;
 ctx:=hg_sync_private.contexto_lectura(); emp:=ctx->>'emp'; nom:=ctx->>'nombre';
 if coalesce(nom,'')='' then raise exception 'EMPLEADO_INVALIDO'; end if;
 por:=nom;
 if p_por is not null and p_por<>'' and p_por is distinct from emp then
  if not public.hg_es_jefe() then raise exception 'EMPLEADO_INVALIDO'; end if;
  select e->>'name' into por from public.datos dd, jsonb_array_elements(dd.valor) e where dd.clave='empleados' and e->>'id'=p_por;
  if por is null then raise exception 'EMPLEADO_INVALIDO'; end if;
 end if;
 -- Reintento de la misma petición (respuesta perdida): no se vuelve a sumar nada.
 select x.valor into prev from public.datos x where starts_with(x.clave,'recibido-'||p_pedido||'-') and x.valor->>'peticion'=p_peticion limit 1;
 select x.valor into ped from public.datos x where x.clave='pedido:'||p_pedido;
 if prev is not null then
  return jsonb_build_object('replayed',true,'pedido',ped,'got',prev->'items','all',coalesce((ped->>'received')::boolean,false),'records',jsonb_build_array(jsonb_build_object('clave','pedido:'||p_pedido,'valor',ped)),
   'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if ped is null or coalesce((ped->>'deleted')::boolean,false) then raise exception 'PEDIDO_NO_EXISTE'; end if;
 if coalesce((ped->>'cancelled')::boolean,false) then raise exception 'PEDIDO_CANCELADO'; end if;
 if coalesce((ped->>'received')::boolean,false) or coalesce(nullif(ped->>'completedAt','')::numeric,0)>0 then raise exception 'PEDIDO_YA_RECIBIDO'; end if;
 items:=ped->'items';
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)=0 then raise exception 'PEDIDO_INVALIDO'; end if;
 code:=coalesce(ped->>'code',p_pedido); prov:=coalesce(ped->>'proveedor','');
 -- Qué ha llegado: todo lo pendiente (p_lineas vacío) o las cantidades indicadas por línea.
 if p_lineas is null or jsonb_typeof(p_lineas)<>'array' or jsonb_array_length(p_lineas)=0 then
  for i in 0..jsonb_array_length(items)-1 loop
   q:=coalesce((items->i->>'qty')::int,0); rq:=least(q,coalesce((items->i->>'rq')::int,0));
   if q-rq>0 then wants:=wants||jsonb_build_object(i::text,q-rq); end if;
  end loop;
 else
  if jsonb_array_length(p_lineas)>60 then raise exception 'LINEA_INVALIDA'; end if;
  for it in select * from jsonb_array_elements(p_lineas) loop
   if jsonb_typeof(it->'i') is distinct from 'number' or jsonb_typeof(it->'qty') is distinct from 'number' then raise exception 'LINEA_INVALIDA'; end if;
   wn:=(it->>'qty')::numeric; if wn<>trunc(wn) or wn<1 or wn>100000 or (it->>'i')::numeric<>trunc((it->>'i')::numeric) then raise exception 'LINEA_INVALIDA'; end if;
   i:=(it->>'i')::int; want:=wn::int;
   if i<0 or i>=jsonb_array_length(items) then raise exception 'LINEA_INVALIDA'; end if;
   if wants ? i::text then raise exception 'LINEA_DUPLICADA'; end if;
   q:=coalesce((items->i->>'qty')::int,0); rq:=least(q,coalesce((items->i->>'rq')::int,0));
   if want>q-rq then raise exception 'CANTIDAD_EXCEDE: % (solo faltan %)',items->i->>'material',q-rq; end if;
   wants:=wants||jsonb_build_object(i::text,want);
  end loop;
 end if;
 if wants='{}'::jsonb then raise exception 'NADA_QUE_RECIBIR'; end if;
 for ent in select key,value from jsonb_each(wants) order by key::int loop
  i:=ent.key::int; want:=ent.value::int;
  q:=(items->i->>'qty')::int; rq:=least(q,coalesce((items->i->>'rq')::int,0));
  items:=jsonb_set(items,array[i::text,'rq'],to_jsonb(rq+want));
  got:=got||jsonb_build_array(jsonb_build_object('material',items->i->>'material','qty',want));
  k:=public.hg_material_pedido(items->i->>'material');
  mi:=jsonb_set(mi,array[k],to_jsonb(coalesce((mi->>k)::int,0)+want));
 end loop;
 todo:=not exists(select 1 from jsonb_array_elements(items) x where coalesce((x->>'rq')::int,0)<coalesce((x->>'qty')::int,0));
 ms:=(extract(epoch from stamp)*1000)::bigint;
 fecha:=to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'); hora:=to_char(stamp at time zone 'Europe/Madrid','HH24:MI');
 -- Reserva de la entrega: solo una por número; si otro dispositivo se adelantó, no se suma dos veces.
 n:=coalesce(jsonb_array_length(ped->'recs'),0)+1;
 insert into public.datos(clave,valor,actualizado) values('recibido-'||p_pedido||'-'||n,jsonb_build_object('ts',ms,'by',por,'peticion',p_peticion,'items',got,'parcial',not todo),stamp) on conflict(clave) do nothing;
 if not found then raise exception 'PEDIDO_CAMBIADO'; end if;
 -- Materiales al almacén y sus movimientos.
 select coalesce(jsonb_object_agg(producto,cantidad),'{}') into running from public.stock;
 for ent in select key,value from jsonb_each(mi) order by key loop
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',ent.value::int));
 end loop;
 perform public.mover_stock(moves);
 for it in select * from jsonb_array_elements(moves) loop
  k:=it->>'producto'; d:=(it->>'delta')::int; v:=coalesce((running->>k)::int,0);
  uid:='pr-'||p_peticion||'-'||ix; ix:=ix+1;
  val:=jsonb_build_object('uid',uid,'ts',ms,'who',por,'name',(case when k like 'mat:%' then substr(k,5) else k end)||' (material)','delta',d,'why','Pedido '||code,'antes',v,'despues',v+d,'date',fecha,'time',hora);
  insert into public.datos(clave,valor,actualizado) values('mov:'||uid,val,stamp);
  records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',val));
  running:=jsonb_set(running,array[k],to_jsonb(v+d));
 end loop;
 -- El pedido: recepciones, estado y, si ya estaba pagado y llega todo, se completa con su gasto.
 ped:=ped||jsonb_build_object('items',items,'recs',coalesce(ped->'recs','[]'::jsonb)||jsonb_build_array(jsonb_build_object('ts',ms,'by',por,'items',got,'full',todo)));
 if todo then
  ped:=ped||jsonb_build_object('received',true,'receivedBy',por,'receivedAt',ms,'matIn',true);
  insert into public.datos(clave,valor,actualizado) values('recibido-'||p_pedido,jsonb_build_object('ts',ms,'by',por,'peticion',p_peticion),stamp) on conflict(clave) do nothing;
  if coalesce((ped->>'paid')::boolean,false) then
   completo:=true; ped:=ped||jsonb_build_object('completedAt',ms);
   g:=jsonb_build_object('id','gp'||p_pedido,'cat','proveedor','concepto','Pedido '||code||' · '||prov,'cents',coalesce((ped->>'totalCents')::bigint,0),
     'day',(stamp at time zone 'Europe/Madrid')::date-date '1970-01-01','date',fecha,'time',hora,'pedido',p_pedido);
   -- Los empleados no ven los gastos: inserción normal (sin ON CONFLICT, que exige verlos) e ignorar si ya existía.
   begin
    insert into public.datos(clave,valor,actualizado) values('gasto:gp'||p_pedido,g,stamp);
    records:=records||jsonb_build_array(jsonb_build_object('clave','gasto:gp'||p_pedido,'valor',g));
   exception when unique_violation then null;
   end;
  end if;
 end if;
 update public.datos set valor=ped,actualizado=stamp where clave='pedido:'||p_pedido;
 records:=records||jsonb_build_array(jsonb_build_object('clave','pedido:'||p_pedido,'valor',ped));
 uid:='rp-'||p_peticion;
 val:=jsonb_build_object('id',uid,'ts',ms,'tipo','recepcion','who',por,'empId',emp,'data',jsonb_build_object('pedido',code,'proveedor',prov,'items',got,'parcial',not todo));
 insert into public.datos(clave,valor,actualizado) values('act:'||uid,val,stamp);
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',val));
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','pedido-'||p_peticion),stamp)
  on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('replayed',false,'pedido',ped,'got',got,'all',todo,'completed',completo,'records',records,'stock',running);
end $$;

revoke all on function public.recibir_pedido(text,text,jsonb,text) from public, anon;
grant execute on function public.recibir_pedido(text,text,jsonb,text) to authenticated;
revoke all on function public.hg_material_pedido(text) from public, anon;
grant execute on function public.hg_material_pedido(text) to authenticated;
