# Audit technique Furrix

23 octobre 2026 · Revue des fichiers livrés · Préparation du point du lundi 26 octobre 2026

## 1. Décision proposée

**Conserver la base visuelle React et l’architecture React / Supabase / Capacitor, mais ne pas déployer le backend fourni en production en l’état.** Le projet livré est un prototype de démonstration accompagné d’un schéma et de fonctions serveur incomplets et vulnérables. Ce n’est pas une application fonctionnelle qu’il suffirait de « câbler ».

Le build web réussit. Les tests isolés montrent toutefois une élévation de privilèges, une RPC anonyme capable de fabriquer des matchs, une fonction de points en erreur SQL, une perte de débit lors d’échanges concurrents et un webhook qui peut perdre définitivement un achat. L’affirmation du CDC « policies RLS complètes et correctes » est contredite par les fichiers et les reproductions.

Le périmètre retenu pour cet audit est celui des deux PDF récents : application complète, B2C et professionnels self-service validés, deux abonnements, achats ponctuels, communautés, plusieurs animaux, santé et services ; marketplace exclue. **La priorisation ci-dessous ordonne les développements ; elle ne réduit pas le périmètre sans décision de Guillaume et Yannis.**

## 2. Périmètre, méthode et limites

### Sources examinées

- `furrix-platform.zip` : 32 fichiers, dont `src/Furrix.jsx` (1 708 lignes), `src/FurrixMVP.jsx` (496 lignes), les deux migrations, les cinq Edge Functions et leur helper CORS, les huit documents Markdown, le seed, les configurations, les pages légales et guides assets.
- `Furrix CDC Produit Technique.pdf` : 35 pages, extraction des 35 pages et vérification visuelle de la page 4.
- `Furrix CDC Produit Simplifie.pdf` : 11 pages, extraction des 11 pages et vérification visuelle de la page 6.
- Conversation d’origine consultée pour retrouver les pièces jointes. Les affirmations de Yannis et celles de la documentation ont été traitées comme des éléments à vérifier.

Les chemins `/mnt/data/...` de la conversation précédente ne sont pas montés dans cette session Windows. Les pièces ont été récupérées depuis les chemins temporaires fournis par l’application. L’archive originale et les sources extraites n’ont pas été modifiées. Installation et compilation réalisées dans une copie de travail distincte ; scripts d’audit séparés du projet.

### Vérifications réalisées

1. Lecture du code et comparaison avec les exigences des PDF et du CDC Markdown.
2. Installation des dépendances sans scripts d’installation, puis build de production dans une copie : succès, un avertissement de clé `transition` dupliquée à `Furrix.jsx:1113`.
3. Exécution des migrations dans PostgreSQL embarqué PGlite, avec schémas `auth` / `storage` minimaux et rôles `anon` / `authenticated`. Les seuls éléments retirés pour ce test sont l’extension `pg_cron` et ses deux planifications, indisponibles dans ce moteur. Les fichiers source n’ont pas été réécrits. Des grants de tables comparables à un projet Supabase permissif ont été appliqués explicitement au banc de test ; les grants réellement déployés restent à contrôler sur le futur projet Supabase.
4. Exécution des vrais handlers TypeScript transpilés, dans un environnement simulant Deno et Supabase : scénarios d’erreur, rejeu, forme de retour et concurrence. Aucun appel Brevo ni achat réel : les services externes ont été remplacés par des doubles de test.
5. `npm audit` sur la résolution obtenue le 23 octobre : 4 dépendances signalées, dont 1 critique, 2 élevées et 1 modérée ; aucune alerte dans le contrôle `--omit=dev`. Les quatre entrées concernent l’outillage, pas une preuve d’exploitation dans le bundle mobile.
6. Vérification de sources officielles sur les RPC Supabase, webhooks, achats intégrés, suppression de compte et télémédecine vétérinaire.

**Limites :** aucun projet Supabase réel, compte store, appareil physique, environnement Deno complet, prestataire vidéo ou partenaire vétérinaire n’a été fourni. Pas de validation native, d’achat sandbox, de charge, de performance 60 fps, ni d’audit de l’historique Git absent de l’archive. Les reproductions locales démontrent les défauts du code livré ; elles ne décrivent pas un service déjà déployé. Les exigences réglementaires nécessitent une validation professionnelle adaptée au service effectivement proposé.

## 3. Ce qui existe réellement

### Fonctionnel à l’échelle de la démonstration locale

Le design, les six onglets, l’onboarding, les modales, la manipulation DOM des cartes, une formule de score, des filtres espèce/région/objectifs et la persistance locale de certains compteurs existent. Les illustrations, composants de photo et styles sont réutilisables. La compilation produit un fichier JavaScript d’environ 291 ko, 79 ko compressés, avant ajout des vraies intégrations.

La base contient 16 tables dans `0001_init.sql` et 3 supplémentaires dans `0002_rate_limiting.sql`, soit **19 tables métier au total**. La RLS est activée seulement sur les 16 premières. Les contraintes d’unicité des swipes et des matchs, certaines politiques de lecture privée, le trigger de création de profil et les deux buckets constituent des éléments utiles. Cela ne suffit pas à garantir les règles métier.

### Mocké ou partiel

