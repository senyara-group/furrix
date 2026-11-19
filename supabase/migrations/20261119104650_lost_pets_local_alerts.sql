-- Animaux perdus et notifications locales. À relire avant toute application DEV.
begin;
alter table public.lost_pets
  add column last_seen_at timestamptz,
  add column description text check(char_length(description)<=1500),
  add column instructions text check(char_length(instructions)<=500),
  add column display_name text,
  add column species text,
  add column photo_path text,
  add column radius_km integer check(radius_km between 1 and 50);
create unique index lost_one_open_per_pet on public.lost_pets(pet_id) where status='lost';

create table public.lost_alert_subscriptions(
  user_id uuid primary key references auth.users(id) on delete cascade,
  latitude numeric(4,2) not null check(latitude between -90 and 90),
  longitude numeric(5,2) not null check(longitude between -180 and 180),
  radius_km integer not null check(radius_km between 1 and 50),
  created_at timestamptz not null default clock_timestamp()
);
create table public.lost_sightings(
  id uuid primary key,
  alert_id uuid not null references public.lost_pets(id) on delete cascade,
  observer_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null,
  city text not null check(char_length(city) between 1 and 80),
  message text not null check(char_length(message) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create table public.local_notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id uuid not null references public.lost_pets(id) on delete cascade,
  kind text not null check(kind in ('lost_local','lost_sighting','lost_found')),
  event_key text not null,
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,event_key)
);
create index local_notifications_owner_date on public.local_notifications(user_id,created_at desc);
create index lost_sightings_alert_date on public.lost_sightings(alert_id,created_at desc);
create table public.lost_alert_reports(
  user_id uuid references auth.users(id) on delete cascade,
  alert_id uuid references public.lost_pets(id) on delete cascade,
  reason text not null check(char_length(reason) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,alert_id)
);

-- Retirer les droits hérités et de colonnes, y compris TRUNCATE qui ignore RLS.
do $$ declare r record;t text;cols text; begin
  for r in with recursive api_roles(oid) as (
    select oid from pg_roles where rolname in ('anon','authenticated') union select m.roleid from pg_auth_members m join api_roles a on a.oid=m.member
  ) select quote_ident(p.rolname) grantee from pg_roles p join api_roles a on a.oid=p.oid union select 'PUBLIC' loop
    foreach t in array array['lost_pets','lost_alert_subscriptions','lost_sightings','local_notifications','lost_alert_reports'] loop
      execute format('revoke all on public.%I from %s cascade',t,r.grantee);
      select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
      execute format('revoke all (%s) on public.%I from %s cascade',cols,t,r.grantee);
    end loop;
  end loop;
  foreach t in array array['lost_pets','lost_alert_subscriptions','lost_sightings','local_notifications','lost_alert_reports'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t<>'lost_pets' then execute format('create policy "bêta privée : accès requis" on public.%I as restrictive for all to anon,authenticated using ((select public.can_use_private_beta())) with check ((select public.can_use_private_beta()))',t); end if;
  end loop;
end $$;
drop policy "alertes publiques" on public.lost_pets;
drop policy "déclarer perte" on public.lost_pets;
drop policy "maj sa déclaration" on public.lost_pets;
create policy "ses alertes" on public.lost_pets for select to authenticated using(reporter_id=(select auth.uid()));
create policy "son secteur" on public.lost_alert_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy "ses notifications" on public.local_notifications for select to authenticated using(user_id=(select auth.uid()));
create policy "ses signalements" on public.lost_alert_reports for select to authenticated using(user_id=(select auth.uid()));
create policy "observations privées" on public.lost_sightings for select to authenticated
  using(observer_id=(select auth.uid()) or exists(select 1 from public.lost_pets l where l.id=alert_id and l.reporter_id=(select auth.uid())));

create function public.lost_distance_km(a numeric,b numeric,c numeric,d numeric) returns double precision
language sql immutable security invoker set search_path='' as $$
 select 6371.0*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians((c-a)::float8)/2),2)+cos(radians(a::float8))*cos(radians(c::float8))*power(sin(radians((d-b)::float8)/2),2)))));
$$;
revoke all on function public.lost_distance_km(numeric,numeric,numeric,numeric) from public,anon,authenticated;

