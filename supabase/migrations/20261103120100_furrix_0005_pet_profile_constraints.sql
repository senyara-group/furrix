-- Furrix 0005 — validation serveur du profil animal.
-- Reprend côté PostgreSQL les règles de src/validation/pet.ts : le client peut être contourné.
-- Nouvelle migration : les migrations 0001 à 0003 déjà appliquées ne sont ni modifiées ni rejouées.
-- Uniquement des fonctions natives (pg_catalog) : aucun droit EXECUTE supplémentaire à accorder.
--
-- photos : au plus 6 chemins Storage, tous de la forme <owner_id>/<id>/<fichier>.<jpg|jpeg|png|webp>,
-- donc impossibles à faire pointer vers le dossier d'un autre compte ou d'un autre animal.
--
-- Retour arrière (nouvelle migration, à n'appliquer qu'après accord) :
--   alter table public.pets
--     drop constraint if exists pets_name_length,
--     drop constraint if exists pets_breed_length,
--     drop constraint if exists pets_age_length,
--     drop constraint if exists pets_city_length,
--     drop constraint if exists pets_bio_length,
--     drop constraint if exists pets_photos_owned;
begin;

alter table public.pets
  add constraint pets_name_length
    check (char_length(btrim(name)) between 1 and 50 and char_length(name) <= 50),
  add constraint pets_breed_length check (breed is null or char_length(breed) <= 60),
  add constraint pets_age_length check (age is null or char_length(age) <= 30),
  add constraint pets_city_length check (city is null or char_length(city) <= 80),
  add constraint pets_bio_length check (bio is null or char_length(bio) <= 500),
  add constraint pets_photos_owned check (
    photos is null
    or cardinality(photos) = 0
    or (
      cardinality(photos) <= 6
      and array_position(photos, null) is null
      and strpos(array_to_string(photos, ''), ',') = 0
      and array_to_string(photos, ',') ~ (
        '^(' || owner_id::text || '/' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp))'
        || '(,' || owner_id::text || '/' || id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp))*$'
      )
    )
  );

commit;
