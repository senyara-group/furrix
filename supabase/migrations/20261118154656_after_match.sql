-- Après le match (maquette « Plein air », planche 1b) : propositions de rencontre, blocage et signalement.
-- Règles encore « à définir » dans la maquette, volontairement absentes ici : expiration d'une proposition,
-- limite de propositions (gratuit / Premium), règle sur les annulations répétées, suite d'un signalement.
-- Une seule proposition en cours (en attente ou confirmée) par match : la suivante vient après réponse ou annulation.

-- 1. Blocage : entre deux propriétaires, quel que soit l'animal.
create table public.meeting_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.meeting_blocks enable row level security;
revoke all on public.meeting_blocks from public, anon, authenticated;

create function public.meeting_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.meeting_blocks where (blocker_id=p_a and blocked_id=p_b) or (blocker_id=p_b and blocked_id=p_a));
$$;
revoke all on function public.meeting_blocked(uuid,uuid) from public, anon, authenticated;

-- Le match vu par l'appelant : son animal, l'autre animal et son propriétaire. Null si non participant.
create function public.match_sides(p_match uuid)
returns table(my_pet uuid, other_pet uuid, other_owner uuid)
language sql stable security definer set search_path='' as $$
  select case when a.owner_id=auth.uid() then a.id else b.id end,
         case when a.owner_id=auth.uid() then b.id else a.id end,
         case when a.owner_id=auth.uid() then b.owner_id else a.owner_id end
  from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
  where m.id=p_match and (a.owner_id=auth.uid() or b.owner_id=auth.uid()) and a.owner_id<>b.owner_id;
$$;
revoke all on function public.match_sides(uuid) from public, anon, authenticated;

-- Match utilisable : participant, bêta active des deux côtés, aucun blocage.
create function public.usable_match(p_match uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare sides record;
begin
  if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into sides from public.match_sides(p_match);
  if sides.other_owner is null then raise exception 'Match non autorisé' using errcode='42501'; end if;
  if not public.meeting_member_active(sides.other_owner) or public.meeting_blocked(auth.uid(), sides.other_owner) then
    raise exception 'Conversation indisponible' using errcode='42501'; end if;
end $$;
revoke all on function public.usable_match(uuid) from public, anon, authenticated;

-- 2. Propositions de rencontre : activité, lieu, 1 à 3 créneaux, message. Écritures uniquement par fonctions.
create table public.meeting_proposals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null check (activity in ('balade','jeu')),
  place text not null check (char_length(btrim(place)) between 3 and 120),
  slots timestamptz[] not null check (cardinality(slots) between 1 and 3),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','withdrawn','declined','accepted','cancelled')),
  chosen_slot timestamptz,
  cancel_note text check (cancel_note is null or char_length(cancel_note) <= 300),
  cancelled_by uuid references public.profiles(id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('accepted','cancelled')) = (chosen_slot is not null))
);
create unique index meeting_proposals_request on public.meeting_proposals(proposer_id, request_id);
create unique index meeting_proposals_one_open on public.meeting_proposals(match_id) where status in ('pending','accepted');
alter table public.meeting_proposals enable row level security;
revoke all on public.meeting_proposals from public, anon, authenticated;
grant select on public.meeting_proposals to authenticated;
create policy "propositions de ses matchs" on public.meeting_proposals for select to authenticated
  using ((select public.is_match_participant(match_id)));

create function public.create_meeting_proposal(p_match uuid, p_activity text, p_place text, p_slots timestamptz[], p_message text, p_request uuid)
returns public.meeting_proposals language plpgsql volatile security definer set search_path='' as $$
declare saved public.meeting_proposals; uid uuid := auth.uid();
begin
  perform public.usable_match(p_match);
  if p_request is null then raise exception 'Proposition invalide' using errcode='22023'; end if;
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
  perform pg_advisory_xact_lock(hashtextextended(p_match::text, 1));
  if exists(select 1 from public.meeting_proposals where match_id=p_match and status in ('pending','accepted')) then
    raise exception 'Une proposition est déjà en cours' using errcode='23505'; end if;
  insert into public.meeting_proposals(match_id, proposer_id, activity, place, slots, message, request_id)
    values (p_match, uid, p_activity, btrim(p_place), (select array_agg(s order by s) from unnest(p_slots) s), nullif(btrim(p_message), ''), p_request)
    returning * into saved;
  return saved;
