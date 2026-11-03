# Lot « authentification et profil animal » — recette Supabase

> **Recadrage produit en cours (3 novembre 2026)** : le positionnement mobile-only et le design actuel ne sont
> plus considérés comme définitivement validés (application web envisagée, avec iOS/Android cohérentes).
> Ce lot est figé à son périmètre ; ses hypothèses produit sont listées en fin de document pour arbitrage.
>
> **Interface cible actuelle : `src/Furrix.jsx`** (sous réserve du recadrage). Le MVP (`FurrixMVP.jsx`, `VITE_FURRIX_APP=mvp`) n'est qu'un banc d'essai
> temporaire des services et hooks. Son branchement **ne signifie pas** que l'application complète est connectée :
> `Furrix.jsx` fonctionne toujours entièrement sur des données de démonstration. Voir « Raccordement restant ».

Branche : `feat/auth-profil-animal`, depuis `main` (`a92db2d`). Projet cible : **DEV `jemikzqgbpaivlujnfgl` uniquement**.

## Ce que le lot apporte

| Domaine | Fichiers |
|---|---|
| Client Supabase typé, refus de toute clé serveur dans le bundle | `src/services/supabaseClient.ts`, `src/lib/supabase.mjs` (réexport) |
| Inscription, connexion, déconnexion, restauration de session (`getSession` + `onAuthStateChange`) | `src/services/auth.ts`, `src/hooks/useAuth.ts` |
| Création / édition du profil animal, validation, états de chargement et d'erreur | `src/validation/pet.ts`, `src/services/pets.ts`, `src/hooks/useMyPet.ts` |
| Upload photo (`<uid>/<pet_id>/<uuid>.<ext>`, JPEG/PNG/WebP, 5 Mo) | `src/services/petPhotos.ts` |
| Remplacement de photo réconcilié avec l'état serveur (voir ci-dessous) | `src/services/petPhotoFlow.ts` |
| Banc d'essai : écrans du MVP branchés, design inchangé, mode démonstration conservé | `src/FurrixMVP.jsx`, `src/main.jsx` (`VITE_FURRIX_APP=mvp`) |
| Règles Storage du bucket `pet-photos` | `supabase/migrations/20261103120000_furrix_0004_pet_photos_storage.sql` |
| Contraintes serveur du profil animal (longueurs, chemins photo) | `supabase/migrations/20261103120100_furrix_0005_pet_profile_constraints.sql` |
| Recette SQL avec comptes fictifs, nettoyage | `supabase/tests/recette/` |

TypeScript n'est introduit que pour les nouveaux services, contrats et hooks (`tsconfig.json` limité à `src/**/*.ts`) ;
les écrans `.jsx` existants ne sont pas convertis. Hors périmètre : paiements, récompenses, communautés, téléconsultation,
swipe/matchs/chat réels (toujours en démonstration dans le MVP), bucket `documents`, suppression de compte.

## Photo : réponse perdue et objets orphelins

Le remplacement de photo suit : téléversement → enregistrement du chemin dans `pets.photos` → suppression des
anciennes photos. Une erreur réseau sur l'enregistrement ne prouve pas l'échec : l'écriture a pu réussir et
seule la réponse s'est perdue. `replacePetPhoto` **relit donc l'animal avant toute suppression** :

| Erreur sur l'enregistrement du chemin | Relecture | Décision |
|---|---|---|
| quelconque | chemin présent | succès (écriture réussie, réponse perdue) ; nouvelle photo conservée, anciennes supprimées |
| réseau / inconnue | chemin absent | **incertain** (écriture peut-être encore en vol) : nouvel objet conservé |
| quelconque | relecture impossible | **incertain** : nouvel objet et anciennes photos conservés |
| refus définitif reçu (42501, 23514, PGRST116) | chemin absent | nouvel objet supprimé ; anciennes photos intactes |

Les anciennes photos ne sont supprimées que d'après un état serveur confirmé. Un échec ou une réponse perdue
du téléversement lui-même ne déclenche aucune suppression. Les objets conservés par prudence sont des orphelins
à traiter par un futur nettoyage serveur (objets de `pet-photos` non référencés par `pets.photos`).

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

## Simulation SQL ≠ parcours Auth/JWT réel

Les scripts `01` et `02` sont des **simulations SQL** exécutées en `postgres` :

- l'« inscription » est un `insert` direct dans `auth.users` : ni GoTrue, ni hachage du mot de passe, ni e-mail
  de confirmation, ni ligne `auth.identities`, ni jeton émis ;
- la « session » est simulée par `set local role authenticated` et `request.jwt.claims` : aucun JWT n'est
  signé ni vérifié, PostgREST et l'API Storage ne sont pas traversés.

