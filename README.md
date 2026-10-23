# Furrix 🐾

Application mobile native (iOS + Android via Capacitor) de mise en relation entre animaux de compagnie.
**Stack** : React 18 + Vite + Capacitor · Supabase · RevenueCat (IAP) · Brevo · Mapbox.
**Mobile-only** : pas de version web publique, pas de Stripe — 100% des paiements passent par l'In-App Purchase Apple/Google.
**Éditeur** : Groupe Senyara (Yannis Sénéchal, entrepreneur individuel).

> **Note sur les extensions** : `vite.config.mjs` et `src/lib/supabase.mjs` utilisent l'extension `.mjs` au lieu de `.js`, uniquement parce que Gmail bloque les fichiers `.js` même à l'intérieur d'une archive. Vite résout `.mjs` nativement, rien à changer. Renomme-les en `.js` si tu préfères.

## Démarrage rapide (5 minutes)

```bash
npm install
cp .env.example .env.local     # remplir les 2 clés Supabase minimum
npm run dev                    # → http://localhost:5173 (aperçu web du dev, avant packaging Capacitor)
```

L'app démarre avec des **données de démonstration intégrées** — elle fonctionne sans backend.
Le branchement Supabase se fait progressivement (voir plan §20 de la doc technique — calibré pour un dev solo, Guillaume).

## Deux points d'entrée

| Fichier | Contenu | Usage |
|---|---|---|
| `src/Furrix.jsx` | **Produit complet** — 6 onglets, paywall, récompenses, tout le design | Cible finale |
| `src/FurrixMVP.jsx` | **MVP 8 fonctionnalités** — auth, profil, swipe, match, chat | Lancement rapide |

Basculer dans `src/main.jsx` (une ligne à changer).
**Recommandation produit** : brancher le MVP d'abord (voir `docs/Furrix_Scoping_MVP.md`).

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

5 Edge Functions incluses, toutes codées (pas des squelettes) :
- `revenuecat-webhook` — synchronise le statut Premium (IAP)
- `send-email` — emails transactionnels via Brevo
- `award-points` — attribution serveur des PawPoints (anti-triche)
- `redeem-reward` — échange de points contre récompense partenaire
- `rate-limit` — anti-abus multi-clés (IP/user/fingerprint)

## Passage en app native (Capacitor)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
# Déposer icon.png et splash.png dans assets/ (voir assets/README.md) puis :
npm install @capacitor/assets --save-dev && npx capacitor-assets generate
npm run build && npx cap sync
npx cap open ios       # Xcode (Mac requis)
npx cap open android   # Android Studio
```
`capacitor.config.ts` déjà configuré (appId `fr.furrix.app`). Détail complet (plugins natifs,
permissions, RevenueCat, soumission stores) : `docs/Furrix_Documentation_Technique.md` §21.

## Pages légales (obligatoires pour la soumission stores)

`legal-pages/index.html` — squelette de page à compléter avec le contenu de
`docs/Furrix_Documentation_Juridique.md`, puis à héberger (Vercel/Netlify gratuit) avant
soumission. Apple et Google exigent tous deux un lien public vers la politique de confidentialité.
Voir `legal-pages/README.md` pour la marche à suivre complète.

## Paiement — RevenueCat / IAP uniquement

Pas de Stripe dans ce projet. Configurer les produits d'abonnement dans App Store Connect et
Google Play Console (`furrix_premium_monthly` à 9,99€, `furrix_premium_annual` à 74,99€), les
relier dans RevenueCat, puis pointer le webhook RevenueCat vers `revenuecat-webhook`. Détail §8.

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
5. Ne pas réécrire le moteur de swipe (`doSw/flyOut/commitSwipe`) — il est optimisé 60fps.
6. Pas de Stripe : 100% des paiements passent par l'In-App Purchase (Apple/Google).
7. Âge minimum 18 ans (voir doc juridique, Art. 3 des CGU) — à faire respecter dans l'onboarding.
