-- Lot limité : F01-F04 et protection de pets.verified (F13).
-- Pas de modification des quotas, récompenses ou handlers RevenueCat.
begin;

-- Retirer aussi les ACL de colonnes et celles des rôles parents : REVOKE sur
-- authenticated seul ne retire ni PUBLIC, ni les droits hérités d'un groupe.
-- Refuser une configuration où les rôles API possèdent les objets ou BYPASSRLS.
do $$
declare r record; t text; cols text;
begin
  for r in
    with recursive api_roles(oid) as (
      select oid from pg_roles where rolname in ('anon', 'authenticated')
      union
      select m.roleid from pg_auth_members m join api_roles a on m.member = a.oid
    )
    select p.* from pg_roles p join api_roles a on p.oid = a.oid
  loop
    if r.rolsuper or r.rolbypassrls or exists (
      select 1 from pg_class where relowner = r.oid and relnamespace = 'public'::regnamespace
    ) or exists (
      select 1 from pg_proc where proowner = r.oid and pronamespace = 'public'::regnamespace
    ) then
      raise exception 'Rôle API ou parent privilégié non supporté : %', r.rolname;
    end if;
  end loop;

  for r in
    with recursive api_roles(oid) as (
      select oid from pg_roles where rolname in ('anon', 'authenticated')
      union
      select m.roleid from pg_auth_members m join api_roles a on m.member = a.oid
    )
    select quote_ident(p.rolname) as grantee from pg_roles p join api_roles a on p.oid = a.oid
    union select 'PUBLIC'
  loop
    foreach t in array array['profiles','pets','rate_limit_events','blocked_entities','revenuecat_events'] loop
      execute format('revoke all privileges on table public.%I from %s cascade', t, r.grantee);
      select string_agg(quote_ident(attname), ', ') into cols from pg_attribute
        where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
      execute format('revoke all privileges (%s) on table public.%I from %s cascade', cols, t, r.grantee);
    end loop;
    execute format('revoke all privileges on sequence public.rate_limit_events_id_seq from %s cascade', r.grantee);
    execute format('revoke all privileges on function public.increment_paws(uuid,integer) from %s cascade', r.grantee);
    execute format('revoke all privileges on function public.swipe_and_match(uuid,uuid,text) from %s cascade', r.grantee);
  end loop;
end $$;

grant select on public.profiles, public.pets to anon, authenticated;
grant update (name, city, bio) on public.profiles to authenticated;
grant insert (id, owner_id, name, species, breed, age, gender, purpose, photos,
  bio, vc, ster, chip, allerg, energy, social, clean, food, toy, weight,
  lat, lng, city, region) on public.pets to authenticated;
grant update (name, species, breed, age, gender, purpose, photos, bio, vc, ster,
  chip, allerg, energy, social, clean, food, toy, weight, lat, lng, city, region)
  on public.pets to authenticated;
grant delete on public.pets to authenticated;

alter table public.rate_limit_events enable row level security;
alter table public.blocked_entities enable row level security;
alter table public.revenuecat_events enable row level security;
-- service_role est le rôle serveur Supabase BYPASSRLS ; aucune policy client.
grant all privileges on public.profiles, public.pets, public.rate_limit_events,
  public.blocked_entities, public.revenuecat_events to service_role;
grant usage, select on sequence public.rate_limit_events_id_seq to service_role;

create or replace function public.increment_paws(p_user uuid, p_delta int)
returns table(paws int, xp int, level int)
language plpgsql security definer set search_path = '' as $$
declare v_paws int; v_xp int; v_level int;
begin
  update public.rewards_ledger as l
    set paws = l.paws + p_delta,
        xp = l.xp + greatest(p_delta, 0),
        updated_at = now()
    where l.user_id = p_user
    returning l.paws, l.xp into v_paws, v_xp;
  v_level := least(5, greatest(1, (v_xp / 500) + 1));
  update public.rewards_ledger as l set level = v_level where l.user_id = p_user;
  return query select v_paws, v_xp, v_level;
end; $$;
grant execute on function public.increment_paws(uuid,integer) to service_role;

create or replace function public.swipe_and_match(p_pet uuid, p_target uuid, p_dir text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pets where id = p_pet and owner_id = v_user) then
    raise exception 'Animal non autorisé' using errcode = '42501';
  end if;
  if p_pet = p_target or not exists (
    select 1 from public.pets where id = p_target and owner_id <> v_user
  ) then
    raise exception 'Cible non autorisée' using errcode = '22023';
  end if;
  if p_dir is null or p_dir not in ('left','right','super') then
    raise exception 'Direction invalide' using errcode = '22023';
  end if;
  insert into public.swipes (pet_id, target_pet_id, direction) values (p_pet, p_target, p_dir)
    on conflict (pet_id, target_pet_id) do nothing;
  if p_dir in ('right','super') and exists (
    select 1 from public.swipes where pet_id = p_target and target_pet_id = p_pet
      and direction in ('right','super')) then
    insert into public.matches (pet_a, pet_b)
      values (least(p_pet,p_target), greatest(p_pet,p_target))
      on conflict do nothing returning id into v_match;
  end if;
  return v_match;
end; $$;
grant execute on function public.swipe_and_match(uuid,uuid,text) to authenticated, service_role;

commit;
