-- Garde : disponibilités du gardien.
-- 1. Jours proposés (1 = lundi … 7 = dimanche, heure de Paris) et capacité d'accueil (gardes acceptées ou réservées en même temps).
-- 2. Périodes indisponibles (vacances, absences) : lisibles seulement par le gardien, jamais montrées aux propriétaires.
-- 3. Un gardien est indisponible sur des dates si l'un des jours n'est pas proposé, s'il est absent, ou s'il est complet.
--    La recherche le masque, une nouvelle demande est refusée ; à l'accord, seule la capacité est vérifiée (le gardien décide).
-- 4. Le gardien peut revenir sur son accord tant que le propriétaire n'a pas payé (« decline » sur une demande acceptée).
-- 5. Profil et disponibilités s'enregistrent ensemble (save_sitter_offer) : tout ou rien.
-- 6. Une demande en attente ou acceptée dont la garde a commencé est expirée côté serveur : elle ne bloque plus
--    une nouvelle demande, la capacité d'accueil, le retrait d'un animal ni la suppression d'un compte.
-- 7. Suppression de compte : les absences sont illisibles dès la demande (ancienne session) et effacées au nettoyage.

alter table public.sitter_profiles
  add column if not exists weekdays smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add column if not exists capacity smallint not null default 1 check (capacity between 1 and 10);

