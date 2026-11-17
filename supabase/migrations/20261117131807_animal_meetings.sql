-- Rencontres bêta : animal actif côté client, découverte, localisation approximative facultative,
-- j'aime, matchs réciproques et conversation après match. À appliquer uniquement après revue et accord sur DEV.
--
-- Retour arrière (testé localement sur PostgreSQL 16, à exécuter dans une transaction) :
--   begin;
--   drop policy if exists "rencontres : photo principale" on storage.objects;
--   drop function if exists public.send_match_message(uuid,text,uuid);
--   drop index if exists public.messages_request_unique;
--   alter table public.messages drop column if exists request_id;
--   drop function if exists public.list_pet_matches(uuid);
--   drop function if exists public.meeting_photo_visible(text);
--   drop function if exists public.discover_pets(uuid,text,text,integer,uuid,integer);
--   drop function if exists public.set_pet_meeting_location(uuid,numeric,numeric);
--   drop table if exists public.pet_meeting_locations;
--   -- puis recréer swipe_and_match à l'identique de 20261117110807_private_beta.sql, et seulement ensuite :
--   drop function if exists public.meeting_member_active(uuid);
--   commit;
-- Les écritures directes sur swipes, matches et messages restent retirées : l'ancien client ne les utilisait pas.
begin;