- **Authentification :** absente de l’application principale. `src/lib/supabase.mjs:2` crée un client qui n’est importé par aucun des deux écrans principaux. Le MVP possède un formulaire de connexion, mais `handleAuth` ne fait que créer un utilisateur local (`FurrixMVP.jsx:160`).
- **Profil animal :** formulaire local mono-animal (`Furrix.jsx:229`), sans écriture serveur ni upload réel. Le profil n’est pas inclus dans le store persistant.
- **Swipe :** gestes et présentation présents ; candidats du tableau `AN`. Dans l’application principale, chaque like crée immédiatement un match local (`Furrix.jsx:350`), sans réciprocité. Dans le MVP, la décision de match est aléatoire (`FurrixMVP.jsx:186`).
- **Messagerie :** messages en mémoire, réponse automatique après 1,3 seconde (`Furrix.jsx:387`). Pas d’échange avec une autre personne, de pagination, d’accusé de lecture ni de reprise de connexion.
- **Géographie :** carte SVG statique, coordonnées et distances de démonstration. Le pool principal filtre des régions, sans filtre de distance en kilomètres (`Furrix.jsx:197`). Le MVP filtre un champ `dist` déjà inventé.
- **Paiement :** clic sur une formule ou sur l’essai → `setPrem(true)` (`Furrix.jsx:627,635`). Aucun achat, aucune restauration, aucune synchronisation de droits.
- **Points et récompenses :** changements locaux ; les fonctions serveur existent mais ne constituent pas une chaîne anti-fraude opérationnelle.
- **Vétérinaires et RDV :** annuaire et créneaux de démonstration, confirmation par toast (`Furrix.jsx:762`). Le seed fournit quatre fiches fictives et un événement, aucun animal de test ni vrai agenda.
- **Communauté :** fil de démonstration. La modale de publication existe, mais son bouton ne persiste rien (`Furrix.jsx:843,854`). Les réponses et likes ne correspondent pas à une activité serveur.
- **Événements :** listes et jauges codées en dur, inscription par toast ; création « bientôt disponible » (`Furrix.jsx:1473,1496`).
- **Animaux perdus :** affichage, détails et pins de démo ; appeler/partager ne déclenche que des toasts (`Furrix.jsx:732`). Pas de déclaration ni de diffusion géographique.
- **Assurances, associations, services :** contenus statiques et boutons de simulation, sans contrats, liens d’affiliation opérationnels ni modèles pro.
- **PawAI / vidéo :** aucune IA ni visio. Réponses textuelles préfabriquées ; la vidéo n’ouvre aucune salle (`Furrix.jsx:990,1025`).

### Manquant pour satisfaire le CDC

- Auth complète : confirmation email, renouvellement de session, récupération de mot de passe, retour par deep link, déconnexion et déclaration 18+.
- Plusieurs animaux, animal actif, gestion et quotas serveur 1 / 3 / illimité.
- Écran « Qui m’a liké », super likes réels, boosts avec date d’expiration, filtre de distance et filtres avancés.
- Formules Plus et Max, droits serveur, catalogue de consommables, transactions et consommation, recharges mensuelles et politique de report.
- Groupes communautaires, adhésion, rôles, commentaires, likes, création exclusive Max ; quotas d’événements 1 / 3 / illimité.
- Professionnels self-service, catégories, statut pending, validation, édition/revalidation, annuaire et priorité partenaires.
- Téléconsultation : salle privée, admission, réservation de crédit, expiration, suivi, rémunération, remboursement et cadre professionnel.
- Carnet de santé structuré, pièces privées, rappels et export PDF Max.
- Push et fonction `notify-push`, géolocalisation native, vraie carte, partage et liens universels.
- Signalement de contenus, blocage, suspension, suppression de compte et nettoyage Storage, export des données.
- Infrastructure de tests, CI, lint, observabilité, sauvegarde/restauration vérifiée et configuration native iOS/Android.

## 4. Constats bloquants et correctifs attendus

Priorités : **P0** = à corriger avant toute ouverture d’un backend aux utilisateurs ; **P1** = avant bêta externe ou parcours payant concerné ; **P2** = qualité et maintenabilité avant lancement. « Reproduit » désigne un test local ; « lecture » un constat établi dans le code ; « conditionnel » dépend de la configuration déployée.

### F01 · P0 · Rôle et Premium modifiables par l’utilisateur — reproduit

`0001_init.sql:5,204` : la policy autorise la mise à jour de sa ligne entière. Aucun privilège de colonne ni trigger n’interdit `role='admin'` ou `premium=true`. Le test avec un rôle authentifié retourne ces deux valeurs. Le rôle frauduleux ouvre les politiques de lecture des signalements et de suppression des posts ; il ne donne pas magiquement accès à toutes les tables ou à la clé service.

**Correctif :** séparer les attributs publics éditables des droits serveur, ou révoquer les écritures de colonnes sensibles et contrôler les mutations ; ajouter des tests négatifs sur rôle, Premium et toute future colonne financière. La présence de `subscriptions` privée ne protège pas le booléen `profiles.premium`.

### F02 · P0 · RPC de swipe usurpable, même sans compte — reproduit

`0001_init.sql:68` : `SECURITY DEFINER`, aucun contrôle `auth.uid()`, aucune vérification du propriétaire ni restriction explicite d’exécution. Le test `anon` forge deux swipes pour deux animaux appartenant à d’autres comptes et crée un match. La RLS des tables n’arrête pas une fonction exécutée avec les droits de son propriétaire.

**Correctif :** révoquer les accès inutiles, authentifier, vérifier la propriété, interdire auto-swipe et swipe entre ses propres animaux, intégrer quota et blocage dans la même transaction et fixer le `search_path`. Restreindre à `authenticated` ne remplace pas le contrôle de propriété.

### F03 · P0 · Trois tables internes sans RLS — reproduit / exposition conditionnelle

`0002_rate_limiting.sql:4,15,31` : `rate_limit_events`, `blocked_entities`, `revenuecat_events` n’ont aucune activation RLS. Le catalogue PostgreSQL le confirme. Si elles héritent des grants API habituels, un client peut accéder aux données techniques, altérer les blocages ou les marqueurs d’idempotence.

**Correctif :** schéma privé non exposé ou révocation explicite des droits client, RLS en défense supplémentaire ; contrôler les grants effectifs sur l’instance cible. Les données IP, empreintes et identifiants techniques ne doivent pas être publiques.

### F04 · P0 · Points : erreur SQL et RPC privilégiée trop ouverte — reproduit

`0002_rate_limiting.sql:34–50` : `RETURNS TABLE(paws,xp,level)` définit des variables qui entrent en conflit avec `set paws = paws + p_delta`. PostgreSQL renvoie `column reference "paws" is ambiguous`. L’appel serveur échoue avec la configuration standard. La fonction `SECURITY DEFINER` accepte aussi un utilisateur et un delta arbitraires ; le test confirme un droit EXECUTE pour `anon`.

**Correctif :** qualifier les colonnes ; réserver la RPC au service autorisé ; contrôler bornes et nature des opérations. Ne pas corriger seulement l’ambiguïté : cela rendrait exploitable l’écriture arbitraire actuellement masquée par l’erreur SQL.

