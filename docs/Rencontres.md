# Rencontres — premier parcours bêta

Lot récupéré après interruption (commit `c0c4681`), revu puis complété sans réimplémentation. Il ajoute :

- le choix de l'animal actif ;
- la découverte en cartes et en liste, avec filtres et une localisation approximative facultative ;
- les j'aime et les matchs réciproques ;
- une conversation gratuite après match.

Code client dans `src/meetings`.

## Ordre des migrations

Appliquées sur DEV le 17 novembre 2026, dans cet ordre, après `20261117110807_private_beta` (inchangée). Supabase leur a attribué de nouvelles versions : les fichiers ont été renommés sans modification (voir `supabase/meetings-migration-alignment.json`). Leurs commentaires citent encore les noms d'avant application.

1. `20261117151857_private_beta_access_duration.sql` :
   - accès sans échéance (`expires_at` NULL) ou à durée comptée depuis l'activation, toujours révocable par `active=false` ;
   - condition unique `private_beta_member_active` ;
   - activation par `grant_private_beta_access`.
2. `20261117152002_animal_meetings.sql` : tables, RPC et règles des rencontres. Toutes ses vérifications du statut d'un autre testeur passent par la condition de la migration 1.
3. `20261117152050_meetings_privacy.sql` : lecture directe de `pets` et `profiles` réservée au propriétaire. Elle s'appuie sur les RPC de la précédente et ne doit pas être appliquée seule.

Chaque fichier contient en tête son retour arrière. Pour revenir en arrière, défaire dans l'ordre inverse (3, puis 2, puis 1). Avant le retour arrière de la migration 1, chaque accès sans échéance doit recevoir une date explicite ou être retiré.

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

## Confidentialité des profils

- **Lecture directe.** Un compte ne lit directement que ses propres animaux et son propre profil. La lecture anonyme de ces tables est retirée.
- **Seuls chemins vers les données des autres testeurs**, des RPC qui choisissent explicitement leurs colonnes :
  - `discover_pets` : nom, espèce, race, âge, sexe, objectif, ville, présentation, photo principale, prénom du propriétaire et distance arrondie. L'identifiant du propriétaire est renvoyé aussi, car il figure déjà dans le chemin de la photo principale et sert à le contrôler côté client.
  - `list_pet_matches` : pour ses seuls matchs.
- **Jamais exposé aux autres :** santé (vaccins, stérilisation, puce), allergies, alimentation, poids, coordonnées de `pets`, rôle, abonnement ni présentation du profil.
- **Messages.** La lecture passe par `is_match_participant`, qui ne renseigne que sur l'appelant. L'ancienne règle joignait les deux animaux du match et aurait cessé de fonctionner avec des animaux privés. La règle d'insertion directe, devenue inutile, est supprimée.
- **Inchangés :** les matchs (lus via son propre animal), les photos (règles de dossier du propriétaire, et photo principale partagée via `meeting_photo_visible`) et la localisation de rencontre.

## Revue du 17 novembre 2026

Corrections apportées à la migration, qui n'était encore appliquée nulle part :

- **Statut de l'autre testeur.** Un match reste visible et la conversation reste ouverte seulement si l'autre testeur a toujours un accès bêta valide. Sinon, il disparaît de la liste et l'envoi est refusé (« Conversation indisponible »). L'historique déjà échangé reste lisible.
- **Fonction interne commune.** Ce statut est vérifié par `meeting_member_active`, inexécutable par les clients : on ne peut pas sonder si un identifiant quelconque est membre de la bêta.
- **Ordre des vérifications.** La propriété de l'animal est vérifiée avant de prendre le verrou de la paire.

Points relevés, non traités dans ce lot :

1. **Table `pets` lisible en entier par tout testeur** (règle « pets visibles » de 0001, venue de `main`) : corrigé par `20261117152050_meetings_privacy.sql`, voir ci-dessus.
2. **Blocage et signalement** intégrés dans le lot après-match. La fermeture définitive d’un match est préparée dans le lot [Fin de match](Fin_Match.md), avec une migration supplémentaire à valider avant application DEV.
3. **Pas de limite de fréquence** sur les décisions et les messages. Même échéance.
4. **Version de la notice bêta répétée en dur** (`2026-11-17`) dans plusieurs fonctions. Changer de notice demandera une migration qui les met toutes à jour.

## Tests

