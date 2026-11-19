> Mise à jour : migrations appliquées sur DEV le 19 novembre 2026. Les sections de préparation ci-dessous sont historiques. Voir le compte rendu en fin de document.

# Animaux perdus et alertes de secteur — première livraison

Branche dédiée depuis `main`, sans modification du header ni des rencontres. L'entrée est un lien sur l'accueil, vers `#/animaux-perdus`. La route `#/animaux-perdus?notifications` ouvre la boîte de notifications. `LocalAlertNotice` est un point d'intégration réutilisable par le futur header ; pour ce lot, il affiche un bandeau dans le contenu de l'application.

## Parcours disponible

- Déclarer la disparition d'un de ses animaux : commune, dernière observation, description, consignes et rayon de diffusion de 5 à 50 km. Une seule alerte ouverte par animal.
- Choisir une zone avec sa position actuelle, uniquement sur action explicite, ou renseigner des coordonnées manuellement. Les coordonnées sont arrondies à deux décimales avant envoi et à nouveau côté serveur. Elles restent approximatives, sans garantie d'anonymat.
- Copier la photo principale dans un objet indépendant, dans le bucket privé existant. Une modification ultérieure du portrait du profil ne casse pas l'alerte. La photo peut être omise ; il faut l'autorisation de lecture du profil et d'écriture dans son dossier pour la copier.
- Consulter les alertes récentes, filtrer par commune exacte et parcourir les pages. Le détail donne accès à un lien OpenStreetMap externe avec la zone approximative. Aucune carte intégrée ni recherche automatique de commune n'est annoncée comme disponible.
- Envoyer une observation privée au propriétaire, sans match : date, secteur décrit et message. Le propriétaire et l'auteur seuls peuvent la lire ; aucune adresse e-mail ou numéro de téléphone n'est rendu par le parcours.
- Modifier la description/les consignes, indiquer « retrouvé » ou clôturer. La dernière zone et le rayon ne sont pas modifiables après publication dans cette première version, pour éviter une rediffusion silencieuse. Une clôture est définitive dans ce parcours ; une nouvelle disparition peut faire l'objet d'une nouvelle alerte.
- Signaler une annonce abusive. La file de signalements est enregistrée ; son traitement relève du futur back-office ou d'un opérateur serveur, sans promesse de délai de modération.

## Notifications : fonctionnement effectif et limites

**Disponible dans l'application :** abonnement volontaire à une zone privée et un rayon maximal, enregistrement des notifications à la publication, notification d'observation au propriétaire et notification « retrouvé » aux destinataires de l'alerte initiale. Le propriétaire ne reçoit pas sa propre diffusion de secteur.

Le destinataire doit être un membre bêta actif et avoir choisi son secteur avant la publication. La distance entre les centres doit respecter à la fois le rayon de diffusion et son rayon d'abonnement. Il ne s'agit pas d'un suivi permanent : aucun déplacement n'est suivi en arrière-plan, le secteur reste fixe jusqu'à sa mise à jour. Désactiver l'abonnement supprime les coordonnées d'abonnement. Les notifications déjà reçues restent dans l'historique.

La publication et sa diffusion sont dans la même transaction. Une contrainte unique par utilisateur/événement empêche les doublons lors d'un nouvel essai. Les petites modifications ne rediffusent pas l'annonce ; la clôture ne rediffuse aucune nouvelle alerte de disparition. Le bandeau recherche les notifications non lues au montage, au retour dans la fenêtre et toutes les 60 secondes. La boîte se recharge à son ouverture ou avec « Actualiser ».

**Non disponible :** push application fermée, notification système du navigateur, e-mail ou SMS. Aucun jeton ni secret de notification n'est demandé ou ajouté. Le domaine n'est pas une dépendance de ces notifications internes. Pour le lot push suivant : choisir la diffusion APNs/FCM/web push, gérer le consentement système et les jetons par appareil, la révocation, une file d'envoi avec reprises/déduplication, puis tester sur appareils. Aucune livraison push ne doit être annoncée avant ces essais.

La diffusion SQL est synchrone et adaptée à la petite bêta. Une mise à l'échelle demandera des tâches asynchrones, des index spatiaux et des limites de fanout. L'interface n'affiche pas de nombre de personnes « prévenues » ni de promesse de lecture.

## Autorisations et garde-fous

Migration préparée : `20261118122724_lost_pets_local_alerts.sql`, à appliquer **uniquement après revue et autorisation**, après les migrations rencontres/confidentialité existantes.

