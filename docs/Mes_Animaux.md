# Mes animaux — premier parcours connecté

Le nouvel espace propose la liste réelle des animaux du compte, l'ajout, l'édition des informations et l'ajout ou le remplacement de la photo principale. L'accueil conserve sa navigation Plein air. Les composants d'Alexis n'étaient pas encore disponibles dans `main` au démarrage : ce module est isolé dans `src/pets` pour faciliter leur intégration.

## Fonctionnement

- Nom, espèce, race ou type, sexe, âge, ville, objectif et présentation. Validation existante, limites identiques à 0005. Les espèces et objectifs reprennent exactement les valeurs existantes du schéma ; leur présence n'ouvre aucun service de reproduction, de rencontre ou d'exposition.
- La liste et l'accueil se mettent à jour après confirmation du serveur. Un refus conserve les valeurs du formulaire. Les réponses tardives ne mettent pas à jour un écran démonté ; le contenu est séparé par compte.
- L'ajout réserve un UUID pendant la vie du formulaire. En cas de réponse perdue, la création est relue ; les nouveaux essais dans ce même formulaire utilisent le même identifiant, sans insérer un deuxième animal. Après fermeture/rechargement du formulaire, vérifier la liste avant de recommencer : ce lot ne conserve pas de brouillon persistant.
- Une photo principale par animal dans cette interface. Le remplacement utilise le flux de réconciliation existant, puis supprime les anciennes photos seulement après confirmation de leur remplacement. Il remplace l'ensemble précédent ; une galerie de six photos et leur réorganisation restent à développer.
- JPEG, PNG et WebP, maximum 5 Mo ; sélection par le champ fichier du navigateur/webview. HEIC n'est pas converti et reste refusé explicitement. La caméra native dédiée n'est pas raccordée ici.
- Le bucket reste privé : téléchargement authentifié avec contrôle du chemin propriétaire/animal, sans URL publique ni URL signée partageable. L'image utilise une URL mémoire, libérée au démontage et au changement de photo ; les téléchargements tardifs sont ignorés. Les octets déjà téléchargés ne peuvent pas être rappelés après une révocation.

Les abonnements et leurs quotas ne sont pas implémentés dans ce lot. L'ajout est disponible pour les testeurs autorisés, sans promesse de quota commercial. Ni suppression d'animal, ni choix persistant d'animal actif pour le swipe, ni champs de santé ne sont ajoutés.

## Contrôles et recette

Tests ciblés : validation avant écriture, liste blanche de colonnes, édition de l'animal choisi, refus conservant le formulaire, HEIC refusé sans upload, chemin d'upload, téléchargement privé et chemins étrangers refusés, libération des images mémoire, réponse de création perdue et réponses après démontage.

Contrôle visuel du véritable composant dans une page temporaire locale avec données fictives, sur ordinateur et à 390 px : liste et formulaire affichés, huit champs présents, aucun débordement horizontal. Cette page de revue a été supprimée et ne fait pas partie de l'application. Ce contrôle ne constitue pas une recette Supabase réelle.

Recette à réaliser avec les comptes bêta une fois les invitations opérationnelles : créer un animal, recharger et retrouver son profil, modifier son nom, ajouter une photo puis la remplacer, vérifier l'accès depuis l'autre appareil et le refus depuis l'autre compte. Ne pas utiliser de données personnelles pendant les essais. La disponibilité des e-mails ne bloque pas l'implémentation locale, mais la recette connectée n'a pas été exécutée dans ce lot.

Aucune migration, configuration distante, invitation ou modification de compte. Aucun build APK/IPA ni test sur appareil réel ; la vérification mobile porte sur la mise en page web.
