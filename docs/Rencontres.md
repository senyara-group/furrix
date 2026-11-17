# Rencontres — premier parcours bêta

Lot récupéré après interruption (commit `c0c4681`), revu puis complété sans réimplémentation. Il ajoute :

- le choix de l'animal actif ;
- la découverte en cartes et en liste, avec filtres et une localisation approximative facultative ;
- les j'aime et les matchs réciproques ;
- une conversation gratuite après match.

Code client dans `src/meetings`, serveur dans `supabase/migrations/20261117131807_animal_meetings.sql`.

## Fonctionnement

- **Animal actif.** On choisit au nom de quel animal on découvre et on écrit. Le choix est gardé par compte et par onglet (`sessionStorage`), puis revérifié contre les animaux du compte. Il n'est pas synchronisé entre appareils.
- **Découverte.**
  - Elle passe uniquement par la RPC `discover_pets`. Celle-ci exige l'accès bêta et la propriété de l'animal actif.
  - Elle exclut ses propres animaux, les profils déjà décidés et les comptes dont l'accès bêta n'est plus valide.
  - Filtres : espèce, objectif et rayon (de 1 à 500 km, seulement si l'animal actif est localisé). Pagination par 20.
  - Seule la photo principale est renvoyée. Aucun score de compatibilité.
- **Localisation.**
  - Facultative, demandée sur action explicite, en précision réduite (permission « approximative » sur Android).
  - Arrondie à 0,01° (environ 1 km), propre à chaque animal et effaçable.
  - Les autres ne voient qu'une distance arrondie au kilomètre.
  - Limite assumée : en multipliant les rayons, un testeur peut retrouver la maille d'environ 1 km.
- **Décisions.**
  - `swipe_and_match` n'accepte que `left` et `right`.
  - Une décision enregistrée ne change plus pendant la bêta : la décision contraire est refusée (code `23505`), la même est rejouable.
  - Le match est créé dans la même transaction, sous un verrou propre à la paire et identique dans les deux sens.
  - La RPC renvoie l'identifiant du match à chaque rejeu, et `null` tant que le j'aime n'est pas réciproque.
- **Conversation.**
  - Envoi par `send_match_message`, avec un identifiant de requête produit par le client : un double clic ou un nouvel essai ne crée pas de doublon.
  - Lecture paginée par 50, actualisée toutes les 10 secondes (pas de temps réel). L'état « lu » n'est pas géré.
- **Photos.** Les testeurs actifs peuvent lire la photo principale des autres testeurs actifs, et elle seule. Aucune écriture partagée.
- **Écritures directes.** Les écritures sur `swipes`, `matches` et `messages` sont retirées aux rôles clients, y compris les droits par colonne et ceux hérités.

## Revue du 17 novembre 2026

Corrections apportées à la migration, qui n'était encore appliquée nulle part :

- **Statut de l'autre testeur.** Un match reste visible et la conversation reste ouverte seulement si l'autre testeur a toujours un accès bêta valide. Sinon, il disparaît de la liste et l'envoi est refusé (« Conversation indisponible »). L'historique déjà échangé reste lisible.
- **Fonction interne commune.** Ce statut est vérifié par `meeting_member_active`, inexécutable par les clients : on ne peut pas sonder si un identifiant quelconque est membre de la bêta.
- **Ordre des vérifications.** La propriété de l'animal est vérifiée avant de prendre le verrou de la paire.

Points relevés, non traités dans ce lot :

1. **Table `pets` lisible en entier par tout testeur.** Cela vient de `main` (règle « pets visibles » de 0001). Un testeur peut lire directement les autres animaux avec toutes leurs colonnes : santé, allergies, coordonnées `lat`/`lng` si elles ont été renseignées par l'API, et tous les chemins de photos (les fichiers eux-mêmes restent protégés, sauf la photo principale). Même situation pour `profiles`.
   - Correction proposée : limiter la lecture à son propriétaire, puisque la découverte passe par la RPC.
   - Ce changement oblige à réécrire la règle de lecture de `messages`, qui joint les deux animaux du match. Il est donc à décider et à tester séparément.
2. **Ni blocage, ni signalement, ni annulation de match.** À traiter avant d'ouvrir la conversation à des testeurs extérieurs à l'équipe.
3. **Pas de limite de fréquence** sur les décisions et les messages.
4. **Version de la notice bêta répétée en dur** (`2026-11-17`) dans plusieurs fonctions. Changer de notice demandera une migration qui les met toutes à jour.

## Tests

- **Applicatifs** : `npm test` (Vitest), 93/93.
- **SQL sur PGlite** : `npm run test:sql`, 36/36. Ils couvrent les autorisations, le rejeu, la découverte, la localisation, les photos, les messages, la révocation et désormais la révocation de l'autre testeur.
- **Concurrence sur un vrai PostgreSQL** : `FURRIX_TEST_PG_URL=postgres://… npm run test:pg --prefix supabase/tests`.
  - Le test crée puis supprime sa propre base, sur un serveur jetable. Ne jamais le pointer vers Supabase DEV.
  - Il vérifie :
    - 100 paires de j'aime simultanés (une connexion par appel) ;
    - les rejeux simultanés après match ;
    - les décisions contradictoires simultanées ;
    - cinq envois parallèles du même message.
  - Sans URL, il est ignoré.
  - Contrôle : avec la fonction de `main`, le même scénario perd entre 65 et 147 matchs sur 150 selon les essais ; avec ce lot, aucun.
- **Retour arrière** : le script commenté en tête de la migration a été exécuté puis la migration réappliquée, sur PostgreSQL 16 local.

## Recette

- **Faite** : parcours d'interface avec le support de revue et un faux client, sur ordinateur (1280 px) et téléphone (390 px). Découvrir, fiche, j'aime, match, liste des matchs, conversation, envoi. Aucune erreur JS, aucun débordement horizontal, cibles tactiles d'au moins 44 px.
- **À faire après application sur DEV**, avec trois comptes bêta et des animaux fictifs :
  1. A et B localisent leur animal ; C ne le fait pas. Vérifier la distance, le rayon et l'exclusion de C du rayon.
  2. A passe le profil de C, aime celui de B ; B aime celui de A. Le match apparaît des deux côtés. Rejouer le j'aime : même match.
  3. Conversation dans les deux sens, double clic sur Envoyer, coupure réseau puis nouvel essai : pas de doublon.
  4. C ne voit ni le match ni les messages, et ne peut pas écrire.
  5. Retirer l'accès bêta de B : A ne voit plus le match ni la découverte de B, ne peut plus lui écrire, et la photo de B n'est plus lisible.
  6. Supprimer la localisation de A : la distance disparaît, le filtre de rayon est désactivé.
- **Android et iOS**, sur appareils réels : permission de localisation approximative (refus, puis acceptation), retour d'arrière-plan, geste de balayage, clavier ouvert dans la conversation, actualisation après mise en veille. La compilation APK/IPA n'a pas été faite dans cet environnement (ni SDK Android, ni macOS).

## Application sur Supabase DEV

Elle n'est pas faite et demande un accord explicite :

- cible `jemikzqgbpaivlujnfgl` ;
- uniquement cette migration, après `20261117110807_private_beta`, déjà présente ;
- retour arrière : script en tête du fichier.

Ne rejouer aucune migration antérieure.
