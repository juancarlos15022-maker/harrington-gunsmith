CREATE OR REPLACE FUNCTION public.hg_reponer_mina()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text;
 prop jsonb; pkey text:='';
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(214701020,20261020) then return jsonb_build_object('busy',true);end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='cfg:reposicion-mina';
 if not coalesce((cfg->>'enabled')::boolean,false) then return jsonb_build_object('disabled',true);end if;
 select e into prov from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'id'=cfg->>'proveedorId';
 if prov is null then raise exception 'PROVEEDOR_REPOSICION_NO_EXISTE';end if;
 select b.discord_id into uid from public.hg_discord_bindings b where b.emp_id=cfg->>'ownerEmp';
 if uid is null or uid<>cfg->>'recipientId' then raise exception 'DESTINATARIO_REPOSICION_NO_VERIFICADO';end if;
 prop:=public.hg_reposicion_propuesta('reposicion-mina');
 if prop is not null then pkey:=prop->>'clave';prop:=prop->'valor';end if;
 select valor into limits from public.datos where clave='stockmin';
 for target in select key,value from jsonb_each(cfg->'minimos') order by key loop
  wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);
  if wanted<=0 then continue;end if;
  select coalesce(sum(cantidad),0)::integer into qty from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=target.key;
  if qty>=wanted then continue;end if;
  select coalesce(sum(greatest(0,(i->>'qty')::integer-coalesce((i->>'rq')::integer,0))),0)::integer into incoming
  from public.datos d cross join lateral jsonb_array_elements(d.valor->'items') i
  where starts_with(d.clave,'pedido:') and not coalesce((d.valor->>'received')::boolean,false)
   and not coalesce((d.valor->>'cancelled')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)
   and coalesce((d.valor->>'completedAt')::numeric,0)=0 and public.hg_venta_material(i->>'material',false)=target.key;
  if incoming>0 or qty+incoming>=wanted then continue;end if;wanted:=coalesce((cfg->>'lote')::integer,200);
  select x into product from jsonb_array_elements(prov->'prods') x where public.hg_venta_material(x->>'name',false)=target.key limit 1;
  if product is null or coalesce((product->>'price')::integer,0)<=0 then raise exception 'PRECIO_REPOSICION_NO_CONFIGURADO: %',target.key;end if;
  price:=(product->>'price')::integer;
  items:=items||jsonb_build_array(jsonb_build_object('material',substr(target.key,5),'qty',wanted,'price',price));
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
 id:='mina-'||gen_random_uuid()::text;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-M'||upper(substr(replace(id,'-',''),5,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen','reposicion-mina',
 'propuesta',true,'propVersion',1,'propActualizadaTs',ms);
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Propuesta de pedido para '||(prov->>'name')||E':\n';
 for product in select * from jsonb_array_elements(items) loop texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||E'\n';end loop;
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,config_key,nonce,token) values(id,uid,texto,'cfg:reposicion-mina','rep-'||substr(replace(substr(id,6),'-',''),1,20),public.hg_reposicion_token());
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $function$

