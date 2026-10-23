# Préparer Supabase pour Furrix en développement

Cette préparation part de `main` fusionnée au commit `72a873c` et se trouve sur `codex/supabase-dev-environment`. Elle ne modifie ni les migrations `0001`/`0002`/`0003`, ni les Edge Functions, ni l'interface. Elle ne lance aucune migration distante et ne déploie rien.

Références : [audit du 23 octobre](audits/2026-10-23-audit-technique-furrix.md) et [périmètre du lot SQL](Furrix_Securisation.md). Le backend n'est toujours pas prêt à être ouvert aux utilisateurs ; quotas, points/récompenses, webhook et autres risques de l'audit restent ouverts.

## Outils et configuration locale

- Git, Node.js >= 20 et npm. Machine actuelle : Node 24.16.0, npm 11.13.0.
- CLI Supabase **2.122.0**, version figée dans `supabase/cli-version.txt`. Pas de `npm install -g supabase` ; utiliser la version explicite via npx. Le premier appel télécharge le CLI officiel et son binaire dans le cache npm, sans ajouter de dépendance à l'application.
- Pour la stack locale complète : Docker Desktop avec moteur Linux/WSL2 sur Windows, installé depuis l'éditeur officiel. La virtualisation doit être disponible et `docker info` doit réussir.
- Pour l'inspection SQL : client `psql` 17 (outils en ligne de commande de l'installateur PostgreSQL Windows), ajouté au PATH. Installer seulement le client suffit pour joindre un projet hébergé. Vérifier les versions avant usage.

```powershell
node --version
npm.cmd --version
npx.cmd --yes supabase@2.122.0 --version
docker version
docker info
psql --version
```

`supabase/config.toml` est versionné et déjà initialisé : **ne pas exécuter `init --force`**. `project_id="furrix-dev"` identifie les conteneurs locaux, pas un projet cloud. PostgreSQL 17 est une valeur de préparation à confirmer par l'inspection de la cible ; ne pas démarrer une stack supposée identique si la cible utilise une autre version majeure.

La configuration prépare une utilisation SQL uniquement : Data API, Studio, Realtime, analytics et Edge Runtime désactivés ; les cinq fonctions sont explicitement désactivées. Auth et Storage sont conservés pour leurs schémas gérés, mais les inscriptions sont désactivées. Le SMTP local capture les emails ; aucun prestataire externe n'est configuré. Aucun frontend n'est connecté. Le seed de démonstration est désactivé.

`auto_expose_new_tables=true` reproduit les default grants historiques utilisés par les premières migrations ; ce réglage ne justifie pas une exposition API. La migration 0003 retire les accès sensibles. Les permissions **réelles** doivent ensuite être contrôlées, notamment celles du service sur `subscriptions`, `rewards_*` et les séquences. Ne pas modifier les default grants d'une cible pour faire passer les tests sans revue.

Le fichier local ne configure ni ne protège automatiquement un projet hébergé. Ne pas lancer `config push`, `functions deploy` ou `secrets set` dans cette préparation. Conserver les services locaux sur une machine privée, sans tunnel ni exposition réseau publique. Les identifiants locaux par défaut ne conviennent pas à un hébergement.

## Informations et accès à obtenir avant toute exécution distante

1. Organisation, nom, **project ref exact** et confirmation écrite que la cible est une instance **de développement isolée**, sans données réelles. Relever le project ref depuis le Dashboard et le comparer au nom d'hôte/identifiant de connexion. Un libellé `dev` n'est pas une preuve suffisante.
2. Version majeure PostgreSQL, région, état du projet, éventuelles migrations ou objets existants, autres utilisateurs/services de cette base. Préférer une cible neuve pour ces migrations initiales non idempotentes.
3. Connexion SQL directe ou pooler **session** fourni par le Dashboard, rôle utilisable, certificat racine et contraintes réseau/IP. Éviter le pooler transaction pour l'administration et les migrations.
4. Accès initial permettant la lecture des catalogues, de l'historique de migrations et de `cron.job`/`job_run_details` s'ils existent. Une absence de visibilité n'est pas une absence d'objets : bloquer la revue si les droits de lecture sont insuffisants.
5. Pour l'application ultérieure : rôle de migration autorisé à créer les objets dans `public`, le trigger sur `auth.users`, les buckets dans `storage`, les extensions et les jobs ; droits sur les objets/ACL existants à révoquer. Un rôle `service_role` API n'est pas un substitut au rôle de migration SQL.
6. Décision sur l'installation de `pg_cron`, son preload, sa base, son fuseau et l'utilisateur des jobs. Accès administrateur/dashboard si une activation ou un redémarrage est nécessaire.
7. Approbation du rapport d'inspection, du plan exact de migrations et de l'effet de `REVOKE ... CASCADE` sur les éventuels groupes partagés ; fenêtre d'application sans client ni autre migration concurrente. Si la base contient déjà des objets/données, obtenir sauvegarde et procédure de restauration avant de définir un plan adapté.