Les lectures directes de `lost_pets` sont réservées au propriétaire ; les autres alertes sont accessibles par un DTO explicite, sans profil privé, santé, coordonnées précises ou contact personnel. La zone publiée est volontairement visible aux membres de la bêta. Les notifications et abonnements sont lisibles uniquement par leur destinataire/propriétaire. Les observations sont limitées aux deux personnes concernées. Toutes les tables ont la RLS et une barrière bêta ; les écritures clientes passent uniquement par des RPC contrôlées. Les révocations de grants couvrent les droits de table, de colonne et les rôles parents.

La nouvelle policy Storage donne uniquement la lecture de la photo copiée référencée par une alerte recherchée ou retrouvée, si son auteur et le lecteur sont actifs. Elle n'ouvre ni les écritures des autres comptes ni les documents. Les images restent téléchargées avec la session. Les images déjà téléchargées ne peuvent pas être rappelées après clôture/révocation.

Limites techniques provisoires pour la bêta : trois publications par compte sur 24 heures et dix observations par heure. Elles sont contrôlées par le serveur et verrouillées par utilisateur ; elles ne constituent pas des quotas commerciaux validés. Les requêtes de publication et d'observation ont un UUID stable pendant le formulaire. Après rechargement, vérifier l'état enregistré avant de recommencer. Une copie de photo dont la réponse a été perdue peut laisser un objet orphelin privé ; aucun nettoyage automatique destructif n'est effectué en cas d'incertitude.

Le schéma historique autorise certaines colonnes nulles et les suppressions d'animaux en cascade. La migration ne transforme pas les anciennes alertes incomplètes en annonces complètes. Les doublons historiques d'alertes ouvertes, s'il en existe, doivent être examinés avant création de l'index unique. Ne pas détruire ou réécrire les données existantes pour forcer l'application.

## Recette avant application et exposition

1. Comparer `main`, la branche et l'historique réel de DEV ; examiner les alertes existantes et les grants avant application. Aucun `db push` aveugle et aucun rejeu des migrations appliquées.
2. Après accord et application, vérifier les policies, droits effectifs, fonctions privilégiées et conseillers Supabase. Aligner les noms locaux si l'outil attribue une version différente, sans modifier le SQL.
3. Avec trois comptes de test : B choisit une zone proche, C une zone éloignée ; A déclare une disparition fictive. B reçoit une seule notification, C aucune. A n'est pas destinataire de sa propre diffusion. Un utilisateur non abonné ne reçoit rien.
4. Rejouer la même requête : pas de doublon. Modifier la description : aucune nouvelle diffusion. Marquer retrouvé : une notification de clôture pour B, plus de nouvelle observation acceptée.
5. B envoie une observation. A et B la lisent, C ne peut pas. Tester les lectures directes, la falsification du propriétaire, les photos non référencées, les documents, la désactivation du secteur et la révocation du compte.
6. Vérifier les nouvelles pages et les notifications après rechargement, sur ordinateur et téléphone. Sur Android/iOS : permissions de localisation refusées/accordées, photo, réseau interrompu et retour dans l'application. Aucun build APK/IPA ni essai sur appareil n'est présenté comme exécuté pour ce lot.

Les tests SQL utilisent PGlite jetable ; ils ne reproduisent pas les véritables services Auth/REST/Storage de Supabase. La recette visuelle utilise un faux client local, supprimé après les essais. Les captures sont des données fictives. Les migrations, la recette connectée et toute diffusion distante restent non effectuées à la livraison.

## Complément du 19 novembre 2026

La branche feat/animaux-perdus-parcours complète le parcours sans modifier le header ni les rencontres.

- Déclaration : choisir le centre de la commune via le service public Géoplateforme, ou utiliser sa position actuelle. Les coordonnées manuelles restent disponibles. Changer le nom de commune efface la zone précédente pour éviter de publier une commune avec des coordonnées devenues incohérentes.
- Secteur privé : abonnement par commune sans GPS, confirmation après enregistrement et suppression de la zone au désabonnement. Aucun suivi de déplacement.
- Une confirmation est demandée avant de marquer retrouvé ou clôturer.
- Les pages suivantes s’ajoutent à la liste sans doublon. Lire une notification actualise immédiatement la cloche ; une notification pointant vers une annonce retirée peut être marquée lue sans réafficher son contenu.
- Si les fonctions ne sont pas installées, un état de préparation remplace les formulaires.

