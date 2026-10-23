# Furrix — Guide de démarrage développeur (Guillaume)

**⚠️ Ce guide a été écrit pour un périmètre antérieur. Le périmètre de référence est désormais le `Furrix_CDC_Produit_Technique.md` — à lire en premier.**

**Périmètre actuel :** application complète (téléconsultation et espace professionnel B2B inclus, marketplace exclue). Chiffrage : **41 à 43 jours-homme**, soit 9 à 11 semaines en solo. Le calendrier 3 semaines ci-dessous ne couvre que le socle — l'arbitrage périmètre/délai est en cours entre Yannis et Guillaume (CDC §27.1).
Ce document est ton point d'entrée unique. Tout le reste (schéma DB, sécurité, détails RevenueCat, mobile) est dans `Furrix_Documentation_Technique.md` — référencé section par section ci-dessous.

---

## 1. Ce qui est déjà fait vs ce que tu dois faire

### ✅ Déjà fait — prêt à déployer tel quel

| Élément | Fichier | Action de ta part |
|---|---|---|
| Schéma DB complet (16 tables + RLS + RPC + index) | `supabase/migrations/20261023134035_furrix_0001_init.sql` + `20261023134044_furrix_0002_rate_limiting.sql` | `supabase db push`, c'est tout |
| Seed vétérinaires Hauts-de-France | `supabase/seed.sql` | L'exécuter dans l'éditeur SQL |
| 5 Edge Functions codées (pas des squelettes) | `supabase/functions/*` | `supabase functions deploy`, configurer les secrets |
| UI complète des 6 onglets + design + animations | `src/Furrix.jsx` (~1700 lignes) | Ne PAS redesigner — câbler (voir §3) |
| Moteur de swipe 60fps + scoring de matching | dans `Furrix.jsx` (`doSw`, `flyOut`, `computeScore`, `buildPool`) | **Ne pas réécrire** — il est optimisé |
| Config Capacitor | `capacitor.config.ts` (appId `fr.furrix.app`) | Rien, déjà prêt |
| Pages légales (squelette) | `legal-pages/` | Coller le contenu de la doc juridique + héberger |

### 🔧 Ton vrai travail — le câblage données (le cœur des 3 semaines)

`Furrix.jsx` est un prototype visuel complet dont **toutes les données sont en dur** (tableaux JS). Ton travail = remplacer chaque bloc de démo par le vrai appel Supabase/API. Le §3 ci-dessous te donne la carte exacte.

### ✍️ À écrire de zéro (rien de ceci n'existe dans le code)

- Appel d'achat RevenueCat (`purchasePackage`) — doc technique §8.2, ~30 lignes
- Enregistrement du token push natif — doc §21.3
- Géolocalisation réelle via plugin Capacitor — doc §21.3 + `Furrix_Geolocalisation_API.md`
- Carte Mapbox réelle (la carte actuelle est un SVG statique de la France) — `Furrix_Geolocalisation_API.md` §3 (code prêt à copier)

---

## 2. Comptes & clés API — qui crée quoi

**⚠️ À faire J1, en parallèle du setup — certains délais sont incompressibles (validation compte Apple : parfois 24-48h).**

| Service | Qui crée le compte | URL | Clés à récupérer | Où les mettre |
|---|---|---|---|---|
| Supabase | Guillaume | supabase.com | URL projet + anon key + service_role | `.env.local` + secrets Edge Fn |
| Compte développeur Apple (99$/an) | **Yannis** (identité légale) | developer.apple.com | — | — |
| Compte Google Play (25$ une fois) | **Yannis** | play.google.com/console | — | — |
| RevenueCat (gratuit <2,5k$ MRR) | Guillaume | revenuecat.com | Public API key + webhook secret | `.env.local` + secrets |
| Mapbox (gratuit 50k vues/mois) | Guillaume | mapbox.com | Token public `pk.xxx` | `.env.local` |
| Brevo (gratuit 300 mails/j) | **Yannis** (email pro) | brevo.com | API key | secrets Edge Fn |
| Firebase (push, gratuit) | Guillaume | console.firebase.google.com | Config + clé serveur | `.env.local` + secrets |
| Sentry + PostHog (optionnel S3) | Guillaume | sentry.io / posthog.com | DSN / API key | `.env.local` |

