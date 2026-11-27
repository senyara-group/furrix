-- Socle inactif : aucune route ne l'appelle. Ne pas ouvrir Checkout avant raccordement
-- des événements Stripe, de l'annulation/remboursement et du rapprochement.
begin;
create table public.sitting_payment_attempts (
 id uuid primary key default gen_random_uuid(),
 sitting_id uuid not null unique references public.sitting_requests(id),
 owner_id uuid not null references public.profiles(id),
 sitter_id uuid not null references public.profiles(id),
 stripe_account text not null check(stripe_account ~ '^acct_[A-Za-z0-9]+$' and stripe_account <> 'acct_1UfdgzLRlPFxqD3K'),
 units integer not null check(units>0),
 unit_price_cents integer not null check(unit_price_cents>0),
 amount_cents bigint not null check(amount_cents between 1 and 99999999),
 commission_basis_points integer not null check(commission_basis_points between 0 and 9999),
 application_fee_cents bigint not null check(application_fee_cents>=0 and application_fee_cents<amount_cents),
 starts_at timestamptz not null,
 prepared_at bigint not null,
 expires_at bigint not null,
 claim uuid,
 lease_until timestamptz,
 stripe_session_id text unique check(stripe_session_id ~ '^cs_test_[A-Za-z0-9]+$'),
 check(owner_id<>sitter_id),
 check(amount_cents=units::bigint*unit_price_cents),
 check(application_fee_cents=(amount_cents*commission_basis_points+5000)/10000),
 check(expires_at-prepared_at between 1800 and 86400),
 check(expires_at<=floor(extract(epoch from starts_at))),
 check((claim is null)=(lease_until is null))
);
alter table public.sitting_payment_attempts enable row level security;
revoke all on public.sitting_payment_attempts from public,anon,authenticated,service_role;
-- Le serveur utilise exclusivement les fonctions ci-dessous : pas de mutation directe du registre.
grant select on public.sitting_payment_attempts to service_role;
create index sitting_payment_attempts_owner on public.sitting_payment_attempts(owner_id);
create index sitting_payment_attempts_sitter on public.sitting_payment_attempts(sitter_id);