### F05 · P1 · Attribution de points sans preuve, sans idempotence, retour erroné — reproduit

`award-points/index.ts:23–34` : un utilisateur choisit une action dans le barème, sans prouver une connexion quotidienne, un profil terminé, un parrainage ou un match. Les appels sont répétables. La transaction d’historique précède une RPC séparée et peut subsister malgré son échec. Enfin, une RPC `RETURNS TABLE` renvoie un tableau, mais le handler lit `data.paws` ; avec un retour simulé conforme, la réponse JSON vaut `{}`.

**Correctif :** déclencher depuis un événement métier vérifié, clé unique par événement/jour, crédit et journal dans une transaction, contrat de réponse testé. Ne jamais importer les soldes localStorage comme argent serveur fiable. Définir XP, niveaux, multiplicateur Max/Plus et streak : les formules client et serveur divergent.

### F06 · P1 · Échange de récompense non atomique et sans réalisation métier — reproduit

`redeem-reward/index.ts:27–38` : lecture de 500 points puis deux appels simultanés à 250 → deux codes émis et deux écritures à 250, solde final 250 au lieu de 0. Les erreurs des écritures sont ignorées. Le code promotionnel n’est enregistré nulle part ; aucun partenaire ne peut vérifier sa validité ou sa consommation. Le boost ne crée aucune activation.

**Correctif :** débit conditionnel atomique, journal et émission durable dans une transaction, identifiant de requête rejouable, catalogue et stock si nécessaire, validation partenaire et expiration. Limiter explicitement le boost découverte offert en points ; actuellement il est rachetable sans limite.

### F07 · P0 · Rate-limit contournable et dissocié des actions — reproduit / lecture

`rate-limit/index.ts:18–41` : `userId` vient du corps au lieu du JWT. Sans cette clé, la règle swipe n’est même pas vérifiée. La fonction peut retourner `allowed:true` malgré l’échec d’insertion d’une IP invalide. `x-forwarded-for` peut être une liste incompatible avec `inet`. Compter puis insérer n’est pas atomique ; l’action reste accessible directement par table/RPC. Aucune lecture du statut Premium ; le bucket applique 5/j même au payant si le client l’appelle.

**Correctif :** identité issue de l’auth, IP normalisée depuis une source de confiance, règles serveur dans l’opération protégée, compteur atomique et gestion explicite des erreurs. Signup nécessite un mécanisme adapté avant authentification ; un appel facultatif du client ne sécurise pas Supabase Auth. Captcha et contrôles Auth doivent être configurés séparément.

### F08 · P0 · Webhook : achat perdu après erreur et rejeu — reproduit

`revenuecat-webhook/index.ts:17–42` : l’événement est marqué traité avant l’écriture de l’abonnement. Toute erreur d’insert est interprétée comme un doublon ; les erreurs d’upsert/update sont ignorées. Simulation : écriture d’abonnement échouée → HTTP 200 ; rejeu → « déjà traité », sans réparation.

**Correctif :** traitement durable avec état reçu/traité/erreur, transaction pour événement et droits, retry des échecs et réconciliation avec RevenueCat. Ne répondre au succès que lorsque le changement est durable ou mis en file fiable.

### F09 · P1 · Webhook et droits incomplets — lecture

Le handler ne gère ni Plus/Max ni consommables, transactions, changements de produit ou transferts de droits. Il ne valide pas l’environnement sandbox/production, le catalogue ni les entitlements attendus. Tous les stores autres que `APP_STORE` sont assimilés à Google. `app_user_id` est supposé être un UUID de profil sans contrat d’identité établi. `TRIAL_CONVERTED` n’est pas le mécanisme documenté actuel : la conversion apparaît sur `RENEWAL` avec `is_trial_conversion`.

`profiles.premium` n’est jamais synchronisé par ce webhook. Annulation simple, remboursement et grâce de facturation doivent avoir des traitements distincts ; ignorer une annulation de renouvellement peut être correct jusqu’à expiration, ignorer un remboursement ne l’est pas nécessairement. Les événements hors ordre peuvent écraser un état récent.

**Correctif :** catalogue versionné, identité Supabase ↔ RevenueCat, un service de droits serveur unique, événements et réconciliation testés, périodes et ordre contrôlés. Garder une période de grâce conforme au store plutôt que retirer arbitrairement les droits à `BILLING_ISSUE`.

### F10 · P1 · Configuration de déploiement absente et CORS natif incohérent — lecture

Aucun `supabase/config.toml` livré. Le webhook à secret partagé risque un refus par la vérification JWT avant d’atteindre son code. Le signup sans session pose le problème inverse. Le helper autorise seulement `APP_URL` ou `*`, pas explicitement les origines des WebViews Capacitor ; il ne déclare pas les méthodes autorisées. Les instructions de déploiement ne suffisent pas à garantir une configuration opérationnelle.

**Correctif :** configuration par fonction, webhook sans JWT Supabase mais avec authentification fournisseur vérifiée ; fonctions utilisateur avec identité vérifiée ; fonctions internes réservées aux services. Tester les origines réelles iOS/Android et préflights. CORS ne remplace aucune autorisation.

### F11 · P1 · Envoi d’emails abusif — reproduit au niveau handler

`send-email/index.ts:17–30` : aucun contrôle d’identité ou d’événement métier, destinataire arbitraire, variables interpolées sans échappement HTML. Le handler accepte un appel sans autorisation dans le banc de test. Une passerelle correctement configurée peut bloquer l’anonyme ; cela ne limite toujours pas l’envoi d’un utilisateur authentifié ni d’une clé acceptée par la passerelle.

**Correctif :** appel interne authentifié lié à un événement durable ; destinataire dérivé du compte/RDV autorisé ; échappement, quotas, déduplication et journal d’envoi, SPF/DKIM/DMARC. Deux templates existent, pas le parrainage annoncé dans la doc.

### F12 · P1 · Faux matchs et courses concurrentes — reproduit / lecture

`swipe_and_match` ignore un swipe déjà enregistré mais teste la nouvelle direction passée en argument. Reproduction : C passe D, D like C, C réessaie « right » ; le match est créé alors que le swipe de C reste `left`. Rejouer une paire déjà matchée peut retourner `null` alors que le match existe. Deux likes réciproques simultanés dans des transactions séparées peuvent chacun manquer le swipe non validé de l’autre : risque établi par lecture, pas reproduit en parallèle réel ici.