Aucune de ces informations de cible ni aucune connexion SQL n'a été fournie pour cette préparation. Ne pas coller de mot de passe, jeton, clé service ou chaîne de connexion authentifiée dans le chat ou dans Git.

## Pré-vérification distante strictement en lecture seule

Préparer **hors du dépôt** un service libpq nommé `furrix-dev` (`pg_service.conf`) contenant l'hôte, le port, la base et l'utilisateur exacts du Dashboard, avec `sslmode=verify-full` et le certificat de confiance approprié (`sslrootcert`). Saisir le mot de passe à l'invite de `psql`, ou utiliser un fichier de mots de passe libpq personnel protégé par ACL. Ne pas mettre le mot de passe dans une URL, un argument de commande, une variable affichée, un script ou les résultats versionnés. Ne jamais contourner un échec TLS.

Avec `PGSERVICEFILE` pointant vers ce fichier privé si nécessaire, depuis la racine :

```powershell
psql "service=furrix-dev" -X --set ON_ERROR_STOP=1 --file supabase/checks/preflight.sql
if ($LASTEXITCODE -ne 0) { throw 'Inspection incomplète : ne pas migrer.' }
```

Le script utilise une transaction `READ ONLY` puis `ROLLBACK`. Il ne crée rien, ne répare pas l'historique et n'active aucune extension. Il inspecte les rôles et parents transitifs, propriétaires, droits de schéma/table/colonne, default ACL, RLS/policies, signatures/ACL/search_path des fonctions, extensions disponibles/installées, paramètres cron et versions de migrations. Les historiques absents sont signalés. Aucun compte utilisateur, secret, corps de fonction ou commande de job arbitraire n'est exporté.

Conserver les résultats dans un emplacement privé, éventuellement `supabase/checks/results/` (ignoré par Git), après revue avant partage. Le compte et la connexion doivent être ceux de la cible identifiée : les noms de bases hébergées sont souvent identiques et `current_database()` ne prouve pas à lui seul le project ref.

**Arrêter avant toute écriture** si :

- les rôles attendus (`anon`, `authenticated`, `service_role`) ou les objets gérés `auth.users`, `auth.uid()`, `storage.buckets` manquent ;
- un rôle API ou parent est superutilisateur, BYPASSRLS ou propriétaire d'un objet public ; les groupes sont partagés et l'impact des révocations n'est pas compris ;
- des tables/fonctions Furrix ou buckets `pet-photos`/`documents` existent sans historique cohérent. Le préflight ne lit que l'identifiant et le caractère public de ces deux buckets, aucun objet Storage ;
- l'historique contient des versions inattendues, un préfixe incomplet non expliqué, ou des migrations déclarées appliquées mais dont les fichiers/effets ne correspondent pas. Les versions seules ne prouvent pas le contenu : comparer les SQL approuvés et les objets ;
- `pg_cron` n'est pas disponible, le preload/configuration est incompatible, l'utilisateur de migration n'a pas les permissions nécessaires, ou des jobs homonymes existent ;
- la cible n'est pas neuve et le risque d'une application partielle n'est pas maîtrisé.

Sur une instance neuve, l'extension `pg_cron` peut être disponible sans être encore installée : 0002 contient son installation conditionnelle. Les schémas Supabase gérés sont attendus ; leur présence ne signifie pas que la base contient déjà Furrix. Une remédiation de configuration nécessite un plan séparé, pas une écriture cachée dans le préflight.

Ne pas utiliser `db pull`, `migration repair`, `db reset`, `link` ou `db push --dry-run` comme substitut à cette inspection : certaines commandes CLI initialisent leur état/historique ou passent par des contrôles d'accès de la plateforme. La phase strictement en lecture seule est le script SQL ci-dessus, pas une promesse sur les effets internes du CLI.

## Répétition locale à effectuer quand Docker sera disponible

Après vérification de PostgreSQL 17 et de l'absence d'une stack locale existante à préserver :

