-- Retour arrière de 20261123..._sitter_availability : fonctions précédentes de la garde.
-- Supprime les jours proposés, la capacité et les absences des gardiens (seules données perdues).
begin;
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
  elsif (p_action='withdraw' and uid=current.owner_id and current.status='withdrawn') or (p_action='accept' and uid=current.sitter_id and current.status='accepted')
     or (p_action='decline' and uid=current.sitter_id and current.status='declined') or (p_action='cancel' and current.status='cancelled') then
    null; -- Rejeu d'une action déjà faite : même résultat, sans erreur.
  else
    raise exception 'Action impossible' using errcode='42501';
  end if;
  return current;
end $$;

drop function if exists public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid);
create function public.search_sitters(p_lat numeric default null, p_lng numeric default null, p_radius integer default 10,
  p_service text default null, p_starts timestamptz default null, p_ends timestamptz default null, p_species text default null,
  p_sitter uuid default null)
returns table(sitter_id uuid, name text, kind text, city text, bio text, distance_km integer, species text[], max_weight_kg integer,
  outdoor text, services jsonb, price_cents integer, busy boolean, photo text)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); lat numeric; dlat numeric; dlng numeric;
begin
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180)))
    or p_radius is null or p_radius not between 1 and 100 or (p_service is not null and p_service not in ('chez_gardien','domicile','visite','promenade'))
    or (p_starts is null) <> (p_ends is null) or (p_starts is not null and p_ends <= p_starts)
    or (p_sitter is null and p_lat is null) then raise exception 'Recherche invalide' using errcode='22023'; end if;
  -- Zone large autour du point (marge d'arrondi comprise) : le calcul exact ne porte que sur ces gardiens.
  if p_lat is not null and p_sitter is null then
    lat := round(p_lat, 2);
    dlat := p_radius / 110.0 + 0.02;
    dlng := p_radius / (110.0 * greatest(cos(radians(least(89.0, abs(lat) + dlat)::float8)), 0.01)::numeric) + 0.02;
  end if;
  return query
  select q.user_id, q.name, q.kind, q.city, q.bio, case when q.km is null then null else greatest(1, round(q.km))::integer end, q.species, q.max_weight_kg, q.outdoor, q.services,
    (select (e->>'price_cents')::integer from jsonb_array_elements(q.services) e where e->>'service'=p_service), q.busy, q.photo
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

drop function if exists public.save_sitter_availability(smallint[],integer,jsonb);
drop function if exists public.sitter_conflict(uuid,timestamptz,timestamptz);
drop table if exists public.sitter_unavailability;
alter table public.sitter_profiles drop column if exists weekdays, drop column if exists capacity;
commit;
