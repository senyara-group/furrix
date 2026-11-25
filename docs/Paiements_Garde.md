# Paiement des gardes — préparation du 25 novembre 2026

## Choix validés

Le gardien vend et encaisse la prestation ; Furrix retient une commission sur son tarif. Aucun supplément propriétaire n'a été décidé. Le pourcentage reste à définir : aucune valeur par défaut, même zéro, ne doit être utilisée lors de l'activation.

Stripe Connect et Checkout hébergé sont retenus pour le web, Android et iOS. L'inscription du gardien sera hébergée par Stripe ; son suivi passera par le tableau de bord Express. La disponibilité des portefeuilles Apple Pay et Google Pay dépendra de la configuration Stripe et de l'appareil. Le paiement des gardes est distinct du prototype RevenueCat d'abonnement numérique.

## Environnement

L'environnement isolé **Furrix DEV**, `acct_1UfdgzLRlPFxqD3K`, est en mode test. Connect est accessible après validation du questionnaire par le titulaire. Aucune configuration de production SENYARA n'a été copiée à sa création. Aucun compte gardien, aucune session Checkout, aucune clé supplémentaire ni destination webhook n'a été créé dans ce lot. Aucun secret n'est ajouté au dépôt et rien n'est déployé sur Supabase.

## Contenu de ce premier lot

L'écran de garde annonce le futur paiement hébergé et retire les champs de carte factices. Son bouton reste désactivé. Le récapitulatif propriétaire ne présente plus un supplément Furrix hypothétique. Le récapitulatif gardien distingue commission et frais Stripe encore à définir.

`supabase/functions/_shared/sitting-payment-quote.ts` prépare un calcul serveur en centimes, avec arrondi entier de la commission. Il refuse une commission absente ou invalide, un autre propriétaire, une demande non acceptée ou déjà commencée et un montant invalide. Les pourcentages figurant dans les tests sont fictifs.

Ce module n'est pas encore appelé par une fonction déployable : il ne remplace ni l'autorisation en base, ni le verrouillage du calendrier, ni le contrôle bêta. Il ne crée aucun paiement et ne modifie aucun statut. Le montant restant après commission n'est pas présenté comme un net bancaire : les frais Stripe ne sont pas encore déduits.

## Raccordement restant

1. Créer et relier les comptes gardiens via Accounts v2, avec responsabilités et capacités vérifiées ; reprendre l'inscription interrompue sans créer de doublon. Vérifier les exigences de Stripe pour les gardiens particuliers avant les paiements réels.
2. Ajouter les tables privées et fonctions serveur de paiement. Lire le tarif figé sur la demande en base, sous les mêmes verrous de paire et de calendrier que les gardes. Revérifier identité, accès bêta, compte gardien, capacité et dates. Le client ne fournit ni prix, ni commission, ni compte destinataire.
3. Créer Checkout sur le compte connecté avec une clé d'idempotence persistée. Une réponse réseau perdue doit retrouver la même session. Réserver une durée de paiement explicite et coordonner l'expiration avec retrait/refus/annulation.
4. Recevoir les événements signés des comptes connectés. Vérifier compte, mode test, session, devise, montant et état payé. Dédupliquer les événements et accepter leur arrivée désordonnée. Un retour navigateur ne confirme jamais une garde. Si un paiement arrive après annulation ou expiration, ne pas confirmer automatiquement : prévoir le remboursement et son suivi.
5. Raccorder le navigateur sécurisé Android/iOS et un retour contrôlé vers Furrix. Vérifier les liens sur appareil, la fermeture du navigateur et la reprise après fermeture de l'application.
6. Adapter l'annulation, le retrait d'animal et la suppression de compte aux paiements/remboursements/litiges en attente. Ne pas effacer les références nécessaires au rapprochement financier.

Avant l'activation, décider commission, prise en charge des frais Stripe, conditions de remboursement, remboursement de la commission, délais de paiement et de versement. Les paramètres du compte connecté doivent correspondre à ces décisions. Le seul choix « paiement direct » ne garantit pas à lui seul toutes les responsabilités de la plateforme.

## Vérification

Vitest : 331/331, dont six tests du calcul serveur ; tests existants de l'écran désactivé adaptés. Contrôle des types et compilation web réussis. La compilation conserve un avertissement antérieur de clé `transition` dupliquée dans l'ancien prototype `src/Furrix.jsx`. Aucun test Stripe de bout en bout, aucun paiement, aucune migration ni compilation native dans ce lot. La recette devra couvrir paiement réussi/refusé/3D Secure, double clic, événement dupliqué, annulation concurrente, expiration, reprise réseau et remboursement.