**Correctif :** définir pass/re-surfacing/changement de décision ; utiliser la direction réellement persistée, sérialiser par paire, retourner le match existant et rendre les retries sûrs. La contrainte unique évite les doublons, pas les matchs manqués.

### F13 · P1 · Données publiques trop larges et vérification falsifiable — reproduit / lecture

`0001_init.sql:203,207,241,256` rend profils, animaux, alertes et participants publics au niveau RLS. Les animaux exposent notamment propriétaire, coordonnées exactes et données détaillées. Un propriétaire peut s’auto-attribuer `pets.verified=true`, reproduit en test. Ajouter une RLS ne cache pas certaines colonnes d’une ligne lisible.

**Correctif :** projections publiques minimales, géolocalisation approximative ou calcul de distance côté serveur, données privées séparées, vérification éditable uniquement par service autorisé. Pour « qui m’a liké », fournir une projection gated ; les règles actuelles ne donnent pas la liste entrante et ne doivent pas être ouvertes sans contrôle du tier.

### F14 · P1 · Storage créé sans règles opérationnelles — lecture

`0001_init.sql:280` crée les buckets, aucune policy `storage.objects`, aucun plafond de taille/MIME livré. Le bucket documents est privé mais aucun parcours sécurisé de dépôt/lecture n’est implémenté. Les photos publiques restent accessibles par URL indépendamment d’un futur blocage de compte.

**Correctif :** dossiers propriétaire, règles d’accès et suppression, limites de taille/type, URL signées pour documents, nettoyage des objets et test de téléchargement inter-comptes. Définir la politique des photos lors du blocage ou de la suppression.

### F15 · P1 · Suppression de compte impossible dans certains cas — reproduit

`reports.reporter_id` (`0001_init.sql:179`) et `lost_pets.reporter_id` (`:120`) référencent profiles sans cascade ni anonymisation. Le test d’un compte ayant signalé un contenu échoue sur la clé étrangère lors de la suppression Auth. La doc « cascade partout » est fausse. Les objets Storage ne sont de toute façon pas supprimés par ces cascades.

**Correctif :** procédure serveur réauthentifiée, stratégie de conservation/anonymisation, suppression Storage, tokens, identité fournisseur et éventuels justificatifs. Informer séparément sur l’annulation d’un abonnement store ; supprimer le compte ne garantit pas l’arrêt de facturation.

### F16 · P1 · Rendez-vous et événements non fiables — lecture

Appointments : l’utilisateur peut choisir `status='done'`, un `pet_id` d’un tiers ou un créneau sans contrôle de disponibilité ; pas d’unicité empêchant une double réservation. Events : pas d’organisateur, de policy de création, de suppression d’inscription, de contrôle de capacité ni de quotas mensuels. Posts : pas de policy de modification, commentaires ou likes. Messages : pas de policy de mise à jour du statut `read`.

**Correctif :** opérations métier autorisées, disponibilités structurées, réservation atomique, transitions de statut, droits pro ; capacité et quota d’événement atomiques, désinscription, modèle communautaire et modération. Un CRUD générique ne couvre pas ces invariants.

### F17 · P1 · Blocage, signalement et modération absents — lecture

La table reports ne traite pas les événements ni les fiches pro dans `target_type`. Aucun blocage n’est stocké ni appliqué à la découverte, aux messages ou aux communautés. Un signalement d’animal perdu par toast n’est pas un signalement de contenu abusif. Aucun outil d’action/suspension ni responsable opérationnel n’est défini.

**Correctif :** système transversal de signalement, blocage bilatéral selon politique choisie, contrôles d’écriture et de lecture serveur, file de traitement et journal d’action ; tests couvrant aussi Realtime et les liens directs.

### F18 · P1 · Conseils de santé simulés présentés comme expertise — lecture

`Furrix.jsx:990–1010` présente PawAI comme « Expert animalier » et génère une recommandation d’attendre 48 h quelle que soit la question. Cela ne repose sur aucune analyse, aucun modèle ni triage. Le risque est de faire passer une démonstration pour un service réel de santé.

**Correctif :** retirer cet usage public ou le remplacer, après décision produit, par une aide clairement limitée et validée ; ne pas promouvoir le prototype tel quel auprès du public comme un outil de conseil réel. Les rendez-vous, dons et contacts simulés doivent eux aussi être identifiés comme démonstration.

### F19 · P1 · Géographie, score et adaptation des données à reprendre — lecture

Un index GiST sur `point(lng,lat)` ne crée ni une API de proximité ni une distance en kilomètres. `computeScore` lit des champs abrégés `sp/ag/pu/v`, alors que SQL produit `species/age/purpose/verified`. Les autres modules ont également des noms et types différents. Remplacer simplement `AN` par `select('*')` casse donc les contrats de données.

Le score est comprimé artificiellement entre 62 et 99, utilise la taille moyenne d’espèce et `parseFloat` pour l’âge : « 6 mois » devient 6, comme « 6 ans ». Le jitter aléatoire de `buildPool`, recalculé à chaque `cardKey`, peut réordonner la liste pendant que l’index avance et provoquer répétitions ou omissions. Le code compare parfois `co` de démo et parfois `score` recalculé.

**Correctif :** contrat de données normalisé et adaptateurs explicites, âge normalisé/date de naissance, génération stable du pool par session, pagination et déduplication par identifiant ; requête géographique serveur en unités explicites. Ajouter `jeu` après retrait de reproduction/show exige aussi d’ajuster la matrice de score.

### F20 · P2 · Moteur de gestes à conserver mais à tester — lecture

La manipulation DOM évite des rendus pendant le drag, mais ne garantit pas 60 fps. `curXr` n’est pas remis à zéro au début de chaque geste et peut conserver un ancien déplacement après un fly-out ; absence de `touchcancel`. Le pool réordonné et les mises à jour imbriquées dans l’updater d’index méritent un test avec StrictMode. Plusieurs timers n’ont pas de nettoyage explicite.