- **Applicatifs** : `npm test` (Vitest), 93/93.
- **SQL sur PGlite** : `npm run test:sql`, 52/52 (dont `beta-access-duration.test.mjs` : accès sans échéance, à durée, expirés et révoqués, activation et conservation de la notice). Ils couvrent les autorisations, le rejeu, la découverte, la localisation, les photos, les messages et la révocation.
  - `meetings-privacy.test.mjs` y ajoute la lecture directe par un autre compte, les colonnes exactes de la découverte, la conversation entre participants et le refus d'un tiers, ainsi que la révocation de l'autre testeur puis celle de l'appelant.
  - Contrôle : sans la migration de confidentialité, deux de ces scénarios échouent.
- **Concurrence sur un vrai PostgreSQL** : `FURRIX_TEST_PG_URL=postgres://… npm run test:pg --prefix supabase/tests`.
  - Le test crée puis supprime sa propre base, sur un serveur jetable. Ne jamais le pointer vers Supabase DEV.
  - Il vérifie :
    - 100 paires de j'aime simultanés (une connexion par appel) ;
    - les rejeux simultanés après match ;
    - les décisions contradictoires simultanées ;
    - cinq envois parallèles du même message.
  - Sans URL, il est ignoré.
  - Contrôle : avec la fonction de `main`, le même scénario perd entre 65 et 147 matchs sur 150 selon les essais ; avec ce lot, aucun.
- **Retour arrière** : pour chacune des deux migrations, le script commenté en tête a été exécuté puis la migration réappliquée, sur PostgreSQL 16 local.

## Recette

- **Faite** : parcours d'interface avec le support de revue et un faux client, sur ordinateur (1280 px) et téléphone (390 px). Découvrir, fiche, j'aime, match, liste des matchs, conversation, envoi. Aucune erreur JS, aucun débordement horizontal, cibles tactiles d'au moins 44 px.
- **Confirmé par Guillaume sur DEV** : l'invitation Auth a fonctionné et le mot de passe a été défini. Aucun autre scénario réel n'a encore été confirmé.
- **Prêts côté serveur, non testés** : accès bêta actif sans échéance pour Guillaume et Yannis. Yannis n'a pas encore ouvert son invitation, et aucune notice n'a encore été acceptée.
- **Avec un seul compte, à tester** : acceptation de la notice, création d'un animal et de sa photo, localisation approximative puis suppression, découverte vide.
- **Avec plusieurs comptes bêta et des animaux fictifs, à tester** :
  1. A et B localisent leur animal ; C ne le fait pas. Vérifier la distance, le rayon et l'exclusion de C du rayon.
  2. A passe le profil de C, aime celui de B ; B aime celui de A. Le match apparaît des deux côtés. Rejouer le j'aime : même match.
  3. Conversation dans les deux sens, double clic sur Envoyer, coupure réseau puis nouvel essai : pas de doublon.
  4. C ne voit ni le match ni les messages, et ne peut pas écrire.
  5. Retirer l'accès bêta de B : A ne voit plus le match ni la découverte de B, ne peut plus lui écrire, et la photo de B n'est plus lisible.
  6. Supprimer la localisation de A : la distance disparaît, le filtre de rayon est désactivé.
- **Android et iOS**, sur appareils réels : permission de localisation approximative (refus, puis acceptation), retour d'arrière-plan, geste de balayage, clavier ouvert dans la conversation, actualisation après mise en veille. La compilation APK/IPA n'a pas été faite dans cet environnement (ni SDK Android, ni macOS).

## Application sur Supabase DEV (17 novembre 2026)

- **État préalable vérifié :** historique arrêté à `private_beta`, aucun objet des nouvelles migrations, tables des rencontres vides.
- **Application :** les trois migrations dans l'ordre, chacune réussie. Le SQL enregistré par Supabase a la même empreinte MD5 que les fichiers locaux.
- **Permissions effectives contrôlées :**
  - `authenticated` n'a que SELECT sur `swipes`, `matches`, `messages` et `pet_meeting_locations` ;
  - `anon` n'a aucun droit sur `pets` et `profiles` ;
  - `grant_private_beta_access`, `private_beta_member_active` et `meeting_member_active` ne sont exécutables que par `service_role` (et le propriétaire) ;
  - bucket `pet-photos` privé.
- **Accès accordés :** deux comptes de l'équipe, sans échéance, via `grant_private_beta_access`. Aucune notice n'a été acceptée à leur place. Aucun autre accès n'a été accordé.
- **Conseillers de sécurité :** les avertissements sur les RPC privilégiées sont attendus (points d'entrée voulus, avec contrôle interne). Points antérieurs restants : `handle_new_user` exécutable par `anon`, `touch_updated_at` sans `search_path` fixe, protection contre les mots de passe compromis désactivée dans Auth.
