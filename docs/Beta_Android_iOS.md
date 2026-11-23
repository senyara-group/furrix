# Versions de test Android et iOS

Branche feat/mobile-beta, depuis main 92a9743. La garde reste hors de ce lot.

## Ce qui est prepare

Une base React / TypeScript et deux projets Capacitor 8.6.2, identifiant fr.furrix.app. Les ressources web sont embarquees, pas chargees depuis Vercel. Les comptes et les donnees sont communs a furrix.fr, via Supabase DEV. Chaque appareil conserve sa session dans le coffre natif, sans synchronisation iCloud ni repli localStorage.

Le mode mobile utilise le vrai produit Plein air, la beta privee et les inscriptions fermees. Les commandes platform:sync et build:platform restent reservees au banc technique historique ; ne pas les utiliser pour fabriquer les applications de beta.

## Configuration sur chaque machine

Node 22 ou plus, puis npm ci. Copier .env.mobile.local.example vers .env.mobile.local et renseigner la cle publique du projet DEV depuis Supabase. Le fichier local est ignore par Git. Aucune cle service_role, aucun mot de passe utilisateur ni identifiant SMTP ne doit etre utilise.

- npm run mobile:check : controle la cible DEV, le mode produit et les drapeaux beta, sans afficher la cle.
- npm run mobile:build : construit les ressources pour les applications de test.
- npm run mobile:prepare:android : construit puis synchronise le projet Android.
- npm run mobile:prepare:ios : construit puis synchronise le projet iOS (aucune compilation Xcode ici).

Le controle refuse une URL de projet differente, une cle serveur, une cle manquante ou un mode diagnostic. Une cle publishable est publique par conception : elle est presente dans le binaire, la securite reste assuree par Auth, les autorisations beta et RLS. Le controle du format ne prouve pas a lui seul qu'une cle publishable appartient au projet : la connexion reelle doit etre testee.

## Android sur Windows

Android Studio 2025.2.1 minimum, SDK platform Android 36, Build Tools 36.0.0 et JDK 21 pour le wrapper Gradle 8.14.3 versionne. Une installation recente d'Android Studio peut fournir Java 25 : choisir ou telecharger JDK 21 dans les reglages Gradle, puis definir JAVA_HOME vers ce JDK pour le terminal. Le script ne modifie pas la configuration globale.

npm run platform:doctor affiche les outils detectes. Une presence d'un autre SDK ou d'un autre Java ne suffit pas. Un JDK 21 portable sous .mobile-tools/java21 est reconnu localement ; ce cache n'est pas versionne ni necessaire sur les autres machines.

npm run android:apk prepare les ressources puis lance assembleDebug. APK attendu : android/app/build/outputs/apk/debug/app-debug.apk. Utiliser Android Studio pour installer sur un telephone ou un emulateur. La premiere installation ou le debogage USB demandent des confirmations sur le telephone. Ne pas accepter une licence SDK au nom d'un autre utilisateur ; passer par le SDK Manager si la compilation reclame un accord absent.

L'APK debug sert uniquement a la recette privee. Ce n'est pas une publication Google Play ; il ne configure ni signature de production ni compte de magasin. Les icones et ecrans de lancement issus du squelette restent a finaliser avant distribution externe.

## iOS sur le Mac

Xcode 26 minimum, outils en ligne de commande et Swift Package Manager (deja utilise par le projet). Installer Node, recuperer la branche fusionnee puis npm ci. Creer .env.mobile.local comme ci-dessus.

Executer npm run mobile:prepare:ios puis npm run ios:open. Dans Xcode : choisir App et un simulateur pour Build/Run. Pour l'iPhone, choisir l'equipe Apple autorisee dans Signing & Capabilities, connecter l'appareil et executer Run. Aucun Team ID, certificat ou profil n'est invente ou stocke dans Git. Une signature valide et le mode developpeur de l'iPhone peuvent etre necessaires. La compilation iOS et les essais ne peuvent pas etre valides depuis cette machine Windows.

## Retours d'e-mail

Conserver dans Supabase > Authentication > URL Configuration les URL web existantes et autoriser exactement :

- fr.furrix.app://auth/callback
- fr.furrix.app://auth/reset

Le retour reset choisit explicitement le formulaire apres verification reussie du code PKCE. Il est refuse si l'echange echoue. Les liens mal formes, de mauvaise origine ou rejoues ne sont pas suivis vers une destination externe. Ouvrir le mail sur le meme appareil et demander le lien depuis l'app : le verificateur PKCE est propre a cette installation.

Le modele d'invitation beta actuel ouvre volontairement https://furrix.fr/#/auth/invite. Le testeur y choisit son mot de passe puis se connecte dans l'application. L'ouverture automatique des liens HTTPS dans une app (Universal Links / Android App Links) reste a configurer avec les identifiants d'equipe Apple et les empreintes de certificats reelles. Elle n'est pas livree sous de fausses valeurs.

Aucun reglage distant Supabase n'a ete modifie par ce lot.

## Photos, localisation et clavier

Sur l'app native : choix de phototheque ou prise de vue via Camera 8.2.6, sans sauvegarde automatique de la prise de vue dans la galerie. La demande des metadonnees JSON est desactivee ; cela ne constitue pas un audit de toutes les metadonnees des fichiers. Les controles JPEG/PNG/WebP et 5 Mo restent appliques. Tester un vrai fichier HEIC sur iPhone : aucun support universel HEIC n'est promis. Sur web, le selecteur de fichier existant est conserve.

