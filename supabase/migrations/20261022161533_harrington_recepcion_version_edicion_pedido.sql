-- Una entrega abierta antes de una edición no puede recibirse con índices o cantidades antiguos.
do $m$
declare src text;anchor text:=' if ped is null or coalesce((ped->>''deleted'')::boolean,false) then';guard text:=$g$
 if ped is not null and coalesce((ped->>'ediciones')::int,0)>0 and current_setting('hg.pedido_edicion',true) is distinct from p_pedido||':'||coalesce(ped->>'ediciones','0') then raise exception 'PEDIDO_CAMBIADO: el pedido fue editado; actualiza y revisa la entrega';end if;
$g$;
begin
 src:=pg_get_functiondef('public.recibir_pedido(text,text,jsonb,text)'::regprocedure);
 if position(anchor in src)=0 then raise exception 'NO_SE_ENCUENTRA_GUARDIA_RECEPCION';end if;
 execute replace(src,anchor,guard||anchor);
end $m$;
create function public.hg_recibir_pedido_editado(p_peticion text,p_pedido text,p_edicion integer,p_lineas jsonb default null,p_por text default null) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA' using errcode='42501';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 perform set_config('hg.pedido_edicion',p_pedido||':'||coalesce(p_edicion,0),true);
 return public.recibir_pedido(p_peticion,p_pedido,p_lineas,p_por);
end $$;
revoke all on function public.hg_recibir_pedido_editado(text,text,integer,jsonb,text) from public,anon;
grant execute on function public.hg_recibir_pedido_editado(text,text,integer,jsonb,text) to authenticated;
