# Mes animaux — premier parcours connecté

Le nouvel espace propose la liste réelle des animaux du compte, l'ajout, l'édition des informations et l'ajout ou le remplacement de la photo principale. L'accueil conserve sa navigation Plein air. Les composants d'Alexis n'étaient pas encore disponibles dans `main` au démarrage : ce module est isolé dans `src/pets` pour faciliter leur intégration.

## Fonctionnement

- Nom, espèce, race ou type, sexe, âge, ville, objectif et présentation. Validation existante, limites identiques à 0005. Les espèces et objectifs reprennent exactement les valeurs existantes du schéma ; leur présence n'ouvre aucun service de reproduction, de rencontre ou d'exposition.
- La liste et l'accueil se mettent à jour après confirmation du serveur. Un refus conserve les valeurs du formulaire. Les réponses tardives ne mettent pas à jour un écran démonté ; le contenu est séparé par compte.
- L'ajout réserve un UUID pendant la vie du formulaire. En cas de réponse perdue, la création est relue ; les nouveaux essais dans ce même formulaire utilisent le même identifiant, sans insérer un deuxième animal. Après fermeture/rechargement du formulaire, vérifier la liste avant de recommencer : ce lot ne conserve pas de brouillon persistant.
- Une photo principale par animal dans cette interface. Le remplacement utilise le flux de réconciliation existant, puis supprime les anciennes photos seulement après confirmation de leur remplacement. Il remplace l'ensemble précédent ; une galerie de six photos et leur réorganisation restent à développer.
- JPEG, PNG et WebP, maximum 5 Mo ; sélection par le champ fichier du navigateur/webview. HEIC n'est pas converti et reste refusé explicitement. La caméra native dédiée n'est pas raccordée ici.
- Le bucket reste privé : téléchargement authentifié avec contrôle du chemin propriétaire/animal, sans URL publique ni URL signée partageable. L'image utilise une URL mémoire, libérée au démontage et au changement de photo ; les téléchargements tardifs sont ignorés. Les octets déjà téléchargés ne peuvent pas être rappelés après une révocation.

Les abonnements et leurs quotas ne sont pas implémentés dans ce lot. L'ajout est disponible pour les testeurs autorisés, sans promesse de quota commercial. Le retrait du profil est décrit ci-dessous ; il ne constitue pas un effacement définitif des données.

## Premiers pas et retrait du profil — novembre 2026

Le guide facultatif de l'accueil propose de compléter le compte et la ville, présenter un animal puis ajouter son portrait. Il disparaît lorsque ces étapes sont complètes et peut être masqué sur cet appareil, pour ce compte seulement. Les liens gardien/professionnel restent disponibles sans posséder d'animal. Le lien `#/animaux?nouveau=1` ouvre directement la création existante. Les inscriptions publiques restent fermées : aucune configuration d'accès n'est modifiée.

« Retirer le profil » ouvre une page de confirmation explicite. L'interface attend la confirmation du serveur avant d'enlever l'animal de la liste ; un nouvel essai après réponse perdue est idempotent. Le choix d'animal actif de cet onglet est effacé s'il désignait l'animal retiré.

- Le profil est archivé, caché à son propriétaire et à la découverte, sans suppression physique des lignes ni des photos privées. Les anciennes photos ne sont plus accessibles aux autres testeurs par la politique des rencontres.
- Les matchs sont terminés. Comme pour un match terminé, leurs conversations deviennent inaccessibles dans l'application, mais les messages restent en base. L'historique des gardes et rendez-vous passés reste consultable.
- Une proposition de rencontre en attente, une rencontre acceptée à venir, une garde ou un rendez-vous encore actif, ou une alerte « perdu » bloque le retrait. Les espaces concernés sont indiqués avec leurs liens. Une annonce « retrouvé » est automatiquement clôturée lors du retrait.
- Le contrôle serveur est obligatoire et refait sous verrou. Les producteurs d'activités prennent le verrou partagé de l'animal : une demande arrivée avant le retrait le bloque ; arrivée après lui, elle est refusée. Les écritures directes de la date d'archivage et le DELETE client sont refusés.

Migration à examiner et appliquer séparément : `20261120122123_pet_profile_retirement.sql`, après toutes les migrations existantes, notamment les notifications unifiées. Aucune migration ancienne n'est modifiée. Retour arrière explicite : `supabase/operations/rollback_pet_profile_retirement.sql`. Il réaffiche les profils, mais ne rouvre pas les matchs et ne restaure pas les coordonnées supprimées ni les alertes clôturées ; sauvegarde nécessaire avant utilisation.

Contrôles locaux exécutés pour ce lot : types et compilation ; 249 tests Vitest ; 142 tests SQL PGlite, dont le retour arrière et la réapplication ; 19 scénarios de concurrence sur PostgreSQL 18.6 (20 résultats avec le test parent), dont cinq nouveaux scénarios garde/rendez-vous/rencontre contre retrait. Vérification navigateur des composants réels avec client simulé, à 390 et 1280 px : guide, blocage, confirmation et disparition après succès ; un titre principal, aucun débordement ni erreur JS, boutons d'au moins 44 px. Le support temporaire a été supprimé.

À recetter sur DEV après application autorisée de la migration : plusieurs comptes réels, fichiers privés via Storage, historique réel et nouveau build Android/iOS. Aucun déploiement ni migration distante pour ce lot. La suppression du compte et l'effacement définitif restent à réaliser séparément.

## Contrôles et recette

Tests ciblés : validation avant écriture, liste blanche de colonnes, édition de l'animal choisi, refus conservant le formulaire, HEIC refusé sans upload, chemin d'upload, téléchargement privé et chemins étrangers refusés, libération des images mémoire, réponse de création perdue et réponses après démontage.

Contrôle visuel du véritable composant dans une page temporaire locale avec données fictives, sur ordinateur et à 390 px : liste et formulaire affichés, huit champs présents, aucun débordement horizontal. Cette page de revue a été supprimée et ne fait pas partie de l'application. Ce contrôle ne constitue pas une recette Supabase réelle.

Recette à réaliser avec les comptes bêta une fois les invitations opérationnelles : créer un animal, recharger et retrouver son profil, modifier son nom, ajouter une photo puis la remplacer, vérifier l'accès depuis l'autre appareil et le refus depuis l'autre compte. Ne pas utiliser de données personnelles pendant les essais. La disponibilité des e-mails ne bloque pas l'implémentation locale, mais la recette connectée n'a pas été exécutée dans ce lot.

Aucune migration, configuration distante, invitation ou modification de compte. Aucun build APK/IPA ni test sur appareil réel ; la vérification mobile porte sur la mise en page web.
