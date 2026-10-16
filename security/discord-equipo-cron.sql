-- El secreto se lee en el servidor; nunca se copia a archivos ni al cliente.
select cron.schedule('harrington-equipo','30 seconds',$job$
 select net.http_post(
  url := 'https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/discord-equipo',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := jsonb_build_object('secreto',(select valor from public.bot_cfg where clave='secreto')),
  timeout_milliseconds := 15000
 );
$job$);
select cron.schedule('harrington-equipo-limpieza','35 3 * * *',$job$
 delete from public.bot_equipo where kind='interaction' and created_at<now()-interval '7 days';
 delete from public.bot_equipo where kind='voice_watch' and status in ('delivered','cancelled','expired') and updated_at<now()-interval '30 days';
$job$);
