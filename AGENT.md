# AGENT.md — Furrix

Consignes pour les agents de code (et les humains) qui travaillent sur ce dépôt.
À lire avant toute modification. Le [README](README.md) décrit le produit et le démarrage ;
ce fichier dit **comment travailler ici**.

## Le projet en bref

Furrix met en relation des propriétaires d'animaux : rencontres de balade, garde, services
(vétérinaire, toiletteur, éducateur). Une seule base de code pour le **web** (ordinateur) et les
**applications iOS / Android** (téléphone).

| Couche | Choix |
|---|---|
| Interface | **React 18** + TypeScript (`strict`), bundlé par **Vite 5** |
| Mobile | **Capacitor 8** (projets natifs dans `android/` et `ios/`) |
| Données | Supabase (auth, Postgres, stockage, Edge Functions) |
| Tests | Vitest + Testing Library (jsdom) |

Pas d'autre framework d'interface (pas de React Native, Next.js, Tailwind, MUI…). Pas de CSS-in-JS :
des fichiers `.css` simples, préfixés.

## Commandes

```bash
npm ci                 # installer (Node ≥ 22)
npm run dev            # application (connexion puis accueil)
npm test               # tests Vitest
npm run typecheck      # tsc --noEmit
npm run build          # build de production
npm run platform:sync  # build + cap sync (iOS / Android)
```

Avant de rendre la main : `npm run typecheck`, `npm test` et `npm run build` doivent passer.

## Organisation du code

```
src/
  design-system/      Design system « Plein air » : jetons, styles, composants React (voir plus bas)
  app/                Application : coque, navigation, point d'entrée (entry.ts)
  auth/ beta/ pets/   Parcours métier (authentification, bêta privée, animaux)
  services/ hooks/    Accès Supabase et hooks réutilisables
  platform/           Intégration Capacitor (auth native, stockage sécurisé)
  validation/ types/  Validation des formulaires, types de la base
  Furrix.jsx, FurrixMVP.jsx   Anciens prototypes (développement uniquement, ne pas étendre)
supabase/             Migrations, fonctions, tests SQL
docs/                 Documentation produit et technique (français)
```

Le point d'entrée choisit l'écran via `VITE_FURRIX_APP` (`src/app/entry.ts`, fichiers `.env.<mode>`).
Toute entrée de développement (aperçu) doit renvoyer `unavailable` en production
et être testée dans `src/app/entry.test.ts`.

## Design system « Plein air »

**Source de vérité** : l'artefact *Furrix — Plein air* (design system publié sur claude.ai),
lui-même tiré de la maquette *Furrix — Référence design Plein air.html* (16 novembre 2026,
fichier hors dépôt). Le code de `src/design-system/` en est la traduction fidèle : mêmes noms
de jetons, mêmes classes `fx-*`, mêmes composants. Si une valeur doit changer, elle change
**d'abord** dans le design system, puis ici.

### Où sont les choses

| Fichier | Rôle |
|---|---|
| `styles/tokens.css` | Toutes les variables `--fx-*` (couleurs, espacements, rayons, ombres, tailles, mise en page) |
| `styles/typography.css` | Rôles typographiques `--fx-type-*` (et leurs tailles ordinateur ≥ 900 px) |
| `styles/fonts.css` + `fonts/` | Bricolage Grotesque et Figtree **embarquées** (aucun appel réseau) |
| `styles/base.css`, `styles/native.css` | Base globale, focus, zones sûres, ajustements Capacitor |
| `tokens/tokens.ts` | Mêmes jetons en TypeScript (`tokens` = valeurs, `vars` = `var(--fx-…)`) |
| `components/*.tsx` + `*.css` | Composants, regroupés par famille |
| `icons/Icon.tsx` | Pictogrammes SVG (`iconNames`) |
| `provider.tsx`, `platform.ts`, `hooks.ts` | `FurrixProvider`, détection web/iOS/Android, `useBreakpoint` |
| `styles.ts` | Importe toutes les feuilles dans le bon ordre |
| `index.ts` | Point d'entrée unique des composants |
| `designSystem.test.tsx` | Tests des comportements clés (accessibilité, choix, envoi) |

### Utilisation

```tsx
import './design-system/styles';                 // une seule fois, à la racine de l'écran
import { FurrixProvider, AppShell, Button, Card, defaultNav } from './design-system';

<FurrixProvider linkComponent={Link}>              {/* une seule fois, à la racine */}
  <AppShell nav={defaultNav} current="accueil" title="Accueil">
    <Card>…</Card>
    <Button variant="main">Envoyer la demande</Button>
  </AppShell>
</FurrixProvider>
```

Familles : **Actions** `Button`, `IconButton`, `SendButton`, `BackLink` · **Sélection** `Chip`,
`ChipGroup`, `Option`, `OptionGroup`, `SlotGrid`, `Segmented` · **Formulaires** `Field`, `Input`,
`Textarea`, `Composer` · **Retours** `StatusBadge`, `Tag`, `Alert`, `Toast`, `Note`, `EmptyState` ·
**Mise en page** `Card`, `Stack`, `Row`, `Separator`, `Page`, `PageHeader`, `DetailLayout`, `ActionBar` ·
**Données** `Steps`, `Recap`, `RecapRow`, `Facts`, `Log`, `LogItem`, `CheckList` · **Personnes** `Photo`,
`Monogram`, `Avatar`, `Who`, `PetSwitcher` · **Cartes** `AnimalCard`, `AnimalGrid`, `ResultRow`,
`ResultList`, `ListHeader`, `UseCard`, `UseGrid`, `HeroGallery`, `WhenBar`, `SearchLayout`,
`FollowGrid`, `FollowItem`, `HomeIntro` · **Navigation** `AppShell`, `SiteHeader`, `PhoneBar`, `TabBar`,
`HeaderAction`, `Logo` · **Chat** `ChatLayout`, `ChatThread`, `MessageBubble`, `SystemMessage` ·
**Carte** `MapFrame`, `MapMarker`, `MapMe`, `MapButton`, `MapNote`, `MapCard` · **Rencontres**
`SwipeDeck`, `SwipeProfile`, `SwipeActions`, `MatchScreen`, `MatchPair`.

