-- Lecture seule. Exécuter avant activation, puis après installation des prérequis.
-- Ne crée aucune demande, ne révèle aucun secret et ne supprime aucune donnée.
select name, ready from (values
 ('suivi des demandes', to_regclass('public.account_deletions') is not null),
 ('enregistrement de demande', to_regprocedure('public.request_account_deletion(uuid)') is not null),
 ('nettoyage sous bail', to_regprocedure('public.clean_account_data(uuid,uuid)') is not null),
 ('liste des fichiers', to_regprocedure('public.account_deletion_files(uuid,uuid)') is not null),
 ('finalisation contrôlée', to_regprocedure('public.finish_account_deletion(uuid,uuid,boolean)') is not null),
 ('disponibilités de garde', to_regclass('public.sitter_unavailability') is not null),
 ('effacement des absences', exists(select 1 from pg_trigger where tgname='forget_sitter_availability' and not tgisinternal)),
 ('lecture des absences protégée', exists(select 1 from pg_policies where schemaname='public' and tablename='sitter_unavailability' and policyname='account_not_deleted' and permissive='RESTRICTIVE'))
) checks(name,ready);

-- Les extensions cron et Vault existent déjà sur DEV pour les notifications.
select exists(select 1 from cron.job where jobname='furrix-account-deletion' and active) as scheduler_active,
       exists(select 1 from vault.secrets where name='furrix_account_deletion_worker') as worker_secret_present;
-- Vérifier séparément les deux fonctions Edge, le secret Edge correspondant,
-- l'appel à vide du worker et le dernier passage réussi du minuteur.
