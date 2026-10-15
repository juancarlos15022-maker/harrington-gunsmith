-- Inventario físico: funciones nuevas, SECURITY INVOKER y RLS existentes.
create or replace function public.inventario_preparar()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare emp text := public.hg_claims()->'app_metadata'->>'emp_id';
begin
 if not public.hg_permitido() or not exists(select 1 from public.datos d,jsonb_array_elements(d.valor) e where d.clave='empleados' and e->>'id'=emp and e->>'puesto'='Jefe') then raise exception 'SOLO_JEFES'; end if;
 return (select coalesce(jsonb_object_agg(producto,jsonb_build_object('q',cantidad,'v',xmin::text)),'{}') from public.stock);
end $$;

create or replace function public.inventario_guardar(p_peticion text,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 emp text:=public.hg_claims()->'app_metadata'->>'emp_id'; jefe text; old jsonb; it jsonb; val jsonb;
 records jsonb:='[]'; items jsonb:='[]'; moves jsonb:='[]'; conflicts jsonb:='[]'; warnings jsonb:='[]'; result jsonb;
 k text; token text; rid text; uid text; n text; actual integer; teo integer; fis integer; dif integer; idx integer:=0; changed integer:=0;
 stamp timestamptz:=clock_timestamp();ms bigint; npc_data jsonb; npc_changed boolean:=false;
begin
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
 for it in select * from jsonb_array_elements(p_items) loop
  k:=it->>'k';
  if coalesce(k,'')='' or length(k)>200 or coalesce(it->>'fis','')!~'^[0-9]{1,6}$' or coalesce(it->>'teo','')!~'^[0-9]{1,9}$' then raise exception 'CANTIDAD_INVALIDA'; end if;
  teo:=(it->>'teo')::integer;fis:=(it->>'fis')::integer;
  actual:=null;token:=null;select cantidad,xmin::text into actual,token from public.stock where producto=k;
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
end $$;
revoke execute on function public.inventario_preparar(),public.inventario_guardar(text,jsonb) from public,anon;
grant execute on function public.inventario_preparar(),public.inventario_guardar(text,jsonb) to authenticated;