create table if not exists public.sitter_unavailability (
  id bigint generated always as identity primary key,
  sitter_id uuid not null references public.sitter_profiles(user_id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  check (ends_on >= starts_on and ends_on <= starts_on + 366)
);
create index if not exists idx_sitter_unavailability_sitter on public.sitter_unavailability(sitter_id, ends_on);
alter table public.sitter_unavailability enable row level security;
revoke all on public.sitter_unavailability from public, anon, authenticated;
grant all on public.sitter_unavailability to service_role;
grant select on public.sitter_unavailability to authenticated;
drop policy if exists "ses absences de gardien" on public.sitter_unavailability;
create policy "ses absences de gardien" on public.sitter_unavailability for select to authenticated using (sitter_id=(select auth.uid()));
-- Suppression de compte (si elle est installée) : comme les autres tables, plus de lecture ni d'écriture par une ancienne
-- session dès la demande, et absences effacées (jours et capacité remis par défaut) au nettoyage du compte.
create or replace function public.forget_sitter_availability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.sitter_unavailability where sitter_id=new.user_id;
  update public.sitter_profiles set weekdays='{1,2,3,4,5,6,7}', capacity=1 where user_id=new.user_id;
  return new;
end $$;
revoke all on function public.forget_sitter_availability() from public, anon, authenticated;
do $$ begin
  if to_regprocedure('public.guard_open_accounts()') is not null then
    drop trigger if exists account_open_insert on public.sitter_unavailability;
    create trigger account_open_insert before insert or update on public.sitter_unavailability for each row execute function public.guard_open_accounts();
  end if;
  if to_regprocedure('public.account_is_open()') is not null then
    drop policy if exists account_not_deleted on public.sitter_unavailability;
    create policy account_not_deleted on public.sitter_unavailability as restrictive for all to authenticated
      using (public.account_is_open()) with check (public.account_is_open());
  end if;
  if to_regclass('public.account_deletions') is not null then
    drop trigger if exists forget_sitter_availability on public.account_deletions;
    create trigger forget_sitter_availability after update of cleaned_at on public.account_deletions for each row
      when (new.cleaned_at is not null and old.cleaned_at is null) execute function public.forget_sitter_availability();
  end if;
end $$;

-- Expirer les demandes sans suite dont la garde a commencé (toutes, ou celles d'un compte). Appelée par les fonctions
-- de garde, et par un minuteur si on l'active (operations/enable_sitting_expiry_cron.sql). Les deux personnes sont prévenues.
create or replace function public.expire_sitting_requests(p_user uuid default null)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare n integer;
begin
  update public.sitting_requests set status='expired', updated_at=now()
    where status in ('pending','accepted') and starts_at <= now() and (p_user is null or p_user in (owner_id, sitter_id));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_sitting_requests(uuid) from public, anon, authenticated;
grant execute on function public.expire_sitting_requests(uuid) to service_role;

-- Une demande compte comme ouverte si elle est réservée, ou en attente / acceptée avant le début de la garde.
create or replace function public.sitting_is_open(p_status text, p_starts timestamptz, p_ends timestamptz)
returns boolean language sql stable set search_path='' as $$
  select p_status='confirmed' or (p_status in ('pending','accepted') and p_starts > now())
$$;
revoke all on function public.sitting_is_open(text,timestamptz,timestamptz) from public, anon, authenticated;

-- Retrait d'un animal : une demande expirée (même pas encore marquée) ne bloque plus.
create or replace function public.pet_retirement_blockers(p_pet uuid) returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501';end if;
 return query select q.section,q.total from (
 select 'rencontres'::text section,count(*)::integer total from public.meeting_proposals p join public.matches m on m.id=p.match_id where p_pet in(m.pet_a,m.pet_b) and (p.status='pending' or (p.status='accepted' and p.chosen_slot>now()))
 union all select 'garde',count(*)::integer from public.sitting_requests where pet_id=p_pet and public.sitting_is_open(status,starts_at,ends_at) and ends_at>now()
 union all select 'services',count(*)::integer from public.professional_appointments a join public.professional_slots s on s.id=a.slot_id where a.pet_id=p_pet and a.status in('pending','countered','confirmed') and s.ends_at>now()
 union all select 'animaux_perdus',count(*)::integer from public.lost_pets where pet_id=p_pet and status='lost'
 ) q where q.total>0;
end $$;

-- Suppression de compte (si elle est installée) : même règle pour les demandes de garde.
do $do$ begin
  if to_regprocedure('public.account_deletion_blockers_for(uuid)') is not null then
    execute $fn$
create or replace function public.account_deletion_blockers_for(p_user uuid) returns table(section text,total integer)
language sql stable security definer set search_path='' as $body$
 select x.section,sum(x.total)::integer from (
 select 'rencontres'::text section,count(*)::integer total from public.meeting_proposals mp join public.matches m on m.id=mp.match_id join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b where p_user in(a.owner_id,b.owner_id) and (mp.status='pending' or (mp.status='accepted' and mp.chosen_slot>now()))
 union all select 'garde',count(*)::integer from public.sitting_requests where p_user in(owner_id,sitter_id) and public.sitting_is_open(status,starts_at,ends_at) and ends_at>now()
 union all select 'services',count(*)::integer from public.professional_appointments a join public.professional_slots s on s.id=a.slot_id where p_user in(a.owner_id,a.professional_id) and a.status in('pending','countered','confirmed') and s.ends_at>now()
 union all select 'services',count(*)::integer from public.appointments where user_id=p_user and status='confirmed' and slot>now()
 union all select 'animaux_perdus',count(*)::integer from public.lost_pets where reporter_id=p_user and status='lost'
 union all select 'abonnement',count(*)::integer from public.subscriptions where user_id=p_user and status in('active','trialing','past_due')
 union all select 'signalements',count(*)::integer from public.sitting_reports sr join public.sitting_requests r on r.id=sr.sitting_id where p_user in(r.owner_id,r.sitter_id) and sr.status in('open','reviewing')
 union all select 'moderation',count(*)::integer from public.reports where status='open' and (reporter_id=p_user or target_id=p_user::text or target_id in(select id::text from public.pets where owner_id=p_user))
 ) x group by x.section having sum(x.total)>0;
$body$
$fn$;
  end if;
end $do$;

-- Pourquoi un gardien n'est pas libre sur ces dates : 'complet', 'jour', 'absence', 'profil', ou null s'il est libre.
-- La capacité compare le plus grand nombre de gardes simultanées sur la période (acceptées ou réservées).
create or replace function public.sitter_conflict(p_sitter uuid, p_starts timestamptz, p_ends timestamptz)
returns text language sql stable security definer set search_path='' as $$
  with sp as (select weekdays, capacity from public.sitter_profiles where user_id=p_sitter),
  d as (select (p_starts at time zone 'Europe/Paris')::date a, ((p_ends - interval '1 second') at time zone 'Europe/Paris')::date b),
  r as (select x.starts_at, x.ends_at from public.sitting_requests x where x.sitter_id=p_sitter
        and (x.status='confirmed' or (x.status='accepted' and x.starts_at > now()))
        and x.starts_at < p_ends and x.ends_at > p_starts)
  select case
    when not exists(select 1 from sp) then 'profil'
    when (select coalesce(max((select count(*) from r r2 where r2.starts_at <= pt.x and r2.ends_at > pt.x)), 0)
          from (select greatest(r.starts_at, p_starts) x from r union all select p_starts) pt) >= (select capacity from sp) then 'complet'
    when exists(select 1 from d, sp, generate_series(d.a::timestamp, greatest(d.a, d.b)::timestamp, interval '1 day') g
                where not (extract(isodow from g)::smallint = any(sp.weekdays))) then 'jour'
    when exists(select 1 from public.sitter_unavailability u, d where u.sitter_id=p_sitter and u.starts_on <= d.b and u.ends_on >= d.a) then 'absence'
  end
$$;
revoke all on function public.sitter_conflict(uuid,timestamptz,timestamptz) from public, anon, authenticated;

-- Mes disponibilités : jours, capacité et absences (remplacées en entier). Absences : [{"starts_on":"2026-12-20","ends_on":"2026-12-27"}, …].
create or replace function public.save_sitter_availability(p_weekdays smallint[], p_capacity integer, p_periods jsonb default '[]')
returns public.sitter_profiles language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); saved public.sitter_profiles; item jsonb; a date; b date;
begin
  perform 1 from public.sitter_profiles where user_id=uid for update;
  if not found then raise exception 'Profil de gardien requis' using errcode='42501'; end if;
  if p_weekdays is null or cardinality(p_weekdays) not between 1 and 7 or not (p_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[])
    or p_capacity is null or p_capacity not between 1 and 10
    or p_periods is null or jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) > 30 then
    raise exception 'Disponibilités invalides' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_periods) loop
    begin
      a := (item->>'starts_on')::date; b := (item->>'ends_on')::date;
    exception when others then raise exception 'Période invalide' using errcode='22023';
    end;
    if jsonb_typeof(item) <> 'object' or a is null or b is null or b < a or b > a + 366 or b < current_date or a > current_date + 730 then
      raise exception 'Période invalide' using errcode='22023'; end if;
  end loop;
  update public.sitter_profiles set weekdays=(select array_agg(distinct w order by w) from unnest(p_weekdays) w), capacity=p_capacity, updated_at=now()
    where user_id=uid returning * into saved;
  delete from public.sitter_unavailability where sitter_id=uid;
  insert into public.sitter_unavailability(sitter_id, starts_on, ends_on)
    select uid, (x->>'starts_on')::date, (x->>'ends_on')::date from jsonb_array_elements(p_periods) x order by 2;
  return saved;
