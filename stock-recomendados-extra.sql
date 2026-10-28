-- Recomendados de materias primas, sin cambiar mínimos ni existencias.
update public.datos set valor=jsonb_set(valor,'{recomendados}',coalesce(valor->'recomendados','{}')||'{"mat:Papel":1000,"mat:Fibra":700,"mat:Tabla de madera":20,"mat:Trozo de madera":500}'::jsonb),actualizado=now() where clave='cfg:reposicion-tala';
update public.datos set valor=jsonb_set(valor,'{recomendados}',coalesce(valor->'recomendados','{}')||'{"mat:Azufre":600,"mat:Carbón":600,"mat:Sal":600,"mat:Hierro":500}'::jsonb),actualizado=now() where clave='cfg:reposicion-mina';
do $patch$
declare signature text; src text; old text;
begin
 foreach signature in array array['public.hg_reponer_mina()','public.hg_reponer_lotes(text)'] loop
 select pg_get_functiondef(signature::regprocedure) into src;
 if position('RECOMENDADOS_MATERIAS_PRIMAS' in src)>0 then continue;end if;
 src:=replace(src,'select valor into limits from public.datos where clave=''stockmin'';', $new$-- RECOMENDADOS_MATERIAS_PRIMAS
 select valor into limits from public.datos where clave='stockmin';
 -- Recalcular las líneas con recomendado; conservar los antiguos lotes sin objetivo.
 if prop is not null then
 select coalesce(jsonb_agg(i),'[]'::jsonb) into items from jsonb_array_elements(prop->'items') i where not (coalesce(cfg->'recomendados','{}'::jsonb) ? public.hg_venta_material(i->>'material',false));
 select coalesce(sum((i->>'qty')::bigint*(i->>'price')::bigint),0) into total from jsonb_array_elements(items) i;
 end if;$new$);
 src:=replace(src,'wanted:=coalesce((limits->>target.key)::integer,(target.value)::integer);','wanted:=greatest(coalesce((limits->>target.key)::integer,(target.value)::integer),coalesce((cfg->''recomendados''->>target.key)::integer,0));');
 src:=replace(src,'where starts_with(d.clave,''pedido:'') and not', 'where starts_with(d.clave,''pedido:'') and (d.clave<>pkey or not (coalesce(cfg->''recomendados'',''{}''::jsonb) ? target.key)) and not');
 if signature='public.hg_reponer_mina()' then
 old:='wanted:=coalesce((cfg->>''lote'')::integer,200);';
 else
 old:='wanted:=coalesce((cfg->''lotes''->>target.key)::integer,(cfg->>''lote'')::integer,100);';
 end if;
 src:=replace(src,old,'if coalesce((cfg->''recomendados''->>target.key)::integer,0)>0 then wanted:=wanted-qty;else '||old||' end if;');
 src:=replace(src,'if jsonb_array_length(items)=0 then return jsonb_build_object(''created'',false);end if;', $new$if jsonb_array_length(items)=0 then
 if pkey<>'' then
 update public.datos set valor=valor||jsonb_build_object('cancelled',true,'propuesta',false,'propuestaCerrada','sin-faltas'),actualizado=stamp where clave=pkey;
 update public.hg_reposicion_avisos set version=version+1 where pedido_id=prop->>'id';
 end if;
 return jsonb_build_object('created',false);end if;$new$);
 src:=replace(src,'''items'',(prop->''items'')||items,''totalCents'',coalesce((prop->>''totalCents'')::bigint,0)+total', '''items'',items,''totalCents'',total');
 src:=replace(src,'if pkey<>'''' then'||chr(10)||'  prop:=', 'if pkey<>'''' then'||chr(10)||'  if prop->''items''=items then return jsonb_build_object(''created'',false);end if;'||chr(10)||'  prop:=');
 if position('wanted:=wanted-qty' in src)=0 then raise exception 'PATCH_NO_APLICADO %',signature;end if;
 execute src;
 end loop;
end $patch$;
