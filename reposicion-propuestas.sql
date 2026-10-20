-- 20/10/2026 · Propuestas de pedido automático.
-- El pedido que crea la reposición automática es una PROPUESTA (propuesta:true) hasta que la Dirección la acepta desde
-- su privado de Discord. Mientras es propuesta:
--   · herrería (hasta el mínimo): cada revisión vuelve a calcular la cantidad de cada material (mínimo − existencias −
--     lo pendiente de OTROS pedidos) y ajusta la propuesta; si ya no falta nada, la propuesta se anula sola;
--   · mina (lote fijo): los materiales nuevos que bajen del umbral se añaden a la propuesta abierta en vez de crear otro pedido.
-- Al aceptarla (hg_reposicion_aceptar) queda bloqueada: ya no se suma nada y lo siguiente que haga falta irá a otra propuesta.
-- Una propuesta deja de serlo sola si se paga, se recibe (aunque sea en parte), se abona o se cancela.
-- Cada cambio sube «version» en hg_reposicion_avisos para que el servidor edite el privado y la tarjeta del canal de pedidos.

alter table public.hg_reposicion_avisos add column if not exists version integer not null default 1;
alter table public.hg_reposicion_avisos add column if not exists sent_version integer not null default 0;
alter table public.hg_reposicion_avisos add column if not exists card_version integer not null default 0;
alter table public.hg_reposicion_avisos add column if not exists token text;
alter table public.hg_reposicion_avisos add column if not exists aceptado_at timestamptz;
alter table public.hg_reposicion_avisos add column if not exists ic_status text;
alter table public.hg_reposicion_avisos add column if not exists ic_message_id text;
alter table public.hg_reposicion_avisos add column if not exists cerrado boolean not null default false;
alter table public.hg_reposicion_avisos add column if not exists ultimo_estado text;
create unique index if not exists hg_reposicion_avisos_token on public.hg_reposicion_avisos(token) where token is not null;

-- la propuesta abierta de un origen (o null)
create or replace function public.hg_reposicion_propuesta(p_origen text) returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('clave',d.clave,'valor',d.valor) from public.datos d
 where starts_with(d.clave,'pedido:') and d.valor->>'origen'=p_origen and coalesce((d.valor->>'propuesta')::boolean,false)
  and not coalesce((d.valor->>'received')::boolean,false) and not coalesce((d.valor->>'cancelled')::boolean,false)
  and not coalesce((d.valor->>'deleted')::boolean,false) and not coalesce((d.valor->>'paid')::boolean,false)
  and not coalesce((d.valor->>'paidInitial')::boolean,false) and coalesce((d.valor->>'completedAt')::numeric,0)=0
  and coalesce((d.valor->>'abonoCents')::numeric,0)=0
  and not exists(select 1 from jsonb_array_elements(d.valor->'items') i where coalesce((i->>'rq')::numeric,0)>0)
 order by coalesce((d.valor->>'ts')::numeric,0) desc limit 1 $$;
revoke all on function public.hg_reposicion_propuesta(text) from public,anon,authenticated;
grant execute on function public.hg_reposicion_propuesta(text) to service_role;

create or replace function public.hg_reposicion_token() returns text language sql volatile set search_path=pg_catalog,public as $$
 select replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') $$;
revoke all on function public.hg_reposicion_token() from public,anon,authenticated;

