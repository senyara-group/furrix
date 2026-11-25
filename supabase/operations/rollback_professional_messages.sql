-- Retour arrière de professional_messages : supprime la messagerie Services et son historique (seules données perdues).
begin;
do $$ begin
  if to_regclass('public.account_deletions') is not null then
    drop trigger if exists forget_professional_messages on public.account_deletions;
  end if;
end $$;
drop function if exists public.list_professional_threads();
drop function if exists public.send_professional_message(uuid,text,uuid);
drop table if exists public.professional_messages;
drop function if exists public.notify_professional_message();
drop function if exists public.forget_professional_messages();
drop function if exists public.is_professional_appointment_party(uuid);
commit;
