-- Retrait du profil, avec historique conservé. Aucune suppression physique ni restauration client.
begin;
alter table public.pets add column archived_at timestamptz;
create policy "animaux actifs uniquement" on public.pets as restrictive for all to authenticated
 using(archived_at is null) with check(archived_at is null);
-- Un DELETE direct contournerait le contrôle des activités et détruirait l’historique en cascade.
revoke delete on public.pets from authenticated;

create function public.pet_retirement_blockers(p_pet uuid) returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501';end if;
 return query select q.section,q.total from (
 select 'rencontres'::text section,count(*)::integer total from public.meeting_proposals p join public.matches m on m.id=p.match_id where p_pet in(m.pet_a,m.pet_b) and (p.status='pending' or (p.status='accepted' and p.chosen_slot>now()))
 union all select 'garde',count(*)::integer from public.sitting_requests where pet_id=p_pet and status in('pending','accepted','confirmed') and ends_at>now()
 union all select 'services',count(*)::integer from public.professional_appointments a join public.professional_slots s on s.id=a.slot_id where a.pet_id=p_pet and a.status in('pending','countered','confirmed') and s.ends_at>now()
 union all select 'animaux_perdus',count(*)::integer from public.lost_pets where pet_id=p_pet and status='lost'
 ) q where q.total>0;
end $$;
create function public.retire_pet_profile(p_pet uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare pet public.pets;
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 select * into pet from public.pets where id=p_pet and owner_id=auth.uid() for update;
 if pet.id is null or not public.can_use_private_beta() then raise exception 'Animal non autorisé' using errcode='42501';end if;
 if pet.archived_at is not null then return;end if;
 if exists(select 1 from public.pet_retirement_blockers(p_pet)) then raise exception 'Activités à traiter avant le retrait' using errcode='23503';end if;
 -- Les producteurs prennent un verrou partagé sur l’animal avant chaque nouvelle activité.
 -- Le verrou exclusif ci-dessus empêche une nouvelle demande entre le contrôle et le retrait.
 update public.pets set archived_at=clock_timestamp() where id=p_pet;
 update public.lost_pets set status='closed' where pet_id=p_pet and status='found';
 update public.matches set ended_at=coalesce(ended_at,clock_timestamp()),ended_by=coalesce(ended_by,auth.uid()) where p_pet in(pet_a,pet_b) and ended_at is null;
 delete from public.pet_meeting_locations where pet_id=p_pet;
end $$;
revoke all on function public.pet_retirement_blockers(uuid),public.retire_pet_profile(uuid) from public,anon,authenticated;
grant execute on function public.pet_retirement_blockers(uuid),public.retire_pet_profile(uuid) to authenticated;

create function public.guard_live_pet_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[];pet_id uuid;retired timestamptz;
begin
 if tg_table_name='swipes' then ids:=array[new.pet_id,new.target_pet_id];
 elsif tg_table_name='matches' then ids:=array[new.pet_a,new.pet_b];
 elsif tg_table_name in('messages','meeting_proposals') then
  if tg_table_name='meeting_proposals' then
   if new.status not in('pending','accepted') then return new;end if;
  end if;
  select array[m.pet_a,m.pet_b] into ids from public.matches m where m.id=new.match_id;
 elsif tg_table_name='lost_pets' then
  if new.status='closed' then return new;end if;ids:=array[new.pet_id];
 else ids:=array[new.pet_id];end if;
 if ids is null or array_position(ids,null) is not null then raise exception 'Animal indisponible' using errcode='42501';end if;
 for pet_id in select distinct x from unnest(ids) x order by x loop
  select p.archived_at into retired from public.pets p where p.id=pet_id for share;
  if not found or retired is not null then raise exception 'Profil animal retiré ou indisponible' using errcode='42501';end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_live_pet_activity() from public,anon,authenticated;
create trigger active_pet_swipe before insert on public.swipes for each row execute function public.guard_live_pet_activity();
create trigger active_pet_match before insert on public.matches for each row execute function public.guard_live_pet_activity();
create trigger active_pet_message before insert on public.messages for each row execute function public.guard_live_pet_activity();
create trigger active_pet_proposal before insert or update on public.meeting_proposals for each row execute function public.guard_live_pet_activity();
create trigger active_pet_location before insert or update on public.pet_meeting_locations for each row execute function public.guard_live_pet_activity();
create trigger active_pet_sitting before insert on public.sitting_requests for each row execute function public.guard_live_pet_activity();
create trigger active_pet_appointment before insert on public.professional_appointments for each row execute function public.guard_live_pet_activity();
create trigger active_pet_lost before insert or update on public.lost_pets for each row execute function public.guard_live_pet_activity();

create or replace function public.discover_pets(p_pet uuid,p_species text default null,p_purpose text default null,p_radius integer default null,p_after uuid default null,p_limit integer default 20,p_goal text default null,p_size text default null)
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
create or replace function public.app_notification_visible(p_user uuid,p_other uuid,p_type text,p_target uuid,p_context uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.private_beta_member_active(p_user) and public.private_beta_member_active(p_other) and not public.meeting_blocked(p_user,p_other) and case
 when p_type='like' then exists(select 1 from public.pets where id=p_target and owner_id=p_user and archived_at is null)
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
    where p.archived_at is null and not public.meeting_blocked(auth.uid(),p.owner_id) and p.photos[1]=p_path and split_part(p_path,'/',1)=p.owner_id::text and split_part(p_path,'/',2)=p.id::text
      and public.meeting_member_active(p.owner_id)
  );
$$;
commit;
