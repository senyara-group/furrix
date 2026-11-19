> Pour les applications de bêta actuelles, suivre [Beta_Android_iOS.md](Beta_Android_iOS.md). Les commandes platform:* de ce document concernent le banc technique historique, pas le produit à installer.

# Socle web, Android et iOS — 17 novembre 2026

## Décision de travail et limites de validation

Conserver React + Vite, étendre TypeScript aux nouveaux fichiers `.tsx`, utiliser Capacitor 8
pour embarquer les mêmes écrans et services dans Android/iOS. Une identité « Plein air » commune,
des compositions adaptées à l'ordinateur et au téléphone. Aucune obligation d'utiliser Ionic UI.
Supabase reste le backend commun : Auth, Postgres/RLS, Storage et Realtime selon les lots.

Ce choix réutilise les services, hooks et composants React d'Alexis. React Native/Expo imposerait
une adaptation des composants DOM/CSS ; deux applications natives séparées augmenteraient le travail
d'interface. Aucun besoin observé dans les trois parcours ne justifie actuellement cette séparation.
Ce raisonnement doit être réexaminé si les essais sur appareils révèlent une limitation concrète.

**Statut : architecture retenue pour l'essai technique ; validation native finale en attente.**
Le web compile et le banc s'affiche. La génération des projets et `cap sync` ne sont pas des compilations.
Aucun APK, AAB ou IPA n'a encore été compilé. Aucun jeton réel ni lien d'e-mail n'a été testé.
Mac et iPhone disponibles côté Guillaume ; Android Studio, Java et SDK absents du poste Windows inspecté.

## Versions et organisation

Capacitor core/CLI/Android/iOS 8.6.2, App 8.1.2, Camera 8.2.6, coffre natif
`@aparajita/capacitor-secure-storage` 8.0.1, tous figés avec lockfile.
Supabase-js figé à la version 2.118.0 déjà résolue par le lockfile précédent.
RevenueCat passe de 9 à 14.1.1 pour compatibilité Capacitor 8 : aucun appel produit n'existe dans `src`,
aucun achat n'est activé ou validé. Les dépendances natives doivent encore être résolues par Gradle/Xcode.

- `src/services`, `src/hooks`, `src/types`, `src/validation` : données, logique et contrats partagés.
- `src/platform` : adaptateurs natifs et banc d'essai technique, sans composants produit.
- Les composants « Plein air » restent le chantier d'Alexis, dans le dossier convenu avec lui.
  Ils ne doivent pas importer Capacitor, manipuler des sessions ou appeler directement Supabase.
- `android/`, `ios/` : projets natifs versionnés ; ressources web et configurations générées ignorées.
- Pas de nouvelle règle métier, migration ou modification Supabase distante dans ce lot.

La navigation de la future application utilisera des routes par fragment pour fonctionner sur hébergement
statique et WebView. Un seul point de montage pilotera session, liens entrants et navigation protégée.
Le banc d'essai n'est pas cet accueil produit. Les documents ou écrans publics nécessitant du référencement
pourront être traités séparément ; aucun moteur de rendu serveur n'est nécessaire aux écrans connectés actuels.

## Sessions et liens

Web : persistance navigateur Supabase. Natif : adaptateur asynchrone vers Keychain/Keystore,
sans repli vers localStorage. Pas de synchronisation iCloud ; accès iOS limité à cet appareil déverrouillé.
Ce coffre est une dépendance communautaire : lecture/écriture, verrouillage, redémarrage et réinstallation
doivent être testés, notamment car Keychain peut survivre à une désinstallation iOS.

Flux PKCE sur web et natif. Retours exacts :

- web local : `http://127.0.0.1:5173/#/auth/callback` ou `http://localhost:5173/#/auth/callback` ;
- web déployé : `https://<hôte-validé>/#/auth/callback` ;
- mobile : `fr.furrix.app://auth/callback`, déclaré dans AndroidManifest et Info.plist.

Ces URL doivent être autorisées dans Supabase Auth avant recette, sous contrôle du responsable du projet.
**Aucune configuration distante n'a été modifiée ici.** Ne pas autoriser un joker global de prévisualisations.
PKCE nécessite le vérificateur conservé par le navigateur/appareil à l'origine de la demande : tester le lien
sur cet appareil ; un lien ouvert ailleurs doit expliquer l'échec et permettre une nouvelle demande.
Ne pas journaliser les URL de callback, codes, jetons ou mots de passe.