-- p_owner et p_session viennent de la session vérifiée par la future Edge Function.
-- Commission et durée viennent de sa configuration serveur, jamais du corps client.
create function public.prepare_sitting_checkout(p_sitting uuid,p_owner uuid,p_session uuid,p_commission integer,p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.sitting_requests; a public.sitting_payment_attempts; sp public.sitter_profiles;
 account text; stamp bigint; total bigint; fee bigint; peak integer;
begin
 if p_owner is null or p_session is null then raise exception 'Session terminée' using errcode='42501';end if;
 if p_commission is null or p_commission not between 0 and 9999 then raise exception 'Commission non configurée' using errcode='22023';end if;
 if p_window_seconds is null or p_window_seconds not between 1800 and 86400 then raise exception 'Durée non configurée' using errcode='22023';end if;
 select * into r from public.sitting_requests where id=p_sitting;
 if not found or r.owner_id<>p_owner then raise exception 'Demande non autorisée' using errcode='42501';end if;
 -- Même ordre que les actions de garde : paire, calendrier, puis ligne de demande.
 perform public.lock_meeting_owners(r.owner_id,r.sitter_id);
 perform pg_advisory_xact_lock(hashtextextended('sitting-schedule:'||r.sitter_id::text,0));
 -- La suppression de compte prend ce verrou en écriture. Ne pas préparer après sa validation.
 perform 1 from public.profiles where id in(r.owner_id,r.sitter_id) order by id for share;
 select * into r from public.sitting_requests where id=p_sitting for update;
 if not found or r.owner_id<>p_owner then raise exception 'Demande non autorisée' using errcode='42501';end if;
 perform 1 from auth.sessions where id=p_session and user_id=p_owner
  and (not_after is null or not_after>clock_timestamp()) for share;
 if not found then raise exception 'Session terminée' using errcode='42501';end if;
 if not public.meeting_member_active(p_owner) or not public.meeting_member_active(r.sitter_id)
  or public.account_deletion_pending(p_owner) or public.account_deletion_pending(r.sitter_id)
  or public.meeting_blocked(p_owner,r.sitter_id) then raise exception 'Accès refusé' using errcode='42501';end if;
 stamp:=floor(extract(epoch from clock_timestamp()));
 if r.status<>'accepted' or r.starts_at<=to_timestamp(stamp) then raise exception 'Demande non payable' using errcode='55000';end if;
 select * into sp from public.sitter_profiles where user_id=r.sitter_id for share;
 if not found or not sp.active then raise exception 'Gardien indisponible' using errcode='55000';end if;
 -- Compter la demande courante une seule fois : elle réserve déjà une place après acceptation.
 select coalesce(max((select count(*) from public.sitting_requests x where x.sitter_id=r.sitter_id
   and (x.status='confirmed' or (x.status='accepted' and x.starts_at>clock_timestamp()))
   and x.starts_at<=pt.x and x.ends_at>pt.x)),0)::integer into peak
 from (select greatest(x.starts_at,r.starts_at) x from public.sitting_requests x
  where x.sitter_id=r.sitter_id and x.starts_at<r.ends_at and x.ends_at>r.starts_at
  and (x.status='confirmed' or (x.status='accepted' and x.starts_at>clock_timestamp()))
  union all select r.starts_at) pt;
 if peak>sp.capacity or exists(select 1 from generate_series((r.starts_at at time zone 'Europe/Paris')::date::timestamp,
  ((r.ends_at-interval '1 second') at time zone 'Europe/Paris')::date::timestamp,interval '1 day') d
  where not(extract(isodow from d)::smallint=any(sp.weekdays)))
  or exists(select 1 from public.sitter_unavailability u where u.sitter_id=r.sitter_id
   and u.starts_on<=((r.ends_at-interval '1 second') at time zone 'Europe/Paris')::date
   and u.ends_on>=(r.starts_at at time zone 'Europe/Paris')::date)
 then raise exception 'Dates indisponibles' using errcode='55000';end if;
 if not exists(select 1 from public.pets where id=r.pet_id and owner_id=p_owner and archived_at is null) then
  raise exception 'Animal indisponible' using errcode='42501';end if;
 select stripe_account_id into account from public.sitter_stripe_accounts where user_id=r.sitter_id
  and platform_id='acct_1UfdgzLRlPFxqD3K' for share;
 if account is null or account='acct_1UfdgzLRlPFxqD3K' then raise exception 'Inscription Stripe requise' using errcode='55000';end if;
 select * into a from public.sitting_payment_attempts where sitting_id=p_sitting for update;
 if a.id is null then
  if floor(extract(epoch from r.starts_at))-stamp<p_window_seconds then raise exception 'Délai insuffisant' using errcode='55000';end if;
  total:=r.units::bigint*r.unit_price_cents;
  fee:=(total*p_commission+5000)/10000;
  if total not between 1 and 99999999 or fee>=total then raise exception 'Montant invalide' using errcode='22023';end if;
  insert into public.sitting_payment_attempts(sitting_id,owner_id,sitter_id,stripe_account,units,unit_price_cents,
   amount_cents,commission_basis_points,application_fee_cents,starts_at,prepared_at,expires_at)
  values(r.id,r.owner_id,r.sitter_id,account,r.units,r.unit_price_cents,total,p_commission,fee,r.starts_at,stamp,stamp+p_window_seconds)
  returning * into a;
 end if;
 if a.expires_at<=stamp or stamp-a.prepared_at>=23*3600 then
  raise exception 'Rapprochement Stripe nécessaire' using errcode='55000';end if;
 if a.stripe_account<>account then raise exception 'Liaison Stripe modifiée' using errcode='55000';end if;
 if a.lease_until>clock_timestamp() then raise exception 'Préparation en cours' using errcode='55P03';end if;
 update public.sitting_payment_attempts set claim=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes'
  where id=a.id returning * into a;
 -- Contrat exact de SavedSittingCheckout, plus le bail et la session déjà connue. Aucun lien stocké.
 return jsonb_build_object('saved',jsonb_build_object('id',a.id,'stripe_account',a.stripe_account,
  'commission_basis_points',a.commission_basis_points::text,'prepared_at',a.prepared_at,'expires_at',a.expires_at,
  'request',jsonb_build_object('owner_id',a.owner_id,'sitter_id',a.sitter_id,'status','accepted',
   'starts_at',a.starts_at,'units',a.units,'unit_price_cents',a.unit_price_cents)),
  'claim',a.claim,'session',a.stripe_session_id);
end $$;
revoke all on function public.prepare_sitting_checkout(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.prepare_sitting_checkout(uuid,uuid,uuid,integer,integer) to service_role;

-- Même résultat Stripe accepté après expiration du bail ; un autre résultat est refusé.
create function public.attach_sitting_checkout(p_attempt uuid,p_session text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.sitting_payment_attempts;
begin
 if p_session is null or p_session !~ '^cs_test_[A-Za-z0-9]+$' then raise exception 'Session Stripe invalide' using errcode='22023';end if;
 select * into a from public.sitting_payment_attempts where id=p_attempt for update;
 if not found or (a.stripe_session_id is not null and a.stripe_session_id<>p_session) then
  raise exception 'Session Stripe incohérente' using errcode='55000';end if;
 update public.sitting_payment_attempts set stripe_session_id=p_session where id=p_attempt;
end $$;
revoke all on function public.attach_sitting_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.attach_sitting_checkout(uuid,text) to service_role;

create function public.release_sitting_checkout(p_attempt uuid,p_claim uuid) returns void
language sql security definer set search_path='' as $$
 update public.sitting_payment_attempts set claim=null,lease_until=null where id=p_attempt and claim=p_claim;
$$;
revoke all on function public.release_sitting_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_sitting_checkout(uuid,uuid) to service_role;

-- Verrou conservateur : aucun retrait/refus/expiration ne doit laisser un Checkout encaissable.
-- Le futur traitement coordonné Stripe remplacera ce garde-fou, jamais le client.
create function public.guard_sitting_checkout_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sitting_payment_attempts where sitting_id=old.id)
  and (tg_op='DELETE' or new is distinct from old) then
  raise exception 'Paiement à rapprocher avant modification de la garde' using errcode='55000';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.guard_sitting_checkout_request() from public,anon,authenticated;
create trigger sitting_checkout_request before update or delete on public.sitting_requests
 for each row execute function public.guard_sitting_checkout_request();

create function public.guard_checkout_account_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.sitting_payment_attempts where owner_id=new.user_id or sitter_id=new.user_id) then
  raise exception 'Paiement à rapprocher avec l’équipe' using errcode='23503';end if;return new;
end $$;
revoke all on function public.guard_checkout_account_deletion() from public,anon,authenticated;
create trigger checkout_account_deletion before insert on public.account_deletions
 for each row execute function public.guard_checkout_account_deletion();
create or replace function public.account_deletion_blockers() returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501';end if;
 return query select * from public.account_deletion_blockers_for(auth.uid());
 return query select 'paiement'::text,count(*)::integer from (
  select user_id::text ref from public.sitter_stripe_accounts where user_id=auth.uid()
  union all select id::text from public.sitting_payment_attempts where owner_id=auth.uid() or sitter_id=auth.uid()
 ) x having count(*)>0;
end $$;
revoke all on function public.account_deletion_blockers() from public,anon,authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;
commit;
