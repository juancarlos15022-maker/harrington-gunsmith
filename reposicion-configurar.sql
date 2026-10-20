-- Ejecutar una sola vez tras verificar la función de reposición.
lock table public.datos,public.stock in share row exclusive mode;
do $$
declare r record; n integer; old_total bigint; cfg jsonb; mins jsonb:='{}'; supplier text; emp text; recipient text; family text;
begin
 select sum(cantidad) into old_total from public.stock;
 for r in select * from public.stock where producto like 'mat:Cañón de %' order by producto loop
  insert into public.stock(producto,cantidad,minimo) values(replace(r.producto,'Cañón de ','Cañon de '),r.cantidad,r.minimo)
  on conflict(producto) do update set cantidad=stock.cantidad+excluded.cantidad,minimo=greatest(stock.minimo,excluded.minimo);
  delete from public.stock where producto=r.producto;
 end loop;
 if (select sum(cantidad) from public.stock) is distinct from old_total then raise exception 'STOCK_CAMBIADO_EN_NORMALIZACION';end if;
 update public.datos set valor=replace(valor::text,'Cañón de ','Cañon de ')::jsonb,actualizado=clock_timestamp() where clave in ('recetas','proveedores','stockmin') and valor::text like '%Cañón de %';
 for family in select unnest(array['rifle','repetidora','escopeta','pistola','revólver']) loop
  mins:=mins||jsonb_build_object('mat:Cañon de '||family,10,'mat:Culata de '||family,10);
 end loop;
 mins:=mins||'{"mat:Tornillo":400,"mat:Pieza de arma":60,"mat:Pieza de arma especial":20,"mat:Barra de hierro":10}'::jsonb;
 for r in select key,value from jsonb_each(mins) loop
  insert into public.stock(producto,cantidad,minimo) values(r.key,0,r.value::integer) on conflict(producto) do update set minimo=excluded.minimo;
 end loop;
 insert into public.datos(clave,valor,actualizado) values('stockmin',mins,clock_timestamp()) on conflict(clave) do update set valor=datos.valor||excluded.valor,actualizado=excluded.actualizado;
 select e->>'id' into supplier from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'tel'='SD3214' and e->>'name'='Herrería de Saint Denis';
 if supplier is null then raise exception 'HERRERIA_NO_LOCALIZADA';end if;
 select b.emp_id,b.discord_id into emp,recipient from public.hg_discord_bindings b join public.bot_cfg c on c.clave='telegramas_autor' and c.valor=b.discord_id;
 if emp is null then raise exception 'PROPIETARIO_NO_VERIFICADO';end if;
 cfg:=jsonb_build_object('enabled',true,'proveedorId',supplier,'ownerEmp',emp,'recipientId',recipient,'minimos',mins,'modo','hasta-minimo','descontarPendientes',true);
 insert into public.datos(clave,valor,actualizado) values('cfg:reposicion-herreria',cfg,clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','canones-reposicion-20261020'),clock_timestamp()) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
end $$;

create or replace function public.hg_normalizar_canones_cfg() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.clave in ('recetas','proveedores','stockmin') then
  new.valor:=regexp_replace(new.valor::text,'([Cc]añ[óo]n|[Cc]anon) de (rifle|pistola|repetidora|revólver|revolver|escopeta)','Cañon de \2','g')::jsonb;
 end if;return new;
end $$;
revoke all on function public.hg_normalizar_canones_cfg() from public,anon,authenticated;
drop trigger if exists hg_normalizar_canones_cfg on public.datos;
create trigger hg_normalizar_canones_cfg before insert or update on public.datos for each row when(new.clave in ('recetas','proveedores','stockmin')) execute function public.hg_normalizar_canones_cfg();
