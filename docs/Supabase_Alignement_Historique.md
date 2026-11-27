# Alignement local de l'historique Supabase DEV

Branche : `codex/align-migration-history`, créée depuis `57f3ef7` (préparation Supabase). SQL source approuvé : `72a873c331b76d851a420a22b1766b1509081b1f`. Le rapport d'audit dans `docs/audits/` reste inchangé.

Les correspondances ci-dessous proviennent du compte rendu d'application fourni par l'utilisateur pour le projet DEV `jemikzqgbpaivlujnfgl`. Aucun changement du schéma ou de l'historique distant n'est réalisé dans ce lot.

1. `0001_init.sql` devient `20261023134035_furrix_0001_init.sql` ; couple distant attendu : `20261023134035` / `furrix_0001_init`.
2. `0002_rate_limiting.sql` devient `20261023134044_furrix_0002_rate_limiting.sql` ; couple distant attendu : `20261023134044` / `furrix_0002_rate_limiting`.
3. `0003_security_boundaries.sql` devient `20261023134053_furrix_0003_security_boundaries.sql` ; couple distant attendu : `20261023134053` / `furrix_0003_security_boundaries`.

## Intégrité du SQL

Le [manifeste d'intégrité](../supabase/migration-alignment.json) enregistre chaque ancien/nouveau nom et les SHA-256 avant/après. Les trois renommages préservent exactement les octets des fichiers de travail : les trois comparaisons sont vraies. Aucune ligne SQL n'est changée.

Les fins de ligne des fichiers de travail peuvent différer de celles des blobs Git selon le checkout. Le manifeste donne séparément le SHA-256 du blob Git original, issu du commit approuvé. Les contenus Git des nouveaux chemins sont comparés aux anciens après indexation ; ne pas confondre ces deux représentations. Le SHA-256 du rapport d'audit avant/après est également enregistré et identique.

## Adaptations locales

Les deux suites chargent les fichiers renommés. La fixture d'historique utilise les trois couples version/nom distants. Le postflight attend ces couples exacts ; il refuse une version courte, un nom incorrect ou une entrée manquante. Les autres contrôles SQL restent identiques.

Les références de fichiers dans les documents opérationnels et techniques sont mises à jour. Les mentions `0001`, `0002`, `0003` sans nom de fichier restent des libellés historiques du contenu, pas des identifiants d'historique à réintroduire.

## Reproduire les tests locaux

```powershell
npm.cmd test --prefix supabase/tests
node --test supabase/tests/dev-inspection.test.mjs
```

Le premier lance la suite sécurité ; le second lance la suite d'inspection. Les deux utilisent PGlite en mémoire. `pg_cron` n'y est pas installé : ses instructions sont retirées de la copie en mémoire de la deuxième migration comme avant cet alignement. Les fixtures de jobs ne prouvent aucune exécution du scheduler.

Résultat après renommage : suite sécurité **17/17**, suite inspection **8/8**, aucun échec ni test ignoré. Les identifiants de tests comptent le test parent dans chaque suite. La suite inspection vérifie aussi le rejet d'un nom erroné et d'un identifiant court avant de tester une entrée absente.

## Comparaison distante et limites

**Non exécutée :** lecture en direct de l'historique distant et confirmation CLI de l'absence de migration initiale en attente. Aucun outil Supabase SQL n'est exposé dans cette session ; aucune nouvelle tentative CLI n'est faite. La correspondance est établie localement à partir des couples fournis, sans revendiquer de vérification distante.

Quand un accès en lecture seule sera disponible, vérifier sur la cible DEV les trois couples version/nom, l'identité du projet et le SQL enregistré face aux fichiers approuvés. Examiner aussi toute entrée supplémentaire ou ancienne version courte. Effectuer cette lecture sans `db push`, rejeu ou `migration repair` ; si le CLI ne peut pas garantir une inspection sans écriture, utiliser le connecteur SQL avec une transaction READ ONLY.

Aucun push Git, fusion, réparation distante, migration, seed, déploiement de fonction ou changement d'interface n'est inclus. L'application réelle, les parcours Auth/Storage et l'exécution cron conservent leurs limites précédentes.

## Inscription Stripe des gardiens (25 novembre 2026)

Migration appliquée sur DEV `jemikzqgbpaivlujnfgl` par l'outil `apply_migration` du connecteur Supabase, sans `db push`, après accord explicite. Supabase a enregistré la version **`20261125135930`** sous le nom `sitter_stripe_onboarding`.

- `20261125105925_sitter_stripe_onboarding.sql` devient `20261125135930_sitter_stripe_onboarding.sql` : simple renommage Git, sans aucune ligne SQL modifiée. SHA-256 du blob Git avant et après : `db40d34a612d5e29330025f1ef9ddca3cc609ca0aa819fecc1954ea704458e15`.
- Le contenu enregistré dans `supabase_migrations.schema_migrations` correspond au fichier : MD5 `165d5949…` identique de part et d'autre, après retrait des blancs et des points-virgules.
- Contrôle `supabase/checks/sitter-stripe-onboarding-postflight.sql` exécuté sur DEV juste après : aucune exception ; `liaisons = 0`, `comptes_relies = 0`, `baux_actifs = 0`.
- Les deux tests SQL et le commentaire du contrôle pointent vers le nouveau nom. Dans l'ordre local, la migration se place désormais après `20261125120000_professional_messages`, toujours non appliquée sur DEV. Les deux migrations sont indépendantes.

Reste ouvert, hors de ce lot : l'écart `unified_notifications`. DEV porte la version `20261120103721`, le fichier local `20261120100904`, avec un contenu identique.

## Messagerie Services (27 novembre 2026)

Lors de l'essai avec deux comptes bêta, l'écran de conversation était livré mais ni `professional_messages`, ni `send_professional_message`, ni `list_professional_threads` n'existaient sur DEV. La migration manquante a été appliquée seule via le connecteur, sans `db push`, après vérification des dépendances et réussite des 8 tests SQL ciblés.

- Version enregistrée : **`20261127103148`**, nom `professional_messages`. Le fichier initial `20261125120000_professional_messages.sql` est renommé sans modification du SQL ; la référence de son test de réapplication est mise à jour.
- Après application : RLS activée ; SELECT accordé à `authenticated`, refusé à `anon` ; aucune écriture directe accordée à `authenticated` ; envoi par RPC réservé aux comptes authentifiés. Les cinq fonctions privilégiées gardent `search_path=""`.
- Aucun message n'avait été enregistré lors des tentatives en échec. Le rendez-vous de test reste confirmé. Aucun changement Stripe ni aucune autre migration appliquée.

## Position des activités sur la carte Services (26 novembre 2026)

Migration appliquée sur DEV `jemikzqgbpaivlujnfgl` par l'outil `apply_migration` du connecteur Supabase, sans `db push`, après accord explicite. Supabase a enregistré la version **`20261126133706`** sous le nom `professional_map_position` ; le fichier local porte ce numéro.

- Avant application : le corps de `search_professionals` sur DEV avait le même MD5 (`ddf6c668…`) que celui de `20261119171727_professional_directory.sql` : aucune version intermédiaire écrasée.
- Après application : la fonction renvoie aussi `latitude` et `longitude` ; exécution toujours refusée à `anon`, accordée à `authenticated`.
- Retour arrière : `supabase/operations/rollback_professional_map_position.sql` (testé localement dans `supabase/tests/professionals.test.mjs`).

## Secteurs de carte Garde et Rencontres (26 novembre 2026)

Migration appliquée sur DEV `jemikzqgbpaivlujnfgl` par `apply_migration`, sans `db push`. Supabase a enregistré la version **`20261126134843`** sous le nom `map_sectors` ; le fichier local porte ce numéro.

- Avant application : `search_sitters` et `discover_pets` sur DEV identiques aux dernières versions du dépôt (MD5 `dae0a184…` et `d08613c2…`, après normalisation des fins de ligne).
- Après application : les deux fonctions renvoient aussi `latitude` et `longitude` (secteur arrondi à 0,05°) ; exécution refusée à `anon`, accordée à `authenticated`.
- Retour arrière : `supabase/operations/rollback_map_sectors.sql`, avant celui du retrait d'animal (testé dans `supabase/tests/pet-retirement.test.mjs`).
