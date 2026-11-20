-- Restaure les fonctions précédentes ; réintroduit leurs limites de concurrence. Aucun effacement de données.
begin;
create or replace function public.send_sitting_message(p_owner uuid, p_sitter uuid, p_text text, p_request uuid)
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
  if not exists(select 1 from public.sitting_messages where sender_id=uid and request_id=p_request) then
    perform pg_advisory_xact_lock(hashtextextended(uid::text, 4));
    if (select count(*) from public.sitting_messages where sender_id=uid and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Trop de messages, réessaie dans quelques minutes' using errcode='P0001'; end if;
    if uid=p_owner and not exists(select 1 from public.sitting_messages where owner_id=p_owner and sitter_id=p_sitter)
       and not exists(select 1 from public.sitting_requests where owner_id=p_owner and sitter_id=p_sitter)
       and (select count(distinct m.sitter_id) from public.sitting_messages m where m.sender_id=uid and m.owner_id=uid
            and m.created_at > now() - interval '1 day'
            and m.id = (select min(f.id) from public.sitting_messages f where f.owner_id=m.owner_id and f.sitter_id=m.sitter_id)) >= 10 then
      raise exception 'Trop de nouvelles conversations aujourd’hui' using errcode='P0001'; end if;
  end if;
  insert into public.sitting_messages(owner_id, sitter_id, sender_id, text, request_id) values (p_owner, p_sitter, uid, btrim(p_text), p_request)
    on conflict (sender_id, request_id) do nothing returning * into saved;
  if saved.id is null then select * into saved from public.sitting_messages where sender_id=uid and request_id=p_request; end if;
  if saved.owner_id<>p_owner or saved.sitter_id<>p_sitter or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
  return saved;
end $$;

create or replace function public.create_sitting_request(p_sitter uuid, p_pet uuid, p_service text, p_starts timestamptz, p_ends timestamptz,
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
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 4));
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

create or replace function public.block_sitting_contact(p_other uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  if p_other is null or p_other=uid or not exists(
    select 1 from public.sitting_requests where (owner_id=uid and sitter_id=p_other) or (owner_id=p_other and sitter_id=uid)
    union all select 1 from public.sitting_messages where (owner_id=uid and sitter_id=p_other) or (owner_id=p_other and sitter_id=uid)) then
    raise exception 'Contact introuvable' using errcode='42501'; end if;
  insert into public.meeting_blocks(blocker_id, blocked_id) values (uid, p_other) on conflict do nothing;
end $$;
commit;
