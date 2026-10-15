begin;
grant usage on schema hg_security to service_role;
create table public.hg_security_config(id int primary key check(id=1), owner_uid uuid not null, owner_emp text not null, owner_discord text not null);
alter table public.hg_security_config enable row level security;
revoke all on public.hg_security_config from public,anon,authenticated;
grant all on public.hg_security_config to service_role;
insert into public.hg_security_config values(1,'98922f71-13a4-4623-bba1-33288ccdefa3','emuzvkc99z8q','1398183011232518164');
create table public.hg_security_credentials(emp_id text primary key, hash text not null, salt text not null, iterations int not null, changed_at timestamptz not null default now());
create table public.hg_security_invitations(emp_id text primary key, hash text not null, expires_at timestamptz not null);
create table public.hg_security_limits(key text primary key, window_start timestamptz not null, attempts int not null);
create table hg_security.audit(id bigint generated always as identity primary key, ts timestamptz not null default now(), actor uuid, empleado text, tabla text not null, operacion text not null, clave text, anterior jsonb, nuevo jsonb);
alter table public.hg_security_credentials enable row level security;
alter table public.hg_security_invitations enable row level security;
alter table public.hg_security_limits enable row level security;
alter table hg_security.audit enable row level security;
revoke all on public.hg_security_credentials,public.hg_security_invitations,public.hg_security_limits,hg_security.audit from public,anon,authenticated;
grant all on public.hg_security_credentials,public.hg_security_invitations,public.hg_security_limits,hg_security.audit to service_role;
create or replace function public.hg_claims() returns jsonb language sql stable set search_path=pg_catalog as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
create or replace function public.hg_servidor() returns boolean language sql stable set search_path=pg_catalog,public as $$
select coalesce(public.hg_claims()->>'role'='service_role',false) or (public.hg_claims() is null and session_user in ('postgres','supabase_admin')) $$;
create or replace function public.hg_empleado_ok(p_jefe boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
select exists(select 1 from public.cuentas c join auth.users u on u.id=c.uid
 join public.datos d on d.clave='empleados' cross join lateral jsonb_array_elements(d.valor) e
 where c.uid=auth.uid() and e->>'id'=c.emp_id and u.raw_app_meta_data->>'emp_id'=c.emp_id
 and public.hg_claims()->'app_metadata'->>'emp_id'=c.emp_id
 and (u.banned_until is null or u.banned_until<now())
 and exists(select 1 from auth.sessions s where s.user_id=c.uid and s.id::text=public.hg_claims()->>'session_id')
 and (not p_jefe or c.uid=(select owner_uid from public.hg_security_config where id=1))) $$;
create or replace function public.hg_permitido() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.hg_servidor() or public.hg_empleado_ok(false) $$;
create or replace function public.hg_es_jefe() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$ select public.hg_servidor() or public.hg_empleado_ok(true) $$;
create or replace function public.hg_cerrado() returns boolean language sql stable set search_path=pg_catalog as $$ select true $$;
create or replace function public.hg_contexto() returns boolean language sql stable set search_path=pg_catalog,public as $$ select public.hg_permitido() and coalesce(current_setting('hg.operacion',true),'') in ('venta','fabricacion','inventario','npc') $$;
-- El API de acceso devuelve exclusivamente los campos necesarios para las tarjetas.
create or replace function public.hg_puerta() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare es_owner boolean:=public.hg_es_jefe(); valido boolean:=public.hg_permitido(); emps jsonb;dc jsonb;stamp timestamptz;
begin
select actualizado into stamp from public.datos where clave='empleados';
select coalesce(jsonb_agg(case when es_owner then e else jsonb_build_object('id',e->>'id','name',e->>'name','puesto',e->>'puesto') end),'[]') into emps from public.datos d cross join lateral jsonb_array_elements(d.valor) e where clave='empleados';
if valido then
 select valor into dc from public.datos where clave='discord';
 if not es_owner and dc is not null then
 dc:=jsonb_build_object('url',case when coalesce(dc->>'url','')<>'' then regexp_replace(dc->>'url','(/webhooks/[0-9]+/)[^/?]+','\1PROTEGIDO') else '' end,'urls',coalesce((select jsonb_object_agg(key,regexp_replace(value,'(/webhooks/[0-9]+/)[^/?]+','\1PROTEGIDO')) from jsonb_each_text(coalesce(dc->'urls','{}'))),'{}'::jsonb),'ev',dc->'ev','refs',dc->'refs');
 end if;
end if;
return jsonb_build_array(jsonb_build_object('clave','empleados','valor',emps,'actualizado',coalesce(stamp,now())),jsonb_build_object('clave','acceso','valor',jsonb_build_object('cerrado',true),'actualizado',coalesce(stamp,now()))) || case when dc is not null then jsonb_build_array(jsonb_build_object('clave','discord','valor',dc,'actualizado',(select actualizado from public.datos where clave='discord'))) else '[]'::jsonb end;
end $$;
create or replace function public.hg_login_attempt(p_key text) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n int; begin
insert into public.hg_security_limits(key,window_start,attempts) values(p_key,now(),1)
on conflict(key) do update set attempts=case when hg_security_limits.window_start<now()-interval '15 minutes' then 1 else hg_security_limits.attempts+1 end,window_start=case when hg_security_limits.window_start<now()-interval '15 minutes' then now() else hg_security_limits.window_start end returning attempts into n;
return n<=30;
end $$;
-- Lectura interna para empleados activos. Secretos y administración solo al propietario.
create or replace function public.hg_dato_lectura(k text) returns boolean language sql stable set search_path=pg_catalog,public as $$
select public.hg_es_jefe() or (public.hg_permitido() and k not in ('jefe','discord') and k not like 'clave-%' and k not like 'security:%') or k='acceso' or k like 'foto-%' $$;
create or replace function public.hg_dato_escritura(k text,v jsonb) returns boolean language sql stable set search_path=pg_catalog,public as $$
select public.hg_es_jefe() or (public.hg_contexto() and (k='npc:estado' or k='rev' or split_part(k,':',1) in ('venta','autoventa','fablote','act','mov','invc','npcop','npcrev')))
or (public.hg_permitido() and (not coalesce((v->>'deleted')::boolean,false) or k like 'fichaje:%') and (
k in ('rev','clientes','agenda') or split_part(k,':',1) in ('venta','encargo','turno','fichaje','ausencia','log','act','mov','fablote','dcerr','nota') or k like 'presencia-%' or k like 'fab-%')) $$;
create or replace function public.hg_guardar_seguro() returns trigger language plpgsql security definer set search_path=pg_catalog,public,hg_security as $$
declare k text;v jsonb;oldj jsonb;newj jsonb;emp text:=public.hg_claims()->'app_metadata'->>'emp_id';nom text;activo jsonb;own boolean:=public.hg_es_jefe(); begin
oldj:=case when tg_op<>'INSERT' then to_jsonb(old) end;newj:=case when tg_op<>'DELETE' then to_jsonb(new) end;
k:=coalesce(newj->>'clave',oldj->>'clave',newj->>'producto',oldj->>'producto',newj->>'id',oldj->>'id');
if not own then
 if not public.hg_permitido() then raise exception 'SIN_CUENTA' using errcode='42501';end if;
 if tg_table_name='stock' or tg_table_name='contador' then
  if not public.hg_contexto() then raise exception 'OPERACION_SERVIDOR_OBLIGATORIA' using errcode='42501';end if;
 elsif tg_table_name='datos' then
  if tg_op='DELETE' then
   if k not like 'presencia-%' and k not like 'fab-%' then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if;
  else
   v:=new.valor;
   select e->>'name' into nom from public.datos d cross join lateral jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
   if not public.hg_dato_escritura(k,v) then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if;
   if tg_op='UPDATE' and new.clave<>old.clave then raise exception 'CLAVE_INMUTABLE';end if;
   if (v ? 'empId' and nullif(v->>'empId','') is not null and v->>'empId'<>emp) then raise exception 'EMPLEADO_INVALIDO';end if;
   if k like 'fichaje:%' then
    if k<>'fichaje:'||emp then raise exception 'EMPLEADO_INVALIDO';end if;
    select valor into activo from public.datos where clave=k;
    if coalesce((v->>'deleted')::boolean,false) then
     if coalesce((activo->>'deleted')::boolean,false) then new.valor:=activo;return new;end if;
     if activo->>'empId' is distinct from emp then raise exception 'FICHAJE_NO_ABIERTO';end if;
    else
     if v->>'empId' is distinct from emp or v->>'name' is distinct from nom then raise exception 'EMPLEADO_INVALIDO';end if;
     if coalesce(v->>'start','')!~'^[0-9]+$' then raise exception 'HORA_FICHAJE_INVALIDA';end if;
     if activo is null or coalesce((activo->>'deleted')::boolean,false) then
      if abs((extract(epoch from now())*1000)-(v->>'start')::numeric)>60000 then raise exception 'HORA_FICHAJE_INVALIDA';end if;
     elsif v->'start' is distinct from activo->'start' then raise exception 'FICHAJE_INMUTABLE';end if;
    end if;
   elsif k like 'turno:%' then
    if v->>'name' is distinct from nom then raise exception 'EMPLEADO_INVALIDO';end if;
    if coalesce(v->>'start','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(v->>'end','')!~'^[0-9]+([.][0-9]+)?$' then raise exception 'TURNO_INVALIDO';end if;
    select valor into activo from public.datos where clave=k;
    if activo is not null and (activo-'empId')=(v-'empId') then new.valor:=activo;return new;end if;
    select valor into activo from public.datos where clave='fichaje:'||emp;
    if activo is null or coalesce((activo->>'deleted')::boolean,false) or abs((activo->>'start')::numeric-(v->>'start')::numeric)>60000 or (v->>'end')::numeric<(activo->>'start')::numeric or abs((extract(epoch from now())*1000)-(v->>'end')::numeric)>60000 then raise exception 'TURNO_INVALIDO';end if;
    new.valor:=v||jsonb_build_object('empId',emp,'start',activo->'start');v:=new.valor;
   elsif k like 'ausencia:%' and coalesce(v->>'empId','')<>emp then raise exception 'EMPLEADO_INVALIDO';
   elsif k like 'nota:%' then
    if tg_op='INSERT' then
     if v->>'authorId' is distinct from emp then raise exception 'EMPLEADO_INVALIDO';end if;
    elsif v->'text' is distinct from old.valor->'text' or v->'authorId' is distinct from old.valor->'authorId' then raise exception 'NOTA_PROTEGIDA';end if;
   end if;
   if tg_op='UPDATE' and (k like 'venta:%' or k like 'mov:%' or k like 'act:%' or k like 'fablote:%' or k like 'turno:%' or k like 'log:%') and not public.hg_contexto() then
    if (old.valor-'ts')=(v-'ts') then return old;end if;
    raise exception 'HISTORIAL_PROTEGIDO' using errcode='42501';
   end if;
   if tg_op='UPDATE' and k in ('clientes','agenda') then
    if jsonb_typeof(v)<>'array' or exists(select 1 from jsonb_array_elements(old.valor) x where not exists(select 1 from jsonb_array_elements(v) y where y->>'id'=x->>'id')) then raise exception 'NO_BORRAR_FICHAS';end if;
   end if;
  end if;
 else
  raise exception 'SOLO_PROPIETARIO' using errcode='42501';
 end if;
end if;
-- Trazabilidad protegida fuera del API para toda alteración destructiva y configuración sensible.
if tg_op in ('UPDATE','DELETE') and (tg_table_name in ('stock','contador') or k in ('empleados','precios','productos','descuentos','recetas','proveedores','jefe','acceso','discord') or tg_op='DELETE' or coalesce(newj->'valor'->>'deleted','false')='true') then
insert into hg_security.audit(actor,empleado,tabla,operacion,clave,anterior,nuevo) values(auth.uid(),emp,tg_table_name,tg_op,k,oldj,newj);
end if;
if tg_op='DELETE' then return old;end if;return new;
end $$;
-- Sustituir las políticas amplias, incluidos los permisos heredados para visitantes.
do $$ declare t text;p record; begin
for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('datos','stock','ventas','encargos','fichajes_activos','registros','contador') loop execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;
for t in select unnest(array['stock','ventas','encargos','fichajes_activos','registros','contador']) loop
 execute format('create policy lectura on public.%I for select to authenticated using (public.hg_permitido())',t);
 execute format('create policy escritura on public.%I for all to authenticated using (public.hg_es_jefe() or public.hg_contexto()) with check (public.hg_es_jefe() or public.hg_contexto())',t);
 execute format('create trigger hg_seguridad before insert or update or delete on public.%I for each row execute function public.hg_guardar_seguro()',t);
end loop;
end $$;
create policy lectura on public.datos for select to anon,authenticated using(public.hg_dato_lectura(clave));
create policy insertar on public.datos for insert to authenticated with check(public.hg_dato_escritura(clave,valor));
create policy actualizar on public.datos for update to authenticated using(public.hg_dato_escritura(clave,valor)) with check(public.hg_dato_escritura(clave,valor));
create policy borrar on public.datos for delete to authenticated using(public.hg_es_jefe() or (public.hg_permitido() and (clave like 'presencia-%' or clave like 'fab-%')));
create trigger hg_seguridad before insert or update or delete on public.datos for each row execute function public.hg_guardar_seguro();
revoke all on all tables in schema public from anon;
grant select on public.datos to anon;
revoke all on public.copias,public.cuentas,public.push_cfg,public.push_subs,public.ia_registro from authenticated;
revoke truncate,references,trigger on all tables in schema public from authenticated;
-- Ninguna función interna hereda acceso PUBLIC o anónimo.
do $$ declare f record; begin
for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace loop execute format('revoke execute on function %s from public,anon',f.signature);end loop;
end $$;
grant execute on function public.hg_puerta(),public.hg_cerrado(),public.hg_claims(),public.hg_servidor(),public.hg_permitido(),public.hg_es_jefe(),public.hg_empleado_ok(boolean),public.hg_dato_lectura(text) to anon,authenticated;
grant execute on function public.hg_contexto(),public.hg_dato_escritura(text,jsonb) to authenticated;
revoke all on function public.hg_login_attempt(text) from authenticated;
grant execute on function public.hg_login_attempt(text) to service_role;
-- Mantener servicio de cron/bot y evitar permisos automáticos peligrosos en futuros objetos.
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;

create or replace function public.hg_validar_fabricacion(p_items jsonb) returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
declare recipes jsonb;it jsonb;r jsonb;n text;q int;k text;esperado jsonb:='{}';real jsonb:='{}';positive int:=0;
begin
if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'FAB_DATOS';end if;
select valor into recipes from public.datos where clave='recetas';
for it in select * from jsonb_array_elements(p_items) loop
n:=it->>'producto';q:=(it->>'delta')::int;
if n is null or q=0 or q is null or q::numeric<>(it->>'delta')::numeric or abs(q)>9999 then raise exception 'FAB_DATOS';end if;
real:=jsonb_set(real,array[n],to_jsonb(coalesce((real->>n)::int,0)+q));
if q>0 then
positive:=positive+1;
if jsonb_typeof(recipes->n) is distinct from 'array' or jsonb_array_length(recipes->n)=0 then raise exception 'RECETA_INVALIDA';end if;
esperado:=jsonb_set(esperado,array[n],to_jsonb(coalesce((esperado->>n)::int,0)+q));
for r in select * from jsonb_array_elements(recipes->n) loop
k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
if coalesce((r->>'q')::numeric,0)<=0 then raise exception 'RECETA_INVALIDA';end if;
esperado:=jsonb_set(esperado,array[k],to_jsonb(coalesce((esperado->>k)::int,0)-q*(r->>'q')::int));
end loop;
end if;
end loop;
if positive=0 or esperado<>real then raise exception 'CONSUMO_NO_COINCIDE_CON_RECETA';end if;
end $$;

CREATE OR REPLACE FUNCTION public.mover_stock(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare it jsonb; n text; d int; q int; a int; take_npc int; cfg jsonb; taken jsonb:='{}';uid text;emp text; actor text;
begin
 if not public.hg_es_jefe() and not public.hg_contexto() then raise exception 'OPERACION_SERVIDOR_OBLIGATORIA' using errcode='42501';end if;

 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='npc:estado';
 cfg:=coalesce(cfg,'{"asig":{},"precios":{},"rev":{}}');
 for it in select * from jsonb_array_elements(p_items) loop
  n:=it->>'producto';d:=(it->>'delta')::int;
  select cantidad into q from public.stock where producto=n;
  q:=coalesce(q,0);a:=coalesce((cfg->'asig'->>n)::int,0);
  if a<0 or a>q then raise exception 'NPC_DESCUADRADO: %',n;end if;
  if q+d<0 then raise exception 'STOCK_INSUFICIENTE';end if;
  if d<0 then
   take_npc:=least(a,greatest(0,-d-greatest(0,q-a)));
   if take_npc>0 then
    cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a-take_npc));
    taken:=jsonb_set(taken,array[n],to_jsonb(coalesce((taken->>n)::int,0)+take_npc));
   end if;
  end if;
  update public.stock set cantidad=cantidad+d where producto=n;
  if not found then insert into public.stock(producto,cantidad) values(n,q+d);end if;
 end loop;
 if taken<>'{}'::jsonb then
  cfg:=cfg||jsonb_build_object('ts',(extract(epoch from clock_timestamp())*1000)::bigint);
  update public.datos set valor=cfg,actualizado=clock_timestamp() where clave='npc:estado';
  emp:=public.hg_claims()->'app_metadata'->>'emp_id';
  select e->>'name' into actor from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
  uid:='npc-uso-'||md5(clock_timestamp()::text||random()::text);
  insert into public.datos(clave,valor,actualizado) values('act:'||uid,jsonb_build_object('id',uid,'ts',(extract(epoch from clock_timestamp())*1000)::bigint,'tipo','npc','who',coalesce(actor,'Sistema'),'empId',coalesce(emp,''),'data',jsonb_build_object('txt','Unidades tomadas del NPC para una venta o consumo de stock','delNPC',taken)),clock_timestamp());
 end if;
 return (select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock);
exception when check_violation then raise exception 'STOCK_INSUFICIENTE';
end $function$;
CREATE OR REPLACE FUNCTION public.vender_stock(p_items jsonb, p_ctx jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb;p text;d int;v int;r int;exc text:=coalesce(p_ctx->>'encargo','');
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;perform set_config('hg.operacion','venta',true);if exists(select 1 from jsonb_array_elements(p_items) x where (x->>'delta')::numeric>=0 or (x->>'delta')::numeric<>trunc((x->>'delta')::numeric) or abs((x->>'delta')::numeric)>9999) then raise exception 'VENTA_INVALIDA';end if;

 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 for it in select * from jsonb_array_elements(coalesce(p_items,'[]')) loop
  p:=it->>'producto';d:=coalesce((it->>'delta')::int,0);
  if d<0 then
   select cantidad into v from public.stock where producto=p for update;
   r:=public.hg_reservadas(p,exc);
   if r>0 and coalesce(v,0)+d>=0 and coalesce(v,0)+d<r then raise exception 'RESERVADA: % (% reservadas)',p,r;end if;
  end if;
 end loop;
 return public.mover_stock(p_items);
end $function$;
CREATE OR REPLACE FUNCTION public.vender_fabricando(p_peticion text, p_venta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 old jsonb; recipes jsonb; it jsonb; r jsonb; rec jsonb; ent record;
 sold jsonb := '{}'; made jsonb := '{}'; used jsonb := '{}'; before_stock jsonb; running jsonb;
 moves jsonb := '[]'; records jsonb := '[]'; result jsonb; s jsonb; ledger jsonb; val jsonb;
 n text; k text; id text; uid text; emp text; employee text; why text;
 q integer; v integer; deficit integer; d integer; ix integer := 0; num bigint;
 stamp timestamptz := clock_timestamp(); ms bigint; local_time timestamptz;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;perform set_config('hg.operacion','venta',true);

 if not public.hg_permitido() then raise exception 'SIN_CUENTA'; end if;
 if p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' or p_peticion is null then raise exception 'PETICION_INVALIDA'; end if;
 if p_venta->>'op' is distinct from 'venta' or coalesce(p_venta->>'fromEncargo','') <> '' then raise exception 'VENTA_INVALIDA'; end if;
 -- Serializa también las reservas y protege claves de stock aún inexistentes.
 lock table public.datos, public.stock in share row exclusive mode;
 select valor into old from public.datos where clave='autoventa:'||p_peticion;
 if old is not null then
  if old->'sale'->>'sig' is distinct from p_venta->>'sig' or old->'sale'->>'employee' is distinct from (select e->>'name' from public.datos d cross join lateral jsonb_array_elements(d.valor) e where clave='empleados' and e->>'id'=public.hg_claims()->'app_metadata'->>'emp_id') then raise exception 'PETICION_REUTILIZADA'; end if;
  return old || jsonb_build_object('replayed',true,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if jsonb_typeof(p_venta->'items') is distinct from 'array' or jsonb_array_length(p_venta->'items') not between 1 and 100 then raise exception 'VENTA_VACIA'; end if;
 emp := p_venta->>'empId';
 select e->>'name' into employee from public.datos, jsonb_array_elements(valor) e where clave='empleados' and e->>'id'=emp;
 if employee is null then raise exception 'EMPLEADO_INVALIDO'; end if;
 if public.hg_claims()->'app_metadata'->>'emp_id' is not null and public.hg_claims()->'app_metadata'->>'emp_id' <> emp then raise exception 'EMPLEADO_INVALIDO'; end if;
 select valor into recipes from public.datos where clave='recetas';
 select coalesce(jsonb_object_agg(producto,cantidad),'{}') into before_stock from public.stock;
 running := before_stock;
 for it in select * from jsonb_array_elements(p_venta->'items') loop
  n:=it->>'name'; q:=(it->>'qty')::integer;
  if n is null or q is null or q not between 1 and 9999 or (it->>'qty')::numeric<>q or (it->>'cents')::numeric<0 then raise exception 'CANTIDAD_INVALIDA'; end if;
  sold:=jsonb_set(sold,array[n],to_jsonb(coalesce((sold->>n)::integer,0)+q));
 end loop;
 for ent in select key,value from jsonb_each(sold) order by key loop
  n:=ent.key; q:=ent.value::integer;
  v:=greatest(0,coalesce((before_stock->>n)::integer,0)-public.hg_reservadas(n,'')); deficit:=greatest(0,q-v);
  if deficit=0 then continue; end if;
  rec:=recipes->n;
  if jsonb_typeof(rec) is distinct from 'array' or jsonb_array_length(rec)=0 then raise exception 'FALTAN_MATERIALES: % (faltan % unidades; sin receta)',n,deficit; end if;
  made:=jsonb_set(made,array[n],to_jsonb(deficit));
  for r in select * from jsonb_array_elements(rec) loop
   q:=(r->>'q')::integer;
   if q is null or q<=0 or (r->>'q')::numeric<>q or coalesce(r->>'m','')='' then raise exception 'RECETA_INVALIDA: %',n; end if;
   k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
   used:=jsonb_set(used,array[k],to_jsonb(coalesce((used->>k)::integer,0)+deficit*q));
  end loop;
 end loop;
 for ent in select key,value from jsonb_each(used) order by key loop
  k:=ent.key; q:=ent.value::integer+coalesce((sold->>k)::integer,0);
  v:=greatest(0,coalesce((before_stock->>k)::integer,0)-public.hg_reservadas(k,''));
  if q>v then raise exception 'FALTAN_MATERIALES: % (faltan %)',k,q-v; end if;
 end loop;
 -- Todos los registros se escriben en esta misma transacción, incluido el número de venta.
 num:=public.siguiente_numero(); ms:=(extract(epoch from stamp)*1000)::bigint;
 id:='HG-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY')||'-'||lpad(num::text,greatest(3,length(num::text)),'0');
 s:=p_venta-'empId';
 s:=s||jsonb_build_object('id',id,'employee',employee,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'stockApplied',sold,'autoFabricacion',made,'ts',stamp);
 for ent in select key,value from jsonb_each(made) order by key loop
  n:=ent.key; q:=ent.value::integer;
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',n,'delta',q,'why','Fabricación','venta',id));
  uid:='av-'||p_peticion||'-'||ix; ix:=ix+1;
  val:=jsonb_build_object('id',uid,'ts',ms,'empId',emp,'emp',employee,'prod',n,'q',q,'autoVenta',id);
  records:=records||jsonb_build_array(jsonb_build_object('clave','fablote:'||uid,'valor',val));
 end loop;
 for ent in select key,value from jsonb_each(used) order by key loop
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::integer,'why','Fabricación','venta',id));
 end loop;
 for ent in select key,value from jsonb_each(sold) order by key loop
  moves:=moves||jsonb_build_array(jsonb_build_object('producto',ent.key,'delta',-ent.value::integer,'why','Venta '||id));
 end loop;
 perform public.mover_stock(moves);
 for it in select * from jsonb_array_elements(moves) loop
  n:=it->>'producto'; d:=(it->>'delta')::integer; v:=coalesce((running->>n)::integer,0);
  uid:='av-'||p_peticion||'-'||ix; ix:=ix+1;
  val:=jsonb_build_object('uid',uid,'ts',ms,'who',employee,'venta',id,'name',case when n like 'mat:%' then substr(n,5)||' (material)' else n end,'delta',d,'why',it->>'why','antes',v,'despues',v+d,'date',s->>'date','time',s->>'time');
  records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',val));
  running:=jsonb_set(running,array[n],to_jsonb(v+d));
 end loop;
 if made<>'{}'::jsonb then
  uid:='av-'||p_peticion;
  val:=jsonb_build_object('id',uid,'ts',ms,'tipo','fabricacion','who',employee,'empId',emp,'data',jsonb_build_object('txt','Fabricación automática para venta '||id,'venta',id,'productos',made,'materiales',used));
  records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',val));
 end if;
 ledger:=s-'sig'-'stockApplied';
 ledger:=ledger||jsonb_build_object('stock',sold,'dueCents',coalesce((s->>'dueCents')::numeric,(s->>'totalCents')::numeric),'ts',stamp+interval '1 millisecond');
 records:=records||jsonb_build_array(jsonb_build_object('clave','venta:'||id,'valor',ledger));
 for it in select * from jsonb_array_elements(records) loop
  insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);
 end loop;
 result:=jsonb_build_object('sale',s,'stock',running,'records',records,'made',made,'used',used,'moves',moves,'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('autoventa:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',p_peticion),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.fabricar_empleado(p_emp text, p_items jsonb, p_lote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  res jsonb;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
if not public.hg_es_jefe() and p_emp is distinct from public.hg_claims()->'app_metadata'->>'emp_id' then raise exception 'EMPLEADO_INVALIDO';end if;
perform public.hg_validar_fabricacion(p_items);
perform set_config('hg.operacion','fabricacion',true);

  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  if coalesce(p_emp, '') = '' or p_lote->>'id' is null or p_lote->>'empId' is distinct from p_emp then
    raise exception 'FAB_DATOS';
  end if;
  perform pg_advisory_xact_lock(hashtext('hg-fab-' || p_emp));
  if hg_pendientes_empleado(p_emp) > 0 then
    raise exception 'FAB_BLOQUEADA';
  end if;
  res := mover_stock(p_items);
  insert into datos (clave, valor, actualizado) values ('fablote:' || (p_lote->>'id'), p_lote, now());
  insert into datos (clave, valor, actualizado)
    values ('rev', jsonb_build_object('n', (extract(epoch from now()) * 1000)::bigint::text || '-fab'), now())
    on conflict (clave) do update set valor = excluded.valor, actualizado = excluded.actualizado;
  return res;
end $function$;
CREATE OR REPLACE FUNCTION public.siguiente_numero()
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n bigint;
begin
 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;perform set_config('hg.operacion','venta',true);

  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  update public.contador set valor = valor + 1 where id = 1 returning valor into n;
  return n;
end $function$;
CREATE OR REPLACE FUNCTION public.inventario_preparar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare emp text := public.hg_claims()->'app_metadata'->>'emp_id';
begin
 if not public.hg_es_jefe() then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if; perform set_config('hg.operacion','inventario',true);

 if not public.hg_permitido() or not exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp and e->>'puesto'='Jefe') then raise exception 'SOLO_JEFES'; end if;
 return (select coalesce(jsonb_object_agg(producto,jsonb_build_object('q',cantidad,'v',s.xmin::text,'npc',coalesce((d.valor->'asig'->>producto)::int,0),'nv',d.xmin::text)),'{}') from public.stock s left join public.datos d on d.clave='npc:estado');
