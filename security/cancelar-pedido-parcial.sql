-- Cancelación del resto pendiente: no modifica stock, entregas ni precios originales.
create or replace function public.cancelar_pedido(p_peticion text,p_pedido text,p_recibido_pagado boolean,p_esperado jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare ped jsonb; previo jsonb; ctx jsonb; emp text; nom text; it jsonb; g jsonb; liquid jsonb; conservadas jsonb:='[]'; originales jsonb; unidades bigint:=0;
 pagado bigint:=0;
 records jsonb:='[]'; total bigint:=0; recibido bigint:=0; q bigint; rq bigint; precio bigint;
 stamp timestamptz:=clock_timestamp(); ms bigint; dia int; fecha text; hora text;
begin
 if auth.uid() is null or not public.hg_es_jefe() then raise exception 'SOLO_DIRECCION' using errcode='42501'; end if;
 if p_peticion is null or p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' or p_pedido is null or p_pedido !~ '^[A-Za-z0-9_-]{1,60}$' then raise exception 'PETICION_INVALIDA'; end if;
 if p_recibido_pagado is null then raise exception 'PAGO_INVALIDO'; end if;
 -- La recepción usa el mismo bloqueo: la entrega y la cancelación no pueden pisarse.
 lock table public.datos in share row exclusive mode;
 select valor into ped from public.datos where clave='pedido:'||p_pedido;
 if ped is null or coalesce((ped->>'deleted')::boolean,false) then raise exception 'PEDIDO_NO_EXISTE'; end if;
 if coalesce((ped->>'cancelled')::boolean,false) or coalesce((ped->>'remainderCancelled')::boolean,false) then
  if ped ? 'liquidacion' then
   select valor into g from public.datos where clave='gasto:gp'||p_pedido;
   records:=jsonb_build_array(jsonb_build_object('clave','pedido:'||p_pedido,'valor',ped));
   if g is not null then records:=records||jsonb_build_array(jsonb_build_object('clave','gasto:gp'||p_pedido,'valor',g)); end if;
   return jsonb_build_object('replayed',true,'pedido',ped,'records',records);
  end if;
  raise exception 'PEDIDO_CANCELADO';
 end if;
 if coalesce((ped->>'completedAt')::bigint,0)>0 then raise exception 'PEDIDO_CERRADO'; end if;
 if p_esperado is distinct from ped then raise exception 'PEDIDO_CAMBIADO'; end if;
 if jsonb_typeof(ped->'items') is distinct from 'array' or jsonb_array_length(ped->'items')=0 then raise exception 'PEDIDO_INVALIDO'; end if;
 for it in select * from jsonb_array_elements(ped->'items') loop
  if coalesce(it->>'qty','')!~'^[0-9]+$' or coalesce(it->>'price','')!~'^[0-9]+$' or coalesce(it->>'rq','0')!~'^[0-9]+$' then raise exception 'PEDIDO_INVALIDO'; end if;
  q:=(it->>'qty')::bigint; precio:=(it->>'price')::bigint;
  rq:=case when coalesce((ped->>'received')::boolean,false) then q else coalesce((it->>'rq')::bigint,0) end;
  if rq>q then raise exception 'PEDIDO_INVALIDO'; end if;
  total:=total+q*precio;recibido:=recibido+rq*precio;unidades:=unidades+rq;
  if rq>0 then conservadas:=conservadas||jsonb_build_array(it||jsonb_build_object('qty',rq,'rq',rq));end if;
 end loop;
 if total<>coalesce((ped->>'totalCents')::bigint,0) then raise exception 'TOTAL_PEDIDO_INVALIDO'; end if;
 if coalesce((ped->>'paid')::boolean,false) or coalesce((ped->>'paidInitial')::boolean,false) then
  if recibido>0 and not p_recibido_pagado then raise exception 'PAGO_YA_CONFIRMADO'; end if;
  pagado:=total;
 else pagado:=case when p_recibido_pagado then recibido else 0 end; end if;
 select valor into previo from public.datos where clave='gasto:gp'||p_pedido;
 if previo is not null and (coalesce((previo->>'deleted')::boolean,false) or coalesce((previo->>'cents')::bigint,0)>pagado) then raise exception 'GASTO_PEDIDO_REVISAR'; end if;
 ctx:=hg_sync_private.contexto_lectura();emp:=ctx->>'emp';nom:=ctx->>'nombre';
 if coalesce(nom,'')='' then raise exception 'EMPLEADO_INVALIDO'; end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;dia:=(stamp at time zone 'Europe/Madrid')::date-date '1970-01-01';
 fecha:=to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY');hora:=to_char(stamp at time zone 'Europe/Madrid','HH24:MI');
 liquid:=jsonb_build_object('peticion',p_peticion,'orderedCents',total,'receivedCents',recibido,'cancelledCents',total-recibido,'paidCents',pagado,
  'refundDueCents',greatest(0,pagado-recibido),'payableCents',greatest(0,recibido-pagado),'by',nom,'ts',ms);
 originales:=ped->'items';
 if unidades>0 then
  ped:=ped||jsonb_build_object('remainderCancelled',true,'remainderCancelledAt',ms,'cancelledBy',nom,'liquidacion',liquid,'originalItems',originales,'originalTotalCents',total,'items',conservadas,'totalCents',recibido,'received',true,'receivedBy',coalesce(nullif(ped->>'receivedBy',''),nom),'receivedAt',coalesce(nullif(ped->>'receivedAt','0')::bigint,ms),'matIn',true,'paid',p_recibido_pagado,'paidBy',case when p_recibido_pagado then nom else '' end,'paidAt',case when p_recibido_pagado then ms else 0 end,'cancelled',false,'completedAt',case when p_recibido_pagado then ms else 0 end);
 else
  ped:=ped||jsonb_build_object('cancelled',true,'cancelledAt',ms,'cancelledBy',nom,'liquidacion',liquid);
 end if;
 if pagado>0 then
  g:=coalesce(previo,jsonb_build_object('id','gp'||p_pedido,'day',dia,'date',fecha,'time',hora))||jsonb_build_object('cat','proveedor','concepto','Pedido '||(ped->>'code')||' · '||coalesce(ped->>'proveedor','')||' · cancelado: pago efectivo','cents',pagado,'pedido',p_pedido,'liquidacion',liquid);
  insert into public.datos(clave,valor,actualizado) values('gasto:gp'||p_pedido,g,stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
  records:=records||jsonb_build_array(jsonb_build_object('clave','gasto:gp'||p_pedido,'valor',g));
 end if;
 update public.datos set valor=ped,actualizado=stamp where clave='pedido:'||p_pedido;
 records:=records||jsonb_build_array(jsonb_build_object('clave','pedido:'||p_pedido,'valor',ped));
 g:=jsonb_build_object('id','cancel-pedido-'||p_pedido,'ts',ms,'who',nom,'empId',emp,'tipo','cancelacion-pedido','data',liquid||jsonb_build_object('pedido',ped->>'code'));
 insert into public.datos(clave,valor,actualizado) values('act:cancel-pedido-'||p_pedido,g,stamp);
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:cancel-pedido-'||p_pedido,'valor',g));
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','cancel-pedido-'||p_peticion),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('replayed',false,'pedido',ped,'records',records);
end $$;
revoke all on function public.cancelar_pedido(text,text,boolean,jsonb) from public,anon;
grant execute on function public.cancelar_pedido(text,text,boolean,jsonb) to authenticated;
