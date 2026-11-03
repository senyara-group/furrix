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