create or replace function public.hg_reponer_herreria() returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text;
 prop jsonb; pkey text:=''; old jsonb;
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(214701020,20261020) then return jsonb_build_object('busy',true);end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='cfg:reposicion-herreria';
 if not coalesce((cfg->>'enabled')::boolean,false) then return jsonb_build_object('disabled',true);end if;
 select e into prov from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'id'=cfg->>'proveedorId';
 if prov is null then raise exception 'PROVEEDOR_REPOSICION_NO_EXISTE';end if;
 select b.discord_id into uid from public.hg_discord_bindings b where b.emp_id=cfg->>'ownerEmp';
 if uid is null or uid<>cfg->>'recipientId' then raise exception 'DESTINATARIO_REPOSICION_NO_VERIFICADO';end if;
 prop:=public.hg_reposicion_propuesta('reposicion-herreria');
 if prop is not null then pkey:=prop->>'clave';prop:=prop->'valor';end if;
 select valor into limits from public.datos where clave='stockmin';
 for target in select key,value from jsonb_each(cfg->'minimos') order by key loop
  wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);
  if wanted<=0 then continue;end if;
  select coalesce(sum(cantidad),0)::integer into qty from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=target.key;
  if qty>=wanted then continue;end if;
  -- lo pendiente de otros pedidos (la propuesta abierta no cuenta: es la que se recalcula)
  select coalesce(sum(greatest(0,(i->>'qty')::integer-coalesce((i->>'rq')::integer,0))),0)::integer into incoming
  from public.datos d cross join lateral jsonb_array_elements(d.valor->'items') i
  where starts_with(d.clave,'pedido:') and d.clave<>pkey and not coalesce((d.valor->>'received')::boolean,false)
   and not coalesce((d.valor->>'cancelled')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)
   and coalesce((d.valor->>'completedAt')::numeric,0)=0 and public.hg_venta_material(i->>'material',false)=target.key;
  wanted:=greatest(0,wanted-qty-incoming);if wanted=0 then continue;end if;
  select x into product from jsonb_array_elements(prov->'prods') x where public.hg_venta_material(x->>'name',false)=target.key limit 1;
  if product is null or coalesce((product->>'price')::integer,0)<=0 then raise exception 'PRECIO_REPOSICION_NO_CONFIGURADO: %',target.key;end if;
  price:=(product->>'price')::integer;
  items:=items||jsonb_build_array(jsonb_build_object('material',substr(target.key,5),'qty',wanted,'price',price));
  total:=total+wanted::bigint*price;
 end loop;
 ms:=(extract(epoch from stamp)*1000)::bigint;
 if pkey<>'' then
  select coalesce(jsonb_agg(jsonb_build_object('material',i->>'material','qty',(i->>'qty')::integer,'price',(i->>'price')::integer) order by i->>'material'),'[]') into old from jsonb_array_elements(prop->'items') i;
  if old=(select coalesce(jsonb_agg(i order by i->>'material'),'[]') from jsonb_array_elements(items) i) then return jsonb_build_object('created',false,'propuesta',prop->>'id','cambios',false);end if;
  if jsonb_array_length(items)=0 then
   prop:=prop||jsonb_build_object('propuesta',false,'cancelled',true,'cancelledAt',ms,'cancelledBy','Harrington (automático)','cancelReason','Ya no hacía falta: el almacén volvió a estar por encima de los mínimos','propuestaCerrada','sin-faltas');
  else
   prop:=prop||jsonb_build_object('items',items,'totalCents',total,'propActualizadaTs',ms,'propVersion',coalesce((prop->>'propVersion')::integer,1)+1);
  end if;
  update public.datos set valor=prop,actualizado=stamp where clave=pkey;
  update public.hg_reposicion_avisos set version=version+1 where pedido_id=prop->>'id';
  insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',(prop->>'id')||'-'||ms),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
  return jsonb_build_object('created',false,'actualizado',true,'pedido',prop);
 end if;
 if jsonb_array_length(items)=0 then return jsonb_build_object('created',false);end if;
 id:='auto-'||gen_random_uuid()::text;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-A'||upper(substr(replace(id,'-',''),5,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen','reposicion-herreria',
 'propuesta',true,'propVersion',1,'propActualizadaTs',ms);
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Propuesta de pedido para '||(prov->>'name')||E':\n';
 for product in select * from jsonb_array_elements(items) loop texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||E'\n';end loop;
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,nonce,token) values(id,uid,texto,'rep-'||substr(replace(substr(id,6),'-',''),1,20),public.hg_reposicion_token());
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $$;
revoke all on function public.hg_reponer_herreria() from public,anon,authenticated;
grant execute on function public.hg_reponer_herreria() to service_role;

