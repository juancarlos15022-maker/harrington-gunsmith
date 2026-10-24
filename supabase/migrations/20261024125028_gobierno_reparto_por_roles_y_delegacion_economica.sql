insert into public.whitmore_cfg(clave,valor,actualizado) values
 ('delegacion_economia_vice','false',now())
 on conflict(clave) do nothing;
insert into public.whitmore_cfg(clave,valor,actualizado) values
 ('competencia_economia','{"modo":"gobernador","titulares":[],"responsabilidad":"Gobernador"}',now()),
 ('competencia_justicia','{"modo":"direccion_conjunta","titulares":[]}',now()),
 ('competencia_seguridad','{"modo":"direccion_conjunta","titulares":[]}',now()),
 ('competencia_comercio','{"modo":"secretaria_comercio","titulares":[]}',now())
 on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
update public.whitmore_cfg set valor='',actualizado=now() where clave='rol_economia';
update public.gob_sesiones set comprobado=now()-interval '1 day' where revocado is null;
