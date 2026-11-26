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

## Réutilisation (Garde, Rencontres)

Le composant commun est `src/maps/ResultsMap.tsx` :

- `points` : `{ id, name, short?, detail?, tag?, photo?, distanceKm, position? }` — `position` accueillera les coordonnées autorisées renvoyées par le serveur ;
- `radiusKm`, `status` (`loading` · `ready` · `error`), `emptyText` ;
- `selected` / `onSelect` (sélection partagée avec la liste) et `onOpen` (ouvrir la fiche).

Le placement schématique est dans `src/maps/schematic.ts` : distance relative au rayon, repères gardés dans le cadre et écartés pour rester tous cliquables (place libre la plus proche, sinon la moins encombrée). `ResultsMap` choisit le fond Mapbox quand un jeton est configuré et que tous les points ont une `position` ; la sélection, la mini-fiche et les états sont communs aux deux rendus. Pour Garde et Rencontres, il suffira que leur recherche renvoie une position autorisée et de passer `center` (centre de la recherche) et `points` avec `position`. Garde (`src/sitting/Search.tsx`) et Rencontres (`src/meetings/Rencontres.tsx`) gardent pour l’instant leur carte illustrative ; ils pourront passer à `ResultsMap` sans changer leur service.

Design system : `MapCard` accepte désormais des initiales à la place d’une photo (`initials`), pour les activités sans photo. À reporter dans l’artefact « Plein air ».

## Validation

Lot Mapbox (26 novembre 2026) :

- Vitest : suite complète verte, dont 6 nouveaux scénarios (`src/maps/mapbox-map.test.tsx`, bibliothèque Mapbox simulée) : rien de créé avant que la carte soit visible ; une seule carte pour filtres, rayon et retour de fiche ; repère commun d'une commune avec précédente / suivante synchronisées avec la liste ; jeton refusé → carte schématique ; serveur sans positions → schématique ; regroupement à l'écran.
- Tests SQL : 172/172, dont les colonnes renvoyées, l'arrondi et le retour arrière de la migration.
- Navigateur avec le vrai jeton web (page d'aperçu temporaire, données d'exemple autour de Lille, non commitée) à 375 px et sur ordinateur : fond chargé une seule fois, cercle et cadrage, regroupement puis zoom, sélection, « 1 / 2 au même endroit », mini-fiche au-dessus des crédits, changement de rayon sans nouvelle carte. Non vérifié avec un compte connecté sur les vraies données DEV, ni sur un vrai téléphone (jeton app).

Lot schématique :

- Vitest : suite complète 391/391, dont 7 nouveaux scénarios (`src/professionals/directory-map.test.tsx`) : synchronisation liste ↔ repères, mini-fiche → fiche → retour avec sélection, actualisation par rayon, GPS refusé, chargement → erreur → aucun résultat, bascule téléphone conservée au retour, placement schématique.
- Contrôle des types et compilation web réussis.
- Aperçu local avec données simulées (8 établissements, noms longs) à 375 et 1280 px : aucun chevauchement de repères, aucun débordement horizontal, aucune erreur JavaScript ; retour navigateur depuis une fiche vérifié. Non vérifié sur un vrai téléphone.
- Aucune migration Supabase dans le lot schématique.
