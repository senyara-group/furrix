-- Garde : photo choisie par le gardien, affichée sur sa fiche et dans les résultats.
-- Rangée dans le bucket privé pet-photos, sous <utilisateur>/gardien/<fichier> (règles de dépôt existantes : son propre dossier).
-- Lecture par les autres comptes bêta seulement si c'est la photo d'un profil de gardien actif, non bloqué.
alter table public.sitter_profiles add column photo text
  check (photo is null or photo ~ ('^' || user_id::text || '/gardien/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'));

create function public.sitter_photo_visible(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_use_private_beta() and exists(
    select 1 from public.sitter_profiles sp
    where sp.photo=p_path and sp.active and public.meeting_member_active(sp.user_id)
      and (sp.user_id=auth.uid() or not public.meeting_blocked(auth.uid(), sp.user_id))
  );
$$;
revoke all on function public.sitter_photo_visible(text) from public, anon, authenticated;
grant execute on function public.sitter_photo_visible(text) to authenticated;
create policy "garde : photo du gardien" on storage.objects for select to authenticated
  using (bucket_id='pet-photos' and public.sitter_photo_visible(name));

-- Choisir ou retirer sa photo de gardien ; renvoie l'ancienne pour que l'app la supprime.
create function public.set_sitter_photo(p_path text default null)
returns text language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta(); previous text;
begin
  select photo into previous from public.sitter_profiles where user_id=uid for update;
  if not found then raise exception 'Profil de gardien requis' using errcode='42501'; end if;
  if p_path is not null and p_path !~ ('^' || uid::text || '/gardien/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$') then
    raise exception 'Photo invalide' using errcode='22023'; end if;
  update public.sitter_profiles set photo=p_path, updated_at=now() where user_id=uid;
  return previous;
end $$;
revoke all on function public.set_sitter_photo(text) from public, anon, authenticated;
grant execute on function public.set_sitter_photo(text) to authenticated;

-- La recherche et les demandes renvoient aussi la photo du gardien (nouvelle colonne : fonctions recréées).
drop function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid);
create function public.search_sitters(p_lat numeric default null, p_lng numeric default null, p_radius integer default 10,
  p_service text default null, p_starts timestamptz default null, p_ends timestamptz default null, p_species text default null,
  p_sitter uuid default null)
returns table(sitter_id uuid, name text, kind text, city text, bio text, distance_km integer, species text[], max_weight_kg integer,
  outdoor text, services jsonb, price_cents integer, busy boolean, photo text)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  if (p_lat is null) <> (p_lng is null) or (p_lat is not null and (not (p_lat between -90 and 90) or not (p_lng between -180 and 180)))
    or p_radius is null or p_radius not between 1 and 100 or (p_service is not null and p_service not in ('chez_gardien','domicile','visite','promenade'))
    or (p_starts is null) <> (p_ends is null) or (p_starts is not null and p_ends <= p_starts)
    or (p_sitter is null and p_lat is null) then raise exception 'Recherche invalide' using errcode='22023'; end if;
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
    where sp.active and sp.user_id<>uid and public.meeting_member_active(sp.user_id) and not public.meeting_blocked(uid, sp.user_id)
      and (p_sitter is null or sp.user_id=p_sitter)
      and (p_species is null or p_species=any(sp.species))
      and (p_service is null or exists(select 1 from public.sitter_services s where s.sitter_id=sp.user_id and s.service=p_service))
  ) q
  where p_sitter is not null or (q.km <= p_radius and not q.busy)
  order by q.km nulls last, q.user_id limit 40;
end $$;
revoke all on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function public.search_sitters(numeric,numeric,integer,text,timestamptz,timestamptz,text,uuid) to authenticated;

drop function public.list_my_sittings(uuid);
create function public.list_my_sittings(p_id uuid default null)
returns table(id uuid, role text, owner_id uuid, sitter_id uuid, other_name text, sitter_kind text, sitter_city text,
  pet_id uuid, pet_name text, pet_species text, pet_breed text, pet_age text, pet_weight text, pet_photo text,
  service text, starts_at timestamptz, ends_at timestamptz, units integer, unit_price_cents integer, message text, status text,
  cancelled_by uuid, cancel_note text, responded_at timestamptz, paid_at timestamptz, created_at timestamptz, updated_at timestamptz,
  report_id bigint, report_status text, report_at timestamptz, sitter_photo text)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := public.require_sitting_beta();
begin
  return query
  select r.id, case when r.owner_id=uid then 'owner' else 'sitter' end, r.owner_id, r.sitter_id,
    pr.name, sp.kind, sp.city, p.id, p.name, p.species, p.breed, p.age, p.weight,
    case when r.owner_id=uid then p.photos[1] end,
    r.service, r.starts_at, r.ends_at, r.units, r.unit_price_cents, r.message, r.status, r.cancelled_by, r.cancel_note,
    r.responded_at, r.paid_at, r.created_at, r.updated_at, rep.id, rep.status, rep.created_at, sp.photo
  from public.sitting_requests r
  join public.pets p on p.id=r.pet_id
  join public.profiles pr on pr.id=case when r.owner_id=uid then r.sitter_id else r.owner_id end
  left join public.sitter_profiles sp on sp.user_id=r.sitter_id
  left join lateral (select x.id, x.status, x.created_at from public.sitting_reports x where x.sitting_id=r.id and x.reporter_id=uid order by x.id desc limit 1) rep on true
  where uid in (r.owner_id, r.sitter_id) and (p_id is null or r.id=p_id)
  order by r.starts_at desc, r.id limit 100;
end $$;
revoke all on function public.list_my_sittings(uuid) from public, anon, authenticated;
grant execute on function public.list_my_sittings(uuid) to authenticated;
