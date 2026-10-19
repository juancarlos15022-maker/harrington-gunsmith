-- HARRINGTON · 19/10/2026 · Retratos de los empleados (aplicada como migración «fotos_propias_empleados»)
-- Cada empleado puede subir, cambiar o quitar SOLO la foto de su propio personaje (clave foto-<su id>),
-- desde «Mi ficha». Antes solo podía hacerlo la Dirección. La foto no puede pasar de 250 KB.
-- No toca nada más: el resto de permisos de escritura y borrado se quedan igual.
create or replace function public.hg_dato_escritura(k text, v jsonb)
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog', 'public'
as $function$
select public.hg_es_director()
or (public.hg_es_jefe() and not (k in ('discord','jefe','acceso','reset') or k like 'clave-%' or k like 'security:%'))
or (public.hg_contexto() and (k='npc:estado' or k='rev' or k like 'sorteo-%' or split_part(k,':',1) in ('venta','encargo','gasto','autoventa','fablote','act','mov','invc','npcop','npcrev')))
or (public.hg_contexto() and current_setting('hg.operacion',true)='pedido' and (k like 'pedido:%' or k like 'recibido-%'))
or (public.hg_permitido() and (not coalesce((v->>'deleted')::boolean,false) or k like 'fichaje:%') and (k in ('rev','clientes','agenda') or split_part(k,':',1) in ('turno','fichaje','ausencia','log','act','dcerr','nota') or k like 'presencia-%' or k like 'fab-%'))
or (public.hg_permitido() and k = 'foto-' || coalesce(public.hg_claims()->'app_metadata'->>'emp_id','~') and length(coalesce(v::text,'')) < 250000)
$function$;

alter policy borrar on public.datos using (
  hg_es_jefe()
  or (hg_permitido() and ((clave like 'presencia-%') or (clave like 'fab-%')))
  or (hg_permitido() and clave = 'foto-' || coalesce(hg_claims()->'app_metadata'->>'emp_id','~'))
);
