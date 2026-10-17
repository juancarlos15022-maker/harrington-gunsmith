CREATE OR REPLACE FUNCTION public.hg_polvora_plan(p_made jsonb, p_used jsonb, p_sold jsonb, p_stock jsonb, p_recipes jsonb, p_encargo text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare deficit int;r jsonb;k text;begin
if not public.hg_permitido() then raise exception 'SIN_CUENTA';end if;
deficit:=greatest(0,coalesce((p_used->>'Pólvora')::int,0)+coalesce((p_sold->>'Pólvora')::int,0)-greatest(0,coalesce((p_stock->>'Pólvora')::int,0)-public.hg_reservadas('Pólvora',p_encargo))-coalesce((p_made->>'Pólvora')::int,0));
if deficit>0 then
 if jsonb_typeof(p_recipes->'Pólvora') is distinct from 'array' or jsonb_array_length(p_recipes->'Pólvora')=0 then raise exception 'RECETA_INVALIDA: Pólvora';end if;
 p_made:=jsonb_set(p_made,array['Pólvora'],to_jsonb(coalesce((p_made->>'Pólvora')::int,0)+deficit));
 for r in select * from jsonb_array_elements(p_recipes->'Pólvora') loop
  k:=public.hg_venta_material(r->>'m',coalesce((r->>'p')::boolean,false));
  if coalesce((r->>'q')::numeric,0)<=0 or (r->>'q')::numeric<>trunc((r->>'q')::numeric) or k='Pólvora' then raise exception 'RECETA_INVALIDA: Pólvora';end if;
  p_used:=jsonb_set(p_used,array[k],to_jsonb(coalesce((p_used->>k)::int,0)+deficit*(r->>'q')::int));
 end loop;
end if;
return jsonb_build_object('made',p_made,'used',p_used,'autoPowder',deficit);end $function$

