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

## Références

- [Paiements directs avec Checkout](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted)
- [Comptes Connect et Accounts v2](https://docs.stripe.com/connect/accounts-v2)
- [Checkout hébergé](https://docs.stripe.com/payments/checkout)