Le fichier `.env.example` liste exactement les variables attendues. **Jamais de secret commité dans Git.**

---

## 3. Carte de câblage écran par écran

C'est la carte qui te fait gagner le plus de temps. Chaque ligne : la donnée de démo dans `Furrix.jsx` → par quoi la remplacer.

| Donnée en dur (dans `Furrix.jsx`) | Écran concerné | Remplacer par | Réf. doc |
|---|---|---|---|
| `AN` (tableau des animaux) | Swipe, carte, animaux proches | `supabase.from('pets').select('*').neq('owner_id', uid)` puis `buildPool()` existant sur ces données | §9.1 |
| Like/pass local (`commitSwipe`) | Swipe | `supabase.rpc('swipe_and_match', {p_pet, p_target, p_dir})` — la RPC gère le match atomique | §4.2, §9.1 |
| `matches` (state local) | Onglet Matchs | `from('matches').select('*, pet_a(*), pet_b(*)')` filtré par RLS | §9.1 |
| Messages simulés (`chatMsgs`) | Chat | `from('messages')` + subscription Realtime `postgres_changes` | §9.1 |
| `VT` (vétérinaires) | Soins → Vétos, carte | `from('vets').select()` (seed déjà chargé) + tri distance | §9.1 |
| Prise de RDV simulée | Soins | `from('appointments').insert()` + Edge Fn `send-email` (template `appointment`) | §9.2 |
| `AS` (associations) | Soins → Assos | Créer table `assos` sur le modèle de `vets` (10 min) OU garder en dur au lancement (non bloquant) | — |
| `LS` (animaux perdus) | Perdus, carte | `from('lost_pets')` + insert pour déclarer | §9.1 |
| Posts communauté (en dur) | Communauté | `from('posts')` (table déjà migrée) | §9.1 |
| Événements (en dur) | Événements | `from('events')` + `event_participants` pour l'inscription | §9.1 |
| `store` localStorage (paws/xp/streak) | Header, Moi, Récompenses | **Lecture** : `from('rewards_ledger')`. **Écriture : JAMAIS côté client** → Edge Fn `award-points` | §9.2, règle n°3 du README |
| Échange de récompense (`setPaws` local) | Modale Récompenses | Edge Fn `redeem-reward` (retourne un code promo) | §9.2 |
| `setPrem(true)` au clic sur un plan | Paywall | SDK RevenueCat `purchasePackage()` ; le statut vient du webhook → `subscriptions` + `customerInfo.entitlements` | §8.2-8.3 |
| Limite 5 swipes/j en localStorage | Swipe | Edge Fn `rate-limit` (bucket `swipe`) avant chaque swipe gratuit | §7, §9.2 |
| Photos Unsplash (`ph` en dur) | Partout | Upload Storage bucket `pet-photos` à l'onboarding ; le champ `ph` reçoit l'URL publique | §4.4 |
| Distances en dur (`dist`) | Swipe, carte | Géoloc Capacitor + calcul côté requête (index gist déjà en place) | `Furrix_Geolocalisation_API.md` |
| Carte SVG France statique | Onglet Carte | Mapbox GL (code d'intégration prêt à copier) | `Furrix_Geolocalisation_API.md` §3 |
| Onboarding : validation âge | Inscription | Case déclarative 18+ obligatoire (exigence juridique, Art. 3 CGU) | Doc juridique |

**Règle d'or pendant le câblage** : un écran à la fois, tester, committer. Ne jamais toucher au moteur de swipe ni au design en même temps que le câblage données.

---

## 4. Calendrier du socle (3 semaines)

> Ce calendrier couvre **le socle uniquement** : auth, profils, matching, chat, paiement de base, vétérinaires, perdus, communauté, événements, natif, soumission. Il **n'inclut pas** : espace professionnel self-service, téléconsultation, second abonnement, achats ponctuels, multi-animaux, carnet de santé, écran « Qui m'a liké », signalement/blocage. Ces chantiers représentent 18 à 19 jours supplémentaires (CDC §27.1).

Objectif ferme : **soumission Apple + Google au plus tard J15.** La review (1-4 jours) est hors de notre contrôle et s'ajoute après.

### Semaine 1 — Fondations + cœur
- **J1** : comptes/clés (§2, tout lancer en parallèle) · setup repo · `supabase db push` + seed · app démo tourne en local
- **J2** : tests RLS avec 2 comptes (critère : le compte B ne lit rien du compte A) · auth Supabase branchée
- **J3** : onboarding réel (insert `profiles`+`pets`, upload photo Storage, case 18+)
- **J4-J5** : câblage swipe (pool réel + RPC `swipe_and_match`) + liste des matchs. **Livrable S1 : inscription → swipe réel → match en base.**

### Semaine 2 — Paiement + écosystème
- **J6** : chat Realtime
- **J7-J8** : RevenueCat (produits dans App Store Connect/Play Console, SDK, webhook déployé, gating Premium testé en sandbox)
- **J9** : points serveur (`award-points`/`redeem-reward` branchés, migration douce du localStorage)
- **J10** : vétos + RDV + email Brevo · perdus + communauté + événements câblés (CRUD simples). **Livrable S2 : produit complet fonctionnel, achat sandbox OK.**

### Semaine 3 — Natif + soumission
- **J11** : rate-limiting branché (swipe/signup) · géoloc Capacitor · Mapbox
- **J12** : Capacitor build iOS + Android sur devices réels · push natif (si ça déborde → V1.1, non bloquant)
- **J13** : pages légales hébergées + URL dans les consoles · checklist §14 · suppression de compte in-app vérifiée
- **J14** : fiches stores (captures, textes — **Yannis peut faire ça en parallèle**), compte démo reviewer, produits IAP soumis avec le build
- **J15** : **Soumission Apple + Google.**

### Ordre de sacrifice si débordement (jamais le cœur)
1. Push natif → V1.1 post-lancement
2. Rate-limiting avancé → seuils simples d'abord
3. Communauté/événements en lecture seule au lancement
**Jamais sacrifié** : swipe, matching, chat, paiement, RLS, légal (18+, suppression compte, pages légales — motifs de rejet stores).

---

## 5. Commandes de référence

```bash
# Setup initial
npm install && cp .env.example .env.local && npm run dev

# Supabase
supabase link --project-ref <ref>
supabase db push
supabase functions deploy revenuecat-webhook send-email award-points redeem-reward rate-limit
supabase secrets set REVENUECAT_WEBHOOK_SECRET=... BREVO_API_KEY=... APP_URL=https://furrix.fr

# Capacitor (semaine 3)
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/geolocation @capacitor/camera @capacitor/push-notifications @capacitor/preferences @revenuecat/purchases-capacitor
npx cap add ios && npx cap add android
# icon.png + splash.png dans assets/ puis :
npx capacitor-assets generate
npm run build && npx cap sync
```

**Pas de Mac ?** → Codemagic (codemagic.io) compile iOS dans le cloud. Doc §21.6.

---

## 6. Les 7 règles non négociables (rappel)

1. Aucun secret dans le code client ni dans Git.
2. Le statut Premium n'est écrit QUE par le webhook RevenueCat.
3. Les PawPoints ne se modifient QUE via `award-points`/`redeem-reward`.
4. Toute table a sa RLS testée avec 2 comptes avant la prod.
5. Ne pas réécrire le moteur de swipe.
6. Pas de Stripe — 100% In-App Purchase.
7. 18 ans minimum, suppression de compte in-app, pages légales en ligne — exigences stores ET juridiques.

**Toute question d'architecture non couverte par la doc** → décision courte notée dans `/docs/adr/`, pas un blocage. La doc technique (22 sections) couvre normalement tout.
