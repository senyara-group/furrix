-- Préparation uniquement : ne déployer qu'avec la fonction Edge et sa configuration de test.
begin;
create table public.sitter_stripe_accounts (
 user_id uuid primary key references auth.users(id),
 platform_id text not null check(platform_id='acct_1UfdgzLRlPFxqD3K'),
 stripe_account_id text unique check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 creation_key uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 claim uuid, lease_until timestamptz, last_link_at timestamptz
);
alter table public.sitter_stripe_accounts enable row level security;
revoke all on public.sitter_stripe_accounts from public,anon,authenticated;
grant all on public.sitter_stripe_accounts to service_role;

-- Le JWT reste celui du gardien, même lorsque l'appel est effectué par la fonction Edge.
create function public.prepare_sitter_stripe_onboarding(p_start boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); r public.sitter_stripe_accounts; sid text;
begin
 perform 1 from public.profiles where id=uid for update;
 if not found or public.account_deletion_pending(uid) then raise exception 'Compte fermé' using errcode='42501';end if;
 -- Nouvelle vérification après l'attente du verrou.
 perform public.require_sitting_beta();
 sid := nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
 if sid is null or not exists(select 1 from auth.sessions where id::text=sid and user_id=uid and (not_after is null or not_after>clock_timestamp())) then
  raise exception 'Session terminée' using errcode='42501';
 end if;
 if not exists(select 1 from public.sitter_profiles where user_id=uid) then raise exception 'Profil de gardien requis' using errcode='42501';end if;
 select * into r from public.sitter_stripe_accounts where user_id=uid for update;
 if not p_start then return jsonb_build_object('account',r.stripe_account_id);end if;
 if r.user_id is null then
  insert into public.sitter_stripe_accounts(user_id,platform_id) values(uid,'acct_1UfdgzLRlPFxqD3K') returning * into r;
 end if;
 if r.lease_until > clock_timestamp() then raise exception 'Préparation en cours' using errcode='55P03';end if;
 if r.last_link_at > clock_timestamp()-interval '30 seconds' then raise exception 'Réessaie dans quelques instants' using errcode='55P03';end if;
 -- Ne jamais recréer automatiquement un compte après la fenêtre de reprise garantie.
 if r.stripe_account_id is null and r.created_at < clock_timestamp()-interval '23 hours' then
  raise exception 'Rapprochement Stripe nécessaire' using errcode='55000';
 end if;
 update public.sitter_stripe_accounts set claim=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',last_link_at=clock_timestamp()
 where user_id=uid returning * into r;
 return jsonb_build_object('account',r.stripe_account_id,'key',r.creation_key,'claim',r.claim,'user',uid);
end $$;
revoke all on function public.prepare_sitter_stripe_onboarding(boolean) from public,anon,authenticated;
grant execute on function public.prepare_sitter_stripe_onboarding(boolean) to authenticated;

-- Réponse Stripe conservée même si le bail a expiré : elle est liée à la clé permanente de création.
create function public.attach_sitter_stripe_account(p_user uuid,p_key uuid,p_account text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.sitter_stripe_accounts;
begin
 if p_account is null or p_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'Compte invalide' using errcode='22023';end if;
 select * into r from public.sitter_stripe_accounts where user_id=p_user for update;
 if not found or r.creation_key is distinct from p_key or (r.stripe_account_id is not null and r.stripe_account_id<>p_account) then
  raise exception 'Liaison incohérente' using errcode='42501';end if;
 update public.sitter_stripe_accounts set stripe_account_id=p_account where user_id=p_user;
end $$;
revoke all on function public.attach_sitter_stripe_account(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_sitter_stripe_account(uuid,uuid,text) to service_role;

create function public.release_sitter_stripe_onboarding(p_user uuid,p_claim uuid)
returns void language sql security definer set search_path='' as $$
 update public.sitter_stripe_accounts set claim=null,lease_until=null where user_id=p_user and claim=p_claim;
$$;
revoke all on function public.release_sitter_stripe_onboarding(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_sitter_stripe_onboarding(uuid,uuid) to service_role;

-- Tant que la fermeture Stripe n'est pas raccordée, ne pas orpheliner une inscription, même incertaine.
create function public.guard_stripe_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sitter_stripe_accounts where user_id=new.user_id) then
  raise exception 'Compte de paiement à clôturer avec l’équipe' using errcode='23503';
 end if;
 return new;
end $$;
revoke all on function public.guard_stripe_account_deletion() from public,anon,authenticated;
create trigger stripe_account_deletion before insert on public.account_deletions for each row execute function public.guard_stripe_account_deletion();

-- Même motif visible dans la vérification préalable de Mon compte.
create or replace function public.account_deletion_blockers() returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501';end if;
 return query select * from public.account_deletion_blockers_for(auth.uid());
 return query select 'paiement'::text,count(*)::integer from public.sitter_stripe_accounts where user_id=auth.uid() having count(*)>0;
end $$;
revoke all on function public.account_deletion_blockers() from public,anon,authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;
commit;
