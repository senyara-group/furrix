-- Carte de l'annuaire : la recherche renvoie la position autorisée de chaque activité publiée.
-- Position autorisée = celle déjà enregistrée : centre de la commune choisie par le professionnel, arrondi à 0,01°
-- (environ 1 km, contrainte de la table). Aucune adresse ni position plus précise n'existe en base.
-- Seul le type de retour change (ajout de latitude et longitude) : mêmes contrôles, filtres, tri et limite.
-- Retour arrière : supabase/operations/rollback_professional_map_position.sql
begin;
drop function public.search_professionals(numeric,numeric,integer,text,uuid);
create function public.search_professionals(p_lat numeric default null,p_lng numeric default null,p_radius integer default 10,p_category text default null,p_professional uuid default null)
returns table(professional_id uuid,name text,category text,city text,bio text,species text[],hours text,accessibility text,phone text,website text,services jsonb,distance_km numeric,latitude numeric,longitude numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if (p_lat is null)<>(p_lng is null) or (p_professional is null and p_lat is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_radius is null or p_radius not between 1 and 100 or (p_category is not null and p_category not in ('veterinaire','toilettage','education')) then raise exception 'Recherche invalide' using errcode='22023';end if;
 return query with nearby as (
 select p.*,case when p_lat is null then null else 6371*acos(least(1.0,greatest(-1.0,sin(radians(p_lat::double precision))*sin(radians(p.latitude::double precision))+cos(radians(p_lat::double precision))*cos(radians(p.latitude::double precision))*cos(radians((p.longitude-p_lng)::double precision))))) end as km
 from public.professional_profiles p where p.active and public.private_beta_member_active(p.user_id)
 and (p_category is null or p.category=p_category) and (p_professional is null or p.user_id=p_professional)
 ) select p.user_id,p.name,p.category,p.city,p.bio,p.species,p.hours,p.accessibility,p.phone,p.website,p.services,round(p.km::numeric),round(p.latitude,2),round(p.longitude,2)
 from nearby p where p_professional is not null or p.km<=p_radius order by p.km nulls last,p.user_id limit 50;
end $$;
revoke all on function public.search_professionals(numeric,numeric,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.search_professionals(numeric,numeric,integer,text,uuid) to authenticated;
commit;
