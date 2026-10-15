create or replace function public.hg_coste_entrega(n text, profundidad integer default 0) returns numeric language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare recetas jsonb;r jsonb;rec jsonb;total numeric:=0;c numeric;k text;pedido jsonb;prov jsonb;art jsonb;t numeric;begin
if not public.hg_es_jefe() then raise exception 'SOLO_PROPIETARIO';end if;
if profundidad>8 then raise exception 'RECETA_CICLICA: %',n;end if;
select valor into recetas from public.datos where clave='recetas';rec:=recetas->n;
if jsonb_typeof(rec)='array' and jsonb_array_length(rec)>0 then
 for r in select * from jsonb_array_elements(rec) loop
  if coalesce(r->>'q','')!~'^[1-9][0-9]*$' then raise exception 'RECETA_INVALIDA: %',n;end if;
  c:=public.hg_coste_entrega(r->>'m',profundidad+1);total:=total+c*(r->>'q')::numeric;
 end loop;return total;
end if;
k:=public.hg_venta_material(n,false);
select d.valor,x into pedido,art from public.datos d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.valor->'items')='array' then d.valor->'items' else '[]' end) x
where d.clave like 'pedido:%' and coalesce((d.valor->>'received')::boolean,false) and not coalesce((d.valor->>'cancelled')::boolean,false) and public.hg_venta_material(x->>'material',false)=k
order by coalesce((d.valor->>'receivedAt')::numeric,(d.valor->>'ts')::numeric,0) desc limit 1;
if art is not null then
 c:=(art->>'price')::numeric;t:=coalesce((pedido->>'receivedAt')::numeric,(pedido->>'ts')::numeric,0);
 select v into prov from public.datos d,jsonb_array_elements(d.valor) v where d.clave='proveedores' and (v->>'id'=pedido->>'proveedorId' or v->>'name'=pedido->>'proveedor') limit 1;
 select x into art from jsonb_array_elements(coalesce(prov->'prods','[]')) x where public.hg_venta_material(x->>'name',false)=k and coalesce((x->>'pts')::numeric,0)>t and (x->>'price')::numeric>0 limit 1;
 if art is not null then c:=(art->>'price')::numeric;end if;
else
 select (x->>'price')::numeric into c from public.datos d,jsonb_array_elements(d.valor) v,jsonb_array_elements(v->'prods') x where d.clave='proveedores' and public.hg_venta_material(x->>'name',false)=k and (x->>'price')::numeric>0 limit 1;
