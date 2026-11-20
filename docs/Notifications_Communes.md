# Notifications communes — préparation bêta

Le centre `#/notifications`, ouvert par la cloche ou depuis Plus, rassemble les événements des parcours existants. Le point de non-lecture du header et la liste utilisent un seul chargement partagé. Les alertes animaux perdus restent dans leur table et leur parcours actuels ; elles sont réunies aux nouvelles notifications à la lecture, sans copie ni rediffusion.

## Événements couverts

- Rencontres : j’aime reçu, match réciproque, proposition de rencontre, acceptation, refus, retrait et annulation. Le match remplace le j’aime correspondant et retire son éventuel envoi encore en attente. Le j’aime n’expose pas l’identité de la personne : son lien ouvre Rencontres, sans débloquer une conversation avant le match.
- Messages : nouveaux messages de match et de garde, uniquement pour leur destinataire. L’envoi par la personne elle-même n’engendre pas sa propre notification.
- Garde : nouvelle demande, acceptation, refus, retrait, confirmation, annulation, expiration et nouvelles du journal. L’expiration informe les deux participants. Le paiement n’est pas ajouté : seuls les changements d’état réellement produits par le parcours existant sont observés. Les tests peuvent amorcer certains états avec des données de fixture administratives ; ce n’est pas une validation de paiement.
- Services : demande de rendez-vous, nouveau créneau proposé, confirmation par l’établissement ou acceptation par le propriétaire, refus, retrait et annulation. Une contre-proposition inchangée rejouée n’engendre rien de nouveau.
- Animaux perdus : alerte de secteur, observation sur son annonce et animal retrouvé, avec les destinataires et abonnements déjà définis.

Les blocages et signalements ne sont pas annoncés à l’autre personne. La fin d’un match masque les notifications qui renvoient vers ce match fermé. Aucun événement rétroactif n’est recréé lors de l’installation, aucune fausse alerte ou donnée de démonstration n’est insérée. Les e-mails d’authentification Brevo ne changent pas. Pas de campagne marketing ni de rappel programmé avant un rendez-vous dans ce lot.

## Centre et lecture

La liste est triée par date et identifiant décroissants, 50 éléments par page ; « Voir les notifications précédentes » utilise un curseur composé, pour ne pas perdre des événements ayant la même date. Une actualisation repart de la première page. Les événements inaccessibles sont exclus du compteur comme de la liste.

Afficher le centre ne marque rien comme lu. Chaque notification peut être marquée seule ; une action globale marque l’historique du compte comme lu. « Consulter » revérifie d’abord le destinataire et l’accès, puis marque la notification et ouvre une destination connue. Lire une notification n’atteste pas la lecture de tous les messages de sa conversation. Ouvrir une conversation autrement ne marque pas automatiquement ses notifications : le centre conserve son propre état de lecture.

Le chargement commun intervient à l’ouverture, toutes les 30 secondes lorsque l’application est visible, au retour de focus et après lecture ou réception native. Pas de seconde boucle dédiée aux animaux perdus dans le header. Une panne conserve les éléments et le point de non-lecture déjà connus, avec un avertissement dans le centre. Les états sont réinitialisés lorsque le compte change.

## Préférences et Android

Les préférences de catégories appartiennent au compte et s’appliquent à ses appareils Android activés. L’inscription et la permission système restent propres à chaque appareil. Le centre reste consultable lorsque les alertes mobiles sont désactivées.

Les nouvelles catégories **Rencontres, Messages, Garde et Services sont désactivées par défaut** pour les alertes externes. Chacun les active explicitement. Animaux perdus conserve son comportement existant par défaut, avec son abonnement de secteur distinct. Activer une catégorie ne rejoue pas l’historique. Désactiver une catégorie bloque aussi une livraison encore en attente ; une notification déjà acceptée par FCM ne peut pas être rappelée.

Une file et un seul worker Android prennent en charge les deux familles. Les nouveaux envois contiennent uniquement le titre Furrix, un texte générique et l’UUID de notification. Jamais de prénom, animal, lieu, date précise, texte de message, note professionnelle ou observation dans le contenu de l’écran verrouillé. Le contenu métier reste dans le parcours protégé de l’application. Les anciens liens animaux perdus restent compatibles.

Le serveur vérifie de nouveau le compte, la session Auth de l’appareil, le statut bêta, les préférences, la lecture et l’accès métier avant livraison. Il reprend les erreurs temporaires avec les limites existantes. La livraison reste au moins une fois : le tag Android stable remplace une répétition après une panne du worker. La réception réelle dépend du réseau, du système et des restrictions d’énergie.

Le centre fonctionne sur web, Android et dans le code partagé iOS. **Les alertes externes ne sont raccordées qu’à Android.** APNs/iPhone et Web Push restent distincts et ne sont pas présentés comme actifs. Le code Android passe en 1.0.3 (code 4) pour comprendre les nouveaux liens.

## Confidentialité et autorisations

