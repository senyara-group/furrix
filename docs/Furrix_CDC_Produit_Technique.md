# Furrix — Cahier des Charges Produit & Technique

**Destinataire :** Guillaume Cools (développeur)
**Éditeur :** Groupe Senyara — Yannis Sénéchal
**Version :** 1.0 — document de référence
**Base d'analyse :** code source réel du projet (`src/Furrix.jsx` 1 708 lignes, `supabase/migrations/20261023134035_furrix_0001_init.sql` 281 lignes, `20261023134044_furrix_0002_rate_limiting.sql`, 5 Edge Functions)

**Convention :**
- ✅ **EXISTANT** — présent et exploitable dans le code
- 🔧 **À MODIFIER** — présent mais nécessite une adaptation
- 🆕 **À CRÉER** — absent, à développer intégralement
- ❓ **À VALIDER** — décision requise de Yannis ou Guillaume

---

## 1. Résumé exécutif

Furrix est une application mobile native (iOS + Android) tout-en-un dédiée à la vie animale. Le matching entre animaux en est la porte d'entrée et le moteur d'engagement, mais le produit couvre l'ensemble des besoins du propriétaire : communauté, animaux perdus, événements, professionnels, santé et services.

**État réel du projet :** le dépôt contient un **prototype front-end complet et abouti sur le plan visuel** (6 onglets, moteur de swipe optimisé, design system cohérent) fonctionnant sur des **données mockées en dur**, ainsi qu'un **socle backend prêt à déployer** (schéma de 19 tables avec RLS, 5 Edge Functions opérationnelles). Aucune connexion front↔backend n'est établie à ce jour.

**Écart principal à connaître :** le périmètre de lancement décrit dans ce CDC (téléconsultation, espace professionnel B2B, deux abonnements, achats ponctuels, multi-animaux) dépasse significativement ce qui existe aujourd'hui. Les sections 21, 22 et 28 chiffrent précisément cet écart. **La section 27 expose le risque de planning : environ 43 à 45 jours-homme, soit 10 à 12 semaines pour un développeur seul.**

---

## 2. Vision et positionnement Furrix

**Furrix n'est pas « le Tinder des animaux ».** C'est l'application tout-en-un autour de la vie de l'animal et des besoins de son propriétaire.

| Dimension | Rôle |
|---|---|
| Matching | Porte d'entrée et moteur d'engagement — pas la finalité |
| Communauté | Rétention, entraide, contenu |
| Services & professionnels | Valeur d'usage réelle, socle du B2B |
| Santé | Valeur perçue élevée, différenciation |
| Animaux perdus | Utilité sociale, levier d'acquisition local |
| Événements | Ancrage territorial, communauté physique |

**Positionnement de référence :** *l'écosystème complet du maître animalier, dont la rencontre est la première porte.*

Aucun concurrent identifié ne réunit ces briques : les acteurs du marché sont mono-fonction (Animou et Lost'Him sur les animaux perdus, Santévet sur l'assurance, Paranu sur le matching seul).

---

## 3. Cibles utilisateurs

| Cible | Description | Statut dans le code |
|---|---|---|
| **Particulier B2C** | Propriétaire d'un ou plusieurs animaux, 18 ans minimum | ✅ Modèle `profiles` + `pets` |
| **Professionnel B2B** | Vétérinaire, éducateur, pet sitter, toiletteur, éleveur, assurance | 🆕 **Aucun modèle de compte professionnel n'existe** |
| **Association / refuge** | SPA, refuges, associations d'adoption | 🔧 Données `AS` en dur côté front, aucune table dédiée |
| **Ambassadeur** | Créateur de contenu, relais local | 🆕 Inexistant |

**Âge minimum : 18 ans** (décision validée, cf. documentation juridique Art. 3 des CGU). La case déclarative est 🆕 à ajouter à l'inscription.

---

## 4. Typologie des animaux

**Décision : Furrix accueille tous les types d'animaux.** Chiens et chats seront majoritaires, mais l'architecture ne doit pas les privilégier techniquement.

**État réel :**

✅ Le front gère déjà 8 espèces avec illustrations SVG dédiées (`PAWS`) : chien, chat, lapin, oiseau, reptile, rongeur, cheval, ferme.

🔧 **Problème bloquant identifié dans le schéma SQL :**

```sql
-- 20261023134035_furrix_0001_init.sql, table pets — contrainte RIGIDE
species text not null check (species in
  ('chien','chat','lapin','oiseau','reptile','rongeur','cheval','ferme'))
```

Cette contrainte `CHECK` impose une migration SQL à chaque nouvelle espèce. **Correctif à appliquer :**

```sql
-- Table de référence, extensible sans migration
create table species (
  id text primary key,              -- 'chien', 'chat', 'furet'...
  label text not null,
  label_plural text not null,
  icon_key text,                    -- correspondance avec PAWS côté front
  sort_order int default 100,
  active bool default true
);
alter table pets drop constraint pets_species_check;
alter table pets add constraint pets_species_fk
  foreign key (species) references species(id);
```

Côté front, `SP` (liste des espèces) devra être lu depuis cette table au lieu d'être codé en dur.

---

## 5. Fonctionnalités complètes — périmètre de lancement

| Fonctionnalité | Périmètre | État réel |
|---|---|---|
| Inscription / authentification | Lancement | 🆕 Écran absent, Supabase Auth non branché |
| Profil animal (création, édition) | Lancement | 🔧 Onboarding existe, non branché, mono-animal |
| Multi-animaux | Lancement | 🆕 Architecture mono-animal à refondre |
| Découverte / swipe / match | Lancement | ✅ Moteur complet, données mockées |
| Messagerie | Lancement | 🔧 UI complète, Realtime à brancher |
| Voir qui m'a liké | Lancement (Premium) | 🆕 Écran inexistant |
| Communauté | Lancement | 🔧 UI posts existante, non branchée |
| Animaux perdus | Lancement | 🔧 UI + carte, non branchées |
| Événements | Lancement | 🔧 UI liste existante, création 🆕 |
| Vétérinaires + RDV | Lancement | 🔧 UI + table `vets`, à brancher |
| Téléconsultation | Lancement | 🆕 **Libellé UI seulement, aucune implémentation** |
| Carnet de santé | Lancement | 🆕 **Placeholder « ajout en cours », rien derrière** |
| Espace professionnel B2B | Lancement | 🆕 **Totalement inexistant** |
| Assurances | Lancement | 🔧 Section UI, contenu statique |
| Abonnements (2 formules) | Lancement | 🔧 Une seule formule modélisée |
| Achats ponctuels | Lancement | 🆕 Inexistant |
| PawPoints / gamification | Lancement | 🔧 UI + Edge Functions prêtes, non branchées |
| Notifications push | Lancement | 🆕 Aucune implémentation |
| Modération / signalement | Lancement | 🔧 Table `reports` existe, UI absente |
| **Marketplace** | **EXCLUE** | 🔧 Données `PR` présentes dans le code → **à retirer** |

---

## 6. Matching

### Existant ✅

Le moteur est la partie la plus aboutie du projet et **ne doit pas être réécrit**.

| Élément | Détail |
|---|---|
| Geste de swipe | Drag DOM direct via `useRef`, **aucun `setState` pendant le geste** → 60 fps garantis |
| Fonctions | `doSw`, `flyOut`, `snapBack`, `commitSwipe`, `advanceCard` |
| Scoring | `computeScore()` — espèce 35 %, objectif 25 %, taille 15 %, âge 15 %, vérifié/vacciné 5 % |
| Pool | `buildPool()` mémoïsé, jitter ±3 pour éviter un ordre figé, re-surfacing des profils passés |
| Filtres | Espèce, rayon géographique, objectif |
| Limite gratuite | 5 swipes/jour — **stockée en `localStorage`, donc contournable** |

