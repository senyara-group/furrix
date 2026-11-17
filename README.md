# Furrix 🐾

Plateforme dédiée aux propriétaires d'animaux : rencontres, garde et services professionnels.
**Cible validée le 16 novembre 2026** : web adapté à l'ordinateur et applications iOS/Android adaptées au téléphone.
**Direction visuelle validée : « Plein air »**. Authentification et accueil intégrés ; services métier à développer.
**Stack** : React 18 + Vite + Capacitor · Supabase · RevenueCat (IAP) · Brevo · Mapbox.

**Essai web / Android / iOS (17 novembre)** : [architecture, compilation et recette](docs/Architecture_Web_Mobile.md).
Branche d'essai avec Capacitor 8 et projets natifs ; `npm run dev:platform` ouvre un banc technique séparé.
La génération/synchronisation des projets ne vaut pas validation d'une compilation native ou d'un appareil.
Les lots authentification et accueil « Plein air » sont préparés séparément, puis à recetter sur appareils
et à rapprocher des composants d'Alexis avant ouverture publique.

**Design system « Plein air » en code** : `src/design-system/` (jetons, polices embarquées, composants React).
Règles de travail : [AGENT.md](AGENT.md).

**Accueil et navigation préparés** : [périmètre et recette](docs/Accueil_Navigation.md).
`npm run dev:home` ouvre l'aperçu local identifié ; `dev:auth` utilise la structure derrière la session
et les déclarations vérifiées. Les services métier restent signalés « en préparation ».