```powershell
npx.cmd --yes supabase@2.122.0 start
if ($LASTEXITCODE -ne 0) { throw 'Stack locale incomplète : arrêt.' }
npx.cmd --yes supabase@2.122.0 migration list --local
psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres" -X --set ON_ERROR_STOP=1 --file supabase/checks/preflight.sql
psql "host=127.0.0.1 port=54322 dbname=postgres user=postgres" -X --set ON_ERROR_STOP=1 --file supabase/checks/postflight.sql
```

Un premier `start` initialise la base et applique les migrations locales : c'est une opération d'écriture **locale**, pas une pré-vérification d'une base vierge. Ne pas lancer la stack sur une machine partagée sans examiner les ports exposés par Docker. Si une stack existe déjà, examiner son état et son historique avant de lancer une application locale supplémentaire ; pas de reset automatique.

Sur un poste dédié et une stack expressément jetable, une répétition complète peut être effectuée ultérieurement avec `db reset --local --no-seed`, après confirmation de la perte des seules données locales. Cette commande n'a pas été exécutée ici. Aucun `--linked`/`--db-url` avec reset.

## Application distante : procédure préparée, pas exécutée

Cette étape demande une nouvelle autorisation pour **la cible identifiée** et un préflight approuvé. Garder la Data API et les inscriptions de cette cible fermées aux utilisateurs pendant toute l'initialisation ; la configuration locale ne ferme pas le cloud. Ne pas connecter l'application.

Vérifier d'abord le contenu et l'ordre des trois fichiers, sans les renommer :

1. `0001_init.sql` : schéma, RLS initiale, RPC, trigger Auth et buckets ;
2. `0002_rate_limiting.sql` : tables internes, `pg_cron`, deux jobs et RPC points initiale ;
3. `0003_security_boundaries.sql` : correctif de privilèges et RPC.

L'installation de `pg_cron` et la création des jobs de maintenance sont **des effets d'écriture** de 0002. Ils font partie de l'approbation requise. Chaque migration est appliquée dans son ordre par le CLI ; ne pas supposer que le lot entier est une transaction unique. 0003 est transactionnelle, mais un échec laisse potentiellement 0001/0002 déjà appliquées. Ne jamais ouvrir le backend entre ces étapes.

Pour le CLI, utiliser l'authentification interactive `login` (ou un coffre pour un jeton personnel), sans jeton dans la ligne de commande. Le mot de passe SQL du projet doit être fourni par l'invite sécurisée du CLI/coffre et non via `--password` dans l'historique du shell. Ne pas activer `--debug`. À exécuter seulement après accord :

```powershell
npx.cmd --yes supabase@2.122.0 login
# Renseigner uniquement la référence non secrète de la cible validée.
$devProjectRef = Read-Host 'Project ref DEV approuvé'
if ([string]::IsNullOrWhiteSpace($devProjectRef)) { throw 'Cible manquante.' }
npx.cmd --yes supabase@2.122.0 link --project-ref $devProjectRef
if ($LASTEXITCODE -ne 0) { throw 'Association à la cible échouée.' }
npx.cmd --yes supabase@2.122.0 migration list --linked
if ($LASTEXITCODE -ne 0) { throw 'Historique non vérifié.' }
npx.cmd --yes supabase@2.122.0 db push --linked --dry-run --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'Plan de migration non vérifié.' }
# ARRÊT : comparer projet, historique et plan à l'approbation.
# Sur cible neuve, le plan doit annoncer uniquement 0001, 0002 et 0003, dans cet ordre.
# Après revue explicite du plan, commande d'application :
npx.cmd --yes supabase@2.122.0 db push --linked --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'Application incomplète : maintenir la cible fermée et inspecter.' }
```

Les commandes après `ARRÊT` ne constituent pas un script à coller d'un seul bloc. La référence liée se trouve dans `supabase/.temp/` (ignoré). Vérifier son identité avant chaque commande liée ; aucune référence cloud n'est versionnée. `--skip-vault` évite une mise à jour de secrets Vault par `db push`. Pas de `--include-seed`, `--include-roles`, `--include-all`, réparation forcée ou reprise aveugle. Si 0001/0002 sont déjà correctement appliquées, le plan ne doit contenir que les migrations réellement manquantes ; un écart nécessite une revue, pas un reset.

## Contrôles après application

Depuis une nouvelle connexion SQL à la même cible DEV :