### À modifier 🔧

- **Limite de swipes** : migrer vers l'Edge Function `rate-limit` (bucket `swipe`), déjà codée et déployable. Contournement actuel : vider le cache du navigateur.
- **Matrice `PURP_C`** (ligne 189) : pondère la compatibilité d'objectifs, inclut `reproduction` — voir section 7.
- **Scoring multi-animaux** : `computeScore(myPet, candidate)` prend un animal unique. À adapter pour l'animal actif sélectionné.

### À créer 🆕

- **Écran « Qui m'a liké »** : la donnée existe (`swipes` avec `direction='right'` ciblant mes animaux), l'écran non.
- **Super like / like spécial** : la valeur `'super'` est déjà acceptée par la contrainte `swipes.direction`, mais aucune UI ni logique de consommation n'existe.

---

## 7. Profils animaux — et traitement de la reproduction

### Multi-animaux 🆕

**Décision produit :** gratuit = 1 animal · Premium = plusieurs animaux selon la formule.

**État réel : l'architecture front est mono-animal.**

```js
// src/Furrix.jsx — un seul objet, pas un tableau
const [myPet,setMP]=useState({name:"",species:"chien",breed:"",...});
```

En revanche, **le schéma SQL est déjà correct** : `pets.owner_id` est une relation 1→N, et `swipes`/`matches` référencent `pet_id` (et non `user_id`) — **c'est donc bien l'animal qui matche, pas le maître.** Le modèle de données supporte le multi-animaux sans migration.

**Travail requis (front uniquement) :**
1. `myPet` (objet) → `myPets` (tableau) + `activePetId`
2. Sélecteur d'animal actif dans le header ou l'onglet Moi
3. Écran de gestion des animaux (ajouter / éditer / supprimer)
4. Contrôle de quota à la création selon l'abonnement
5. Tous les appels liés au swipe/match/chat portent sur `activePetId`

**Quota à appliquer :** 🆕 à ajouter en base.
```sql
alter table subscriptions add column max_pets int default 1;
```

### Reproduction — repositionnement 🔧

**Décision produit : la reproduction ne doit pas être mise en avant.** Elle ne doit apparaître ni dans la communication, ni comme fonctionnalité centrale, ni comme parcours structurant.

**Occurrences réelles dans le code (12 au total) :**

| Emplacement | Nature | Action |
|---|---|---|
| Lignes 26-34 (données `AN`) | `purpose:"reproduction"` sur 7 animaux de démo | Remplacer par `balade` / `social` dans les données de seed |
| Ligne 189 (`PURP_C`) | Matrice de compatibilité des objectifs | Retirer l'entrée `reproduction` ou la neutraliser |
| Ligne 850 | Onglet communauté : catégorie « Reproduction » | **Supprimer** de la liste des catégories |
| Ligne 876 | Filtre de découverte : option « Repro » | **Supprimer** de la liste des filtres |
| Ligne 1160 | Badge affiché sur la carte de swipe | Supprimer le cas `reproduction` |
| Ligne 1387 | Hashtag `#reproduction` dans la communauté | **Supprimer** |
| SQL `pets.purpose` | `check (purpose in ('reproduction','balade','social','show'))` | Voir ci-dessous |

**Décision SQL recommandée :**
```sql
-- Retirer reproduction des objectifs proposés
alter table pets drop constraint pets_purpose_check;
alter table pets add constraint pets_purpose_check
  check (purpose in ('balade','social','jeu'));
```

**Note juridique :** ce repositionnement renforce la position de l'Art. 2 des CGU (Furrix = plateforme de mise en relation, jamais de commerce animal). Les CGU existantes restent valables et n'ont pas besoin d'être réécrites.

✅ **DÉCIDÉ — l'objectif `show` est retiré** en même temps que `reproduction`. Motif : concours et expositions relèvent du même univers (élevage, pedigree) que la reproduction, et le conserver brouillerait le repositionnement. *Décision par défaut, réversible.*

```sql
alter table pets drop constraint pets_purpose_check;
alter table pets add constraint pets_purpose_check
  check (purpose in ('balade','social','jeu'));
```

---

## 8. Communautés

### Existant 🔧

- UI complète : fil de publications, catégories, hashtags, avatars (données `PT`)
- Table SQL `posts` : `author_id`, `species`, `title`, `body`, `tag`

### À créer 🆕

Le CDC demande des « communautés », mais **le code ne contient qu'un fil de publications plat** — il n'existe aucune notion de communauté en tant qu'entité (groupe que l'on rejoint).

✅ **DÉCIDÉ — Option B retenue** (vraies communautés). Motif : la **création de communauté devient un droit exclusif de l'abonnement Max** (§17). C'est ce qui donne à la formule haute une raison d'exister au-delà du confort, et ce qui crée de l'ancrage local — cohérent avec la stratégie Hauts-de-France. Un groupe animé par un abonné génère de la rétention qui ne s'achète pas.

**Coût : +2 jours**, intégré au chiffrage §27.

**Option A — Fil thématique (existant, léger)**
Les « communautés » sont des filtres par espèce/thème sur un fil unique. Aucune table supplémentaire. Travail : brancher `posts`. **~0,5 j.**

**Option B — Vraies communautés (à créer)**
Groupes que l'on rejoint, avec membres, modérateurs, fil propre.
```sql
create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text, species text,
  region text, avatar_url text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create table community_members (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member' check (role in ('member','moderator')),
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);
alter table posts add column community_id uuid references communities(id);
```
Travail : **~2 j** (tables, RLS, UI de découverte/adhésion, fil par communauté).

