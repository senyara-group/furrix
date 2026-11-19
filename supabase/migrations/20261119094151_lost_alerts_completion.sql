-- Une annonce cloturee n'est plus consultable par les autres comptes, meme avec son identifiant.
-- Les annonces retrouvees restent accessibles par notification, sans accepter de nouvelle observation.
-- A appliquer apres lost_pets_local_alerts, uniquement apres revue et accord DEV.
begin;
create or replace function public.list_lost_alerts(p_city text default null,p_after uuid default null,p_limit integer default 30,p_id uuid default null)
returns table(id uuid,reporter_id uuid,pet_id uuid,display_name text,species text,city text,latitude numeric,longitude numeric,last_seen_at timestamptz,description text,instructions text,photo_path text,radius_km integer,status text,is_mine boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_use_private_beta() then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'Limite invalide' using errcode='22023'; end if;
 return query select l.id,l.reporter_id,l.pet_id,l.display_name,l.species,l.city,l.lat::numeric,l.lng::numeric,l.last_seen_at,l.description,l.instructions,l.photo_path,l.radius_km,l.status,l.reporter_id=auth.uid()
 from public.lost_pets l where l.last_seen_at is not null and public.private_beta_member_active(l.reporter_id)
 and (l.status='lost' or l.reporter_id=auth.uid() or (p_id=l.id and l.status='found'))
 and (p_city is null or lower(l.city)=lower(btrim(p_city))) and (p_after is null or (l.created_at,l.id)<(select a.created_at,a.id from public.lost_pets a where a.id=p_after)) and(p_id is null or l.id=p_id)
 order by l.created_at desc,l.id desc limit p_limit;
end $$;
commit;