Elles prouvent le comportement **de la base** (déclencheur d'inscription, privilèges de colonnes, RLS,
contraintes) pour une identité donnée. Elles ne prouvent pas l'inscription réelle, la confirmation d'e-mail,
l'émission et le rafraîchissement des jetons, la restauration de session, ni les limites de taille et de type
appliquées par l'API Storage : c'est le rôle du parcours applicatif manuel.

## Journal de recette DEV

| Date (UTC) | Opération | Résultat |
|---|---|---|
| 2026-11-03 | État avant : `list_migrations` + comptages | 3 migrations (0001-0003) ; 0 utilisateur, identité, profil, registre, animal, objet Storage ; aucune policy Storage ; 0005 absente |
| 2026-11-03 | `01_recette_auth_profil.sql` via `execute_sql` (rôle `postgres`), contenu du fichier sans ses commentaires | `RECETTE OK — 10 contrôles`, transaction annulée par l'exception finale |
| 2026-11-03 | État après : mêmes comptages + recherche `recette-%` / `@furrix.invalid` | tout à 0, 3 migrations : **aucune donnée fictive conservée** |

Les contrôles propres à 0005 n'ont pas été exercés (migration non appliquée).

## Recette distante — opérations soumises à accord

L'étape 1 a été exécutée (journal ci-dessus). Les suivantes attendent un accord explicite. Ordre :

| # | Opération | Outil | Écrit-elle ? | Retour arrière |
|---|---|---|---|---|
| 1 | `01_recette_auth_profil.sql` | `execute_sql` | Oui, dans une transaction **toujours annulée** (fin par exception) | Rien à défaire |
| 2 | Migration 0004 (Storage) | `apply_migration`, nom `furrix_0004_pet_photos_storage` | Oui, durable | SQL en tête du fichier, en nouvelle migration |
| 3 | Migration 0005 (contraintes) | `apply_migration`, nom `furrix_0005_pet_profile_constraints` | Oui, durable | SQL en tête du fichier, en nouvelle migration |
| 4 | `01_…` puis `02_recette_storage_photos.sql` | `execute_sql` | Transaction toujours annulée | Rien à défaire |
| 5 | `get_advisors` (security) | lecture | Non | — |
| 6 | Parcours applicatif manuel (ci-dessous) | navigateur | Oui : comptes réels de test | `99_nettoyage_comptes_fictifs.sql` |

Résultat attendu : `RECETTE OK — 10 contrôles` avant 0005 (obtenu le 3 novembre), `11 contrôles` après ; `RECETTE STORAGE OK — 5 contrôles`.
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

## Raccordement restant de `Furrix.jsx` (interface cible)

Rien de ce qui suit n'est branché. Les services et hooks de ce lot sont prévus pour être réutilisés tels quels.

| Élément de `Furrix.jsx` | État actuel | Raccordement à faire |
|---|---|---|
| Écran d'authentification | **Absent** : l'app démarre sur l'onboarding (`screen="onboard"`) | Ajouter inscription / connexion dans le style de l'onboarding, avec `useAuth` ; garde de session avant `onboard` / `app` ; écran de chargement pendant la restauration |
| Onboarding étape 1 (espèce, nom, race, âge, sexe) | État local `myPet` | `useMyPet().save` ; ajouter la ville de l'animal (exigée par la validation actuelle) ou l'assouplir |
| Onboarding étape 2 (stérilisé, puce, vaccins, allergies, énergie / sociabilité / propreté, alimentation, jouet, poids) | État local | Étendre `PetInput`, `validatePetForm`, `toWritable` (limites `PET_EXTRA_LIMITS` déjà alignées sur 0005) |
| Onboarding étape 3 (prénom, ville, bio du propriétaire) | `myPet.ownerName/ownerCity/ownerBio` | Nouveau service `profiles` (update `name`, `city`, `bio` de son propre profil, seules colonnes autorisées) |
| Onboarding étape 4 / « Passer » | `setScrn("app")` sans persistance | N'entrer dans l'app qu'après enregistrement confirmé ; reprise de l'onboarding si l'animal n'existe pas |
| Photo de l'animal | Aucun sélecteur ; `ph` en dur | Sélecteur + `replacePetPhoto` ; afficher `petPhotoUrl` |
| Profil « Moi » : édition, déconnexion | Démonstration | Réutiliser `useMyPet` / `useAuth().signOut` |
| `localStorage` (`store` : points, série, compteurs) | Local | Hors lot (récompenses) ; ne jamais réimporter ces soldes côté serveur |
| Swipe, matchs, chat, soins, communauté, paiements | Démonstration | Hors lot |

