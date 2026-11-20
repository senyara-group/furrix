-- Rendez-vous Services : créneaux réels, demande, contre-proposition et confirmation ; aucun paiement.
-- Retour arrière : supabase/operations/rollback_professional_appointments.sql
begin;
create table public.professional_slots (
 id uuid primary key, professional_id uuid not null references public.professional_profiles(user_id) on delete cascade,
 starts_at timestamptz not null,ends_at timestamptz not null,active boolean not null default true,
 created_at timestamptz not null default now(),check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at<=starts_at+interval '1 day')
);
create index professional_slots_calendar on public.professional_slots(professional_id,starts_at,ends_at) where active;
create table public.professional_appointments (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 professional_id uuid not null references public.professional_profiles(user_id) on delete cascade,
 pet_id uuid not null references public.pets(id) on delete cascade,
 requested_slot_id uuid not null references public.professional_slots(id),slot_id uuid not null references public.professional_slots(id),
 service_name text not null,unit text not null,price_cents integer,
 message text check(message is null or char_length(message)<=1000),share_pet boolean not null default false,
 status text not null default 'pending' check(status in ('pending','countered','confirmed','declined','withdrawn','cancelled')),
 professional_note text check(professional_note is null or char_length(professional_note)<=1000),
 cancel_note text check(cancel_note is null or char_length(cancel_note)<=300),cancelled_by uuid references auth.users(id) on delete set null,
 request_id uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,request_id),check(owner_id<>professional_id)
);
create unique index professional_appointments_confirmed_slot on public.professional_appointments(slot_id) where status='confirmed';
create index professional_appointments_professional on public.professional_appointments(professional_id,created_at desc,id);
create index professional_appointments_owner on public.professional_appointments(owner_id,created_at desc,id);
create index professional_appointments_pet on public.professional_appointments(pet_id) where status='confirmed';
create index professional_appointments_slot on public.professional_appointments(slot_id);
create index professional_appointments_original_slot on public.professional_appointments(requested_slot_id);
create index professional_appointments_cancelled_by on public.professional_appointments(cancelled_by);
alter table public.professional_slots enable row level security;
alter table public.professional_appointments enable row level security;
revoke all on public.professional_slots,public.professional_appointments from public,anon,authenticated;
grant select,insert,update,delete on public.professional_slots,public.professional_appointments to service_role;

create function public.publish_professional_slot(p_id uuid,p_starts timestamptz,p_ends timestamptz) returns void
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();old public.professional_slots;
begin
 if uid is null or not public.can_use_private_beta() or not exists(select 1 from public.professional_profiles where user_id=uid) then raise exception 'Activité professionnelle requise' using errcode='42501';end if;
 if p_id is null or p_starts is null or p_ends is null or not isfinite(p_starts) or not isfinite(p_ends) or p_starts<=now() or p_ends<=p_starts or p_ends>p_starts+interval '1 day' then raise exception 'Créneau invalide' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('professional-calendar:'||uid::text,0));
 if not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 select * into old from public.professional_slots where id=p_id;
 if old.id is not null then
  if old.professional_id<>uid or old.starts_at<>p_starts or old.ends_at<>p_ends or not old.active then raise exception 'Requête différente' using errcode='23505';end if;
  return;
 end if;
 if exists(select 1 from public.professional_slots where professional_id=uid and active and starts_at<p_ends and ends_at>p_starts) then raise exception 'Créneaux qui se chevauchent' using errcode='23505';end if;
 insert into public.professional_slots(id,professional_id,starts_at,ends_at) values(p_id,uid,p_starts,p_ends);
end $$;
create function public.close_professional_slot(p_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('professional-calendar:'||uid::text,0));
 if not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if not exists(select 1 from public.professional_slots where id=p_id and professional_id=uid) then raise exception 'Créneau introuvable' using errcode='42501';end if;
 if exists(select 1 from public.professional_appointments where slot_id=p_id and status in ('pending','countered','confirmed')) then raise exception 'Traite d’abord les demandes de ce créneau' using errcode='23505';end if;
 update public.professional_slots set active=false where id=p_id and professional_id=uid;
