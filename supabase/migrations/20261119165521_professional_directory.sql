-- Annuaire bêta : profils déclarés, coordonnées professionnelles volontaires, aucun rendez-vous ni paiement.
-- Retour arrière : supabase/operations/rollback_professional_directory.sql
begin;
create table public.professional_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 100),
 category text not null check(category in ('veterinaire','toilettage','education')),
 city text not null check(char_length(btrim(city)) between 2 and 80),
 latitude numeric not null check(latitude between -90 and 90 and latitude=round(latitude,2)),
 longitude numeric not null check(longitude between -180 and 180 and longitude=round(longitude,2)),
 bio text not null check(char_length(btrim(bio)) between 10 and 2000),
 species text[] not null check(cardinality(species) between 1 and 3 and species <@ array['chien','chat','autre']::text[] and array_position(species,null) is null),
 hours text not null default '' check(char_length(hours)<=500),
 accessibility text not null default '' check(char_length(accessibility)<=500),
 phone text check(phone is null or phone ~ '^\+?[0-9][0-9 .()-]{5,24}$'),
 website text check(website is null or (char_length(website)<=300 and website ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]]*)?$')),
 services jsonb not null default '[]' check(jsonb_typeof(services)='array' and jsonb_array_length(services)<=20),
 active boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.professional_profiles enable row level security;
revoke all on public.professional_profiles from public,anon,authenticated;
grant select on public.professional_profiles to authenticated;
grant select,insert,update,delete on public.professional_profiles to service_role;
create policy professional_profile_owner on public.professional_profiles for select to authenticated using(user_id=(select auth.uid()) and (select public.can_use_private_beta()));
create index professional_profiles_category_active on public.professional_profiles(category,user_id) where active;

create function public.save_professional_profile(p_name text,p_category text,p_city text,p_lat numeric,p_lng numeric,p_bio text,p_species text[],p_hours text,p_accessibility text,p_phone text,p_website text,p_services jsonb,p_active boolean)
returns public.professional_profiles language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item jsonb; result public.professional_profiles; clean jsonb:='[]'; cents numeric;
begin
 if uid is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if p_services is null or jsonb_typeof(p_services)<>'array' then raise exception 'Prestations invalides' using errcode='22023';end if;
 if jsonb_array_length(p_services) not between 1 and 20 then raise exception 'Une à vingt prestations requises' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_services) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string' or char_length(btrim(item->>'name')) not between 2 and 100
   or jsonb_typeof(item->'unit') is distinct from 'string' or char_length(btrim(item->>'unit')) not between 1 and 30 then raise exception 'Prestation invalide' using errcode='22023';end if;
  cents:=null;
  if item ? 'price_cents' and item->'price_cents'<>'null'::jsonb then
   if jsonb_typeof(item->'price_cents')<>'number' then raise exception 'Tarif invalide' using errcode='22023';end if;
   cents:=(item->>'price_cents')::numeric;
   if cents<0 or cents>1000000 or cents<>trunc(cents) then raise exception 'Tarif invalide' using errcode='22023';end if;
  end if;
  clean:=clean||jsonb_build_array(jsonb_build_object('name',btrim(item->>'name'),'unit',btrim(item->>'unit'),'price_cents',cents));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('professional:'||uid::text,0));
 insert into public.professional_profiles(user_id,name,category,city,latitude,longitude,bio,species,hours,accessibility,phone,website,services,active)
 values(uid,btrim(p_name),p_category,btrim(p_city),round(p_lat,2),round(p_lng,2),btrim(p_bio),p_species,btrim(coalesce(p_hours,'')),btrim(coalesce(p_accessibility,'')),nullif(btrim(p_phone),''),nullif(btrim(p_website),''),clean,p_active)
 on conflict(user_id) do update set name=excluded.name,category=excluded.category,city=excluded.city,latitude=excluded.latitude,longitude=excluded.longitude,bio=excluded.bio,species=excluded.species,hours=excluded.hours,accessibility=excluded.accessibility,phone=excluded.phone,website=excluded.website,services=excluded.services,active=excluded.active,updated_at=now()
 returning * into result;
 return result;
end $$;
create function public.set_professional_active(p_active boolean) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if p_active is null then raise exception 'Visibilité requise' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('professional:'||auth.uid()::text,0));
 update public.professional_profiles set active=p_active,updated_at=now() where user_id=auth.uid();
 if not found then raise exception 'Profil introuvable' using errcode='P0002';end if;
end $$;
create function public.search_professionals(p_lat numeric default null,p_lng numeric default null,p_radius integer default 10,p_category text default null,p_professional uuid default null)
returns table(professional_id uuid,name text,category text,city text,bio text,species text[],hours text,accessibility text,phone text,website text,services jsonb,distance_km numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if (p_lat is null)<>(p_lng is null) or (p_professional is null and p_lat is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_radius is null or p_radius not between 1 and 100 or (p_category is not null and p_category not in ('veterinaire','toilettage','education')) then raise exception 'Recherche invalide' using errcode='22023';end if;
 return query with nearby as (
 select p.*,case when p_lat is null then null else 6371*acos(least(1.0,greatest(-1.0,sin(radians(p_lat::double precision))*sin(radians(p.latitude::double precision))+cos(radians(p_lat::double precision))*cos(radians(p.latitude::double precision))*cos(radians((p.longitude-p_lng)::double precision))))) end as km
 from public.professional_profiles p where p.active and public.private_beta_member_active(p.user_id)
 and (p_category is null or p.category=p_category) and (p_professional is null or p.user_id=p_professional)
 ) select p.user_id,p.name,p.category,p.city,p.bio,p.species,p.hours,p.accessibility,p.phone,p.website,p.services,round(p.km::numeric)
 from nearby p where p_professional is not null or p.km<=p_radius order by p.km nulls last,p.user_id limit 50;
end $$;
revoke all on function public.save_professional_profile(text,text,text,numeric,numeric,text,text[],text,text,text,text,jsonb,boolean),public.set_professional_active(boolean),public.search_professionals(numeric,numeric,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.save_professional_profile(text,text,text,numeric,numeric,text,text[],text,text,text,text,jsonb,boolean),public.set_professional_active(boolean),public.search_professionals(numeric,numeric,integer,text,uuid) to authenticated;
commit;
