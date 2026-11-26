# Services : carte de l’annuaire

## Ce que fait ce lot

La recherche Services affiche ses résultats en liste **et** sur une carte. Sur ordinateur (≥ 900 px), la liste et la carte sont côte à côte, la carte restant visible au défilement. Sur téléphone, un sélecteur « Liste / Carte » montre l’une ou l’autre.

- Un repère par activité trouvée : nom et distance arrondie. Le repère et la ligne de liste sont synchronisés dans les deux sens : survol ou focus d’une ligne → son repère passe en coquelicot ; clic sur un repère → la ligne est marquée (et ramenée à l’écran sur ordinateur).
- Le repère sélectionné ouvre une mini-fiche (`MapCard`) ; la mini-fiche ouvre la fiche de l’établissement. Un clic sur le fond de carte ou à nouveau sur le repère la ferme.
- Ville, rayon ou catégorie modifiés : nouvelle recherche, liste et repères remplacés ; une sélection qui n’existe plus est oubliée. Le cercle et l’échelle suivent le rayon choisi.
- GPS refusé : message d’erreur, la recherche par ville et ses résultats restent affichés, aucune nouvelle requête.
- Au retour d’une fiche, recherche, vue (liste ou carte) et repère sélectionné sont retrouvés (état en mémoire de l’écran, rien en stockage).
- États : « Recherche en cours… » (carte marquée occupée), « Résultats indisponibles » avec le bouton Réessayer au-dessus, et « Aucune activité à moins de N km » avec l’action « Élargir la recherche » de la liste.

## Fond de carte Mapbox

