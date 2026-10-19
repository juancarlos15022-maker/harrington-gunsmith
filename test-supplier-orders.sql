begin;
do $$
declare u record; ped jsonb; blocked boolean;
begin
 select a.id,a.raw_app_meta_data,s.id as sid into u from auth.users a join public.cuentas c on c.uid=a.id join auth.sessions s on s.user_id=a.id join public.datos d on d.clave='empleados' cross join lateral jsonb_array_elements(d.valor) e where e->>'id'=c.emp_id and e->>'name'='Chester Harrington' order by s.created_at desc limit 1;
 if u.id is null then raise exception 'NO_SESSION';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','session_id',u.sid,'app_metadata',u.raw_app_meta_data)::text,true);
 execute 'set local role authenticated';
 if not hg_es_jefe() then raise exception 'NOT_CHIEF';end if;
 select valor into ped from datos where clave='pedido:recuperado-191026-2205';
 blocked:=false;
 begin delete from datos where clave='pedido:recuperado-191026-2205';exception when others then if sqlerrm like '%PROTEGIDO%' or sqlerrm like '%PEDIDO_NO_BORRAR%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'DELETE_NOT_BLOCKED';end if;
 blocked:=false;
 begin update datos set valor='{"deleted":true}' where clave='pedido:recuperado-191026-2205';exception when others then if sqlerrm like '%PEDIDO_NO_BORRAR%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'TOMBSTONE_NOT_BLOCKED';end if;
 blocked:=false;
 begin update datos set valor=ped||'{"received":false}' where clave='pedido:recuperado-191026-2205';exception when others then if sqlerrm like '%PEDIDO_CIERRE_SIN_RECEPCION%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'INVALID_CLOSE_NOT_BLOCKED';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: Chester no puede borrar, ocultar ni cerrar sin recepción' as resultado;