**Correctif :** isoler les gestes de la logique métier sans refonte visuelle, stabiliser le pool, tester geste interrompu, clic après swipe, filtres, refus serveur et faible réseau sur appareils réels. Une correction ciblée de bug reste nécessaire malgré la consigne documentaire « ne jamais toucher ».

### F21 · P1 · Realtime, réseau et observabilité absents — lecture

Pas de subscription client, de publication `messages` dans les migrations, de reprise après background ou de gestion d’erreur réseau. Pas d’Error Boundary, Sentry, événements d’activation ou métriques de conversation. Une connexion websocket seule ne garantit pas la récupération des messages manqués.

**Correctif :** activer la publication ou Broadcast avec droits, pagination, rattrapage à la reconnexion, identifiants de messages pour déduplication ; prévoir états chargement/vide/refus/retry et logs sans contenu privé ni secret. Mesurer conversation réelle après match, sans compter les réponses automatiques.

### F22 · P2 · Dépendances et chaîne de livraison non reproductibles — vérifié

Pas de lockfile, tests, lint, CI, configuration Deno ou projets natifs. La résolution de test obtient React 18.3.1, Vite 5.4.21, Capacitor core/CLI 6.2.2, RevenueCat Capacitor 9.2.2 et Supabase JS 2.118.0 : les versions `^` ne figent pas celles testées par l’auteur. Les imports Edge Functions utilisent `@2` via esm.sh, sans verrouillage.

L’audit npm signale `tar` critique, `@capacitor/cli` et Vite élevés, esbuild modéré. Cela concerne l’outillage de build/dev et doit être corrigé avant industrialisation ; le scan des dépendances de production ne remonte pas d’alerte connue. Ne pas lancer une mise à jour majeure automatique sans tester la chaîne native. Les sourcemaps sont activées ; leur publication doit être intentionnelle, pas traitée comme une protection de secret.

**Correctif :** choisir un ensemble de versions compatibles, lockfile, Node documenté, CI et build natif sandbox. Configurer les plugins caméra, géoloc, push, app/deep links et stockage de session ; les plateformes iOS/Android et assets n’existent pas encore.

### F23 · P1 · Juridique et pages publiques en décalage — lecture et vérification officielle

La page HTML légale contient seulement des emplacements « Coller ici ». Les CGV décrivent une seule formule Premium, sans Max ni consommables ni politique de téléconsultation. SIREN, adresse, contacts et hébergements restent à compléter. Le fournisseur vidéo et la cartographie doivent rejoindre l’inventaire des traitements effectifs. Aucune preuve d’acceptation versionnée ni gestion de consentement n’est codée.

La suppression doit aussi être accessible via une ressource web pour Google Play : une simple page de confidentialité vide ne suffit pas. Les déclarations de conformité, d’âge store et de sécurité ne doivent pas être copiées comme des faits déjà acquis.

**Correctif :** aligner contrats, parcours, politique de conservation, prestataires et déclarations store sur l’implémentation finale ; validation juridique. Cet audit ne valide pas les clauses de responsabilité, rétractation ou remboursement.

### F24 · P1 · Téléconsultation : dépendance réglementaire et économie non résolues

L’Ordre des vétérinaires affiche toujours une information selon laquelle l’expérimentation a pris fin en novembre 2021 et précise l’incertitude du cadre applicable. Sa page est datée de 2023 ; elle ne permet pas à elle seule de conclure définitivement sur le droit au 23 octobre 2026. La FAQ distingue strictement téléconseil général et acte personnalisé. **Obtenir une validation écrite du service envisagé, de la RCP et du cadre professionnel avant de contractualiser ou d’annoncer la prestation.**

L’affirmation « 100 % IAP obligatoire pour tout » est trop générale : Apple prévoit une exception pour certains services individuels en temps réel ; Google aussi sous conditions, notamment sans replay. Cela ne change pas le choix IAP des fonctionnalités numériques de Furrix et n’autorise pas ici l’ajout d’un autre paiement sans arbitrage.

Une commission Furrix de 15 % ne garantit pas une marge si Furrix supporte en plus la commission store, la rémunération pro, la vidéo et les remboursements. Sur une base simplifiée de 100 hors taxes/frais complémentaires, reverser 85 au pro et payer 15 au store ne laisse déjà rien ; avec 30 de store, la marge est négative. Faire préciser assiette, porteur du paiement, reversements et prix avant l’architecture.

## 5. Incohérences documentaires à résoudre

1. **Référence récente contre anciens plans :** les PDF annoncent 43–45 jours-homme / 10–12 semaines et tout au lancement ; le guide affiche 41–43 jours puis J15, le scoping MVP enlève monétisation et services, le README recommande ce MVP. Retenir le CDC récent comme intention produit, puis acter l’arbitrage de délai.
2. **Professionnels :** le CDC décide self-service avec validation, mais sa section B2B recommande encore la saisie administrée. La décision récente prévaut ; une réduction doit être explicitement approuvée.
3. **Sécurité :** 19 tables ne signifie pas 19 RLS ; « points serveur anti-triche », « RPC atomique » et « idempotence webhook » décrivent des intentions, pas des garanties démontrées.
4. **Création de post :** le CDC dit parfois écran absent ; une modale existe, sa publication est simulée. L’effort porte sur validation, persistance, droits et diffusion, pas nécessairement une nouvelle maquette.
5. **Super like :** une UI existe à `Furrix.jsx:1194` ; aucune consommation serveur. À relier au catalogue, pas à recréer intégralement.
6. **Plusieurs animaux :** relation SQL 1→N déjà correcte ; la conformité au quota n’est pas « front uniquement ». Il faut une autorisation serveur et une politique de rétrogradation sans perte de données.
7. **Récompenses :** interdiction de débloquer Premium, mais boost en points réachetable sans limite ; acquisition promet un mois de Plus par parrainage. Définir une promotion dédiée, indépendante des points, et son mécanisme de droits.
8. **Téléconsultation :** le CDC la vend à l’acte, le paywall l’inclut visuellement parmi les avantages Premium et la modale la bloque aux gratuits. UI et droits doivent être cohérents.
9. **Reproduction/show :** toujours présents dans code et contraintes. Le CDC conserve parfois le champ pour compatibilité et propose ailleurs de supprimer les valeurs. Prévoir migration des valeurs et cohérence du nouveau `jeu`.
10. **Routes et données suggérées :** les jointures `pet_a(*)` / `pet_b(*)` du guide nécessitent des alias/relation PostgREST corrects ; `ph`, `dt`, `ow` et autres champs ne sont pas ceux de SQL. Les recettes de câblage ne sont pas des contrats exécutables.
11. **Seed :** seulement quatre vétérinaires et un événement fictifs, sans animaux ni comptes. Ils ne constituent ni un annuaire partenaire vérifié ni une population de bêta.
12. **Modèle économique :** les revenus présentés comme « nets » sont surtout prix moins commission store. TVA, charges, vidéo, support, prestataires, remboursements et coût humain ne sont pas intégralement chiffrés. Avec 75 % Plus, 25 % Max et 40 % annuels, le calcul simple à 15 % donne environ 9,34 €/abonné/mois et à 30 % environ 7,69 €, pas un net universel de 7,50 €. Ces projections restent des hypothèses d’acquisition, pas une validation de marché.
13. **Web public :** pas de boutique web souhaitée, mais partage, pages locales SEO, suppression de compte et documents publics nécessitent tout de même une petite surface web et des liens profonds.
14. **Documentation technique héritée :** mentions de Stripe/create-checkout, PWA, binôme Alexis/Guillaume, helpers `_shared/auth.ts` / `limits.ts`, validation zod et fonction `notify-push` qui ne correspondent pas aux fichiers livrés. Élaguer les instructions obsolètes avant de les donner à Claude Code.

