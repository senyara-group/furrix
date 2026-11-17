-- Bêta privée : liste d'accès serveur, sans e-mail ni mot de passe dans le dépôt.
-- À appliquer uniquement après revue et autorisation sur DEV.
begin;
create table public.private_beta_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  notice_version text,
  declared_adult boolean not null default false
);
alter table public.private_beta_members enable row level security;
revoke all on public.private_beta_members from public, anon, authenticated;
grant select on public.private_beta_members to anon, authenticated;
grant all on public.private_beta_members to service_role;
create policy "lire son accès bêta" on public.private_beta_members for select to authenticated
  using (user_id = (select auth.uid()));

create function public.private_beta_status() returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce((select case
    when not m.active or m.expires_at <= now() then 'denied'
    when m.accepted_at is null or m.notice_version is distinct from '2026-11-17' or not m.declared_adult then 'pending'
    else 'active' end
    from public.private_beta_members m where m.user_id = auth.uid()), 'denied');
$$;
revoke all on function public.private_beta_status() from public, anon, authenticated;
grant execute on function public.private_beta_status() to authenticated;

-- L'invoker et la RLS de la liste évitent d'exposer les autres testeurs.
create function public.can_use_private_beta() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.private_beta_members m
    where m.user_id = auth.uid() and m.active and m.expires_at > now()
      and m.accepted_at is not null and m.notice_version = '2026-11-17' and m.declared_adult);
$$;
revoke all on function public.can_use_private_beta() from public, anon, authenticated;
grant execute on function public.can_use_private_beta() to anon, authenticated, service_role;

create function public.accept_private_beta_notice(p_adult boolean, p_read_notice boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_adult is distinct from true or p_read_notice is distinct from true then
    raise exception 'Participation non confirmée' using errcode = '42501';
  end if;
  update public.private_beta_members set
    accepted_at = case when notice_version = '2026-11-17' then coalesce(accepted_at, clock_timestamp()) else clock_timestamp() end,
    notice_version = '2026-11-17', declared_adult = true
    where user_id = uid and active and expires_at > now();
  if not found then raise exception 'Accès bêta non autorisé' using errcode = '42501'; end if;
end; $$;
revoke all on function public.accept_private_beta_notice(boolean,boolean) from public, anon, authenticated;
grant execute on function public.accept_private_beta_notice(boolean,boolean) to authenticated;

-- Un filtre RESTRICTIVE s'ajoute aux droits métier existants, sans les remplacer.
-- Les opérations serveur (service_role et propriétaire) ne sont pas des rôles clients.
do $$ declare t record; begin
  for t in select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname <> 'private_beta_members'
  loop
    if not t.relrowsecurity then raise exception 'RLS absente sur %', t.relname; end if;
    execute format('create policy "bêta privée : accès requis" on public.%I as restrictive for all to anon, authenticated using ((select public.can_use_private_beta())) with check ((select public.can_use_private_beta()))', t.relname);
  end loop;
end $$;

-- Les objets ne doivent pas rester consultables par URL publique pendant les tests.
update storage.buckets set public = false where id in ('pet-photos', 'documents');
create policy "bêta privée : stockage" on storage.objects as restrictive for all to anon, authenticated
  using ((select public.can_use_private_beta())) with check ((select public.can_use_private_beta()));

-- Cette RPC privilégiée contourne RLS : contrôle explicite indispensable.
create or replace function public.swipe_and_match(p_pet uuid, p_target uuid, p_dir text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_user uuid := auth.uid();
begin
  if v_user is null or not public.can_use_private_beta() then
    raise exception 'Accès bêta requis' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pets where id = p_pet and owner_id = v_user) then
    raise exception 'Animal non autorisé' using errcode = '42501';
  end if;
  if p_pet = p_target or not exists (select 1 from public.pets where id = p_target and owner_id <> v_user) then
    raise exception 'Cible non autorisée' using errcode = '22023';
  end if;
  if p_dir is null or p_dir not in ('left','right','super') then
    raise exception 'Direction invalide' using errcode = '22023';
  end if;
  insert into public.swipes (pet_id, target_pet_id, direction) values (p_pet,p_target,p_dir)
    on conflict (pet_id,target_pet_id) do nothing;
  if p_dir in ('right','super') and exists (
    select 1 from public.swipes where pet_id=p_target and target_pet_id=p_pet and direction in ('right','super')) then
    insert into public.matches(pet_a,pet_b) values(least(p_pet,p_target),greatest(p_pet,p_target))
      on conflict do nothing returning id into v_match;
  end if;
  return v_match;
end; $$;
commit;
