# Intégration des champs et suggestions de villes

Intégration du commit d'Alexis `430ce3b` (`feat/validation-champs`) dans `main` après la PR #42. Les conflits d'import du compte et de liste des tests SQL sont résolus en conservant tous les ajouts : premiers pas, retrait animal, suppression de compte, notifications et rendez-vous Services. Aucun historique Git n'est réécrit et la branche d'Alexis n'est pas modifiée.

## Fonctionnement

Les communes sont proposées après deux lettres ou un code postal complet, via l'API publique Découpage administratif. Seul le texte de recherche est envoyé, sans profil, e-mail ni coordonnées de l'utilisateur. La sélection fournit le centre de la commune, arrondi à deux décimales. Elle ne déclenche pas le GPS et ne remplace pas la position de l'utilisateur. Sans réseau, les champs restent éditables ; les parcours demandant un secteur continuent d'exiger une position confirmée.

Le composant commun est raccordé aux formulaires et recherches apportés par Alexis, notamment compte, animaux, rencontres, garde, annuaire professionnel et alertes perdues. Il respecte le clavier (flèches, Entrée, Échap), les étiquettes des champs, la sélection tactile et les styles du design system.

Les aides de saisie couvrent aussi les montants, poids, coordonnées, téléphone, noms, âges, sites et e-mails. Elles ne prouvent ni l'identité ni la délivrabilité d'une adresse : la confirmation Auth reste nécessaire. Les contrôles de mot de passe côté interface ne remplacent pas les réglages du serveur Auth.

## Corrections d'intégration

- Une ancienne recherche ne peut pas remplacer les suggestions du texte actuel, même si la réponse réseau ignore l'annulation. Une réponse arrivée après la sortie du champ ne rouvre pas la liste. Un formulaire désactivé ne peut pas être modifié par une suggestion encore présente.
- Une ancienne localisation ne remplace plus une commune choisie plus récemment dans la déclaration d'animal perdu.
- Connexion et récupération de compte conservent les formats d'e-mail précédemment acceptés ; les nouveaux contrôles d'inscription ne bloquent pas ces comptes existants.
- Un prénom d'un seul caractère reste admis ; la limite d'âge arbitraire de 40 ans est retirée. Les numéros déjà enregistrés avec séparateurs et les sites en domaine international encodé restent utilisables.
- La liste de suggestions utilise les jetons du design system et le préfixe `app-`.

## Base de données et activation

Le fichier `20261120093835_disposable_email_domains.sql`, absent de `main`, est récupéré depuis la branche d'Alexis. Cette version de migration figure déjà dans l'historique DEV. Les définitions `is_disposable_email` et `reject_disposable_email` ont été relues sur DEV et correspondent au fichier récupéré. Aucun rejeu ni modification distante n'est réalisé pendant l'intégration. La liste de domaines reste celle d'Alexis, avec ses limites de classification ; elle ne détecte pas toutes les adresses temporaires.

La suppression de compte fusionnée en PR #42 reste à déployer et activer séparément selon `docs/Suppression_Compte.md`. L'intégration des champs ne l'active pas. Aucun changement sur les inscriptions publiques, aucun déploiement, aucune nouvelle dépendance.

## Contrôles

Types et compilation ; 301 tests Vitest ; 153 tests SQL PGlite, incluant la suppression de compte et le retrait animal. L'API de communes a aussi été interrogée en lecture seule avec « Lille » pour vérifier la forme de sa réponse.

Dans le navigateur, les vrais composants ont été affichés avec un client simulé à 390 et 1280 px : compte, création d'animal, profil de gardien, profil professionnel, déclaration de disparition. Sélection au toucher sur téléphone et à la souris sur ordinateur ; un titre principal, pas de débordement horizontal ni erreur JS, champs et boutons d'au moins 44 px. Les suggestions sont simulées pour ces contrôles reproductibles. Le support temporaire est supprimé.

Restent à recetter avec les comptes bêta et le prochain build mobile : accès réseau aux suggestions sur appareil réel, clavier natif, sauvegardes réelles des formulaires et éventuelles données anciennes à corriger. Pas de nouveau test de concurrence PostgreSQL pour ce lot : les mécanismes de réservation et de suppression ne sont pas modifiés.