- **Position autorisée** : `search_professionals` renvoie `latitude` / `longitude`, c'est-à-dire la position déjà enregistrée du professionnel, **le centre de la commune qu'il a choisie, arrondi à 0,01° (≈ 1 km)**. Aucune adresse n'existe en base ; rien de plus précis n'est publié. La note sous les résultats le dit : « chaque activité est placée au centre de sa commune, pas à son adresse ». Migration `20261126133706_professional_map_position` (appliquée sur DEV le 26 novembre 2026), retour arrière `supabase/operations/rollback_professional_map_position.sql`.
- **Jetons** : `VITE_MAPBOX_TOKEN_WEB` (site, restreint à `http://localhost:5173`, `https://furrix.fr`, `https://www.furrix.fr`) et `VITE_MAPBOX_TOKEN_APP` (iOS / Android, sans restriction d'URL, choisi quand l'app tourne dans Capacitor). Jetons publics `pk.` uniquement, dans `.env.local` / `.env.mobile.local`, jamais commités.
- **Coût et chargement** (`src/maps/mapbox.ts`, `src/maps/MapboxLayer.tsx`) :
  - la bibliothèque (`mapbox-gl` 3.34.2, fichier séparé d'environ 545 ko compressés) n'est téléchargée qu'à la première carte affichée ;
  - la carte n'est créée que lorsque son cadre devient visible (sur téléphone, pas tant que « Liste » est choisi) ;
  - une seule instance : filtres, rayon et sélection ne font que mettre à jour les repères, le cercle et le cadrage ; à l'ouverture d'une fiche, la carte est mise de côté et reprise au retour (pas de nouveau chargement facturé), puis libérée après 10 minutes sans usage ;
  - aucun téléchargement de zones hors ligne : seul le cache normal du navigateur et de Mapbox.
- **Repères** : les activités d'une même commune partagent un repère « N activités » ; la mini-fiche propose alors « précédente / suivante » (« 1 / 2 au même endroit »). Les repères qui se chevaucheraient à l'écran sont réunis en « N activités proches » ; un clic zoome pour les séparer. Sélection synchronisée avec la liste comme avant ; le repère choisi revient dans le cadre s'il en sortait.
- **Cadrage** : le cercle du rayon est dessiné autour de la ville ou de la position, et la carte s'y ajuste à chaque nouvelle recherche seulement (pas au retour d'une fiche, pour garder le zoom de la personne).
- **Gestes** : sur ordinateur, la molette fait défiler la page (Ctrl + molette pour zoomer) ; sur téléphone, la carte se manipule directement. Rotation et inclinaison désactivées, boutons de zoom de 44 px, textes Mapbox en français. Logo et crédits Mapbox (obligatoires) restent visibles sous la mini-fiche.
- **Repli** : sans jeton, jeton refusé (401/403), bibliothèque impossible à charger ou résultats sans position, la carte schématique du lot précédent reprend automatiquement.
- **Confidentialité** : Mapbox reçoit les demandes de tuiles de la zone affichée (donc la ville cherchée, à l'échelle de la carte) et ses statistiques de chargement ; jamais la position GPS précise, qui reste arrondie à ≈ 1 km avant toute recherche.

## Garde et Rencontres (26 novembre 2026)

Les trois cartes de l'app utilisent désormais `ResultsMap` et le même fond Mapbox (même instance réutilisée d'un écran à l'autre).

- **Secteur des particuliers** : `search_sitters` et `discover_pets` renvoient `latitude` / `longitude` = zone enregistrée (commune du gardien, zone de rencontre de l'animal) **arrondie à 0,05°** (≈ 5,5 km nord-sud, ≈ 3,5 km est-ouest). Plusieurs foyers partagent le même point ; la zone enregistrée (≈ 1 km) n'est jamais renvoyée. Un animal sans zone n'a pas de secteur (`null`) et reste seulement dans la liste. Migration `20261126134843_map_sectors` (appliquée sur DEV), retour arrière `supabase/operations/rollback_map_sectors.sql`, à exécuter **avant** `rollback_pet_profile_retirement.sql` (même fonction `discover_pets`).
- **Garde** (`src/sitting/Search.tsx`) : carte centrée sur le lieu de la garde avec le cercle du rayon ; repère = prénom et tarif ; survol ou focus d'une ligne ↔ repère ; la mini-fiche ouvre le gardien. Sur téléphone, sélecteur « Liste / Carte » comme Services.
- **Rencontres** (`src/meetings/Rencontres.tsx`, vue Carte) : carte centrée sur sa propre zone (lue par son seul propriétaire, `myLocation`), cercle du rayon choisi ou, « Sans limite », cadrage sur tous les profils. La mini-fiche garde la photo de l'animal et ouvre sa fiche.
- Résultats au même point : « N résultats dans le même secteur », puis précédente / suivante dans la mini-fiche (Services : « au même endroit »).
- **Textes mis à jour** pour rester vrais : enregistrement de zone et filtres Rencontres, en-tête du profil gardien (« ton secteur sur la carte (≈ 5 km) »), notes sous les cartes.
- Sans jeton ou sans secteurs côté serveur, Garde passe à la carte schématique et Rencontres garde sa carte illustrative.

## Réutilisation

## Validation

Lot Garde et Rencontres (26 novembre 2026) : Vitest 399/399 dont 2 scénarios (`src/maps/mapbox-map.test.tsx`) — Garde : gardiens du même secteur réunis, sélection liste ↔ carte, mini-fiche → gardien ; Rencontres : profils par secteur autour de sa zone, profil sans zone signalé, mini-fiche → fiche. Tests SQL 172/172 (secteurs renvoyés, `null` sans zone, retours arrière dans l'ordre). Aperçu navigateur à 375 px avec le vrai jeton : cadrage « Sans limite » sur tous les profils. Non vérifié connecté sur les données DEV ni sur un vrai téléphone.

Lot Mapbox (26 novembre 2026) :

- Vitest : suite complète verte, dont 6 nouveaux scénarios (`src/maps/mapbox-map.test.tsx`, bibliothèque Mapbox simulée) : rien de créé avant que la carte soit visible ; une seule carte pour filtres, rayon et retour de fiche ; repère commun d'une commune avec précédente / suivante synchronisées avec la liste ; jeton refusé → carte schématique ; serveur sans positions → schématique ; regroupement à l'écran.
- Tests SQL : 172/172, dont les colonnes renvoyées, l'arrondi et le retour arrière de la migration.
- Navigateur avec le vrai jeton web (page d'aperçu temporaire, données d'exemple autour de Lille, non commitée) à 375 px et sur ordinateur : fond chargé une seule fois, cercle et cadrage, regroupement puis zoom, sélection, « 1 / 2 au même endroit », mini-fiche au-dessus des crédits, changement de rayon sans nouvelle carte. Non vérifié avec un compte connecté sur les vraies données DEV, ni sur un vrai téléphone (jeton app).

Lot schématique :

- Vitest : suite complète 391/391, dont 7 nouveaux scénarios (`src/professionals/directory-map.test.tsx`) : synchronisation liste ↔ repères, mini-fiche → fiche → retour avec sélection, actualisation par rayon, GPS refusé, chargement → erreur → aucun résultat, bascule téléphone conservée au retour, placement schématique.
- Contrôle des types et compilation web réussis.
- Aperçu local avec données simulées (8 établissements, noms longs) à 375 et 1280 px : aucun chevauchement de repères, aucun débordement horizontal, aucune erreur JavaScript ; retour navigateur depuis une fiche vérifié. Non vérifié sur un vrai téléphone.
- Aucune migration Supabase dans le lot schématique.
