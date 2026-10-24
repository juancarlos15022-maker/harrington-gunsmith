alter table public.gob_difusion drop constraint gob_difusion_destino_check;
alter table public.gob_difusion add constraint gob_difusion_destino_check check(destino in ('area_economia','area_comercio','area_justicia','area_seguridad','area_festejos','festejos_calendario','festejos_presupuestos','festejos_cultura','festejos_programa','registro','actas','seguimiento','comercio_licencias','comercio_explotaciones','comercio_empresas','comercio_seguimiento'));
do $m$ declare src text;anchor text:='rev:=md5(';extra text:=$x$
 if area='comercio' and new.tipo in ('secretaria','decreto') then
  if coalesce(new.datos->>'clase_expediente',new.datos->>'clase') in ('licencia','ambulante','renovacion','revocacion','explotacion') then destinos:=array_append(destinos,'comercio_licencias');end if;
  if coalesce(new.datos->>'clase_expediente',new.datos->>'clase') in ('mina','granja','rancho','tierras','explotacion') then destinos:=array_append(destinos,'comercio_explotaciones');end if;
  if new.datos->>'clase'='negocio' then destinos:=array_append(destinos,'comercio_empresas');end if;
  if new.datos->>'clase' in ('inspeccion','abastecimiento','revocacion','renovacion') then destinos:=array_append(destinos,'comercio_seguimiento');end if;
 end if;
 if new.tipo='hci_padron' and new.datos->>'tipo'='empresa' then destinos:=array_append(destinos,'comercio_empresas');end if;
$x$;begin src:=pg_get_functiondef('public.gob_encolar_difusion()'::regprocedure);if position(anchor in src)=0 then raise exception 'NO_SE_ENCUENTRA_DIFUSION';end if;execute replace(src,anchor,extra||anchor);end $m$;