end $$;
create function public.list_professional_slots(p_professional uuid) returns table(id uuid,starts_at timestamptz,ends_at timestamptz,available boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if not exists(select 1 from public.professional_profiles p where p.user_id=p_professional and public.private_beta_member_active(p.user_id) and (p.active or p.user_id=auth.uid())) then return;end if;
 return query select s.id,s.starts_at,s.ends_at,not exists(select 1 from public.professional_appointments a where a.slot_id=s.id and a.status='confirmed')
 from public.professional_slots s where s.professional_id=p_professional and s.active and s.starts_at>now()
 and (p_professional=auth.uid() or not exists(select 1 from public.professional_appointments a where a.slot_id=s.id and a.status='confirmed'))
 order by s.starts_at,s.id limit 100;
end $$;
create function public.request_professional_appointment(p_slot uuid,p_pet uuid,p_service text,p_message text,p_share boolean,p_request uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();s public.professional_slots;old public.professional_appointments;item jsonb;
begin
 if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 select * into s from public.professional_slots where id=p_slot;
 if s.id is null or s.professional_id=uid then raise exception 'Créneau indisponible' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('professional-calendar:'||s.professional_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('professional-request:'||uid::text,0));
 if not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 select * into old from public.professional_appointments where owner_id=uid and request_id=p_request;
 if old.id is not null then
  if old.requested_slot_id is distinct from p_slot or old.pet_id is distinct from p_pet or old.service_name is distinct from btrim(p_service) or old.message is distinct from nullif(btrim(p_message),'') or old.share_pet is distinct from p_share then raise exception 'Requête différente' using errcode='23505';end if;
  return old.id;
 end if;
 select * into s from public.professional_slots where id=p_slot;
 if not s.active or s.starts_at<=now() or not exists(select 1 from public.professional_profiles where user_id=s.professional_id and active and public.private_beta_member_active(user_id)) then raise exception 'Créneau indisponible' using errcode='42501';end if;
 if not exists(select 1 from public.pets where id=p_pet and owner_id=uid) then raise exception 'Animal non autorisé' using errcode='42501';end if;
 if p_request is null or p_share is null or char_length(coalesce(p_message,''))>1000 or p_service is null then raise exception 'Demande invalide' using errcode='22023';end if;
 if (select count(*) from public.professional_profiles p cross join lateral jsonb_array_elements(p.services) x where p.user_id=s.professional_id and x->>'name'=btrim(p_service))<>1 then raise exception 'Prestation indisponible' using errcode='22023';end if;
 select x into item from public.professional_profiles p cross join lateral jsonb_array_elements(p.services) x where p.user_id=s.professional_id and x->>'name'=btrim(p_service);
 if exists(select 1 from public.professional_appointments where slot_id=p_slot and status='confirmed') then raise exception 'Créneau déjà confirmé' using errcode='23505';end if;
 if exists(select 1 from public.professional_appointments where owner_id=uid and requested_slot_id=p_slot and status in ('pending','countered','confirmed')) then raise exception 'Une demande est déjà en cours' using errcode='23505';end if;
 if (select count(*) from public.professional_appointments where owner_id=uid and created_at>now()-interval '1 day')>=20 then raise exception 'Trop de demandes aujourd’hui' using errcode='P0001';end if;
 insert into public.professional_appointments(owner_id,professional_id,pet_id,requested_slot_id,slot_id,service_name,unit,price_cents,message,share_pet,request_id)
 values(uid,s.professional_id,p_pet,p_slot,p_slot,item->>'name',item->>'unit',(item->>'price_cents')::integer,nullif(btrim(p_message),''),p_share,p_request) returning * into old;
 return old.id;
end $$;
create function public.update_professional_appointment(p_id uuid,p_action text,p_slot uuid default null,p_note text default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();a public.professional_appointments;s public.professional_slots;other uuid;
begin
 if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 select * into a from public.professional_appointments where id=p_id;
 if a.id is null or uid not in (a.owner_id,a.professional_id) then raise exception 'Rendez-vous introuvable' using errcode='42501';end if;
 -- Même ordre pour tous les rendez-vous : animal, professionnel, ligne. Évite aussi deux confirmations simultanées pour un animal.
 perform pg_advisory_xact_lock(hashtextextended('professional-pet:'||a.pet_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('professional-calendar:'||a.professional_id::text,0));
 select * into a from public.professional_appointments where id=p_id for update;
 if not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if p_note is not null and char_length(p_note)>1000 then raise exception 'Note trop longue' using errcode='22023';end if;
 other:=case when uid=a.owner_id then a.professional_id else a.owner_id end;
 if p_action='withdraw' and uid=a.owner_id and a.status in ('pending','countered','withdrawn') then
  update public.professional_appointments set status='withdrawn',updated_at=case when status='withdrawn' then updated_at else now() end where id=p_id;return;
 end if;
 if p_action='decline' and uid=a.professional_id and a.status in ('pending','countered','declined') then
  if a.status='declined' then return;end if;
  update public.professional_appointments set status='declined',professional_note=nullif(btrim(p_note),''),updated_at=case when status='declined' then updated_at else now() end where id=p_id;return;
 end if;
 if p_action='cancel' and a.status='cancelled' then return;end if;
 if p_action='cancel' and a.status='confirmed' then
  select * into s from public.professional_slots where id=a.slot_id;
  if s.ends_at<=now() or char_length(coalesce(p_note,''))>300 then raise exception 'Annulation invalide' using errcode='22023';end if;
  update public.professional_appointments set status='cancelled',cancelled_by=uid,cancel_note=nullif(btrim(p_note),''),updated_at=now() where id=p_id;return;
 end if;
 if not public.private_beta_member_active(other) then raise exception 'Autre compte indisponible' using errcode='42501';end if;
 if p_action='counter' and uid=a.professional_id and a.status in ('pending','countered') then
  select * into s from public.professional_slots where id=p_slot and professional_id=uid and active;
  if s.id is null or s.starts_at<=now() or (a.status='pending' and s.id=a.slot_id) then raise exception 'Autre créneau requis' using errcode='22023';end if;
  if exists(select 1 from public.professional_appointments where id<>p_id and slot_id=s.id and status='confirmed') then raise exception 'Créneau déjà confirmé' using errcode='23505';end if;
  update public.professional_appointments set status='countered',slot_id=s.id,professional_note=nullif(btrim(p_note),''),updated_at=now() where id=p_id;return;
 end if;
 if ((p_action='confirm' and uid=a.professional_id and a.status in ('pending','confirmed')) or (p_action='accept_counter' and uid=a.owner_id and a.status in ('countered','confirmed'))) then
  if p_slot is null or p_slot<>a.slot_id then raise exception 'Le créneau a changé' using errcode='23505';end if;
  if a.status='confirmed' then return;end if;
  select * into s from public.professional_slots where id=a.slot_id and active;
  if s.id is null or s.starts_at<=now() then raise exception 'Créneau indisponible' using errcode='42501';end if;
  if exists(select 1 from public.professional_appointments x join public.professional_slots y on y.id=x.slot_id where x.id<>p_id and x.status='confirmed' and (x.professional_id=a.professional_id or x.pet_id=a.pet_id) and y.starts_at<s.ends_at and y.ends_at>s.starts_at) then raise exception 'Rendez-vous qui se chevauchent' using errcode='23505';end if;
  update public.professional_appointments set status='confirmed',professional_note=case when p_action='confirm' then nullif(btrim(p_note),'') else professional_note end,updated_at=now() where id=p_id;return;
 end if;
 raise exception 'Action non autorisée' using errcode='42501';
end $$;
create function public.list_professional_appointments(p_id uuid default null)
returns table(id uuid,role text,owner_id uuid,professional_id uuid,professional_name text,owner_name text,category text,city text,pet_id uuid,pet_name text,pet_species text,pet_breed text,pet_age text,share_pet boolean,service_name text,unit text,price_cents integer,slot_id uuid,starts_at timestamptz,ends_at timestamptz,status text,message text,professional_note text,cancel_note text,cancelled_by uuid,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 return query select a.id,case when a.owner_id=auth.uid() then 'owner' else 'professional' end,a.owner_id,a.professional_id,p.name,pr.name,p.category,p.city,
 case when a.owner_id=auth.uid() then pet.id end,
 case when a.owner_id=auth.uid() or a.share_pet then pet.name end,case when a.owner_id=auth.uid() or a.share_pet then pet.species end,
 case when a.owner_id=auth.uid() or a.share_pet then pet.breed end,case when a.owner_id=auth.uid() or a.share_pet then pet.age end,
 a.share_pet,a.service_name,a.unit,a.price_cents,a.slot_id,s.starts_at,s.ends_at,a.status,a.message,a.professional_note,a.cancel_note,a.cancelled_by,a.created_at,a.updated_at
 from public.professional_appointments a join public.professional_profiles p on p.user_id=a.professional_id join public.profiles pr on pr.id=a.owner_id join public.pets pet on pet.id=a.pet_id join public.professional_slots s on s.id=a.slot_id
 where auth.uid() in (a.owner_id,a.professional_id) and (p_id is null or a.id=p_id) order by a.updated_at desc,a.id limit 100;
end $$;
revoke all on function public.publish_professional_slot(uuid,timestamptz,timestamptz),public.close_professional_slot(uuid),public.list_professional_slots(uuid),public.request_professional_appointment(uuid,uuid,text,text,boolean,uuid),public.update_professional_appointment(uuid,text,uuid,text),public.list_professional_appointments(uuid) from public,anon,authenticated;
grant execute on function public.publish_professional_slot(uuid,timestamptz,timestamptz),public.close_professional_slot(uuid),public.list_professional_slots(uuid),public.request_professional_appointment(uuid,uuid,text,text,boolean,uuid),public.update_professional_appointment(uuid,text,uuid,text),public.list_professional_appointments(uuid) to authenticated;
commit;
