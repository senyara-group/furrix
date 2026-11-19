-- Correctif d'intégration, sans modification des migrations déjà appliquées.
-- À revoir et autoriser avant application DEV.
begin;
create or replace function public.swipe_and_match(p_pet uuid,p_target uuid,p_dir text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target_owner uuid; decision text; result uuid;
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  if p_dir is null or p_dir not in ('left','right') then raise exception 'Direction invalide' using errcode='22023'; end if;
  if not exists(select 1 from public.pets where id=p_pet and owner_id=uid) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  -- Même verrou dans les deux sens, pris seulement pour son propre animal ; une collision de hash ne fait que sérialiser davantage.
  perform pg_advisory_xact_lock(hashtextextended(least(p_pet,p_target)::text||greatest(p_pet,p_target)::text,0));
  select owner_id into target_owner from public.pets where id=p_target and id<>p_pet and owner_id<>uid;
  if target_owner is null or not public.meeting_member_active(target_owner) or public.meeting_blocked(uid,target_owner) then
    raise exception 'Profil indisponible' using errcode='42501'; end if;
  insert into public.swipes(pet_id,target_pet_id,direction) values(p_pet,p_target,p_dir) on conflict(pet_id,target_pet_id) do nothing;
  select direction into decision from public.swipes where pet_id=p_pet and target_pet_id=p_target;
  if decision<>p_dir then raise exception 'Une décision différente existe déjà' using errcode='23505'; end if;
  if decision='right' and exists(select 1 from public.swipes where pet_id=p_target and target_pet_id=p_pet and direction in ('right','super')) then
    insert into public.matches(pet_a,pet_b) values(least(p_pet,p_target),greatest(p_pet,p_target)) on conflict(pet_a,pet_b) do nothing;
    select id into result from public.matches where pet_a=least(p_pet,p_target) and pet_b=greatest(p_pet,p_target);
  end if;
  return result;
end $$;

create or replace function public.meeting_photo_visible(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_use_private_beta() and exists(
    select 1 from public.pets p
    where not public.meeting_blocked(auth.uid(),p.owner_id) and p.photos[1]=p_path and split_part(p_path,'/',1)=p.owner_id::text and split_part(p_path,'/',2)=p.id::text
      and public.meeting_member_active(p.owner_id)
  );
$$;

create or replace function public.create_meeting_proposal(p_match uuid, p_activity text, p_place text, p_slots timestamptz[], p_message text, p_request uuid)
returns public.meeting_proposals language plpgsql volatile security definer set search_path='' as $$
declare saved public.meeting_proposals; uid uuid := auth.uid();
begin
  perform public.usable_match(p_match);
  if p_request is null then raise exception 'Proposition invalide' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_match::text, 1));
  select * into saved from public.meeting_proposals where proposer_id=uid and request_id=p_request;
  if saved.id is not null then
    if saved.match_id <> p_match then raise exception 'Requête différente' using errcode='23505'; end if;
    return saved;
  end if;
  if p_request is null or p_activity is null or p_activity not in ('balade','jeu') or p_place is null or char_length(btrim(p_place)) not between 3 and 120
    or p_slots is null or cardinality(p_slots) not between 1 and 3 or array_position(p_slots, null) is not null
    or exists(select 1 from unnest(p_slots) s where s <= now()) or (select count(distinct s) from unnest(p_slots) s) <> cardinality(p_slots)
    or (p_message is not null and char_length(btrim(p_message)) > 500) then
    raise exception 'Proposition invalide' using errcode='22023'; end if;
  if exists(select 1 from public.meeting_proposals where match_id=p_match and status in ('pending','accepted')) then
    raise exception 'Une proposition est déjà en cours' using errcode='23505'; end if;
  insert into public.meeting_proposals(match_id, proposer_id, activity, place, slots, message, request_id)
    values (p_match, uid, p_activity, btrim(p_place), (select array_agg(s order by s) from unnest(p_slots) s), nullif(btrim(p_message), ''), p_request)
    returning * into saved;
  return saved;
end $$;
commit;
