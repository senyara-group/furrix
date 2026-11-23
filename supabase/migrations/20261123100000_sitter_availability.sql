-- Garde : disponibilités du gardien.
-- 1. Jours proposés (1 = lundi … 7 = dimanche, heure de Paris) et capacité d'accueil (gardes acceptées ou réservées en même temps).
-- 2. Périodes indisponibles (vacances, absences) : lisibles seulement par le gardien, jamais montrées aux propriétaires.
-- 3. Un gardien est indisponible sur des dates si l'un des jours n'est pas proposé, s'il est absent, ou s'il est complet.
--    La recherche le masque, une nouvelle demande est refusée ; à l'accord, seule la capacité est vérifiée (le gardien décide).
-- 4. Le gardien peut revenir sur son accord tant que le propriétaire n'a pas payé (« decline » sur une demande acceptée).

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
-- Garde-fou des comptes en suppression, s'il est installé (l'écriture passe aussi par sitter_profiles, déjà protégé).
do $$ begin
  if to_regprocedure('public.guard_open_accounts()') is not null then
    drop trigger if exists account_open_insert on public.sitter_unavailability;
    create trigger account_open_insert before insert or update on public.sitter_unavailability for each row execute function public.guard_open_accounts();
  end if;
end $$;

-- Pourquoi un gardien n'est pas libre sur ces dates : 'complet', 'jour', 'absence', 'profil', ou null s'il est libre.
-- La capacité compare le plus grand nombre de gardes simultanées sur la période (acceptées ou réservées).
create or replace function public.sitter_conflict(p_sitter uuid, p_starts timestamptz, p_ends timestamptz)
returns text language sql stable security definer set search_path='' as $$
  with sp as (select weekdays, capacity from public.sitter_profiles where user_id=p_sitter),
  d as (select (p_starts at time zone 'Europe/Paris')::date a, ((p_ends - interval '1 second') at time zone 'Europe/Paris')::date b),
  r as (select x.starts_at, x.ends_at from public.sitting_requests x where x.sitter_id=p_sitter and x.status in ('accepted','confirmed')
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
     or (p_action='decline' and uid=current.sitter_id and current.status='declined') or (p_action='cancel' and current.status='cancelled') then
    null; -- Rejeu d'une action déjà faite : même résultat, sans erreur.
  else
    raise exception 'Action impossible' using errcode='42501';
  end if;
  return current;
end $$;