end $$;
revoke all on function public.save_sitter_availability(smallint[],integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_sitter_availability(smallint[],integer,jsonb) to authenticated;

-- Profil et disponibilités en une seule transaction : si les disponibilités sont refusées, le profil n'est pas enregistré
-- (jamais publié « tous les jours » contre l'avis du gardien).
create or replace function public.save_sitter_offer(p_kind text, p_bio text, p_city text, p_lat numeric, p_lng numeric, p_species text[],
  p_max_weight integer, p_outdoor text, p_services jsonb, p_active boolean, p_weekdays smallint[], p_capacity integer, p_periods jsonb default '[]')
returns public.sitter_profiles language plpgsql volatile security definer set search_path='' as $$
begin
  perform public.save_sitter_profile(p_kind, p_bio, p_city, p_lat, p_lng, p_species, p_max_weight, p_outdoor, p_services, p_active);
  return public.save_sitter_availability(p_weekdays, p_capacity, p_periods);
end $$;
revoke all on function public.save_sitter_offer(text,text,text,numeric,numeric,text[],integer,text,jsonb,boolean,smallint[],integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_sitter_offer(text,text,text,numeric,numeric,text[],integer,text,jsonb,boolean,smallint[],integer,jsonb) to authenticated;

-- Recherche : un gardien est « pris » s'il n'est pas libre (jours, absence, capacité) ; la fiche montre ses jours et sa capacité.
drop function if exists public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid);
create function public.search_sitters(p_lat numeric default null, p_lng numeric default null, p_radius integer default 10,
  p_service text default null, p_starts timestamptz default null, p_ends timestamptz default null, p_species text default null,
  p_sitter uuid default null)
returns table(sitter_id uuid, name text, kind text, city text, bio text, distance_km integer, species text[], max_weight_kg integer,
  outdoor text, services jsonb, price_cents integer, busy boolean, photo text, weekdays smallint[], capacity smallint)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); lat numeric; dlat numeric; dlng numeric;
begin
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180)))
    or p_radius is null or p_radius not between 1 and 100 or (p_service is not null and p_service not in ('chez_gardien','domicile','visite','promenade'))
    or (p_starts is null) <> (p_ends is null) or (p_starts is not null and p_ends <= p_starts)
    or (p_sitter is null and p_lat is null) then raise exception 'Recherche invalide' using errcode='22023'; end if;
  if p_lat is not null and p_sitter is null then
    lat := round(p_lat, 2);
    dlat := p_radius / 110.0 + 0.02;
    dlng := p_radius / (110.0 * greatest(cos(radians(least(89.0, abs(lat) + dlat)::float8)), 0.01)::numeric) + 0.02;
  end if;
  return query
  select q.user_id, q.name, q.kind, q.city, q.bio, case when q.km is null then null else greatest(1, round(q.km))::integer end, q.species, q.max_weight_kg, q.outdoor, q.services,
    (select (e->>'price_cents')::integer from jsonb_array_elements(q.services) e where e->>'service'=p_service), q.busy, q.photo, q.weekdays, q.capacity
  from (
    select sp.*, pr.name,
      case when p_lat is not null then 6371.0*2*asin(sqrt(least(1.0,greatest(0.0,
          power(sin(radians((sp.latitude-round(p_lat,2))::float8)/2),2)+
          cos(radians(round(p_lat,2)::float8))*cos(radians(sp.latitude::float8))*power(sin(radians((sp.longitude-round(p_lng,2))::float8)/2),2))))) end km,
      (select jsonb_agg(jsonb_build_object('service', s.service, 'price_cents', s.price_cents) order by array_position(array['chez_gardien','domicile','visite','promenade'], s.service))
        from public.sitter_services s where s.sitter_id=sp.user_id) services,
      (p_starts is not null and public.sitter_conflict(sp.user_id, p_starts, p_ends) is not null) busy
    from public.sitter_profiles sp join public.profiles pr on pr.id=sp.user_id
    where sp.active and sp.user_id<>uid
      and (dlat is null or (sp.latitude between lat - dlat and lat + dlat
        and (abs(round(p_lng, 2)) + dlng >= 180 or sp.longitude between round(p_lng, 2) - dlng and round(p_lng, 2) + dlng)))
      and (p_sitter is null or sp.user_id=p_sitter)
      and (p_species is null or p_species=any(sp.species))
      and (p_service is null or exists(select 1 from public.sitter_services s where s.sitter_id=sp.user_id and s.service=p_service))
      and public.meeting_member_active(sp.user_id) and not public.meeting_blocked(uid, sp.user_id)
  ) q
  where p_sitter is not null or (q.km <= p_radius and not q.busy)
  order by q.km nulls last, q.user_id limit 40;