Point de vigilance : `Furrix.jsx` nomme ses champs différemment selon les endroits (`age` dans `myPet`,
`ag`/`br`/`sp` dans les données de démonstration) ; prévoir un adaptateur de présentation plutôt que de
renommer les colonnes.

## Limites et décisions ouvertes

- Le bucket `pet-photos` reste **public en lecture par URL** (profils animaux publics). Le comportement des photos
  lors d'un blocage ou d'une suppression de compte (audit F14/F15) reste à décider.
- Les photos d'un animal supprimé ne sont pas nettoyées automatiquement (pas de cascade Storage).
- Le MVP gère un seul animal par compte (`fetchMyPet` lit le premier).
- Une création d'animal dont la réponse est perdue peut aboutir côté serveur ; une nouvelle tentative créerait
  un second animal (le premier reste celui affiché). À traiter avec une clé d'idempotence lors du raccordement
  de `Furrix.jsx`.
- Les contraintes 0005 couvrent les champs du MVP ; les autres colonnes de `pets` (santé, caractère) n'ont pas
  encore de limites serveur.

## Hypothèses produit à arbitrer

Choix faits dans ce lot sans validation produit explicite. Aucun n'est irréversible ; ceux marqués « SQL » touchent
les migrations 0004/0005, **non appliquées** (aucune refonte n'est engagée).

| # | Hypothèse | Où | Impact si elle change |
|---|---|---|---|
| H1 | Plateforme : session persistée dans le stockage web (`localStorage`), redirection de confirmation vers `window.location.origin`, `detectSessionInUrl` | `supabaseClient.ts`, `auth.ts` | Web : adapté. Natif (Capacitor) : stockage à remplacer (Preferences/Keychain), confirmation par lien profond (`fr.furrix.app://…`) |
| H2 | Authentification par e-mail + mot de passe uniquement, confirmation d'e-mail supposée active | `auth.ts`, `useAuth.ts` | Lien magique, Google/Apple : nouveaux parcours ; Sign in with Apple obligatoire sur iOS si un autre fournisseur social est proposé |
| H3 | Mot de passe ≥ 8 caractères côté client | `validation/auth.ts` | À aligner sur la politique serveur Supabase (non vérifiée) |
| H4 | **Pas de déclaration 18+ ni d'acceptation CGU/confidentialité à l'inscription** (exigée par la doc juridique) | écran d'inscription | Ajout requis avant toute ouverture ; parcours et stockage du consentement à définir |
| H5 | Un seul animal par compte (premier animal lu) | `pets.ts`, `useMyPet.ts` | Multi-animaux : sélection d'animal actif, listes, écrans |
| H6 | Champs obligatoires : nom, race, ville ; âge en texte libre ; sexe stocké « ♂/♀ » ; ville saisie à la main | `validation/pet.ts`, 0005 (SQL) | Race « croisé/inconnue », date de naissance, géolocalisation, valeurs neutres de sexe |
| H7 | Liste d'espèces et d'objectifs du schéma 0001 ; « show » et « ferme » acceptés par la base mais absents de l'écran MVP | `types/pet.ts` | Liste à figer avec le produit |
| H8 | Limites de texte (nom 50, race 60, ville 80, bio 500 ; allergies 120, alimentation/jouet 80, poids 20) | `validation/pet.ts`, 0005 (SQL) | Ajuster avant application de 0005 |
| H9 | Champs `allerg/food/toy/weight` bornés **d'après l'onboarding de `Furrix.jsx`** | 0005 (SQL), ajouté dans #4 | Si le design change, ces limites peuvent être retirées de 0005 avant application |
| H10 | Une photo principale par animal (la base en accepte 6) ; JPEG/PNG/WebP, 5 Mo ; **HEIC refusé** | `petPhotos.ts`, 0004 (SQL) | Photos iPhone : conversion client ou acceptation HEIC ; galerie multi-photos |
| H11 | Photos **publiques par URL** ; sort en cas de blocage/suppression de compte non défini | 0004 (SQL) | Bucket privé + URL signées : changement de 0004 et de l'affichage |
| H12 | Textes en français, tutoiement | messages d'erreur, écrans | Internationalisation, vouvoiement |
| H13 | **Mode démonstration automatique si les variables Supabase manquent** | `supabaseClient.ts` | Sur un déploiement web mal configuré, l'app s'afficherait en démonstration sans erreur : à interdire en production |
| H14 | Le MVP sert de banc d'essai, sélectionné par `VITE_FURRIX_APP=mvp` ; `Furrix.jsx` reste l'entrée par défaut | `main.jsx` | Selon le recadrage, le banc d'essai peut être retiré |

