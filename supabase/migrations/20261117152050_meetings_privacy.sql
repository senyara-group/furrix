-- Confidentialité des profils : lecture directe de pets et profiles limitée à leur propriétaire.
-- Ordre : après 20261117131807_animal_meetings.sql (non déployée), dont les RPC privilégiées
-- deviennent le seul accès aux données des autres testeurs. Ne modifie aucune migration déjà appliquée.
-- À appliquer uniquement après revue et accord sur DEV.
--
-- Ce que les autres testeurs peuvent encore obtenir, et par quel chemin :
--   discover_pets   : id, propriétaire (identifiant déjà présent dans le chemin de la photo), nom, espèce,
--                     race, âge, sexe, objectif, ville, présentation, photo principale, prénom du propriétaire,
--                     distance arrondie. Jamais santé, allergies, alimentation, poids, coordonnées, rôle ni abonnement.
--   list_pet_matches: nom de l'animal et prénom du propriétaire, pour ses seuls matchs.
--   messages        : ceux de ses matchs, via is_match_participant.
--   storage         : la photo principale des testeurs actifs (meeting_photo_visible).
--
-- Retour arrière (à exécuter dans une transaction) :
--   begin;
--   drop policy if exists "lire messages de ses matchs" on public.messages;
--   create policy "lire messages de ses matchs" on public.messages for select using (
--     exists (select 1 from public.matches m join public.pets pa on pa.id = m.pet_a join public.pets pb on pb.id = m.pet_b
--       where m.id = match_id and (pa.owner_id = auth.uid() or pb.owner_id = auth.uid())));
--   create policy "écrire dans ses matchs" on public.messages for insert with check (sender_id = auth.uid() and exists (
--     select 1 from public.matches m join public.pets pa on pa.id = m.pet_a join public.pets pb on pb.id = m.pet_b
--     where m.id = match_id and (pa.owner_id = auth.uid() or pb.owner_id = auth.uid())));
--   drop function if exists public.is_match_participant(uuid);
--   drop policy if exists "lire ses animaux" on public.pets;
--   drop policy if exists "lire son profil" on public.profiles;
--   create policy "pets visibles" on public.pets for select using (true);
--   create policy "profil visible par tous" on public.profiles for select using (true);
--   grant select on public.pets, public.profiles to anon;
--   commit;
begin;

-- 1. Animaux et profils : chacun ne lit directement que les siens.
drop policy "pets visibles" on public.pets;
create policy "lire ses animaux" on public.pets for select to authenticated
  using (owner_id = (select auth.uid()));
drop policy "profil visible par tous" on public.profiles;
create policy "lire son profil" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
-- Aucun usage anonyme : le droit de table est retiré en plus de la RLS.
revoke select on public.pets, public.profiles from anon;

-- 2. Messages : l'ancienne règle joignait les deux animaux du match, dont l'un est désormais privé.
-- La participation est vérifiée par une fonction privilégiée qui ne renseigne que sur l'appelant.
create function public.is_match_participant(p_match uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b
    where m.id=p_match and (a.owner_id=(select auth.uid()) or b.owner_id=(select auth.uid())));
$$;
revoke all on function public.is_match_participant(uuid) from public,anon,authenticated;
grant execute on function public.is_match_participant(uuid) to authenticated;

drop policy "lire messages de ses matchs" on public.messages;
create policy "lire messages de ses matchs" on public.messages for select to authenticated
  using ((select public.is_match_participant(match_id)));
-- Les insertions passent exclusivement par send_match_message (droit d'écriture retiré par la migration précédente).
drop policy "écrire dans ses matchs" on public.messages;

-- Les matchs restent lisibles par leurs participants : la règle existante ne lit que ses propres animaux.
-- Photos : règles de dossier propriétaire inchangées ; photo principale partagée via meeting_photo_visible.
commit;