**Également manquant dans les deux cas :** création de publication (le front n'affiche que la lecture), commentaires, likes de publication. 🆕 **~1 j.**

---

## 9. Animaux perdus

### Existant 🔧

- UI : liste des alertes, badge « urgent », carte, modale de détail (données `LS`)
- Table SQL `lost_pets` complète : `pet_id`, `reporter_id`, `city`, `lat/lng`, `reward`, `urgent`, `status` (`lost`/`found`/`closed`), index géographique GiST

### À créer 🆕

- **Formulaire de déclaration de perte** (le front ne fait qu'afficher)
- **Passage en « retrouvé »** par le déclarant
- **Notification push** aux utilisateurs dans un rayon donné — c'est la fonctionnalité qui donne sa valeur réelle à la brique
- **Partage externe** (lien partageable vers une alerte — levier d'acquisition important via les groupes Facebook locaux)

**Positionnement assumé :** version simple et géolocalisée. Le marché est occupé par des acteurs 100 % spécialisés (Animou, Lost'Him, avec reconnaissance photo par IA). Furrix n'entre pas en concurrence frontale sur ce terrain : la brique sert la cohérence de l'écosystème pour les utilisateurs déjà présents.

---

## 10. Événements

### Existant 🔧
- UI : liste filtrable par espèce, jauge de participants
- Tables `events` + `event_participants`

### À créer 🆕
- **Création d'événement par un utilisateur** (le front n'a que la lecture)
- **Inscription / désinscription** branchée
- **Mise en avant payante d'un événement** (achat ponctuel — voir section 18)
- Champ organisateur : `alter table events add column organizer_id uuid references profiles(id);`

---

### Droits de création — événements et communautés

**Principe : on vend l'accès et la visibilité, pas la quantité.** Mais on ne bride jamais la création au point de vider l'application au lancement.

| Droit | Gratuit | Plus | Max |
|---|---|---|---|
| Rejoindre une communauté | Illimité | Illimité | Illimité |
| **Créer une communauté** | ❌ | ❌ | **✅ exclusif** |
| S'inscrire à un événement | Illimité | Illimité | Illimité |
| **Créer un événement** | 1 / mois | 3 / mois | **Illimité** |
| Mise en avant d'un événement | Achat ponctuel | Achat ponctuel | **1 incluse / mois** |
| Outils d'organisateur (liste des inscrits, message groupé) | ❌ | ✅ | ✅ |

**Justification du seuil gratuit à 1 événement/mois :** si la création était réservée aux abonnés, l'application afficherait zéro événement au lancement — puisqu'il n'y aurait quasiment aucun abonné. L'app paraîtrait morte, ce qui empêcherait précisément les abonnements. Le gratuit limité remplit l'application ; le payant lève la limite et ajoute la visibilité.

**La création de communauté est le seul droit véritablement exclusif.** Motif : une communauté est une position durable (on devient l'animateur d'un groupe local), pas un usage ponctuel — c'est donc le bon candidat à l'exclusivité, contrairement à l'événement qui doit rester accessible pour nourrir le produit.

🆕 **À implémenter :** contrôle de quota serveur sur la création d'événement (compteur mensuel glissant), et vérification du `tier` sur la création de communauté. Comme pour tous les droits, **la vérification est serveur, jamais côté client.**

---

## 11. Professionnels / partenaires — B2B

### 🆕 **Cette section est intégralement à créer. Rien n'existe dans le code.**

Le schéma ne contient qu'une table `vets` (annuaire de vétérinaires, données statiques). Il n'existe :
- aucun compte professionnel,
- aucun parcours d'inscription pro,
- aucune fiche pro éditable par son titulaire,
- aucune catégorie éducateur / pet sitter / ambassadeur / éleveur / assurance.

### Modèle de données proposé

```sql
create table pro_categories (
  id text primary key,          -- 'veterinaire','educateur','petsitter',
                                -- 'association','refuge','ambassadeur',
                                -- 'assurance','eleveur','toiletteur','autre'
  label text not null,
  sort_order int default 100
);

create table professionals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  category_id text not null references pro_categories(id),
  business_name text not null,
  description text,
  services text[],                        -- prestations proposées
  address text, city text, region text,
  lat float8, lng float8,
  phone text, email text, website text,
  socials jsonb default '{}',
  opening_hours jsonb default '{}',
  species_handled text[],                 -- espèces prises en charge
  verified bool default false,            -- validé par Furrix
  partner bool default false,             -- partenaire commercial → priorité d'affichage
  teleconsult bool default false,
  status text default 'pending'
    check (status in ('pending','active','suspended')),
  created_at timestamptz default now()
);
create index idx_pro_geo on professionals using gist (point(lng, lat));
create index idx_pro_cat on professionals (category_id, region);

-- Le rôle utilisateur doit accepter 'pro'
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('user','pro','moderator','admin'));
```

**Règle métier impérative :** les professionnels marqués `partner = true` **doivent systématiquement apparaître avant** les autres dans toutes les listes et sur la carte, avec un badge distinctif. C'est le support de la monétisation B2B — sans cette priorité d'affichage, le partenariat n'a rien à vendre.

**Décision sur `vets` :** la table existante doit être **migrée dans `professionals`** avec `category_id = 'veterinaire'` plutôt que maintenue en parallèle. Conserver deux modèles créerait une dette immédiate.

✅ **DÉCIDÉ — inscription self-service avec validation.** Le professionnel crée lui-même sa fiche, Furrix la valide avant publication.

**Parcours à développer :**
1. Choix du type de compte à l'inscription (particulier / professionnel)
2. Formulaire pro : catégorie, raison sociale, description, services, adresse, coordonnées, horaires, espèces prises en charge
3. Fiche créée avec `status = 'pending'` — **invisible publiquement tant qu'elle n'est pas validée**
4. Validation manuelle par Furrix → `status = 'active'`
5. Édition de sa fiche par le professionnel à tout moment (repasse en `pending` si modification substantielle ❓ à affiner)

**Coût : +3 jours de développement** par rapport à une saisie administrée. Intégré au chiffrage de la section 27.

**Garde-fou :** aucune fiche ne doit être visible avant validation — sinon n'importe qui peut publier une fiche vétérinaire frauduleuse, ce qui engage ta responsabilité.

---

## 12. Vétérinaires / santé / services

### Vétérinaires & RDV 🔧
- ✅ Table `vets` + `appointments`, UI de fiche et de prise de RDV, seed de 4 vétérinaires Hauts-de-France
- 🆕 Branchement réel, confirmation par email (Edge Function `send-email` prête, template `appointment` déjà écrit)

### Téléconsultation 🆕 — **rien n'existe**

Le code ne contient que des **libellés** (`Téléconsultation`, badge `tc:true` sur certains vétérinaires). Aucune implémentation.

**Architecture requise :**

| Élément | Détail |
|---|---|
| Fournisseur | Daily.co (SDK léger, compatible Capacitor, facturation à la minute) |
| Création de salle | Edge Function : `POST api.daily.co/v1/rooms` avec `exp` (expiration) et `eject_at_room_exp: true` |
| Limitation de durée | **Coupure automatique** à l'expiration — protège la marge |
| Crédits temps | Solde en secondes décrémenté via webhook de fin d'appel |
| Alerte | Bandeau à 2 minutes de la fin (évite la coupure en pleine phrase) |

```sql
create table teleconsult_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  pro_id uuid not null references professionals(id),
  pet_id uuid references pets(id),
  room_url text, room_name text,
  scheduled_at timestamptz,
  duration_seconds int,              -- durée réellement consommée
  status text default 'scheduled'
    check (status in ('scheduled','active','completed','cancelled')),
  created_at timestamptz default now()
);
alter table profiles add column teleconsult_credits_seconds int default 0;
```

**Modèle économique recommandé pour le lancement :** commission sur consultation. Le professionnel fixe son tarif, Furrix prélève **15 %** *(valeur retenue par défaut, modifiable)*. C'est le seul modèle qui n'exige aucune avance de trésorerie et qui teste la demande réelle avant d'investir dans un abonnement vitrine.

✅ **DÉCIDÉ — vente à l'acte uniquement.** Aucun quota de téléconsultation n'est inclus dans les abonnements, quels qu'ils soient.

**Conséquence : zéro risque de marge.** Le vétérinaire est rémunéré à chaque session, Furrix prélève sa commission sur chaque transaction. Il n'existe aucun cas où une consommation intensive par un abonné coûterait de l'argent à Furrix.

**Conséquence technique :** la colonne `profiles.teleconsult_credits_seconds` ne sert plus de quota d'abonnement mais uniquement de solde acheté à l'acte (consommable `teleconsult_credit`). Aucune logique de recharge mensuelle à développer — c'est une simplification.

### Carnet de santé 🆕 — **placeholder uniquement**

Le code affiche « Carnet de santé — ajout en cours ». Aucune donnée, aucune table.

```sql
create table health_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  type text not null check (type in
    ('vaccin','traitement','visite','poids','allergie','chirurgie','autre')),
  title text not null,
  description text,
  date date not null,
  next_due date,                     -- rappel (ex. rappel de vaccin)
  document_url text,                 -- Storage bucket 'documents' (privé)
  pro_id uuid references professionals(id),
  created_at timestamptz default now()
);
create index idx_health_pet on health_records (pet_id, date desc);
```

Le bucket Storage privé `documents` est **déjà créé** dans la migration existante. ✅

### Assurances 🔧
Section UI présente, contenu statique. Au lancement : fiches partenaires (catégorie `assurance` dans `professionals`) + lien d'affiliation traçable. Aucune API assureur à intégrer — chaque assureur a son propre process, à chiffrer au cas par cas ultérieurement.

---

## 13. UX/UI — analyse de l'existant

### Ce qui est bon et ne doit pas être touché ✅

Une passe CRO et accessibilité complète a déjà été réalisée :

| Élément | État |
|---|---|
| Design system | Tokens centralisés (`T`), ~50 icônes SVG, illustrations 8 espèces |
| Micro-interactions | Press states `scale(0.97)`, hover avec élévation, transitions |
| Vitesse perçue | Skeleton shimmer, fade-in des images |
| Accessibilité | `focus-visible`, aria-labels, contraste AA, `prefers-reduced-motion` |
| Paywall | Ancrage prix, badge « LE PLUS CHOISI » sur l'annuel, réassurance |
| Aversion à la perte | « Dernier swipe du jour ! » au seuil critique |

**Recommandation : ne pas redesigner.** Le temps disponible doit aller au câblage des données.

### Problèmes identifiés

| # | Problème | Proposition | Raison | Impact | Priorité |
|---|---|---|---|---|---|
| 1 | Onboarding en 4 étapes, très dense (santé, caractère, habitudes, maître) | Réduire à 2 étapes : animal essentiel + photo. Le reste en complétion différée, incitée par les PawPoints | Chaque étape d'onboarding coûte 10-20 % d'abandon | Fort sur l'activation | **Haute** |
| 2 | Aucun écran « Qui m'a liké » alors que c'est l'argument Premium n°1 | Créer l'écran avec compteur visible et profils floutés en gratuit | Déclencheur de conversion le plus efficace du secteur | Fort sur la conversion | **Haute** |
| 3 | Navigation à 6 onglets, dense sur mobile | Regrouper Événements dans Communauté → 5 onglets | Loi de Hick : au-delà de 5, le choix ralentit | Moyen | Moyenne |
| 4 | Aucun état de chargement réseau ni gestion d'erreur (pas encore de réseau) | Error Boundary racine + toasts d'erreur standardisés + retry | Indispensable dès le branchement Supabase | Fort sur la stabilité | **Haute** |
| 5 | Aucun écran de signalement alors que la table `reports` existe | Ajouter l'action « Signaler » sur profil, message, publication | **Exigence Apple/Google** pour tout contenu généré par les utilisateurs | Bloquant store | **Haute** |
| 6 | Pas de parcours de suppression de compte | Écran dédié dans Paramètres | **Exigence Apple ET Google** depuis 2022 | Bloquant store | **Haute** |
| 7 | Carte de l'onglet Découvrir = SVG statique de la France | Mapbox GL (code prêt dans `Furrix_Geolocalisation_API.md`) | La carte actuelle n'est pas fonctionnelle | Moyen | Moyenne |
| 8 | Paywall unique, non différencié | Refonte pour 2 formules + achats ponctuels | Le modèle économique a changé | Fort | **Haute** |

---

## 14. Monétisation — architecture générale

**Modèle validé : Freemium + 2 abonnements + achats ponctuels.**

🔧 **Le modèle de données actuel ne supporte qu'un seul abonnement :**
```sql
plan text check (plan in ('monthly','annual'))  -- une seule formule, 2 périodicités
```

### Architecture cible 🆕

```sql
-- Formules d'abonnement
alter table subscriptions drop constraint subscriptions_plan_check;
alter table subscriptions
  add column tier text check (tier in ('plus','max')),
  add column period text check (period in ('monthly','annual')),
  add column max_pets int default 1;

-- Catalogue des produits ponctuels (consommables)
create table consumable_products (
  id text primary key,              -- 'boost_1','superlike_5','event_feature'...
  label text not null,
  description text,
  kind text not null check (kind in ('boost','superlike','event_feature','visibility','teleconsult_credit')),
  quantity int not null default 1,  -- nb d'unités créditées
  store_product_id text not null    -- identifiant App Store / Play Store
);

-- Solde de consommables par utilisateur
create table user_consumables (
  user_id uuid references profiles(id) on delete cascade,
  kind text not null,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz default now(),
  primary key (user_id, kind)
);

-- Historique de tous les achats (audit + restauration + support)
create table purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product_id text not null,
  type text not null check (type in ('subscription','consumable')),
  source text not null check (source in ('apple','google')),
  store_transaction_id text unique,  -- idempotence
  amount numeric(8,2), currency text default 'EUR',
  purchased_at timestamptz default now()
);

-- Consommation tracée (anti-fraude, support client)
create table consumable_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null, delta int not null,
  context jsonb,                     -- ex. {"pet_id":"...","target":"..."}
  created_at timestamptz default now()
);
```

### Règles impératives

1. **Aucun droit n'est jamais écrit par le client.** Seul le webhook RevenueCat (`revenuecat-webhook`, ✅ déjà codé) écrit dans `subscriptions`. Les consommables se créditent uniquement via Edge Function.
2. **Idempotence** sur `store_transaction_id` — un achat rejoué ne crédite pas deux fois.
3. **Restauration des achats** : obligatoire Apple. RevenueCat la gère nativement via `Purchases.restorePurchases()`, mais les consommables déjà consommés ne se restaurent pas (comportement standard, à expliquer dans les CGV).
4. **Vérification des droits côté serveur** pour toute action à valeur (boost, superlike, téléconsultation).

---

## 15. Freemium

| Fonctionnalité | Gratuit |
|---|---|
| Compte + profil animal | ✅ **1 animal** |
| Découverte et swipe | ✅ **5/jour** (à faire appliquer côté serveur) |
| Match et messagerie | ✅ Illimité avec ses matchs |
| Communauté | ✅ Lecture + publication |
| Animaux perdus | ✅ Consultation + déclaration |
| Événements | ✅ Consultation + inscription |
| Annuaire professionnels | ✅ Complet |
| Carnet de santé | ✅ 1 animal |
| Filtres | Espèce + rayon de base |
| Voir qui m'a liké | ❌ Compteur visible, profils floutés |
| Boost | ❌ (achat ponctuel possible) |
| Téléconsultation | ❌ (à l'acte) |

**Principe directeur :** le gratuit ne bride jamais la valeur de découverte ni l'utilité sociale (perdus, communauté, annuaire). Il bride l'usage intensif du matching — c'est le seul levier de conversion qui fonctionne durablement.

---

## 16. Abonnement Premium 1 — « Furrix Plus »

**Positionnement :** l'utilisateur régulier qui veut lever les limites du matching.

| Avantage | Détail |
|---|---|
| Swipes illimités | Levée de la limite de 5/jour |
| Voir qui m'a liké | Profils révélés |
| Animaux | **3 animaux** · *valeur retenue par défaut, modifiable* |
| Rayon élargi | Jusqu'à 100 km |
| Filtres avancés | Âge, taille, caractère, vérifié uniquement |
| Boost mensuel | 1 boost offert / mois |
| PawPoints | ×2 |
| Publicité | Aucune (si régie activée un jour) |

**Tarif : 9,99 €/mois — 74,99 €/an** (soit 6,25 €/mois, −37 %)

---

## 17. Abonnement Premium 2 — « Furrix Max »

**Positionnement :** le propriétaire multi-animaux et l'usage santé/services.

| Avantage | Détail |
|---|---|
| Tout Furrix Plus | Inclus |
| Animaux | **Illimités** |
| Boost | 4 boosts / mois |
| Super likes | 5 / mois inclus |
| Visibilité | Profil mis en avant dans la découverte locale |
| Carnet de santé | Export PDF + rappels automatiques de vaccins |
| **Créer des communautés** | **Droit exclusif** — devenir animateur d'un groupe local |
| Événements | Création illimitée + 1 mise en avant incluse / mois |
| Outils d'organisateur | Liste des inscrits, message groupé |
| Support | Prioritaire |

**Tarif : 19,99 €/mois — 149,99 €/an**

**Positionnement assumé.** Les apps animalières grand public se situent entre 5 et 6 €/mois (Wag! Premium 5,99 $, Petme 4,99-5,99 $), les apps de rencontre entre 15 et 31 €/mois (Tinder+ 14,99 €, Tinder Platinum 19,99 €). Max se place volontairement dans le haut de la fourchette, ce qui n'est défendable **que parce qu'il ne vend pas du volume mais un statut** : créer sa communauté, organiser sans limite, être l'animateur local. Un abonnement qui ne vendrait que « plus de boosts » ne tiendrait pas ce prix.

**La téléconsultation n'est pas incluse** (§12 — vente à l'acte uniquement).

⚠️ **Point de vigilance commercial :** Wag! justifie son abonnement par une économie chiffrable (frais de réservation offerts, 5 % sur chaque service) — l'utilisateur calcule son retour. Max vend aujourd'hui du statut et du confort. Pour sécuriser le prix dans la durée, il faudra y intégrer un avantage financier mesurable : remise sur les téléconsultations, frais de RDV offerts, ou réduction chez les partenaires.

**Logique de l'écart :** un ratio de 2× entre les deux formules est le standard du secteur. Un écart plus faible ne justifie pas la formule supérieure ; un écart plus fort la rend inatteignable.

---

## 18. Achats ponctuels / boost / consommables

| Produit | Contenu | Tarif proposé | `kind` |
|---|---|---|---|
| Boost × 1 | 1ʳᵉ position pendant 30 min | 2,99 € | `boost` |
| Boost × 5 | Pack | 9,99 € | `boost` |
| Super like × 5 | Like prioritaire et notifié | 4,99 € | `superlike` |
| Super like × 20 | Pack | 14,99 € | `superlike` |
| Mise en avant d'événement | 7 jours en tête de liste | 9,99 € | `event_feature` |
| Visibilité locale 24 h | Profil mis en avant dans le rayon | 4,99 € | `visibility` |
| Crédit téléconsultation 15 min | À l'acte | selon tarif du vétérinaire + commission 15 % | `teleconsult_credit` |

*Grille retenue par défaut, modifiable. Le crédit de téléconsultation est le seul produit dont le tarif dépend d'un accord avec les vétérinaires partenaires.*

**Point technique :** les consommables doivent être déclarés en **« Consumable »** dans App Store Connect et Google Play Console (et non « Non-Consumable »), sinon ils ne peuvent être rachetés.

**Garde-fou produit :** les achats ponctuels ne doivent jamais permettre d'obtenir gratuitement ce que vend l'abonnement de façon durable. Un boost à l'unité fait goûter ; l'abonnement donne le confort. Les deux se renforcent au lieu de se cannibaliser.

**Cohérence avec les PawPoints :** les PawPoints (gagnés par l'engagement) ne doivent **jamais** débloquer une fonctionnalité Premium ni un consommable payant. Ils donnent des avantages partenaires, des badges, et au maximum un boost découverte ponctuel. Cette règle est déjà appliquée dans le code actuel (`RW` / `EARN`) et doit être conservée.

---

## 19. B2C + B2B

| | B2C | B2B |
|---|---|---|
| Compte | `profiles.role = 'user'` ✅ | `profiles.role = 'pro'` 🆕 |
| Entité | `pets` ✅ | `professionals` 🆕 |
| Monétisation | Abonnements + consommables | Commission (téléconsult, RDV) + abonnement vitrine ❓ |
| Visibilité | Découverte, matching | Annuaire, carte, priorité partenaire |

**Au lancement :**
- Fiches professionnelles **administrées** (saisie en back-office Supabase par Yannis) — recommandation, car plus rapide et contrôle qualité
- Priorité d'affichage systématique aux `partner = true`
- Pas d'offre pro payante self-service — mais le modèle de données doit la permettre sans refonte

🆕 **Back-office minimal à prévoir** : actuellement il n'existe aucune interface d'administration. Au lancement, le dashboard Supabase suffit pour saisir les fiches pro et traiter les signalements. Une interface dédiée est un chantier à part entière (~3 j) qui n'est pas indispensable au jour 1.

---

## 20. Sécurité / confidentialité / modération

### Existant ✅
- RLS activée sur les 19 tables avec policies complètes
- Cloisonnement strict : un utilisateur ne lit que ses messages, ses points, son abonnement
- Rate limiting multi-clés (IP + user + fingerprint) — Edge Function `rate-limit` codée
- Points attribués côté serveur uniquement (`award-points`)
- Webhook RevenueCat avec secret partagé et idempotence
- Table `reports` + policy de modération
- Documentation juridique complète (CGU, CGV, RGPD, mentions légales)

### À créer 🆕
- **UI de signalement** (profil, message, publication, fiche pro) — **bloquant stores**
- **Suppression de compte in-app** — **bloquant stores**
- **Blocage d'un utilisateur** (table `blocked_users` à créer)
- **File de modération** : au lancement, traitement via le dashboard Supabase
- **Pages légales hébergées** : squelette dans `legal-pages/`, à compléter et mettre en ligne — **bloquant stores**

### Rappel RGPD
Hébergement Supabase **Frankfurt (UE)**. Export des données sur demande, suppression en cascade (`on delete cascade` posé sur toutes les tables). Âge minimum 18 ans à faire respecter à l'inscription.

---

## 21. Architecture technique existante

| Couche | Technologie | État |
|---|---|---|
| Front | React 18 + Vite, CSS-in-JS inline | ✅ Prototype complet, **données en dur** |
| Mobile | Capacitor (`capacitor.config.ts`, appId `fr.furrix.app`) | 🔧 Config prête, **jamais buildé** |
| Base de données | PostgreSQL / Supabase, 19 tables + RLS + RPC | ✅ Migrations prêtes, **jamais déployées** |
| Auth | Supabase Auth | 🆕 **Non branché, aucun écran** |
| Stockage | Buckets `pet-photos` (public) et `documents` (privé) | ✅ Créés en migration, non utilisés |
| Temps réel | Supabase Realtime | 🆕 Non branché |
| Paiement | RevenueCat + IAP | 🔧 Webhook codé, **SDK client absent** |
| Emails | Brevo (`send-email`) | ✅ Codé, 2 templates |
| Push | — | 🆕 **Aucune implémentation** |
| Géolocalisation | — | 🆕 Distances **en dur** dans les données |
| Cartes | SVG statique de la France | 🔧 À remplacer par Mapbox |
| Matching | `computeScore` + `buildPool` + RPC `swipe_and_match` | ✅ Front et SQL prêts, non reliés |
| Monitoring | — | 🆕 Sentry / PostHog absents |

**Edge Functions existantes (5, toutes codées) :** `revenuecat-webhook`, `send-email`, `award-points`, `redeem-reward`, `rate-limit`. ✅

**Synthèse honnête :** le projet est un **prototype front abouti + un socle backend prêt**, sans aucune jonction entre les deux. Le travail principal est le câblage, écran par écran — détaillé dans `Furrix_Guide_Demarrage_Dev.md` §3.

---

## 22. Architecture technique cible

### Tables à ajouter 🆕

| Table | Objet |
|---|---|
| `species` | Espèces extensibles sans migration |
| `professionals` + `pro_categories` | Écosystème B2B |
| `health_records` | Carnet de santé |
| `teleconsult_sessions` | Téléconsultation |
| `consumable_products`, `user_consumables`, `consumable_usage` | Achats ponctuels |
| `purchases` | Historique et restauration |
| `blocked_users` | Blocage inter-utilisateurs |
| `communities` + `community_members` | ❓ si option B retenue (§8) |

### Colonnes à modifier 🔧
```sql
alter table subscriptions add column tier text, add column period text, add column max_pets int default 1;
alter table profiles add column teleconsult_credits_seconds int default 0;
alter table events add column organizer_id uuid references profiles(id);
alter table pets drop constraint pets_species_check;   -- → FK vers species
alter table pets drop constraint pets_purpose_check;   -- → retrait de reproduction
alter table profiles drop constraint profiles_role_check; -- → ajout de 'pro'
```

### Edge Functions à ajouter 🆕
| Fonction | Rôle |
|---|---|
| `grant-consumable` | Crédite un consommable après achat validé |
| `consume-item` | Débite un boost / super like, applique l'effet |
| `create-teleconsult` | Crée la salle Daily.co avec expiration |
| `teleconsult-webhook` | Décompte le temps réellement consommé |
| `notify-push` | Envoi FCM/APNs (match, message, alerte perdu) |

### Front — refonte structurelle 🔧
Le fichier unique de 1 708 lignes doit être découpé (arborescence détaillée dans `Furrix_Documentation_Technique.md` §1.4). **Contrainte absolue : ne pas réécrire le moteur de swipe** (`doSw`/`flyOut`/`commitSwipe`) — il repose sur une manipulation DOM directe qui garantit les 60 fps et qu'un passage en `setState` casserait.

---

## 23. Compatibilité iOS / Android

**Stratégie : mobile natif direct via Capacitor. Pas de PWA publique, pas de version web de vente.**

| Élément | Action |
|---|---|
| Setup | `npx cap add ios && npx cap add android` — config déjà écrite |
| Plugins requis | `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor/preferences`, `@revenuecat/purchases-capacitor` |
| Permissions iOS | `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` — textes en français obligatoires |
| Permissions Android | `ACCESS_COARSE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS` |
| Safe areas | `env(safe-area-inset-*)` déjà en place ✅ — à vérifier sur encoche / Dynamic Island |
| Paiement | **100 % IAP** — Stripe est interdit par Apple pour un abonnement consommé dans l'app |
| Build iOS | **Mac obligatoire** (Xcode), ou Codemagic / Ionic Appflow en cloud |
| Comptes | Apple 99 $/an · Google Play 25 $ une fois — **validation Apple parfois 48 h, à lancer immédiatement** |
| Assets | `icon.png` 1024×1024 et `splash.png` 2732×2732 à fournir → `npx capacitor-assets generate` |
| OTA | `@capgo/capacitor-updater` permet de pousser les correctifs web sans repasser par la review |

---

## 24. QA / tests / lancement

### Checklist bloquante — aucune soumission sans ces points

**Sécurité**
- [ ] RLS testée avec 2 comptes : B ne lit ni les messages, ni les points, ni l'abonnement de A
- [ ] Aucun secret dans le bundle client ni dans Git (`gitleaks` sur l'historique)
- [ ] Statut Premium impossible à modifier côté client
- [ ] Solde de consommables impossible à modifier côté client

**Paiement**
- [ ] Achat abonnement Plus (mensuel + annuel) en sandbox iOS et Android
- [ ] Achat abonnement Max en sandbox
- [ ] Achat consommable, crédit effectif, consommation, solde décrémenté
- [ ] **Restauration des achats** (obligatoire Apple)
- [ ] Changement de formule Plus → Max et Max → Plus
- [ ] Annulation : accès maintenu jusqu'à `current_period_end`
- [ ] Webhook idempotent : un événement rejoué ne crédite pas deux fois

**Fonctionnel**
- [ ] Parcours complet : inscription → profil → swipe → match → chat
- [ ] Multi-animaux : ajout, sélection de l'animal actif, quota respecté
- [ ] Déclaration d'animal perdu + notification aux utilisateurs proches
- [ ] Prise de RDV vétérinaire + email de confirmation reçu
- [ ] Téléconsultation : salle créée, coupure automatique à l'expiration
- [ ] Publication communauté + signalement + modération
- [ ] Création et inscription à un événement

**Conformité stores**
- [ ] Suppression de compte accessible dans l'app
- [ ] Signalement disponible sur tout contenu utilisateur
- [ ] Blocage d'utilisateur fonctionnel
- [ ] Pages légales en ligne, URL renseignée dans les deux consoles
- [ ] Déclaration d'âge 18+ à l'inscription
- [ ] Privacy Nutrition Labels (Apple) et Data Safety (Google) remplis
- [ ] Compte de démonstration fourni aux reviewers Apple

**Technique**
- [ ] Testé sur iPhone et Android physiques
- [ ] Aucun crash au lancement
- [ ] Gestion des erreurs réseau (mode avion, perte de connexion)
- [ ] Sentry branché pour voir les erreurs post-lancement

---

## 25. Réponses aux questions de Guillaume

### Q1 — Balade, socialisation ou reproduction : les trois au même niveau ?

**Non.** Balade et socialisation portent le volume et la communication. **La reproduction n'est pas mise en avant** — ni dans le marketing, ni comme parcours central. Les 12 occurrences dans le code sont listées en **section 7** avec l'action à mener pour chacune.

Techniquement, le champ `pets.purpose` reste en place pour la compatibilité du scoring, mais la valeur `reproduction` doit être retirée des options proposées à l'utilisateur et des filtres.

### Q2 — Parcours minimal ou modules dès la V1 ?

**Modules dès le lancement.** Il n'y a pas de découpage en phases. Sont dans le périmètre : vétérinaires, téléconsultation, communauté, événements, animaux perdus, carnet de santé, espace professionnel.

**La marketplace est la seule exclusion explicite.** Les données `PR` (produits) présentes dans `Furrix.jsx` sont donc à retirer du périmètre de lancement.

⚠️ Voir **section 27** : ce périmètre pose un problème de planning qui doit être arbitré.

### Q3 — Vision exacte ?

**Application tout-en-un autour de la vie de l'animal.** Le matching est la porte d'entrée et le moteur d'engagement, pas la finalité. Formulation de référence : *« l'écosystème complet du maître animalier, dont la rencontre est la première porte. »*

### Q4 — Reproduction au lancement ? Principale ou secondaire ? (volet juridique)

**Présente techniquement, jamais mise en avant.** Le cadrage juridique existe déjà et reste valable — `Furrix_Documentation_Juridique.md`, **Art. 2 des CGU** :

> Furrix est une plateforme de mise en relation. Furrix ne vend, ne loue et ne fait commerce d'aucun animal. Toute décision de mise à la reproduction et le respect des obligations légales afférentes relèvent exclusivement des utilisateurs.

**Trois règles à ne jamais enfreindre :**
1. Furrix ne perçoit jamais d'argent sur une vente d'animal ou de portée
2. Aucune annonce de type « chiot à vendre » ne doit pouvoir être publiée (modération des publications)
3. Le mot « vente » n'apparaît jamais dans l'UI en lien avec un animal

Le repositionnement décidé **renforce** cette position juridique.

### Q5 — Tous les animaux ou chiens/chats d'abord ?

**Tous.** Le front gère déjà 8 espèces avec illustrations dédiées. **Mais la contrainte `CHECK` sur `pets.species` doit être remplacée par une table de référence** (section 4) pour permettre d'ajouter une espèce sans migration SQL.

Nuance commerciale : l'acquisition et la communication ciblent chiens et chats en priorité, car ce sont eux qui créent la densité locale nécessaire au matching.

### Q6 — Zone de lancement ?

**Toute la France techniquement, Hauts-de-France commercialement.** Aucune restriction géographique dans le code — le filtre est un rayon en kilomètres. L'effort d'acquisition se concentre sur la métropole lilloise jusqu'à atteindre une densité suffisante. Le seed vétérinaires est déjà rempli en Hauts-de-France.

### Q7 — Stratégie anti « appli vide » ?

Cinq leviers, à activer **avant** l'ouverture publique :

1. **Refuges, associations, SPA** — vitrine d'adoption gratuite contre relais à leur communauté
2. **Vétérinaires, éducateurs, pet sitters, toiletteurs** — fiches pro pré-remplies + QR code en salle d'attente
3. **Ambassadeurs et micro-influenceurs** (5-50k abonnés) — Premium offert + code de parrainage traçable
4. **Groupes Facebook locaux** — la fonctionnalité animaux perdus sert de porte d'entrée : elle rend un service réel, donc elle est acceptée et non perçue comme du spam
5. **Contenu quotidien** TikTok / Reels — démarre **avant** la mise en ligne de l'app

**Bêta locale recommandée :** une trentaine d'utilisateurs pilotes recrutés via les refuges et ambassadeurs, une semaine avant l'ouverture, pour que les premiers vrais utilisateurs trouvent déjà des profils.

**Action immédiate possible :** déployer le prototype tel quel (données de démo) sur une URL privée, pour filmer le contenu et démarcher les partenaires **en parallèle** du développement.

### Q8 — Monétiser dès le lancement ? Quels tarifs ? Quelles grilles ?

**Monétisation dès le lancement.** C'est le seul moyen de savoir si le modèle convertit, et un rebranchement ultérieur coûterait plus cher.

**La grille 7,99 € / 59,99 € est OBSOLÈTE.** Elle subsiste uniquement dans des documents Word générés avant l'arbitrage prix. **La grille valide est :**

| Formule | Mensuel | Annuel |
|---|---|---|
| Furrix Plus | **9,99 €** | **74,99 €** (−37 %) |
| Furrix Max | **19,99 €** ❓ | **149,99 €** ❓ |

Le code (`Furrix.jsx`) est déjà à jour sur 9,99 / 74,99 pour la formule unique actuelle.

**Ce qui est payant** — détail en sections 15 à 18 :
- **Plus** : swipes illimités, voir qui m'a liké, 3 animaux, rayon élargi, filtres avancés, 1 boost/mois, PawPoints ×2
- **Max** : animaux illimités, 4 boosts/mois, 5 super likes/mois, visibilité renforcée, export carnet de santé, support prioritaire
- **Ponctuels** : boost, super likes, mise en avant d'événement, visibilité 24 h, crédits téléconsultation

### Q9 — PWA d'abord ou natif direct ? Design conservé ?

**Natif direct iOS + Android via Capacitor.** Pas de PWA publique, pas de version web de vente. Conséquence assumée : 100 % du chiffre d'affaires passe par l'IAP (commission 15-30 %).

Seule exception web : une page statique obligatoire pour la soumission (mentions légales + politique de confidentialité). Squelette dans `legal-pages/`.

**Design : `Furrix.jsx` est la référence principale, pas une maquette jetable.** Il a déjà reçu une passe CRO et accessibilité complète. **Ne pas redesigner** — le temps disponible doit aller au câblage. Les seuls changements UX validés sont les 8 points de la section 13, dont 6 sont bloquants ou à fort impact.

**Ce qui n'existe pas encore :** le branding visuel définitif (logo, icône d'app, splash). Le logo actuel est une illustration de patte générique. Voir `assets/README.md`.

### Q10 — Priorités business après le matching ?

1. **Vétérinaires** (annuaire + RDV) — porte d'entrée du B2B
2. **Téléconsultation** — valeur perçue élevée, commission immédiate
3. **Animaux perdus** — fort en acquisition, faible en revenu direct
4. **Communauté** — moteur de rétention
5. **Événements** — ancrage local
6. **Assurances** — meilleur ratio revenu/effort une fois le volume atteint
7. **Carnet de santé** — confort, pas de revenu direct
8. **Marketplace** — **hors périmètre**

### Q11 — B2C seul ou espace professionnel dès le départ ?

**Les deux, dès le lancement.** L'écosystème professionnel est explicitement dans le périmètre : vétérinaires, éducateurs, pet sitters, associations, refuges, ambassadeurs, assurances, éleveurs.

⚠️ **Point d'attention majeur : rien n'existe aujourd'hui.** Il n'y a ni table `professionals`, ni rôle `pro`, ni parcours d'inscription, ni fiche éditable. Le modèle complet est proposé en **section 11**.

**Recommandation pour tenir le délai :** fiches professionnelles **administrées** au lancement (saisie en back-office) plutôt que self-service. Cela divise par trois le temps de développement et permet de contrôler la qualité tant que les partenaires sont peu nombreux.

### Q12 — Plusieurs animaux dès la V1 ? Profil et matching indépendants ?

**Oui aux deux, avec un quota lié à l'abonnement :** gratuit = 1 animal, Plus = 3, Max = illimité.

**Chaque animal a bien son propre profil et son propre matching** — et c'est déjà le cas dans le modèle de données : `swipes` et `matches` référencent `pet_id`, pas `user_id`. **Aucune migration n'est nécessaire côté base.**

🔧 **Le travail est côté front uniquement** : `myPet` est actuellement un objet unique et doit devenir un tableau avec un animal actif. Détail en section 7.

### Q13 — Définition d'un lancement réussi ?

**Seuil de rentabilité :** coûts fixes de 50 à 150 €/mois (Supabase, domaine, compte Apple). **Rentable à partir d'environ 15-20 abonnés Plus.**

**Objectifs à 30 jours après ouverture publique :**

| Indicateur | Cible |
|---|---|
| Utilisateurs inscrits | 500 – 1 500 |
| Taux d'activation (profil animal créé) | > 60 % |
| Matchs créés | 200+ |
| Conversations démarrées | 100+ |
| Abonnés Premium | 15 – 40 |
| Partenaires professionnels signés | 5 – 10 |

**Objectifs à 90 jours :** ~9 000 utilisateurs, 2,5 % de conversion, ~225 abonnés, ~1 800 €/mois de revenu récurrent.

**L'indicateur le plus important : le taux de conversation par match.** Si les utilisateurs matchent sans se parler, le produit ne résout pas le problème et aucun volume d'acquisition ne le compensera. À surveiller dès les 50 premiers matchs.

---

## 26. Décisions produit validées

| # | Décision |
|---|---|
| 1 | Furrix est une application tout-en-un, pas un simple Tinder animalier |
| 2 | Le matching reste central comme porte d'entrée |
| 3 | Toutes les espèces, sans limitation technique |
| 4 | Chiens et chats prioritaires en acquisition |
| 5 | **La reproduction n'est jamais mise en avant** |
| 6 | Disponible dans toute la France, commercialisation en Hauts-de-France |
| 7 | Ambassadeurs, associations, vétérinaires, éducateurs, pet sitters = partenaires prioritaires |
| 8 | Lancement simultané iOS + Android |
| 9 | Freemium + 2 abonnements + achats ponctuels |
| 10 | Gratuit = 1 animal · Premium = plusieurs selon la formule |
| 11 | B2C et B2B dès le lancement |
| 12 | **Marketplace exclue du périmètre** |
| 13 | Pas de roadmap en phases — tout le périmètre est attendu au lancement |
| 14 | Design `Furrix.jsx` conservé comme référence |
| 15 | 100 % In-App Purchase, pas de Stripe |
| 16 | Âge minimum 18 ans |
| 17 | Les PawPoints ne débloquent jamais une fonctionnalité Premium |
| 18 | **Téléconsultation vendue à l'acte uniquement** — aucun quota dans les abonnements |
| 19 | **Inscription professionnelle en self-service** avec validation par Furrix avant publication |
| 20 | Objectif `show` retiré en même temps que `reproduction` |
| 21 | **Communautés = vraies communautés** (groupes avec membres et fil propre) |
| 22 | **Créer une communauté = droit exclusif Max** · créer un événement = 1/mois en gratuit, 3/mois Plus, illimité Max |
| 23 | **Téléchargement gratuit** — pas de prix d'entrée sur les stores |

---

## 27. Points à valider avec Guillaume

### ⚠️ 27.1 — Le point le plus important : périmètre vs délai

Un chiffrage avait été établi à **22,5 jours-homme** pour un périmètre **plus restreint** que celui de ce CDC — il n'incluait ni la téléconsultation, ni l'espace professionnel B2B, ni la seconde formule d'abonnement, ni les achats ponctuels, ni le multi-animaux, ni le carnet de santé.

**Estimation du périmètre additionnel :**

| Chantier | Estimation |
|---|---|
| Espace professionnel B2B — **self-service + validation** (tables, RLS, inscription, formulaire, fiche éditable, annuaire, modération) | 6 – 7 j |
| Téléconsultation (Daily.co, coupure auto, crédits à l'acte) | 2 j |
| Second abonnement + achats ponctuels (modèle, RevenueCat, UI, droits serveur) | 3 j |
| Multi-animaux (refonte front + quotas) | 2 j |
| Carnet de santé | 1,5 j |
| Écran « Qui m'a liké » | 0,5 j |
| Signalement + blocage + suppression de compte | 1,5 j |
| Création de publications / événements | 1 j |
| Communautés — **option B** (tables, RLS, découverte, adhésion, création) | 2 j |
| Quotas de création (événements, communautés) — contrôle serveur | 0,5 j |
| **Total additionnel** | **~20 – 21 j** |

**Total consolidé : environ 43 à 45 jours-homme pour un développeur seul.**

Converti en calendrier, avec la marge habituelle d'un travail solo (pas de parallélisation, reconstruction de contexte entre les couches, allers-retours de review Apple) : **10 à 12 semaines**.

**✅ DÉCIDÉ — arbitrage reporté :** Yannis et Guillaume trancheront ensemble après lecture de ce CDC. Trois leviers sont sur la table :
1. **Allonger le délai** à 9-11 semaines
2. **Ajouter une ressource** de développement en renfort
3. **Réduire le périmètre** de lancement

Ce CDC ne tranche pas et ne découpe pas en phases — il fournit le chiffrage pour que la décision soit prise en connaissance de cause.

**Deux repères utiles pour cet arbitrage :**
- Les chantiers les plus coûteux sont, dans l'ordre : l'espace professionnel self-service (6-7 j), le second abonnement avec achats ponctuels (3 j), les communautés (2 j), la téléconsultation (2 j) et le multi-animaux (2 j). Ce sont les seuls leviers réellement significatifs si le périmètre doit être réduit.
- Les éléments **non négociables** quel que soit l'arbitrage : signalement, blocage, suppression de compte et pages légales. Ce sont des exigences Apple et Google — sans eux, l'application est refusée à la soumission, quel que soit le reste.

### 27.2 — Décisions prises depuis la v1 du CDC

Tous les points précédemment ouverts ont été tranchés :

| # | Point | Décision | Statut |
|---|---|---|---|
| 1 | Téléconsultation : quota inclus ou à l'acte | **À l'acte uniquement** — zéro risque de marge | ✅ Validé |
| 2 | Inscription professionnelle | **Self-service avec validation** par Furrix (+3 j) | ✅ Validé |
| 3 | Arbitrage périmètre / délai | **Reporté** — Yannis et Guillaume tranchent après lecture | ⏳ En attente |
| 4 | Tarif Furrix Max | 19,99 €/mois · 149,99 €/an — justifié par la création de communautés | ✅ Validé |
| 5 | Grille des achats ponctuels | Boost 2,99 € · 5 boosts 9,99 € · 5 super likes 4,99 € · mise en avant événement 9,99 € · visibilité 24 h 4,99 € | 🔹 Par défaut |
| 6 | Animaux sur Furrix Plus | 3 | 🔹 Par défaut |
| 7 | Objectif `show` (concours) | **Retiré** avec `reproduction` | 🔹 Par défaut |
| 8 | Communautés | **Option B** — vraies communautés (2 j), création exclusive Max | ✅ Validé |
| 9 | Commission téléconsultation | **15 %** | 🔹 Par défaut |

🔹 *Par défaut* = valeur retenue pour ne pas bloquer le développement, modifiable sans impact technique majeur (sauf #7 et #8 qui touchent le schéma et l'UI).

### 27.3 — Seuls points réellement encore ouverts

| # | Point | Qui décide |
|---|---|---|
| 1 | **Arbitrage périmètre / délai** (§27.1) | Yannis + Guillaume |
| 2 | Une modification de fiche professionnelle repasse-t-elle en `pending` (revalidation) ou reste-t-elle publiée ? | Guillaume — impact modération |
| 3 | Back-office d'administration : dashboard Supabase au lancement, ou interface dédiée (~3 j) ? | Yannis + Guillaume |

## 28. Modifications à prévoir dans le code

### 🔴 Priorité haute — bloquant

| # | Fichier | Modification |
|---|---|---|
| 1 | `Furrix.jsx` | **Paiement simulé** : un clic sur une formule active Premium localement (`setPrem(true)`). À remplacer par le SDK RevenueCat ; le statut doit venir du webhook |
| 2 | `Furrix.jsx` | **Points modifiables côté client** (`aP()`) : triche triviale une fois en ligne. Basculer sur `award-points` |
| 3 | `Furrix.jsx` | **Limite de 5 swipes en `localStorage`** : contournable en vidant le cache. Basculer sur l'Edge Function `rate-limit` |
| 4 | `20261023134035_furrix_0001_init.sql` | Contrainte `CHECK` sur `pets.species` → table de référence `species` |
| 5 | `20261023134035_furrix_0001_init.sql` | `subscriptions.plan` ne supporte qu'une formule → ajout de `tier`, `period`, `max_pets` |
| 6 | `20261023134035_furrix_0001_init.sql` | `profiles.role` n'accepte pas `'pro'` |
| 7 | `Furrix.jsx` | `myPet` objet unique → tableau + animal actif |
| 8 | — | Aucun écran de signalement, de blocage, ni de suppression de compte — **bloquant stores** |

### 🟠 Priorité moyenne

| # | Objet | Modification |
|---|---|---|
| 9 | Reproduction | Retirer les 6 occurrences visibles en UI (lignes 850, 876, 1160, 1387) + données de seed + contrainte SQL |
| 10 | Marketplace | Retirer les données `PR` et la section correspondante — hors périmètre |
| 11 | Monolithe | `Furrix.jsx` fait 1 708 lignes : couplage fort, re-renders globaux. Découpage selon `Furrix_Documentation_Technique.md` §1.4 |
| 12 | Gestion d'erreur | Aucun Error Boundary, aucune gestion réseau |
| 13 | Photos | URLs Unsplash en dur → Storage `pet-photos` |
| 14 | Carte | SVG statique → Mapbox GL |
| 15 | Table `vets` | À migrer dans `professionals` plutôt que maintenue en parallèle |

### 🟡 Priorité basse

| # | Objet | Modification |
|---|---|---|
| 16 | Tests | Aucun test automatisé. Vitest sur `computeScore`/`buildPool` + la RPC `swipe_and_match` |
| 17 | Code mort | Champs `e:""` résiduels dans les données (emojis supprimés), `title` redondants avec les aria-labels |
| 18 | Duplication | Styles inline répétés sur les champs d'onboarding → composant `Field` |
| 19 | `localStorage` | Clé `furrix` sans versionnage de schéma → ajouter `{v:1,...}` |
| 20 | i18n | Textes français en dur. Acceptable pour un lancement France, à extraire si expansion |

### Points à ne pas toucher

- **Moteur de swipe** (`doSw`, `flyOut`, `snapBack`, `commitSwipe`, `advanceCard`) — optimisé 60 fps par manipulation DOM directe
- **Logique de scoring** (`computeScore`, `buildPool`) — pure, testable, correcte
- **Design system** (`T`, `btn`, `gh`, `cd`, icônes SVG, illustrations) — cohérent et déjà audité
- **Policies RLS existantes** — complètes et correctes

---

*Document de référence Furrix — Groupe Senyara. Toute décision d'architecture non couverte ici doit faire l'objet d'une note courte dans `/docs/adr/` plutôt que d'un échange informel.*
