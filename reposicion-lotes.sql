-- 20/10/2026 · Pedidos automáticos con lote por material para cualquier proveedor (Tala Annesburg y Agricultura Jacksons Farm).
-- Cada proveedor tiene su configuración cfg:reposicion-<nombre> con modo 'lote-por-material', minimos, lotes,
-- origen ('reposicion-<nombre>'), idPrefijo (prefijo del id del pedido) y prefijo (letra del código PED-…-X…).
-- hg_reponer_tala() (la llama la revisión de cada minuto) recorre ahora todas esas configuraciones.

create or replace function public.hg_reponer_lotes(p_cfg text) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text;
 prop jsonb; pkey text:=''; origen text; idp text; pref text;
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(214701020,20261020) then return jsonb_build_object('busy',true);end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave=p_cfg;
 if not coalesce((cfg->>'enabled')::boolean,false) or cfg->>'modo' is distinct from 'lote-por-material' then return jsonb_build_object('disabled',true);end if;
 origen:=coalesce(cfg->>'origen','reposicion-'||substr(p_cfg,16));idp:=coalesce(cfg->>'idPrefijo',substr(p_cfg,16));pref:=coalesce(cfg->>'prefijo','L');
 select e into prov from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'id'=cfg->>'proveedorId';
 if prov is null then raise exception 'PROVEEDOR_REPOSICION_NO_EXISTE';end if;
 select b.discord_id into uid from public.hg_discord_bindings b where b.emp_id=cfg->>'ownerEmp';
 if uid is null or uid<>cfg->>'recipientId' then raise exception 'DESTINATARIO_REPOSICION_NO_VERIFICADO';end if;
 prop:=public.hg_reposicion_propuesta(origen);
 if prop is not null then pkey:=prop->>'clave';prop:=prop->'valor';end if;
 select valor into limits from public.datos where clave='stockmin';
 for target in select key,value from jsonb_each(cfg->'minimos') order by key loop
  wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);
  if wanted<=0 then continue;end if;
  select coalesce(sum(cantidad),0)::integer into qty from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=target.key;
  if qty>=wanted then continue;end if;
  -- lo que ya viene en otro pedido abierto (o en la propuesta) no se vuelve a pedir
  select coalesce(sum(greatest(0,(i->>'qty')::integer-coalesce((i->>'rq')::integer,0))),0)::integer into incoming
  from public.datos d cross join lateral jsonb_array_elements(d.valor->'items') i
  where starts_with(d.clave,'pedido:') and not coalesce((d.valor->>'received')::boolean,false)
   and not coalesce((d.valor->>'cancelled')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)
   and coalesce((d.valor->>'completedAt')::numeric,0)=0 and public.hg_venta_material(i->>'material',false)=target.key;
  if qty+incoming>=wanted then continue;end if;
  wanted:=coalesce((cfg->'lotes'->>target.key)::integer,(cfg->>'lote')::integer,100);
  select x into product from jsonb_array_elements(prov->'prods') x where public.hg_venta_material(x->>'name',false)=target.key limit 1;
  if product is null or coalesce((product->>'price')::integer,0)<=0 then raise exception 'PRECIO_REPOSICION_NO_CONFIGURADO: %',target.key;end if;
  price:=(product->>'price')::integer;
  items:=items||jsonb_build_array(jsonb_build_object('material',product->>'name','qty',wanted,'price',price));
  total:=total+wanted::bigint*price;
 end loop;
 if jsonb_array_length(items)=0 then return jsonb_build_object('created',false);end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;
 if pkey<>'' then
  prop:=prop||jsonb_build_object('items',(prop->'items')||items,'totalCents',coalesce((prop->>'totalCents')::bigint,0)+total,'propActualizadaTs',ms,'propVersion',coalesce((prop->>'propVersion')::integer,1)+1);
  update public.datos set valor=prop,actualizado=stamp where clave=pkey;
  update public.hg_reposicion_avisos set version=version+1 where pedido_id=prop->>'id';
  insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',(prop->>'id')||'-'||ms),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
  return jsonb_build_object('created',false,'actualizado',true,'pedido',prop);
 end if;
 id:=idp||'-'||gen_random_uuid()::text;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-'||pref||upper(substr(replace(substr(id,length(idp)+2),'-',''),1,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen',origen,
 'propuesta',true,'propVersion',1,'propActualizadaTs',ms);
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Propuesta de pedido para '||(prov->>'name')||E':\n';
 for product in select * from jsonb_array_elements(items) loop texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||E'\n';end loop;
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,config_key,nonce,token) values(id,uid,texto,p_cfg,'rep-'||substr(replace(substr(id,length(idp)+2),'-',''),1,20),public.hg_reposicion_token());
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $$;
revoke all on function public.hg_reponer_lotes(text) from public,anon,authenticated;
grant execute on function public.hg_reponer_lotes(text) to service_role;

