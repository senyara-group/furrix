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
