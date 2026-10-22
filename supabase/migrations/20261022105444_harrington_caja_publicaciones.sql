insert into public.bot_cfg(clave,valor) values('canal_cierres','1520882256175042752') on conflict(clave) do update set valor=excluded.valor;
select cron.schedule('harrington-caja-publicaciones','* * * * *',$job$
select net.http_post(
 url:='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/hacer-caja',
 headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('cron',true,'secreto',(select valor from public.bot_cfg where clave='secreto')),
 timeout_milliseconds:=50000
);
$job$);