end $$;
revoke all on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) to authenticated;

-- Demande : refusée d'emblée si le gardien n'est pas libre sur ces dates.
create or replace function public.create_sitting_request(p_sitter uuid, p_pet uuid, p_service text, p_starts timestamptz, p_ends timestamptz,
  p_message text, p_request uuid)
returns public.sitting_requests language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); saved public.sitting_requests; pet public.pets; price integer;
begin
  if p_sitter is not null and p_sitter<>uid then perform public.lock_meeting_owners(uid,p_sitter);end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
  perform public.require_sitting_beta();
  if p_request is null then raise exception 'Demande invalide' using errcode='22023'; end if;
  -- Ses demandes sans suite dont la garde a commencé ne bloquent plus une nouvelle demande.
  begin
    perform public.expire_sitting_requests(uid);
  exception when insufficient_privilege then null; -- l'autre compte est en cours de suppression : la demande reste à expirer par le minuteur
  end;
  select * into saved from public.sitting_requests where owner_id=uid and request_id=p_request;
  if saved.id is not null then
    if saved.sitter_id is distinct from p_sitter or saved.pet_id is distinct from p_pet or saved.service is distinct from p_service or saved.starts_at is distinct from p_starts or saved.ends_at is distinct from p_ends or saved.message is distinct from nullif(btrim(p_message),'') then raise exception 'Requête différente' using errcode='23505'; end if;
    return saved;
  end if;
  select * into pet from public.pets where id=p_pet and owner_id=uid;
  if pet.id is null then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  if p_sitter is null or p_sitter=uid or not public.meeting_member_active(p_sitter) or public.meeting_blocked(uid, p_sitter) then
    raise exception 'Gardien indisponible' using errcode='42501'; end if;
  select s.price_cents into price from public.sitter_profiles sp join public.sitter_services s on s.sitter_id=sp.user_id and s.service=p_service
    where sp.user_id=p_sitter and sp.active and pet.species=any(sp.species);
  if price is null then raise exception 'Gardien indisponible' using errcode='42501'; end if;
  if p_starts is null or p_ends is null or p_starts <= now() or p_ends <= p_starts or p_ends > p_starts + interval '60 days'
    or (p_message is not null and char_length(btrim(p_message)) > 1000) then raise exception 'Demande invalide' using errcode='22023'; end if;
  if public.sitter_conflict(p_sitter, p_starts, p_ends) is not null then
    raise exception 'Pas disponible à ces dates' using errcode='P0001'; end if;
  if (select count(*) from public.sitting_requests where owner_id=uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop de demandes aujourd’hui' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || p_sitter::text, 2));
  if exists(select 1 from public.sitting_requests where owner_id=uid and sitter_id=p_sitter and pet_id=p_pet and status in ('pending','accepted')) then
    raise exception 'Une demande est déjà en cours' using errcode='23505'; end if;
  insert into public.sitting_requests(owner_id, sitter_id, pet_id, service, starts_at, ends_at, units, unit_price_cents, message, request_id)
    values (uid, p_sitter, p_pet, p_service, p_starts, p_ends, public.sitting_units(p_service, p_starts, p_ends), price, nullif(btrim(p_message), ''), p_request)
    returning * into saved;
  if saved.message is not null then
    insert into public.sitting_messages(owner_id, sitter_id, sender_id, text, request_id) values (uid, p_sitter, uid, saved.message, p_request);
  end if;
  return saved;
end $$;

-- Accord : refusé si la capacité est atteinte ; le gardien peut revenir sur son accord avant le paiement.
create or replace function public.update_sitting_request(p_id uuid, p_action text, p_note text default null)
returns public.sitting_requests language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); current public.sitting_requests; other uuid;
begin
  select * into current from public.sitting_requests where id=p_id;
  if current.id is null or uid not in (current.owner_id, current.sitter_id) then raise exception 'Demande introuvable' using errcode='42501'; end if;
  other := case when uid=current.owner_id then current.sitter_id else current.owner_id end;
  perform public.lock_meeting_owners(uid,other);
  perform pg_advisory_xact_lock(hashtextextended('sitting-schedule:'||current.sitter_id::text,0));
  perform public.require_sitting_beta();
  select * into current from public.sitting_requests where id=p_id for update;
  if p_note is not null and char_length(btrim(p_note)) > 300 then raise exception 'Message trop long' using errcode='22023'; end if;
  -- La garde a commencé sans réponse ou sans paiement : la demande est close (expirée), plus aucune action ne la rouvre.
  if current.status in ('pending','accepted') and current.starts_at <= now() then
    update public.sitting_requests set status='expired', updated_at=now() where id=p_id returning * into current;
    return current;
  end if;
  if p_action='withdraw' and uid=current.owner_id and current.status in ('pending','accepted') then
    update public.sitting_requests set status='withdrawn', updated_at=now() where id=p_id returning * into current;
  elsif p_action='accept' and uid=current.sitter_id and current.status='pending' then
    if current.starts_at <= now() or not public.meeting_member_active(other) or public.meeting_blocked(uid, other) then
      raise exception 'Demande indisponible' using errcode='42501'; end if;
    if public.sitter_conflict(uid, current.starts_at, current.ends_at) = 'complet' then raise exception 'Dates déjà prises' using errcode='23505'; end if;
    update public.sitting_requests set status='accepted', responded_at=now(), updated_at=now() where id=p_id returning * into current;
  elsif p_action='decline' and uid=current.sitter_id and current.status in ('pending','accepted') then
    update public.sitting_requests set status='declined', responded_at=now(), updated_at=now() where id=p_id returning * into current;
  elsif p_action='cancel' and current.status='confirmed' and current.ends_at > now() then
    update public.sitting_requests set status='cancelled', cancelled_by=uid, cancel_note=nullif(btrim(p_note), ''), updated_at=now()
      where id=p_id returning * into current;
  elsif (p_action='withdraw' and uid=current.owner_id and current.status='withdrawn') or (p_action='accept' and uid=current.sitter_id and current.status='accepted')
     or (p_action='decline' and uid=current.sitter_id and current.status='declined') or (p_action='cancel' and current.status='cancelled')
     or (current.status='expired' and ((p_action='withdraw' and uid=current.owner_id) or (p_action='decline' and uid=current.sitter_id))) then
    null; -- Rejeu d'une action déjà faite (ou demande déjà expirée) : même résultat, sans erreur.
  else
    raise exception 'Action impossible' using errcode='42501';
  end if;
  return current;
end $$;