end $$;

-- Retirer (auteur, en attente), accepter un créneau ou décliner (destinataire, en attente), annuler (l'un ou l'autre, confirmée).
create function public.update_meeting_proposal(p_id uuid, p_action text, p_slot timestamptz default null, p_note text default null)
returns public.meeting_proposals language plpgsql volatile security definer set search_path='' as $$
declare current public.meeting_proposals; uid uuid := auth.uid();
begin
  select * into current from public.meeting_proposals where id=p_id for update;
  if current.id is null then raise exception 'Proposition introuvable' using errcode='42501'; end if;
  perform public.usable_match(current.match_id);
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

-- 3. Signaler et/ou bloquer depuis un match. Le signalement est seulement enregistré pour l'équipe.
create function public.report_or_block_match(p_match uuid, p_reason text, p_details text, p_report boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare sides record; uid uuid := auth.uid();
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into sides from public.match_sides(p_match);
  if sides.other_owner is null then raise exception 'Match non autorisé' using errcode='42501'; end if;
  if p_report then
    if p_reason is null or p_reason not in ('profil_trompeur','message_deplace','animal_danger','autre')
      or (p_details is not null and char_length(btrim(p_details)) > 1000) then raise exception 'Signalement invalide' using errcode='22023'; end if;
    insert into public.reports(reporter_id, target_type, target_id, reason)
      values (uid, 'user', sides.other_owner::text, p_reason || coalesce(' : ' || nullif(btrim(p_details), ''), '') || ' (match ' || p_match || ')');
  end if;
  insert into public.meeting_blocks(blocker_id, blocked_id) values (uid, sides.other_owner) on conflict do nothing;
end $$;

-- 4. Matchs de l'appelant, tous animaux confondus (page Messages), ou un seul.
create function public.list_my_matches(p_match uuid default null)
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
  where (p_match is null or m.id=p_match) and public.meeting_member_active(other.owner_id) and not public.meeting_blocked(auth.uid(), other.owner_id)
  order by coalesce(last.created_at, m.created_at) desc, m.id limit 100;
end $$;

-- 5. Effets du blocage sur l'existant : plus de message, plus de match annoncé, plus de profil en découverte.
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
  if p_request is null or p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then raise exception 'Message invalide' using errcode='22023'; end if;
  insert into public.messages(match_id,sender_id,text,request_id) values(p_match,uid,btrim(p_text),p_request)
    on conflict(sender_id,request_id) where request_id is not null do nothing returning * into saved;
  if saved.id is null then select * into saved from public.messages where sender_id=uid and request_id=p_request; end if;
  if saved.match_id<>p_match or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
  return saved;
end $$;

create or replace function public.list_pet_matches(p_pet uuid)
returns table(match_id uuid,pet_id uuid,name text,owner_name text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  return query select m.id,p.id,p.name,pr.name,m.created_at from public.matches m
    join public.pets p on p.id=case when m.pet_a=p_pet then m.pet_b else m.pet_a end
    join public.profiles pr on pr.id=p.owner_id
    where (m.pet_a=p_pet or m.pet_b=p_pet) and public.meeting_member_active(p.owner_id) and not public.meeting_blocked(auth.uid(), p.owner_id)
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
    where ((m.pet_a=p_pet and m.seen_by_a is null) or (m.pet_b=p_pet and m.seen_by_b is null)) and public.meeting_member_active(p.owner_id)
      and not public.meeting_blocked(auth.uid(), p.owner_id)
    order by m.created_at,m.id limit 20;
end $$;

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

-- Droits : appels réservés aux comptes connectés ; les fonctions internes ne sont pas exposées.
revoke all on function public.create_meeting_proposal(uuid,text,text,timestamptz[],text,uuid) from public, anon, authenticated;
grant execute on function public.create_meeting_proposal(uuid,text,text,timestamptz[],text,uuid) to authenticated;
revoke all on function public.update_meeting_proposal(uuid,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.update_meeting_proposal(uuid,text,timestamptz,text) to authenticated;
revoke all on function public.report_or_block_match(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.report_or_block_match(uuid,text,text,boolean) to authenticated;
revoke all on function public.list_my_matches(uuid) from public, anon, authenticated;
grant execute on function public.list_my_matches(uuid) to authenticated;
