insert into public.bot_cfg(clave,valor) values('canal_ventas_potenciales','1562785714658091099') on conflict(clave) do update set valor=excluded.valor;
select cron.schedule('harrington-ventas-potenciales','* * * * *',$job$
select net.http_post(url:='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/ventas-potenciales',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('secreto',(select valor from public.bot_cfg where clave='secreto')),timeout_milliseconds:=50000);
$job$);
