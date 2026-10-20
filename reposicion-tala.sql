-- 20/10/2026 · Pedido automático de la Tala Annesburg (como el de la mina, con un lote propio por material).
-- Si un material baja de su mínimo, se propone su lote: trozos de madera <200 → 300, fibra <300 → 300,
-- papel <300 → 300, tablas de madera («Tablones») <10 → 20. Nace como PROPUESTA en el privado de la Dirección,
-- se le añaden los materiales que bajen después y se cierra al aceptarla (igual que la herrería y la mina).

create or replace function public.hg_reponer_tala() returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text;
 prop jsonb; pkey text:='';
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(214701020,20261020) then return jsonb_build_object('busy',true);end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='cfg:reposicion-tala';
 if not coalesce((cfg->>'enabled')::boolean,false) then return jsonb_build_object('disabled',true);end if;
 select e into prov from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'id'=cfg->>'proveedorId';
 if prov is null then raise exception 'PROVEEDOR_REPOSICION_NO_EXISTE';end if;
 select b.discord_id into uid from public.hg_discord_bindings b where b.emp_id=cfg->>'ownerEmp';
 if uid is null or uid<>cfg->>'recipientId' then raise exception 'DESTINATARIO_REPOSICION_NO_VERIFICADO';end if;
 prop:=public.hg_reposicion_propuesta('reposicion-tala');
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
  wanted:=coalesce((cfg->'lotes'->>target.key)::integer,(cfg->>'lote')::integer,300);
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
 id:='tala-'||gen_random_uuid()::text;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-T'||upper(substr(replace(id,'-',''),5,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen','reposicion-tala',
 'propuesta',true,'propVersion',1,'propActualizadaTs',ms);
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Propuesta de pedido para '||(prov->>'name')||E':\n';
 for product in select * from jsonb_array_elements(items) loop texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||E'\n';end loop;
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,config_key,nonce,token) values(id,uid,texto,'cfg:reposicion-tala','rep-'||substr(replace(substr(id,6),'-',''),1,20),public.hg_reposicion_token());
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $$;
revoke all on function public.hg_reponer_tala() from public,anon,authenticated;
grant execute on function public.hg_reponer_tala() to service_role;

-- Configuración: proveedor Tala Annesburg, mismo destinatario verificado que la herrería, mínimos y lotes.
lock table public.datos,public.stock in share row exclusive mode;
do $$
declare supplier text; previous jsonb;
 mins jsonb:='{"mat:Trozo de madera":200,"mat:Fibra":300,"mat:Papel":300,"mat:Tabla de madera":10}';
 lotes jsonb:='{"mat:Trozo de madera":300,"mat:Fibra":300,"mat:Papel":300,"mat:Tabla de madera":20}'; r record;
begin
 select e->>'id' into supplier from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='Tala Annesburg';
 if supplier is null then raise exception 'TALA_ANNESBURG_NO_LOCALIZADA';end if;
 select valor into previous from public.datos where clave='cfg:reposicion-herreria';
 if not exists(select 1 from public.hg_discord_bindings where emp_id=previous->>'ownerEmp' and discord_id=previous->>'recipientId') then raise exception 'DESTINATARIO_NO_VERIFICADO';end if;
 insert into public.datos(clave,valor,actualizado) values('cfg:reposicion-tala',jsonb_build_object('enabled',true,'proveedorId',supplier,'ownerEmp',previous->>'ownerEmp','recipientId',previous->>'recipientId','minimos',mins,'modo','lote-por-material','lotes',lotes,'descontarPendientes',true),clock_timestamp())
 on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 for r in select key,value from jsonb_each(mins) loop
  insert into public.stock(producto,cantidad,minimo) values(r.key,0,(r.value)::integer) on conflict(producto) do update set minimo=excluded.minimo;
 end loop;
 insert into public.datos(clave,valor,actualizado) values('stockmin',mins,clock_timestamp()) on conflict(clave) do update set valor=datos.valor||excluded.valor,actualizado=excluded.actualizado;
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','reposicion-tala-20261020'),clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
end $$;
