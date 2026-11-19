# Préparer les notifications push Furrix

État au 19 novembre 2026 : Guillaume confirme qu’aucun projet Firebase n’existe encore. Les alertes et préférences internes fonctionnent via Supabase ; aucun envoi hors application ni inscription de téléphone aux push n’a été réalisé.

## À préparer dans la console Firebase

1. Se connecter avec le compte Google qui doit gérer Furrix, puis créer un projet nommé Furrix. Conserver l’identifiant de projet réellement attribué ; ne pas en inventer un pour le code.
2. Google Analytics est facultatif : le laisser désactivé pour ce premier branchement transactionnel.
3. Ajouter une application Android avec le nom de package exact `fr.furrix.app` (identique à l’APK installé). Le nom affiché peut être Furrix Android.
4. Télécharger le fichier de configuration `google-services.json` et le garder localement. Il devra être fourni à la compilation dans `android/app/`, après branchement du plugin. Ne pas coller son contenu dans une conversation.
5. Donner l’identifiant du projet et confirmer que l’application Android est enregistrée. Le raccordement serveur utilisera ensuite les accès Google appropriés, conservés dans les secrets Supabase ; aucune clé serveur dans Vite, Git ou l’APK.

Sources : [configuration Android Firebase](https://firebase.google.com/docs/android/setup), [plugin Capacitor 8](https://capacitorjs.com/docs/apis/push-notifications).

## Lot de branchement à réaliser ensuite

- Installer et figer le plugin adapté, synchroniser le projet natif et vérifier sa compilation avec la vraie configuration Firebase.
- Proposer l’activation sur action explicite, après choix d’un secteur ; distinguer abonnement de secteur et autorisation système. Refuser l’autorisation ne doit pas fermer les alertes internes.
- Enregistrer les appareils pour leur compte connecté, gérer rotation de jeton et déconnexion, permettre plusieurs appareils. Ne pas exposer les jetons aux autres comptes ou dans les journaux.
- Envoyer depuis le serveur à partir des destinataires des notifications internes existantes. Le client ne choisit pas librement les autres destinataires. Prévoir reprise, déduplication et suppression des jetons invalides.
- Garder un contenu discret sur écran verrouillé et n’utiliser qu’un identifiant d’alerte pour l’ouverture. Une réception de push ne contourne jamais Auth, la bêta ou les règles d’accès de la fiche.
- Tester sur le Honor : premier refus puis autorisation, application ouverte/fermée, appui sur la notification, secteur désactivé et session déconnectée.

Pour iOS, le Mac, la capacité Push Notifications et les accès Apple/APNs seront nécessaires. Le plugin natif documenté renvoie un jeton APNs sur iOS : il ne faut pas l’envoyer comme un jeton FCM Android. Le choix du raccordement iOS et ses essais restent à réaliser. Aucun achat ou abonnement Apple déclenché ici.

Le projet ne nécessite pas de seconde authentification Firebase, de base Firestore ni d’une campagne marketing pour ce parcours : le compte reste géré par Supabase.
