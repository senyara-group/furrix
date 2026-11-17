# Authentification — 17 novembre 2026

## Livraison locale

Branche `feat/authentication`, issue de `main` après fusion de la PR #5.
`npm run dev:auth` lance le parcours séparé, `npm run build:auth` le compile.
`npm run auth:sync` compile ce parcours puis le copie dans Android/iOS ; `platform:sync` reste réservé
au banc technique du lot précédent. La synchronisation ne compile pas les binaires natifs.
Le point d'entrée par défaut du dépôt reste le prototype initial jusqu'à validation de la nouvelle interface.
Le code des composants d'Alexis n'est pas modifié ; l'habillage auth est isolé dans `src/auth/auth.css`.
Les formulaires HTML pourront utiliser ses composants sans réécrire la logique.

Parcours préparés :

- inscription avec mot de passe confirmé, déclaration 18+, acceptation des CGU et prise de connaissance
  de la confidentialité (distincte d'un consentement marketing, aucun opt-in ajouté) ;
- confirmation d'e-mail, renvoi du lien et réponse générique si l'adresse existe déjà ;
- connexion, restauration, déconnexion locale ;
- mot de passe oublié, réception `PASSWORD_RECOVERY`, nouveau mot de passe et déconnexion avant reconnexion ;
- liens invalides/expirés, erreurs réseau, chargement et absence de configuration sans compte fictif ;
- vérification serveur des versions acceptées avant l'écran de compte prêt ;
- déclarations manquantes pour un compte ancien : recueil puis relecture serveur avant de continuer.

L'écran « compte prêt » est un point d'arrivée minimal. L'accueil, les animaux et le menu complet
« Plein air » constituent le prochain lot. Aucune rencontre, réservation ou fonctionnalité payante n'est simulée.

## Activation et dépendances distantes

Les modèles de `legal-pages/` sont vides. Aucun texte n'a été inventé ou déclaré validé.
Les inscriptions sont donc désactivées par défaut dans le nouveau parcours. Renseigner uniquement après
validation des contenus :

```dotenv
VITE_REGISTRATION_ENABLED=true
VITE_TERMS_URL=https://<domaine>/conditions
VITE_TERMS_VERSION=<version-publiee>
VITE_PRIVACY_URL=https://<domaine>/confidentialite
VITE_PRIVACY_VERSION=<version-publiee>
```

Ces valeurs sont publiques et intégrées au build. URL HTTPS sans identifiants, versions non vides de
80 caractères maximum. Ce contrôle vérifie la configuration, pas le contenu ou la validité juridique des pages.
Supabase doit aussi autoriser l'inscription e-mail, la confirmation, les URL de retour exactes et un envoi
d'e-mails fonctionnel. Aucune configuration Auth/SMTP n'a été modifiée ni inspectée dans cette livraison.

`VITE_SUPABASE_URL` et la clé publique restent dans `.env.local` ignoré. Aucun compte réel n'a été créé,
aucun e-mail envoyé et aucun mot de passe changé par l'agent.

## Migration préparée, non appliquée

`20261117094847_registration_consent.sql`, créée par le CLI local 2.122.0.

- `registration_consents` : utilisateur, versions CGU/confidentialité, déclaration de majorité, heure serveur,
  origine `signup` ou `account`. Clé primaire utilisateur + deux versions.
- À la création d'un utilisateur, un trigger copie les déclarations initiales valides depuis les métadonnées.
  Pas de déclaration inventée pour les comptes existants. Modifier ensuite user_metadata ne modifie pas la trace.
- Un compte connecté peut déclarer son acceptation par RPC, sans fournir d'identifiant utilisateur ni de date.
  Le rejeu ne remplace pas la première date. La RPC refuse une identité absente et une déclaration incomplète.
- Lecture limitée à son compte par RLS ; aucune écriture directe client. Suppression en cascade si le compte
  Auth est supprimé. Les opérations privilégiées serveur restent possibles : ce n'est pas un journal inviolable.

Ce sont des déclarations d'utilisateur horodatées par le serveur, **pas une vérification d'identité ou d'âge**.
Les versions sont déclaratives ; aucune règle d'autorisation ne repose sur user_metadata.
Ce lot ne fait pas de l'acceptation des documents une nouvelle autorisation RLS pour toutes les tables métier.
La politique de conservation et les textes restent à faire valider avant ouverture publique.

**Aucune application distante autorisée par le commit ou sa fusion.** Les migrations photos/profil
0004/0005 étaient également en attente dans le dernier état connu : vérifier tout l'historique avant
de décider de la séquence, sans `db push` ou rejeu automatique. L'application ne contourne pas un échec
de lecture de la nouvelle table : l'espace connecté reste bloqué avec possibilité de réessayer/déconnecter.

## Retours web et mobiles

Même infrastructure PKCE que le lot plateforme. Les paramètres sensibles sont retirés de l'URL web
après initialisation du SDK. Le SDK émet `PASSWORD_RECOVERY` et le formulaire de nouveau mot de passe
reste prioritaire sur l'espace connecté. Le retour natif transmet aussi `sb_flow_id` afin de retrouver
le vérificateur correspondant lorsqu'il existe plusieurs demandes locales.

Le lien doit être ouvert dans le navigateur/application qui l'a demandé. Les essais réels (confirmation,
expiration, rejeu, récupération, verrouillage, fermeture/reprise) restent nécessaires sur web/Android/iPhone.
La sortie de récupération passe par une déconnexion locale explicite. Une politique de révocation des
autres appareils et une interface « déconnecter partout » ne sont pas livrées ici.

## Vérifications

Exécuté localement le 17 novembre : **60 tests applicatifs, 23 tests SQL Node**, TypeScript et compilation
`build:auth` réussis ; `auth:sync` réussi sur les projets Android/iOS. Contrôle visuel Chromium ordinateur
et 390 × 844, avec configuration locale factice sur domaine `.invalid`, sans requête Auth réelle.
Les vues connexion et inscriptions fermées ont été inspectées. Aucun binaire natif compilé.

Les tests utilisent un client Auth simulé, sans réseau : inscription refusée sans déclarations, transmission
des versions, message de récupération générique, changement de mot de passe, erreurs et protection
contre une vérification des conditions impossible. Les tests natifs vérifient le transfert du flux PKCE.

Le test SQL utilise PGlite jetable : timestamp serveur, RLS entre comptes, refus anon/identité absente,
écritures directes interdites, rejeu sans réécriture de date et indépendance des métadonnées modifiables.
Il ne valide pas le trigger dans le service GoTrue réel ni ses privilèges de production.

Avant validation fonctionnelle distante, tester avec des comptes DEV et textes approuvés : inscription,
confirmation à froid/à chaud, connexion, oubli, lien expiré, mot de passe différent, déconnexion/reprise,
compte ancien sans trace, deux appareils. Ne pas utiliser les vrais mots de passe de collaborateurs.

Sources techniques :
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/reference/javascript/auth-updateuser
