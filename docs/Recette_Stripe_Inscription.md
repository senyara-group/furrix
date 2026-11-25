# Recette de l'inscription Stripe des gardiens — sandbox Furrix DEV

Préparé le 25 novembre 2026 depuis `main` (`19ab1f2`, PR #52 fusionnée). Rien n'a été appliqué, déployé ni activé. Checkout, paiements et commission restent hors périmètre : aucune valeur de commission n'est utilisée.

## 1. État constaté (lecture seule)

### Supabase — projet `furrix`, ref `jemikzqgbpaivlujnfgl`

Constaté via le connecteur Supabase, sans écriture.

- PostgreSQL 17.11, état `ACTIVE_HEALTHY`.
- 30 migrations enregistrées, la dernière étant `20261125090833_sitter_availability`.
- **Non appliquées** :
  - `20261125105925_sitter_stripe_onboarding` (ce lot ; appliquée depuis sur DEV sous `20261125135930`, fichier renommé) ;
  - `20261125120000_professional_messages` (autre lot, sans lien : elle ne touche ni `account_deletion_blockers` ni les tables Stripe).
- **Écart d'historique antérieur** : `unified_notifications` est enregistrée en `20261120103721` sur DEV, mais le fichier local porte `20261120100904`. Le contenu est identique : même MD5 après retrait des blancs et points-virgules (`6bbbd7ad…`). Même contrôle concordant pour `account_deletion` et `sitter_availability`.
  - **Conséquence : ne pas utiliser `supabase db push`.** Il tenterait de rejouer `unified_notifications`.
  - Le renommage du fichier relève d'un lot d'alignement séparé ; aucune migration appliquée n'est modifiée ici.
- **Prérequis SQL présents** : `require_sitting_beta()`, `account_deletion_pending(uuid)`, `account_deletion_blockers_for(uuid)`, `account_deletion_blockers()`, `sitter_profiles` (3 lignes), `account_deletions`.
- **Absents, comme attendu** : `sitter_stripe_accounts`, `prepare_sitter_stripe_onboarding`, le déclencheur `stripe_account_deletion`.
- **Fonctions Edge déployées** : `account-deletion` v2, `account-deletion-worker` v2, `android-push-worker` v4. **`sitter-stripe-onboarding` n'est pas déployée.**
- La fonction `account-deletion` déployée lit déjà `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`, fournis par la plateforme. La nouvelle fonction utilise les mêmes.

### Stripe — documentation officielle consultée le 25 novembre

Aucun appel à l'API Stripe n'a été fait, et le compte n'a pas été consulté : pas d'accès depuis cet environnement.

| Point | Constat | Effet sur le code actuel |
|---|---|---|
| Version d'API | La page de versionnage annonce `2026-11-18.endive` comme version courante. Les guides montrent aussi `.preview`, sans opt-in documenté. | Conforme (`endive`). |
| Paiement par carte | `configuration.merchant.capabilities.card_payments.requested` est valide. | Conforme. |
| Versements | `stripe_balance.payouts` n'est pas demandable : il est appliqué avec la configuration marchand et ne peut pas être retiré. | Conforme : seule la carte est demandée ; `ready` exige `card_payments` **et** `stripe_balance.payouts` à `active`. |
| **Tableau de bord Express + responsabilités Stripe** | Erreur `account_controller_express_dash_without_application_losses_or_fees` : avec `dashboard: express`, `fees_collector` **et** `losses_collector` doivent valoir `application`. | Corrigé : option A retenue (§ 2), création en `full` avec `stripe`/`stripe`. |
| Plateforme en France | Erreur documentée `account_token_required` pour les plateformes de pays « mandatés » (exemple : France). | À vérifier en recette : la création n'envoie que le pays. Si Stripe exige un jeton de compte, il faudra Stripe.js et une clé publiable, donc un changement d'architecture. |
| Accès Accounts v2 | Erreur `accounts_v2_access_blocked` si Accounts v2 n'est pas activé pour la plateforme. | Prérequis manuel. |
| Lien d'inscription v2 | Champs requis : `account`, `use_case.type`, `use_case.account_onboarding.refresh_url`. `collection_options.fields: eventually_due` est valide. `configurations` apparaît dans la réponse, mais n'a pas été trouvé dans les paramètres de requête. | À vérifier en recette : si Stripe refuse `configurations`, le retirer de `stripe.ts`. |
| Durée du lien | À usage unique. Il expire « quelques minutes » après sa création ; l'exemple montre 10 minutes. | Couvert par le scénario R4. |

Sources :
- [versionnage](https://docs.stripe.com/api/versioning)
- [création de compte v2](https://docs.stripe.com/api/v2/core/accounts/create)
- [lien d'inscription v2](https://docs.stripe.com/api/v2/core/account-links/create)
- [inscription hébergée v2](https://docs.stripe.com/connect/hosted-onboarding?accounts-namespace=v2)
- [configuration des comptes connectés](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration)
- [capacités v2](https://docs.stripe.com/connect/account-capabilities?accounts-namespace=v2)

## 2. Décision : option A (25 novembre 2026)

Le choix « tableau de bord Express » et le choix « frais prélevés par Stripe au gardien, soldes négatifs attribués à Stripe » (Paiements_Garde.md) sont incompatibles. Le type de tableau de bord et les responsabilités sont **définitifs** pour un compte créé : il faut trancher avant de créer le moindre compte de test.

| Option | `dashboard` | `fees_collector` / `losses_collector` | Conséquences |
|---|---|---|---|
| A | `full` | `stripe` / `stripe` | Tableau de bord complet. Stripe prélève ses frais au gardien et répond des soldes négatifs de son compte, sous réserve de ses exigences de risque géré. C'est la combinaison de l'exemple officiel d'inscription hébergée. |
| B | `express` | `application` / `application` | Tableau de bord Express. Les frais Stripe sont facturés à Furrix, qui répond des soldes négatifs et des litiges non recouvrés. Il faut alors décider qui supporte ces frais, ce qui interagit avec la commission encore à définir. |

**Option A retenue : tableau de bord complet, frais Stripe prélevés au gardien et responsabilité des soldes négatifs de son compte attribuée à Stripe.** `stripe.ts` crée désormais les comptes avec `dashboard: full`, `fees_collector: stripe` et `losses_collector: stripe` ; le test de l'adaptateur le fige. Aucun compte n'ayant encore été créé, la clé d'idempotence existante ne peut pas entrer en conflit avec l'ancien corps de requête. Aucune migration n’est modifiée.

## 3. Prérequis manuels (titulaire du compte Stripe Furrix DEV)

À faire dans le sandbox `acct_1UfdgzLRlPFxqD3K` uniquement, jamais sur le compte de production SENYARA :

1. Valider le questionnaire Connect s'il ne l'est pas, et vérifier que Accounts v2 est accessible.
2. Dans les options d'inscription hébergée, régler le pays France, la langue française, l'image de marque Furrix et les capacités par défaut.
3. Créer une clé secrète **sandbox** dédiée, au format `sk_test_…`. L'adaptateur refuse tout autre préfixe, y compris les clés restreintes `rk_test_`. Ne jamais la coller dans le chat, Git ou une variable `VITE_`.
4. Vérifier que `https://furrix.fr/#/garde?vue=profil` (URL de retour et de renouvellement, figée côté serveur) affiche bien l'application. Sinon, le retour de Stripe mène ailleurs et le gardien doit revenir manuellement.

## 4. Activation distante proposée (non exécutée, sur validation)

Ordre strict, sans `db push` :

1. **Migration** : appliquer **uniquement** `supabase/migrations/20261125135930_sitter_stripe_onboarding.sql` (ex-`20261125105925`), inchangée. Passer par l'outil `apply_migration` du connecteur avec le nom `sitter_stripe_onboarding`, ou par `psql` sur le service privé `furrix-dev`.
   - Vérifier ensuite que l'historique contient la nouvelle version.
   - Exécuter `supabase/checks/sitter-stripe-onboarding-postflight.sql`, en lecture seule : il doit renvoyer `liaisons = 0`.
2. **Secrets de la fonction** :
   - `STRIPE_FURRIX_TEST_SECRET_KEY` = clé sandbox `sk_test_…`, saisie par le titulaire dans le tableau de bord Supabase (Edge Functions → Secrets) ;
   - `FURRIX_STRIPE_ONBOARDING_ENABLED` **non défini** au premier déploiement.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par la plateforme : rien à ajouter.
3. **Déploiement** de `sitter-stripe-onboarding` (`index.ts`, `core.ts`, `stripe.ts`) avec `verify_jwt = true`. Un appel authentifié doit alors répondre `503 {"status":"unavailable"}`, et la carte « Versements » affiche « pas encore disponible ».
4. **Ouverture de la fenêtre de recette** : `FURRIX_STRIPE_ONBOARDING_ENABLED=true`. La remettre à `false` (ou la supprimer) à la fin de la recette.

**Retour arrière** :
- désactiver d'abord la variable ;
- `supabase/operations/rollback_sitter_stripe_onboarding.sql` refuse de supprimer une liaison existante. Après la création d'un compte de test, la table reste donc en place jusqu'à la clôture de ce compte.

## 5. Scénarios de recette (données fictives uniquement)

Pour la recette :
- utiliser des comptes Furrix de test dédiés : bêta acceptée, profil de gardien publié ;
- utiliser exclusivement les [valeurs de test Connect documentées par Stripe](https://docs.stripe.com/connect/testing) : identité, téléphone, code SMS, adresse et IBAN de test. Aucune donnée réelle.

Une liaison bloque ensuite la suppression du compte Furrix de test : c'est voulu.

| # | Scénario | Attendu côté Furrix | Contrôle |
|---|---|---|---|
| R1 | Création : « Commencer l'inscription Stripe » | Stripe s'ouvre. Une liaison est créée, avec `stripe_account_id` renseigné. | Postflight : `liaisons = 1`, `comptes_relies = 1`. Dans le sandbox : un seul compte, mode test, pays FR, configuration marchand, tableau de bord complet, `fees_collector: stripe` (frais prélevés au gardien) et `losses_collector: stripe` (soldes négatifs attribués à Stripe). |
| R2 | Reprise sans doublon : fermer Stripe, puis « Reprendre » ; double clic ; second appareil pendant la préparation | Même compte Stripe. Le second appel reçoit « Préparation déjà en cours ». | Après plusieurs reprises, `stripe_account_id` est inchangé et le sandbox contient toujours un seul compte pour ce gardien. |
| R3 | Inscription interrompue : quitter au milieu | Retour : « Inscription pas encore terminée », badge « À compléter ». | `GET /v2/core/accounts/{id}?include[0]=configuration.merchant` montre `card_payments` différent de `active`. |
| R4 | Lien expiré ou déjà utilisé : rouvrir un lien après expiration ou une seconde fois | Stripe redirige vers `refresh_url` (profil). Aucun lien n'est recréé automatiquement ; « Reprendre » en prépare un nouveau. Un nouvel essai dans les 30 secondes affiche « Préparation déjà en cours ». | Aucun nouveau compte. `last_link_at` est mis à jour seulement après un clic. |
| R5 | Statut relu depuis Stripe : compléter avec les données de test, puis « Actualiser » | « Vérification en cours », puis « Complète » quand Stripe active la carte et les versements. | La carte « Versements » correspond aux statuts `card_payments` et `stripe_balance.payouts` du compte, lus dans le sandbox. |
| R6 | Interrupteur : remettre la variable à `false` | « Inscription aux versements pas encore disponible ». Aucun appel Stripe. | Réponse 503. |
| R7 | Suppression du compte Furrix de test | Blocage « Compte de paiement à clôturer avec l'équipe ». | `account_deletion_blockers()` renvoie la section `paiement`. |

À consigner pour chaque scénario :
- la date ;
- la plateforme (web, Android, iOS) ;
- le résultat observé ;
- l'identifiant `acct_…` de test, qui n'est pas un secret mais reste confiné au sandbox ;
- les éventuels codes d'erreur Stripe, **sans** URL de lien ni clé.

La création d'une liaison il y a plus de 23 heures sans compte confirmé produit « Vérification nécessaire par l'équipe Furrix ». Ce cas se rapproche manuellement dans le tableau de bord du sandbox et ne fait pas partie des scénarios automatiques.

## 6. Vérifications exécutées pour cette préparation

- Lecture seule Supabase : projets, historique de migrations, fonctions Edge, contenu de `account-deletion`, présence des objets prérequis, empreintes des migrations récentes.
- Documentation Stripe : tableau du § 1.
- Nouveau contrôle `sitter-stripe-onboarding-postflight.sql`, testé sur PGlite (`supabase/tests/sitter-stripe-postflight.test.mjs`) :
  - accepte la migration versionnée ;
  - détecte une lecture client ouverte, une RPC serveur exposée et une migration absente ;
  - accepte la réapplication.
- Non exécutés :
  - appel à l'API Stripe ;
  - lecture du compte Stripe ;
  - écriture Supabase ;
  - essai sur appareil.

## 7. Activation réalisée (25 novembre 2026)

- **Migration :** appliquée seule, sans `db push`, sous la version `20261125135930`. Le fichier local a été renommé en conséquence (PR #54).
- **Contrôle postflight :** sans exception, `liaisons = 0`.
- **Fonction :** `sitter-stripe-onboarding` déployée avec `verify_jwt: true`. Le code relu après déploiement est identique à `main`.
- **Appels sans authentification :** 401 (sans en-tête, jeton invalide, GET).
- **Contrôle « fonction indisponible » :** fait avec un gardien bêta de test au profil publié (données fictives) et l'interrupteur absent.
  - La carte affiche « Inscription aux versements pas encore disponible ».
  - `POST {"action":"status"}` renvoie `503 {"status":"unavailable"}`, avec `Cache-Control: no-store`.
  - `liaisons = 0`.
  - Ce contrôle a révélé un blocage de la carte sous `React.StrictMode`, corrigé dans la PR #55.
- **Clé sandbox :** saisie par le titulaire dans les secrets Supabase. Sa valeur n'a jamais transité ici.
  - Indice indirect : toutes les fonctions ont pris une version de plus, avec une empreinte de code (`ezbr_sha256`) inchangée.
  - Sa validité ne peut être prouvée qu'à la première action « start », pendant la fenêtre.

## 8. Fenêtre de recette (préparée, non ouverte)

### État vérifié avant ouverture (lecture seule)

- Dernière migration : `20261125135930`. `liaisons = 0`. Quatre profils de gardien, tous avec un accès bêta actif.
- `sitter-stripe-onboarding` : version 2 (redémarrage dû aux secrets), `verify_jwt: true`, code identique à `main`.
  - Sans authentification : 401.
  - Avec la session du gardien de test : `503 {"status":"unavailable"}`, l'interrupteur est donc coupé.
- `https://furrix.fr` sert l'application compilée pour Furrix DEV : son code référence `jemikzqgbpaivlujnfgl` et contient l'appel `sitter-stripe-onboarding`. C'est aussi l'URL de retour et de renouvellement configurée côté serveur.

### Plateforme de la fenêtre

- **Web, sur `https://furrix.fr`** : c'est la seule configuration où le retour de Stripe ramène dans la même session. Le serveur local `localhost:5173` reste utilisable pour observer, mais le retour de Stripe y ouvre `furrix.fr`, qui demande une connexion séparée.
- **Android et iOS** : hors de cette fenêtre. Ils demandent une version de recette pointant sur DEV et un essai sur appareil, prévus dans une fenêtre distincte.

### Prérequis Stripe à confirmer par le titulaire avant l'ouverture

Dans le sandbox `acct_1UfdgzLRlPFxqD3K` uniquement :

1. Questionnaire Connect validé et accès à Accounts v2.
2. Options d'inscription hébergée : France, français, marque Furrix.
3. Savoir ouvrir **Développeurs → Journaux** (ou Workbench). La fonction ne journalise volontairement ni réponse ni erreur Stripe. Un échec n'est visible côté Furrix que sous la forme générique « pas encore disponible » ; son code exact se lit dans ces journaux.

### Ouverture (par le titulaire, après accord)

1. Dans Supabase, projet `furrix`, Edge Functions → Secrets : ajouter `FURRIX_STRIPE_ONBOARDING_ENABLED` = `true`.
2. Contrôle immédiat (sans appel à Stripe) : avec la session du gardien de test, `POST {"action":"status"}` doit renvoyer `200 {"status":"not_started"}`. Sans compte relié, le serveur répond avant toute lecture chez Stripe.

### Déroulé et critères d'arrêt

Contrôles côté base, en lecture seule, après chaque étape :

```sql
select count(*) as liaisons, count(stripe_account_id) as comptes_relies,
       count(*) filter (where stripe_account_id is null) as sans_compte,
       count(*) filter (where lease_until > clock_timestamp()) as baux_actifs,
       max(last_link_at) as dernier_lien
from public.sitter_stripe_accounts;
```

| Étape | Action | Attendu | Arrêt si |
|---|---|---|---|
| E1 (clé et plateforme) | « Commencer l'inscription Stripe » | `GET /v1/account` réussit dans les journaux Stripe, puis la création du compte et du lien. | 503 avec `liaisons = 0` : clé invalide ou mauvais sandbox, car `verifyPlatform` passe avant toute réservation. Fermer la fenêtre et vérifier la clé. |
| E2 (création) | Suite de E1 | `POST /v2/core/accounts` réussit (compte test, `dashboard: full`, FR). `comptes_relies = 1`. | 503 avec `sans_compte = 1`. Lire le code Stripe (`account_token_required`, `accounts_v2_access_blocked`, etc.) et fermer la fenêtre. Un nouvel essai réutilise la même clé d'idempotence. Au-delà de 23 h sans compte relié, la liaison passe en rapprochement manuel. |
| E3 (lien) | Suite de E2 | `POST /v2/core/account_links` réussit et Stripe s'ouvre. | 503 avec `comptes_relies = 1`. Si Stripe refuse `configurations`, corriger `stripe.ts`, puis redéployer après un nouvel accord. |
| R2 à R7 | Scénarios du § 5 | Voir § 5. | Tout doublon de compte dans le sandbox pour un même gardien. |

Règles pendant la fenêtre :
- données de test Stripe uniquement ;
- aucun lien, aucune clé ni capture contenant une URL `connect.stripe.com` dans le chat, Git ou les tickets ;
- noter l'identifiant `acct_…` de test et les codes d'erreur.

### Fermeture

1. Remettre `FURRIX_STRIPE_ONBOARDING_ENABLED` à `false`, ou le supprimer.
2. Contrôle : la session du gardien de test doit recevoir `503 {"status":"unavailable"}`.
3. Décider de garder ou de supprimer `STRIPE_FURRIX_TEST_SECRET_KEY`. Le plus prudent entre deux fenêtres : la supprimer, ou la révoquer dans Stripe.
4. Conserver les liaisons et les comptes de test. Ne pas exécuter `rollback_sitter_stripe_onboarding.sql`, qui refuse de toute façon de supprimer une liaison. Les comptes Furrix de test liés restent bloqués à la suppression : c'est voulu.
5. Consigner les résultats dans le journal ci-dessous.

### Journal de recette

| Date / heure | Étape | Plateforme | Résultat | `acct_…` de test | Code Stripe éventuel |
|---|---|---|---|---|---|
| | | | | | |
