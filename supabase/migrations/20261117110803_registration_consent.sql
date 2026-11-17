-- Trace serveur des déclarations d'inscription ; ne vérifie ni identité ni majorité réelle.
-- Nouvelle migration à relire et autoriser avant toute application distante.
begin;

create table public.registration_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 80),
  privacy_version text not null check (char_length(privacy_version) between 1 and 80),
  declared_adult boolean not null check (declared_adult),
  recorded_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('signup', 'account')),
  primary key (user_id, terms_version, privacy_version)
);
alter table public.registration_consents enable row level security;
revoke all on public.registration_consents from public, anon, authenticated;
grant select on public.registration_consents to authenticated;
grant all on public.registration_consents to service_role;
create policy "lire ses acceptations" on public.registration_consents for select to authenticated
  using (user_id = (select auth.uid()));

-- Métadonnées initiales auto-déclarées, copiées une seule fois avec l'heure du serveur.
-- Une modification ultérieure de user_metadata ne réécrit jamais cette trace.
create function public.capture_registration_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare consent jsonb := new.raw_user_meta_data -> 'registration_consent';
begin
  if consent -> 'declared_adult' = 'true'::jsonb
    and consent -> 'accepted_terms' = 'true'::jsonb
    and consent -> 'privacy_acknowledged' = 'true'::jsonb
    and char_length(btrim(consent ->> 'terms_version')) between 1 and 80
    and char_length(btrim(consent ->> 'privacy_version')) between 1 and 80 then
    insert into public.registration_consents(user_id, terms_version, privacy_version, declared_adult, source)
      values (new.id, btrim(consent ->> 'terms_version'), btrim(consent ->> 'privacy_version'), true, 'signup')
      on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.capture_registration_consent() from public, anon, authenticated;
create trigger capture_registration_consent after insert on auth.users
  for each row execute function public.capture_registration_consent();

-- Pour les comptes existants ou une nouvelle version des documents. Aucun user_id fourni par le client.
create function public.accept_registration_terms(p_terms text, p_privacy text, p_adult boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_adult is distinct from true
    or p_terms is null or p_privacy is null
    or char_length(btrim(p_terms)) not between 1 and 80
    or char_length(btrim(p_privacy)) not between 1 and 80 then
    raise exception 'Déclaration incomplète' using errcode = '22023';
  end if;
  insert into public.registration_consents(user_id, terms_version, privacy_version, declared_adult, source)
    values(uid, btrim(p_terms), btrim(p_privacy), true, 'account') on conflict do nothing;
end; $$;
revoke all on function public.accept_registration_terms(text,text,boolean) from public, anon, authenticated;
grant execute on function public.accept_registration_terms(text,text,boolean) to authenticated;

commit;
