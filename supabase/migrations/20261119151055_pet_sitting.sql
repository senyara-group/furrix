-- Garde (maquette « Plein air », parcours 2) : profils de gardien, recherche, demande, accord, conversation,
-- nouvelles pendant la garde, annulation, signalement et blocage.
-- Le paiement n'est pas branché : aucun prestataire n'est choisi. Le statut « confirmed » (payée, réservée) ne peut être
-- posé que par le service (futur retour du prestataire de paiement), jamais par un client.
-- Règles encore « à définir » dans la maquette, volontairement absentes : frais de service et commission, délai de réponse
-- (expiration), délai pour payer, conditions d'annulation et de remboursement, versement au gardien, avis, issue d'un litige.

-- 1. Profil de gardien : une offre déclarée par le compte (aucune vérification par Furrix).
create table public.sitter_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kind text not null default 'particulier' check (kind in ('particulier','professionnel')),
  bio text not null check (char_length(btrim(bio)) between 20 and 1000),
  city text not null check (char_length(btrim(city)) between 2 and 80),
  latitude numeric(4,2) not null check (latitude between -90 and 90),
  longitude numeric(5,2) not null check (longitude between -180 and 180),
  species text[] not null check (cardinality(species) between 1 and 8
    and species <@ array['chien','chat','lapin','oiseau','reptile','rongeur','cheval','ferme']),
  max_weight_kg integer check (max_weight_kg is null or max_weight_kg between 1 and 120),
  outdoor text not null default 'sans_jardin' check (outdoor in ('jardin_clos','jardin','sans_jardin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sitter_services (
  sitter_id uuid not null references public.sitter_profiles(user_id) on delete cascade,
  service text not null check (service in ('chez_gardien','domicile','visite','promenade')),
  price_cents integer not null check (price_cents between 100 and 100000),
  primary key (sitter_id, service)
);

-- 2. Demandes de garde. Écritures uniquement par fonctions ; tarif et quantité figés à l'envoi.
create table public.sitting_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  sitter_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  service text not null check (service in ('chez_gardien','domicile','visite','promenade')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  units integer not null check (units between 1 and 60),
  unit_price_cents integer not null check (unit_price_cents between 100 and 100000),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending'
    check (status in ('pending','withdrawn','declined','expired','accepted','confirmed','cancelled')),
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancel_note text check (cancel_note is null or char_length(cancel_note) <= 300),
  responded_at timestamptz,
  paid_at timestamptz,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id <> sitter_id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '60 days'),
  check ((status = 'confirmed') <= (paid_at is not null))
);
create unique index sitting_requests_request on public.sitting_requests(owner_id, request_id);
-- Une seule demande ouverte par animal et par gardien.
create unique index sitting_requests_one_open on public.sitting_requests(owner_id, sitter_id, pet_id) where status in ('pending','accepted');
create index idx_sitting_requests_owner on public.sitting_requests(owner_id, created_at desc);
create index idx_sitting_requests_sitter on public.sitting_requests(sitter_id, created_at desc);
create index idx_sitting_requests_pet on public.sitting_requests(pet_id);
create index idx_sitting_requests_cancelled_by on public.sitting_requests(cancelled_by);

-- 3. Conversation entre un propriétaire et un gardien (toutes leurs demandes), possible avant la demande.
create table public.sitting_messages (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  sitter_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  check (sender_id in (owner_id, sitter_id) and owner_id <> sitter_id)
);
create unique index sitting_messages_request on public.sitting_messages(sender_id, request_id);
create index idx_sitting_messages_pair on public.sitting_messages(owner_id, sitter_id, id desc);
create index idx_sitting_messages_sitter on public.sitting_messages(sitter_id);