`app_notifications` et `notification_preferences` sont privées : RLS activée, aucun accès direct client. Les fonctions exposées exigent un compte bêta actif et accepté, filtrent toujours sur l’identité connectée, et fixent leur `search_path`. Les producteurs sont des fonctions de déclencheur non exécutables par les clients ; leurs écritures font partie de la transaction métier. Une transaction annulée ne laisse donc pas d’événement. Les identifiants de source et contraintes d’unicité dédupliquent les reprises.

Un tiers ne peut ni lire ni marquer la notification d’un autre compte. Les blocages, fermetures de match, révocations et suppressions de cible sont revérifiés lors des listes et de la préparation des livraisons. Les nouvelles notifications ne recopient aucun contenu libre. Le centre expose seulement les identifiants nécessaires à une destination autorisée. Aucun lien libre venu d’un push n’est ouvert : seuls des types connus et des UUID sont acceptés, puis la notification est récupérée avec l’identité de session courante.

## Activation à autoriser après revue

**Rien n’est appliqué ni déployé sur DEV pendant la préparation de ce lot.**

1. Fusionner la branche après revue et prévoir l’installation de la nouvelle APK sur les téléphones testeurs. Une ancienne APK ne sait pas ouvrir les nouveaux liens.
2. Déployer la version compatible du worker `android-push-worker` avant d’activer les nouveaux événements. Elle continue de gérer les anciens envois. Aucun nouveau secret Firebase ou Vault n’est nécessaire.
3. Appliquer `20261120100904_unified_notifications.sql`, après les rendez-vous Services et les migrations Android existantes. Elle ajoute les tables, déclencheurs, fonctions, et la référence optionnelle dans la file Android. Elle ne crée aucun événement historique ni nouveau minuteur.
4. Vérifier les droits, le centre, les catégories et la file, sans envoi d’essai non convenu. Programmer ensuite la recette collective avec les testeurs.

Retour arrière : arrêter temporairement le minuteur Android existant, utiliser `supabase/operations/rollback_unified_notifications.sql`, puis restaurer la version voulue du worker et relancer le minuteur. Le script efface uniquement le nouvel historique et ses préférences, supprime les nouveaux travaux, restaure les deux fonctions de file d’origine et conserve comptes, animaux, messages, rendez-vous, données de garde et alertes animaux perdus. Sauvegarder le nouvel historique avant tout retour arrière en usage réel. Retirer ce lot avant de retirer une des tables métier dont ses déclencheurs dépendent.

## Vérifications

Les tests SQL couvrent destinataires, reprises, projections sans contenu privé, préférences isolées, lecture seule ou globale, pagination, choix Android explicite, lecture/préférence/session invalidant une livraison, blocage et révocation, transaction annulée, retour arrière puis réapplication. PostgreSQL local vérifie également qu’un même message rejoué simultanément produit un seul événement et une seule livraison par appareil, en observant l’attente de verrou de la seconde transaction.

Les tests d’interface couvrent liens malformés, chargement commun, absence de lecture à l’affichage, double clic, cible devenue inaccessible, panne de chargement, préférence attendant le serveur et changement de compte. Les tests natifs simulés vérifient l’ouverture après récupération autorisée de la notification, et le worker est testé sans appel Google réel. Contrôle navigateur local avec client simulé à 390 et 1 280 px : marquage individuel/global et préférence, un titre principal, aucun débordement ni erreur JS, actions d’au moins 44 px.

Restent la recette Auth/REST/worker sur DEV, la réception réelle sur Honor app ouverte/fermée, l’appui sur chaque type, les permissions refusées, la révocation de session et les catégories désactivées. Aucun envoi réel n’a été fait pendant les tests locaux.

Résultats exécutés le 20 novembre 2026 : contrôle des types et compilation web OK ; Vitest 231/231 ; SQL PGlite 132/132 ; PostgreSQL local 18.6, 14 scénarios de concurrence réussis (15 tests avec le parent) ; configuration mobile 3/3 ; contrôle Deno 2.9.6 du worker OK ; compilation Android réussie. Le contrôle navigateur est effectué avec un client simulé, pas avec des comptes réels.

APK de recette préparée : `Furrix-beta-1.0.3.apk`, package `fr.furrix.app`, code 4. Son SHA-256 est `cc3a9dab36ffb50e466e6681eb79538cee5782885ea0eae20aaf155f33f653a1`. Signature vérifiée avec le certificat historique SHA-256 `4f06e7824bc5405cccfa9f612420a30574d427b98b29a7189bc2aa70ab455e17`, compatible avec l’APK 1.0.2 distribuée auparavant. Le fichier final a été signé avec la clé de test locale historique, ignorée par Git : ne pas distribuer aveuglément la sortie Gradle utilisant la clé debug par défaut d’un autre poste. Aucun secret ni APK n’est versionné. Pas d’installation sur téléphone pendant ces contrôles, ni compilation iOS sur Windows.

Références : [données et notifications FCM](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type), [plugin Capacitor 8](https://capacitorjs.com/docs/apis/push-notifications).
