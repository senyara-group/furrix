# Mon compte

Premier lot de l’ordre convenu : Mon compte → Animaux perdus → Messages → Services. La garde reste suivie par Alexis.

## Fonctionnement livré

- Prénom et ville modifiables ; e-mail de connexion affiché en lecture seule.
- Prénom requis (1 à 80 caractères après retrait des espaces de bord), ville facultative (80 maximum). Les caractères de contrôle sont refusés. Une ville effacée est enregistrée à null. Ces limites sont celles du formulaire et du service client ; aucune nouvelle contrainte SQL n’est ajoutée.
- L’enregistrement ne touche que name et city, avec filtre sur l’identifiant du compte et retour du profil enregistré. Aucun succès sur une réponse vide. Ni rôle, ni abonnement, ni e-mail Auth, ni profil animal ne sont modifiés.
- Une erreur conserve le brouillon ; un double envoi est ignoré. La réponse d’un écran quitté ne met pas à jour l’interface. Après confirmation serveur, l’accueil et l’avatar utilisent le prénom enregistré, sans recharger les animaux.
- Le secteur d’alertes existant est accessible depuis Mon compte : activation volontaire par commune ou position approximative, rayon, désactivation et suppression de la zone. Même composant et même abonnement que dans Animaux perdus, sans préférence parallèle. Aucun appel GPS avant une action explicite.
- Si le secteur ne se charge pas, son état reste inconnu, les activations restent indisponibles et une nouvelle tentative est proposée. Il n’est pas présenté comme désactivé.
- Déconnexion de cet appareil avec le service Auth existant en scope local. Aucun changement de la gestion des sessions.

La ville du profil ne déplace pas automatiquement les animaux ni le secteur des alertes. Les préférences de ce lot concernent les notifications internes d’animaux perdus ; aucun push, SMS ou e-mail n’est ajouté. Le changement d’adresse de connexion, la modification du mot de passe, la suppression du compte et la gestion des autres appareils restent hors de ce lot.

## Base et intégration

Aucune migration. Vérification en lecture seule sur DEV : authenticated peut modifier name et city ; role et premium restent non modifiables. Les règles RLS limitent l’accès à son propre profil avec une bêta active. Aucun profil réel ni aucune préférence réelle modifiés pendant le développement.

Le formulaire est monté sur la route compte après chargement du profil, avec un composant distinct par compte. L’aperçu de navigation sans client reste en lecture seule. Les composants et jetons Plein air sont utilisés, avec une seule action principale (enregistrer le profil).

## Vérifications

- TypeScript et compilation web : OK ; Vitest : 169/169, dont huit tests du lot compte.
- SQL local : 30/30 sur les suites existantes de droits, profil/stockage et confidentialité ; aucune évolution du schéma.
- Aperçu local sans données réelles à 320, 390 et 1280 px : un h1, aucun débordement horizontal ni erreur JavaScript, champs et boutons de 52 px. Sauvegarde simulée puis prénom retrouvé sur l’accueil.
- À faire après fusion : sauvegarde avec un vrai compte, rechargement et connexion depuis un second appareil, effacement de la ville, réglage/désactivation du secteur et déconnexion locale. Les APK déjà installés doivent être recompilés pour intégrer l’interface ; aucune compilation native dans ce lot.

## Suite convenue

1. Mon compte : ce lot à relire et tester.
2. Animaux perdus : améliorer le parcours et préparer les alertes hors application, en distinguant les permissions de l’appareil des abonnements locaux. Le push Android/iOS demandera la configuration des services correspondants ; aucune livraison fictive sans ces accès.
3. Messages : non lus, lecture et actualisation, en coordination avec les rencontres.
4. Services : choix de la source des professionnels avant de brancher une recherche et des fiches réelles.