```powershell
psql "service=furrix-dev" -X --set ON_ERROR_STOP=1 --file supabase/checks/preflight.sql
if ($LASTEXITCODE -ne 0) { throw 'Inventaire après migration incomplet.' }
psql "service=furrix-dev" -X --set ON_ERROR_STOP=1 --file supabase/checks/postflight.sql
if ($LASTEXITCODE -ne 0) { throw 'Contrôles après migration en échec : ne pas ouvrir le backend.' }
npx.cmd --yes supabase@2.122.0 migration list --linked
```

Le postflight est lui aussi `READ ONLY`/`ROLLBACK`. Il échoue sur une permission sensible réouverte (y compris héritée), un accès interne/table/colonne/séquence client, des privilèges serveur nécessaires manquants, une RPC mal exposée, un search_path incorrect, une RLS absente, un trigger absent, des versions de migrations manquantes ou des jobs cron absents/non conformes. Il ne modifie pas les droits pour faire réussir un contrôle.

Pour `pg_cron`, vérifier **à la fois** l'extension installée, le preload et les deux jobs actifs dans la bonne base : `purge-rate-limits` à `15 3 * * *`, `daily-maintenance` à `0 4 * * *`. Le contrôle compare leurs commandes connues sans les afficher. Relever le propriétaire des jobs, le fuseau du scheduler et la timezone SQL du propriétaire ; les horaires ne doivent pas être interprétés automatiquement en Europe/Paris. Vérifier que le propriétaire a les droits de DELETE sur `rate_limit_events`, UPDATE sur `rewards_ledger` et qu'aucune erreur de connexion n'empêche le scheduler de fonctionner.

La présence des jobs n'est **pas** une preuve d'exécution. À l'échéance naturelle des jobs, examiner `cron.job_run_details` et les logs autorisés : statut succeeded et fin d'exécution. Le postflight affiche au plus dix métadonnées d'exécution, sans contenu de sortie. Si l'historique est absent/vide ou si `cron.log_run` est désactivé, indiquer « exécution cron non validée ». Ne pas changer les horaires ni appeler les commandes de maintenance pour accélérer la recette sans accord séparé. Un succès sans données ne prouve pas la logique de purge/streak.

Les catalogues ne remplacent pas les essais réels d'autorisation : prévoir ensuite, sur données fictives et cible DEV, deux comptes A/B plus un tiers et une identité serveur pour vérifier inscription → profil/registre, édition ordinaire, refus d'auto-promotion/Premium/vérification, swipe autorisé/refusé, isolation chat/points/abonnement et écritures serveur nécessaires. Les tests PGlite existants restent une preuve locale, pas une validation de JWT/PostgREST/Storage réels. Ces essais avec écritures ne font pas partie du préflight en lecture seule.

## Vérifications de cette préparation

Le CLI 2.122.0 a été exécuté pour sa version, son aide et un modèle `init` dans un dossier temporaire uniquement. `status --workdir .` accepte la configuration puis échoue avec `StatusDbInspectError` : Docker/Podman absent. Aucun conteneur n'a été lancé et `linked_project` est null. Les scripts d'inspection disposent d'un test isolé :

```powershell
npm.cmd ci --prefix supabase/tests --ignore-scripts --no-audit --no-fund
node --test supabase/tests/dev-inspection.test.mjs
```

Résultat local : **7 scénarios réussis**, soit **8 tests Node avec le parent**, aucun échec ni test ignoré. Ce test vérifie l'inspection d'une base vierge puis migrée, les contrôles d'ACL et d'historique, et le **refus explicite faute de pg_cron** dans PGlite. Son historique CLI et son catalogue de jobs sont des fixtures ; le prédicat de contrôle des jobs est testé sur ces seules métadonnées. Les instructions cron de 0002 sont retirées uniquement en mémoire : aucune réussite d'installation ou d'exécution de pg_cron n'est revendiquée. Les 17 tests du lot SQL ont été revérifiés par l'utilisateur avant cette préparation et leurs fichiers ne sont pas modifiés.

Non exécutés ici : connexion cible, préflight/postflight distants, application distante, démarrage Docker, migrations intégrales avec `pg_cron`, exécution de jobs, tests API/JWT réels. Les résultats complets et les éventuels blocages locaux sont à lire dans la livraison de la branche.

## Sources officielles consultées

- [Installer le CLI, Node et Docker](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Configuration locale](https://supabase.com/docs/guides/local-development/cli/config)
- [Commandes CLI et db push](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Installer Supabase Cron](https://supabase.com/docs/guides/cron/install)
- [Installateur PostgreSQL pour Windows](https://www.postgresql.org/download/windows/)
- [Installer Docker Desktop sur Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