## 6. Architecture recommandée et dépendances

Conserver Vite/React pour les interfaces, Capacitor pour le natif et Supabase pour Auth, SQL, Storage et temps réel. Éviter une réécriture globale. Extraire progressivement les vues et hooks en gardant le rendu du prototype ; séparer clairement objets serveur, modèles de présentation et données de démonstration.

**Côté serveur :** toute action qui crée un droit, consomme un quota ou déplace un solde passe par une opération transactionnelle autorisée. Les Edge Functions orchestrent les prestataires et déclenchent les RPC ; elles ne remplacent pas les transactions SQL avec plusieurs requêtes indépendantes. Centraliser les droits Free/Plus/Max et les périodes, avec un catalogue et une horloge serveur. Séparer rôle d’administration, activité professionnelle et abonnement.

**Paiements :** recevoir durablement les événements, normaliser l’identité, appliquer droits/solde dans une transaction, émettre les actions secondaires par une file/outbox, réconcilier périodiquement. Les emails et push ne doivent pas annuler un achat confirmé ni être perdus après son commit. Une recharge mensuelle et un boost nécessitent une date métier, un événement unique et une expiration côté serveur.

**Modèle à compléter :** species ; professionnels et catégories ; communautés/membres/commentaires/likes ; blocages et modération ; carnet de santé ; achats/consommables/usages ; réservations et disponibilités ; sessions vidéo ; notifications/outbox ; acceptations/consentements. Les exemples SQL du CDC sont des pistes sans RLS ni invariants complets, pas des migrations prêtes à copier.

**Dépendances externes à réunir :** comptes Apple/Google au nom du bon éditeur, accès délégués, environnement iOS (Mac ou CI appropriée), appareils de test, projet Supabase UE staging/prod, RevenueCat et produits/entitlements par plateforme, domaine et email vérifié, Brevo, APNs/FCM, cartographie/géocodage, éventuel prestataire vidéo, observabilité. Ne pas transmettre des secrets dans des prompts ; utiliser les coffres et variables d’environnement appropriés.

**Dépendances opérationnelles :** contrats et validation des professionnels, vérification des fiches, responsable de modération et support, conditions de réservation/annulation, traitement des demandes d’effacement, données de lancement réelles et autorisées. Un annuaire national importé et son cache doivent respecter les conditions du fournisseur ; la recommandation du guide de cacher Google Places 30 jours ne doit pas être copiée sans vérification de licence.

## 7. Plan priorisé avec Claude Code

### Cadre de travail

Guillaume conserve la décision d’architecture, l’approbation des changements, la revue des droits et la validation des appareils/paiements. Claude Code peut produire des changements par petits lots avec tests reproductibles et compte rendu de diff. L’IA ne remplace ni l’accès aux services, ni les validations professionnelles, ni la recette humaine.

**Aucune des corrections ci-dessous n’a été appliquée aux sources.** Après accord, travailler dans une branche dédiée et dans des environnements de test ; ne pas déployer les migrations livrées sur des données réelles pour « voir si ça passe ».

### Lot 0 · Arbitrage et base reproductible · 2–3 jours

Figer le document de référence et les droits Free/Plus/Max ; distinguer exigences fermes et valeurs par défaut. Choisir versions compatibles et lockfile, staging, jeu de comptes et données de test, CI minimale, journal des décisions. Claude prépare inventaire et spécifications exécutables ; Guillaume valide le contrat de droits.

**Sortie :** build reproductible, commandes documentées, matrice de droits approuvée, noms des propriétaires de comptes et décisions bloquantes listés.

### Lot 1 · Sécurité SQL et règles métier · 4–6 jours

Corriger F01–F04, F07, F12–F15 ; isoler les tables internes, politiques Storage, RPC strictes et quotas transactionnels. Tester anonyme, propriétaire, autre utilisateur, pro pending/active, modérateur, service. Faire les contrôles de RPC et de colonnes, pas seulement les lectures de tables.

**Sortie :** anonyme ne forge rien ; A ne modifie pas les droits/solde/vérification de A ou B ; B ne lit ni chat, documents, points ni abonnement privés de A ; deux likes simultanés créent exactement un match ; 6e swipe gratuit refusé côté serveur ; suppression avec signalement et fichiers aboutit selon la politique retenue.

### Lot 2 · Parcours réel et plusieurs animaux · 6–9 jours

Auth, email/deep links, sessions, onboarding/photo, contrats de données, animal actif et quotas, pool géographique stable, liste de matchs, chat avec reconnexion et pagination. Extraire les composants au rythme du branchement sans refonte visuelle.

**Sortie :** deux vrais comptes sur deux sessions réalisent inscription → profil → likes réciproques → un match → échange ; aucun message automatique ; aucun accès à un troisième compte ; changement d’animal sans mélange de conversations ; pas de création de quatrième animal Plus par requête directe.