end $function$;
CREATE OR REPLACE FUNCTION public.inventario_guardar(p_peticion text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 emp text:=public.hg_claims()->'app_metadata'->>'emp_id'; jefe text; old jsonb; it jsonb; val jsonb;
 records jsonb:='[]'; items jsonb:='[]'; moves jsonb:='[]'; conflicts jsonb:='[]'; warnings jsonb:='[]'; result jsonb;
 k text; token text; rid text; uid text; n text; actual integer; teo integer; fis integer; dif integer; idx integer:=0; changed integer:=0;
 stamp timestamptz:=clock_timestamp();ms bigint; npc_data jsonb; npc_changed boolean:=false;npc_version text;npc_q int;
begin
 if not public.hg_es_jefe() then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if; perform set_config('hg.operacion','inventario',true);

 if not public.hg_permitido() then raise exception 'SOLO_JEFES'; end if;
 if p_peticion is null or p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' then raise exception 'PETICION_INVALIDA'; end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select e->>'name' into jefe from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp and e->>'puesto'='Jefe';
 if jefe is null then raise exception 'SOLO_JEFES'; end if;
 select valor into old from public.datos where clave='inventario:'||p_peticion;
 if old is not null then
  if old->>'empId'<>emp or old->>'huella'<>md5(p_items::text) then raise exception 'PETICION_REUTILIZADA'; end if;
  return old||jsonb_build_object('replayed',true,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 5000 then raise exception 'RECUENTO_VACIO'; end if;
 if (select count(*)<>count(distinct x->>'k') from jsonb_array_elements(p_items) x) then raise exception 'ARTICULO_DUPLICADO'; end if;
 select valor,xmin::text into npc_data,npc_version from public.datos where clave='npc:estado';
 for it in select * from jsonb_array_elements(p_items) loop
  k:=it->>'k';
  if coalesce(k,'')='' or length(k)>200 or coalesce(it->>'fis','')!~'^[0-9]{1,6}$' or coalesce(it->>'teo','')!~'^[0-9]{1,9}$' then raise exception 'CANTIDAD_INVALIDA'; end if;
  teo:=(it->>'teo')::integer;fis:=(it->>'fis')::integer;
  actual:=null;token:=null;select cantidad,xmin::text into actual,token from public.stock where producto=k;
  npc_q:=coalesce((npc_data->'asig'->>k)::int,0);
  if npc_q>0 and coalesce(it->>'ubicacion','')<>'almacen' then raise exception 'NPC_UBICACION_REQUERIDA: cuenta solo tu almacén y actualiza la página';end if;
  if it->>'ubicacion'='almacen' then
   if npc_version is distinct from (it->>'npcVersion') or npc_q<>coalesce((it->>'npcTeo')::int,0) then conflicts:=conflicts||jsonb_build_array(k);end if;
   if fis<npc_q then raise exception 'CANTIDAD_INVALIDA';end if;
  end if;
  if coalesce(actual,0)<>teo or token is distinct from (it->>'version') then conflicts:=conflicts||jsonb_build_array(k); end if;
 end loop;
 if jsonb_array_length(conflicts)>0 then raise exception 'STOCK_CAMBIADO' using detail=conflicts::text; end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;rid:='ij-'||p_peticion;
 select valor into npc_data from public.datos where clave='npc:estado';
 for it in select * from jsonb_array_elements(p_items) loop
  k:=it->>'k';teo:=(it->>'teo')::integer;fis:=(it->>'fis')::integer;dif:=fis-teo;n:=case when k like 'mat:%' then substr(k,5) else k end;
  items:=items||jsonb_build_array(jsonb_build_object('k',k,'name',n,'teo',teo,'fis',fis,'diff',dif));
  if dif<>0 then
   changed:=changed+1;
   insert into public.stock(producto,cantidad) values(k,fis) on conflict(producto) do update set cantidad=excluded.cantidad;
   uid:=rid||'-'||idx;idx:=idx+1;
   val:=jsonb_build_object('uid',uid,'ts',ms,'who',jefe,'name',case when k like 'mat:%' or k='Pólvora' then n||' (material)' else n end,'delta',dif,'why','Ajuste por inventario '||rid,'antes',teo,'despues',fis,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'));
   records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',val));
   moves:=moves||jsonb_build_array(jsonb_build_object('producto',k,'delta',dif));
   uid:=rid||'-rev-'||idx;
   val:=jsonb_build_object('id',uid,'ts',ms,'tipo','revision','who',jefe,'empId',emp,'data',jsonb_build_object('ref',rid||'|'||k,'nota','Diferencia revisada y ajustada al guardar este inventario físico.'));
   records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||uid,'valor',val));
   if coalesce((npc_data->'asig'->>k)::integer,0)>fis then npc_data:=jsonb_set(npc_data,array['asig',k],to_jsonb(fis));npc_changed:=true;end if;
  end if;
  if public.hg_reservadas(k,'')>fis then warnings:=warnings||jsonb_build_array(n||': hay más unidades reservadas que existencias físicas');end if;
 end loop;
 val:=jsonb_build_object('id',rid,'ts',ms,'by',jefe,'tipo','inventario físico de Dirección','ajustado',true,'empId',emp,'items',items,'avisos',warnings);
 records:=records||jsonb_build_array(jsonb_build_object('clave','recu:'||rid,'valor',val));
 val:=jsonb_build_object('id',rid,'ts',ms,'tipo','recuento','who',jefe,'empId',emp,'data',jsonb_build_object('id',rid,'tipoR','inventario físico ajustado','n',jsonb_array_length(items),'diffs',changed));
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||rid,'valor',val));
 if npc_changed then
  npc_data:=npc_data||jsonb_build_object('ts',ms);
  update public.datos set valor=npc_data,actualizado=stamp where clave='npc:estado';
  records:=records||jsonb_build_array(jsonb_build_object('clave','npc:estado','valor',npc_data));
 end if;
 for it in select * from jsonb_array_elements(records) loop
  if it->>'clave'='npc:estado' then continue;end if;
  insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);
 end loop;
 result:=jsonb_build_object('id',rid,'empId',emp,'huella',md5(p_items::text),'items',items,'changed',changed,'warnings',warnings,'records',records,'moves',moves,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock),'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('inventario:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',rid),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.npc_operar(p_peticion text, p_modo text, p_items jsonb, p_base jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 emp text:=public.hg_claims()->'app_metadata'->>'emp_id';actor text;chief boolean;
 cfg jsonb;version text;old jsonb;it jsonb;rec jsonb;records jsonb:='[]';moves jsonb:='[]';rows jsonb:='[]';sales jsonb:='[]';prices jsonb;
 n text;uid text;rid text;sale_id text:='';stamp timestamptz:=clock_timestamp();ms bigint;idx int:=0;
 q int;a int;total int;delta int;sold int;cents int;amount bigint:=0;seq int;result jsonb;token text;changes int:=0;
