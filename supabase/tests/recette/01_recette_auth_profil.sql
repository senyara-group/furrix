-- Recette Furrix — inscription, profil et profil animal avec deux comptes fictifs.
--
-- Exécutable en l'état sur DEV (migrations 0001 à 0003) ; les contrôles de 0005 sont
-- exercés seulement si la contrainte pets_photos_owned existe.
--
-- AUCUNE DONNÉE N'EST CONSERVÉE : tout se déroule dans un unique bloc DO qui se termine
-- TOUJOURS par une exception, ce qui annule la transaction (comptes, profils, registres, animaux).
--   - succès : exception « RECETTE OK — … » (liste des contrôles passés) ;
--   - échec  : exception « RECETTE ECHEC — … » (premier contrôle en défaut) ou erreur PostgreSQL.
-- Les adresses fictives utilisent le domaine réservé furrix.invalid (RFC 2606) ; aucun e-mail n'est envoyé
-- car l'inscription est simulée par insertion SQL dans auth.users (le trigger on_auth_user_created s'exécute).
--
-- Rôle d'exécution attendu : postgres (éditeur SQL du tableau de bord ou execute_sql), jamais depuis le client.
do $recette$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  tag text := 'recette-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  pa uuid; pb uuid;
  n int;
  t text;
  ok text[] := '{}';
  has_0005 boolean := exists (
    select 1 from pg_constraint
     where conrelid = 'public.pets'::regclass and conname = 'pets_photos_owned');
