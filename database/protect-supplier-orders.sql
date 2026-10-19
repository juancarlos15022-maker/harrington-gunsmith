
create or replace function public.hg_proteger_pedido() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if (case when tg_op='DELETE' then old.clave else new.clave end) not like 'pedido:%' then if tg_op='DELETE' then return old;else return new;end if;end if;
 if public.hg_servidor() then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op='DELETE' then raise exception 'PEDIDO_NO_BORRAR: usa la cancelación del pedido para conservar su historial' using errcode='42501';end if;
 if coalesce((new.valor->>'deleted')::boolean,false) then raise exception 'PEDIDO_NO_BORRAR' using errcode='42501';end if;
 if tg_op='UPDATE' and new.clave<>old.clave then raise exception 'CLAVE_INMUTABLE';end if;
 if coalesce((new.valor->>'completedAt')::bigint,0)>0 and (not coalesce((new.valor->>'received')::boolean,false) or not coalesce((new.valor->>'paid')::boolean,false)) then raise exception 'PEDIDO_CIERRE_SIN_RECEPCION_O_PAGO';end if;
 if coalesce((new.valor->>'received')::boolean,false) and not exists(select 1 from public.datos d where d.clave='recibido-'||substr(new.clave,8)) then
  -- Cancelar el resto de una recepción parcial conserva únicamente lo recibido.
  if not coalesce((new.valor->>'remainderCancelled')::boolean,false) or not (new.valor ? 'liquidacion') or exists(select 1 from jsonb_array_elements(new.valor->'items') i where coalesce((i->>'rq')::int,0)<>(i->>'qty')::int) then raise exception 'PEDIDO_RECEPCION_NO_REGISTRADA';end if;
 end if;
 return new;
end $$;
revoke all on function public.hg_proteger_pedido() from public;
create trigger hg_pedido_integridad before insert or update or delete on public.datos for each row execute function public.hg_proteger_pedido();
