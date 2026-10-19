CREATE OR REPLACE FUNCTION public.hg_venta_canonica(v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare catalog jsonb;pr jsonb;extras jsonb;clients jsonb;ds jsonb;cl jsonb;enc jsonb;d jsonb;it jsonb;p jsonb;x jsonb;items jsonb:='[]';discounts jsonb:='[]';
n text;ct text:=coalesce(v->>'clientType','particular');client text:=trim(v->>'client');op text:=v->>'op';encid text:=coalesce(v->>'fromEncargo','');did text;cat text;tag text;label text:='';
base bigint:=0;amount bigint:=0;reduction bigint:=0;group_sub bigint:=0;units integer:=0;group_units integer:=0;free integer:=0;t integer;q integer;c bigint;b bigint;paid bigint:=0;kind text:='';pct numeric;emp text;nom text;manual bigint:=0;
begin
if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
emp:=public.hg_claims()->'app_metadata'->>'emp_id';if emp is null and public.hg_servidor() then emp:=v->>'empId';end if;
select e->>'name' into nom from public.datos z,jsonb_array_elements(z.valor) e where z.clave='empleados' and e->>'id'=emp;
if nom is null then raise exception 'EMPLEADO_INVALIDO';end if;
if coalesce(v->>'manualDiscountCents','0') !~ '^[0-9]{1,10}$' then raise exception 'DESCUENTO_MANUAL_INVALIDO';end if;
manual:=coalesce((v->>'manualDiscountCents')::bigint,0);
if manual>0 and not public.hg_es_jefe() then raise exception 'DESCUENTO_MANUAL_SOLO_JEFES';end if;
if manual>0 and op is distinct from 'venta' then raise exception 'DESCUENTO_MANUAL_SOLO_VENTAS';end if;
if op not in ('venta','encargo') or op is null or client is null or length(client) not between 1 and 120 or ct not in ('particular','empresa','sheriff') then raise exception 'VENTA_INVALIDA';end if;
if jsonb_typeof(v->'items') is distinct from 'array' or jsonb_array_length(v->'items') not between 1 and 100 then raise exception 'VENTA_VACIA';end if;
if exists(select 1 from jsonb_array_elements(v->'items') i group by i->>'name' having count(*)>1) then raise exception 'PRODUCTO_DUPLICADO';end if;
if encid<>'' then
 select valor into enc from public.datos where clave='encargo:'||encid for update;
 if enc is null or coalesce((enc->>'finished')::boolean,false) or coalesce((enc->>'cancelled')::boolean,false) or op<>'venta' then raise exception 'ENCARGO_NO_DISPONIBLE';end if;
 client:=enc->>'client';ct:=coalesce(enc->>'clientType','particular');d:=enc->'disc';
 if exists(select 1 from jsonb_array_elements(enc->'items') a where not exists(select 1 from jsonb_array_elements(v->'items') z where z->>'name'=a->>'name' and (z->>'qty')::numeric>=(a->>'qty')::numeric)) then raise exception 'ENCARGO_INCOMPLETO';end if;
end if;
select coalesce(jsonb_object_agg(nombre,jsonb_build_object('c',precio,'cat',lower(categoria))),'{}') into catalog from public.bot_catalogo;
select valor into pr from public.datos where clave='precios';select valor into extras from public.datos where clave='productos';
for x in select * from jsonb_array_elements(coalesce(extras,'[]')) loop if not catalog ? (x->>'name') then catalog:=jsonb_set(catalog,array[x->>'name'],jsonb_build_object('c',round((x->>'price')::numeric*100),'cat',lower(x->>'cat')));end if;end loop;
select valor into clients from public.datos where clave='clientes';select a into cl from jsonb_array_elements(coalesce(clients,'[]')) a where regexp_replace(normalize(lower(a->>'name'),NFD),'['||chr(768)||'-'||chr(879)||']','','g')=regexp_replace(normalize(lower(client),NFD),'['||chr(768)||'-'||chr(879)||']','','g') limit 1;
if encid='' then
 did:=coalesce(nullif(v->>'discountId',''),v->'discInfo'->>'id');
 if did is not null then
  select z into d from public.datos zc,jsonb_array_elements(zc.valor) z where zc.clave='descuentos' and z->>'id'=did and (z->>'endMs')::numeric>extract(epoch from now())*1000 and (z->>'kind'<>'convenio' or z->>'clientType'=ct);
  if d is null then raise exception 'DESCUENTO_CAMBIADO';end if;
 end if;
end if;
for it in select * from jsonb_array_elements(v->'items') loop
 n:=it->>'name';if coalesce(it->>'qty','')!~'^[1-9][0-9]{0,3}$' then raise exception 'CANTIDAD_INVALIDA';end if;q:=(it->>'qty')::integer;p:=catalog->n;if p is null then raise exception 'PRODUCTO_NO_CONFIGURADO: %',n;end if;
 b:=case when pr ? n then round((pr->>n)::numeric*100) else (p->>'c')::bigint end;c:=b;
 if cl->'precios' ? n then c:=round((cl->'precios'->>n)::numeric*100);end if;
 if encid<>'' then select z into x from jsonb_array_elements(enc->'items') z where z->>'name'=n limit 1;if x is not null then c:=(x->>'cents')::bigint;end if;end if;
 if c is null or c<0 or b<0 or c>100000000 then raise exception 'PRECIO_INVALIDO';end if;
 -- Un cero configurado por Dirección es válido; un cero enviado por el navegador no lo es.
 if (it->>'cents')::numeric is distinct from c::numeric then raise exception 'PRECIO_CAMBIADO: %',n;end if;
 base:=base+b*q;amount:=amount+c*q;units:=units+q;cat:=p->>'cat';
 if (d->>'group'='suministros' and cat='suministros') or (d->>'group'='municiones' and cat='municion') or (d->>'group'='ambos' and cat in ('suministros','municion')) then group_sub:=group_sub+c*q;group_units:=group_units+q;end if;
 items:=items||jsonb_build_array(jsonb_build_object('name',n,'qty',q,'cents',c,'oq',case when encid<>'' then coalesce((select (z->>'qty')::int from jsonb_array_elements(enc->'items') z where z->>'name'=n),0) else 0 end,'cat',cat));
end loop;
if d is not null and d<>'null'::jsonb then
 pct:=coalesce((d->>'pct')::numeric,0);if pct<0 or pct>100 then raise exception 'DESCUENTO_INVALIDO';end if;tag:=case when d->>'kind'='oferta' then 'Oferta' else 'Convenio' end;
 if coalesce(d->>'group','')='' then reduction:=round(amount*pct/100);label:=tag||' '||(d->>'nombre')||' ('||pct||' %)';
 elsif coalesce((d->>'threshold')::integer,0)>0 and group_units>=(d->>'threshold')::integer then
  if d->>'benefit'='porcentaje' then reduction:=round(group_sub*pct/100);label:=tag||' '||(d->>'nombre')||' ('||pct||' %)';
  else free:=(group_units/(d->>'threshold')::integer)*coalesce((d->>'freeUnits')::integer,0);t:=0;
   for x in select z from jsonb_array_elements(items) z where (d->>'group'='suministros' and z->>'cat'='suministros') or (d->>'group'='municiones' and z->>'cat'='municion') or (d->>'group'='ambos' and z->>'cat' in ('suministros','municion')) order by (z->>'cents')::numeric loop q:=least(free,(x->>'qty')::integer);reduction:=reduction+q*(x->>'cents')::bigint;free:=free-q;t:=t+q;end loop;
   label:=tag||' '||(d->>'nombre')||': '||t||case when t=1 then ' unidad gratis' else ' unidades gratis' end;
  end if;
 end if;
end if;
if base>amount then discounts:=discounts||jsonb_build_array(jsonb_build_object('label','Precio especial','cents',base-amount));end if;
if reduction>0 then discounts:=discounts||jsonb_build_array(jsonb_build_object('label',label,'cents',reduction));end if;
amount:=amount-reduction;
if manual>amount then raise exception 'DESCUENTO_MANUAL_SUPERA_TOTAL';end if;
if manual>0 then discounts:=discounts||jsonb_build_array(jsonb_build_object('label','Descuento manual','cents',manual));end if;
amount:=amount-manual;if amount<0 then raise exception 'DESCUENTO_INVALIDO';end if;
if encid<>'' then paid:=coalesce((enc->>'depositCents')::bigint,0);kind:='fianza';elsif op='encargo' then paid:=coalesce((v->>'paidCents')::bigint,0);kind:='senal';if paid<=0 then raise exception 'ANTICIPO_OBLIGATORIO';end if;end if;
if paid<0 or paid>amount then raise exception 'ANTICIPO_INVALIDO';end if;
if op='encargo' and coalesce(v->>'telegram','')!~'^[A-Za-z0-9-]{1,10}$' then raise exception 'TELEGRAMA_INVALIDO';end if;
if coalesce((v->>'totalCents')::numeric,-1)<>amount or coalesce((v->>'dueCents')::numeric,amount-paid)<>amount-paid then raise exception 'TOTAL_CAMBIADO';end if;
return jsonb_build_object('items',(select jsonb_agg(z-'cat') from jsonb_array_elements(items) z),'empId',emp,'employee',nom,'client',client,'clientType',ct,'op',op,'fromEncargo',encid,'telegram',case when encid<>'' then enc->>'telegram' else left(coalesce(v->>'telegram',''),10) end,'note',left(coalesce(v->>'note',''),1000),'promise',left(coalesce(v->>'promise',''),10),'baseCents',base,'totalCents',amount,'discountCents',greatest(0,base-amount),'discounts',discounts,'manualDiscountCents',manual,'manualDiscountBy',case when manual>0 then emp else '' end,'manualDiscountByName',case when manual>0 then nom else '' end,'discInfo',d,'convenio',case when d is null or d='null'::jsonb then '' when coalesce(d->>'group','')<>'' then d->>'nombre' else (d->>'nombre')||' ('||coalesce(d->>'pct','0')||' %)' end,'convenioKind',case when d is null or d='null'::jsonb then '' else tag end,'paidCents',paid,'pendingCents',amount-paid,'dueCents',amount-paid,'kind',kind,'sig',v->>'sig','products',jsonb_array_length(items),'units',units,'serverValidated',true);
end $function$
