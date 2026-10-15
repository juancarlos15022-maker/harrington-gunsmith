-- Nueva función; no sustituye funciones ni permisos existentes. SECURITY INVOKER + RLS.
create or replace function public.hg_venta_material(n text, producto boolean default false)
returns text language sql immutable security invoker set search_path = public as $$
 select case when producto or n = 'Pólvora' then n else 'mat:' || case
 translate(lower(trim(regexp_replace(n, '\s+', ' ', 'g'))),'áéíóúñ','aeioun')
 when 'tornillo' then 'Tornillo' when 'tornillos' then 'Tornillo'
 when 'pieza de arma' then 'Pieza de arma' when 'pieza de armas' then 'Pieza de arma'
 when 'piezas de arma' then 'Pieza de arma' when 'piezas de armas' then 'Pieza de arma'
 when 'canon de revolver' then 'Cañón de revólver' when 'canones de revolver' then 'Cañón de revólver'
 when 'canones de revolveres' then 'Cañón de revólver' when 'canon de revolveres' then 'Cañón de revólver'
 when 'culata de revolver' then 'Culata de revólver' when 'culatas de revolver' then 'Culata de revólver'
 when 'culatas de revolveres' then 'Culata de revólver' when 'culata de revolveres' then 'Culata de revólver'
 when 'mena de hierro' then 'Hierro' when 'menas de hierro' then 'Hierro'
 when 'mena de carbon' then 'Carbón' when 'menas de carbon' then 'Carbón'
 when 'tablones' then 'Tabla de madera' when 'tablon' then 'Tabla de madera'
 when 'tablas de madera' then 'Tabla de madera'
 when 'trozo madera' then 'Trozo de madera' when 'trozos de madera' then 'Trozo de madera'
 else trim(regexp_replace(n, '\s+', ' ', 'g')) end end
$$;

create or replace function public.vender_fabricando(p_peticion text, p_venta jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
 old jsonb; recipes jsonb; it jsonb; r jsonb; rec jsonb; ent record;
 sold jsonb := '{}'; made jsonb := '{}'; used jsonb := '{}'; before_stock jsonb; running jsonb;
 moves jsonb := '[]'; records jsonb := '[]'; result jsonb; s jsonb; ledger jsonb; val jsonb;
 n text; k text; id text; uid text; emp text; employee text; why text;
 q integer; v integer; deficit integer; d integer; ix integer := 0; num bigint;
 stamp timestamptz := clock_timestamp(); ms bigint; local_time timestamptz;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA'; end if;
 if p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' or p_peticion is null then raise exception 'PETICION_INVALIDA'; end if;
 if p_venta->>'op' is distinct from 'venta' or coalesce(p_venta->>'fromEncargo','') <> '' then raise exception 'VENTA_INVALIDA'; end if;
 -- Serializa también las reservas y protege claves de stock aún inexistentes.
 lock table public.datos, public.stock in share row exclusive mode;
 select valor into old from public.datos where clave='autoventa:'||p_peticion;
 if old is not null then
  if old->'sale'->>'sig' is distinct from p_venta->>'sig' then raise exception 'PETICION_REUTILIZADA'; end if;
  return old || jsonb_build_object('replayed',true,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if jsonb_typeof(p_venta->'items') is distinct from 'array' or jsonb_array_length(p_venta->'items') not between 1 and 100 then raise exception 'VENTA_VACIA'; end if;
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
 num:=public.siguiente_numero(); ms:=(extract(epoch from stamp)*1000)::bigint;
 id:='HG-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY')||'-'||lpad(num::text,greatest(3,length(num::text)),'0');
 s:=p_venta-'empId';
 s:=s||jsonb_build_object('id',id,'employee',employee,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'stockApplied',sold,'autoFabricacion',made,'ts',stamp);
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
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::integer,'why','Venta '||id));
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
  val:=jsonb_build_object('id',uid,'ts',ms,'tipo','fabricacion','who',employee,'empId',emp,'data',jsonb_build_object('txt','Fabricación automática para venta '||id,'venta',id,'productos',made,'materiales',used));
  records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',val));
 end if;
 ledger:=s-'sig'-'stockApplied';
 ledger:=ledger||jsonb_build_object('stock',sold,'dueCents',coalesce((s->>'dueCents')::numeric,(s->>'totalCents')::numeric),'ts',stamp+interval '1 millisecond');
 records:=records||jsonb_build_array(jsonb_build_object('clave','venta:'||id,'valor',ledger));
 for it in select * from jsonb_array_elements(records) loop
  insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);
 end loop;
 result:=jsonb_build_object('sale',s,'stock',running,'records',records,'made',made,'used',used,'moves',moves,'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('autoventa:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',p_peticion),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $$;
revoke execute on function public.hg_venta_material(text,boolean) from public;
revoke execute on function public.vender_fabricando(text,jsonb) from public;
grant execute on function public.hg_venta_material(text,boolean), public.vender_fabricando(text,jsonb) to anon, authenticated, service_role;
