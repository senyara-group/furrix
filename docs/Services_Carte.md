# Services : carte de l’annuaire

## Ce que fait ce lot

La recherche Services affiche ses résultats en liste **et** sur une carte. Sur ordinateur (≥ 900 px), la liste et la carte sont côte à côte, la carte restant visible au défilement. Sur téléphone, un sélecteur « Liste / Carte » montre l’une ou l’autre.

- Un repère par activité trouvée : nom et distance arrondie. Le repère et la ligne de liste sont synchronisés dans les deux sens : survol ou focus d’une ligne → son repère passe en coquelicot ; clic sur un repère → la ligne est marquée (et ramenée à l’écran sur ordinateur).
- Le repère sélectionné ouvre une mini-fiche (`MapCard`) ; la mini-fiche ouvre la fiche de l’établissement. Un clic sur le fond de carte ou à nouveau sur le repère la ferme.
- Ville, rayon ou catégorie modifiés : nouvelle recherche, liste et repères remplacés ; une sélection qui n’existe plus est oubliée. Le cercle et l’échelle suivent le rayon choisi.
- GPS refusé : message d’erreur, la recherche par ville et ses résultats restent affichés, aucune nouvelle requête.
- Au retour d’une fiche, recherche, vue (liste ou carte) et repère sélectionné sont retrouvés (état en mémoire de l’écran, rien en stockage).
- États : « Recherche en cours… » (carte marquée occupée), « Résultats indisponibles » avec le bouton Réessayer au-dessus, et « Aucune activité à moins de N km » avec l’action « Élargir la recherche » de la liste.

## Ce qui n’est pas encore fait (lot suivant)

- **Fond de carte réel** : fournisseur retenu **Mapbox** (jetons publics web et app à créer ; voir la décision dans la conversation de cadrage). Aucun fournisseur n’est installé dans ce lot.
- **Position des établissements** : `search_professionals` ne renvoie toujours que la distance arrondie. La précision autorisée (centre de la commune ou zone d’environ 1 km) et le texte présenté aux professionnels restent à décider ; puis migration et tests SQL.

En attendant, la carte est **schématique** et le dit : seule la distance est réelle (arrondie), la direction est arbitraire mais stable par établissement, et la note sous les résultats précise que la position des établissements n’est pas publiée. Aucune apparence géographique trompeuse (pas de fond de plan).

## Réutilisation (Garde, Rencontres)

Le composant commun est `src/maps/ResultsMap.tsx` :

- `points` : `{ id, name, short?, detail?, tag?, photo?, distanceKm, position? }` — `position` accueillera les coordonnées autorisées renvoyées par le serveur ;
- `radiusKm`, `status` (`loading` · `ready` · `error`), `emptyText` ;
- `selected` / `onSelect` (sélection partagée avec la liste) et `onOpen` (ouvrir la fiche).

Le placement schématique est dans `src/maps/schematic.ts` : distance relative au rayon, repères gardés dans le cadre et écartés pour rester tous cliquables (place libre la plus proche, sinon la moins encombrée). Quand le fond Mapbox sera branché, il remplacera ce rendu à l’intérieur de `ResultsMap` pour les points qui ont une `position` ; la sélection, la mini-fiche et les états ne changent pas. Garde (`src/sitting/Search.tsx`) et Rencontres (`src/meetings/Rencontres.tsx`) gardent pour l’instant leur carte illustrative ; ils pourront passer à `ResultsMap` sans changer leur service.

Design system : `MapCard` accepte désormais des initiales à la place d’une photo (`initials`), pour les activités sans photo. À reporter dans l’artefact « Plein air ».

## Validation

- Vitest : suite complète 391/391, dont 7 nouveaux scénarios (`src/professionals/directory-map.test.tsx`) : synchronisation liste ↔ repères, mini-fiche → fiche → retour avec sélection, actualisation par rayon, GPS refusé, chargement → erreur → aucun résultat, bascule téléphone conservée au retour, placement schématique.
- Contrôle des types et compilation web réussis.
- Aperçu local avec données simulées (8 établissements, noms longs) à 375 et 1280 px : aucun chevauchement de repères, aucun débordement horizontal, aucune erreur JavaScript ; retour navigateur depuis une fiche vérifié. Non vérifié sur un vrai téléphone.
- Aucune migration Supabase.