-- La revisión de cada minuto llama a hg_reponer_tala(): ahora recorre todos los proveedores con lote por material.
create or replace function public.hg_reponer_tala() returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare k text; r jsonb; creados jsonb:='[]'; primero jsonb;
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 for k in select clave from public.datos where clave like 'cfg:reposicion-%' and valor->>'modo'='lote-por-material' and coalesce((valor->>'enabled')::boolean,false) order by clave loop
  begin
   r:=public.hg_reponer_lotes(k);
  exception when others then r:=jsonb_build_object('error',sqlerrm); end;
  if coalesce((r->>'created')::boolean,false) or coalesce((r->>'actualizado')::boolean,false) then
   creados:=creados||jsonb_build_array(r->'pedido'->>'code');
   if coalesce((r->>'created')::boolean,false) and primero is null then primero:=r->'pedido';end if;
  end if;
 end loop;
 return jsonb_build_object('created',primero is not null,'pedido',primero,'pedidos',creados);
end $$;
revoke all on function public.hg_reponer_tala() from public,anon,authenticated;
grant execute on function public.hg_reponer_tala() to service_role;

-- Tala: se le añaden los datos que antes iban fijos en la función.
update public.datos set valor=valor||'{"origen":"reposicion-tala","idPrefijo":"tala","prefijo":"T"}'::jsonb,actualizado=clock_timestamp() where clave='cfg:reposicion-tala';

-- Agricultura Jacksons Farm: si la tela baja de 40, propuesta de 100.
lock table public.datos,public.stock in share row exclusive mode;
do $$
declare supplier text; previous jsonb;
 mins jsonb:='{"mat:Tela":40}'; lotes jsonb:='{"mat:Tela":100}'; r record;
begin
 select e->>'id' into supplier from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='Agricultura Jacksons Farm';
 if supplier is null then raise exception 'JACKSONS_FARM_NO_LOCALIZADA';end if;
 select valor into previous from public.datos where clave='cfg:reposicion-herreria';
 if not exists(select 1 from public.hg_discord_bindings where emp_id=previous->>'ownerEmp' and discord_id=previous->>'recipientId') then raise exception 'DESTINATARIO_NO_VERIFICADO';end if;
 insert into public.datos(clave,valor,actualizado) values('cfg:reposicion-granja',jsonb_build_object('enabled',true,'proveedorId',supplier,'ownerEmp',previous->>'ownerEmp','recipientId',previous->>'recipientId','minimos',mins,'modo','lote-por-material','lotes',lotes,'origen','reposicion-granja','idPrefijo','granja','prefijo','G','descontarPendientes',true),clock_timestamp())
 on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 for r in select key,value from jsonb_each(mins) loop
  insert into public.stock(producto,cantidad,minimo) values(r.key,0,(r.value)::integer) on conflict(producto) do update set minimo=excluded.minimo;
 end loop;
 insert into public.datos(clave,valor,actualizado) values('stockmin',mins,clock_timestamp()) on conflict(clave) do update set valor=datos.valor||excluded.valor,actualizado=excluded.actualizado;
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','reposicion-granja-20261020'),clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
end $$;