begin
 if not public.hg_es_jefe() and p_modo<>'avisar' then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if; perform set_config('hg.operacion','npc',true);

 if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
 if p_peticion is null or p_peticion !~ '^[a-zA-Z0-9-]{20,80}$' then raise exception 'PETICION_INVALIDA';end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select e->>'name',e->>'puesto'='Jefe' into actor,chief from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
 if actor is null then raise exception 'SIN_CUENTA';end if;
 if p_modo not in ('entregar','recuperar','consumir','revision','inventario','precios','avisar') or p_modo is null then raise exception 'MODO_INVALIDO';end if;
 if p_modo not in ('revision','avisar') and not chief then raise exception 'SOLO_JEFES';end if;
 select valor into old from public.datos where clave='npcop:'||p_peticion;
 if old is not null then
  if old->>'empId'<>emp or old->>'huella'<>md5(jsonb_build_array(p_modo,p_items,p_base)::text) then raise exception 'PETICION_REUTILIZADA';end if;
  return old||jsonb_build_object('replayed',true,'npc',coalesce((select valor from public.datos where clave='npc:estado'),'{}'),'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock));
 end if;
 select valor,xmin::text into cfg,version from public.datos where clave='npc:estado';
 cfg:=coalesce(cfg,'{"asig":{},"precios":{},"rev":{}}');
 if p_modo<>'avisar' and version is distinct from (p_base->>'version') then raise exception 'NPC_CAMBIADO';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 then raise exception 'CANTIDAD_INVALIDA';end if;
 if p_modo not in ('avisar','precios') and jsonb_array_length(p_items)=0 then raise exception 'RECUENTO_VACIO';end if;
 if (select count(*)<>count(distinct x->>'n') from jsonb_array_elements(p_items) x) then raise exception 'ARTICULO_DUPLICADO';end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;rid:='npc-'||p_peticion;
 if p_modo='revision' then
  -- Una revisión de ventas debe comprobar TODO lo que el NPC debería conservar.
  if exists(select 1 from jsonb_each_text(coalesce(cfg->'asig','{}')) a where a.value::int>0 and not exists(select 1 from jsonb_array_elements(p_items) x where x->>'n'=a.key)) then raise exception 'RECUENTO_INCOMPLETO';end if;
 end if;
 for it in select * from jsonb_array_elements(p_items) loop
  n:=it->>'n';
  if coalesce(n,'')='' or n like 'mat:%' or coalesce(it->>'q','')!~'^[0-9]{1,6}$' then raise exception 'CANTIDAD_INVALIDA';end if;
  q:=(it->>'q')::int;a:=coalesce((cfg->'asig'->>n)::int,0);delta:=0;sold:=0;
  select cantidad,xmin::text into total,token from public.stock where producto=n;
  total:=coalesce(total,0);
  if a<0 or a>total then raise exception 'NPC_DESCUADRADO: %',n;end if;
  if p_modo not in ('precios','avisar') and (token is distinct from (p_base->'stock'->n->>'v') or total<>coalesce((p_base->'stock'->n->>'q')::int,0)) then raise exception 'STOCK_CAMBIADO: %',n;end if;
  if p_modo='entregar' then
   if q<=0 or a+q>total then raise exception 'ALMACEN_INSUFICIENTE: %',n;end if;
   cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a+q));
  elsif p_modo in ('recuperar','consumir') then
   if q<=0 or q>a then raise exception 'NPC_INSUFICIENTE: %',n;end if;
   cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(a-q));
   if p_modo='consumir' then delta:=-q;end if;
  elsif p_modo='inventario' then
   delta:=q-a;cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(q));
  elsif p_modo='revision' then
   if q>a then raise exception 'NPC_SOBRANTE: % (usa inventario o registra una entrega)',n;end if;
   sold:=a-q;delta:=-sold;cfg:=jsonb_set(cfg,array['asig',n],to_jsonb(q));
   if sold>0 then
    cents:=coalesce((cfg->'precios'->>n)::int,(it->>'cents')::int);
    if cents is null or cents<=0 then raise exception 'PRECIO_NPC_INVALIDO: %',n;end if;
    sales:=sales||jsonb_build_array(jsonb_build_object('name',n,'qty',sold,'cents',cents,'oq',0));amount:=amount+sold::bigint*cents;
   end if;
  elsif p_modo='precios' then
   if q<=0 then raise exception 'PRECIO_NPC_INVALIDO';end if;
   cfg:=jsonb_set(cfg,array['precios',n],to_jsonb(q));
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('n',n,'esperado',a,'encontrado',coalesce((cfg->'asig'->>n)::int,0),'vendido',sold,'deltaTotal',delta));
  if delta<>0 then
   changes:=changes+1;
   insert into public.stock(producto,cantidad) values(n,total+delta) on conflict(producto) do update set cantidad=excluded.cantidad;
   uid:=rid||'-'||idx;idx:=idx+1;
   moves:=moves||jsonb_build_array(jsonb_build_object('producto',n,'delta',delta));
   rec:=jsonb_build_object('uid',uid,'ts',ms,'who',actor,'name',n,'delta',delta,'antes',total,'despues',total+delta,'why',case p_modo when 'revision' then 'Venta NPC' when 'inventario' then 'Ajuste de inventario del NPC' else 'Consumo del NPC' end,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'));
   records:=records||jsonb_build_array(jsonb_build_object('clave','mov:'||uid,'valor',rec));
  end if;
 end loop;
 if p_modo='revision' then
  seq:=coalesce((cfg->'rev'->>'seq')::int,0)+1;
  if jsonb_array_length(sales)>0 then
   sale_id:='NPC-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY')||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0');
   rec:=jsonb_build_object('id',sale_id,'items',sales,'stock','{}'::jsonb,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),'op','venta','client','NPC (tienda cerrada)','employee','','by',actor,'products',jsonb_array_length(sales),'units',(select sum((x->>'qty')::int) from jsonb_array_elements(sales) x),'dueCents',amount,'totalCents',amount,'npc',true,'ts',stamp,'note','Ventas del NPC, después de ventas manuales y traslados registrados');
   records:=records||jsonb_build_array(jsonb_build_object('clave','venta:'||sale_id,'valor',rec));
  end if;
  cfg:=jsonb_set(cfg,'{rev}',jsonb_build_object('pending',false,'since',0,'seq',seq,'last',jsonb_build_object('ts',ms,'by',actor)));
  records:=records||jsonb_build_array(jsonb_build_object('clave','npcrev:'||rid,'valor',jsonb_build_object('id',rid,'ts',ms,'by',actor,'filas',rows,'venta',sale_id)));
 elsif p_modo='inventario' then
  cfg:=jsonb_set(cfg,'{rev}',coalesce(cfg->'rev','{}')||jsonb_build_object('pending',false,'since',0,'last',jsonb_build_object('ts',ms,'by',actor,'inventario',true)));
 elsif p_modo='avisar' then
  cfg:=jsonb_set(cfg,'{rev}',coalesce(cfg->'rev','{}')||jsonb_build_object('pending',true,'since',ms));
 end if;
 cfg:=cfg||jsonb_build_object('ts',ms);
 insert into public.datos(clave,valor,actualizado) values('npc:estado',cfg,stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 rec:=jsonb_build_object('id',rid,'ts',ms,'tipo','npc','who',actor,'empId',emp,'data',jsonb_build_object('txt',case p_modo when 'revision' then 'Revisión de ventas del NPC' when 'inventario' then 'Inventario del NPC: ajuste sin ingresos' when 'entregar' then 'Traslado del almacén al NPC' when 'recuperar' then 'Traslado del NPC al almacén' when 'consumir' then 'Retirada del NPC para consumo' when 'precios' then 'Precios del NPC actualizados' else 'Revisión del NPC pendiente' end,'modo',p_modo,'filas',rows,'venta',sale_id));
 records:=records||jsonb_build_array(jsonb_build_object('clave','act:'||rid,'valor',rec));
 for it in select * from jsonb_array_elements(records) loop insert into public.datos(clave,valor,actualizado) values(it->>'clave',it->'valor',stamp);end loop;
 result:=jsonb_build_object('id',rid,'empId',emp,'huella',md5(jsonb_build_array(p_modo,p_items,p_base)::text),'modo',p_modo,'npc',cfg,'filas',rows,'records',records,'moves',moves,'venta',sale_id,'importe',amount,'stock',(select coalesce(jsonb_object_agg(producto,cantidad),'{}') from public.stock),'replayed',false);
 insert into public.datos(clave,valor,actualizado) values('npcop:'||p_peticion,result,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',rid),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.hacer_copia(p_tipo text DEFAULT 'diaria'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id  text;
  v_dat jsonb;
  v_stk jsonb;
  v_cnt integer;
  v_n   integer;
  v_dia date;
begin
 if not public.hg_es_jefe() then raise exception 'SOLO_PROPIETARIO' using errcode='42501';end if;

  if not hg_permitido() then raise exception 'SIN_CUENTA'; end if;
  if p_tipo not in ('diaria', 'antes-restaurar') then raise exception 'COPIA_TIPO'; end if;
  v_dia := (now() at time zone 'Europe/Madrid')::date;
  v_id := case when p_tipo = 'diaria' then 'diaria-' || extract(isodow from v_dia)::int else 'antes-restaurar' end;
  if p_tipo = 'diaria' and exists (select 1 from copias where id = v_id and (creada at time zone 'Europe/Madrid')::date = v_dia) then
    return jsonb_build_object('id', v_id, 'hecha', false);
  end if;
  select coalesce(jsonb_object_agg(clave, jsonb_build_object('v', valor, 'a', actualizado)), '{}'::jsonb), count(*)
    into v_dat, v_n from datos where not hg_fuera_de_copia(clave);
  select coalesce(jsonb_object_agg(producto, to_jsonb(s) - 'producto'), '{}'::jsonb) into v_stk from stock s;
  select valor into v_cnt from contador where id = 1;
  insert into copias (id, tipo, creada, datos, stock, contador, filas, bytes)
    values (v_id, p_tipo, now(), v_dat, v_stk, v_cnt, v_n, pg_column_size(v_dat) + pg_column_size(v_stk))
    on conflict (id) do update set creada = excluded.creada, datos = excluded.datos, stock = excluded.stock,
      contador = excluded.contador, filas = excluded.filas, bytes = excluded.bytes;
  return jsonb_build_object('id', v_id, 'hecha', true, 'filas', v_n);
end $function$;
CREATE OR REPLACE FUNCTION public.listar_copias()
 RETURNS TABLE(id text, tipo text, creada timestamp with time zone, filas integer, bytes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, tipo, creada, filas, bytes from copias where hg_es_jefe() order by creada desc
$function$;
CREATE OR REPLACE FUNCTION public.ver_copia(p_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('id', id, 'tipo', tipo, 'creada', creada, 'datos', datos, 'stock', stock, 'contador', contador)
  from copias where id = p_id and hg_es_jefe()
$function$;
revoke all on function public.hg_validar_fabricacion(jsonb) from public,anon; grant execute on function public.hg_validar_fabricacion(jsonb) to authenticated,service_role;
alter function public.hg_ms(text) set search_path=pg_catalog,public;
revoke execute on function public.restaurar_copia(p_id text) from anon;
revoke execute on function public.hacer_copia(p_tipo text) from anon;
revoke execute on function public.listar_copias() from anon;
revoke execute on function public.ver_copia(p_id text) from anon;
alter function public.hg_solo_adicion() set search_path=pg_catalog,public;
notify pgrst,'reload schema';
create or replace function hg_security.resetear_clave(p_emp text) returns void language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare uid uuid;begin
if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR';end if;
if p_emp=(select owner_emp from public.hg_security_config where id=1) then raise exception 'PROPIETARIO_NO_RESETEABLE';end if;
select c.uid into uid from public.cuentas c where emp_id=p_emp;
delete from public.hg_security_credentials where emp_id=p_emp;
delete from public.datos where clave='clave-'||p_emp;
if uid is not null then delete from auth.sessions where user_id=uid;delete from auth.refresh_tokens where user_id=uid::text;end if;
insert into hg_security.audit(tabla,operacion,clave) values('credenciales','RESET',p_emp);
end $$;
create or replace function hg_security.cerrar_otras_sesiones(p_uid uuid,p_session uuid) returns void language plpgsql security definer set search_path=pg_catalog,auth as $$begin if not public.hg_servidor() or p_uid is distinct from (select owner_uid from public.hg_security_config where id=1) then raise exception 'SOLO_SERVIDOR';end if; delete from auth.sessions where user_id=p_uid and id<>p_session;end $$;

revoke all on function hg_security.resetear_clave(text),hg_security.cerrar_otras_sesiones(uuid,uuid) from public,anon,authenticated;
grant execute on function hg_security.resetear_clave(text),hg_security.cerrar_otras_sesiones(uuid,uuid) to service_role;
create or replace function public.hg_resetear_clave(p_emp text) returns void language sql security invoker set search_path=pg_catalog,hg_security as $$select hg_security.resetear_clave(p_emp)$$;
create or replace function public.hg_cerrar_otras_sesiones(p_uid uuid,p_session uuid) returns void language sql security invoker set search_path=pg_catalog,hg_security as $$select hg_security.cerrar_otras_sesiones(p_uid,p_session)$$;
revoke all on function public.hg_resetear_clave(text),public.hg_cerrar_otras_sesiones(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hg_resetear_clave(text),public.hg_cerrar_otras_sesiones(uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
