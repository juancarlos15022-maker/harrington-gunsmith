-- Publications are recorded in the same transaction as each business change.
create table public.gob_difusion (
 id bigint generated always as identity primary key,
 registro_id bigint not null,
 revision text not null,
 destino text not null check (destino in ('area_economia','area_comercio','area_justicia','area_seguridad','registro','actas','seguimiento')),
 registro jsonb not null,
 creado timestamptz not null default now(),
 enviado timestamptz,
 canal_id text,
 mensaje_id text,
 intentos integer not null default 0,
 error text,
 bloqueado_hasta timestamptz,
 proximo_intento timestamptz not null default now(),
 unique(registro_id,revision,destino)
);
create index gob_difusion_pendiente on public.gob_difusion(proximo_intento,id) where enviado is null;
alter table public.gob_difusion enable row level security;
revoke all on public.gob_difusion from public,anon,authenticated;
grant all on public.gob_difusion to service_role;
grant usage,select on sequence public.gob_difusion_id_seq to service_role;
create or replace function public.gob_encolar_difusion() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare actual jsonb; anterior jsonb; destinos text[]:=array['seguimiento']; area text; rev text;
begin
 if new.tipo='hci_panel' then return new; end if;
 actual:=(to_jsonb(new)-array['actualizado','canal_id','mensaje_id','avisado'])||jsonb_build_object('datos',new.datos-'_discord');
 if tg_op='UPDATE' then
  anterior:=(to_jsonb(old)-array['actualizado','canal_id','mensaje_id','avisado'])||jsonb_build_object('datos',old.datos-'_discord');
  if actual=anterior then return new; end if;
 end if;
 area:=new.datos->>'area';
 if new.tipo in ('decreto','secretaria') and area in ('economia','comercio','justicia','seguridad') then destinos:=array_append(destinos,'area_'||area); end if;
 if new.tipo='decreto' and new.estado='firmado' then destinos:=array_append(destinos,'registro'); end if;
 rev:=md5((actual||jsonb_build_object('actualizado',new.actualizado))::text);
 insert into public.gob_difusion(registro_id,revision,destino,registro)
 select new.id,rev,d,actual||jsonb_build_object('actualizado',new.actualizado) from unnest(destinos) d
 on conflict(registro_id,revision,destino) do nothing;
 return new;
end $$;
revoke all on function public.gob_encolar_difusion() from public,anon,authenticated;
grant execute on function public.gob_encolar_difusion() to service_role;
create trigger gob_difusion_cambios after insert or update on public.gob_registros for each row execute function public.gob_encolar_difusion();
