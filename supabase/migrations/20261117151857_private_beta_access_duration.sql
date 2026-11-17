-- Bêta privée : accès sans échéance et durées à compter de l'activation.
-- Ordre : après 20261117110807_private_beta.sql (déployée, non modifiée), avant 20261117131807_animal_meetings.sql.
-- Aucune donnée de compte ni adresse e-mail ici : les autorisations sont accordées séparément par un administrateur,
-- avec grant_private_beta_access, uniquement pour un compte Auth existant.
--
-- Règles :
--   expires_at NULL  = accès sans échéance, explicitement (aucune date lointaine artificielle) ;
--   expires_at passé = accès expiré ;
--   active = false   = accès révoqué, avec ou sans échéance ;
--   activated_at     = moment de l'activation, point de départ d'une durée.
--
-- Retour arrière (à exécuter dans une transaction, après celui des migrations rencontres si elles sont appliquées) :
--   begin;
--   drop function if exists public.grant_private_beta_access(uuid,interval);
--   drop function if exists public.private_beta_member_active(uuid);
--   -- recréer private_beta_status, can_use_private_beta et accept_private_beta_notice
--   -- à l'identique de 20261117110807_private_beta.sql ;
--   -- donner d'abord une date explicite, ou retirer l'accès, à chaque ligne sans échéance :
--   --   update public.private_beta_members set expires_at = <date choisie> where expires_at is null;
--   alter table public.private_beta_members alter column expires_at set not null;
--   alter table public.private_beta_members drop column if exists activated_at;
--   commit;
begin;

alter table public.private_beta_members alter column expires_at drop not null;
alter table public.private_beta_members add column activated_at timestamptz;
comment on column public.private_beta_members.expires_at is
  'Fin de l''accès bêta. NULL : sans échéance. Toujours révocable par active = false.';
comment on column public.private_beta_members.activated_at is
  'Activation de l''accès ; point de départ d''une durée accordée par grant_private_beta_access.';

-- Mêmes signatures, droits et sécurité (invoker) que dans private_beta : seule la condition d'échéance change.
create or replace function public.private_beta_status() returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce((select case
    when not m.active or (m.expires_at is not null and m.expires_at <= now()) then 'denied'
    when m.accepted_at is null or m.notice_version is distinct from '2026-11-17' or not m.declared_adult then 'pending'
    else 'active' end
    from public.private_beta_members m where m.user_id = auth.uid()), 'denied');
$$;

create or replace function public.can_use_private_beta() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.private_beta_members m
    where m.user_id = auth.uid() and m.active and (m.expires_at is null or m.expires_at > now())
      and m.accepted_at is not null and m.notice_version = '2026-11-17' and m.declared_adult);
$$;

create or replace function public.accept_private_beta_notice(p_adult boolean, p_read_notice boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_adult is distinct from true or p_read_notice is distinct from true then
    raise exception 'Participation non confirmée' using errcode = '42501';
  end if;
  update public.private_beta_members set
    accepted_at = case when notice_version = '2026-11-17' then coalesce(accepted_at, clock_timestamp()) else clock_timestamp() end,
    notice_version = '2026-11-17', declared_adult = true
    where user_id = uid and active and (expires_at is null or expires_at > now());
  if not found then raise exception 'Accès bêta non autorisé' using errcode = '42501'; end if;
end; $$;

-- Statut d'un testeur quelconque, pour les fonctions privilégiées uniquement : aucun client ne peut l'exécuter,
-- afin de ne pas permettre de sonder l'appartenance d'un identifiant à la bêta.
create function public.private_beta_member_active(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.private_beta_members m
    where m.user_id = p_user and m.active and (m.expires_at is null or m.expires_at > now())
      and m.accepted_at is not null and m.notice_version = '2026-11-17' and m.declared_adult);
$$;
revoke all on function public.private_beta_member_active(uuid) from public, anon, authenticated;

-- Activation par un administrateur. p_duration NULL : sans échéance ; sinon la durée court à partir de maintenant.
-- Un compte Auth existant est exigé. Une nouvelle activation repart de maintenant ; la notice acceptée,
-- sa version et la déclaration de majorité déjà enregistrées sont conservées.
create function public.grant_private_beta_access(p_user uuid, p_duration interval default null)
returns public.private_beta_members language plpgsql volatile security definer set search_path = '' as $$
declare saved public.private_beta_members; started timestamptz := clock_timestamp();
begin
  if p_user is null or not exists(select 1 from auth.users where id = p_user) then
    raise exception 'Compte Auth inexistant' using errcode = '22023';
  end if;
  if p_duration is not null and p_duration <= interval '0' then
    raise exception 'Durée invalide' using errcode = '22023';
  end if;
  insert into public.private_beta_members(user_id, active, activated_at, expires_at)
    values (p_user, true, started, started + p_duration)
  on conflict (user_id) do update set active = true, activated_at = excluded.activated_at, expires_at = excluded.expires_at
  returning * into saved;
  return saved;
end; $$;
revoke all on function public.grant_private_beta_access(uuid, interval) from public, anon, authenticated;
grant execute on function public.grant_private_beta_access(uuid, interval) to service_role;

commit;
