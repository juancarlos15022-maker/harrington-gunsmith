lock table public.datos,public.stock in share row exclusive mode;
do $$
declare supplier text; previous jsonb; mins jsonb:='{"mat:Hierro":100,"mat:Carbón":100,"mat:Sal":100,"mat:Azufre":100,"mat:Piedra":100}'; r record;
begin
 select e->>'id' into supplier from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'name'='Roanoke Mining Company' and e->>'ubic'='Annesburg';
 if supplier is null then raise exception 'MINA_ROANOKE_NO_LOCALIZADA';end if;
 select valor into previous from public.datos where clave='cfg:reposicion-herreria';
 if not exists(select 1 from public.hg_discord_bindings where emp_id=previous->>'ownerEmp' and discord_id=previous->>'recipientId') then raise exception 'DESTINATARIO_NO_VERIFICADO';end if;
 insert into public.datos(clave,valor,actualizado) values('cfg:reposicion-mina',jsonb_build_object('enabled',true,'proveedorId',supplier,'ownerEmp',previous->>'ownerEmp','recipientId',previous->>'recipientId','minimos',mins,'modo','lote-fijo','lote',200,'descontarPendientes',true),clock_timestamp())
 on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 for r in select key,value from jsonb_each(mins) loop
  insert into public.stock(producto,cantidad,minimo) values(r.key,0,100) on conflict(producto) do update set minimo=excluded.minimo;
 end loop;
 insert into public.datos(clave,valor,actualizado) values('stockmin',mins,clock_timestamp()) on conflict(clave) do update set valor=datos.valor||excluded.valor,actualizado=excluded.actualizado;
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','reposicion-mina-20261020'),clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
end $$;
