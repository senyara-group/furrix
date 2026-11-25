begin;
-- La messagerie Services dépend des rendez-vous : elle est retirée d'abord (voir rollback_professional_messages.sql).
do $$ begin
  if to_regclass('public.account_deletions') is not null then drop trigger if exists forget_professional_messages on public.account_deletions; end if;
end $$;
drop function if exists public.list_professional_threads();
drop function if exists public.send_professional_message(uuid,text,uuid);
drop table if exists public.professional_messages;
drop function if exists public.notify_professional_message();
drop function if exists public.forget_professional_messages();
drop function if exists public.is_professional_appointment_party(uuid);
drop function public.list_professional_appointments(uuid);
drop function public.update_professional_appointment(uuid,text,uuid,text);
drop function public.request_professional_appointment(uuid,uuid,text,text,boolean,uuid);
drop function public.list_professional_slots(uuid);
drop function public.close_professional_slot(uuid);
drop function public.publish_professional_slot(uuid,timestamptz,timestamptz);
drop table public.professional_appointments;
drop table public.professional_slots;
commit;
