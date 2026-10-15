-- stock.cantidad es TOTAL: almacén propio + NPC. npc:estado.asig es una ubicación, no stock adicional.
create or replace function public.mover_stock(p_items jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare it jsonb; n text; d int; q int; a int; take_npc int; cfg jsonb; taken jsonb:='{}';uid text;emp text; actor text;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='npc:estado';
 cfg:=coalesce(cfg,'{"asig":{},"precios":{},"rev":{}}');
 for it in select * from jsonb_array_elements(p_items) loop
  n:=it->>'producto';d:=(it->>'delta')::int;
  select cantidad into q from public.stock where producto=n;
  q:=coalesce(q,0);a:=coalesce((cfg->'asig'->>n)::int,0);
  if a<0 or a>q then raise exception 'NPC_DESCUADRADO: %',n;end if;
  if q+d<0 then raise exception 'STOCK_INSUFICIENTE';end if;
  if d<0 then
   take_npc:=least(a,greatest(0,-d-greatest(0,q-a)));
   if take_npc>0 then
    cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a-take_npc));
    taken:=jsonb_set(taken,array[n],to_jsonb(coalesce((taken->>n)::int,0)+take_npc));
   end if;
  end if;
  update public.stock set cantidad=cantidad+d where producto=n;
  if not found then insert into public.stock(producto,cantidad) values(n,q+d);end if;
 end loop;
 if taken<>'{}'::jsonb then
  cfg:=cfg||jsonb_build_object('ts',(extract(epoch from clock_timestamp())*1000)::bigint);
  update public.datos set valor=cfg,actualizado=clock_timestamp() where clave='npc:estado';
  emp:=public.hg_claims()->'app_metadata'->>'emp_id';
  select e->>'name' into actor from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
  uid:='npc-uso-'||md5(clock_timestamp()::text||random()::text);
  insert into public.datos(clave,valor,actualizado) values('act:'||uid,jsonb_build_object('id',uid,'ts',(extract(epoch from clock_timestamp())*1000)::bigint,'tipo','npc','who',coalesce(actor,'Sistema'),'empId',coalesce(emp,''),'data',jsonb_build_object('txt','Unidades tomadas del NPC para una venta o consumo de stock','delNPC',taken)),clock_timestamp());
 end if;
 return (select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock);
exception when check_violation then raise exception 'STOCK_INSUFICIENTE';
end $$;

create or replace function public.npc_snapshot()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare cfg jsonb;v text;emp text:=public.hg_claims()->'app_metadata'->>'emp_id';
begin
 if not public.hg_permitido() or not exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp) then raise exception 'SIN_CUENTA';end if;
 select valor,xmin::text into cfg,v from public.datos where clave='npc:estado';
 return jsonb_build_object('npc',coalesce(cfg,'{"asig":{},"precios":{},"rev":{}}'),'version',v,'stock',(select coalesce(jsonb_object_agg(producto,jsonb_build_object('q',cantidad,'v',xmin::text)),'{}') from public.stock));
end $$;