### Vérification distante, lecture seule

Sur DEV jemikzqgbpaivlujnfgl : PostgreSQL 17.11 ; 13 migrations annoncées, jusqu’à meetings_performance ; zéro ligne dans lost_pets ; local_notifications et publish_lost_alert absents. Ni lost_pets_local_alerts ni meeting_integration_safety ne sont appliquées. Aucun compte ou alerte n’a été créé pour ces vérifications.

Les conseillers signalent toujours les points antérieurs : search_path de touch_updated_at, exécution de handle_new_user par les rôles API et protection des mots de passe compromis désactivée. Les RPC SECURITY DEFINER authentifiées sont également signalées automatiquement : leur présence seule ne démontre pas une faille ; elles portent les contrôles d’autorisation métier. Ces points ne sont pas corrigés silencieusement par ce lot.

### Application ultérieure, après revue et accord

Comparer de nouveau les versions distantes et les empreintes des fichiers avant toute application. Les fichiers déjà versionnés restent inchangés. Trois migrations sont en attente dans cet état :

1. 20261118122724_lost_pets_local_alerts.sql (lot initial).
2. 20261119082707_meeting_integration_safety.sql (correctif rencontres antérieur, à revoir séparément).
3. 20261119094151_lost_alerts_completion.sql (ce lot : une annonce clôturée n’est plus accessible par son identifiant aux autres comptes ; une annonce retrouvée reste consultable pour annoncer le retour).

Ne pas utiliser db push à l’aveugle : la première version est antérieure aux trois dernières migrations déjà appliquées. Conserver son identifiant ; ne pas réparer l’historique pour contourner le décalage. Après application autorisée, exécuter supabase/checks/lost-pets-postflight.sql en lecture seule, puis la recette avec comptes réels décrite plus haut. Le postflight valide le catalogue et les privilèges ; il ne remplace pas Auth/REST/Storage ni des essais de concurrence.

Contrôles de cette livraison : tests SQL locaux 72/72 sur PGlite ; postflight exécuté sur cette base jetable ; recette navigateur locale avec déclaration, centre de commune obtenu auprès du service public, confirmation du retour, notifications, abonnement et désabonnement sur téléphone. Un titre principal et aucun débordement horizontal à 390 px, aucune erreur JavaScript observée. Les données et le client de recette sont fictifs ; aucun contrôle de réception distante ni aucune compilation native n’est revendiqué.
Validation finale : 150/150 tests Vitest, contrôle des types et compilation réussis. Le build conserve l’avertissement antérieur de clé transition dupliquée dans le prototype Furrix.jsx, inchangé par ce lot.

## Application DEV autorisée — 19 novembre 2026

Les trois migrations approuvées ont été appliquées, dans l’ordre, sur jemikzqgbpaivlujnfgl. Supabase leur a attribué ces versions :

- 20261119104650_lost_pets_local_alerts.sql
- 20261119104700_meeting_integration_safety.sql
- 20261119104712_lost_alerts_completion.sql

Les fichiers sont renommés sans modification du SQL (empreintes SHA-256 dans supabase/lost-pets-dev-alignment.json). Les anciens identifiants ci-dessus décrivent la préparation antérieure ; ne pas les rejouer. Aucune réparation de l’historique distant n’a été faite.

Postflight distant en lecture seule : cinq tables sous RLS, aucune lecture anonyme ni écriture directe des rôles clients, huit fonctions attendues avec leurs droits et leur configuration, correctif des annonces clôturées présent. Vérification complémentaire : le swipe et la lecture des photos prennent en compte le blocage. Le postflight s’est terminé par ROLLBACK.

Données après application : zéro alerte, zéro notification, zéro abonnement de secteur et zéro observation. Aucun compte n’a été créé ni modifié. L’historique annonce 16 migrations. La recette avec comptes réels et les essais natifs restent à faire ; ces contrôles de catalogue ne les remplacent pas.
Comparaison après alignement : 16 versions locales et 16 distantes, aucune absente ou en attente sur cette branche. Les empreintes MD5 des instructions stockées dans l’historique distant correspondent aux trois fichiers locaux, et les SHA-256 avant/après renommage sont inchangés. Tests SQL rejoués après renommage : 72/72. Les conseillers de sécurité conservent les alertes antérieures ; les huit nouvelles RPC authentifiées sont signalées comme SECURITY DEFINER, dont les contrôles métier et ACL sont couverts par les tests et le postflight.
