-- Unificación solicitada por el propietario: conserva historial y abono previo.
lock table public.datos,public.stock in share row exclusive mode;
do $$
declare dst jsonb; src jsonb; original jsonb; supplier jsonb; cfg jsonb; item jsonb; price_row jsonb; extra jsonb:='[]';
 added bigint:=0; credited bigint; total bigint; stamp timestamptz:=clock_timestamp(); ms bigint; text_dm text; who text;
begin
 select valor into dst from public.datos where clave like 'pedido:%' and valor->>'code'='PED-191026-2122' and valor->>'proveedor'='Roanoke Mining Company';
 select valor into src from public.datos where clave like 'pedido:%' and valor->>'code'='PED-191026-2123' and valor->>'proveedor'='Mina de Strawberry';
 if dst is null or src is null then raise exception 'PEDIDOS_NO_LOCALIZADOS';end if;
 if coalesce((src->>'cancelled')::boolean,false) and src->>'mergedInto'=dst->>'id' then return;end if;
 if coalesce((dst->>'received')::boolean,false) or coalesce((src->>'received')::boolean,false) or coalesce((dst->>'cancelled')::boolean,false) or coalesce((src->>'cancelled')::boolean,false)
  or coalesce((dst->>'completedAt')::bigint,0)>0 or coalesce((src->>'completedAt')::bigint,0)>0 or coalesce((src->>'paid')::boolean,false)
  or exists(select 1 from jsonb_array_elements((dst->'items')||(src->'items')) i where coalesce((i->>'rq')::int,0)>0)
  then raise exception 'PEDIDOS_HAN_CAMBIADO';end if;
 if (dst->>'totalCents')::bigint<>17000 or jsonb_array_length(dst->'items')<>2 then raise exception 'PEDIDO_ROANOKE_HA_CAMBIADO';end if;
 if jsonb_array_length(src->'items')<>2 or exists(select 1 from jsonb_array_elements(src->'items') i where i->>'material' not in ('Azufre','Sal') or (i->>'qty')::int<>400) then raise exception 'PARTIDAS_HAN_CAMBIADO';end if;
 select valor into cfg from public.datos where clave='cfg:reposicion-mina';
 if not exists(select 1 from public.hg_discord_bindings where emp_id=cfg->>'ownerEmp' and discord_id=cfg->>'recipientId') then raise exception 'DESTINATARIO_NO_VERIFICADO';end if;
 select e->>'name' into who from public.datos d,jsonb_array_elements(d.valor)e where d.clave='empleados' and e->>'id'=cfg->>'ownerEmp';
 select p into supplier from public.datos d,jsonb_array_elements(d.valor)p where d.clave='proveedores' and p->>'id'=dst->>'proveedorId';
 for item in select * from jsonb_array_elements(src->'items') loop
  select p into price_row from jsonb_array_elements(supplier->'prods')p where public.hg_venta_material(p->>'name',false)=public.hg_venta_material(item->>'material',false) limit 1;
  if price_row is null or coalesce((price_row->>'price')::int,0)<=0 then raise exception 'PRECIO_ROANOKE_NO_CONFIGURADO';end if;
  extra:=extra||jsonb_build_array(jsonb_build_object('material',item->>'material','qty',(item->>'qty')::int,'price',(price_row->>'price')::int));
  added:=added+(item->>'qty')::bigint*(price_row->>'price')::bigint;
 end loop;
 original:=dst;credited:=case when coalesce((dst->>'paid')::boolean,false) or coalesce((dst->>'paidInitial')::boolean,false) then (dst->>'totalCents')::bigint else coalesce((dst->>'abonoCents')::bigint,0) end;
 total:=(dst->>'totalCents')::bigint+added;ms:=(extract(epoch from stamp)*1000)::bigint;
 dst:=dst||jsonb_build_object('items',(dst->'items')||extra,'totalCents',total,'abonoCents',credited,'paid',credited>=total,'paidInitial',false,'paidAt',0,'paidBy','',
 'ampliacion',jsonb_build_object('sourcePedido',src->>'id','sourceCode',src->>'code','ts',ms,'by',who,'items',extra,'addedCents',added,'previousTotalCents',original->'totalCents','previousPaid',original->'paid','previousPaidAt',original->'paidAt','previousPaidBy',original->'paidBy'));
 src:=src||jsonb_build_object('cancelled',true,'cancelledAt',ms,'cancelledBy',who,'mergedInto',dst->>'id','cancelReason','Trasladado al pedido '||(dst->>'code')||' de Roanoke por indicación del propietario',
 'liquidacion',jsonb_build_object('orderedCents',(src->>'totalCents')::bigint,'receivedCents',0,'cancelledCents',(src->>'totalCents')::bigint,'paidCents',0,'payableCents',0,'refundDueCents',0,'by',who,'ts',ms));
 update public.datos set valor=dst,actualizado=stamp where clave='pedido:'||(dst->>'id');
 update public.datos set valor=src,actualizado=stamp where clave='pedido:'||(src->>'id');
 insert into public.datos(clave,valor,actualizado) values('act:unificar-minas-'||(src->>'id'),jsonb_build_object('id','unificar-minas-'||(src->>'id'),'ts',ms,'tipo','unificacion-pedidos','who',who,'data',jsonb_build_object('source',src->>'code','destination',dst->>'code','items',extra,'addedCents',added,'creditCents',credited,'originalDestination',original)),stamp);
 text_dm:='A Roanoke Mining Company · Telegrama '||(supplier->>'tel')||E'\n\nSobre nuestro pedido '||(dst->>'code')||E', que está pendiente de entrega, rogamos añadir:\n\n';
 for item in select * from jsonb_array_elements(extra) loop text_dm:=text_dm||'• '||(item->>'qty')||' × '||(item->>'material')||' a $'||to_char((item->>'price')::numeric/100,'FM999999990.00')||E'\n';end loop;
 text_dm:=text_dm||E'\nImporte de la ampliación: $'||to_char(added::numeric/100,'FM999999990.00')||E'.\nEl pedido queda en 250 de mena de hierro, 450 de mena de carbón, 400 de azufre y 400 de sal.'||E'\nTotal actualizado: $'||to_char(total::numeric/100,'FM999999990.00')||'. Ya abonado: $'||to_char(credited::numeric/100,'FM999999990.00')||'. Pendiente: $'||to_char((total-credited)::numeric/100,'FM999999990.00')||E'.\nNo es un segundo pedido: es una ampliación del ya existente.\n\nAtentamente, Vincent Harrington · Telegrama SD8112';
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,config_key,nonce) values(dst->>'id',cfg->>'recipientId',text_dm,'cfg:reposicion-mina','amp-'||substr(md5((dst->>'id')||(src->>'id')),1,20));
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','unificar-minas-'||(src->>'id')),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
end $$;
