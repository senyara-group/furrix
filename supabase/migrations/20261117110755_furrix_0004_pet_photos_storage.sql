-- Furrix 0004 — règles Storage du bucket pet-photos (audit F14, photos uniquement).
-- Nouvelle migration : les migrations 0001 à 0003 déjà appliquées ne sont ni modifiées ni rejouées.
--
-- Convention de chemin : <auth.uid()>/<pet_id>/<nom>.<jpg|jpeg|png|webp>
-- - écriture, remplacement, suppression et listage limités au dossier de l'utilisateur ;
-- - 5 Mo maximum, JPEG / PNG / WebP uniquement (contrôlés par Storage côté serveur) ;
-- - le bucket reste public en lecture par URL (profils animaux publics, cf. policy « pets visibles »).
--   La politique des photos lors d'un blocage / d'une suppression de compte reste une décision ouverte (F14).
-- Le bucket privé « documents » n'est pas traité ici.
--
-- Retour arrière (nouvelle migration, à n'appliquer qu'après accord) :
--   drop policy if exists "pet-photos : lister son dossier" on storage.objects;
--   drop policy if exists "pet-photos : déposer dans son dossier" on storage.objects;
--   drop policy if exists "pet-photos : remplacer dans son dossier" on storage.objects;
--   drop policy if exists "pet-photos : supprimer dans son dossier" on storage.objects;
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'pet-photos';
begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'pet-photos') then
    raise exception 'Bucket pet-photos absent : migration 0001 non appliquée ?';
  end if;
end $$;

update storage.buckets
   set public = true,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'pet-photos';

create policy "pet-photos : lister son dossier" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "pet-photos : déposer dans son dossier" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy "pet-photos : remplacer dans son dossier" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy "pet-photos : supprimer dans son dossier" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
