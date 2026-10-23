# Premier lot : frontières de sécurité SQL

Référence : [audit technique du 23 octobre 2026](audits/2026-10-23-audit-technique-furrix.md), fourni par l'utilisateur, conservé sans modification. Le fichier de preuves ZIP mentionné dans ce rapport n'a pas été fourni.

Branche : `codex/sql-security-boundaries`. Aucun déploiement distant. Les migrations `0001` et `0002`, les interfaces et les Edge Functions sont conservées intactes.

## Périmètre réalisé

- F01 : seuls `name`, `city`, `bio` sont modifiables par le propriétaire du profil. Le client ne peut ni insérer un profil ni changer `role`, `premium`, l'identifiant ou les dates serveur.
- F13, vérification uniquement : création d'animal sans `verified` (défaut false), édition des champs ordinaires et suppression sous RLS propriétaire. `verified`, `owner_id` et l'identifiant ne sont pas modifiables par le client. Le service conserve la création et l'édition de la vérification.
- F02, autorisations uniquement : RPC swipe réservée à `authenticated` et `service_role`, identité `auth.uid()` obligatoire même pour un appel serveur, animal source appartenant à cette identité, cible existante d'un autre propriétaire, direction valide. Pas d'auto-swipe ni de swipe entre deux animaux du même compte.
- F03 : RLS sans policy client sur les trois tables internes ; suppression des ACL de table, de colonne et de séquence ; accès serveur explicitement réaccordé.
- F04 : colonnes qualifiées dans `increment_paws`, signature conservée, exécution réservée à `service_role`. Le résultat reste tabulaire ; le handler `award-points` n'est pas corrigé dans ce lot.
- Les deux RPC corrigées ont un `search_path` vide et référencent explicitement les schémas.

## Privilèges et héritage

`0003_security_boundaries.sql` est transactionnelle. Elle retire tous les privilèges de table **et de chaque colonne**, y compris les grants explicites, à `PUBLIC`, `anon`, `authenticated` et à la fermeture transitive de leurs rôles parents. Elle retire aussi les privilèges de la séquence interne et les droits d'exécution des deux RPC à ces bénéficiaires. Une simple révocation d'UPDATE sur une colonne ne neutralise pas un UPDATE de table ; inversement, révoquer une table ne suffit pas à supprimer les grants de colonnes.

Les ACL sont ensuite reconstruites par liste de colonnes autorisées ; aucune future colonne ne sera implicitement éditable. Les rôles parents partagés peuvent perdre leurs droits sur ces objets, même pour d'autres membres. `CASCADE` peut supprimer des délégations issues des grants retirés : une revue du catalogue de la future instance sera nécessaire avant toute application distante. Les grants serveur nécessaires aux objets touchés sont explicites.

La migration refuse une hiérarchie où un rôle API ou parent est superutilisateur, BYPASSRLS ou propriétaire d'une relation/fonction du schéma public. Elle ne tente pas de réparer silencieusement une telle configuration. Le rôle Supabase `service_role` est supposé exister avec BYPASSRLS ; le banc le crée ainsi et exécute réellement des écritures sous ce rôle.

Les rôles personnalisés sans lien avec les rôles API ne sont pas reconfigurés. La migration ne change pas les default privileges ni les politiques de futures migrations : toute nouvelle attribution de privilèges doit respecter ces frontières. Elle ne retire pas des droits administratifs de création de rôles/schémas hors de ce périmètre.

## Exécuter les tests locaux

Prérequis : Node.js et npm. Depuis la racine :

```powershell
npm.cmd ci --prefix supabase/tests --ignore-scripts --no-audit --no-fund
npm.cmd test --prefix supabase/tests
```

La seule dépendance ajoutée est PGlite **0.5.11**, isolée dans `supabase/tests` avec son lockfile. Aucun changement des dépendances de l'application. Le runner Node crée une base PostgreSQL embarquée en mémoire puis la ferme. Il ne lit aucun `.env`, n'accepte aucune URL de base et n'appelle aucun service externe.

Les migrations initiales sont lues telles quelles. Dans le banc uniquement, la déclaration de `pg_cron` et ses deux planifications sont retirées en mémoire car l'extension n'existe pas dans PGlite. Les schémas `auth`/`storage` et `auth.uid()` sont des substituts minimaux. Les grants sont volontairement permissifs, avec grants de table, de colonne, PUBLIC et héritage sur deux niveaux.

Le banc reproduit d'abord l'auto-promotion, la fabrication anonyme de match, l'ambiguïté SQL et l'absence de RLS sur les trois tables internes. Il applique ensuite la migration corrective et vérifie :

- privilèges effectifs de table, colonne, séquence et RPC ; refus des accès clients sensibles et des grants équivalents hérités ;
- édition légitime, création d'animal non vérifié, suppression propriétaire et refus inter-comptes ;
- refus RPC anonyme, sans identité, pour animal tiers, cible invalide, auto-swipe et direction invalide ;
- deux likes successifs légitimes, lecture de match et messages limitée aux participants ;
- création de profil et registre par le trigger d'inscription ;
- écritures réelles serveur sur rôle, Premium, vérification, tables internes, abonnement et journal ;
- retour exact de la RPC points après crédit/débit, conservation des XP et refus d'un solde négatif ;
- isolation des lectures de points, historique et abonnement entre deux comptes ;
- search_path des RPC et refus de migration face à un parent BYPASSRLS.

## Résultats et limites

Exécution locale du 23 octobre 2026 : Node **24.16.0**, npm **11.13.0**, PGlite **0.5.11**. `npm.cmd test --prefix supabase/tests` termine avec le code **0** : **16 scénarios réussis**, soit **17 tests Node en comptant le test parent**, **0 échec**, **0 test ignoré**. Les quatre scénarios de reproduction précèdent la migration corrective ; les douze suivants contrôlent les restrictions et les opérations légitimes. Docker, Supabase CLI et psql ne sont pas disponibles dans cet environnement.

Non exécutés : migrations intégrales avec `pg_cron`, stack Supabase locale complète, PostgREST/JWT réels, handlers Deno, Storage réel, Realtime, tests multi-connexions et concurrence. Le banc ne remplace pas une recette sur une instance Supabase de test ni la vérification de ses ACL réelles. Aucun test de production, paiement ou prestataire externe.

## Risques restant ouverts

Ce lot n'autorise pas l'ouverture du backend aux utilisateurs. F05-F06 restent ouverts (preuve et idempotence des points, retour du handler, débit concurrent et codes non persistés). F07 reste ouvert (quotas facultatifs, identité du corps, erreurs ignorées, comptage non atomique, aucun gating Premium). F08-F10 restent ouverts (durabilité, rejeu, ordre, catalogue et configuration du webhook).

F12 reste ouvert : le swipe n'est pas refondu ; un rejeu peut tester une direction différente de celle stockée, retourner null sur un match existant, et deux likes simultanés peuvent manquer leur réciprocité. Les insertions directes de swipes autorisées par la RLS initiale restent possibles : quotas et blocages devront être rendus obligatoires dans leur lot.

Hors vérification serveur, F13 reste ouvert (lecture publique, coordonnées précises). Storage, suppression, modération, modèle de droits Plus/Max et autres constats de l'audit restent à traiter. Les soldes et le booléen Premium du prototype restent simulés et ne constituent pas une source serveur fiable. Aucun nouveau service, hook ou changement général TypeScript n'est introduit.