end if;
if c is null or c<0 then raise exception 'COSTE_DESCONOCIDO: %',n;end if;return c;end $$;
revoke all on function public.hg_coste_entrega(text,integer) from public,anon;grant execute on function public.hg_coste_entrega(text,integer) to authenticated;
CREATE OR REPLACE FUNCTION public.entregar_sin_venta(p_peticion text, p_venta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 old jsonb; recipes jsonb; it jsonb; r jsonb; rec jsonb; ent record;
 sold jsonb := '{}'; made jsonb := '{}'; used jsonb := '{}'; before_stock jsonb; running jsonb;
 moves jsonb := '[]'; records jsonb := '[]'; result jsonb; s jsonb; ledger jsonb; val jsonb;
 n text; k text; id text; uid text; emp text; employee text; why text;
 q integer; v integer; deficit integer; d integer; ix integer := 0; num bigint;
 coste numeric:=0;unitario numeric;lineas jsonb:='[]'; tipo text:=p_venta->>'op';
 stamp timestamptz := clock_timestamp(); ms bigint; local_time timestamptz;
begin
 if not public.hg_es_jefe() then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if;
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;perform set_config('hg.operacion','venta',true);

 if not public.hg_permitido() then raise exception 'SIN_CUENTA'; end if;
 if p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' or p_peticion is null then raise exception 'PETICION_INVALIDA'; end if;
 if (tipo is null or tipo not in ('personal','regalo')) or coalesce(p_venta->>'fromEncargo','') <> '' then raise exception 'VENTA_INVALIDA'; end if;
 if length(trim(coalesce(p_venta->>'client','')))=0 then raise exception 'DESTINATARIO_OBLIGATORIO';end if;
 -- Serializa también las reservas y protege claves de stock aún inexistentes.
 lock table public.datos, public.stock in share row exclusive mode;
 select valor into old from public.datos where clave='entrega:'||p_peticion;
 if old is not null then
  if old->'sale'->>'sig' is distinct from p_venta->>'sig' or old->'sale'->>'employee' is distinct from (select e->>'name' from public.datos d cross join lateral jsonb_array_elements(d.valor) e where clave='empleados' and e->>'id'=public.hg_claims()->'app_metadata'->>'emp_id') then raise exception 'PETICION_REUTILIZADA'; end if;
  return old || jsonb_build_object('replayed',true,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if jsonb_typeof(p_venta->'items') is distinct from 'array' or jsonb_array_length(p_venta->'items') not between 1 and 100 then raise exception 'VENTA_VACIA'; end if;
 if tipo='personal' and not exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'name'=p_venta->>'client') then raise exception 'DESTINATARIO_INVALIDO';end if;
 emp := p_venta->>'empId';
 select e->>'name' into employee from public.datos, jsonb_array_elements(valor) e where clave='empleados' and e->>'id'=emp;
 if employee is null then raise exception 'EMPLEADO_INVALIDO'; end if;
 if public.hg_claims()->'app_metadata'->>'emp_id' is not null and public.hg_claims()->'app_metadata'->>'emp_id' <> emp then raise exception 'EMPLEADO_INVALIDO'; end if;
 select valor into recipes from public.datos where clave='recetas';
 select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;
 running := before_stock;
 for it in select * from jsonb_array_elements(p_venta->'items') loop
  n:=it->>'name'; q:=(it->>'qty')::integer;
  if n is null or q is null or q not between 1 and 9999 or (it->>'qty')::numeric<>q or (it->>'cents')::numeric<0 then raise exception 'CANTIDAD_INVALIDA'; end if;
  sold:=jsonb_set(sold,array[n],to_jsonb(coalesce((sold->>n)::integer,0)+q));
 end loop;
 for ent in select key,value from jsonb_each(sold) order by key loop
  n:=ent.key; q:=ent.value::integer;
  v:=greatest(0,coalesce((before_stock->>n)::integer,0)-public.hg_reservadas(n,'')); deficit:=greatest(0,q-v);
  if deficit=0 then continue; end if;
  rec:=recipes->n;
  if jsonb_typeof(rec) is distinct from 'array' or jsonb_array_length(rec)=0 then raise exception 'FALTAN_MATERIALES: % (faltan % unidades; sin receta)',n,deficit; end if;
  made:=jsonb_set(made,array[n],to_jsonb(deficit));
  for r in select * from jsonb_array_elements(rec) loop
   q:=(r->>'q')::integer;
   if q is null or q<=0 or (r->>'q')::numeric<>q or coalesce(r->>'m','')='' then raise exception 'RECETA_INVALIDA: %',n; end if;
   k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
   used:=jsonb_set(used,array[k],to_jsonb(coalesce((used->>k)::integer,0)+deficit*q));
  end loop;
 end loop;
 for ent in select key,value from jsonb_each(used) order by key loop
  k:=ent.key; q:=ent.value::integer+coalesce((sold->>k)::integer,0);
  v:=greatest(0,coalesce((before_stock->>k)::integer,0)-public.hg_reservadas(k,''));
  if q>v then raise exception 'FALTAN_MATERIALES: % (faltan %)',k,q-v; end if;
 end loop;
 -- Todos los registros se escriben en esta misma transacción, incluido el número de venta.
 for ent in select key,value from jsonb_each(sold) loop
  unitario:=public.hg_coste_entrega(ent.key);coste:=coste+unitario*ent.value::integer;lineas:=lineas||jsonb_build_array(jsonb_build_object('name',ent.key,'qty',ent.value::integer,'unitCost',unitario));
 end loop;
 ms:=(extract(epoch from stamp)*1000)::bigint;
 if p_venta ? 'expectedCost' and (p_venta->>'expectedCost')::numeric<>coste then raise exception 'COSTE_CAMBIADO';end if;
 id:='ENT-'||p_peticion;
 s:=p_venta-'empId';
 s:=s||jsonb_build_object('id',id,'employee',employee,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'stockApplied',sold,'autoFabricacion',made,'ts',stamp,'costCents',coste,'costLines',lineas,'totalCents',0,'dueCents',0);
 for ent in select key,value from jsonb_each(made) order by key loop
  n:=ent.key; q:=ent.value::integer;
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',n,'delta',q,'why','Fabricación','venta',id));
  uid:='av-'||p_peticion||'-'||ix; ix:=ix+1;
  val:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'emp',employee,'prod',n,'q',q,'autoVenta',id);
  records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',val));
 end loop;
 for ent in select key,value from jsonb_each(used) order by key loop
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::integer,'why','Fabricación','venta',id));
 end loop;
 for ent in select key,value from jsonb_each(sold) order by key loop
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::integer,'why',case tipo when 'personal' then 'Entrega al personal ' else 'Regalo ' end||id));
 end loop;
 perform public.mover_stock(moves);
 for it in select * from jsonb_array_elements(moves) loop
  n:=it->>'producto'; d:=(it->>'delta')::integer; v:=coalesce((running->>n)::integer,0);
  uid:='av-'||p_peticion||'-'||ix; ix:=ix+1;
  val:=jsonb_build_object('uid',uid,'ts',ms,'who',employee,'venta',id,'name',case when n like 'mat:%' then substr(n,5)||' (material)' else n end,'delta',d,'why',it->>'why','antes',v,'despues',v+d,'date',s->>'date','time',s->>'time');
  records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',val));
  running:=jsonb_set(running,array[n],to_jsonb(v+d));
 end loop;
 if made<>'{}'::jsonb then
  uid:='av-'||p_peticion;
  val:=jsonb_build_object('id',uid,'ts',ms,'tipo','fabricacion','who',employee,'empId',emp,'data',jsonb_build_object('txt','Fabricación automática para entrega '||id,'venta',id,'productos',made,'materiales',used));
  records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',val));
 end if;
 ledger:=jsonb_build_object('id',id,'cat','otros','concepto',case tipo when 'personal' then 'Entrega al personal' else 'Regalo' end||' · '||(s->>'client'),'cents',coste,'day',(stamp at time zone 'Europe/Madrid')::date-date '1970-01-01','date',s->>'date','time',s->>'time','entrega',s,'sinSalidaCaja',true,'costMethod','receta y precios de referencia vigentes');
 records:=records||jsonb_build_array(jsonb_build_object('clave','gasto:'||id,'valor',ledger));
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||id,'valor',jsonb_build_object('id',id,'ts',ms,'tipo','entrega','who',employee,'empId',emp,'data',s)));
 for it in select * from jsonb_array_elements(records) loop
  insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);
 end loop;
 result:=jsonb_build_object('expense',ledger,'sale',s,'stock',running,'records',records,'made',made,'used',used,'moves',moves,'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('entrega:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',p_peticion),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $function$

;
revoke all on function public.entregar_sin_venta(text,jsonb) from public,anon;grant execute on function public.entregar_sin_venta(text,jsonb) to authenticated;