create function public.set_lost_alert_sector(p_enabled boolean,p_lat numeric default null,p_lng numeric default null,p_radius integer default 25)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_enabled is false then delete from public.lost_alert_subscriptions where user_id=auth.uid(); return; end if;
 if p_enabled is distinct from true or p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or p_radius is null or p_radius not between 1 and 50 then raise exception 'Secteur invalide' using errcode='22023'; end if;
 insert into public.lost_alert_subscriptions(user_id,latitude,longitude,radius_km) values(auth.uid(),round(p_lat,2),round(p_lng,2),p_radius)
 on conflict(user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,radius_km=excluded.radius_km;
end $$;

create function public.publish_lost_alert(p_id uuid,p_pet uuid,p_city text,p_lat numeric,p_lng numeric,p_seen timestamptz,p_description text,p_instructions text,p_radius integer,p_photo text default null)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();animal public.pets; existing public.lost_pets;
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lost-publish:'||uid::text,0));
 select * into existing from public.lost_pets where id=p_id;
 if existing.id is not null then
   if existing.reporter_id is distinct from uid then raise exception 'Accès refusé' using errcode='42501'; end if;
   return existing.id;
 end if;
 select * into animal from public.pets where id=p_pet and owner_id=uid;
 if animal.id is null then raise exception 'Animal non autorisé' using errcode='42501'; end if;
 if p_id is null or p_city is null or char_length(btrim(p_city)) not between 1 and 80 or p_seen is null or p_seen>now()+interval '5 minutes'
   or p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180)
   or p_description is null or char_length(btrim(p_description)) not between 1 and 1500
   or char_length(coalesce(p_instructions,''))>500 or p_radius is null or p_radius not between 1 and 50 then raise exception 'Déclaration invalide' using errcode='22023'; end if;
 if p_photo is not null and p_photo !~ ('^'||uid::text||'/'||p_id::text||'/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$') then raise exception 'Photo invalide' using errcode='22023'; end if;
 if (select count(*) from public.lost_pets where reporter_id=uid and created_at>now()-interval '24 hours')>=3 then raise exception 'Limite de publication atteinte' using errcode='54000'; end if;
 insert into public.lost_pets(id,pet_id,reporter_id,city,lat,lng,last_seen_at,description,instructions,display_name,species,photo_path,radius_km)
 values(p_id,p_pet,uid,btrim(p_city),round(p_lat,2),round(p_lng,2),p_seen,btrim(p_description),nullif(btrim(p_instructions),''),animal.name,animal.species,p_photo,p_radius);
 -- Une alerte/destinataire ; le secteur d'abonnement et le rayon de diffusion doivent tous deux convenir.
 insert into public.local_notifications(user_id,alert_id,kind,event_key,title)
 select s.user_id,p_id,'lost_local','lost:'||p_id::text,animal.name||' est recherché dans ton secteur'
 from public.lost_alert_subscriptions s where s.user_id<>uid and public.private_beta_member_active(s.user_id)
   and public.lost_distance_km(round(p_lat,2),round(p_lng,2),s.latitude,s.longitude)<=least(p_radius,s.radius_km)
 on conflict(user_id,event_key) do nothing;
 return p_id;
end $$;

