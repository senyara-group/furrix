-- Arrêter le minuteur avant ce retour arrière. Ne touche pas aux alertes ni aux comptes.
begin;
drop trigger enqueue_android_push on public.local_notifications;
drop function public.enqueue_android_push();
drop function public.register_android_push(uuid,uuid,text);
drop function public.remove_android_push(uuid,uuid);
drop function public.android_push_status(uuid);
drop function public.android_push_session();
drop function public.claim_android_push(integer);
drop function public.android_push_delivery(bigint,uuid);
drop function public.finish_android_push(bigint,uuid,text,text);
drop function public.android_push_eligible(uuid,uuid);
drop table public.android_push_jobs;
drop table public.android_push_devices;
commit;