create or replace function public.hg_reponer_mina() returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text;
 prop jsonb; pkey text:='';
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(214701020,20261020) then return jsonb_build_object('busy',true);end if;
 lock table public.datos,public.stock in share row exclusive mode;
 select valor into cfg from public.datos where clave='cfg:reposicion-mina';
 if not coalesce((cfg->>'enabled')::boolean,false) then return jsonb_build_object('disabled',true);end if;
 select e into prov from public.datos d,jsonb_array_elements(d.valor) e where d.clave='proveedores' and e->>'id'=cfg->>'proveedorId';
 if prov is null then raise exception 'PROVEEDOR_REPOSICION_NO_EXISTE';end if;
 select b.discord_id into uid from public.hg_discord_bindings b where b.emp_id=cfg->>'ownerEmp';
 if uid is null or uid<>cfg->>'recipientId' then raise exception 'DESTINATARIO_REPOSICION_NO_VERIFICADO';end if;
 prop:=public.hg_reposicion_propuesta('reposicion-mina');
 if prop is not null then pkey:=prop->>'clave';prop:=prop->'valor';end if;
 select valor into limits from public.datos where clave='stockmin';
 for target in select key,value from jsonb_each(cfg->'minimos') order by key loop
  wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);
  if wanted<=0 then continue;end if;
  select coalesce(sum(cantidad),0)::integer into qty from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=target.key;
  if qty>=wanted then continue;end if;
  -- aquí sí cuenta la propuesta abierta: un material que ya está en ella no se vuelve a pedir
  select coalesce(sum(greatest(0,(i->>'qty')::integer-coalesce((i->>'rq')::integer,0))),0)::integer into incoming
  from public.datos d cross join lateral jsonb_array_elements(d.valor->'items') i
  where starts_with(d.clave,'pedido:') and not coalesce((d.valor->>'received')::boolean,false)
   and not coalesce((d.valor->>'cancelled')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)
   and coalesce((d.valor->>'completedAt')::numeric,0)=0 and public.hg_venta_material(i->>'material',false)=target.key;
  if qty+incoming>=wanted then continue;end if;wanted:=coalesce((cfg->>'lote')::integer,200);
  select x into product from jsonb_array_elements(prov->'prods') x where public.hg_venta_material(x->>'name',false)=target.key limit 1;
  if product is null or coalesce((product->>'price')::integer,0)<=0 then raise exception 'PRECIO_REPOSICION_NO_CONFIGURADO: %',target.key;end if;
  price:=(product->>'price')::integer;
  items:=items||jsonb_build_array(jsonb_build_object('material',substr(target.key,5),'qty',wanted,'price',price));
  total:=total+wanted::bigint*price;
 end loop;
 if jsonb_array_length(items)=0 then return jsonb_build_object('created',false);end if;
 ms:=(extract(epoch from stamp)*1000)::bigint;
 if pkey<>'' then
  prop:=prop||jsonb_build_object('items',(prop->'items')||items,'totalCents',coalesce((prop->>'totalCents')::bigint,0)+total,'propActualizadaTs',ms,'propVersion',coalesce((prop->>'propVersion')::integer,1)+1);
  update public.datos set valor=prop,actualizado=stamp where clave=pkey;
  update public.hg_reposicion_avisos set version=version+1 where pedido_id=prop->>'id';
  insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',(prop->>'id')||'-'||ms),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
  return jsonb_build_object('created',false,'actualizado',true,'pedido',prop);
 end if;
 id:='mina-'||gen_random_uuid()::text;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-M'||upper(substr(replace(id,'-',''),5,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen','reposicion-mina',
 'propuesta',true,'propVersion',1,'propActualizadaTs',ms);
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Propuesta de pedido para '||(prov->>'name')||E':\n';
 for product in select * from jsonb_array_elements(items) loop texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||E'\n';end loop;
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,config_key,nonce,token) values(id,uid,texto,'cfg:reposicion-mina','rep-'||substr(replace(substr(id,6),'-',''),1,20),public.hg_reposicion_token());
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $$;
revoke all on function public.hg_reponer_mina() from public,anon,authenticated;
grant execute on function public.hg_reponer_mina() to service_role;

