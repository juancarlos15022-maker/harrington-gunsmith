alter table public.gob_difusion drop constraint gob_difusion_destino_check;
alter table public.gob_difusion add constraint gob_difusion_destino_check check(destino in ('area_economia','area_comercio','area_justicia','area_seguridad','area_festejos','festejos_calendario','festejos_presupuestos','festejos_cultura','festejos_programa','registro','actas','seguimiento'));
do $m$ declare src text;anchor text:='rev:=md5(';extra text:=$s$
 if area='festejos' then
  if new.tipo='secretaria' and new.datos->>'clase' in ('evento','cultural','concurso','anuncio') then destinos:=array_append(destinos,'festejos_calendario');end if;
  if new.tipo='secretaria' and new.datos->>'clase' in ('presupuesto','gasto','ingreso') then destinos:=array_append(destinos,'festejos_presupuestos');end if;
  if new.tipo='secretaria' and new.datos->>'clase' in ('cultural','concurso','contacto') then destinos:=array_append(destinos,'festejos_cultura');end if;
  if new.tipo='decreto' and new.estado='firmado' and new.datos->>'clase_expediente'='anuncio' then destinos:=array_append(destinos,'festejos_programa');end if;
 end if;
$s$;
begin
 src:=pg_get_functiondef('public.gob_encolar_difusion()'::regprocedure);
 if position(anchor in src)=0 or position('''justicia'',''seguridad'')' in src)=0 then raise exception 'DIFUSION_NO_LOCALIZADA';end if;
 src:=replace(src,'''justicia'',''seguridad'')','''justicia'',''seguridad'',''festejos'')');
 execute replace(src,anchor,extra||anchor);
end $m$;
insert into public.whitmore_cfg(clave,valor,actualizado) values('competencia_festejos','{"modo":"secretaria_festejos","titulares":[]}',now()) on conflict(clave) do nothing;
