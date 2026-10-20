-- Reposición de la herrería: solo servidor; no confirma compras, pagos ni recepciones.
create or replace function public.hg_venta_material(n text, producto boolean default false)
returns text language sql immutable set search_path=pg_catalog,public as $$
select case when producto or n='Pólvora' then n else 'mat:'||case
translate(lower(trim(regexp_replace(n,'\s+',' ','g'))),'áéíóúüñ','aeiouun')
when 'tornillo' then 'Tornillo' when 'tornillos' then 'Tornillo'
when 'pieza de arma' then 'Pieza de arma' when 'pieza de armas' then 'Pieza de arma' when 'piezas de arma' then 'Pieza de arma' when 'piezas de armas' then 'Pieza de arma'
when 'piezas de arma especial' then 'Pieza de arma especial' when 'piezas de armas especiales' then 'Pieza de arma especial'
when 'canon de revolver' then 'Cañon de revólver' when 'canones de revolver' then 'Cañon de revólver' when 'canon de revolveres' then 'Cañon de revólver' when 'canones de revolveres' then 'Cañon de revólver'
when 'canon de pistola' then 'Cañon de pistola' when 'canones de pistola' then 'Cañon de pistola'
when 'canon de rifle' then 'Cañon de rifle' when 'canones de rifle' then 'Cañon de rifle'
when 'canon de escopeta' then 'Cañon de escopeta' when 'canones de escopeta' then 'Cañon de escopeta'
when 'canon de repetidora' then 'Cañon de repetidora' when 'canones de repetidora' then 'Cañon de repetidora' when 'canon de reptidora' then 'Cañon de repetidora'
when 'culata de revolver' then 'Culata de revólver' when 'culatas de revolver' then 'Culata de revólver' when 'culata de revolveres' then 'Culata de revólver' when 'culatas de revolveres' then 'Culata de revólver'
when 'mena de hierro' then 'Hierro' when 'menas de hierro' then 'Hierro'
when 'mena de carbon' then 'Carbón' when 'menas de carbon' then 'Carbón'
when 'tablones' then 'Tabla de madera' when 'tablon' then 'Tabla de madera' when 'tablas de madera' then 'Tabla de madera'
when 'trozo madera' then 'Trozo de madera' when 'trozos de madera' then 'Trozo de madera'
else trim(regexp_replace(n,'\s+',' ','g')) end end $$;

create or replace function public.hg_material_pedido(n text) returns text language plpgsql stable set search_path=pg_catalog,public as $$
declare nombre text; k text;begin
if trim(coalesce(n,''))='' then raise exception 'MATERIAL_INVALIDO';end if;
if translate(lower(trim(n)),'ó','o')='polvora' then return 'Pólvora';end if;
nombre:=public.hg_venta_material(n,false);
select producto into k from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=nombre order by (producto=nombre) desc,producto limit 1;
return coalesce(k,nombre);end $$;

