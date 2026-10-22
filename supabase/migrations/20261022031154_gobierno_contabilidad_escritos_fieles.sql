-- El escrito financiero conserva los importes y destinatarios del expediente original.
create or replace function public.gob_hacienda_escrito_fiel()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if old.tipo='decreto' and old.datos->>'hacienda_id' is not null and ((new.datos->'titulo',new.datos->'texto',new.datos->'importeCents',new.datos->'hacienda_id',new.datos->'expediente',new.datos->'clase') is distinct from (old.datos->'titulo',old.datos->'texto',old.datos->'importeCents',old.datos->'hacienda_id',old.datos->'expediente',old.datos->'clase')) then raise exception 'ESCRITO_FINANCIERO_INMUTABLE';end if;
 return new;
end $$;
revoke all on function public.gob_hacienda_escrito_fiel() from public,anon,authenticated;
grant execute on function public.gob_hacienda_escrito_fiel() to service_role;
create trigger gob_hacienda_escrito_fiel before update on public.gob_registros for each row execute function public.gob_hacienda_escrito_fiel();
create or replace function public.gob_hacienda_balance(p_desde timestamptz default null)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('ingresos',coalesce(sum(greatest((datos->>'cents')::bigint,0)),0),'gastos',coalesce(sum(greatest(-(datos->>'cents')::bigint,0)),0),'cantidad',count(*)) from public.gob_registros where tipo='movimiento' and (p_desde is null or creado>=p_desde);
$$;
revoke all on function public.gob_hacienda_balance(timestamptz) from public,anon,authenticated;
grant execute on function public.gob_hacienda_balance(timestamptz) to service_role;