create function public.list_lost_alerts(p_city text default null,p_after uuid default null,p_limit integer default 30,p_id uuid default null)
returns table(id uuid,reporter_id uuid,pet_id uuid,display_name text,species text,city text,latitude numeric,longitude numeric,last_seen_at timestamptz,description text,instructions text,photo_path text,radius_km integer,status text,is_mine boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Limite invalide' using errcode='22023'; end if;
 return query select l.id,l.reporter_id,l.pet_id,l.display_name,l.species,l.city,l.lat::numeric,l.lng::numeric,l.last_seen_at,l.description,l.instructions,l.photo_path,l.radius_km,l.status,l.reporter_id=auth.uid()
 from public.lost_pets l where l.last_seen_at is not null and public.private_beta_member_active(l.reporter_id)
 and (l.status='lost' or l.reporter_id=auth.uid() or p_id=l.id)
 and (p_city is null or lower(l.city)=lower(btrim(p_city))) and (p_after is null or (l.created_at,l.id)<(select a.created_at,a.id from public.lost_pets a where a.id=p_after)) and(p_id is null or l.id=p_id)
 order by l.created_at desc,l.id desc limit p_limit;
end $$;

create function public.update_lost_alert(p_id uuid,p_description text,p_instructions text,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare previous public.lost_pets;
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into previous from public.lost_pets where id=p_id and reporter_id=auth.uid() for update;
 if previous.id is null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_description is null or char_length(btrim(p_description)) not between 1 and 1500 or char_length(coalesce(p_instructions,''))>500 or p_status is null or p_status not in ('lost','found','closed') or (previous.status<>'lost' and p_status<>previous.status) then raise exception 'Modification invalide' using errcode='22023'; end if;
 update public.lost_pets set description=btrim(p_description),instructions=nullif(btrim(p_instructions),''),status=p_status where id=p_id;
 if previous.status='lost' and p_status='found' then
  insert into public.local_notifications(user_id,alert_id,kind,event_key,title)
  select n.user_id,p_id,'lost_found','found:'||p_id::text,previous.display_name||' a été retrouvé'
  from public.local_notifications n where n.alert_id=p_id and n.kind='lost_local' and public.private_beta_member_active(n.user_id)
  on conflict(user_id,event_key) do nothing;
 end if;
end $$;

create function public.add_lost_sighting(p_id uuid,p_alert uuid,p_seen timestamptz,p_city text,p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare alert public.lost_pets;existing public.lost_sightings;uid uuid:=auth.uid();
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('lost-sighting:'||uid::text,0));
 select * into existing from public.lost_sightings where id=p_id;
 if existing.id is not null then
  if existing.observer_id<>uid or existing.alert_id<>p_alert then raise exception 'Requête différente' using errcode='42501'; end if; return existing.id;
 end if;
 select * into alert from public.lost_pets where id=p_alert and status='lost' for share;
 if alert.id is null or alert.reporter_id=uid or not public.private_beta_member_active(alert.reporter_id) then raise exception 'Alerte indisponible' using errcode='42501'; end if;
 if p_id is null or p_seen is null or p_seen>now()+interval '5 minutes' or p_city is null or char_length(btrim(p_city)) not between 1 and 80 or p_message is null or char_length(btrim(p_message)) not between 1 and 1000 then raise exception 'Observation invalide' using errcode='22023'; end if;
 if (select count(*) from public.lost_sightings where observer_id=uid and created_at>now()-interval '1 hour')>=10 then raise exception 'Limite atteinte' using errcode='54000'; end if;
 insert into public.lost_sightings(id,alert_id,observer_id,seen_at,city,message) values(p_id,p_alert,uid,p_seen,btrim(p_city),btrim(p_message));
 insert into public.local_notifications(user_id,alert_id,kind,event_key,title) values(alert.reporter_id,p_alert,'lost_sighting','sighting:'||p_id::text,'Une observation pour '||alert.display_name) on conflict(user_id,event_key) do nothing;
 return p_id;
end $$;

create function public.read_local_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.local_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Notification non autorisée' using errcode='42501'; end if;
end $$;
create function public.report_lost_alert(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_use_private_beta() or not exists(select 1 from public.lost_pets where id=p_id and status='lost') then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'Motif invalide' using errcode='22023'; end if;
 insert into public.lost_alert_reports(user_id,alert_id,reason) values(auth.uid(),p_id,btrim(p_reason)) on conflict(user_id,alert_id) do nothing;
end $$;

create function public.lost_photo_visible(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_use_private_beta() and exists(select 1 from public.lost_pets l where l.photo_path=p_path and l.status in ('lost','found') and public.private_beta_member_active(l.reporter_id)
 and split_part(p_path,'/',1)=l.reporter_id::text and split_part(p_path,'/',2)=l.id::text);
$$;
create policy "animaux perdus : photo de l'alerte" on storage.objects for select to authenticated using(bucket_id='pet-photos' and public.lost_photo_visible(name));

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('set_lost_alert_sector','publish_lost_alert','list_lost_alerts','update_lost_alert','add_lost_sighting','read_local_notification','report_lost_alert','lost_photo_visible') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
