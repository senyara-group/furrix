-- Fermeture définitive d'un match et respect du blocage pour tous les accès.
-- Migration additive : aucun fichier déjà appliqué n'est modifié. Application DEV après revue.
begin;
alter table public.matches add column ended_at timestamptz,
  add column ended_by uuid references public.profiles(id) on delete set null;

-- Toutes les écritures entre deux propriétaires prennent le même verrou, avant de vérifier
-- l'état du match. Une écriture commencée avant le blocage termine avant celui-ci, jamais après.
create function public.lock_meeting_owners(p_a uuid,p_b uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('meeting-owners:'||least(p_a,p_b)::text||greatest(p_a,p_b)::text,2));
end $$;
revoke all on function public.lock_meeting_owners(uuid,uuid) from public,anon,authenticated;

create function public.end_pet_match(p_match uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare sides record; uid uuid:=auth.uid();
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into sides from public.match_sides(p_match);
  if sides.other_owner is null then raise exception 'Match non autorisé' using errcode='42501'; end if;
  perform public.lock_meeting_owners(uid,sides.other_owner);
  -- Rejeu autorisé, même après fermeture ; aucun nouvel accès à la conversation.
  update public.matches set ended_at=now(),ended_by=uid where id=p_match and ended_at is null;
  if found then
    update public.meeting_proposals set status=case when status='pending' then 'withdrawn' else 'cancelled' end,
      cancelled_by=uid,updated_at=now() where match_id=p_match and status in ('pending','accepted');
  end if;
end $$;
revoke all on function public.end_pet_match(uuid) from public,anon,authenticated;
grant execute on function public.end_pet_match(uuid) to authenticated;

create or replace function public.is_match_participant(p_match uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
    where m.id=p_match and m.ended_at is null
      and public.can_use_private_beta()
      and not public.meeting_blocked(a.owner_id,b.owner_id) and (a.owner_id=(select auth.uid()) or b.owner_id=(select auth.uid())));
$$;

-- Restrictive : reste effective si une autre règle de lecture existe.
create policy "match encore accessible" on public.matches as restrictive for select to authenticated
  using ((select public.is_match_participant(id)));

create or replace function public.usable_match(p_match uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare sides record;
begin
  if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into sides from public.match_sides(p_match);
  if sides.other_owner is null then raise exception 'Match non autorisé' using errcode='42501'; end if;
  perform public.lock_meeting_owners(auth.uid(), sides.other_owner);
  if exists(select 1 from public.matches where id=p_match and ended_at is not null) then
    raise exception 'Match terminé' using errcode='42501'; end if;
  if not public.meeting_member_active(sides.other_owner) or public.meeting_blocked(auth.uid(), sides.other_owner) then
    raise exception 'Conversation indisponible' using errcode='42501'; end if;
end $$;

create or replace function public.send_match_message(p_match uuid,p_text text,p_request uuid)
returns public.messages language plpgsql security definer set search_path='' as $$
declare saved public.messages; uid uuid:=auth.uid(); other uuid;
begin
  if uid is not null and public.can_use_private_beta() then
    select case when a.owner_id=uid then b.owner_id else a.owner_id end into other
      from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
      where m.id=p_match and (a.owner_id=uid or b.owner_id=uid);
  end if;
  if other is null then raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  if not public.meeting_member_active(other) or public.meeting_blocked(uid, other) then raise exception 'Conversation indisponible' using errcode='42501'; end if;
  perform public.usable_match(p_match);
  if p_request is null or p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then raise exception 'Message invalide' using errcode='22023'; end if;
  insert into public.messages(match_id,sender_id,text,request_id) values(p_match,uid,btrim(p_text),p_request)
    on conflict(sender_id,request_id) where request_id is not null do nothing returning * into saved;
  if saved.id is null then select * into saved from public.messages where sender_id=uid and request_id=p_request; end if;
  if saved.match_id<>p_match or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
  return saved;
end $$;

create or replace function public.list_my_matches(p_match uuid default null)
returns table(match_id uuid, matched_at timestamptz, my_pet_id uuid, my_pet_name text, pet_id uuid, name text, species text, breed text, age text, gender text,
  photo text, owner_name text, last_text text, last_at timestamptz, proposal_status text, proposal_slot timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  return query
  select m.id, m.created_at, mine.id, mine.name, other.id, other.name, other.species, other.breed, other.age, other.gender,
    other.photos[1], pr.name, last.text, last.created_at, prop.status, coalesce(prop.chosen_slot, prop.slots[1])
  from public.matches m
  join public.pets mine on mine.id in (m.pet_a, m.pet_b) and mine.owner_id=auth.uid()
  join public.pets other on other.id in (m.pet_a, m.pet_b) and other.id<>mine.id and other.owner_id<>auth.uid()
  join public.profiles pr on pr.id=other.owner_id
  left join lateral (select x.text, x.created_at from public.messages x where x.match_id=m.id order by x.id desc limit 1) last on true
  left join lateral (select p.status, p.chosen_slot, p.slots from public.meeting_proposals p where p.match_id=m.id order by p.created_at desc limit 1) prop on true
  where m.ended_at is null and (p_match is null or m.id=p_match) and public.meeting_member_active(other.owner_id) and not public.meeting_blocked(auth.uid(), other.owner_id)
  order by coalesce(last.created_at, m.created_at) desc, m.id limit 100;
end $$;

create or replace function public.list_pet_matches(p_pet uuid)
returns table(match_id uuid,pet_id uuid,name text,owner_name text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  return query select m.id,p.id,p.name,pr.name,m.created_at from public.matches m
    join public.pets p on p.id=case when m.pet_a=p_pet then m.pet_b else m.pet_a end
    join public.profiles pr on pr.id=p.owner_id
    where m.ended_at is null and (m.pet_a=p_pet or m.pet_b=p_pet) and public.meeting_member_active(p.owner_id) and not public.meeting_blocked(auth.uid(), p.owner_id)
    order by m.created_at desc,m.id limit 100;
end $$;

create or replace function public.list_new_pet_matches(p_pet uuid)
returns table(match_id uuid,pet_id uuid,name text,owner_name text,photo text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  return query select m.id,p.id,p.name,pr.name,p.photos[1],m.created_at from public.matches m
    join public.pets p on p.id=case when m.pet_a=p_pet then m.pet_b else m.pet_a end
    join public.profiles pr on pr.id=p.owner_id
    where m.ended_at is null and ((m.pet_a=p_pet and m.seen_by_a is null) or (m.pet_b=p_pet and m.seen_by_b is null)) and public.meeting_member_active(p.owner_id)
      and not public.meeting_blocked(auth.uid(), p.owner_id)
    order by m.created_at,m.id limit 20;
end $$;

create or replace function public.swipe_and_match(p_pet uuid,p_target uuid,p_dir text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target_owner uuid; decision text; result uuid;
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  if p_dir is null or p_dir not in ('left','right') then raise exception 'Direction invalide' using errcode='22023'; end if;
  if not exists(select 1 from public.pets where id=p_pet and owner_id=uid) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  select owner_id into target_owner from public.pets where id=p_target and id<>p_pet and owner_id<>uid;
  if target_owner is null then raise exception 'Profil indisponible' using errcode='42501'; end if;
  perform public.lock_meeting_owners(uid,target_owner);
  if exists(select 1 from public.matches where pet_a=least(p_pet,p_target) and pet_b=greatest(p_pet,p_target) and ended_at is not null) then
    raise exception 'Match terminé' using errcode='42501'; end if;
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

create or replace function public.update_meeting_proposal(p_id uuid, p_action text, p_slot timestamptz default null, p_note text default null)
returns public.meeting_proposals language plpgsql volatile security definer set search_path='' as $$
declare current public.meeting_proposals; uid uuid := auth.uid();
begin
  select * into current from public.meeting_proposals where id=p_id;
  if current.id is null then raise exception 'Proposition introuvable' using errcode='42501'; end if;
  perform public.usable_match(current.match_id);
  select * into current from public.meeting_proposals where id=p_id for update;
  if p_action='withdraw' and current.status='pending' and current.proposer_id=uid then
    update public.meeting_proposals set status='withdrawn', updated_at=now() where id=p_id returning * into current;
  elsif p_action='decline' and current.status='pending' and current.proposer_id<>uid then
    update public.meeting_proposals set status='declined', updated_at=now() where id=p_id returning * into current;
  elsif p_action='accept' and current.status='pending' and current.proposer_id<>uid then
    if p_slot is null or not (p_slot = any(current.slots)) or p_slot <= now() then raise exception 'Créneau invalide' using errcode='22023'; end if;
    update public.meeting_proposals set status='accepted', chosen_slot=p_slot, updated_at=now() where id=p_id returning * into current;
  elsif p_action='cancel' and current.status='accepted' then
    if p_note is not null and char_length(btrim(p_note)) > 300 then raise exception 'Message trop long' using errcode='22023'; end if;
    update public.meeting_proposals set status='cancelled', cancelled_by=uid, cancel_note=nullif(btrim(p_note), ''), updated_at=now() where id=p_id returning * into current;
  elsif (p_action='withdraw' and current.status='withdrawn') or (p_action='decline' and current.status='declined')
     or (p_action='accept' and current.status='accepted' and current.chosen_slot=p_slot) or (p_action='cancel' and current.status='cancelled') then
    null; -- Rejeu d'une action déjà faite : même résultat, sans erreur.
  else
    raise exception 'Action impossible' using errcode='42501';
  end if;
  return current;
end $$;

create or replace function public.report_or_block_match(p_match uuid, p_reason text, p_details text, p_report boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare sides record; uid uuid := auth.uid();
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into sides from public.match_sides(p_match);
  if sides.other_owner is null then raise exception 'Match non autorisé' using errcode='42501'; end if;
  perform public.lock_meeting_owners(uid,sides.other_owner);
  if p_report then
    if p_reason is null or p_reason not in ('profil_trompeur','message_deplace','animal_danger','autre')
      or (p_details is not null and char_length(btrim(p_details)) > 1000) then raise exception 'Signalement invalide' using errcode='22023'; end if;
    insert into public.reports(reporter_id, target_type, target_id, reason)
      values (uid, 'user', sides.other_owner::text, p_reason || coalesce(' : ' || nullif(btrim(p_details), ''), '') || ' (match ' || p_match || ')');
  end if;
  insert into public.meeting_blocks(blocker_id, blocked_id) values (uid, sides.other_owner) on conflict do nothing;
  update public.meeting_proposals prop set status=case when prop.status='pending' then 'withdrawn' else 'cancelled' end,
    cancelled_by=uid,updated_at=now()
    where prop.status in ('pending','accepted') and exists(
      select 1 from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
      where m.id=prop.match_id and least(a.owner_id,b.owner_id)=least(uid,sides.other_owner)
        and greatest(a.owner_id,b.owner_id)=greatest(uid,sides.other_owner));
end $$;

commit;
