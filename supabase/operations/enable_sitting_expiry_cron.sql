-- Seulement après accord DEV et application de la migration sitter_availability.
-- Toutes les 15 minutes : les demandes de garde en attente ou acceptées dont la garde a commencé passent à « expirée ».
-- Les fonctions de garde le font déjà au fil de l'eau ; ce minuteur prévient les deux personnes sans attendre leur prochaine action.
select cron.schedule('furrix-sitting-expiry','*/15 * * * *',$job$ select public.expire_sitting_requests(); $job$);