La localisation reste approximative et demandee sur action explicite. Pas de permission de localisation en arriere-plan. Le refus GPS conserve la recherche par commune. Le clavier Android est configure en adjustResize ; le coffre, le clavier, les permissions et les gestes doivent encore etre essayes sur les appareils reels.

## Recette collective

1. Demarrage et acces beta, inscription publique fermee, aucun ecran technique ou demo.
2. Connexion, fermeture complete, restauration, deconnexion locale sans fermer l'autre appareil.
3. Recuperation du mot de passe a froid/a chaud, lien expire, mauvais appareil ; aucun code ou jeton dans les journaux.
4. Selection de photo, prise de vue, annulation/refus d'autorisation, fichier trop lourd, retour de l'appareil photo.
5. Secteur animaux perdus avec/sans GPS, notification interne, observation et animal retrouve.
6. Swipe reciproque avec les bons animaux, match, messages et proposition de rencontre ; clavier ouvert, rotation, zones sures et bouton retour Android.

Les notifications push et les magasins restent hors de ce lot. Ne pas declarer la recette reelle validee sur la seule base des tests simules.

Sources officielles consultees : https://capacitorjs.com/docs/getting-started/environment-setup ; https://capacitorjs.com/docs/apis/app ; https://capacitorjs.com/docs/apis/camera ; https://capacitorjs.com/docs/apis/geolocation ; https://supabase.com/docs/guides/auth/native-mobile-deep-linking.

## Verification de ce lot sur Windows (19 novembre 2026)

- TypeScript : OK ; Vitest : 159/159 ; controles de configuration mobile : 3/3.
- Compilation web de production : OK ; preparation des ressources Android et iOS : OK.
- Compilation native Android assembleDebug : OK, 249 taches Gradle ; signature Android Debug verifiee avec apksigner.
- SHA-256 de l'APK de recette : 7f5e475b31c46cc0a0e2057471f00ffc4b333be556edbd00be422fbad0715b9a.
- Aucun essai sur telephone, aucune compilation Xcode et aucune publication en magasin realises.

## Mise à jour icône et navigation (19 novembre 2026)

Guillaume a confirmé le premier démarrage sur son Honor 400 Lite. La version Android suivante porte le numéro 1.0.1 (code 2) pour permettre une mise à jour.

Les cinq onglets téléphone sont Rencontres, Garde, Services, Messages et Plus. Plus ouvre une page avec Animaux perdus, Mes animaux, Mon compte et Accueil. Le logo de la barre d’accueil est un lien vers l’accueil ; celui-ci reste aussi accessible depuis Plus. Les sous-pages personnelles gardent Plus sélectionné.

L'icône reprend la patte de `src/design-system/icons/Icon.tsx`, le fond clair, l'encre et le point coquelicot des jetons Plein air. Source : `resources/furrix-icon.svg`. Android : cinq densités, premier plan adaptatif transparent et variante thématique API 33 ; iOS : PNG opaque 1024 px. Pour réexporter, suivre les deux commandes en tête de `scripts/mobile-icons.mjs` ; Sharp reste un outil local ignoré, sans nouvelle dépendance du produit. Référence Android : https://developer.android.com/develop/ui/compose/system/icon_design_adaptive.

Installer le nouvel APK par-dessus le précédent, signé avec le même certificat de test, pour conserver la session. Ne pas désinstaller pour actualiser l'icône ; si le lanceur conserve une ancienne image, le relancer. Les écrans de lancement restent ceux du squelette.

Contrôles de la version 1.0.1 : types et compilation web OK, 159/159 tests. Aperçu local sans données de compte dans Chrome à 320, 390 et 1280 px : aucun débordement horizontal ni erreur JavaScript ; cibles des onglets téléphone de 64 × 49 px minimum. Compilation Android réussie ; signature identique à la première bêta, vérifiée avec apksigner. SHA-256 de l'APK : 4cf200c7590bf6ad715e2d3b569cc43081795b856ac85fd7efbafd0a7f0cc8ff. Cette mise à jour reste à essayer sur l'Honor ; aucune compilation iOS réalisée.

## APK de recette 1.0.4 — 23 novembre 2026

Base applicative : `main` au commit `d37727b` (intégration des champs et suggestions de communes incluse). Version Android `1.0.4`, code `5`, identifiant `fr.furrix.app`. L'APK local `Furrix-beta-1.0.4.apk` est compilé avec `npm run android:apk`, après contrôle de configuration mobile et des types ; les trois tests de configuration mobile passent. La signature est vérifiée avec `apksigner` et comparée à l'APK 1.0.3 : identique. Une mise à jour par-dessus l'installation existante est donc possible, sans désinstallation.

SHA-256 de l'APK : `a28b28b39c770727cb5f556c53a6cfb3ebb2f8b05a77f1568c45e3760230181a`. Aucun essai sur appareil réel dans cette compilation, aucune publication en boutique ni modification de Supabase. Le parcours de suppression du compte est embarqué mais son traitement serveur reste à déployer et activer séparément, selon `Suppression_Compte.md`. Aucun secret ni APK n'est ajouté au dépôt.
