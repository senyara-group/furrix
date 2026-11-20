-- À exécuter uniquement après sauvegarde : réaffiche les profils retirés, sans rouvrir les matchs fermés.
begin;
drop trigger active_pet_swipe on public.swipes;
drop trigger active_pet_match on public.matches;
drop trigger active_pet_message on public.messages;
drop trigger active_pet_proposal on public.meeting_proposals;
drop trigger active_pet_location on public.pet_meeting_locations;
drop trigger active_pet_sitting on public.sitting_requests;
drop trigger active_pet_appointment on public.professional_appointments;
drop trigger active_pet_lost on public.lost_pets;
drop function public.guard_live_pet_activity();
drop function public.retire_pet_profile(uuid);
drop function public.pet_retirement_blockers(uuid);
drop policy "animaux actifs uniquement" on public.pets;
create or replace function public.discover_pets(p_pet uuid,p_species text default null,p_purpose text default null,p_radius integer default null,p_after uuid default null,p_limit integer default 20,p_goal text default null,p_size text default null)
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
    where p.owner_id<>auth.uid() and public.meeting_member_active(p.owner_id) and not public.meeting_blocked(auth.uid(), p.owner_id)
      and (p_species is null or p.species=p_species) and (p_purpose is null or p.purpose=p_purpose)
      and (p_goal is null or p_goal=any(p.meeting_goals)) and (p_size is null or p.size=p_size)
      and (p_after is null or p.id>p_after)
      and not exists(select 1 from public.swipes s where s.pet_id=p_pet and s.target_pet_id=p.id)
  ) q where p_radius is null or q.km<=p_radius order by q.id limit p_limit;
end $$;
create or replace function public.app_notification_visible(p_user uuid,p_other uuid,p_type text,p_target uuid,p_context uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.private_beta_member_active(p_user) and public.private_beta_member_active(p_other) and not public.meeting_blocked(p_user,p_other) and case
 when p_type='like' then exists(select 1 from public.pets where id=p_target and owner_id=p_user)
 when p_type in ('match','proposal') then exists(select 1 from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b where m.id=p_target and m.ended_at is null and p_user in(a.owner_id,b.owner_id) and p_other in(a.owner_id,b.owner_id))
 when p_type='sitting' then exists(select 1 from public.sitting_requests where id=p_target and p_user in(owner_id,sitter_id) and p_other in(owner_id,sitter_id))
 when p_type='sitting_chat' then p_user in(p_target,p_context) and p_other in(p_target,p_context)
 when p_type='appointment' then exists(select 1 from public.professional_appointments where id=p_target and p_user in(owner_id,professional_id) and p_other in(owner_id,professional_id))
 else false end;
$$;
create or replace function public.meeting_photo_visible(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_use_private_beta() and exists(
    select 1 from public.pets p
    where not public.meeting_blocked(auth.uid(),p.owner_id) and p.photos[1]=p_path and split_part(p_path,'/',1)=p.owner_id::text and split_part(p_path,'/',2)=p.id::text
      and public.meeting_member_active(p.owner_id)
  );
$$;
alter table public.pets drop column archived_at;
grant delete on public.pets to authenticated;
commit;