-- 4. Nouvelles pendant la garde (journal rédigé par le gardien).
create table public.sitting_updates (
  id bigint generated always as identity primary key,
  sitting_id uuid not null references public.sitting_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index idx_sitting_updates_sitting on public.sitting_updates(sitting_id, id desc);
create index idx_sitting_updates_author on public.sitting_updates(author_id);

-- 5. Signalement d'un problème sur une garde (litige) : enregistré pour l'équipe, suite à définir.
create table public.sitting_reports (
  id bigint generated always as identity primary key,
  sitting_id uuid not null references public.sitting_requests(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('sante','non_conforme','comportement','paiement')),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  status text not null default 'open' check (status in ('open','reviewing','closed')),
  created_at timestamptz not null default now()
);
create index idx_sitting_reports_sitting on public.sitting_reports(sitting_id);
create index idx_sitting_reports_reporter on public.sitting_reports(reporter_id);

-- Droits : lecture seule et limitée ; toutes les écritures passent par les fonctions ci-dessous.
do $$ declare t text; begin
  foreach t in array array['sitter_profiles','sitter_services','sitting_requests','sitting_messages','sitting_updates','sitting_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant select on public.sitter_profiles, public.sitter_services, public.sitting_requests, public.sitting_messages, public.sitting_updates, public.sitting_reports to authenticated;

create function public.is_sitting_party(p_sitting uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.sitting_requests r where r.id=p_sitting and auth.uid() in (r.owner_id, r.sitter_id));
$$;
revoke all on function public.is_sitting_party(uuid) from public, anon, authenticated;
grant execute on function public.is_sitting_party(uuid) to authenticated;

create policy "son profil de gardien" on public.sitter_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "ses tarifs de gardien" on public.sitter_services for select to authenticated using (sitter_id=(select auth.uid()));
create policy "ses demandes de garde" on public.sitting_requests for select to authenticated
  using ((select auth.uid()) in (owner_id, sitter_id));
create policy "ses conversations de garde" on public.sitting_messages for select to authenticated
  using ((select auth.uid()) in (owner_id, sitter_id));
create policy "nouvelles de ses gardes" on public.sitting_updates for select to authenticated
  using ((select public.is_sitting_party(sitting_id)));
create policy "ses signalements de garde" on public.sitting_reports for select to authenticated
  using (reporter_id=(select auth.uid()));
do $$ declare t text; begin
  foreach t in array array['sitter_profiles','sitter_services','sitting_requests','sitting_messages','sitting_updates','sitting_reports'] loop
    execute format('create policy "bêta privée : accès requis" on public.%I as restrictive for all to anon,authenticated using ((select public.can_use_private_beta())) with check ((select public.can_use_private_beta()))', t);
  end loop;
end $$;

-- Quantité facturée : nuits (chez le gardien, à domicile) ou jours (une visite, une promenade par jour), à l'heure de Paris.
create function public.sitting_units(p_service text, p_starts timestamptz, p_ends timestamptz) returns integer
language sql stable set search_path='' as $$
  select case when p_service in ('chez_gardien','domicile')
    then greatest(1, (p_ends at time zone 'Europe/Paris')::date - (p_starts at time zone 'Europe/Paris')::date)
    else (p_ends at time zone 'Europe/Paris')::date - (p_starts at time zone 'Europe/Paris')::date + 1 end;
$$;
revoke all on function public.sitting_units(text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.sitting_units(text,timestamptz,timestamptz) to authenticated;

create function public.require_sitting_beta() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  return auth.uid();
end $$;
revoke all on function public.require_sitting_beta() from public, anon, authenticated;

-- 6. Mon profil de gardien : créer, modifier ou mettre en pause. Tarifs : [{"service":"chez_gardien","price_cents":2000}, …].
create function public.save_sitter_profile(p_kind text, p_bio text, p_city text, p_lat numeric, p_lng numeric, p_species text[],
  p_max_weight integer, p_outdoor text, p_services jsonb, p_active boolean default true)
returns public.sitter_profiles language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); saved public.sitter_profiles; item jsonb;
begin
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 4
    or p_lat is null or p_lng is null or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'Profil invalide' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_services) loop
    if jsonb_typeof(item) <> 'object' or item->>'service' is null or item->>'service' not in ('chez_gardien','domicile','visite','promenade')
      or jsonb_typeof(item->'price_cents') <> 'number' or (item->>'price_cents')::numeric <> round((item->>'price_cents')::numeric)
      or (item->>'price_cents')::numeric not between 100 and 100000 then raise exception 'Tarif invalide' using errcode='22023'; end if;
  end loop;
  if (select count(distinct x->>'service') from jsonb_array_elements(p_services) x) <> jsonb_array_length(p_services) then
    raise exception 'Tarif invalide' using errcode='22023'; end if;
  begin
    insert into public.sitter_profiles(user_id, kind, bio, city, latitude, longitude, species, max_weight_kg, outdoor, active)
      values (uid, coalesce(p_kind, 'particulier'), btrim(p_bio), btrim(p_city), round(p_lat, 2), round(p_lng, 2),
        (select array_agg(distinct s order by s) from unnest(p_species) s), p_max_weight, coalesce(p_outdoor, 'sans_jardin'), coalesce(p_active, true))
      on conflict (user_id) do update set kind=excluded.kind, bio=excluded.bio, city=excluded.city, latitude=excluded.latitude,
        longitude=excluded.longitude, species=excluded.species, max_weight_kg=excluded.max_weight_kg, outdoor=excluded.outdoor,
        active=excluded.active, updated_at=now()
      returning * into saved;
  exception when check_violation or not_null_violation then raise exception 'Profil invalide' using errcode='22023';
  end;
  delete from public.sitter_services where sitter_id=uid;
  insert into public.sitter_services(sitter_id, service, price_cents)
    select uid, x->>'service', (x->>'price_cents')::integer from jsonb_array_elements(p_services) x;
  return saved;
end $$;

-- 7. Recherche de gardiens autour d'une position approximative (jamais enregistrée), ou fiche d'un gardien (p_sitter).
-- Exclus : soi-même, comptes bloqués ou hors bêta, gardiens déjà pris (demande acceptée ou réservée) sur ces dates.
create function public.search_sitters(p_lat numeric default null, p_lng numeric default null, p_radius integer default 10,
  p_service text default null, p_starts timestamptz default null, p_ends timestamptz default null, p_species text default null,
  p_sitter uuid default null)
returns table(sitter_id uuid, name text, kind text, city text, bio text, distance_km integer, species text[], max_weight_kg integer,
  outdoor text, services jsonb, price_cents integer, busy boolean)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180)))
    or p_radius is null or p_radius not between 1 and 100 or (p_service is not null and p_service not in ('chez_gardien','domicile','visite','promenade'))
    or (p_starts is null) <> (p_ends is null) or (p_starts is not null and p_ends <= p_starts)
    or (p_sitter is null and p_lat is null) then raise exception 'Recherche invalide' using errcode='22023'; end if;
  return query
  select q.user_id, q.name, q.kind, q.city, q.bio, case when q.km is null then null else greatest(1, round(q.km))::integer end, q.species, q.max_weight_kg, q.outdoor, q.services,
    (select (e->>'price_cents')::integer from jsonb_array_elements(q.services) e where e->>'service'=p_service), q.busy
  from (
    select sp.*, pr.name,
      case when p_lat is not null then 6371.0*2*asin(sqrt(least(1.0,greatest(0.0,
          power(sin(radians((sp.latitude-round(p_lat,2))::float8)/2),2)+
          cos(radians(round(p_lat,2)::float8))*cos(radians(sp.latitude::float8))*power(sin(radians((sp.longitude-round(p_lng,2))::float8)/2),2))))) end km,
      (select jsonb_agg(jsonb_build_object('service', s.service, 'price_cents', s.price_cents) order by array_position(array['chez_gardien','domicile','visite','promenade'], s.service))
        from public.sitter_services s where s.sitter_id=sp.user_id) services,
      (p_starts is not null and exists(select 1 from public.sitting_requests r where r.sitter_id=sp.user_id and r.status in ('accepted','confirmed')
        and r.starts_at < p_ends and r.ends_at > p_starts)) busy
    from public.sitter_profiles sp join public.profiles pr on pr.id=sp.user_id
    where sp.active and sp.user_id<>uid and public.meeting_member_active(sp.user_id) and not public.meeting_blocked(uid, sp.user_id)
      and (p_sitter is null or sp.user_id=p_sitter)
      and (p_species is null or p_species=any(sp.species))
      and (p_service is null or exists(select 1 from public.sitter_services s where s.sitter_id=sp.user_id and s.service=p_service))
  ) q
  where p_sitter is not null or (q.km <= p_radius and not q.busy)
  order by q.km nulls last, q.user_id limit 40;