L'adaptateur natif traite le lancement à froid et les liens reçus à chaud, déduplique le code et suspend
le rafraîchissement en arrière-plan. La déconnexion du service est locale à l'appareil. « Déconnecter partout »
et la liste des appareils restent un lot distinct. Les sessions ne sont pas partagées entre appareils.
Les liens universels/App Links sont une amélioration à prévoir avec les domaines ; le schéma personnalisé
est limité à l'essai, protégé par PKCE. Ce n'est pas une preuve de propriété de domaine.

## Essai local

```sh
npm ci
npm run platform:doctor
npm run dev:platform
```

Variables publiques uniquement dans `.env.local` ignoré par Git : `VITE_SUPABASE_URL` et
`VITE_SUPABASE_ANON_KEY` (anon ou publishable). Vérifier le projet DEV `jemikzqgbpaivlujnfgl`
avant tout test réel. Ne jamais placer une clé service_role dans le client.

Le banc « platform-check » affiche une erreur explicite si la configuration manque ; il ne simule pas
de compte. Il offre connexion avec un compte existant, déconnexion locale, renvoi de confirmation,
envoi d'un lien de récupération, photo locale sans upload et témoin de stockage natif.
Il ne crée pas d'utilisateur et ne livre pas encore l'inscription ou le formulaire de nouveau mot de passe.
Les boutons d'e-mail déclenchent des envois réels uniquement à la demande du testeur.

Les anciennes entrées par défaut et `mvp` restent des prototypes. Elles ne constituent pas une ouverture
publique autorisée ; le futur socle produit devra refuser une configuration absente en production.

## Génération et compilation pour essais

Node >= 22. Android Studio >= 2025.2.1, SDK 36 et Java 21 (JDK d'Android Studio).
iOS : macOS, Xcode >= 26, outils en ligne de commande et dépendances Swift Package Manager.
Les projets générés ciblent Android min 24 / target 36 et iOS 15 minimum.
Les exigences exactes des stores sont à revérifier au moment de soumettre ; cet essai ne les valide pas.

```sh
npm ci
npm run platform:doctor
npm run platform:sync
```

Android sur Windows après installation des outils :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
node scripts/platform-doctor.mjs --require-android
cd android
.\gradlew.bat assembleDebug
```

APK attendu : `android/app/build/outputs/apk/debug/app-debug.apk`. Pour l'installation et le lancement,
utiliser Android Studio (`npm run android:open`), un émulateur ou un téléphone de test.
Cette commande de compilation n'a pas été exécutée faute de SDK/JDK ici.

iOS sur le Mac :

```sh
npm ci
npm run platform:sync
node scripts/platform-doctor.mjs --require-ios
npm run ios:open
```

Dans Xcode : sélectionner le schéma App et un simulateur, puis Build/Run. Pour l'iPhone : sélectionner
l'équipe de signature autorisée et l'appareil, puis Build/Run. Ne pas committer certificat ou profil.
Ne pas importer de compte Apple ni acheter d'abonnement depuis les outils de l'agent.
TestFlight/distribution et signature de publication viendront après la recette, avec les comptes appropriés.

## Critères de recette avant de valider définitivement le socle

- Démarrage web/Android/iOS ; pas de session ou activité fictive.
- Connexion avec un compte DEV existant, fermeture complète et restauration.
- Déconnexion d'un appareil, sans fermer la session d'un second appareil.
- E-mail de confirmation et récupération : réception, ouverture à froid/à chaud, expiration et mauvaise origine.
- Refus d'un lien mal formé et doublon du callback ; aucun secret visible dans les journaux.
- Stockage natif : témoin, écran verrouillé, reprise, redémarrage et réinstallation.
- Photo choisie, refus d'autorisation, abandon du sélecteur, reprise après mise en arrière-plan.
- Clavier, zones sûres, rotation et bouton retour Android ; pas de perte de formulaire inattendue.
- Ensuite : inscription avec 18+/conditions et traçabilité serveur, récupération complète, accueil protégé,
  navigation « Plein air ». Ce sont les prochains lots, pas des fonctions livrées par ce banc.

État actuel : tests unitaires avec doubles natifs, typecheck, compilation web et synchronisation des projets.
Les tests unitaires ne valident pas Keychain, Keystore, GoTrue, les e-mails ou un binaire natif.

## Sources consultées le 17 novembre 2026

- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/updating/8-0
- https://capacitorjs.com/docs/apis/app
- https://capacitorjs.com/docs/apis/camera
- https://github.com/aparajita/capacitor-secure-storage
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession
