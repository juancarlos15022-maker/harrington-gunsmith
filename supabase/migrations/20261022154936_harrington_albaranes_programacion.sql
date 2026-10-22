select cron.schedule('harrington-albaranes-firmados','* * * * *',$job$
select net.http_post(url:='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/albaranes-pedidos',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('secreto',(select valor from public.bot_cfg where clave='secreto')),timeout_milliseconds:=50000);
$job$);