### Règles à respecter

- **Utiliser les composants et les jetons**, jamais de couleur, taille ou rayon écrits en dur.
  Un besoin non couvert : composer les composants existants, sinon ajouter un jeton/composant au
  design system **et** ici.
- **Une seule action principale par écran**, en coquelicot (`Button variant="main"`). Les autres :
  `ink`, `out`, `quiet`. Le coquelicot sert aussi à la sélection active, à rien d'autre.
- **Un statut = couleur + pictogramme + texte** (`StatusBadge`). Jamais la couleur seule.
- **Cibles tactiles ≥ 44 px** ; bouton standard 52 px. **Focus visible** partout (contour encre 3 px) :
  ne jamais le retirer.
- **Mobile d'abord** : téléphone < 900 px, ordinateur ≥ 900 px (`DESKTOP_QUERY`). Mêmes composants,
  la mise en page s'adapte en CSS. Respecter les zones sûres (`--fx-safe-*`) et `viewport-fit=cover`.
- **Hors ligne** : polices et pictogrammes sont dans le code. Ne rien charger depuis un CDN
  (Google Fonts, icônes…) : l'app tourne dans Capacitor.
- **Accessibilité** : `IconButton` exige un `label` ; `Field` relie étiquette/aide/erreur ;
  `alt=""` seulement si le nom est écrit à côté de la photo ; `prefers-reduced-motion` respecté.
- **Pas de mode sombre** pour l'instant (un seul thème clair).
- La base du design system (police, couleurs, titres, `:focus-visible`) ne s'applique **qu'à l'intérieur**
  de `.fx-root` (posé par `AppShell`) ou de `FurrixScope` (écran migré dans une structure plus ancienne).
  Ses sélecteurs passent par `:where()` : ils ne l'emportent jamais sur un composant ni sur un écran.
  Les styles peuvent donc être importés une seule fois, à la racine, sans toucher les écrans non migrés.
- Le préfixe `fx-` (classes et variables) est **réservé** au design system. Les écrans de l'application
  utilisent `app-`.
- **États** : `Button loading` (indicateur, `aria-busy`, clics ignorés, focus conservé), `Loading` pour une
  zone, `disabled` pour un choix indisponible (puces, segments, options). Une action qui attend le serveur
  utilise `loading`, pas `disabled`, pour ne pas faire perdre le focus clavier.
- **Pile de profils** : `onDecide` renvoie la promesse de l'appel serveur. La carte reste en place jusqu'à
  la confirmation et revient en cas d'échec ; `onPendingChange` sert à désactiver `SwipeActions`.
- **Messages** : `Composer` limite à 2 000 caractères (comme la base) et accepte `sending`. Le texte reste
  affiché pendant l'envoi : un nouvel essai réutilise le même identifiant de requête côté écran.
- `MapFrame` n'est qu'un cadre : le fournisseur de carte (Mapbox) reste à brancher dans `.fx-map__canvas`.
- Tout ce que la maquette marque « Provisoire » ou « fictif » (délais, tarifs, frais) est une
  hypothèse : ne jamais figer ces valeurs dans le code (`RecapRow open` → « à définir »).

### Contenu et ton (textes d'interface)

Français, **tutoiement**, phrases courtes et concrètes, du point de vue de l'utilisateur. Pas d'emoji ; pas de
point d'exclamation sauf « C'est un match ! ». Casse de phrase. Boutons à l'impératif ou à
l'infinitif d'action (« Envoyer la demande »). Alertes : le fait en titre, la suite en texte.
Dates « Ven. 21 → dim. 23 nov. », heures « 10:00 », distances « ≈ 1,5 km », prix « 20 € / nuit ».

> **Décidé** : Furrix tutoie partout (« Tu paieras… », « Ton message »), comme l'accueil,
> l'authentification et les rencontres. Les maquettes encore au vouvoiement sont à adapter lors de leur migration.

## Conventions de code

- TypeScript strict pour tout nouveau fichier (`.ts` / `.tsx`) ; pas de nouveau `.jsx`.
- Composants fonctionnels, props typées et documentées par un court commentaire `/** … */` en français.
- Classes CSS préfixées : `fx-` pour le design system, `app-` pour les écrans de l'application.
- Commentaires, documentation, messages de commit et textes d'interface **en français**.
- Pas de nouvelle dépendance sans raison claire ; versions figées comme dans `package.json`.
- Ne jamais committer de secret (`.env.local`, clés Supabase, keystores).

## Git

- Une branche par sujet depuis `main` : `feat/…`, `fix/…`, `chore/…`. Pas de commit direct sur `main`.
- Messages au format Conventional Commits, en français : `feat(design-system): …`, `fix(auth): …`.
- Fusion par pull request après revue ; tests, typecheck et build verts.