begin
  -- 1. Inscription simulée : le trigger crée profil et registre de points.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values
    (a, 'authenticated', 'authenticated', tag || '-a@furrix.invalid', jsonb_build_object('name', 'Recette A'), '{}'::jsonb, now(), now()),
    (b, 'authenticated', 'authenticated', tag || '-b@furrix.invalid', jsonb_build_object('name', 'Recette B'), '{}'::jsonb, now(), now());

  select count(*) into n from public.profiles
   where id in (a, b) and role = 'user' and premium = false;
  if n <> 2 then raise exception 'RECETTE ECHEC — profils non créés ou non conformes (%/2)', n; end if;
  if (select name from public.profiles where id = a) is distinct from 'Recette A' then
    raise exception 'RECETTE ECHEC — nom du profil A non repris des métadonnées';
  end if;
  select count(*) into n from public.rewards_ledger
   where user_id in (a, b) and paws = 0 and xp = 0 and level = 1 and streak = 0;
  if n <> 2 then raise exception 'RECETTE ECHEC — registres de points non créés (%/2)', n; end if;
  ok := ok || 'profil + registre créés à l''inscription'::text;

  -- Animal de B créé côté serveur pour les tests inter-comptes.
  insert into public.pets (owner_id, name, species) values (b, 'Animal B', 'chat') returning id into pb;

  -- 2. Session de A (rôle authenticated + identité JWT simulée, locales à la transaction).
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  if (select count(*) from public.profiles where id = a) <> 1 then
    raise exception 'RECETTE ECHEC — A ne lit pas son profil';
  end if;
  if (select count(*) from public.rewards_ledger where user_id = b) <> 0 then
    raise exception 'RECETTE ECHEC — A lit le registre de points de B';
  end if;
  ok := ok || 'lecture : profil propre visible, points d''autrui invisibles'::text;

  update public.profiles set name = 'A modifié', city = 'Lille', bio = 'Bio A' where id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'RECETTE ECHEC — A ne peut pas éditer son profil'; end if;
  ok := ok || 'édition de son profil (name, city, bio)'::text;

  foreach t in array array[
    'update public.profiles set role = ''admin'' where id = %L',
    'update public.profiles set premium = true where id = %L',
    'update public.profiles set created_at = now() - interval ''1 year'' where id = %L',
    'insert into public.profiles (id, name) values (gen_random_uuid(), %L)'
  ] loop
    begin
      execute format(t, a);
      raise exception 'RECETTE ECHEC — opération acceptée : %', format(t, a);
    exception when insufficient_privilege then null;
    end;
  end loop;
  ok := ok || 'refus : rôle, Premium, dates serveur, création de profil'::text;

  update public.profiles set name = 'piraté' where id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RECETTE ECHEC — A modifie le profil de B'; end if;
  update public.rewards_ledger set paws = 999999 where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RECETTE ECHEC — A modifie ses points'; end if;
  ok := ok || 'aucun effet : profil de B, points de A'::text;

  -- 3. Profil animal de A.
  insert into public.pets (owner_id, name, species, breed, age, gender, purpose, city, bio)
  values (a, 'Luna', 'chien', 'Golden Retriever', '2 ans', '♀', 'balade', 'Lille', 'Adore la forêt')
  returning id into pa;
  update public.pets set bio = 'Adore la plage', city = 'Roubaix' where id = pa;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'RECETTE ECHEC — A ne peut pas éditer son animal'; end if;
  ok := ok || 'création et édition de son animal'::text;

  foreach t in array array[
    format('update public.pets set verified = true where id = %L', pa),
    format('update public.pets set owner_id = %L where id = %L', b, pa),
    format('insert into public.pets (owner_id, name, species, verified) values (%L, ''V'', ''chien'', true)', a)
  ] loop
    begin
      execute t;
      raise exception 'RECETTE ECHEC — opération acceptée : %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.pets (owner_id, name, species) values (b, 'Usurpé', 'chien');
    raise exception 'RECETTE ECHEC — A crée un animal pour B';
  exception when insufficient_privilege then null;
  end;
  ok := ok || 'refus : vérification, transfert, animal créé pour autrui'::text;

  update public.pets set name = 'piraté' where id = pb;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RECETTE ECHEC — A modifie l''animal de B'; end if;
  delete from public.pets where id = pb;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RECETTE ECHEC — A supprime l''animal de B'; end if;
  ok := ok || 'aucun effet : édition / suppression de l''animal de B'::text;

  if has_0005 then
    foreach t in array array[
      format('update public.pets set photos = array[%L] where id = %L', b::text || '/' || pb::text || '/x.jpg', pa),
      format('update public.pets set photos = array[%L] where id = %L', a::text || '/' || pa::text || '/x.gif', pa),
      format('update public.pets set name = %L where id = %L', repeat('n', 51), pa),
      format('update public.pets set bio = %L where id = %L', repeat('b', 501), pa)
    ] loop
      begin
        execute t;
        raise exception 'RECETTE ECHEC — valeur acceptée : %', t;
      exception when check_violation then null;
      end;
    end loop;
    update public.pets set photos = array[a::text || '/' || pa::text || '/photo-1.jpg'] where id = pa;
    ok := ok || 'contraintes 0005 : chemins photo et longueurs'::text;
  end if;

  -- 4. Anonyme : aucune écriture.
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    update public.profiles set name = 'anonyme' where id = a;
    raise exception 'RECETTE ECHEC — anon modifie un profil';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.pets (owner_id, name, species) values (a, 'Anon', 'chien');
    raise exception 'RECETTE ECHEC — anon crée un animal';
  exception when insufficient_privilege then null;
  end;
  ok := ok || 'refus : écritures anonymes'::text;

  -- 5. Vérification finale côté serveur.
  reset role;
  if (select role || '/' || premium::text from public.profiles where id = a) <> 'user/false' then
    raise exception 'RECETTE ECHEC — rôle ou Premium de A modifié';
  end if;
  if (select name from public.profiles where id = b) <> 'Recette B' then
    raise exception 'RECETTE ECHEC — profil de B altéré';
  end if;
  if (select verified from public.pets where id = pa) is distinct from false then
    raise exception 'RECETTE ECHEC — animal de A vérifié';
  end if;
  if (select name from public.pets where id = pb) <> 'Animal B' then
    raise exception 'RECETTE ECHEC — animal de B altéré';
  end if;
  ok := ok || 'état final serveur conforme'::text;

  raise exception 'RECETTE OK — % contrôles : %', cardinality(ok), array_to_string(ok, ' ; ');
end
$recette$;
