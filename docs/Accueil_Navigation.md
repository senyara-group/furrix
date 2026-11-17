# Accueil et navigation Plein air

Lot du 17 novembre 2026, branche `feat/app-home`, construite sur `feat/authentication`.
Intégrer l'authentification d'abord ; ce lot dépend de sa vérification des déclarations et de sa migration.
Il n'ajoute aucune migration ni opération distante.

## Ce qui fonctionne dans le code

- Accueil et trois entrées de poids égal : rencontres, garde, services professionnels.
- Navigation ordinateur, barre téléphone à cinq entrées et menu du compte pour animaux/compte.
- Routes par fragment, liens directs, retour/avance du navigateur, focus du contenu après changement.
- Compte : lecture de l'e-mail de session, prénom et ville ; déconnexion locale avec gestion d'échec.
- Animaux : liste des profils existants du propriétaire connecté, chargement et erreur avec nouvelle tentative.
- Les réponses tardives d'un ancien compte sont ignorées, et ses données ne sont pas affichées entre deux effets.
- Pages d'attente explicites pour rencontres/garde/services/messages. Aucune demande ou réservation simulée.

Le bloc « À suivre » reste un état d'attente sans compteur ni fausse activité : les services métier ne sont
pas raccordés. Création/édition des animaux, édition du profil, sélection de l'animal actif et gestion des
appareils restent aux lots suivants. Aucun avantage d'abonnement n'a été ajouté.

## Accès protégé et aperçu local

`npm run dev:auth` ouvre maintenant `ProductApp` : connexion et acceptations vérifiées avant montage de
`AppShell`. Une URL `#/accueil` ne contourne ni la session ni cette vérification. Les données ne sont lues
qu'après montage de l'espace connecté. Les inscriptions restent fermées selon la configuration du lot auth.

`npm run dev:home` ouvre un **aperçu de développement** sans compte, explicitement identifié : pas de
client Supabase, pas de requête, pas de données personnelles. Il sert à valider la composition pendant que
les documents et la recette Auth sont préparés. Il n'est pas accessible par un paramètre d'URL du produit.
Le mode `home-preview` est bloqué dans un build de production ; cela a été vérifié sur le bundle généré.

Le build public par défaut reste l'ancien prototype tant que l'entrée `auth` n'est pas explicitement choisie.
`npm run auth:sync` prépare le nouveau parcours dans Android/iOS ; ce n'est pas une compilation APK/IPA.

## Travail avec Alexis

La composition vit dans `src/app`, les styles sont préfixés `fx-` sous `.furrix-shell`.
Aucun dossier de composants d'Alexis n'était publié au démarrage de ce lot. Ses composants peuvent remplacer
les liens, panneaux et contrôles HTML sans déplacer les appels Supabase dans la présentation.

`AppShellView` reçoit un état de chargement et des données ; `AppShell` s'occupe de leur lecture.
Les fonctions métier à venir se branchent sur les routes déjà présentes. Ne pas dupliquer le routeur dans
chaque composant ni utiliser les contrôles du prototype comme règles métier.

Bricolage Grotesque et Figtree sont embarquées localement, ainsi que les icônes Lucide. Versions figées,
lockfile et licences dans `public/licenses`. Aucune image externe ou photo dont la licence reste à confirmer.
L'illustration de parc utilise CSS et une icône ; ce n'est pas une nouvelle mascotte validée.
La direction Plein air est reprise sans prétendre à une copie pixel par pixel de l'export de conception.

## Vérifications exécutées

- 66 tests applicatifs réussis, TypeScript et compilation `build:auth` OK.
- Cas testés : navigation, menu du compte, compte vide, erreur/reprise, déconnexion en échec,
  refus d'accès sans session, lecture filtrée par propriétaire et réponse tardive d'un ancien compte.
- Chromium : accueil, destination garde, menu téléphone, compte et retour/avance du navigateur.
- Largeurs 320, 390, 768, 1024 et 1280 contrôlées : pas de débordement horizontal observé.
- Chargement des deux polices confirmé ; captures ordinateur et téléphone conservées hors du dépôt.
- Build de production avec `home-preview` : aperçu inactif confirmé dans le JavaScript généré.

Restent à tester : vrai compte DEV et données réelles, e-mails, Safari/iOS, Android, clavier physique,
lecteur d'écran, zoom texte et applications compilées. Aucun nouveau résultat SQL distant n'est revendiqué.
