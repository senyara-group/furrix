-- Nettoyage des comptes fictifs de recette Furrix.
--
-- Les scripts 01 et 02 ne laissent rien (transaction toujours annulée). Ce script ne sert qu'aux comptes
-- créés MANUELLEMENT pendant le parcours applicatif (docs/Recette_Auth_Profil.md), tous nommés
-- « recette-…@… » ou portant raw_user_meta_data.furrix_recette = true.
--
-- Ordre :
--   0. Supprimer d'abord leurs photos via l'API Storage ou le tableau de bord (dossiers <user_id>/ du bucket
--      pet-photos) : Supabase interdit la suppression directe de storage.objects en SQL.
--   1. Exécuter la requête d'aperçu ci-dessous et vérifier la liste.
--   2. Exécuter le bloc de suppression : il refuse d'agir sur plus de 10 comptes ou sur un compte
--      possédant encore des objets Storage. La cascade supprime profil, registre de points et animaux.
-- Irréversible : à n'exécuter qu'après accord explicite.

-- 1. Aperçu (lecture seule)
select u.id, u.email, u.created_at,
       (select count(*) from public.pets p where p.owner_id = u.id) as animaux,
       (select count(*) from storage.objects o where o.bucket_id = 'pet-photos'
          and o.name like u.id::text || '/%') as photos
  from auth.users u
 where u.email like 'recette-%'
    or coalesce((u.raw_user_meta_data ->> 'furrix_recette')::boolean, false)
 order by u.created_at;

-- 2. Suppression (décommenter après validation de l'aperçu)
-- do $$
-- declare n int; o int;
-- begin
--   create temp table cibles on commit drop as
--     select id from auth.users
--      where email like 'recette-%'
--         or coalesce((raw_user_meta_data ->> 'furrix_recette')::boolean, false);
--   select count(*) into n from cibles;
--   if n > 10 then raise exception 'Nettoyage refusé : % comptes ciblés (> 10)', n; end if;
--   select count(*) into o from storage.objects s join cibles c on s.name like c.id::text || '/%'
--    where s.bucket_id = 'pet-photos';
--   if o > 0 then raise exception 'Nettoyage refusé : % photos restantes, les supprimer via Storage', o; end if;
--   delete from auth.users where id in (select id from cibles);
--   raise notice '% comptes fictifs supprimés', n;
-- end $$;
