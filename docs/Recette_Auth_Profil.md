# Lot « authentification et profil animal » — recette Supabase

Branche : `feat/auth-profil-animal`, depuis `main` (`a92db2d`). Projet cible : **DEV `jemikzqgbpaivlujnfgl` uniquement**.

## Ce que le lot apporte

| Domaine | Fichiers |
|---|---|
| Client Supabase typé, refus de toute clé serveur dans le bundle | `src/services/supabaseClient.ts`, `src/lib/supabase.mjs` (réexport) |
| Inscription, connexion, déconnexion, restauration de session (`getSession` + `onAuthStateChange`) | `src/services/auth.ts`, `src/hooks/useAuth.ts` |
| Création / édition du profil animal, validation, états de chargement et d'erreur | `src/validation/pet.ts`, `src/services/pets.ts`, `src/hooks/useMyPet.ts` |
| Upload photo (`<uid>/<pet_id>/<uuid>.<ext>`, JPEG/PNG/WebP, 5 Mo) | `src/services/petPhotos.ts` |
| Écrans du MVP branchés, design inchangé, mode démonstration conservé | `src/FurrixMVP.jsx`, `src/main.jsx` (`VITE_FURRIX_APP=mvp`) |
| Règles Storage du bucket `pet-photos` | `supabase/migrations/20261103120000_furrix_0004_pet_photos_storage.sql` |
| Contraintes serveur du profil animal (longueurs, chemins photo) | `supabase/migrations/20261103120100_furrix_0005_pet_profile_constraints.sql` |
| Recette SQL avec comptes fictifs, nettoyage | `supabase/tests/recette/` |

TypeScript n'est introduit que pour les nouveaux services, contrats et hooks (`tsconfig.json` limité à `src/**/*.ts`) ;
les écrans `.jsx` existants ne sont pas convertis. Hors périmètre : paiements, récompenses, communautés, téléconsultation,
swipe/matchs/chat réels (toujours en démonstration dans le MVP), bucket `documents`, suppression de compte.

## Tests locaux

```bash
npm install
npm test              # Vitest : validation, services et hooks avec client Supabase simulé
npm run typecheck     # tsc --noEmit sur les fichiers .ts
npm run build
npm run test:sql      # PGlite : frontières SQL existantes + migrations 0004/0005 + scripts de recette
node --test supabase/tests/dev-inspection.test.mjs
```

`supabase/tests/auth-profile-storage.test.mjs` exécute les deux scripts de recette sur une base jetable,
avant et après 0004/0005, et vérifie qu'ils ne laissent aucune donnée. Les schémas `auth` et `storage` y sont
des maquettes : l'API Storage réelle (taille, MIME) et GoTrue ne sont pas simulés.

## Recette distante — opérations soumises à accord

Aucune de ces opérations n'a été exécutée. Chacune attend un accord explicite. Ordre :

| # | Opération | Outil | Écrit-elle ? | Retour arrière |
|---|---|---|---|---|
| 1 | `01_recette_auth_profil.sql` | `execute_sql` | Oui, dans une transaction **toujours annulée** (fin par exception) | Rien à défaire |
| 2 | Migration 0004 (Storage) | `apply_migration`, nom `furrix_0004_pet_photos_storage` | Oui, durable | SQL en tête du fichier, en nouvelle migration |
| 3 | Migration 0005 (contraintes) | `apply_migration`, nom `furrix_0005_pet_profile_constraints` | Oui, durable | SQL en tête du fichier, en nouvelle migration |
| 4 | `01_…` puis `02_recette_storage_photos.sql` | `execute_sql` | Transaction toujours annulée | Rien à défaire |
| 5 | `get_advisors` (security) | lecture | Non | — |
| 6 | Parcours applicatif manuel (ci-dessous) | navigateur | Oui : comptes réels de test | `99_nettoyage_comptes_fictifs.sql` |

Résultat attendu : `RECETTE OK — 10 contrôles` avant 0005, `11 contrôles` après ; `RECETTE STORAGE OK — 5 contrôles`.
Toute autre erreur (`RECETTE ECHEC — …` ou erreur PostgreSQL) arrête la séquence.

**Versions de migration.** `apply_migration` attribue sa propre version horodatée. Après application, comparer
avec `list_migrations` et, si la version diffère, renommer le fichier local en conséquence dans un commit dédié
(même procédure que [l'alignement d'historique](Supabase_Alignement_Historique.md)), sans modifier le SQL.
Ne jamais rejouer 0001 à 0003.

## Prérequis Auth côté tableau de bord (non scriptés)

- Le parcours applicatif nécessite les inscriptions e-mail activées sur DEV et l'URL de redirection
  (`http://localhost:5173` en développement) autorisée dans *Authentication → URL Configuration*.
  `supabase/config.toml` garde `enable_signup = false` pour la pile locale : c'est voulu tant que le backend
  n'est pas ouvert ; à revoir explicitement avant tout test local de bout en bout.
- La confirmation d'e-mail est gérée : sans session à l'inscription, l'interface demande de confirmer l'e-mail.
- Variables locales (`.env.local`, jamais commité) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (clé **publique** anon / publishable — une clé `service_role` ou `sb_secret_` fait échouer le démarrage),
  `VITE_FURRIX_APP=mvp`.

## Parcours applicatif manuel (après 0004/0005)

Comptes de test : adresses réelles avec alias, préfixées `recette-` (ex. `recette-a+1@…`), pour que le
script de nettoyage les retrouve.

1. Inscription A → message de confirmation ; lien reçu ; connexion A.
2. Recharger la page : la session est restaurée sans nouvelle connexion.
3. Créer le profil animal sans photo ; recharger : le profil est relu depuis Supabase.
4. « Modifier le profil » : changer la ville et ajouter une photo JPEG < 5 Mo → la photo s'affiche.
5. Essayer une photo GIF, puis une photo > 5 Mo → refus côté interface ; réessayer en contournant l'interface
   (console : `supabase.storage.from('pet-photos').upload('<uid_B>/…/x.jpg', …)`) → refus serveur.
6. Couper le réseau puis enregistrer → message « Connexion impossible » ; le formulaire reste rempli.
7. Déconnexion, inscription B, vérifier que B ne voit qu'un formulaire vierge.
8. Nettoyage : supprimer les photos des dossiers `<uid>/` dans Storage, puis `99_nettoyage_comptes_fictifs.sql`
   (aperçu, puis suppression, après accord).

## Limites et décisions ouvertes

- Le bucket `pet-photos` reste **public en lecture par URL** (profils animaux publics). Le comportement des photos
  lors d'un blocage ou d'une suppression de compte (audit F14/F15) reste à décider.
- Les photos d'un animal supprimé ne sont pas nettoyées automatiquement (pas de cascade Storage).
- Le MVP gère un seul animal par compte (`fetchMyPet` lit le premier).
- Les contraintes 0005 couvrent les champs du MVP ; les autres colonnes de `pets` (santé, caractère) n'ont pas
  encore de limites serveur.