-- Statut d'un autre testeur, réservé aux fonctions privilégiées : non exécutable par les clients,
-- pour ne pas permettre de sonder l'appartenance à la bêta d'un identifiant quelconque.
-- Condition unique définie par 20261117120000_private_beta_access_duration (sans échéance, expiré, révoqué).
create function public.meeting_member_active(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.private_beta_member_active(p_user);
$$;
revoke all on function public.meeting_member_active(uuid) from public,anon,authenticated;

create table public.pet_meeting_locations (
  pet_id uuid primary key references public.pets(id) on delete cascade,
  latitude numeric(4,2) not null check (latitude between -90 and 90),
  longitude numeric(5,2) not null check (longitude between -180 and 180)
);
alter table public.pet_meeting_locations enable row level security;
revoke all on public.pet_meeting_locations from public, anon, authenticated;
grant select on public.pet_meeting_locations to authenticated;
grant all on public.pet_meeting_locations to service_role;
create policy "localisation de ses animaux" on public.pet_meeting_locations for select to authenticated
  using (exists(select 1 from public.pets p where p.id=pet_id and p.owner_id=(select auth.uid())));
create policy "bêta privée : accès requis" on public.pet_meeting_locations as restrictive for all to anon,authenticated
  using ((select public.can_use_private_beta())) with check ((select public.can_use_private_beta()));

create function public.set_pet_meeting_location(p_pet uuid,p_lat numeric default null,p_lng numeric default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then
    raise exception 'Animal non autorisé' using errcode='42501'; end if;
  if p_lat is null and p_lng is null then delete from public.pet_meeting_locations where pet_id=p_pet; return; end if;
  if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) then
    raise exception 'Position invalide' using errcode='22023'; end if;
  insert into public.pet_meeting_locations values(p_pet,round(p_lat,2),round(p_lng,2))
    on conflict(pet_id) do update set latitude=excluded.latitude,longitude=excluded.longitude;
end $$;
revoke all on function public.set_pet_meeting_location(uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.set_pet_meeting_location(uuid,numeric,numeric) to authenticated;

-- Les décisions passent exclusivement par la RPC ; retirer aussi les grants hérités et de colonnes.
-- Tous les droits par défaut de Supabase sont retirés (dont TRUNCATE, qui ignore la RLS) ; seule la lecture est rendue.
do $$ declare r record; t text; cols text; begin
  for r in
    with recursive api_roles(oid) as (
      select oid from pg_roles where rolname in ('anon','authenticated') union
      select m.roleid from pg_auth_members m join api_roles a on a.oid=m.member
    ) select quote_ident(p.rolname) grantee from pg_roles p join api_roles a on a.oid=p.oid union select 'PUBLIC'
  loop
    foreach t in array array['swipes','matches','messages'] loop
      execute format('revoke all privileges on public.%I from %s cascade',t,r.grantee);
      select string_agg(quote_ident(attname),',') into cols from pg_attribute
        where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
      execute format('revoke insert (%s),update (%s) on public.%I from %s cascade',cols,cols,t,r.grantee);
    end loop;
  end loop;
end $$;
grant select on public.swipes, public.matches, public.messages to authenticated;

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
  if target_owner is null or not public.meeting_member_active(target_owner) then
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

create function public.discover_pets(p_pet uuid,p_species text default null,p_purpose text default null,p_radius integer default null,p_after uuid default null,p_limit integer default 20)
returns table(id uuid,owner_id uuid,name text,species text,breed text,age text,gender text,purpose text,city text,bio text,photos text[],owner_name text,distance_km integer)
language plpgsql stable security definer set search_path='' as $$
declare origin public.pet_meeting_locations;
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where pets.id=p_pet and pets.owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 40 or (p_radius is not null and p_radius not between 1 and 500) then raise exception 'Filtre invalide' using errcode='22023'; end if;
  select * into origin from public.pet_meeting_locations where pet_id=p_pet;
  if p_radius is not null and origin.pet_id is null then raise exception 'Localisation requise' using errcode='22023'; end if;
  return query
  select q.id,q.owner_id,q.name,q.species,q.breed,q.age,q.gender,q.purpose,q.city,q.bio,
    case when q.photos[1] is null then '{}'::text[] else array[q.photos[1]] end,q.owner_name,round(q.km)::integer
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
      and (p_after is null or p.id>p_after)
      and not exists(select 1 from public.swipes s where s.pet_id=p_pet and s.target_pet_id=p.id)
  ) q where p_radius is null or q.km<=p_radius order by q.id limit p_limit;
end $$;
revoke all on function public.discover_pets(uuid,text,text,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.discover_pets(uuid,text,text,integer,uuid,integer) to authenticated;

-- Accès en lecture à la seule photo principale d'un profil bêta autorisé ; aucune écriture partagée.
create function public.meeting_photo_visible(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.can_use_private_beta() and exists(
    select 1 from public.pets p
    where p.photos[1]=p_path and split_part(p_path,'/',1)=p.owner_id::text and split_part(p_path,'/',2)=p.id::text
      and public.meeting_member_active(p.owner_id)
  );
$$;
revoke all on function public.meeting_photo_visible(text) from public,anon,authenticated;
grant execute on function public.meeting_photo_visible(text) to authenticated;
create policy "rencontres : photo principale" on storage.objects for select to authenticated
  using (bucket_id='pet-photos' and public.meeting_photo_visible(name));

create function public.list_pet_matches(p_pet uuid)
returns table(match_id uuid,pet_id uuid,name text,owner_name text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_use_private_beta() or not exists(select 1 from public.pets where id=p_pet and owner_id=auth.uid()) then raise exception 'Animal non autorisé' using errcode='42501'; end if;
  return query select m.id,p.id,p.name,pr.name,m.created_at from public.matches m
    join public.pets p on p.id=case when m.pet_a=p_pet then m.pet_b else m.pet_a end
    join public.profiles pr on pr.id=p.owner_id
    where (m.pet_a=p_pet or m.pet_b=p_pet) and public.meeting_member_active(p.owner_id)
    order by m.created_at desc,m.id limit 100;
end $$;
revoke all on function public.list_pet_matches(uuid) from public,anon,authenticated;
grant execute on function public.list_pet_matches(uuid) to authenticated;

-- Identifiant de requête client : un double clic ou nouvel essai ne duplique pas le message.
alter table public.messages add column request_id uuid;
create unique index messages_request_unique on public.messages(sender_id,request_id) where request_id is not null;
create function public.send_match_message(p_match uuid,p_text text,p_request uuid)
returns public.messages language plpgsql security definer set search_path='' as $$
declare saved public.messages; uid uuid:=auth.uid(); other uuid;
begin
  if uid is not null and public.can_use_private_beta() then
    select case when a.owner_id=uid then b.owner_id else a.owner_id end into other
      from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
      where m.id=p_match and (a.owner_id=uid or b.owner_id=uid);
  end if;
  if other is null then raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  if not public.meeting_member_active(other) then raise exception 'Conversation indisponible' using errcode='42501'; end if;
  if p_request is null or p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then raise exception 'Message invalide' using errcode='22023'; end if;
  insert into public.messages(match_id,sender_id,text,request_id) values(p_match,uid,btrim(p_text),p_request)
    on conflict(sender_id,request_id) where request_id is not null do nothing returning * into saved;
  if saved.id is null then select * into saved from public.messages where sender_id=uid and request_id=p_request; end if;
  if saved.match_id<>p_match or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
  return saved;
end $$;
revoke all on function public.send_match_message(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.send_match_message(uuid,text,uuid) to authenticated;
commit;
