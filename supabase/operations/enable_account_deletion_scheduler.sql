-- Seulement après accord DEV, migration et déploiement du worker.
-- Vault furrix_account_deletion_worker = FURRIX_ACCOUNT_DELETION_WORKER_SECRET côté Edge.
-- Ne pas réutiliser le secret du push. Aucune demande d'effacement n'est créée par ce minuteur.
select cron.schedule('furrix-account-deletion','* * * * *',$job$
 select net.http_post(url:='https://jemikzqgbpaivlujnfgl.supabase.co/functions/v1/account-deletion-worker',
 headers:=jsonb_build_object('Content-Type','application/json','x-furrix-worker-key',decrypted_secret),
 body:='{}'::jsonb,timeout_milliseconds:=120000)
 from vault.decrypted_secrets where name='furrix_account_deletion_worker' limit 1;
$job$);