create table if not exists public.hg_reposicion_avisos(
 pedido_id text primary key, recipient_id text not null, texto text not null,
 status text not null default 'pending' check(status in ('pending','sent','cancelled')),
 channel_id text, message_id text, nonce text not null unique,
 attempts integer not null default 0, next_at timestamptz not null default now(),
 last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.hg_reposicion_avisos enable row level security;
revoke all on public.hg_reposicion_avisos from public,anon,authenticated;
grant all on public.hg_reposicion_avisos to service_role;
create index if not exists hg_reposicion_avisos_pending on public.hg_reposicion_avisos(next_at) where status='pending';

create or replace function public.hg_reponer_herreria() returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare cfg jsonb; prov jsonb; limits jsonb; target record; product jsonb; qty integer; incoming integer; wanted integer; price integer;
 items jsonb:='[]'; total bigint:=0; p jsonb; id text; code text; ms bigint; stamp timestamptz:=clock_timestamp(); uid text; texto text; line text;
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
 select valor into limits from public.datos where clave='stockmin';
 for target in select key,value from jsonb_each(cfg->'minimos') order by key loop
  wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);
  if wanted<=0 then continue;end if;
  select coalesce(sum(cantidad),0)::integer into qty from public.stock where producto like 'mat:%' and public.hg_venta_material(substr(producto,5),false)=target.key;
  if qty>=wanted then continue;end if;
  select coalesce(sum(greatest(0,(i->>'qty')::integer-coalesce((i->>'rq')::integer,0))),0)::integer into incoming
  from public.datos d cross join lateral jsonb_array_elements(d.valor->'items') i
  where starts_with(d.clave,'pedido:') and not coalesce((d.valor->>'received')::boolean,false)
   and not coalesce((d.valor->>'cancelled')::boolean,false) and not coalesce((d.valor->>'deleted')::boolean,false)
   and coalesce((d.valor->>'completedAt')::numeric,0)=0 and public.hg_venta_material(i->>'material',false)=target.key;
  wanted:=greatest(0,wanted-qty-incoming);if wanted=0 then continue;end if;
  select x into product from jsonb_array_elements(prov->'prods') x where public.hg_venta_material(x->>'name',false)=target.key limit 1;
  if product is null or coalesce((product->>'price')::integer,0)<=0 then raise exception 'PRECIO_REPOSICION_NO_CONFIGURADO: %',target.key;end if;
  price:=(product->>'price')::integer;
  items:=items||jsonb_build_array(jsonb_build_object('material',substr(target.key,5),'qty',wanted,'price',price));
  total:=total+wanted::bigint*price;
 end loop;
 if jsonb_array_length(items)=0 then return jsonb_build_object('created',false);end if;
 id:='auto-'||gen_random_uuid()::text;ms:=(extract(epoch from stamp)*1000)::bigint;
 code:='PED-'||to_char(stamp at time zone 'Europe/Madrid','DDMMYY-HH24MI')||'-A'||upper(substr(replace(id,'-',''),5,6));
 p:=jsonb_build_object('id',id,'code',code,'ts',ms,'date',to_char(stamp at time zone 'Europe/Madrid','DD/MM/YYYY'),'time',to_char(stamp at time zone 'Europe/Madrid','HH24:MI'),
 'proveedorId',prov->>'id','proveedor',prov->>'name','proveedorTel',prov->>'tel','proveedorTipo',prov->>'tipo',
 'items',items,'totalCents',total,'paid',false,'received',false,'cancelled',false,'completedAt',0,'paidInitial',false,'paidAt',0,'paidBy','','receivedAt',0,'receivedBy','','automatico',true,'origen','reposicion-herreria');
 insert into public.datos(clave,valor,actualizado) values('pedido:'||id,p,stamp);
 texto:='Armería Harrington Gunsmith, Saint Denis.'||E'\nPedido para '||(prov->>'name')||' · Telegrama '||(prov->>'tel')||E':\n\n';
 for product in select * from jsonb_array_elements(items) loop
  texto:=texto||'• '||(product->>'qty')||' × '||(product->>'material')||' a $'||to_char((product->>'price')::numeric/100,'FM999999990.00')||E'\n';
 end loop;
 texto:=texto||E'\nTotal: $'||to_char(total::numeric/100,'FM999999990.00')||E'. Se paga a la entrega.\nReferencia: '||code||E'\n\nAtentamente, Vincent Harrington · Telegrama SD8112\nEl precio de un apellido.';
 insert into public.hg_reposicion_avisos(pedido_id,recipient_id,texto,nonce) values(id,uid,texto,'rep-'||substr(replace(substr(id,6),'-',''),1,20));
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n',id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('created',true,'pedido',p);
end $$;
revoke all on function public.hg_reponer_herreria() from public,anon,authenticated;
grant execute on function public.hg_reponer_herreria() to service_role;
