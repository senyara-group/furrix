-- Recette Furrix — règles Storage du bucket pet-photos (après la migration 0004).
--
-- Contrôle les policies sur storage.objects par insertion de métadonnées uniquement (aucun fichier
-- n'est téléversé). Comme 01_recette_auth_profil.sql, le bloc se termine TOUJOURS par une exception :
-- comptes fictifs, animaux et lignes storage.objects sont annulés.
--   - succès : « RECETTE STORAGE OK — … » ; échec : « RECETTE STORAGE ECHEC — … ».
-- Les limites de taille et de type MIME sont appliquées par l'API Storage au téléversement : elles sont
-- vérifiées ici dans storage.buckets, et réellement exercées par le parcours manuel (docs/Recette_Auth_Profil.md).
do $recette$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  tag text := 'recette-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  pa uuid;
  n int;
  t text;
  ok text[] := '{}';
begin
  if not exists (
    select 1 from storage.buckets
     where id = 'pet-photos' and public
       and file_size_limit = 5242880
       and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
       and cardinality(allowed_mime_types) = 3
  ) then
    raise exception 'RECETTE STORAGE ECHEC — limites du bucket pet-photos absentes (migration 0004 ?)';
  end if;
  ok := ok || 'bucket : 5 Mo, JPEG/PNG/WebP'::text;

  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values
    (a, 'authenticated', 'authenticated', tag || '-a@furrix.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (b, 'authenticated', 'authenticated', tag || '-b@furrix.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.pets (owner_id, name, species) values (a, 'Animal A', 'chien') returning id into pa;
  -- Objet de B déposé côté serveur.
  insert into storage.objects (bucket_id, name, owner_id)
  values ('pet-photos', b::text || '/' || gen_random_uuid()::text || '/b.jpg', b::text);

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into storage.objects (bucket_id, name, owner_id)
  values ('pet-photos', a::text || '/' || pa::text || '/photo-1.jpg', a::text);
  ok := ok || 'dépôt dans son dossier'::text;

  foreach t in array array[
    b::text || '/' || pa::text || '/intrus.jpg',
    a::text || '/intrus.jpg',
    a::text || '/' || pa::text || '/script.svg',
    'public/' || pa::text || '/x.jpg'
  ] loop
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('pet-photos', t, a::text);
      raise exception 'RECETTE STORAGE ECHEC — dépôt accepté : %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  ok := ok || 'refus : dossier d''autrui, hors dossier animal, extension interdite'::text;

  if (select count(*) from storage.objects where bucket_id = 'pet-photos' and name like b::text || '/%') <> 0 then
    raise exception 'RECETTE STORAGE ECHEC — A liste le dossier de B';
  end if;
  update storage.objects set name = name where bucket_id = 'pet-photos' and name like b::text || '/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RECETTE STORAGE ECHEC — A modifie un objet de B'; end if;
  ok := ok || 'objets de B invisibles et non modifiables'::text;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    insert into storage.objects (bucket_id, name) values ('pet-photos', a::text || '/' || pa::text || '/anon.jpg');
    raise exception 'RECETTE STORAGE ECHEC — dépôt anonyme accepté';
  exception when insufficient_privilege then null;
  end;
  ok := ok || 'refus : dépôt anonyme'::text;
  reset role;

  raise exception 'RECETTE STORAGE OK — % contrôles : %', cardinality(ok), array_to_string(ok, ' ; ');
end
$recette$;
