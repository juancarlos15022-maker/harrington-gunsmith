-- Cola transaccional: solo el servidor puede leerla o modificarla.
create schema if not exists hg_interno;
revoke all on schema hg_interno from public,anon,authenticated;
create table public.hg_discord_outbox(
 kind text not null check(kind in ('stock','materiales','fichajes')),
 record_key text not null, snapshot jsonb not null default '{}',
 version bigint not null default 1, attempts integer not null default 0,
 next_at timestamptz not null default now(), last_error text,
 primary key(kind,record_key)
);
alter table public.hg_discord_outbox enable row level security;
revoke all on public.hg_discord_outbox from public,anon,authenticated;
grant all on public.hg_discord_outbox to service_role;
create index hg_discord_outbox_due on public.hg_discord_outbox(next_at);

-- Actualizar solo la referencia, sin sobrescribir ajustes simultáneos.
create function public.hg_discord_referencia(p_kind text,p_id text,p_webhook text) returns void
language sql security invoker set search_path=pg_catalog,public as $$
 update public.datos set valor=jsonb_set(valor,'{refs}',coalesce(valor->'refs','{}')||jsonb_build_object(p_kind,jsonb_build_object('id',p_id,'w',p_webhook))),actualizado=now()
 where clave='discord' and p_kind in ('stock','materiales');
$$;
revoke all on function public.hg_discord_referencia(text,text,text) from public,anon,authenticated;
grant execute on function public.hg_discord_referencia(text,text,text) to service_role;

create function hg_interno.discord_encolar() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text; r text; v jsonb;
begin
 if tg_table_name='stock' then
  if tg_op='UPDATE' and old.cantidad is not distinct from new.cantidad and old.minimo is not distinct from new.minimo then return new; end if;
  k:=case when coalesce(new.producto,old.producto) like 'mat:%' or coalesce(new.producto,old.producto)='Pólvora' then 'materiales' else 'stock' end;
  r:=k;v:='{}';
 else
  if new.clave not like 'fichaje:%' and new.clave not like 'turno:%' then return new;end if;
  v:=new.valor;
  if coalesce((v->>'deleted')::boolean,false) or jsonb_typeof(v->'start') is distinct from 'number' or coalesce(v->>'name','')='' then return new;end if;
  if (v->>'start')::numeric<=0 then return new;end if;
  if new.clave like 'turno:%' and (jsonb_typeof(v->'end') is distinct from 'number' or (v->>'end')::numeric<(v->>'start')::numeric) then return new;end if;
  if tg_op='UPDATE' and old.valor=new.valor then return new;end if;
  k:='fichajes';r:=new.clave||':'||(v->>'start');
  v:=v||jsonb_build_object('ref',new.clave);
 end if;
 insert into public.hg_discord_outbox(kind,record_key,snapshot) values(k,r,v)
 on conflict(kind,record_key) do update set snapshot=excluded.snapshot,version=hg_discord_outbox.version+1,next_at=now(),attempts=0,last_error=null;
 return new;
end $$;
revoke all on function hg_interno.discord_encolar() from public,anon,authenticated;
create trigger hg_discord_stock after insert or update or delete on public.stock for each row execute function hg_interno.discord_encolar();
create trigger hg_discord_fichajes after insert or update on public.datos for each row when(new.clave like 'fichaje:%' or new.clave like 'turno:%') execute function hg_interno.discord_encolar();
