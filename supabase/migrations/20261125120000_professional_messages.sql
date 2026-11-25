-- Services : conversation entre le propriétaire et l'établissement, rattachée à une demande de rendez-vous.
-- 1. Seuls les deux participants de la demande lisent et écrivent. Aucune écriture directe : tout passe par send_professional_message.
-- 2. On peut écrire tant que la demande est ouverte (en attente, autre créneau proposé) ou confirmée, jusqu'à 30 jours après
--    le rendez-vous. Après un refus, un retrait ou une annulation, l'historique reste lisible par les deux, sans nouvel envoi.
-- 3. Le rejeu d'un même envoi (même request_id) renvoie le même message, sans doublon ; 30 messages par 10 minutes au plus.
-- 4. Chaque message prévient l'autre personne (catégorie « messages », sans le texte du message).
-- 5. Suppression de compte : illisible par une ancienne session dès la demande, texte effacé au nettoyage.
-- Retour arrière : supabase/operations/rollback_professional_messages.sql

create table if not exists public.professional_messages (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.professional_appointments(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, request_id)
);
create index if not exists idx_professional_messages_appointment on public.professional_messages(appointment_id, id desc);
create index if not exists idx_professional_messages_sender_recent on public.professional_messages(sender_id, created_at desc);
alter table public.professional_messages enable row level security;
revoke all on public.professional_messages from public, anon, authenticated;
grant all on public.professional_messages to service_role;
grant select on public.professional_messages to authenticated;

-- Participant d'une demande (la table des rendez-vous n'est pas lisible directement par les clients).
create or replace function public.is_professional_appointment_party(p_appointment uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.professional_appointments a where a.id=p_appointment and auth.uid() in (a.owner_id, a.professional_id));
$$;
revoke all on function public.is_professional_appointment_party(uuid) from public, anon, authenticated;
grant execute on function public.is_professional_appointment_party(uuid) to authenticated;
drop policy if exists "messages de ses rendez-vous" on public.professional_messages;
create policy "messages de ses rendez-vous" on public.professional_messages for select to authenticated
  using (public.can_use_private_beta() and public.is_professional_appointment_party(appointment_id));

-- Comptes en suppression (si la suppression est installée) : comme les autres tables.
create or replace function public.forget_professional_messages() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.professional_messages set text='Contenu supprimé à la suppression du compte'
    where appointment_id in (select id from public.professional_appointments where new.user_id in (owner_id, professional_id));
  return new;
end $$;
revoke all on function public.forget_professional_messages() from public, anon, authenticated;
do $$ begin
  if to_regprocedure('public.guard_open_accounts()') is not null then
    drop trigger if exists account_open_insert on public.professional_messages;
    create trigger account_open_insert before insert or update on public.professional_messages for each row execute function public.guard_open_accounts();
  end if;
  if to_regprocedure('public.account_is_open()') is not null then
    drop policy if exists account_not_deleted on public.professional_messages;
    create policy account_not_deleted on public.professional_messages as restrictive for all to authenticated
      using (public.account_is_open()) with check (public.account_is_open());
  end if;
  if to_regclass('public.account_deletions') is not null then
    drop trigger if exists forget_professional_messages on public.account_deletions;
    create trigger forget_professional_messages after update of cleaned_at on public.account_deletions for each row
      when (new.cleaned_at is not null and old.cleaned_at is null) execute function public.forget_professional_messages();
  end if;
end $$;

-- Envoyer un message sur une demande.
create or replace function public.send_professional_message(p_appointment uuid, p_text text, p_request uuid)
returns public.professional_messages language plpgsql volatile security definer set search_path='' as $$
declare uid uuid := auth.uid(); a public.professional_appointments; slot_end timestamptz; other uuid; saved public.professional_messages;
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  select * into a from public.professional_appointments where id=p_appointment;
  if a.id is null or uid not in (a.owner_id, a.professional_id) then raise exception 'Conversation non autorisée' using errcode='42501'; end if;
  if p_request is null or p_text is null or char_length(btrim(p_text)) not between 1 and 2000 then raise exception 'Message invalide' using errcode='22023'; end if;
  select * into saved from public.professional_messages where sender_id=uid and request_id=p_request;
  if saved.id is not null then
    if saved.appointment_id<>p_appointment or saved.text<>btrim(p_text) then raise exception 'Requête différente' using errcode='23505'; end if;
    return saved; -- Rejeu : même message, sans doublon.
  end if;
  other := case when uid=a.owner_id then a.professional_id else a.owner_id end;
  if not public.private_beta_member_active(other) or public.meeting_blocked(uid, other) then raise exception 'Conversation indisponible' using errcode='42501'; end if;
  select ends_at into slot_end from public.professional_slots where id=a.slot_id;
  if not (a.status in ('pending','countered') or (a.status='confirmed' and slot_end > now() - interval '30 days')) then
    raise exception 'Conversation close' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 5));
  if (select count(*) from public.professional_messages where sender_id=uid and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Trop de messages, réessaie dans quelques minutes' using errcode='P0001'; end if;
  insert into public.professional_messages(appointment_id, sender_id, text, request_id) values (p_appointment, uid, btrim(p_text), p_request)
    on conflict (sender_id, request_id) do nothing returning * into saved;
  if saved.id is null then select * into saved from public.professional_messages where sender_id=uid and request_id=p_request; end if;
  return saved;
end $$;
revoke all on function public.send_professional_message(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.send_professional_message(uuid,text,uuid) to authenticated;

-- Conversations Services de l'appelant (rubrique Messages) : une par demande ayant au moins un message.
create or replace function public.list_professional_threads()
returns table(appointment_id uuid, role text, other_name text, service_name text, status text, starts_at timestamptz,
  last_text text, last_at timestamptz, last_sender uuid)
language plpgsql stable security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501'; end if;
  return query
  select a.id, case when a.owner_id=uid then 'owner' else 'professional' end,
    case when a.owner_id=uid then p.name else pr.name end, a.service_name, a.status, s.starts_at, last.text, last.created_at, last.sender_id
  from public.professional_appointments a
  join public.professional_profiles p on p.user_id=a.professional_id
  join public.profiles pr on pr.id=a.owner_id
  join public.professional_slots s on s.id=a.slot_id
  join lateral (select m.text, m.created_at, m.sender_id from public.professional_messages m where m.appointment_id=a.id order by m.id desc limit 1) last on true
  where uid in (a.owner_id, a.professional_id)
  order by last.created_at desc, a.id limit 100;
end $$;
revoke all on function public.list_professional_threads() from public, anon, authenticated;
grant execute on function public.list_professional_threads() to authenticated;

-- Notification à l'autre participant, sans le texte (catégorie « messages », ouvre la conversation de la demande).
create or replace function public.notify_professional_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.professional_appointments;
begin
  select * into a from public.professional_appointments where id=new.appointment_id;
  perform public.emit_app_notification(case when new.sender_id=a.owner_id then a.professional_id else a.owner_id end, new.sender_id,
    'messages', 'appointment_message', 'appointment', a.id, null, 'appointment-message:'||new.id, 'Tu as reçu un nouveau message de rendez-vous.');
  return new;
end $$;
revoke all on function public.notify_professional_message() from public, anon, authenticated;
drop trigger if exists notify_professional_message on public.professional_messages;
create trigger notify_professional_message after insert on public.professional_messages for each row execute function public.notify_professional_message();
