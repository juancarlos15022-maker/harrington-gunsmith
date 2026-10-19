begin;
do $test$
declare actors jsonb;a jsonb;result jsonb;op text;chiefs int:=0;others int:=0;name text;
begin
select jsonb_agg(x) into actors from(select distinct on(c.uid) c.uid,c.emp_id,u.raw_app_meta_data,s.id session_id,e->>'puesto' puesto,e->>'name' name from public.cuentas c join auth.users u on u.id=c.uid join auth.sessions s on s.user_id=c.uid join public.datos d on d.clave='empleados' cross join lateral jsonb_array_elements(d.valor)e where e->>'id'=c.emp_id and(u.banned_until is null or u.banned_until<now()) order by c.uid,s.created_at desc)x;
for a in select * from jsonb_array_elements(actors) loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',a->>'uid','role','authenticated','session_id',a->>'session_id','app_metadata',a->'raw_app_meta_data')::text,true);
execute 'set local role authenticated';
if a->>'puesto'='Jefe' then
chiefs:=chiefs+1;
foreach op in array array['personal','regalo'] loop
begin
result:=public.entregar_sin_venta(gen_random_uuid()::text,jsonb_build_object('op',op,'client',a->>'name','empId',a->>'emp_id','items',jsonb_build_array(jsonb_build_object('name','Trapo','qty',1,'cents',0)),'sig','TEST-PERMISOS-JEFES'));
if result#>>'{sale,op}'<>op or (result#>>'{sale,totalCents}')::int<>0 or (result#>>'{expense,cents}')::numeric<0 then raise exception 'TEST_ENTREGA_INCORRECTA';end if;
raise exception using errcode='P9001',message='REVERTIR_PRUEBA';
exception when sqlstate 'P9001' then null;
end;
end loop;
else
others:=others+1;
begin
perform public.entregar_sin_venta(gen_random_uuid()::text,jsonb_build_object('op','regalo','client','PRUEBA','empId',a->>'emp_id','items',jsonb_build_array(jsonb_build_object('name','Trapo','qty',1,'cents',0))));
raise exception 'TEST_EMPLEADO_ADMITIDO';
exception when insufficient_privilege then if sqlerrm<>'SOLO_PROPIETARIO' then raise;end if;
end;
end if;
execute 'reset role';
end loop;
if chiefs<2 or others<1 then raise exception 'TEST_COBERTURA_INSUFICIENTE';end if;
end $test$;
rollback;
select 'OK: ambos jefes completan regalo y personal con permisos authenticated; empleado rechazado; pruebas revertidas sin gasto, stock ni mensajes persistentes.' as resultado;