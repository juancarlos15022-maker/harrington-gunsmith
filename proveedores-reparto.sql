-- Destinos de reposición indicados por Dirección.
do $config$
declare mina jsonb; tala jsonb; soberano text; roanoke text; tala_id text;
begin
 perform pg_advisory_xact_lock(214701020,20261020);
 select valor into mina from public.datos where clave='cfg:reposicion-mina' for update;
 select valor into tala from public.datos where clave='cfg:reposicion-tala' for update;
 select e->>'id' into soberano from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='La Casa del Soberano';
 select e->>'id' into roanoke from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='Roanoke Mining Company';
 select e->>'id' into tala_id from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='Tala Annesburg';
 if soberano is null or roanoke is null or tala_id is null or mina is null or tala is null then raise exception 'CONFIGURACION_PROVEEDORES_INCOMPLETA';end if;
 insert into public.datos(clave,valor,actualizado) values('cfg:reposicion-soberano',jsonb_build_object('enabled',true,'proveedorId',soberano,'ownerEmp',mina->>'ownerEmp','recipientId',mina->>'recipientId','modo','lote-por-material','origen','reposicion-soberano','idPrefijo','soberano','prefijo','S','descontarPendientes',true,'minimos',jsonb_build_object('mat:Azufre',coalesce(mina->'minimos'->'mat:Azufre','100'::jsonb),'mat:Sal',coalesce(mina->'minimos'->'mat:Sal','100'::jsonb)),'recomendados',jsonb_build_object('mat:Azufre',600,'mat:Sal',600),'lotes',jsonb_build_object('mat:Azufre',600,'mat:Sal',600)),clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 update public.datos set valor=mina||jsonb_build_object('proveedorId',roanoke,'minimos',(mina->'minimos')-'mat:Azufre'-'mat:Sal','recomendados',coalesce(mina->'recomendados','{}'::jsonb)-'mat:Azufre'-'mat:Sal'),actualizado=clock_timestamp() where clave='cfg:reposicion-mina';
 update public.datos set valor=tala||jsonb_build_object('proveedorId',tala_id),actualizado=clock_timestamp() where clave='cfg:reposicion-tala';
end $config$;