end $$;

-- 8. Envoyer une demande : animal de l'appelant, espèce et formule proposées par le gardien, dates à venir. Rejouable sans doublon.
create function public.create_sitting_request(p_sitter uuid, p_pet uuid, p_service text, p_starts timestamptz, p_ends timestamptz,
  p_message text, p_request uuid)
returns public.sitting_requests language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); saved public.sitting_requests; pet public.pets; price integer;
begin
  if p_request is null then raise exception 'Demande invalide' using errcode='22023'; end if;
  select * into saved from public.sitting_requests where owner_id=uid and request_id=p_request;
  if saved.id is not null then
    if saved.sitter_id<>p_sitter or saved.pet_id<>p_pet then raise exception 'Requête différente' using errcode='23505'; end if;
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

-- 9. Faire avancer une demande. Propriétaire : retirer (en attente ou acceptée, avant paiement), annuler (réservée).
-- Gardien : accepter ou refuser (en attente), annuler (réservée). La réservation (« confirmed ») vient du paiement, hors client.
create function public.update_sitting_request(p_id uuid, p_action text, p_note text default null)
returns public.sitting_requests language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); current public.sitting_requests; other uuid;
begin
  select * into current from public.sitting_requests where id=p_id for update;
  if current.id is null or uid not in (current.owner_id, current.sitter_id) then raise exception 'Demande introuvable' using errcode='42501'; end if;
  other := case when uid=current.owner_id then current.sitter_id else current.owner_id end;
  if p_note is not null and char_length(btrim(p_note)) > 300 then raise exception 'Message trop long' using errcode='22023'; end if;
  if p_action='withdraw' and uid=current.owner_id and current.status in ('pending','accepted') then
    update public.sitting_requests set status='withdrawn', updated_at=now() where id=p_id returning * into current;
  elsif p_action in ('accept','decline') and uid=current.sitter_id and current.status='pending' then
    if p_action='accept' and (current.starts_at <= now() or not public.meeting_member_active(other) or public.meeting_blocked(uid, other)) then
      raise exception 'Demande indisponible' using errcode='42501'; end if;
    if p_action='accept' and exists(select 1 from public.sitting_requests r where r.sitter_id=uid and r.id<>p_id and r.status in ('accepted','confirmed')
      and r.starts_at < current.ends_at and r.ends_at > current.starts_at) then raise exception 'Dates déjà prises' using errcode='23505'; end if;
    update public.sitting_requests set status=case when p_action='accept' then 'accepted' else 'declined' end, responded_at=now(), updated_at=now()
      where id=p_id returning * into current;
  elsif p_action='cancel' and current.status='confirmed' and current.ends_at > now() then
    update public.sitting_requests set status='cancelled', cancelled_by=uid, cancel_note=nullif(btrim(p_note), ''), updated_at=now()
      where id=p_id returning * into current;
  elsif (p_action='withdraw' and current.status='withdrawn') or (p_action='accept' and current.status='accepted')
     or (p_action='decline' and current.status='declined') or (p_action='cancel' and current.status='cancelled') then
    null; -- Rejeu d'une action déjà faite : même résultat, sans erreur.
  else
    raise exception 'Action impossible' using errcode='42501';
  end if;
  return current;
