-- À autoriser après déploiement du worker. Le secret Vault doit être identique au secret Edge.
-- Aucun appel tant que le secret nommé n’existe pas. Aucun destinataire fourni au worker.
create extension if not exists pg_net with schema extensions;
select cron.schedule('furrix-android-push','* * * * *',$job$
 select net.http_post(url:='https://jemikzqgbpaivlujnfgl.supabase.co/functions/v1/android-push-worker',
 headers:=jsonb_build_object('Content-Type','application/json','x-furrix-worker-key',decrypted_secret),
 body:='{}'::jsonb,timeout_milliseconds:=120000)
 from vault.decrypted_secrets where name='furrix_android_push_worker' limit 1;
$job$);
