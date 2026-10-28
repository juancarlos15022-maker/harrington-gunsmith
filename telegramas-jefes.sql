do $patch$
declare src text;
begin
 select pg_get_functiondef('public.hg_reposicion_aceptar(text)'::regprocedure) into src;
 if position('aceptadoTelegram' in src)=0 then
 src:=replace(src,'quien text; ms bigint;','quien text; jefe jsonb; ms bigint;');
 src:=replace(src,'select e->>''name'' into quien from','select e into jefe from');
 src:=replace(src,'quien:=coalesce(quien,''Vincent Harrington'');','quien:=coalesce(jefe->>''name'',''Vincent Harrington'');');
 src:=replace(src,'''aceptadoPor'',quien)', '''aceptadoPor'',quien,''aceptadoEmp'',jefe->>''id'',''aceptadoTelegram'',coalesce(jefe->>''telegram'',''''))');
 if position('aceptadoTelegram' in src)=0 then raise exception 'PATCH_NO_APLICADO'; end if;
 execute src;
 end if;
end $patch$;
