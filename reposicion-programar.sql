select cron.schedule('harrington-reposicion-herreria','* * * * *',$cron$
 select net.http_post(
  url:='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/harrington-reposicion',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('secreto',(select valor from public.bot_cfg where clave='secreto')),
  timeout_milliseconds:=45000
 );
$cron$);
