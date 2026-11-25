-- Ne jamais perdre une liaison Stripe, même si la création n'a pas encore été confirmée.
-- Désactiver FURRIX_STRIPE_ONBOARDING_ENABLED et attendre la fin des appels Edge avant exécution.
begin;
lock table public.sitter_stripe_accounts in access exclusive mode;
do $$ begin
 if exists(select 1 from public.sitter_stripe_accounts) then
  raise exception 'Liaisons Stripe présentes : rapprochement et fermeture nécessaires avant retour arrière';
 end if;
end $$;
drop trigger stripe_account_deletion on public.account_deletions;
drop function public.guard_stripe_account_deletion();
drop function public.release_sitter_stripe_onboarding(uuid,uuid);
drop function public.attach_sitter_stripe_account(uuid,uuid,text);
drop function public.prepare_sitter_stripe_onboarding(boolean);
create or replace function public.account_deletion_blockers() returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501';end if;
 return query select * from public.account_deletion_blockers_for(auth.uid());
end $$;
drop table public.sitter_stripe_accounts;
commit;
