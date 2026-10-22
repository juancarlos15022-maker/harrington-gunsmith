-- Misma prioridad que la web: encargo fijado > cliente > lista del convenio > tarifa general.
do $m$
declare src text;anchor text:='if cl->''precios'' ? n then';addition text:=$a$if d->>'kind'='convenio' and d->'precios' ? n then c:=round((d->'precios'->>n)::numeric*100);end if;
 $a$;
begin
 src:=pg_get_functiondef('public.hg_venta_canonica(jsonb)'::regprocedure);
 if position(anchor in src)=0 then raise exception 'NO_SE_ENCUENTRA_PRECIO_CLIENTE';end if;
 if position(addition in src)=0 then execute replace(src,anchor,addition||anchor);end if;
end $m$;
