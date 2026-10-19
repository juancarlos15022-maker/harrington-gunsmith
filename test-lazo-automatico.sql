begin;
do $$
declare u record; r jsonb; replay jsonb; a int;b int;blocked boolean;
begin
 select a.id,a.raw_app_meta_data,s.id as sid into u from auth.users a join public.cuentas c on c.uid=a.id join auth.sessions s on s.user_id=a.id join public.datos d on d.clave='empleados' cross join lateral jsonb_array_elements(d.valor) e where e->>'id'=c.emp_id and e->>'name'='Chester Harrington' order by s.created_at desc limit 1;
 if u.id is null then raise exception 'NO_SESSION';end if;
 update datos set valor=jsonb_set(valor,'{asig}','{}') where clave='npc:estado';
 update stock set cantidad=case producto when 'Lazo' then 0 when 'Lazo Reforzado' then 0 when 'mat:Fibra' then 20 when 'mat:Hierro' then 1 end where producto in ('Lazo','Lazo Reforzado','mat:Fibra','mat:Hierro');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'role','authenticated','session_id',u.sid,'app_metadata',u.raw_app_meta_data)::text,true);
 execute 'set local role authenticated';
 r:=hg_fabricar_con_polvora('test-rope-20261019-zero-base','[{"producto":"Lazo Reforzado","delta":1}]');
 if (r->'used'->>'mat:Fibra')::int<>20 or (r->'used'->>'mat:Hierro')::int<>1 or (r->'stock'->>'Lazo')::int<>0 or (r->'stock'->>'Lazo Reforzado')::int<>1 then raise exception 'BAD_TOTAL';end if;
 replay:=hg_fabricar_con_polvora('test-rope-20261019-zero-base','[{"producto":"Lazo Reforzado","delta":1}]');
 if replay->>'replayed'<>'true' or replay->'stock' is distinct from r->'stock' then raise exception 'BAD_RETRY';end if;
 if exists(select 1 from datos where clave like 'fablote:pol-test-rope-20261019-zero-base-%' and valor->>'prod'='Lazo') then raise exception 'INTERMEDIATE_LOT';end if;
 blocked:=false;
 begin perform hg_fabricar_con_polvora('test-rope-20261019-insufficient','[{"producto":"Lazo Reforzado","delta":1}]');exception when others then if sqlerrm like '%FALTAN_MATERIALES%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'MISSING_NOT_BLOCKED';end if;
 execute 'reset role';
 update stock set cantidad=case producto when 'Lazo' then 1 when 'mat:Fibra' then 10 when 'mat:Hierro' then 1 else cantidad end where producto in ('Lazo','mat:Fibra','mat:Hierro');
 execute 'set local role authenticated';
 r:=hg_fabricar_con_polvora('test-rope-20261019-existing-base','[{"producto":"Lazo Reforzado","delta":1}]');
 if (r->>'autoRope')::int<>0 or (r->'used'->>'mat:Fibra')::int<>10 or (r->'stock'->>'Lazo')::int<>0 then raise exception 'BAD_EXISTING';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: consumo atómico, reutilización de lazo, falta de materiales y reintento sin duplicar' as resultado;