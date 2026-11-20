-- Retour arrière du centre commun. Supprime son historique et ses préférences, conserve les alertes animaux perdus.
begin;
drop trigger notify_like on public.swipes;
drop trigger notify_match on public.matches;
drop trigger notify_match_message on public.messages;
drop trigger notify_meeting on public.meeting_proposals;
drop trigger notify_sitting_message on public.sitting_messages;
drop trigger notify_sitting_update on public.sitting_updates;
drop trigger notify_sitting on public.sitting_requests;
drop trigger notify_appointment on public.professional_appointments;
drop trigger enqueue_app_push on public.app_notifications;
delete from public.android_push_jobs where app_notification_id is not null;
alter table public.android_push_jobs drop constraint push_one_notification;
alter table public.android_push_jobs drop column app_notification_id;
alter table public.android_push_jobs alter column notification_id set not null;
create or replace function public.claim_android_push(p_limit integer default 10)
returns table(job_id bigint,lease_id uuid)
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Lot invalide' using errcode='22023';end if;
 -- Une session fermée, une notification lue ou un secteur désactivé ne doit pas être livré plus tard.
 update public.android_push_jobs q set completed_at=clock_timestamp(),last_result='ineligible'
 where q.completed_at is null and (q.lease_until is null or q.lease_until<now()) and not public.android_push_eligible(q.notification_id,q.device_id);
 update public.android_push_jobs set completed_at=clock_timestamp(),last_result='exhausted' where completed_at is null and attempts>=8 and (lease_until is null or lease_until<now());
 return query with pending as (
   select q.id from public.android_push_jobs q where q.completed_at is null and q.available_at<=now() and (q.lease_until is null or q.lease_until<now())
   order by q.id for update skip locked limit p_limit
 ) update public.android_push_jobs q set attempts=q.attempts+1,lease_until=clock_timestamp()+interval '5 minutes',claim_id=gen_random_uuid()
   from pending where q.id=pending.id returning q.id,q.claim_id;
end $$;
create or replace function public.android_push_delivery(p_job bigint,p_claim uuid)
returns table(token text,alert_id uuid,notification_id uuid,kind text)
language sql stable security definer set search_path='' as $$
 select d.token,n.alert_id,n.id,n.kind from public.android_push_jobs q
 join public.android_push_devices d on d.id=q.device_id join public.local_notifications n on n.id=q.notification_id
 where q.id=p_job and q.claim_id=p_claim and q.completed_at is null and q.lease_until>now()
 and public.android_push_eligible(q.notification_id,q.device_id);
$$;

drop function public.android_push_job_eligible(bigint);
drop function public.app_push_eligible(uuid,uuid);
drop function public.enqueue_app_push();
drop function public.notify_app_event();
drop function public.emit_app_notification(uuid,uuid,text,text,text,uuid,uuid,text,text);
drop function public.list_app_notifications(integer,timestamptz,uuid,uuid);
drop function public.read_app_notification(uuid);
drop function public.read_all_app_notifications();
drop function public.get_notification_preferences();
drop function public.set_notification_preference(text,boolean);
drop function public.notification_push_enabled(uuid,text);
drop function public.app_notification_visible(uuid,uuid,text,uuid,uuid);
drop table public.app_notifications;
drop table public.notification_preferences;
commit;