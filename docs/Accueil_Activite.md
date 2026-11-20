# Accueil — activités à suivre

Le bloc « À suivre » remplace l’attente statique par un aperçu des données réelles du compte connecté. Les trois entrées Rencontres, Garde et Services conservent leur place et proposent désormais les actions disponibles, sans annoncer des fonctionnalités « en préparation » sur l’accueil.

## Contenu

Deux groupes affichent chacun trois éléments au maximum :

- **Demandes à consulter** : propositions de rencontre en attente, demandes de garde en attente ou ayant obtenu l’accord du gardien, demandes de rendez-vous Services en attente ou avec contre-proposition.
- **En cours et à venir** : rencontres acceptées dont le créneau n’a pas commencé, gardes et rendez-vous confirmés non terminés. Une garde ou un rendez-vous déjà commencé passe en tête, puis les dates futures sont triées de la plus proche à la plus éloignée.

Une demande n’est jamais présentée comme confirmée. L’accord d’un gardien affiche « garde non confirmée » ; aucune action de paiement n’est inventée. Pour les Services, le libellé distingue la personne qui attend de celle à qui un nouveau créneau est proposé. Pour une proposition de rencontre, l’accueil ne choisit aucune date et ne prétend pas savoir qui doit répondre : le détail permet de le vérifier.

Chaque carte conduit au suivi existant. L’accueil n’accepte, ne confirme, n’annule et ne marque rien comme lu. Les événements terminés, retirés, refusés ou annulés ne sont pas ajoutés à cet aperçu. Les demandes de garde ou de Services dont le créneau a déjà commencé sont laissées au suivi complet. Aucun délai ni durée de rencontre n’est inventé ; une rencontre acceptée sort de cet aperçu dès le début de son créneau, faute d’heure de fin dans ce parcours.

Le lien Notifications utilise le compteur déjà chargé par le centre commun. Il n’ajoute pas de boucle de chargement des notifications. Les raccourcis Mes rencontres, Mes gardes et Mes rendez-vous restent disponibles même si les données ne peuvent pas être chargées. Les animaux et les alertes animaux perdus gardent leurs accès existants sur l’accueil.

## Lecture et limites

Le composant ne se monte que sur l’accueil authentifié. Il utilise les fonctions existantes `list_my_matches`, `list_my_sittings` et `list_professional_appointments`, avec une sélection explicite de colonnes : identifiants de suivi, noms utiles, rôle, statut et dates. Aucun message libre, santé, poids, photo, tarif ni coordonnée n’est demandé pour ces cartes.

Les trois lectures sont indépendantes et parallèles. Une panne est annoncée avec le nom du parcours ; les autres résultats restent disponibles. Si tous les résultats sont vides et aucune source n’a échoué, un état vide réel est affiché. Une source indisponible ne devient pas « aucune activité ». Lors d’une actualisation, les anciennes cartes sont retirées : une révocation d’accès ne laisse pas de données conservées à l’écran.

Chargement à l’ouverture, au retour de focus, au retour de visibilité et toutes les minutes sur l’accueil visible. Une tentative en cours empêche les doublons. Les requêtes sont annulées au départ de l’accueil ou au changement de compte, et ont un délai maximal de quinze secondes. Les réponses tardives sont ignorées. Les dates suivent le fuseau de l’appareil.

L’aperçu respecte les limites des fonctions de liste existantes : il n’interroge pas tout l’historique et n’est pas un agenda exhaustif. La limite visuelle de trois demandes et trois activités est annoncée. Les liens renvoient aux espaces dédiés pour leur suivi habituel.

L’aperçu de développement `AppPreview` ne reçoit pas de client et ne charge aucune activité personnelle. Les fichiers temporaires utilisés pour le contrôle visuel ont été supprimés.

## Validation et livraison

- Contrôle des types, compilation et Vitest : 240/240 tests réussis, dont neuf nouveaux scénarios couvrant statuts, rôles, dates, classement, déduplication, projections réduites, panne partielle, révocation, changement de compte et limite des cartes.
- Navigateur local avec client simulé à 390 et 1 280 px : chargement et actualisation, un titre principal, aucun débordement horizontal ni erreur JavaScript, boutons et liens du suivi d’au moins 44 px. La carte des animaux reste alignée en haut au lieu de s’étirer sur la hauteur du suivi.
- Aucun changement SQL : pas de migration, d’écriture métier, de modification de droits ou d’envoi de notification. Les tests SQL et de concurrence n’ont pas été rejoués pour ce lot d’affichage.

Restent la recette collective sur les vraies données et les essais sur téléphones. Aucune nouvelle APK n’est produite pour ce lot : le prochain assemblage mobile intégrera ces modifications après fusion. L’APK 1.0.3 déjà préparée pour les notifications ne contient pas encore ce nouvel accueil.

Les formulaires et champs conditionnels confiés à Alexis ne sont pas modifiés.
