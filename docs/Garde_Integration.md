# Intégration Garde — 20 novembre 2026

## État de la livraison

La branche d’intégration réunit `main` après Services et `feat/garde` au commit d’Alexis `e057746`. Elle conserve les commits d’origine, sans réécrire sa branche. Les conflits portent sur AppShell, la boîte Messages, les styles du calendrier et la liste des tests SQL.

Les routes Services et Garde coexistent. Le calendrier extrait dans SlotField est partagé. La recherche et les brouillons de Messages sont conservés ; les conversations de garde apparaissent dans la même boîte, même si la lecture des rencontres échoue. Une erreur de garde est affichée, pas silencieusement transformée en liste vide. Les brouillons de chat sont isolés par paire propriétaire/gardien dans la session authentifiée. Les demandes non envoyées utilisent une clé distincte par compte et gardien, nettoyée à la sortie de la session.

Accès à l’activité de garde : Mon compte → Mon profil de gardien, ou le lien de l’espace professionnel Services. Aucun second compte ni rôle administrateur n’est créé.

## Fonctionnement repris d’Alexis

Profil de gardien particulier ou professionnel déclaré, photo privée, formules et tarifs ; recherche par secteur, dates, espèce et filtres ; fiche ; demande et réponse ; conversation avant ou après demande ; suivi ; signalement et blocage. Les données viennent des fonctions et tables Supabase, pas de profils de démonstration.

Le paiement reste désactivé. Aucun numéro de carte ne peut être saisi, aucun appel à un prestataire de paiement n’est effectué. Le statut confirmed reste réservé au serveur. Les frais, conditions de remboursement, délais et versements restent à définir. Les demandes accepted sont considérées occupées par la recherche et la vérification de chevauchement ; cela ne vaut pas confirmation de paiement. La durée de maintien de ces demandes reste une décision produit.

La carte est explicitement illustrative : distances calculées, directions arbitraires. Un vrai fond cartographique reste à intégrer. La recherche par ville fonctionne indépendamment du GPS. Le nom de commune est envoyé au géocodage public existant.

## Corrections d’intégration

- Une nouvelle ville invalide le secteur précédent. La recherche de commune a un délai maximal de 15 secondes ; un résultat tardif ne remplace pas une saisie plus récente. Le même principe s’applique au profil de gardien. Cela ne prouve pas que tout problème de localisation du PC d’Alexis est résolu : la recette sur son appareil reste nécessaire.
- En cas de réponse d’enregistrement photo perdue, l’app vérifie la photo référencée. Elle ne détruit pas le fichier sur une issue réseau incertaine. Une image non référencée peut rester privée dans Storage après un échec inconnu ; sa suppression différée reste à traiter après vérification de l’absence de références.
- Une réponse réseau perdue lors d’une demande est affichée comme envoi non confirmé, avec accès à Mes gardes. Un nouvel essai identique conserve l’identifiant ; modifier le contenu en crée un nouveau. Le serveur refuse de réutiliser un identifiant avec un contenu différent.
- Une réponse de support préécrite a été retirée du signalement. Le statut ouvert n’est plus présenté comme un examen déjà commencé. Aucune réponse humaine ou notification de l’équipe n’est inventée.

## Base de données

Lecture seule sur DEV : les trois migrations d’Alexis sont déjà présentes sous leurs versions locales exactes :

1. `20261119151055_pet_sitting.sql`
2. `20261119154600_sitter_photo.sql`
3. `20261119192105_pet_sitting_limits.sql`

Elles sont conservées intactes. Les corps des quatre fonctions concernées ont été comparés par empreinte normalisée entre DEV et ces fichiers : ils correspondent.

La nouvelle migration `20261120090806_sitting_concurrency_recovery.sql` est préparée uniquement, pas appliquée :

- verrou de paire commun à Rencontres et Garde, pris avant les contrôles de blocage ;
- nouvelle vérification bêta après attente du verrou ;
- verrou de calendrier par gardien avant le contrôle et la modification d’une acceptation, pour empêcher deux acceptations simultanées sur les mêmes dates ;
- vérification du rejeu sous verrou avant les compteurs et avant l’insertion d’une demande ;
- comparaison du contenu d’une demande rejouée, et respect du rôle de propriétaire/gardien lors d’une action rejouée.

Les droits d’appel ne sont pas élargis. Les fonctions restent réservées aux comptes connectés, avec leur contrôle bêta. Aucun paiement n’est ajouté.

Retour arrière : `supabase/operations/rollback_sitting_concurrency_recovery.sql` restaure les quatre fonctions précédentes sans effacer les profils, demandes, photos ou messages. Il réintroduit les défauts de concurrence corrigés ; ne l’exécuter que dans une procédure de retour arrière revue. Retour arrière puis réapplication exécutés uniquement sur la base locale jetable.

## Vérifications réellement exécutées

- Vitest : 218/218. Six tests d’intégration ajoutés : garde visible malgré une panne Rencontres, brouillon et identifiant conservés via Messages, photo confirmée après réponse perdue, photo encore incertaine non détruite, secteur obsolète ignoré, demandes isolées entre comptes.
- PostgreSQL 18.6 local : dix scénarios de concurrence réussis (onze tests avec le parent), dont quatre nouveaux scénarios Garde. Transactions maintenues ouvertes et attente de verrou observée côté serveur.
- Contrôle négatif : sans la seule migration corrective, ces quatre scénarios échouent : double acceptation, rejeu de demande, rejeu du trentième message, blocage face à un message concurrent. Avec elle, ils passent.
- Les tests SQL d’Alexis et le retour arrière de la nouvelle migration sont exécutés avec l’ensemble des migrations locales. Les requêtes de préparation du minuteur push restent exclues du PostgreSQL local dépourvu de pg_net/Vault, comme documenté dans le lot précédent.
- Navigateur avec client simulé, à 390 et 1280 px : recherche par ville, fiche, demande envoyée, écran de paiement désactivé, boîte Messages, retour au brouillon. Un titre principal, aucun débordement horizontal ni erreur JavaScript.

Aucune mutation DEV, aucun envoi à des comptes réels, aucune fusion GitHub, aucun déploiement ni compilation Android/iOS réalisés pour cette intégration. La correction SQL devra être appliquée sur DEV après accord, puis la recette collective devra couvrir les vrais comptes, Storage et les appareils. Un nouvel APK sera nécessaire pour les fonctionnalités ajoutées depuis la dernière version distribuée.

Résultat de la suite SQL complète après correction : 107/107. Contrôle des types et compilation web réussis. Les 218 tests Vitest passent sur l’état final. Les essais navigateur utilisent uniquement des données locales simulées, supprimées du checkout après contrôle.