### Lot 3 · Abonnements et consommables · 5–8 jours

Reprendre webhook et identité, droits Plus/Max, achat et restauration, catalogue, journal d’achat, boosts/super likes/mises en avant, périodes mensuelles, grâce, rétrogradation et réconciliation. Décision téléconsultation séparée avant de fixer son SKU.

**Sortie :** achats sandbox iOS et Android, rejeu sans double crédit, échec DB récupéré, événement hors ordre, expiration, remboursement et transfert testés ; achat annulé n’active rien ; solde impossible à modifier directement ; double consommation concurrente sûre.

### Lot 4 · Points et récompenses · 2–4 jours

F05–F06, règles unifiées, événements prouvés, débit atomique, réalisation de récompenses et contrat partenaire.

**Sortie :** une même action ne paie qu’une fois ; faux parrainage refusé ; échange concurrent débité correctement ; code vérifiable et unique ; aucun import de faux solde local.

### Lot 5 · Professionnels, annuaire et rendez-vous · 6–9 jours

Inscription self-service, vérification, statut pending invisible, édition/revalidation, migration vets → professionals, tri partenaire explicite, calendrier et réservation fiables. Prévoir l’outil de validation approuvé.

**Sortie :** un pro pending ne se publie pas lui-même ; publication uniquement par rôle autorisé ; priorité partenaire reproductible ; deux réservations du même créneau n’aboutissent pas toutes les deux ; email de confirmation dédupliqué.

### Lot 6 · Communautés, événements et sécurité utilisateur · 5–8 jours

Groupes/membres, fil, publication/commentaires, quotas, création Max, capacité, désinscription, signalement, blocage, administration et compte supprimable. Le blocage doit être engagé dès le lot 1 puis appliqué à tous les nouveaux modules.

**Sortie :** non-Max ne crée pas un groupe par appel direct ; quota événement respecté en concurrence ; blocage effectif dans découverte, chat et groupes ; signalement traité et action tracée.

### Lot 7 · Santé, perdus, carte et push · 5–8 jours

Carnet et documents privés, export/rappels Max, déclaration/perdu/retrouvé, rayon de notification, carte réelle, autorisations, deep links et partage.

**Sortie :** documents d’un tiers inaccessibles même par URL privée ; rappel sans double envoi ; refus géoloc avec fallback ville ; alerte reçue seulement par les destinataires autorisés ; lien partagé ouvre le bon contenu.

### Lot 8 · Téléconsultation · 4–7 jours après décisions externes

Commencer par un prototype technique limité après validation du service, du modèle économique et des partenaires. Salle privée, jetons individuels, réservation de crédit, démarrage idempotent, coupure, fin d’appel fiable, absence du pro, remboursement et support.

**Sortie :** tiers non invité refusé, crédit réservé une fois, durée contrôlée par serveur, webhook rejoué sans double débit, interruption et absence traitées ; règlement financier et cadre professionnel approuvés.

### Lot 9 · Natif, recette et lancement · 5–8 jours

Projets natifs, permissions, safe areas, retour arrière, clavier, achat/restore, caméra, push en arrière-plan, appareil réel, accessibilité, monitoring, restauration de sauvegarde, documents et ressources publiques, dossiers store et compte reviewer.

**Sortie :** parcours critiques validés sur iPhone et Android physiques, zéro P0 ouvert, aucun P1 du périmètre ouvert sans arbitrage documenté, modération/support prêts, documents cohérents et absence de simulation trompeuse.

### Charge et calendrier

Ces lots représentent **44 à 70 jours de travail technique**, selon les choix d’outils, l’expérience et la réutilisation effective. Ajouter **20 à 30 %** pour intégration, régressions et imprévus : environ **53 à 91 jours**, soit **11 à 19 semaines à cinq jours disponibles par semaine**, hors attente de comptes, validation réglementaire, partenaires et review stores. Ce sont des ordres de grandeur d’audit, pas un devis ni une promesse. Une disponibilité inférieure rallonge le calendrier.

Le chiffrage documentaire 43–45 jours rejoint seulement le bas de la fourchette technique et ne démontre pas que les corrections de sécurité, la recette native et les dépendances sont provisionnées. **Rechiffrer après les lots 0 et 1**, à partir des inconnues levées. Claude Code peut réduire le temps de rédaction et de tests ; aucun facteur de vitesse garanti ne justifie une promesse J15.

Si un délai court est impératif, proposer une décision explicite de réduction : noyau compte/profil/match/chat et protections, bêta privée locale, puis validation du modèle payant et des modules. Ce serait une modification de l’exigence « tout au lancement », pas une interprétation silencieuse du CDC.

## 8. Briefs prêts à confier à Claude Code

### Brief initial — lecture seule, autorisé par la demande d’audit

> Audite l’archive Furrix sans modifier les sources, installer dans le dépôt ni déployer. Lis le CDC technique récent en premier ; les anciens guides ne prévalent pas sur ses décisions. Vérifie les constats F01 à F24 du rapport, avec références fichier/ligne et scénarios reproductibles. Inspecte grants/RLS, RPC SECURITY DEFINER, transaction des soldes, quotas, webhook et contrats de données. Toute preuve doit être produite dans un dossier d’audit séparé avec données fictives. Distingue observation, reproduction locale, dépendance de configuration et vérification impossible. Fournis le diff proposé et les critères de recette du lot 1, sans appliquer les corrections.

### Brief de réalisation du lot 1 — à utiliser seulement après accord

> Implémente uniquement le lot de sécurisation approuvé dans une branche dédiée, en conservant le design et le moteur de gestes sauf correction ciblée justifiée. Commence par des tests qui reproduisent les failles. Écris des migrations correctives versionnées ; pas de reset ni de déploiement prod. Ferme les écritures client sur droits, rôles et vérification ; isole les tables internes ; protège les RPC ; rends quota et swipe transactionnels ; ajoute les policies Storage et la stratégie de suppression approuvées. Vérifie les invariants avec anon, A, B et service, y compris concurrence et rejeu. Livre un diff court, les résultats de tests, les limites et les décisions restantes. N’ajoute pas de fonctionnalité hors lot ni de nouvelle dépendance non justifiée.

