-- Aceite: una receta produce diez unidades; precios y existencias anteriores intactos.
CREATE OR REPLACE FUNCTION public.hg_validar_fabricacion(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare recipes jsonb;it jsonb;r jsonb;n text;q int;k text;esperado jsonb:='{}';real jsonb:='{}';positive int:=0;
begin
if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'FAB_DATOS';end if;
select valor into recipes from public.datos where clave='recetas';
for it in select * from jsonb_array_elements(p_items) loop
n:=it->>'producto';q:=(it->>'delta')::int;
if n is null or q=0 or q is null or q::numeric<>(it->>'delta')::numeric or abs(q)>9999 then raise exception 'FAB_DATOS';end if;
real:=jsonb_set(real,array[n],to_jsonb(coalesce((real->>n)::int,0)+q));
if q>0 then
positive:=positive+1;if n='Aceite de Arma' and q%10<>0 then raise exception 'ACEITE_LOTE_DE_DIEZ';end if;
if jsonb_typeof(recipes->n) is distinct from 'array' or jsonb_array_length(recipes->n)=0 then raise exception 'RECETA_INVALIDA';end if;
esperado:=jsonb_set(esperado,array[n],to_jsonb(coalesce((esperado->>n)::int,0)+q));
for r in select * from jsonb_array_elements(recipes->n) loop
k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
if coalesce((r->>'q')::numeric,0)<=0 then raise exception 'RECETA_INVALIDA';end if;
esperado:=jsonb_set(esperado,array[k],to_jsonb(coalesce((esperado->>k)::int,0)-(case when n='Aceite de Arma' then q/10 else q end)*(r->>'q')::int));
end loop;
end if;
end loop;
if positive=0 or esperado<>real then raise exception 'CONSUMO_NO_COINCIDE_CON_RECETA';end if;
end $function$

;
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
 if ent.key='Pólvora' then continue;end if;uid:='pol-'||p_peticion||'-'||idx;idx:=idx+1;rec:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'emp',nom,'prod',ent.key,'q',ent.value);records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',rec));
end loop;
uid:='pol-'||p_peticion;rec:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'who',nom,'tipo','fabricacion','data',jsonb_build_object('productos',made,'materiales',used,'polvoraAutomatica',plan->'autoPowder'));records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',rec));
for it in select * from jsonb_array_elements(records) loop insert into public.datos(clave,valor) values(it->>'clave',it->'valor');end loop;
result:=jsonb_build_object('empId',emp,'huella',md5(p_items::text),'stock',running,'records',records,'moves',moves,'made',made,'used',used,'autoPowder',plan->'autoPowder','npc',(select valor from public.datos where clave='npc:estado'),'replayed',false);
insert into public.datos(clave,valor) values('autoventa:fabricacion:'||p_peticion,result);insert into public.datos(clave,valor) values('rev',jsonb_build_object('n',p_peticion)) on conflict(clave) do update set valor=excluded.valor,actualizado=now();return result;
end $function$

;
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
  k:=ent.key; q:=ent.value::integer+coalesce((sold->>k)::integer,0)-case when k='Pólvora' then coalesce((made->>k)::integer,0) else 0 end;
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
  if n<>'Pólvora' or coalesce((powder_plan->>'autoPowder')::int,0)=0 then records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',val));end if;
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
end $function$

;