-- La Dirección acepta la propuesta (enlace secreto de su privado). Idempotente: si ya estaba aceptada, la devuelve igual.
create or replace function public.hg_reposicion_aceptar(p_token text) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare a record; p jsonb; cfg jsonb; quien text; ms bigint; stamp timestamptz:=clock_timestamp(); lid text;
begin
 if not public.hg_servidor() then raise exception 'SOLO_SERVIDOR' using errcode='42501';end if;
 if p_token is null or p_token!~'^[0-9a-f]{64}$' then raise exception 'PROPUESTA_NO_EXISTE';end if;
 perform pg_advisory_xact_lock(214701020,20261020);
 select * into a from public.hg_reposicion_avisos where token=p_token for update;
 if not found then raise exception 'PROPUESTA_NO_EXISTE';end if;
 select valor into p from public.datos where clave='pedido:'||a.pedido_id for update;
 if p is null or coalesce((p->>'deleted')::boolean,false) then raise exception 'PROPUESTA_NO_EXISTE';end if;
 if not coalesce((p->>'propuesta')::boolean,false) then
  return jsonb_build_object('aceptado',p ? 'aceptadoAt','ya',true,'cerrado',coalesce((p->>'cancelled')::boolean,false) or coalesce((p->>'received')::boolean,false),'pedido',p);
 end if;
 if coalesce((p->>'cancelled')::boolean,false) or coalesce((p->>'received')::boolean,false) or coalesce((p->>'completedAt')::numeric,0)>0 then
  return jsonb_build_object('aceptado',false,'ya',true,'cerrado',true,'pedido',p);
 end if;
 select valor into cfg from public.datos where clave=coalesce(a.config_key,'cfg:reposicion-herreria');
 select e->>'name' into quien from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=cfg->>'ownerEmp';
 quien:=coalesce(quien,'Vincent Harrington');ms:=(extract(epoch from stamp)*1000)::bigint;
 p:=p||jsonb_build_object('propuesta',false,'aceptadoAt',ms,'aceptadoPor',quien);
 update public.datos set valor=p,actualizado=stamp where clave='pedido:'||a.pedido_id;
 update public.hg_reposicion_avisos set aceptado_at=stamp,version=version+1,ic_status='pending' where pedido_id=a.pedido_id;
 lid:='l'||to_hex(ms)||substr(md5(random()::text),1,3);
 insert into public.datos(clave,valor,actualizado) values('log:'||lid,jsonb_build_object('id',lid,'ts',ms,'who',quien,'cat','Pedidos','lines',jsonb_build_array('Aceptó la propuesta de pedido '||(p->>'code')||' a '||(p->>'proveedor')||' (desde Discord)')),stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',a.pedido_id||'-ok-'||ms),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('aceptado',true,'ya',false,'pedido',p);
end $$;
revoke all on function public.hg_reposicion_aceptar(text) from public,anon,authenticated;
grant execute on function public.hg_reposicion_aceptar(text) to service_role;

-- Avisos que ya existían: los ya enviados quedan al día; cada uno recibe su enlace para aceptar.
update public.hg_reposicion_avisos set token=public.hg_reposicion_token() where token is null;
update public.hg_reposicion_avisos set sent_version=version,card_version=version where status='sent' and sent_version=0;

-- El pedido automático que ya estaba abierto (sin pagar ni recibir) pasa a ser una propuesta: su privado y su tarjeta
-- se rehacen con el botón «Aceptar propuesta».
do $$
declare r record;
begin
 for r in select d.clave,d.valor from public.datos d where starts_with(d.clave,'pedido:') and d.valor->>'origen' in ('reposicion-herreria','reposicion-mina')
  and d.valor->>'propuesta' is null and not coalesce((d.valor->>'received')::boolean,false) and not coalesce((d.valor->>'cancelled')::boolean,false)
  and not coalesce((d.valor->>'deleted')::boolean,false) and not coalesce((d.valor->>'paid')::boolean,false) and coalesce((d.valor->>'completedAt')::numeric,0)=0
  and coalesce((d.valor->>'abonoCents')::numeric,0)=0 and not exists(select 1 from jsonb_array_elements(d.valor->'items') i where coalesce((i->>'rq')::numeric,0)>0) loop
  update public.datos set valor=r.valor||jsonb_build_object('propuesta',true,'propVersion',1,'propActualizadaTs',(r.valor->>'ts')::bigint),actualizado=clock_timestamp() where clave=r.clave;
  update public.hg_reposicion_avisos set version=sent_version+1 where pedido_id=r.valor->>'id' and status='sent';
 end loop;
end $$;

-- 20/10/2026 · imagen del albarán (la dibuja aceptar.html y el servidor la manda al privado)
alter table public.hg_reposicion_avisos add column if not exists img_message_id text;