Pour chaque lot suivant : reprendre son objectif, ses dépendances et ses critères de sortie, demander une petite PR et une preuve de recette. Une revue distincte des autorisations et transactions est recommandée avant fusion. Ne pas donner simultanément à deux agents le même fichier monolithique sans découpage clair des responsabilités.

## 9. Questions pour Yannis lundi 26 octobre

### Décisions qui conditionnent le lancement

1. **Périmètre contre délai :** confirmait-on une intention « tout au lancement » ou un engagement de date ? Quel est le délai ferme, le budget et la disponibilité de Guillaume ? Accepte-t-on le délai réévalué, une ressource supplémentaire ou une bêta réduite explicitement ?
2. **Téléconsultation :** a-t-on des vétérinaires signés, leur avis écrit sur le cadre d’exercice et la couverture RCP ? Vend-on téléconseil général ou acte personnalisé ? Qui porte le contrat et la responsabilité du service ?
3. **Paiement du service :** qui fixe le prix, encaisse, reverse au professionnel et rembourse ? Les 15 % sont-ils calculés avant/après commission store et taxes ? Quel canal est approuvé pour ce service individuel, distinct des abonnements numériques ?
4. **Pro self-service :** confirme-t-on cette décision malgré les passages « administrés » ? Quelles pièces vérifie-t-on, qui valide, dans quel délai, et quelles modifications repassent en pending ? Dashboard sécurisé ou interface dédiée ?
5. **Droits exacts :** rayon gratuit et Max, quota par compte ou animal, limite de 5 swipes sur 24 h glissantes ou jour civil (quel fuseau), comportement après downgrade avec trop d’animaux ?
6. **Quotas mensuels :** anniversaire d’abonnement ou mois civil pour les boosts, super likes et événements ? Les crédits inutilisés expirent-ils, se reportent-ils, survivent-ils à une résiliation ?

### Confiance, fonctionnement et opérations

7. Qui traite les signalements et demandes de suppression, avec quelle capacité et quels accès ? Quel est le comportement exact d’un blocage dans chat, groupes, événements et photos ?
8. Quels véritables partenaires fourniront les récompenses ? Le boost en points est-il limité à un essai ? Un mois de Plus en parrainage est-il confirmé et comment éviter les faux comptes ?
9. Dispose-t-on de disponibilités réelles de professionnels, ou veut-on au départ une demande de RDV à confirmer ? Quelles règles d’annulation, d’absence et d’urgence ?
10. Quelle précision de localisation rend-on publique ? Quelles données du carnet sont accessibles au pro, avec quelle autorisation et quelle durée ?
11. Retire-t-on PawAI, dons et autres faux services de la version publique tant qu’ils ne sont pas réels ? Confirme-t-on le retrait de marketplace, reproduction/show et l’objectif `jeu` ?
12. Quelle hiérarchie en cas de conflit entre visibilité achetée, priorité partenaires, distance et pertinence ? Que signifie concrètement « 1re position » si plusieurs boosts sont actifs ?

### Accès et préparation de la bêta

13. Qui possède les comptes Apple, Google, domaine, RevenueCat et hébergement ? Qui dispose d’un Mac/CI iOS et des appareils ? Quelles démarches sont déjà terminées ?
14. SIREN/adresse/contact et prestataires sont-ils fixés ? Qui fait relire CGU/CGV et contrats partenaires, y compris Max, consommables, suppression et service vidéo ?
15. Quels 30–50 testeurs et partenaires réels de Lille sont disponibles ? Qui fournit photos autorisées, fiches vérifiées, événements et communautés fondateurs ?
16. Pour dire « bêta réussie », fixe-t-on activation, conversations par match, retours de confiance et rétention, sur quelle période et avec quel échantillon ? Les objectifs d’acquisition restent-ils des hypothèses ou des engagements ?

**Résultat attendu de la réunion :** une décision écrite sur périmètre/date, une grille de droits, un responsable par dépendance et l’accord éventuel sur le lot 0/1. Aucun changement de source n’est requis pour prendre ces décisions.

## 10. Références officielles et dossier de preuves

Sources consultées le 23 octobre 2026. Les chemins et lignes de code cités plus haut correspondent à l’extraction intacte de l’archive livrée.

- [Supabase — sécurisation et privilèges des fonctions](https://supabase.com/docs/guides/database/functions) : exécution et responsabilité des fonctions SECURITY DEFINER.
- [Supabase — authentification des Edge Functions](https://supabase.com/docs/guides/functions/auth) : configuration JWT et webhooks externes.
- [Supabase — activation Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) : publication des tables et accès.
- [RevenueCat — événements et champs](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) : achats non renouvelables, transferts, changement de produit, grâce et conversion d’essai.
- [Apple — App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) : intégrité du produit, contenus utilisateurs, comptes et services individuels, notamment §3.1.3(d).
- [Google — règles de paiement](https://support.google.com/googleplay/android-developer/answer/10281818) : exception conditionnelle pour services individuels en ligne.
- [Google — suppression de compte](https://support.google.com/googleplay/android-developer/answer/13327111) : chemin dans l’app et ressource web.
- [Ordre des vétérinaires — télémédecine](https://www.veterinaire.fr/je-suis-veterinaire/mon-exercice-professionnel/telemedecine-veterinaire) et [FAQ](https://www.veterinaire.fr/je-suis-veterinaire/mon-exercice-professionnel/les-fiches-professionnelles/telemedecine-veterinaire-faq) : information sur l’expérimentation et distinction téléconseil/acte vétérinaire ; ancienneté de ces pages prise en compte.
- [Légifrance — décret d’expérimentation de 2020](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000041849984/) : durée expérimentale explicitement limitée ; ne prouve pas à lui seul l’état juridique complet en 2026.

Le dossier `Preuves-audit-Furrix.zip` accompagne le rapport : manifeste SHA-256 des 32 fichiers, scripts des tests séparés, résultats SQL et handlers, logs de build, résolution des dépendances et audits npm. Les scripts utilisent exclusivement des identifiants et données fictifs ; ils ne doivent jamais être lancés sur une production. Le dossier ne contient pas de secrets ni de base utilisateur réelle.
