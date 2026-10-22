-- Modificación de pedidos aceptados y aún por recibir. Cualquier jefe vigente.
create table public.hg_pedido_ediciones(id uuid primary key,pedido_id text not null,creado timestamptz not null default clock_timestamp(),emp_id text not null,nombre text not null,huella text not null,antes jsonb not null,despues jsonb not null,nota text not null default '');
alter table public.hg_pedido_ediciones enable row level security;
revoke all on public.hg_pedido_ediciones from public,anon,authenticated;
grant all on public.hg_pedido_ediciones to service_role;
create index hg_pedido_ediciones_pedido on public.hg_pedido_ediciones(pedido_id,creado desc);

create function public.hg_pedido_editar_preparar(p_pedido text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare p jsonb;h jsonb;begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES' using errcode='42501';end if;
 select valor into p from public.datos where clave='pedido:'||p_pedido;
 if p is null or coalesce((p->>'deleted')::boolean,false) then raise exception 'PEDIDO_NO_EXISTE';end if;
 if coalesce((p->>'received')::boolean,false) or coalesce((p->>'cancelled')::boolean,false) or coalesce((p->>'remainderCancelled')::boolean,false) or coalesce((p->>'completedAt')::numeric,0)>0 then raise exception 'PEDIDO_CERRADO';end if;
 if coalesce((p->>'propuesta')::boolean,false) then raise exception 'PROPUESTA_SIN_ACEPTAR';end if;
 select coalesce(jsonb_agg(jsonb_build_object('fecha',creado,'por',nombre,'nota',nota,'totalAntes',antes->'totalCents','totalDespues',despues->'totalCents') order by creado desc),'[]') into h from (select * from public.hg_pedido_ediciones where pedido_id=p_pedido order by creado desc limit 30) x;
 return jsonb_build_object('pedido',p,'version',md5(p::text),'historial',h);
end $$;
revoke all on function public.hg_pedido_editar_preparar(text) from public,anon;
grant execute on function public.hg_pedido_editar_preparar(text) to authenticated;

create function public.hg_pedido_editar_guardar(p_id uuid,p_pedido text,p_version text,p_items jsonb,p_nota text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare p jsonb;nuevo jsonb;row jsonb;oldrow jsonb;items jsonb:='[]';used int[]:='{}';idx int;qty bigint;price bigint;rq int;total bigint:=0;abonado bigint;emp text;nom text;old public.hg_pedido_ediciones;h text;material text;mk text;keys text[]:='{}';stamp timestamptz:=clock_timestamp();act jsonb;begin
 if not public.hg_es_jefe() then raise exception 'SOLO_JEFES' using errcode='42501';end if;
 emp:=public.hg_claims()->'app_metadata'->>'emp_id';select e->>'name' into nom from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp;
 if emp is null or nom is null then raise exception 'SOLO_JEFES';end if;
 h:=md5(jsonb_build_array(p_pedido,p_version,p_items,p_nota)::text);
 lock table public.datos in share row exclusive mode;
 select * into old from public.hg_pedido_ediciones where id=p_id;
 if found then
  if old.emp_id<>emp or old.huella<>h then raise exception 'PETICION_REUTILIZADA';end if;
  select valor into nuevo from public.datos where clave='pedido:'||p_pedido;
  return jsonb_build_object('pedido',nuevo,'replayed',true,'id',p_id);
 end if;
 if p_id is null or length(coalesce(p_nota,''))>1000 then raise exception 'PETICION_INVALIDA';end if;
 p:=public.hg_pedido_editar_preparar(p_pedido)->'pedido';
 if p_version is distinct from md5(p::text) then raise exception 'PEDIDO_CAMBIADO';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 60 then raise exception 'LINEAS_INVALIDAS';end if;
 -- Primero las líneas originales: no se puede alterar el material ni revalorizar lo ya recibido.
 for row in select x from jsonb_array_elements(p_items) with ordinality as t(x,ord) order by case when x->>'indice' is null then 1 else 0 end,ord loop
  oldrow:='{}';idx:=null;rq:=0;
  if row->>'indice' is not null then
   if row->>'indice' !~ '^[0-9]{1,5}$' then raise exception 'LINEAS_INVALIDAS';end if;
   idx:=(row->>'indice')::int;
   if idx>=jsonb_array_length(p->'items') or idx=any(used) then raise exception 'LINEAS_INVALIDAS';end if;
   used:=array_append(used,idx);oldrow:=p->'items'->idx;rq:=coalesce((oldrow->>'rq')::int,0);material:=oldrow->>'material';
   if row->>'material' is distinct from material then raise exception 'MATERIAL_CAMBIADO';end if;
  else
   material:=trim(regexp_replace(coalesce(row->>'material',''),'\s+',' ','g'));
   if length(material) not between 1 and 150 then raise exception 'MATERIAL_INVALIDO';end if;
   mk:=public.hg_material_pedido(material);material:=case when mk like 'mat:%' then substr(mk,5) else mk end;
  end if;
  if coalesce(row->>'qty','') !~ '^[0-9]{1,6}$' or coalesce(row->>'price','') !~ '^[0-9]{1,9}$' then raise exception 'CANTIDAD_PRECIO_INVALIDO';end if;
  qty:=(row->>'qty')::bigint;price:=(row->>'price')::bigint;
  if qty<=0 or qty<rq then raise exception 'MENOS_DE_LO_RECIBIDO';end if;
  if rq>0 and price<>(oldrow->>'price')::bigint then raise exception 'PRECIO_RECIBIDO_BLOQUEADO';end if;
  mk:=public.hg_material_pedido(material);
  if idx is null and mk=any(keys) then raise exception 'MATERIAL_DUPLICADO';end if;keys:=array_append(keys,mk);
  total:=total+qty*price;if total>100000000000 then raise exception 'TOTAL_INVALIDO';end if;
  items:=items||jsonb_build_array(oldrow||jsonb_build_object('material',material,'qty',qty,'price',price,'rq',rq));
 end loop;
 for idx in 0..jsonb_array_length(p->'items')-1 loop
  if not idx=any(used) and coalesce((p->'items'->idx->>'rq')::int,0)>0 then raise exception 'LINEA_RECIBIDA_NO_ELIMINABLE';end if;
 end loop;
 if total<=0 then raise exception 'TOTAL_INVALIDO';end if;
 abonado:=case when coalesce((p->>'paid')::boolean,false) or coalesce((p->>'paidInitial')::boolean,false) then (p->>'totalCents')::bigint else coalesce((p->>'abonoCents')::bigint,0) end;
 if total<abonado then raise exception 'TOTAL_INFERIOR_AL_ABONO';end if;
 nuevo:=p||jsonb_build_object('items',items,'totalCents',total,'abonoCents',abonado,'paid',abonado=total,'paidInitial',abonado=total and coalesce((p->>'paidInitial')::boolean,false),'editadoAt',(extract(epoch from stamp)*1000)::bigint,'editadoPor',nom,'ediciones',coalesce((p->>'ediciones')::int,0)+1,'notaEdicion',trim(coalesce(p_nota,'')));
 if items=(select jsonb_agg(x||jsonb_build_object('rq',coalesce((x->>'rq')::int,0))) from jsonb_array_elements(p->'items') x) and total=(p->>'totalCents')::bigint then raise exception 'SIN_CAMBIOS';end if;
 update public.datos set valor=nuevo,actualizado=stamp where clave='pedido:'||p_pedido;
 insert into public.hg_pedido_ediciones(id,pedido_id,emp_id,nombre,huella,antes,despues,nota) values(p_id,p_pedido,emp,nom,h,p,nuevo,trim(coalesce(p_nota,'')));
 act:=jsonb_build_object('id','pededit-'||p_id,'ts',(extract(epoch from stamp)*1000)::bigint,'tipo','pedido editado','who',nom,'empId',emp,'data',jsonb_build_object('pedido',p_pedido,'codigo',p->>'code','antes',p->'totalCents','despues',total,'nota',trim(coalesce(p_nota,''))));
 insert into public.datos(clave,valor,actualizado) values('act:pededit-'||p_id,act,stamp);
 insert into public.datos(clave,valor,actualizado) values('rev',jsonb_build_object('n','pededit-'||p_id),stamp) on conflict(clave) do update set valor=excluded.valor,actualizado=excluded.actualizado;
 return jsonb_build_object('pedido',nuevo,'replayed',false,'id',p_id);
end $$;
revoke all on function public.hg_pedido_editar_guardar(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.hg_pedido_editar_guardar(uuid,text,text,jsonb,text) to authenticated;