**Parcours auth préparé** : `npm run dev:auth` / `npm run build:auth`, voir
[l'activation, les limites et la recette](docs/Authentification.md). L'inscription reste fermée tant que les
documents validés ne sont pas configurés. La migration de traçabilité est proposée mais non appliquée sur DEV.

> **Note sur les extensions** : `vite.config.mjs` et `src/lib/supabase.mjs` utilisent l'extension `.mjs` au lieu de `.js`, uniquement parce que Gmail bloque les fichiers `.js` même à l'intérieur d'une archive. Vite résout `.mjs` nativement, rien à changer. Renomme-les en `.js` si tu préfères.

## Démarrage rapide (5 minutes)

```bash
npm install
cp .env.example .env.local     # remplir les 2 clés Supabase minimum
npm run dev                    # → http://localhost:5173 (aperçu web du dev, avant packaging Capacitor)
```

L'app démarre sur la connexion « Plein air », puis ouvre l'accueil après session et déclarations vérifiées.
Sans configuration Supabase, elle affiche une indisponibilité explicite, jamais une démonstration silencieuse.
Sur Vercel, aucun `VITE_FURRIX_APP` n'est nécessaire pour ce nouveau parcours. Les variables publiques Supabase
restent nécessaires ; les inscriptions restent désactivées jusqu'à configuration des documents validés.

## Application et anciens prototypes

| Fichier | Contenu | Usage |
|---|---|---|
| `src/app/ProductApp.tsx` | Authentification puis accueil Plein air | Entrée par défaut, web et mobile |
| `src/Furrix.jsx` | Prototype initial avec données de démonstration | Développement uniquement : `VITE_FURRIX_APP=legacy` |
| `src/FurrixMVP.jsx` | Auth et profil connectés, autres parcours simulés | Banc d'essai des services et hooks réutilisables |

Sélectionner le banc d'essai en développement avec `VITE_FURRIX_APP=mvp`. En production, les anciens
sélecteurs `mvp`/`legacy` ouvrent le nouveau parcours. Les services et hooks auth/profil
sont à réutiliser pour « Plein air ». L'architecture mobile reste à confirmer ; Capacitor est présent dans le code initial.

## Backend Supabase

Suivre [la préparation de l'environnement de développement](docs/Supabase_Developpement.md) :
CLI figé, configuration locale, inspection en lecture seule, procédure approuvée pour
les migrations **20261023134035 → 20261023134044 → 20261023134053**, puis contrôles des permissions et de `pg_cron`.
La configuration est déjà initialisée. Aucun déploiement distant ni Edge Function
n'est autorisé par cette préparation ; ne pas ouvrir le backend aux utilisateurs.
Voir aussi [l'audit de référence](docs/audits/2026-10-23-audit-technique-furrix.md)
et [les limites du lot SQL](docs/Furrix_Securisation.md).
Les anciens noms `0001`/`0002`/`0003` désignent les mêmes SQL, désormais renommés
selon [la correspondance d'historique DEV](docs/Supabase_Alignement_Historique.md).

**Authentification et profil animal** : services et hooks prêts, éprouvés sur le MVP utilisé comme banc
d'essai (`VITE_FURRIX_APP=mvp`). Le prototype initial `Furrix.jsx` n'est **pas encore connecté** (démonstration) ;
raccordement restant détaillé dans la recette. Tests : `npm test`, `npm run typecheck`, `npm run test:sql`.
Recette distante et opérations soumises à accord : [Recette_Auth_Profil.md](docs/Recette_Auth_Profil.md).

5 Edge Functions incluses, toutes codées (pas des squelettes) :
- `revenuecat-webhook` — synchronise le statut Premium (IAP)
- `send-email` — emails transactionnels via Brevo
- `award-points` — attribution serveur des PawPoints (anti-triche)
- `redeem-reward` — échange de points contre récompense partenaire
- `rate-limit` — anti-abus multi-clés (IP/user/fingerprint)

## Passage en app native (Capacitor)

```bash
npm ci
npm run platform:doctor
npm run platform:sync     # compile le banc technique et synchronise les projets déjà présents
npm run ios:open          # Xcode, sur Mac
npm run android:open      # Android Studio
```
`capacitor.config.ts` déjà configuré (appId `fr.furrix.app`). Détail complet (plugins natifs,
permissions, RevenueCat, soumission stores) : `docs/Furrix_Documentation_Technique.md` §21.

## Pages légales (obligatoires pour la soumission stores)

`legal-pages/index.html` — squelette de page à compléter avec le contenu de
`docs/Furrix_Documentation_Juridique.md`, puis à héberger (Vercel/Netlify gratuit) avant
soumission. Apple et Google exigent tous deux un lien public vers la politique de confidentialité.
Voir `legal-pages/README.md` pour la marche à suivre complète.

## Paiements — conception à finaliser

RevenueCat et un webhook IAP sont présents dans le code initial. Abonnements numériques,
garde et prestations professionnelles doivent être distingués : circuits, prestataires et commissions
restent à valider avant intégration. L'ancien principe « 100 % IAP » n'est plus la référence.

## Référence produit — décisions du 16 novembre 2026

- Trois usages : rencontres, garde et services professionnels, avec le design « Plein air ».
- Rencontres : **j'aime → match réciproque → conversation gratuite → proposition → acceptation**.
  Likes et matchs sont rattachés à l'animal sélectionné. Sans match, aucune conversation ni proposition,
  dans les vues Cartes, Liste et Carte géographique. Garde et demandes de RDV restent directes.
- Quotas, visibilité payante des likes et réapparition des profils passés restent ouverts.
- Le dossier de conception et l'export HTML sont transmis séparément par Guillaume ; ils ne sont pas inclus ici.
  Les guides initiaux et leurs calendriers ne remplacent pas ces décisions actualisées.
- Alexis commence par l'état des lieux et les composants visuels réutilisables. Accueil, navigation et
  raccordement métier seront traités dans des lots distincts.
- Les migrations 0004/0005 restent soumises à revue et autorisation d'application distante.
  La fusion du code ne les exécute pas. Les observations DEV documentées datent du 3 novembre.

## 👉 Développeur : commencer ici

**`docs/Furrix_Guide_Demarrage_Dev.md`** — le point d'entrée unique : ce qui est fait vs à faire, les comptes/clés API à créer (et qui les crée), la **carte de câblage écran par écran** (quelle donnée de démo remplacer par quel appel Supabase), et le calendrier 3 semaines jour par jour jusqu'à la soumission stores.

## Documentation complète (dossier `docs/`)

| Document | Contenu |
|---|---|
| **`Furrix_CDC_Produit_Simplifie.md`** | **Le produit en clair, sans technique** : vision, fonctionnalités, modèle économique, prix, lancement + **réponses aux questions de Guillaume**. À lire en premier. |
| **`Furrix_CDC_Produit_Technique.md`** | **Cahier des charges produit & technique** : périmètre de lancement, modèle économique (2 abonnements + achats ponctuels), B2B, analyse EXISTANT/À MODIFIER/À CRÉER, réponses aux questions de Guillaume |
| **`Furrix_Guide_Demarrage_Dev.md`** | **Point d'entrée dev** : câblage écran par écran, comptes/API, calendrier 3 semaines |
| **`Furrix_Documentation_Technique.md`** | La référence complète (22 sections) : schéma DB, RLS, sécurité, RevenueCat/IAP, rate-limiting, mobile natif, complexité par fonctionnalité, plan d'action solo (§20). **Commencer par là.** |
| **`Furrix_Strategie_Acquisition.md`** | Stratégie d'acquisition 0 €, modèle économique net après commissions IAP, trajectoire vers 10 k€/mois, plan 90 jours |
| `Furrix_Scoping_MVP.md` | Le périmètre MVP et la roadmap V1/V2 |
| `Furrix_Geolocalisation_API.md` | Intégration géoloc/Mapbox/Google Places |
| `Furrix_Documentation_Juridique.md` | CGU, CGV, politique de confidentialité RGPD, mentions légales — à compléter ([À COMPLÉTER]) et faire relire par un professionnel avant publication |

## Règles non négociables

1. Aucun secret dans le code client ni dans Git (`.env.local` est ignoré).
2. Le statut Premium n'est écrit QUE par le webhook RevenueCat — jamais par le client.
3. Les PawPoints ne sont modifiables QUE via `award-points`/`redeem-reward` — jamais côté client.
4. Toute table a sa RLS testée avec 2 comptes avant la prod.
5. Le moteur de swipe initial est à évaluer ; le parcours validé ci-dessus reste la référence produit.
6. Ne pas intégrer de paiement avant validation du circuit concerné ; aucun prestataire unique n'est imposé.
7. Âge minimum 18 ans (voir doc juridique, Art. 3 des CGU) — à faire respecter dans l'onboarding.
