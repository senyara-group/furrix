# Bêta privée Furrix

Première vague : Guillaume, Alexis et Yannis uniquement. Chaque personne utilise son propre compte et choisit son mot de passe. Aucun mot de passe partagé, aucune adresse de testeur dans le dépôt.

## Préparation locale, activation non effectuée

La variable `VITE_PRIVATE_BETA=true` affiche le parcours privé. Elle ne constitue pas une protection de la base : la migration `20261117104702_private_beta.sql` ajoute une liste d'accès serveur et des politiques restrictives aux tables publiques existantes ainsi qu'au stockage. Un compte doit être autorisé, non expiré et avoir confirmé la notice et sa déclaration 18+. Il ne peut pas s'autoriser lui-même.

Le client vérifie l'accès avant de monter l'application, puis toutes les 60 secondes et au retour dans la fenêtre. Une erreur ferme l'accès. La base contrôle chaque nouvelle requête ; une révocation ne retire pas les données déjà téléchargées. Les nouvelles tables et les futures fonctions privilégiées devront intégrer ce contrôle explicitement.

La RPC de swipe possède aussi un contrôle explicite, car elle contourne la RLS. Ses défauts de concurrence et de rejeu ne sont pas résolus par ce lot. Les clés serveur restent exclusivement côté serveur.

## État distant constaté le 17 novembre 2026

Projet DEV `jemikzqgbpaivlujnfgl`, région `eu-west-1` : aucun utilisateur, profil ou animal ; uniquement les migrations 0001 à 0003 ; aucune Edge Function déployée. Les 19 tables publiques ont la RLS active. Le bucket `pet-photos` est encore public. Ces observations ont été faites en lecture seule.

Les migrations photos 0004, contraintes 0005, consentement d'inscription et bêta restent à appliquer après revue et accord. Ne pas rejouer 0001 à 0003, ni utiliser `db push` sans comparaison préalable de l'historique. Si l'outil distant attribue une autre version, aligner ensuite le nom local à SQL strictement identique avant tout usage ultérieur du CLI.

## Ordre d'activation proposé, à autoriser

1. Revoir les quatre migrations en attente, confirmer la cible DEV et comparer son historique. Appliquer les quatre dans l'ordre, puis contrôler leurs versions, ACL et politiques effectives.
2. Dans Supabase Auth, désactiver les nouvelles inscriptions publiques. Cette configuration distante n'a pas été vérifiée ici. Conserver l'ouverture publique désactivée même si le formulaire client est fermé.
3. Définir la Site URL sur `https://furrix.vercel.app` et contrôler les redirections web et natives documentées dans `Architecture_Web_Mobile.md`. Le projet est celui de DEV, même si Vercel appelle son déploiement « Production ».
4. Configurer le modèle d'invitation avec `supabase/templates/private-beta-invite.html`. Son lien utilise `TokenHash` et la route `/#/auth/invite`, indispensable au parcours préparé. Le modèle par défaut avec jetons dans le fragment n'est pas pris en charge. Vérifier l'envoi SMTP et les redirections sur une première invitation autorisée.
5. Inviter individuellement les trois personnes depuis Supabase Auth, sans créer directement des lignes dans `auth.users`. Récupérer leurs identifiants Auth et ajouter côté administrateur une ligne `private_beta_members` pour chacune, avec une date d'expiration explicitement choisie. Une invitation Auth seule n'autorise pas l'application. Aucun envoi n'a été effectué par ce lot.
6. Définir `VITE_PRIVATE_BETA=true` et `VITE_REGISTRATION_ENABLED=false` dans les environnements Vercel concernés, puis reconstruire. Conserver uniquement l'URL et la clé publique Supabase dans les variables du navigateur.
7. Chaque testeur ouvre son invitation sur le web, confirme le lien, définit son mot de passe puis se reconnecte. Il accepte ensuite la notice. Ce même compte peut ensuite servir sur mobile. Vérifier aussi un compte non autorisé, une expiration et une révocation avant de commencer les tests.

L'expiration est obligatoire et n'a pas été choisie automatiquement. Pour retirer un accès, l'administrateur positionne `active=false` sur la ligne concernée. Désactiver la variable client ne retire pas les protections SQL. L'ouverture publique nécessitera une revue distincte, notamment des documents d'utilisation et de la transition des politiques.

## Périmètre des essais

Utiliser des données fictives uniquement. Aucune garde, prestation vétérinaire ou rencontre réelle ne doit être organisée via cette version. La notice de test ne remplace pas les documents nécessaires à une ouverture publique et n'établit pas une vérification d'âge ou d'identité.

La migration rend les buckets privés. Les anciens liens `getPublicUrl` ne permettront donc plus d'afficher les photos : leur raccordement nécessitera des URL signées de courte durée ou un téléchargement authentifié. Une URL signée déjà délivrée reste utilisable jusqu'à son expiration. La création et l'édition des animaux ne sont pas encore proposées par le nouvel accueil.

Les tests locaux couvrent les refus sans invitation, l'acceptation, l'expiration, la révocation, les restrictions métier conservées et l'isolation du stockage. Les tests SQL utilisent PGlite jetable, pas une stack Supabase complète. L'envoi réel des e-mails, la recette distante et les essais iOS/Android restent à réaliser ; aucun APK ou IPA n'a été compilé dans ce lot.
