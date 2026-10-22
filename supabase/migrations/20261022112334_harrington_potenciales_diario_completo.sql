create or replace function public.hg_potencial_preparar() returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e public.hg_potencial_estado;hoy date:=(now() at time zone 'Europe/Madrid')::date;j public.hg_potencial_eventos;begin
 select * into e from public.hg_potencial_estado where id=1 for update;
 -- Captura diferida de pedidos recibidos antes de publicar, tras confirmar su transacción.
 for j in select * from public.hg_potencial_eventos where tipo='pedido' and snapshot='{}' order by id loop
  update public.hg_potencial_eventos set snapshot=hg_interno.potencial_snapshot(coalesce((e.snapshot->>'diario_hasta')::bigint,0)),anterior=e.snapshot where id=j.id;
 end loop;
 if e.ultimo_dia<hoy then
  perform hg_interno.potencial_encolar('dia:'||(hoy-1),'diario',jsonb_build_object('dia',hoy-1,'zona','Europe/Madrid'));
  update public.hg_potencial_eventos set snapshot=snapshot||jsonb_build_object('diario_del_dia',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.hg_potencial_diario d where (d.creado at time zone 'Europe/Madrid')::date=hoy-1)) where clave='dia:'||(hoy-1);
  update public.hg_potencial_estado set ultimo_dia=hoy where id=1;
 elsif e.sucio then perform hg_interno.potencial_encolar('actualizacion:'||e.generacion,'actualizacion');end if;
 return (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from (select * from public.hg_potencial_eventos where enviado is null and (bloqueado_hasta is null or bloqueado_hasta<now()) order by id limit 2) t);
end $$;
