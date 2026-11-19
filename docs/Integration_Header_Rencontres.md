# Integration du header et des rencontres - 19 novembre 2026

Branche : feat/integration-header-rencontres. Base main : 405d30c.
Le lot reprend fix/rattrapage-design-system (b59d78a, PR #18) et feat/rencontres (e4dd8fb, avec feat/header b0c15cf).
Les branches d'Alexis et les anciens commits sont conserves. La PR #18 est incluse dans cette integration ; aucune fusion distante n'est effectuee par ce lot.

## Assemblage

- Header Plein air, acces Animaux perdus, cloche des notifications locales, menu du compte sur telephone et ordinateur.
- Un seul chargement periodique des notifications dans la coque ; absence du service animaux perdus toleree.
- Formulaires animaux conserves sur le design system, avec les champs rencontres ajoutes par Alexis.
- Decouverte cartes/liste/vue de proximite, j'aime reciproque, match, liste des conversations, messages et propositions apres match.
- Actualisation des nouveaux matchs toutes les 15 secondes quand la page est visible, et au retour dans la fenetre.
- Messages : nouveaux messages lus en ordre croissant pour ne pas sauter un lot de plus de 50 ; anciens messages accessibles par pagination. Envoi protege contre un second clic et identifiant conserve apres echec.
- Cache prive des photos libere a la deconnexion ou au changement de compte ; une reponse tardive ne recree pas une URL de l'ancienne session.
- Recherche de commune adaptee au service Geoplateforme : https://data.geopf.fr/geocodage/search (remplacement de l'ancienne API Adresse).

## Etat distant observe en lecture seule

Le projet DEV jemikzqgbpaivlujnfgl annonce deja les migrations meeting_profile (20261118150851), after_match (20261118154656) et meetings_performance (20261118190424). Le travail d'Alexis comprend donc du serveur, pas seulement les maquettes. Ces trois fichiers sont repris sans modification.
La migration lost_pets_local_alerts (20261118122724) est absente de cet historique ; local_notifications est absente de la base. Ne pas presenter les alertes locales comme operationnelles sur DEV a cette etape.

## Correctif SQL propose, non applique

20261119082707_meeting_integration_safety.sql est une NOUVELLE migration :
- swipe_and_match refuse une cible bloquee meme en appel direct ;
- meeting_photo_visible refuse une nouvelle lecture de photo entre comptes bloques ;
- create_meeting_proposal relit la cle de rejeu sous le verrou du match, avant de tester une proposition deja ouverte.
Aucun fichier de migration deja applique n'est modifie. Pas de db push ni de modification Supabase pendant l'integration. Revoir et autoriser ce correctif separement avant application DEV.

## Verification et limites

Les controles executes et leurs resultats sont reportes dans la livraison. Les tests SQL utilisent PGlite local, avec Auth et Storage simules : ils ne prouvent pas les appels reels aux services Supabase ni la concurrence entre plusieurs connexions PostgreSQL.
Le navigateur utilise des donnees fictives locales pour verifier header, match, conversation, menu telephone et navigation. Les supports temporaires sont retires avant commit.
La vue Carte est une illustration de proximite ; les directions ne sont pas des positions geographiques reelles. Ni Mapbox ni notifications push ne sont livres ici.
Pas de compilation APK/IPA ni d'essai natif. Recette reelle a faire avec Guillaume, Yannis et Alexis : deux j'aime reciproques sur les bons animaux, annonce du match des deux cotes, messages, proposition et acceptation, signalement/blocage.

Validation finale locale : 143/143 Vitest, 71/71 tests Node SQL (tests parents compris), controle des types et build de production. Aucun PostgreSQL distant ou natif teste par ces commandes.
Le build conserve un avertissement preexistant dans Furrix.jsx (cle transition dupliquee dans le prototype ancien), hors du code integre.
