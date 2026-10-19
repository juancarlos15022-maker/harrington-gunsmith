begin;
do $test$
declare actor record;claims jsonb;v jsonb;answer jsonb;product record;checks int:=0;chiefs int:=0;staff int:=0;amount bigint;cut int;
begin
select b.nombre,coalesce(round((p.valor->>b.nombre)::numeric*100),b.precio)::bigint cents into product from public.bot_catalogo b left join public.datos p on p.clave='precios' where coalesce(round((p.valor->>b.nombre)::numeric*100),b.precio)>0 order by b.precio desc limit 1;
if product.nombre is null then raise exception 'TEST_SIN_PRODUCTO';end if;
amount:=product.cents*10;
for actor in select distinct on (c.uid) c.uid,c.emp_id,u.raw_app_meta_data,s.id session_id,e->>'puesto' puesto from public.cuentas c join auth.users u on u.id=c.uid join auth.sessions s on s.user_id=c.uid join public.datos d on d.clave='empleados' cross join lateral jsonb_array_elements(d.valor) e where e->>'id'=c.emp_id and (u.banned_until is null or u.banned_until<now()) order by c.uid,s.created_at desc loop
claims:=jsonb_build_object('sub',actor.uid,'role','authenticated','session_id',actor.session_id,'app_metadata',actor.raw_app_meta_data);
perform set_config('request.jwt.claims',claims::text,true);
if not public.hg_permitido() then raise exception 'TEST_SESION_INVALIDA';end if;
v:=jsonb_build_object('op','venta','client','PRUEBA-DESCUENTO-'||gen_random_uuid(),'clientType','particular','items',jsonb_build_array(jsonb_build_object('name',product.nombre,'qty',10,'cents',product.cents)),'totalCents',amount,'dueCents',amount);
answer:=public.hg_venta_canonica(v);if (answer->>'totalCents')::bigint<>amount then raise exception 'TEST_NORMAL';end if;checks:=checks+1;
if actor.puesto='Jefe' then
chiefs:=chiefs+1;
foreach cut in array array[300,400,350] loop
answer:=public.hg_venta_canonica(v||jsonb_build_object('manualDiscountCents',cut,'totalCents',amount-cut,'dueCents',amount-cut,'manualDiscountBy','falso'));
if (answer->>'totalCents')::bigint<>amount-cut or (answer->>'manualDiscountCents')::int<>cut or answer->>'manualDiscountBy'<>actor.emp_id or answer#>>'{discounts,0,label}'<>'Descuento manual' then raise exception 'TEST_DESCUENTO';end if;checks:=checks+1;
end loop;
begin perform public.hg_venta_canonica(v||jsonb_build_object('manualDiscountCents',amount+1));raise exception 'TEST_LIMITE_NO_RECHAZADO';exception when others then if sqlerrm<>'DESCUENTO_MANUAL_SUPERA_TOTAL' then raise;end if;end;checks:=checks+1;
begin perform public.hg_venta_canonica(v||jsonb_build_object('manualDiscountCents',300));raise exception 'TEST_TOTAL_NO_RECHAZADO';exception when others then if sqlerrm<>'TOTAL_CAMBIADO' then raise;end if;end;checks:=checks+1;
else
staff:=staff+1;
begin perform public.hg_venta_canonica(v||jsonb_build_object('manualDiscountCents',300,'totalCents',amount-300,'dueCents',amount-300));raise exception 'TEST_PERMISOS_NO_RECHAZADO';exception when others then if sqlerrm<>'DESCUENTO_MANUAL_SOLO_JEFES' then raise;end if;end;checks:=checks+1;
end if;
begin perform public.hg_venta_canonica(v||jsonb_build_object('manualDiscountCents',-1));raise exception 'TEST_NEGATIVO_NO_RECHAZADO';exception when others then if sqlerrm<>'DESCUENTO_MANUAL_INVALIDO' then raise;end if;end;checks:=checks+1;
end loop;
if chiefs<2 or staff<1 or checks<17 then raise exception 'TEST_COBERTURA_INSUFICIENTE: %',checks;end if;
end $test$;
rollback;
select 'OK: dos cuentas de jefe admiten 3, 4 y 3.50 dólares; empleado rechazado; límites, negativos, total y autor validados. Sin ventas ni movimientos creados.' as resultado;