create or replace function public.npc_operar(p_peticion text,p_modo text,p_items jsonb,p_base jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 emp text:=public.hg_claims()->'app_metadata'->>'emp_id';actor text;chief boolean;
 cfg jsonb;version text;old jsonb;it jsonb;rec jsonb;records jsonb:='[]';moves jsonb:='[]';rows jsonb:='[]';sales jsonb:='[]';prices jsonb;
 n text;uid text;rid text;sale_id text:='';stamp timestamptz:=clock_timestamp();ms bigint;idx int:=0;
 q int;a int;total int;delta int;sold int;cents int;amount bigint:=0;seq int;result jsonb;token text;changes int:=0;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 if p_peticion is null or p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' then raise exception 'PETICION_INVALIDA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select e->>'name',e->>'puesto'='Jefe' into actor,chief from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
 if actor is null then raise exception 'SIN_CUENTA';end if;
 if p_modo not in ('entregar','recuperar','consumir','revision','inventario','precios','avisar') or p_modo is null then raise exception 'MODO_INVALIDO';end if;
 if p_modo not in ('revision','avisar') and not chief then raise exception 'SOLO_JEFES';end if;
 select valor into old from public.datos where clave='npcop:'||p_peticion;
 if old is not null then
  if old->>'empId'<>emp or old->>'huella'<>md5(jsonb_build_array(p_modo,p_items,p_base)::text) then raise exception 'PETICION_REUTILIZADA';end if;
  return old||jsonb_build_object('replayed',true,'npc',coalesce((select valor from public.datos where clave='npc:estado'),'{}'),'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 select valor,xmin::text into cfg,version from public.datos where clave='npc:estado';
 cfg:=coalesce(cfg,'{"asig":{},"precios":{},"rev":{}}');
 if p_modo<>'avisar' and version is distinct from (p_base->>'version') then raise exception 'NPC_CAMBIADO';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 then raise exception 'CANTIDAD_INVALIDA';end if;
 if p_modo not in ('avisar','precios') and jsonb_array_length(p_items)=0 then raise exception 'RECUENTO_VACIO';end if;
 if (select count(*)<>count(distinct x->>'n') from jsonb_array_elements(p_items) x) then raise exception 'ARTICULO_DUPLICADO';end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;rid:='npc-'||p_peticion;
 if p_modo='revision' then
  -- Una revisión de ventas debe comprobar TODO lo que el NPC debería conservar.
  if exists(select 1 from jsonb_each_text(coalesce(cfg->'asig','{}')) a where a.value::int>0 and not exists(select 1 from jsonb_array_elements(p_items) x where x->>'n'=a.key)) then raise exception 'RECUENTO_INCOMPLETO';end if;
 end if;
 for it in select * from jsonb_array_elements(p_items) loop
  n:=it->>'n';
  if coalesce(n,'')='' or n like 'mat:%' or coalesce(it->>'q','')!~'^[0-9]{1,6}$' then raise exception 'CANTIDAD_INVALIDA';end if;
  q:=(it->>'q')::int;a:=coalesce((cfg->'asig'->>n)::int,0);delta:=0;sold:=0;
  select cantidad,xmin::text into total,token from public.stock where producto=n;
  total:=coalesce(total,0);
  if a<0 or a>total then raise exception 'NPC_DESCUADRADO: %',n;end if;
  if p_modo not in ('precios','avisar') and (token is distinct from (p_base->'stock'->n->>'v') or total<>coalesce((p_base->'stock'->n->>'q')::int,0)) then raise exception 'STOCK_CAMBIADO: %',n;end if;
  if p_modo='entregar' then
   if q<=0 or a+q>total then raise exception 'ALMACEN_INSUFICIENTE: %',n;end if;
   cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a+q));
  elsif p_modo in ('recuperar','consumir') then
   if q<=0 or q>a then raise exception 'NPC_INSUFICIENTE: %',n;end if;
   cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a-q));
   if p_modo='consumir' then delta:=-q;end if;
  elsif p_modo='inventario' then
   delta:=q-a;cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(q));
  elsif p_modo='revision' then
   if q>a then raise exception 'NPC_SOBRANTE: % (usa inventario o registra una entrega)',n;end if;
   sold:=a-q;delta:=-sold;cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(q));
   if sold>0 then
    cents:=coalesce((cfg->'precios'->>n)::int,(it->>'cents')::int);
    if cents is null or cents<=0 then raise exception 'PRECIO_NPC_INVALIDO: %',n;end if;
    sales:=sales||jsonb_build_array(jsonb_build_object('name',n,'qty',sold,'cents',cents,'oq',0));amount:=amount+sold::bigint*cents;
   end if;
  elsif p_modo='precios' then
   if q<=0 then raise exception 'PRECIO_NPC_INVALIDO';end if;
   cfg:=jsonb_set(cfg,array['precios',n],to_jsonb(q));
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('n',n,'esperado',a,'encontrado',coalesce((cfg->'asig'->>n)::int,0),'vendido',sold,'deltaTotal',delta));
  if delta<>0 then
   changes:=changes+1;
   insert into public.stock(producto,cantidad) values(n,total+delta) on conflict(producto) do update set cantidad=excluded.cantidad;
   uid:=rid||'-'||idx;idx:=idx+1;
   moves:=moves||jsonb_build_array(jsonb_build_object('producto',n,'delta',delta));
   rec:=jsonb_build_object('uid',uid,'ts',ms,'who',actor,'name',n,'delta',delta,'antes',total,'despues',total+delta,'why',case p_modo when 'revision' then 'Venta NPC' when 'inventario' then 'Ajuste de inventario del NPC' else 'Consumo del NPC' end,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'));
   records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',rec));
  end if;
 end loop;
 if p_modo='revision' then
  seq:=coalesce((cfg->'rev'->>'seq')::int,0)+1;
  if jsonb_array_length(sales)>0 then
   sale_id:='NPC-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY')||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0');
   rec:=jsonb_build_object('id',sale_id,'items',sales,'stock','{}'::jsonb,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'op','venta','client','NPC (tienda cerrada)','employee','','by',actor,'products',jsonb_array_length(sales),'units',(select sum((x->>'qty')::int) from jsonb_array_elements(sales) x),'dueCents',amount,'totalCents',amount,'npc',true,'ts',stamp,'note','Ventas del NPC, después de ventas manuales y traslados registrados');
   records:=records||jsonb_build_array(jsonb_build_object('clave','venta:'||sale_id,'valor',rec));
  end if;
  cfg:=jsonb_set(cfg,'{rev}',jsonb_build_object('pending',false,'since',0,'seq',seq,'last',jsonb_build_object('ts',ms,'by',actor)));
  records:=records||jsonb_build_array(jsonb_build_object('clave','npcrev:'||rid,'valor',jsonb_build_object('id',rid,'ts',ms,'by',actor,'filas',rows,'venta',sale_id)));
 elsif p_modo='inventario' then
  cfg:=jsonb_set(cfg,'{rev}',coalesce(cfg->'rev','{}')||jsonb_build_object('pending',false,'since',0,'last',jsonb_build_object('ts',ms,'by',actor,'inventario',true)));
 elsif p_modo='avisar' then
  cfg:=jsonb_set(cfg,'{rev}',coalesce(cfg->'rev','{}')||jsonb_build_object('pending',true,'since',ms));
 end if;
 cfg:=cfg||jsonb_build_object('ts',ms);
 insert into public.datos(clave,valor,actualizado) values('npc:estado',cfg,stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 rec:=jsonb_build_object('id',rid,'ts',ms,'tipo','npc','who',actor,'empId',emp,'data',jsonb_build_object('txt',case p_modo when 'revision' then 'Revisión de ventas del NPC' when 'inventario' then 'Inventario del NPC: ajuste sin ingresos' when 'entregar' then 'Traslado del almacén al NPC' when 'recuperar' then 'Traslado del NPC al almacén' when 'consumir' then 'Retirada del NPC para consumo' when 'precios' then 'Precios del NPC actualizados' else 'Revisión del NPC pendiente' end,'modo',p_modo,'filas',rows,'venta',sale_id));
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||rid,'valor',rec));
 for it in select * from jsonb_array_elements(records) loop insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);end loop;
 result:=jsonb_build_object('id',rid,'empId',emp,'huella',md5(jsonb_build_array(p_modo,p_items,p_base)::text),'modo',p_modo,'npc',cfg,'filas',rows,'records',records,'moves',moves,'venta',sale_id,'importe',amount,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock),'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('npcop:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',rid),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $$;
revoke execute on function public.npc_snapshot(),public.npc_operar(text,text,jsonb,jsonb) from public,anon;
grant execute on function public.npc_snapshot(),public.npc_operar(text,text,jsonb,jsonb) to authenticated;

-- Conserva la firma y los permisos existentes; usa el mismo orden de bloqueo que mover_stock.
create or replace function public.vender_stock(p_items jsonb,p_ctx jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare it jsonb;p text;d int;v int;r int;exc text:=coalesce(p_ctx->>'encargo','');
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 for it in select * from jsonb_array_elements(coalesce(p_items,'[]')) loop
  p:=it->>'producto';d:=coalesce((it->>'delta')::int,0);
  if d<0 then
   select cantidad into v from public.stock where producto=p for update;
   r:=public.hg_reservadas(p,exc);
   if r>0 and coalesce(v,0)+d>=0 and coalesce(v,0)+d<r then raise exception 'RESERVADA: % (% reservadas)',p,r;end if;
  end if;
 end loop;
 return public.mover_stock(p_items);
end $$;
