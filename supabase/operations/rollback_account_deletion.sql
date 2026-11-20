-- Désactiver d'abord l'endpoint (FURRIX_ACCOUNT_DELETION_ENABLED=false) et le minuteur.
-- Refus dès qu'une demande existe : les effacements réels ne sont pas réversibles.
begin;
do $$begin if exists(select 1 from public.account_deletions) then raise exception 'Retour arrière refusé : une demande de suppression existe';end if;end $$;
do $$declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_policy p on p.polrelid=c.oid where n.nspname='public' and p.polname='account_not_deleted' loop
  execute format('drop policy account_not_deleted on public.%I',t.relname);
 end loop;
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_trigger g on g.tgrelid=c.oid where n.nspname='public' and g.tgname='account_open_insert' loop
  execute format('drop trigger account_open_insert on public.%I',t.relname);
 end loop;
end $$;
drop policy account_open on public.profiles;
drop function public.finish_account_deletion(uuid,uuid,boolean);
drop function public.account_deletion_files(uuid,uuid);
drop function public.clean_account_data(uuid,uuid);
drop function public.claim_account_deletion();
drop function public.request_account_deletion(uuid);
drop function public.account_deletion_blockers();
drop function public.account_deletion_blockers_for(uuid);
drop function public.guard_open_accounts();
drop function public.account_is_open();
drop function public.account_deletion_pending(uuid);
drop table public.account_deletions;
commit;
