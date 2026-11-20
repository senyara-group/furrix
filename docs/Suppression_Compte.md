# Suppression personnelle du compte

Ce lot prépare le parcours web/Android/iOS. Il ne déploie aucune fonction, n'applique aucune migration distante et ne supprime aucun compte réel.

## Parcours

Depuis « Mon compte », une page explique les conséquences, vérifie les activités et exige la saisie du mot de passe actuel, de `SUPPRIMER` et une confirmation. Le serveur retrouve l'identité par `auth.getUser(jwt)`, vérifie le mot de passe via un client Auth isolé puis compare l'identité au compte affiché. Le client ne choisit jamais une cible arbitraire. La session de vérification est refermée, sans remplacer celle de l'application.

La suppression reste accessible depuis l'écran de bêta refusée ou en attente : une expiration d'accès ne doit pas empêcher de demander l'effacement. Un second facteur déjà activé bloque ce parcours avec une indication de contacter l'équipe ; il n'est jamais contourné par le seul mot de passe. La prise en charge autonome du MFA et de la connexion sans mot de passe reste à ajouter avant d'ouvrir ces modes.

Les propositions en attente et rencontres futures, gardes et rendez-vous encore actifs (aussi comme gardien/professionnel), alertes perdues, abonnements facturables et dossiers ouverts doivent d'abord être traités. Un abonnement doit être résilié dans sa boutique ; ce parcours ne prétend pas le résilier. La clôture d'un dossier est une démarche avec l'équipe, pas une suppression automatique de signalement.

Une fois la demande acceptée : la bêta est désactivée, les appareils push et leurs files sont retirés, les préférences supprimées et la session locale est fermée. La RLS restrictive ferme les lectures et écritures des anciens JWT sur les tables publiques protégées, même avant leur expiration. Les fonctions existantes restent derrière les contrôles d'accès bêta. Les insertions prennent le verrou partagé des profils impliqués ; l'acceptation prend leur verrou exclusif. Les mises à jour vérifient l'état sans inverser l'ordre des verrous des anciennes fonctions.

L'écran confirme uniquement « demande enregistrée ». La finalisation n'est pas annoncée tant que le nettoyage, Storage et Auth n'ont pas abouti. La préférence locale de premiers pas et le choix d'animal actif du compte sont retirés. Aucun mot de passe n'est enregistré dans un fichier, journal ou stockage du navigateur.

## Données effacées et historique

Les champs personnels du profil, ceux des animaux (santé comprise), photos référencées, localisations, coordonnées du gardien/professionnel, présentations, publications, préférences, notifications, traces de limitation liées au compte et consentements sont effacés ou neutralisés. Les anciennes annonces perdues, observations et notifications liées sont retirées. Les textes des conversations impliquant ce compte sont effacés pour les deux participants ; ceux des gardes sont remplacés par un libellé neutre. Les matchs sont fermés et leurs propositions retirées.

L'historique des gardes et des rendez-vous conserve dates, statuts, catégories et montants sous « Compte supprimé », avec un animal neutralisé si c'était celui du compte supprimé. Les animaux appartenant à d'autres personnes ne sont pas effacés. Les profils techniques gardien/professionnel sont neutralisés et inactifs pour ne pas casser les liens des réservations passées.

Auth est supprimé par `auth.admin.deleteUser(id, true)`, uniquement côté serveur : c'est le soft-delete irréversible de Supabase, qui neutralise l'identité et révoque les sessions tout en conservant la ligne référencée par les historiques. Un identifiant technique et le suivi minimal de la suppression restent donc présents. Il s'agit d'une pseudonymisation de l'historique, pas d'une promesse d'anonymat absolu. Les sauvegardes et journaux gérés par les fournisseurs suivent leur propre cycle ; ce lot ne prétend pas les effacer immédiatement. Les fichiers déjà téléchargés par un autre appareil ne peuvent pas être rappelés.

Les objets Storage sont listés par propriétaire ou préfixe UUID, dans tous les buckets, objets orphelins compris. Le worker utilise uniquement l'API Storage pour effacer les octets ; aucun DELETE SQL sur `storage.objects` en production.

## Reprise et déploiement à autoriser

La demande est unique par compte et rejouable. Un worker traite un compte à la fois, sous bail de cinq minutes avec nonce. Il nettoie les données dans une transaction, efface au plus cinq lots de 100 fichiers par invocation, puis supprime l'identité Auth. Une panne laisse le travail à reprendre après cinq minutes. Un ancien bail ne peut pas finaliser un autre essai. La base refuse aussi un succès s'il reste des fichiers, si le nettoyage n'a pas abouti ou si Auth n'a pas de `deleted_at`.

Ordre de mise en service, après revue et accord explicite :

1. Appliquer `20261120143524_account_deletion.sql`, après le retrait animal.
2. Déployer `account-deletion-worker` avec un nouveau secret serveur d'au moins 32 caractères, dans `FURRIX_ACCOUNT_DELETION_WORKER_SECRET` et Vault `furrix_account_deletion_worker`.
3. Installer le minuteur avec `supabase/operations/enable_account_deletion_scheduler.sql`. Tester son appel à vide et surveiller ses erreurs. Ne pas lancer une suppression réelle pour ce contrôle.
4. Déployer `account-deletion` (JWT requis). Garder `FURRIX_ACCOUNT_DELETION_ENABLED` absent/false tant que le worker et son minuteur ne sont pas contrôlés ; activer à true ensuite.
5. Recetter avec des comptes fictifs dédiés, des photos réelles de test et plusieurs appareils ; vérifier les anciens jetons, les historiques de l'autre participant et la reconnexion refusée.

Surveiller les demandes non terminées, `attempts`, `retry_at` et l'état du minuteur. Ne jamais journaliser les mots de passe, les jetons ni les corps des requêtes.

Retour arrière de schéma : `supabase/operations/rollback_account_deletion.sql`, seulement si aucune demande n'existe. Dès qu'une demande est enregistrée, désactiver les nouvelles demandes si nécessaire mais laisser aboutir les nettoyages ; les effacements réalisés ne se restaurent pas automatiquement.

## Validation

Contrôles exécutés localement : types TypeScript, compilation Vite, 262 tests Vitest (dont 13 nouveaux pour l'interface et les handlers), 152 tests SQL PGlite (dont dix résultats du nouveau lot, avec retour arrière avant demande puis refus après demande), 25 scénarios de concurrence PostgreSQL 18.6 (26 résultats avec le parent), contrôle Deno des deux fonctions Edge. Vérification navigateur des composants réels avec client simulé à 390 et 1280 px : ouverture depuis Mon compte, blocage, confirmation et déconnexion après accusé serveur ; un titre principal, pas de débordement horizontal ni erreur JS, boutons/champs d'au moins 44 px. Le support temporaire a été supprimé.

Les tests SQL utilisent une base jetable. Auth et Storage réels, les minuteurs et les appareils doivent être vérifiés sur DEV après autorisation. Les tests des handlers simulent les réponses des API et couvrent les refus, échecs et reprises ; ils ne constituent pas une recette des services réels.
