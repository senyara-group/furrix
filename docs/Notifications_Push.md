# Notifications Android — Firebase et Supabase

Le prolongement à tous les parcours existants et au centre commun est décrit dans [Notifications_Communes.md](Notifications_Communes.md). Ce document conserve la procédure et les résultats du premier lot animaux perdus.

État : raccordement activé sur DEV le 19 novembre 2026, après accord explicite. Projet Firebase `furrix-8dd6e`, application `fr.furrix.app`. Pas d’authentification Firebase, Firestore ni campagne marketing dans ce parcours.

## Application

Le plugin Capacitor Push Notifications 8.1.3 est figé. L’APK de test 1.0.2 (code 3) utilise le fichier local ignoré `android/app/google-services.json`. La compilation refuse une configuration d’un autre projet ou package. Chaque poste de compilation doit fournir ce fichier.

Dans Mon compte, l’activation Android demande explicitement la permission système. Le secteur et cette permission restent deux réglages distincts. Un refus conserve les alertes internes. L’état actif attend la confirmation de l’enregistrement serveur. Le jeton FCM n’est ni journalisé ni conservé dans le stockage web. L’identifiant d’installation est dans le coffre natif. À la déconnexion, retrait du téléphone puis fermeture de session ; le serveur contrôle aussi la validité de cette session avant chaque envoi.

Une notification reçue au premier plan actualise les alertes internes. En arrière-plan, Android affiche un texte générique. Un appui ne fournit que deux UUID ; l’application vérifie que la notification appartient au compte connecté avant d’ouvrir l’alerte. Aucun lien arbitraire reçu n’est ouvert.

## Serveur activé sur DEV

1. Appliquer `20261119150613_android_push_delivery.sql` après les migrations déjà présentes. Elle ajoute deux tables privées, les RPC d’inscription/retrait et une file alimentée seulement par les nouvelles notifications internes. Aucun envoi rétroactif à l’activation.
2. Conserver le compte de service JSON uniquement dans le secret Edge `FIREBASE_SERVICE_ACCOUNT_JSON`. Aucune clé privée dans Git, Vite, les fichiers publics ou l’APK.
3. Générer un secret aléatoire d’au moins 32 caractères pour `FURRIX_PUSH_WORKER_SECRET` et conserver la même valeur dans Vault sous le nom `furrix_android_push_worker`. Ne pas copier ces valeurs dans des commandes publiées, des journaux ou des conversations.
4. Déployer uniquement `android-push-worker`. `verify_jwt=false` est intentionnel pour cet appel serveur : le worker impose son propre secret dans `x-furrix-worker-key` (comparaison des empreintes), refuse les autres méthodes et ne lit aucun destinataire dans le corps de la requête. Les RPC de livraison sont réservées à `service_role`.
5. La migration `20261119150800_android_push_scheduler.sql` applique le contenu de `supabase/operations/enable_android_push_cron.sql` : activation de pg_net et minuteur pg_cron chaque minute. Sans secret Vault correspondant, le minuteur n’appelle rien. Le SQL cible exclusivement le projet DEV `jemikzqgbpaivlujnfgl`.

Les deux tables ont RLS activée et aucun droit client direct. L’appareil est lié au compte, à une session Auth existante et à une inscription bêta active. Avant livraison, le serveur revérifie la session, les droits bêta, la lecture de la notification, le statut de l’alerte et l’abonnement requis. Le contrôle est refait au moment de lire la livraison, après réclamation du lot.

La file utilise des lots de dix, un bail de cinq minutes, SKIP LOCKED et huit tentatives maximum avec attente progressive. Un jeton désinscrit est retiré seulement s’il n’a pas déjà été remplacé. Livraison au moins une fois : un arrêt après acceptation par FCM mais avant acquittement SQL peut entraîner une répétition ; le même tag Android remplace la notification existante. Une notification déjà partie ne peut pas être rappelée. Le délai dépend du minuteur, de FCM, du réseau et des restrictions d’énergie du téléphone.

## Arrêt et retour arrière

Arrêter d’abord le minuteur avec `select cron.unschedule('furrix-android-push');`. Le script `supabase/operations/rollback_android_push.sql` retire uniquement les objets de ce lot et efface appareils/file ; il conserve comptes, animaux, alertes et notifications internes. Retirer ensuite le worker et ses secrets si le raccordement est abandonné. Ne pas supprimer pg_net si un autre service l’utilise.

## Vérifications et limites

Tests automatisés : permissions refusées, inscription confirmée par le serveur, changement de compte, désactivation croisant une inscription, destinataires, sessions, RLS, lecture, révocation, reprise, rotation de jeton et retour arrière. OAuth et FCM sont simulés avec une clé éphémère de test ; aucun appel Google d’envoi n’a lieu. Un test sur PostgreSQL local vérifie deux réclamations concurrentes de lots distincts.

La compilation Android et la synchronisation des ressources iOS sont possibles sur Windows. Pas de compilation iOS ni d’APNs dans ce lot : le plugin iOS renvoie un jeton APNs qui ne doit jamais être enregistré comme FCM Android. Le bouton d’activation est réservé à Android.

Après activation serveur et installation de l’APK : tester sur Honor permission refusée puis autorisée, app ouverte et fermée, appui sur l’alerte, secteur désactivé, notification déjà lue, changement de compte et déconnexion. Ces essais réels restent à faire avec des comptes bêta. Le test d’envoi doit être explicitement convenu.

Références : [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/auth-server), [Supabase fonctions planifiées](https://supabase.com/docs/guides/functions/schedule-functions).

Résultats locaux du lot (19 novembre 2026) : contrôle des types et compilation web OK ; Vitest 191/191 ; tests SQL PGlite 88/88 ; PostgreSQL 18.6 local, six scénarios de concurrence réussis (sept tests en comptant le parent), dont deux workers push simultanés ; configuration mobile 3/3 ; contrôle Deno 2.9.6 OK ; compilation APK et vérification de signature OK. Synchronisation iOS uniquement, sans compilation. Le certificat Android est inchangé. Aucune clé privée détectée dans les fichiers destinés à Git ni dans les entrées de l’APK.

Activation DEV : migrations distantes `20261119150613` et `20261119150800`, noms locaux alignés sur les versions attribuées par Supabase. Worker version 1 actif, secrets Edge et Vault installés. Appel sans secret refusé (401), appel autorisé sur file vide réussi (200, zéro envoi). Aucun téléphone inscrit au moment du déploiement. Les tests SQL locaux ignorent uniquement la migration d’infrastructure du minuteur (extensions pg_net/pg_cron/Vault absentes) ; son exécution réelle est contrôlée sur DEV.
Premier passage automatique vérifié à 15:09 UTC : tâche réussie, réponse HTTP 200, aucun envoi ni reprise. Les comptes clients ne peuvent pas réclamer la file ; l’inscription anonyme est refusée. Le conseiller Supabase signale les deux tables privées sans politique client (intentionnel : droits retirés et accès par RPC contrôlées) et les trois RPC authentifiées de ce lot ; les avertissements antérieurs sur handle_new_user, touch_updated_at et la protection des mots de passe restent hors de ce lot. Voir [conseillers Supabase](https://supabase.com/docs/guides/database/database-linter).