end $$;

-- 10. Demandes de l'appelant, côté propriétaire et côté gardien, avec l'animal et l'autre personne.
create function public.list_my_sittings(p_id uuid default null)
returns table(id uuid, role text, owner_id uuid, sitter_id uuid, other_name text, sitter_kind text, sitter_city text,
  pet_id uuid, pet_name text, pet_species text, pet_breed text, pet_age text, pet_weight text, pet_photo text,
  service text, starts_at timestamptz, ends_at timestamptz, units integer, unit_price_cents integer, message text, status text,
  cancelled_by uuid, cancel_note text, responded_at timestamptz, paid_at timestamptz, created_at timestamptz, updated_at timestamptz,
  report_id bigint, report_status text, report_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  return query
  select r.id, case when r.owner_id=uid then 'owner' else 'sitter' end, r.owner_id, r.sitter_id,
    pr.name, sp.kind, sp.city, p.id, p.name, p.species, p.breed, p.age, p.weight,
    case when r.owner_id=uid then p.photos[1] end,
    r.service, r.starts_at, r.ends_at, r.units, r.unit_price_cents, r.message, r.status, r.cancelled_by, r.cancel_note,
    r.responded_at, r.paid_at, r.created_at, r.updated_at, rep.id, rep.status, rep.created_at
  from public.sitting_requests r
  join public.pets p on p.id=r.pet_id
  join public.profiles pr on pr.id=case when r.owner_id=uid then r.sitter_id else r.owner_id end
  left join public.sitter_profiles sp on sp.user_id=r.sitter_id
  left join lateral (select x.id, x.status, x.created_at from public.sitting_reports x where x.sitting_id=r.id and x.reporter_id=uid order by x.id desc limit 1) rep on true
  where uid in (r.owner_id, r.sitter_id) and (p_id is null or r.id=p_id)
  order by r.starts_at desc, r.id limit 100;
end $$;

-- 11. Conversations de garde de l'appelant (page Messages) : l'autre personne, son rôle, le dernier message.
create function public.list_sitting_threads()
returns table(owner_id uuid, sitter_id uuid, role text, other_name text, last_text text, last_at timestamptz, sitting_id uuid, sitting_status text,
  starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  return query
  with pairs as (
    select distinct r.owner_id o, r.sitter_id s from public.sitting_requests r where uid in (r.owner_id, r.sitter_id)
    union select distinct m.owner_id, m.sitter_id from public.sitting_messages m where uid in (m.owner_id, m.sitter_id)
  )
  select pairs.o, pairs.s, case when pairs.o=uid then 'owner' else 'sitter' end, pr.name, last.text, last.created_at, req.id, req.status, req.starts_at, req.ends_at
  from pairs
  join public.profiles pr on pr.id=case when pairs.o=uid then pairs.s else pairs.o end
  left join lateral (select x.text, x.created_at from public.sitting_messages x where x.owner_id=pairs.o and x.sitter_id=pairs.s order by x.id desc limit 1) last on true
  left join lateral (select r.id, r.status, r.starts_at, r.ends_at, r.created_at from public.sitting_requests r where r.owner_id=pairs.o and r.sitter_id=pairs.s
    order by (r.status in ('pending','accepted','confirmed')) desc, r.created_at desc limit 1) req on true
  where public.meeting_member_active(case when pairs.o=uid then pairs.s else pairs.o end)
    and not public.meeting_blocked(uid, case when pairs.o=uid then pairs.s else pairs.o end)
  order by coalesce(last.created_at, req.created_at) desc nulls last limit 100;
end $$;

-- 12. Écrire : le propriétaire à un gardien actif (avant ou après une demande) ; le gardien, seulement à qui l'a contacté.
create function public.send_sitting_message(p_owner uuid, p_sitter uuid, p_text text, p_request uuid)
returns public.sitting_messages language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); other uuid; saved public.sitting_messages;
begin
  if uid not in (p_owner, p_sitter) or p_owner = p_sitter then raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  other := case when uid=p_owner then p_sitter else p_owner end;
  if uid=p_owner and not exists(select 1 from public.sitter_profiles where user_id=p_sitter and active)
     and not exists(select 1 from public.sitting_requests where owner_id=p_owner and sitter_id=p_sitter) then
    raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  if uid=p_sitter and not exists(select 1 from public.sitting_requests where owner_id=p_owner and sitter_id=p_sitter)
     and not exists(select 1 from public.sitting_messages where owner_id=p_owner and sitter_id=p_sitter and sender_id=p_owner) then
    raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  if not public.meeting_member_active(other) or public.meeting_blocked(uid, other) then raise exception 'Conversation indisponible' using errcode='42501'; end if;
  if p_request is null or p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then raise exception 'Message invalide' using errcode='22023'; end if;
  insert into public.sitting_messages(owner_id, sitter_id, sender_id, text, request_id) values (p_owner, p_sitter, uid, btrim(p_text), p_request)
    on conflict (sender_id, request_id) do nothing returning * into saved;
  if saved.id is null then select * into saved from public.sitting_messages where sender_id=uid and request_id=p_request; end if;
  if saved.owner_id<>p_owner or saved.sitter_id<>p_sitter or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
  return saved;
end $$;

-- 13. Nouvelles de l'animal : le gardien, pendant une garde réservée (de la veille au lendemain).
create function public.add_sitting_update(p_sitting uuid, p_text text)
returns public.sitting_updates language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); current public.sitting_requests; saved public.sitting_updates;
begin
  select * into current from public.sitting_requests where id=p_sitting;
  if current.id is null or current.sitter_id<>uid or current.status<>'confirmed'
    or now() not between current.starts_at - interval '1 day' and current.ends_at + interval '1 day' then
    raise exception 'Garde non autorisée' using errcode='42501'; end if;
  if p_text is null or char_length(btrim(p_text)) not between 1 and 1000 then raise exception 'Nouvelle invalide' using errcode='22023'; end if;
  insert into public.sitting_updates(sitting_id, author_id, text) values (p_sitting, uid, btrim(p_text)) returning * into saved;
  return saved;
