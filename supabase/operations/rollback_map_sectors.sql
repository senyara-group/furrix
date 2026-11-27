-- Retour arrière de map_sectors : search_sitters et discover_pets ne renvoient plus de secteur.
begin;
drop function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid);
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
revoke all on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) to authenticated;
drop function public.discover_pets(uuid,text,text,integer,uuid,integer,text,text);
create function public.discover_pets(p_pet uuid,p_species text default null,p_purpose text default null,p_radius integer default null,p_after uuid default null,p_limit integer default 20,p_goal text default null,p_size text default null)
returns table(id uuid,owner_id uuid,name text,species text,breed text,age text,gender text,purpose text,city text,bio text,photos text[],owner_name text,distance_km integer,
  size text,meeting_goals text[],temperament text,good_with text,usual_outings text,behaviour_traits text[])
language plpgsql stable security definer set search_path='' as $$
declare origin public.pet_meeting_locations;
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where pets.id=p_pet and pets.owner_id=auth.uid() and pets.archived_at is null) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or (p_radius is not null and p_radius not between 1 and 500)
    or (p_goal is not null and p_goal not in ('balade','jeu','socialisation')) or (p_size is not null and p_size not in ('petit','moyen','grand')) then
    raise exception 'Filtre invalide' using errcode='22023'; end if;
  select * into origin from public.pet_meeting_locations where pet_id=p_pet;
  if p_radius is not null and origin.pet_id is null then raise exception 'Localisation requise' using errcode='22023'; end if;
  return query
  select q.id,q.owner_id,q.name,q.species,q.breed,q.age,q.gender,q.purpose,q.city,q.bio,
    case when q.photos[1] is null then '{}'::text[] else array[q.photos[1]] end,q.owner_name,round(q.km)::integer,
    q.size,q.meeting_goals,q.temperament,q.good_with,q.usual_outings,q.behaviour_traits
  from (
    select p.*,pr.name owner_name,
      case when origin.pet_id is not null and loc.pet_id is not null then
        6371.0*2*asin(sqrt(least(1.0,greatest(0.0,
          power(sin(radians((loc.latitude-origin.latitude)::float8)/2),2)+
          cos(radians(origin.latitude::float8))*cos(radians(loc.latitude::float8))*power(sin(radians((loc.longitude-origin.longitude)::float8)/2),2)))))
      end km
    from public.pets p join public.profiles pr on pr.id=p.owner_id
    left join public.pet_meeting_locations loc on loc.pet_id=p.id
    where p.archived_at is null and p.owner_id<>auth.uid() and public.meeting_member_active(p.owner_id) and not public.meeting_blocked(auth.uid(), p.owner_id)
      and (p_species is null or p.species=p_species) and (p_purpose is null or p.purpose=p_purpose)
      and (p_goal is null or p_goal=any(p.meeting_goals)) and (p_size is null or p.size=p_size)
      and (p_after is null or p.id>p_after)
      and not exists(select 1 from public.swipes s where s.pet_id=p_pet and s.target_pet_id=p.id)
  ) q where p_radius is null or q.km<=p_radius order by q.id limit p_limit;
end $$;
revoke all on function public.discover_pets(uuid,text,text,integer,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.discover_pets(uuid,text,text,integer,uuid,integer,text,text) to authenticated;
commit;
