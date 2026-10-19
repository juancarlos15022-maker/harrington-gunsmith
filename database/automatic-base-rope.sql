CREATE OR REPLACE FUNCTION public.hg_polvora_plan(p_made jsonb, p_used jsonb, p_sold jsonb, p_stock jsonb, p_recipes jsonb, p_encargo text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare auto_rope int:=0;deficit int;r jsonb;k text;begin
if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
if coalesce((p_made->>'Lazo Reforzado')::int,0)>0 and coalesce((p_used->>'Lazo')::int,0)>0 then
 auto_rope:=greatest(0,coalesce((p_used->>'Lazo')::int,0)+coalesce((p_sold->>'Lazo')::int,0)-greatest(0,coalesce((p_stock->>'Lazo')::int,0)-public.hg_reservadas('Lazo',p_encargo))-coalesce((p_made->>'Lazo')::int,0));
 if auto_rope>0 then
  if jsonb_typeof(p_recipes->'Lazo') is distinct from 'array' or jsonb_array_length(p_recipes->'Lazo')=0 then raise exception 'RECETA_INVALIDA: Lazo';end if;
  p_made:=jsonb_set(p_made,array['Lazo'],to_jsonb(coalesce((p_made->>'Lazo')::int,0)+auto_rope));
  for r in select * from jsonb_array_elements(p_recipes->'Lazo') loop
   k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
   if coalesce((r->>'q')::numeric,0)<=0 or (r->>'q')::numeric<>trunc((r->>'q')::numeric) or k in ('Lazo','Lazo Reforzado') then raise exception 'RECETA_INVALIDA: Lazo';end if;
   p_used:=jsonb_set(p_used,array[k],to_jsonb(coalesce((p_used->>k)::int,0)+auto_rope*(r->>'q')::int));
  end loop;
 end if;
end if;
deficit:=greatest(0,coalesce((p_used->>'Pólvora')::int,0)+coalesce((p_sold->>'Pólvora')::int,0)-greatest(0,coalesce((p_stock->>'Pólvora')::int,0)-public.hg_reservadas('Pólvora',p_encargo))-coalesce((p_made->>'Pólvora')::int,0));
if deficit>0 then
 if jsonb_typeof(p_recipes->'Pólvora') is distinct from 'array' or jsonb_array_length(p_recipes->'Pólvora')=0 then raise exception 'RECETA_INVALIDA: Pólvora';end if;
 p_made:=jsonb_set(p_made,array['Pólvora'],to_jsonb(coalesce((p_made->>'Pólvora')::int,0)+deficit));
 for r in select * from jsonb_array_elements(p_recipes->'Pólvora') loop
  k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
  if coalesce((r->>'q')::numeric,0)<=0 or (r->>'q')::numeric<>trunc((r->>'q')::numeric) or k='Pólvora' then raise exception 'RECETA_INVALIDA: Pólvora';end if;
  p_used:=jsonb_set(p_used,array[k],to_jsonb(coalesce((p_used->>k)::int,0)+deficit*(r->>'q')::int));
 end loop;
end if;
return jsonb_build_object('made',p_made,'used',p_used,'autoPowder',deficit,'autoRope',auto_rope);end $function$;
CREATE OR REPLACE FUNCTION public.vender_fabricando(p_peticion text, p_venta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 old jsonb; powder_plan jsonb; recipes jsonb; it jsonb; r jsonb; rec jsonb; ent record;
 sold jsonb := '{}'; made jsonb := '{}'; used jsonb := '{}'; before_stock jsonb; running jsonb;
 moves jsonb := '[]'; records jsonb := '[]'; result jsonb; s jsonb; ledger jsonb; val jsonb;
 n text; k text; id text; uid text; emp text; employee text; why text;
 q integer; v integer; deficit integer; d integer; ix integer := 0; num bigint;
 original jsonb:=p_venta;enc jsonb;encid text:=coalesce(p_venta->>'fromEncargo','');
 stamp timestamptz := clock_timestamp(); ms bigint; local_time timestamptz;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;perform set_config('hg.operacion','venta',true);

 if not public.hg_permitido() then raise exception 'SIN_CUENTA'; end if;
 if p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' or p_peticion is null then raise exception 'PETICION_INVALIDA'; end if;
 if p_venta->>'op' is null or p_venta->>'op' not in ('venta','encargo') then raise exception 'VENTA_INVALIDA';end if;
 -- Serializa también las reservas y protege claves de stock aún inexistentes.
 lock table public.datos, public.stock in share row exclusive mode;
 select valor into old from public.datos where clave='autoventa:'||p_peticion;
 if old is not null then
  if (old ? 'huella' and old->>'huella'<>md5(original::text)) or old->'sale'->>'sig' is distinct from p_venta->>'sig' or old->'sale'->>'employee' is distinct from (select e->>'name' from public.datos d cross join lateral jsonb_array_elements(d.valor) e where clave='empleados' and e->>'id'=public.hg_claims()->'app_metadata'->>'emp_id') then raise exception 'PETICION_REUTILIZADA'; end if;
  return old || jsonb_build_object('replayed',true,'npc',(select valor from public.datos where clave='npc:estado'),'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 p_venta:=public.hg_venta_canonica(p_venta);
 if jsonb_typeof(p_venta->'items') is distinct from 'array' or jsonb_array_length(p_venta->'items') not between 1 and 100 then raise exception 'VENTA_VACIA'; end if;
 emp := p_venta->>'empId';
 select e->>'name' into employee from public.datos, jsonb_array_elements(valor) e where clave='empleados' and e->>'id'=emp;
 if employee is null then raise exception 'EMPLEADO_INVALIDO'; end if;
 if public.hg_claims()->'app_metadata'->>'emp_id' is not null and public.hg_claims()->'app_metadata'->>'emp_id' <> emp then raise exception 'EMPLEADO_INVALIDO'; end if;
 select valor into recipes from public.datos where clave='recetas';
 select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;
 running := before_stock;
 if p_venta->>'op'='venta' then
 for it in select * from jsonb_array_elements(p_venta->'items') loop
  n:=it->>'name'; q:=(it->>'qty')::integer;
  if n is null or q is null or q not between 1 and 9999 or (it->>'qty')::numeric<>q or (it->>'cents')::numeric<0 then raise exception 'CANTIDAD_INVALIDA'; end if;
  sold:=jsonb_set(sold,array[n],to_jsonb(coalesce((sold->>n)::integer,0)+q));
 end loop;
 for ent in select key,value from jsonb_each(sold) order by key loop
  n:=ent.key; q:=ent.value::integer;
  v:=greatest(0,coalesce((before_stock->>n)::integer,0)-public.hg_reservadas(n,encid)); deficit:=greatest(0,q-v);
  if deficit=0 then continue; end if;
  rec:=recipes->n;
  if jsonb_typeof(rec) is distinct from 'array' or jsonb_array_length(rec)=0 then raise exception 'FALTAN_MATERIALES: % (faltan % unidades; sin receta)',n,deficit; end if;
  made:=jsonb_set(made,array[n],to_jsonb(case when n='Aceite de Arma' then ((deficit+9)/10)*10 else deficit end));
  for r in select * from jsonb_array_elements(rec) loop
   q:=(r->>'q')::integer;
   if q is null or q<=0 or (r->>'q')::numeric<>q or coalesce(r->>'m','')='' then raise exception 'RECETA_INVALIDA: %',n; end if;
   k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
   used:=jsonb_set(used,array[k],to_jsonb(coalesce((used->>k)::integer,0)+(case when n='Aceite de Arma' then (deficit+9)/10 else deficit end)*q));
  end loop;
 end loop;
 powder_plan:=public.hg_polvora_plan(made,used,sold,before_stock,recipes,encid);made:=powder_plan->'made';used:=powder_plan->'used';
 for ent in select key,value from jsonb_each(used) order by key loop
  k:=ent.key; q:=ent.value::integer+coalesce((sold->>k)::integer,0)-case when k in ('Pólvora','Lazo') then coalesce((made->>k)::integer,0) else 0 end;
  v:=greatest(0,coalesce((before_stock->>k)::integer,0)-public.hg_reservadas(k,encid));
  if q>v then raise exception 'FALTAN_MATERIALES: % (faltan %)',k,q-v; end if;
 end loop;
 end if;
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
  if (n<>'Pólvora' or coalesce((powder_plan->>'autoPowder')::int,0)=0) and (n<>'Lazo' or coalesce((powder_plan->>'autoRope')::int,0)=0) then records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',val));end if;
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
 if s->>'op'='encargo' then
 val:=jsonb_build_object('id',id,'date',s->>'date','time',s->>'time','clientType',s->>'clientType','client',s->>'client','telegram',s->>'telegram','convenioId',s->'discInfo'->>'id','convenio',s->>'convenio','items',s->'items','baseCents',s->'baseCents','discountCents',s->'discountCents','employee',employee,'empId',emp,'note',s->>'note','promise',s->>'promise','totalCents',s->'totalCents','depositCents',s->'paidCents','pendingCents',s->'pendingCents','discounts',s->'discounts','disc',s->'discInfo','fab','PENDIENTE','avisado',false,'finished',false,'ts',ms,'serverValidated',true);
 records:=records||jsonb_build_array(jsonb_build_object('clave','encargo:'||id,'valor',val));
 elsif encid<>'' then
 select valor into enc from public.datos where clave='encargo:'||encid;
 enc:=enc||jsonb_build_object('finished',true,'finishedAt',ms,'deliverySale',id);
 update public.datos set valor=enc,actualizado=stamp where clave='encargo:'||encid;
 records:=records||jsonb_build_array(jsonb_build_object('clave','encargo:'||encid,'valor',enc));
 end if;
 for it in select * from jsonb_array_elements(records) loop
  insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 end loop;
 result:=jsonb_build_object('npc',(select valor from public.datos where clave='npc:estado'),'huella',md5(original::text),'sale',s,'stock',running,'records',records,'made',made,'used',used,'moves',moves,'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('autoventa:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',p_peticion),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.entregar_sin_venta(p_peticion text, p_venta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 powder_plan jsonb;old jsonb; recipes jsonb; it jsonb; r jsonb; rec jsonb; ent record;
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
 powder_plan:=public.hg_polvora_plan(made,used,sold,before_stock,recipes);made:=powder_plan->'made';used:=powder_plan->'used';
 for ent in select key,value from jsonb_each(used) order by key loop
  k:=ent.key; q:=ent.value::integer+coalesce((sold->>k)::integer,0)-case when k in ('Pólvora','Lazo') then coalesce((made->>k)::integer,0) else 0 end;
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
  if (n<>'Pólvora' or coalesce((powder_plan->>'autoPowder')::int,0)=0) and (n<>'Lazo' or coalesce((powder_plan->>'autoRope')::int,0)=0) then records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',val));end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.hg_encargo_estado(p_id text, p_estado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare powder_plan jsonb;recipes jsonb;e jsonb;old jsonb;it jsonb;r jsonb;n text;k text;emp text:=public.hg_claims()->'app_metadata'->>'emp_id';nom text;fab text;avisado boolean;used jsonb:='{}';products jsonb:='{}';before_stock jsonb;running jsonb;moves jsonb:='[]';records jsonb:='[]';rec jsonb;uid text;result jsonb;entry record;q integer;v integer;idx integer:=0;stamp timestamptz:=clock_timestamp();ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;cancel boolean:=coalesce((p_estado->>'cancelled')::boolean,false);refund boolean:=coalesce((p_estado->>'refunded')::boolean,false);
begin
if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
select x->>'name' into nom from public.datos d,jsonb_array_elements(d.valor) x where d.clave='empleados' and x->>'id'=emp;if nom is null then raise exception 'EMPLEADO_INVALIDO';end if;
lock table public.datos,public.stock in share row exclusive mode;
select valor into e from public.datos where clave='encargo:'||p_id;if e is null then raise exception 'ENCARGO_NO_DISPONIBLE';end if;old:=e;
if coalesce((e->>'finished')::boolean,false) then return jsonb_build_object('npc',(select valor from public.datos where clave='npc:estado'),'encargo',e,'records','[]'::jsonb,'moves','[]'::jsonb,'stock',(select jsonb_object_agg(producto,cantidad) from public.stock));end if;
perform set_config('hg.operacion','fabricacion',true);
if cancel then
 e:=e||jsonb_build_object('finished',true,'cancelled',true,'refunded',refund,'finishedAt',ms);
 if refund and coalesce((e->>'depositCents')::bigint,0)>0 then
 uid:='devolucion-'||p_id;rec:=jsonb_build_object('id',uid,'cat','otros','concepto','Devolución del adelanto · encargo '||p_id,'cents',(e->>'depositCents')::bigint,'day',(stamp at time zone 'Europe/Madrid')::date-date '1970-01-01','date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'empId',emp);
 records:=records||jsonb_build_array(jsonb_build_object('clave','gasto:'||uid,'valor',rec));
 end if;
else
 fab:=p_estado->>'fab';avisado:=coalesce((p_estado->>'avisado')::boolean,false);if fab not in ('PENDIENTE','FABRICADO') or fab is null or avisado and fab<>'FABRICADO' then raise exception 'ESTADO_ENCARGO_INVALIDO';end if;
 if fab='FABRICADO' and e->>'fab'<>'FABRICADO' and (e->'fabStock' is null or e->'fabStock'='null'::jsonb) then
  if not public.hg_es_jefe() and public.hg_pendientes_empleado(emp)>0 then raise exception 'FAB_BLOQUEADA';end if;
  for it in select * from jsonb_array_elements(e->'items') loop
   n:=it->>'name';q:=(it->>'qty')::int;select valor->n into rec from public.datos where clave='recetas';
   if jsonb_typeof(rec)='array' and jsonb_array_length(rec)>0 then
    products:=jsonb_set(products,array[n],to_jsonb(q));
    for r in select * from jsonb_array_elements(rec) loop k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));used:=jsonb_set(used,array[k],to_jsonb(coalesce((used->>k)::int,0)+q*(r->>'q')::int));end loop;
   end if;
  end loop;
  select valor into recipes from public.datos where clave='recetas';select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;
  powder_plan:=public.hg_polvora_plan(products,used,'{}',before_stock,recipes,p_id);products:=powder_plan->'made';used:=powder_plan->'used';
  for entry in select key,value from jsonb_each(products) loop moves:=moves||jsonb_build_array(jsonb_build_object('producto',entry.key,'delta',entry.value::int));end loop;
  for entry in select key,value from jsonb_each(used) loop moves:=moves||jsonb_build_array(jsonb_build_object('producto',entry.key,'delta',-entry.value::int));end loop;
  if jsonb_array_length(moves)>0 then perform public.hg_validar_fabricacion(moves);e:=e||jsonb_build_object('fabStock',jsonb_build_object('ts',ms,'items',(select jsonb_agg(jsonb_build_object('producto',key,'delta',value)) from jsonb_each(products)),'need',used,'movimientos',moves));end if;
 elsif fab='PENDIENTE' and e->>'fab'='FABRICADO' and e->'fabStock' is not null and e->'fabStock'<>'null'::jsonb then
  if jsonb_typeof(e->'fabStock'->'movimientos')='array' then
   select coalesce(jsonb_agg(jsonb_build_object('producto',x->>'producto','delta',-(x->>'delta')::integer) order by ord desc),'[]') into moves from jsonb_array_elements(e->'fabStock'->'movimientos') with ordinality as t(x,ord);
  else
   for it in select * from jsonb_array_elements(e->'fabStock'->'items') loop n:=it->>'producto';q:=(it->>'delta')::int;moves:=moves||jsonb_build_array(jsonb_build_object('producto',n,'delta',-q));end loop;
   for entry in select key,value from jsonb_each(e->'fabStock'->'need') loop
    k:=case when exists(select 1 from public.datos d,jsonb_array_elements(e->'fabStock'->'items') prod cross join lateral jsonb_array_elements(d.valor->(prod->>'producto')) r where d.clave='recetas' and r->>'m'=entry.key and coalesce((r->>'p')::boolean,false)) then entry.key else public.hg_venta_material(entry.key,false) end;
    moves:=moves||jsonb_build_array(jsonb_build_object('producto',k,'delta',entry.value));
   end loop;
  end if;e:=e||jsonb_build_object('fabStock',null);
 end if;
 e:=e||jsonb_build_object('fab',fab,'avisado',avisado);if avisado and not coalesce((old->>'avisado')::boolean,false) then e:=e||jsonb_build_object('avisadoAt',ms,'avisadoBy',nom);end if;
end if;
select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;running:=before_stock;
if jsonb_array_length(moves)>0 then
 for entry in select x->>'producto' as producto,sum((x->>'delta')::int)::int as delta from jsonb_array_elements(moves) x group by 1 loop if entry.delta<0 and coalesce((before_stock->>entry.producto)::int,0)+entry.delta<0 then raise exception 'FALTAN_MATERIALES: % (faltan %)',replace(entry.producto,'mat:',''),-(coalesce((before_stock->>entry.producto)::int,0)+entry.delta);end if; if entry.delta<0 and coalesce((before_stock->>entry.producto)::int,0)+entry.delta<public.hg_reservadas(entry.producto,p_id) then raise exception 'STOCK_RESERVADO: %',entry.producto;end if;end loop;
 perform public.mover_stock(moves);
 for it in select * from jsonb_array_elements(moves) loop
 n:=it->>'producto';q:=(it->>'delta')::int;v:=coalesce((running->>n)::int,0);uid:='encmov-'||p_id||'-'||ms||'-'||idx;idx:=idx+1;
 rec:=jsonb_build_object('uid',uid,'ts',ms,'who',nom,'name',case when n like 'mat:%' then substr(n,5)||' (material)' else n end,'delta',q,'antes',v,'despues',v+q,'why',case when fab='FABRICADO' then 'Fabricación' else 'Fabricación deshecha' end,'encargo',p_id,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'));
 records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',rec));running:=jsonb_set(running,array[n],to_jsonb(v+q));
 if q>0 and products ? n and (n<>'Pólvora' or coalesce((powder_plan->>'autoPowder')::int,0)=0) then uid:='encfab-'||p_id||'-'||ms||'-'||idx;rec:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'emp',nom,'prod',n,'q',q,'enc',p_id);records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',rec));end if;
 end loop;
 if fab='PENDIENTE' then for rec in select valor from public.datos where clave like 'fablote:%' and valor->>'enc'=p_id and not valor ? 'anula' loop uid:='encdes-'||p_id||'-'||ms||'-'||idx;idx:=idx+1;records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',jsonb_build_object('id',uid,'ts',ms,'anula',rec->>'id','empId',emp,'by',nom)));end loop;end if;
end if;
records:=records||jsonb_build_array(jsonb_build_object('clave','encargo:'||p_id,'valor',e));
uid:='encestado-'||p_id||'-'||ms;records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',jsonb_build_object('id',uid,'ts',ms,'tipo','encargo','empId',emp,'who',nom,'data',jsonb_build_object('encargo',p_id,'anterior',old,'nuevo',e))));
for it in select * from jsonb_array_elements(records) loop insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;end loop;
return jsonb_build_object('npc',(select valor from public.datos where clave='npc:estado'),'encargo',e,'records',records,'moves',moves,'stock',running);
end $function$;
CREATE OR REPLACE FUNCTION public.hg_fabricar_con_polvora(p_peticion text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare emp text:=public.hg_claims()->'app_metadata'->>'emp_id';nom text;owner boolean:=public.hg_es_jefe();recipes jsonb;before_stock jsonb;running jsonb;made jsonb:='{}';used jsonb:='{}';old jsonb;plan jsonb;it jsonb;r jsonb;rec jsonb;ent record;n text;k text;uid text;q int;v int;idx int:=0;records jsonb:='[]';moves jsonb:='[]';stamp timestamptz:=clock_timestamp();ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;result jsonb;
begin
if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
if p_peticion is null or p_peticion!~'^[A-Za-z0-9-]{20,80}$' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'FAB_DATOS';end if;
select e->>'name' into nom from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;if nom is null then raise exception 'EMPLEADO_INVALIDO';end if;
lock table public.datos,public.stock in share row exclusive mode;
select valor into old from public.datos where clave='autoventa:fabricacion:'||p_peticion;
if old is not null then if old->>'empId' is distinct from emp or old->>'huella' is distinct from md5(p_items::text) then raise exception 'PETICION_REUTILIZADA';end if;return old||jsonb_build_object('replayed',true,'stock',(select jsonb_object_agg(producto,cantidad) from public.stock),'npc',(select valor from public.datos where clave='npc:estado'));end if;
if not owner and public.hg_pendientes_empleado(emp)>0 then raise exception 'FAB_BLOQUEADA';end if;
if not owner and jsonb_array_length(p_items)<>1 then raise exception 'LIMITE_FABRICACION';end if;
select valor into recipes from public.datos where clave='recetas';select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;running:=before_stock;
for it in select * from jsonb_array_elements(p_items) loop
 n:=it->>'producto';if coalesce(it->>'delta','')!~'^[1-9][0-9]{0,3}$' or n is null or made ? n then raise exception 'FAB_DATOS';end if;q:=(it->>'delta')::int;if n='Aceite de Arma' then q:=((q+9)/10)*10;if q>9999 then raise exception 'LIMITE_FABRICACION';end if;end if;
 if not owner and q>(case when n='Pólvora' or n like 'Munición %' or n in ('Trapo','Aceite de Arma') then case when n='Aceite de Arma' then 10 else 15 end else 1 end) then raise exception 'LIMITE_FABRICACION';end if;
 if jsonb_typeof(recipes->n) is distinct from 'array' or jsonb_array_length(recipes->n)=0 then raise exception 'RECETA_INVALIDA: %',n;end if;
 made:=jsonb_set(made,array[n],to_jsonb(q));
 for r in select * from jsonb_array_elements(recipes->n) loop
  if coalesce((r->>'q')::numeric,0)<=0 or (r->>'q')::numeric<>trunc((r->>'q')::numeric) or coalesce(r->>'m','')='' then raise exception 'RECETA_INVALIDA';end if;
  k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));used:=jsonb_set(used,array[k],to_jsonb(coalesce((used->>k)::int,0)+(case when n='Aceite de Arma' then q/10 else q end)*(r->>'q')::int));
 end loop;
end loop;
plan:=public.hg_polvora_plan(made,used,'{}',before_stock,recipes);made:=plan->'made';used:=plan->'used';
for ent in select key,value from jsonb_each(used) loop if ent.value::int>greatest(0,coalesce((before_stock->>ent.key)::int,0)-public.hg_reservadas(ent.key,''))+coalesce((made->>ent.key)::int,0) then raise exception 'FALTAN_MATERIALES: %',ent.key;end if;end loop;
for ent in select key,value from jsonb_each(made) order by key loop moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',ent.value,'why','Fabricación'));end loop;
for ent in select key,value from jsonb_each(used) order by key loop moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::int,'why','Fabricación'));end loop;
perform public.hg_validar_fabricacion(moves);perform set_config('hg.operacion','fabricacion',true);perform public.mover_stock(moves);
for it in select * from jsonb_array_elements(moves) loop n:=it->>'producto';q:=(it->>'delta')::int;v:=coalesce((running->>n)::int,0);uid:='polmov-'||p_peticion||'-'||idx;idx:=idx+1;rec:=jsonb_build_object('uid',uid,'ts',ms,'who',nom,'name',case when n like 'mat:%' then substr(n,5)||' (material)' else n end,'delta',q,'antes',v,'despues',v+q,'why','Fabricación','date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'));records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',rec));running:=jsonb_set(running,array[n],to_jsonb(v+q));end loop;
for ent in select key,value from jsonb_each(made) loop
 if ent.key='Pólvora' or (ent.key='Lazo' and coalesce((plan->>'autoRope')::int,0)>0) then continue;end if;uid:='pol-'||p_peticion||'-'||idx;idx:=idx+1;rec:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'emp',nom,'prod',ent.key,'q',ent.value);records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',rec));
end loop;
uid:='pol-'||p_peticion;rec:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'who',nom,'tipo','fabricacion','data',jsonb_build_object('productos',made,'materiales',used,'polvoraAutomatica',plan->'autoPowder'));records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',rec));
for it in select * from jsonb_array_elements(records) loop insert into public.datos(clave,valor) values(it->>'clave',it->'valor');end loop;
result:=jsonb_build_object('empId',emp,'huella',md5(p_items::text),'stock',running,'records',records,'moves',moves,'made',made,'used',used,'autoPowder',plan->'autoPowder','autoRope',plan->'autoRope','npc',(select valor from public.datos where clave='npc:estado'),'replayed',false);
insert into public.datos(clave,valor) values('autoventa:fabricacion:'||p_peticion,result);insert into public.datos(clave,valor) values('rev',jsonb_build_object('n',p_peticion)) on conflict(clave) do update set valor=excluded.valor,actualizado=now();return result;
end $function$;