## Lot suivant : inscription Stripe des gardiens (préparation serveur)

La fonction `sitter-stripe-onboarding` est ajoutée, désactivée par défaut. Elle accepte uniquement `POST` avec `action: status` ou `action: start` et le JWT du gardien. Elle vérifie l'identité auprès d'Auth, puis le profil de gardien, l'accès bêta, l'absence de suppression demandée et l'existence de la session Auth. Le client ne choisit ni le compte Stripe ni les URL de retour.

La migration `20261125105925_sitter_stripe_onboarding.sql` conserve une liaison privée par gardien. Une clé permanente rend les nouveaux essais idempotents. Un bail de deux minutes empêche les appels simultanés de préparer deux inscriptions ; une temporisation de trente secondes limite la création de liens. Une création sans compte confirmé après vingt-trois heures est bloquée pour rapprochement manuel, sans nouvelle clé automatique. Le compte est conservé avant la création d'un lien ; un échec du lien ne relance donc pas sa création.

L'adaptateur est limité à une clé `sk_test_` et au compte plateforme `acct_1UfdgzLRlPFxqD3K`. Accounts v2 utilise la version `2026-11-18.endive`. Les comptes de test sont créés en France, avec le tableau de bord Express, Stripe responsable de la collecte des frais et des soldes négatifs du gardien. Ce choix de test ne vaut pas activation commerciale. Aucune adresse e-mail, pièce d'identité ni coordonnée bancaire n'est préremplie ; le gardien les renseigne chez Stripe. Le statut « prêt » exige les capacités de paiement et de versement lues chez Stripe. Il ne confirme aucune réservation.

Les liens temporaires ne sont ni stockés ni envoyés par e-mail. La réponse interdit leur mise en cache. Seuls les hôtes exacts `connect.stripe.com` et `accounts.stripe.com` en HTTPS sont acceptés. Le retour et le renouvellement conduisent vers le profil gardien de `furrix.fr` ; il faudra un bouton explicite pour reprendre, sans création automatique au retour.

Tant que la clôture Stripe n'est pas raccordée, une liaison, même incertaine, bloque la suppression du compte Furrix. Le motif « Compte de paiement à clôturer avec l’équipe » est visible dans Mon compte ; un déclencheur protège aussi l'appel serveur. Le retour arrière `supabase/operations/rollback_sitter_stripe_onboarding.sql` refuse de supprimer une liaison existante. Avant de l'exécuter, désactiver la fonction et attendre la fin de ses appels.

Pour activer ultérieurement sur DEV : revue et application de la migration, configuration de `STRIPE_FURRIX_TEST_SECRET_KEY`, déploiement avec vérification JWT puis `FURRIX_STRIPE_ONBOARDING_ENABLED=true`. Ne pas placer cette clé dans une variable `VITE_`. Aucun de ces changements distants n'est effectué dans ce lot.

Restent à faire : bouton et ouverture du navigateur sécurisé dans le profil gardien, retour mobile, essais réels du contrat Accounts v2 et de la configuration Connect dans le sandbox, gestion de clôture, Checkout et événements de paiement. Les appels Stripe sont simulés dans les tests ; les tests SQL utilisent PGlite et ne prouvent pas la concurrence entre plusieurs sessions PostgreSQL. Aucun compte Stripe n'est créé et aucune migration n'est appliquée sur DEV.

Vérifications exécutées sur ce lot : 341/341 tests Vitest (dont dix nouveaux tests serveur), 158/158 tests SQL PGlite, contrôle TypeScript, compilation web et `deno check` de la fonction Edge. Le scénario SQL exerce les droits, le bail, la clé conservée, la session révoquée, le blocage de suppression et le retour arrière/réapplication. L'avertissement antérieur de clé `transition` dupliquée dans `src/Furrix.jsx` reste présent à la compilation.

## Documentation Stripe consultée pour l'inscription

- [Inscription hébergée, Accounts v2](https://docs.stripe.com/connect/hosted-onboarding?accounts-namespace=v2&locale=en-GB)
- [Création de lien temporaire](https://docs.stripe.com/api/v2/core/account-links/create)

- [Paiements directs avec Checkout](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted)
- [Comptes Connect et Accounts v2](https://docs.stripe.com/connect/accounts-v2)
- [Checkout hébergé](https://docs.stripe.com/payments/checkout)
