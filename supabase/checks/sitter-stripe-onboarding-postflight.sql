-- Contrôle de catalogue après application de 20261125135930_sitter_stripe_onboarding.sql.
-- Lecture seule : aucune création de compte, aucune donnée lue hors comptage.
begin read only;
do $$
declare f record;
begin
  if to_regclass('public.sitter_stripe_accounts') is null then raise exception 'Table manquante : sitter_stripe_accounts'; end if;
  if not (select relrowsecurity from pg_class where oid='public.sitter_stripe_accounts'::regclass) then raise exception 'RLS absente : sitter_stripe_accounts'; end if;
  if has_table_privilege('anon','public.sitter_stripe_accounts','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.sitter_stripe_accounts','SELECT,INSERT,UPDATE,DELETE')
  then raise exception 'Accès client direct à sitter_stripe_accounts'; end if;
  if not has_table_privilege('service_role','public.sitter_stripe_accounts','SELECT,UPDATE') then raise exception 'Accès serveur absent : sitter_stripe_accounts'; end if;
  -- La plateforme de test est figée dans la contrainte : aucune liaison vers un autre compte Stripe.
  if position('acct_1UfdgzLRlPFxqD3K' in pg_get_constraintdef((select oid from pg_constraint where conrelid='public.sitter_stripe_accounts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%platform_id%'))) = 0
  then raise exception 'Plateforme Stripe inattendue'; end if;

  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('prepare_sitter_stripe_onboarding','attach_sitter_stripe_account','release_sitter_stripe_onboarding','guard_stripe_account_deletion','account_deletion_blockers') loop
    if not f.prosecdef or f.proconfig is null or not ('search_path=""' = any(f.proconfig)) then raise exception 'Définition inattendue : %', f.proname; end if;
    if has_function_privilege('anon', f.oid, 'EXECUTE') then raise exception 'RPC anonyme : %', f.proname; end if;
    if f.proname in ('prepare_sitter_stripe_onboarding','account_deletion_blockers') and not has_function_privilege('authenticated', f.oid, 'EXECUTE')
    then raise exception 'RPC client absente : %', f.proname; end if;
    if f.proname in ('attach_sitter_stripe_account','release_sitter_stripe_onboarding','guard_stripe_account_deletion') and has_function_privilege('authenticated', f.oid, 'EXECUTE')
    then raise exception 'RPC serveur exposée au client : %', f.proname; end if;
    if f.proname in ('attach_sitter_stripe_account','release_sitter_stripe_onboarding') and not has_function_privilege('service_role', f.oid, 'EXECUTE')
    then raise exception 'RPC serveur absente : %', f.proname; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('prepare_sitter_stripe_onboarding','attach_sitter_stripe_account','release_sitter_stripe_onboarding','guard_stripe_account_deletion')) <> 4
  then raise exception 'Fonctions manquantes ou surcharges inattendues'; end if;
  if not exists (select 1 from pg_trigger where tgname='stripe_account_deletion' and tgrelid='public.account_deletions'::regclass and not tgisinternal)
  then raise exception 'Déclencheur de suppression absent'; end if;
  if position('sitter_stripe_accounts' in pg_get_functiondef('public.account_deletion_blockers()'::regprocedure)) = 0
  then raise exception 'Motif « paiement » absent des blocages de suppression'; end if;
end $$;
select count(*) as liaisons,
       count(stripe_account_id) as comptes_relies,
       count(*) filter (where stripe_account_id is null) as sans_compte,
       count(*) filter (where lease_until > clock_timestamp()) as baux_actifs
from public.sitter_stripe_accounts;
rollback;
