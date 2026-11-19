-- Rencontres (maquette « Plein air ») : profil de rencontre de l'animal et matchs pas encore vus.
-- N'ajoute que ce qui manque : swipe_and_match, list_pet_matches et les règles d'accès existantes restent inchangées.
-- discover_pets est recréée à l'identique, avec les nouveaux champs et deux filtres en fin de signature
-- (les appels existants, positionnels ou nommés, restent valides).

-- 1. Profil de rencontre : ce que le propriétaire déclare, affiché sur la carte et la fiche.
create function public.text_items_within(p_items text[], p_max integer) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(bool_and(char_length(btrim(item)) between 1 and p_max), true) from unnest(p_items) item;
$$;

alter table public.pets
  add column meeting_goals text[] not null default '{}',
  add column size text,
  add column temperament text,
  add column good_with text,
  add column usual_outings text,
  add column behaviour_traits text[] not null default '{}';

alter table public.pets
  add constraint pets_meeting_goals_valid
    check (meeting_goals <@ array['balade','jeu','socialisation']::text[] and cardinality(meeting_goals) <= 3),
  add constraint pets_size_valid check (size is null or size in ('petit','moyen','grand')),
  add constraint pets_temperament_length check (temperament is null or char_length(temperament) <= 40),
  add constraint pets_good_with_length check (good_with is null or char_length(good_with) <= 40),
  add constraint pets_usual_outings_length check (usual_outings is null or char_length(usual_outings) <= 60),
  add constraint pets_behaviour_traits_valid
    check (cardinality(behaviour_traits) <= 3 and public.text_items_within(behaviour_traits, 80));

grant insert (meeting_goals, size, temperament, good_with, usual_outings, behaviour_traits),
  update (meeting_goals, size, temperament, good_with, usual_outings, behaviour_traits)
  on public.pets to authenticated;

-- 2. Découverte : mêmes règles, champs de rencontre en plus, filtres « Cherche » et gabarit.
drop function public.discover_pets(uuid,text,text,integer,uuid,integer);
create function public.discover_pets(p_pet uuid,p_species text default null,p_purpose text default null,p_radius integer default null,p_after uuid default null,p_limit integer default 20,p_goal text default null,p_size text default null)
returns table(id uuid,owner_id uuid,name text,species text,breed text,age text,gender text,purpose text,city text,bio text,photos text[],owner_name text,distance_km integer,
  size text,meeting_goals text[],temperament text,good_with text,usual_outings text,behaviour_traits text[])
language plpgsql stable security definer set search_path='' as $$
declare origin public.pet_meeting_locations;
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where pets.id=p_pet and pets.owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
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
    where p.owner_id<>auth.uid() and public.meeting_member_active(p.owner_id) and (p_species is null or p.species=p_species) and (p_purpose is null or p.purpose=p_purpose)
      and (p_goal is null or p_goal=any(p.meeting_goals)) and (p_size is null or p.size=p_size)
      and (p_after is null or p.id>p_after)
      and not exists(select 1 from public.swipes s where s.pet_id=p_pet and s.target_pet_id=p.id)
  ) q where p_radius is null or q.km<=p_radius order by q.id limit p_limit;
end $$;
revoke all on function public.discover_pets(uuid,text,text,integer,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.discover_pets(uuid,text,text,integer,uuid,integer,text,text) to authenticated;

-- 3. Matchs pas encore vus : celui qui a aimé en premier découvre le match à sa prochaine visite.
alter table public.matches add column seen_by_a timestamptz, add column seen_by_b timestamptz;

create function public.list_new_pet_matches(p_pet uuid)
returns table(match_id uuid,pet_id uuid,name text,owner_name text,photo text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  return query select m.id,p.id,p.name,pr.name,p.photos[1],m.created_at from public.matches m
    join public.pets p on p.id=case when m.pet_a=p_pet then m.pet_b else m.pet_a end
    join public.profiles pr on pr.id=p.owner_id
    where ((m.pet_a=p_pet and m.seen_by_a is null) or (m.pet_b=p_pet and m.seen_by_b is null)) and public.meeting_member_active(p.owner_id)
    order by m.created_at,m.id limit 20;
end $$;
revoke all on function public.list_new_pet_matches(uuid) from public,anon,authenticated;
grant execute on function public.list_new_pet_matches(uuid) to authenticated;

create function public.mark_pet_match_seen(p_match uuid,p_pet uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  update public.matches set seen_by_a=coalesce(seen_by_a,now()) where id=p_match and pet_a=p_pet;
  update public.matches set seen_by_b=coalesce(seen_by_b,now()) where id=p_match and pet_b=p_pet;
end $$;
revoke all on function public.mark_pet_match_seen(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_pet_match_seen(uuid,uuid) to authenticated;
