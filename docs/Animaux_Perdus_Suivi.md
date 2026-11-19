# Suivi des alertes d’animaux perdus

Lot suivant Mon compte, avant Messages et Services. Aucun changement de schéma ni migration dans ce lot.

## Parcours

- « Mes alertes » lit ses propres annonces côté serveur, avant pagination : en cours, retrouvées ou clôturées. Ce n’est pas un filtre des trente premières annonces publiques. Lecture par pages de trente, triées par création puis identifiant ; les pages chargées restent visibles. Le décalage de page peut évoluer si des annonces sont créées ou supprimées entre deux lectures : actualiser la liste pour repartir de son début.
- La fiche garde son identifiant dans l’adresse. Retour aux alertes et navigation du navigateur conservent l’onglet d’origine. Les identifiants invalides ou répétés ne sont pas utilisés pour charger une fiche. Une ancienne réponse ne remplace pas la nouvelle fiche ouverte.
- « Copier le lien de l’alerte » partage uniquement l’adresse web et l’identifiant de l’alerte. Aucun jeton, coordonnée ou identifiant de compte dans le lien. La copie doit être confirmée par le navigateur ; en cas de refus, un champ en lecture seule permet de copier manuellement.
- Le lien reste soumis à la connexion, à l’accès bêta et aux contrôles de lecture existants. Il n’ouvre pas une alerte au public, ne donne pas accès à une annonce retirée d’un autre compte et ne configure pas les liens universels Android/iOS. Une annonce retrouvée n’accepte toujours plus d’observation.
- Les notifications se filtrent « Non lues uniquement » côté serveur avant la limite de cinquante résultats. On peut marquer une notification comme lue sans ouvrir l’alerte. En cas d’échec, elle reste non lue et peut être réessayée. Le header reprend son contrôle partagé via l’événement de lecture existant ; aucun deuxième minuteur ajouté.
- La liste des notifications est actualisée manuellement et au retour à l’écran visible. Son échec n’empêche pas de consulter les alertes. Une notification devenue obsolète peut être lue sans révéler une annonce retirée.

La déclaration, les observations, les photos privées et la confirmation avant « retrouvé » ou clôture restent sur les fonctions existantes. Les préférences de secteur restent communes avec Mon compte.

## Validation

TypeScript et compilation web OK ; Vitest 178/178, dont neuf tests de suivi. SQL local des animaux perdus : 10/10, avec lecture directe de ses annonces et refus de celles d’un autre propriétaire. Vérification DEV en lecture seule : droit SELECT absent pour anon ; bêta active et propriétaire requis par RLS. Aucune donnée réelle modifiée.

Aperçu avec données fictives à 320, 390 et 1280 px : listes personnelles, ouverture d’une fiche par son adresse et notification marquée lue ; aucun débordement horizontal, un h1, aucune erreur JavaScript et boutons d’au moins 44 px. À confirmer avec deux vrais comptes après fusion ; aucun nouvel APK ou build iOS fabriqué dans ce lot.

## Notifications hors application

Elles ne sont pas livrées dans ce lot. Aucun projet Firebase n’existe encore pour Furrix, aucune demande de permission push ni faux état « activé » n’est ajouté. Préparation : [Notifications push](Notifications_Push.md). Le prochain lot peut brancher Android après création du projet et configuration des accès serveur ; iOS demandera aussi les accès Apple et les essais sur Mac/iPhone.