end $$;

-- 14. Signaler un problème sur une garde (un dossier ouvert à la fois par personne), et/ou bloquer l'autre personne.
-- Bloquer coupe la conversation mais laisse la demande, la réservation et le signalement consultables.
create function public.report_sitting(p_sitting uuid, p_category text, p_details text)
returns public.sitting_reports language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); saved public.sitting_reports;
begin
  if not exists(select 1 from public.sitting_requests where id=p_sitting and uid in (owner_id, sitter_id)) then
    raise exception 'Demande introuvable' using errcode='42501'; end if;
  if p_category is null or p_category not in ('sante','non_conforme','comportement','paiement') or p_details is null
    or char_length(btrim(p_details)) not between 10 and 2000 then raise exception 'Signalement invalide' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sitting::text || uid::text, 3));
  select * into saved from public.sitting_reports where sitting_id=p_sitting and reporter_id=uid and status<>'closed';
  if saved.id is not null then return saved; end if;
  insert into public.sitting_reports(sitting_id, reporter_id, category, details) values (p_sitting, uid, p_category, btrim(p_details)) returning * into saved;
  return saved;
end $$;

create function public.block_sitting_contact(p_other uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  if p_other is null or p_other=uid or not exists(
    select 1 from public.sitting_requests where (owner_id=uid and sitter_id=p_other) or (owner_id=p_other and sitter_id=uid)
    union all select 1 from public.sitting_messages where (owner_id=uid and sitter_id=p_other) or (owner_id=p_other and sitter_id=uid)) then
    raise exception 'Contact introuvable' using errcode='42501'; end if;
  insert into public.meeting_blocks(blocker_id, blocked_id) values (uid, p_other) on conflict do nothing;
end $$;

-- Droits d'appel : comptes connectés uniquement.
do $$ declare f text; begin
  foreach f in array array[
    'save_sitter_profile(text,text,text,numeric,numeric,text[],integer,text,jsonb,boolean)',
    'search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid)',
    'create_sitting_request(uuid,uuid,text,timestamptz,timestamptz,text,uuid)',
    'update_sitting_request(uuid,text,text)',
    'list_my_sittings(uuid)',
    'list_sitting_threads()',
    'send_sitting_message(uuid,uuid,text,uuid)',
    'add_sitting_update(uuid,text)',
    'report_sitting(uuid,text,text)',
    'block_sitting_contact(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
