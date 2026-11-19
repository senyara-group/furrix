# Messages : recherche et brouillons

La boîte Messages permet de rechercher les conversations chargées par prénom du propriétaire ou nom d’un des deux animaux, sans tenir compte des accents et de la casse. Chaque mot saisi doit correspondre. La limite serveur existante de 100 conversations demeure ; une note l’indique si elle est atteinte. Le tri reste celui de la base : activité récente en premier.

Actualiser permet de relancer la lecture sans quitter la liste. Une panne réseau conserve les dernières conversations avec une indication d’actualisation indisponible. Un refus d’accès ou une erreur non identifiée retire la liste en mémoire ; aucun accès refusé n’est masqué par l’affichage d’un cache. Les actualisations automatiques existantes restent suspendues lorsque l’onglet est caché.

Un brouillon distinct par match reste disponible lors du retour à la liste ou d’un changement d’écran. La liste affiche son aperçu et le badge Brouillon. L’envoi confirmé l’efface. L’identifiant de requête reste attaché au brouillon : un retour à la liste après une réponse perdue ne recrée pas une demande distincte lors du nouvel essai avec le même texte.

Les brouillons restent uniquement en mémoire dans la session authentifiée. Ni stockage web, ni base, ni transmission de texte avant Envoyer. Déconnexion, fermeture de l’application ou rechargement les effacent. Ils ne se synchronisent pas entre appareils. Le fournisseur est recréé pour une nouvelle session ; aucun brouillon n’est partagé entre comptes.

Pas de nouveaux marqueurs lu/non lu, accusés de lecture ou push de messages dans ce lot. La réception réelle et le clavier Android/iOS restent à vérifier lors de la recette collective. Le raccordement notifications Android déjà activé conserve son périmètre animaux perdus.

Validation : cinq nouveaux scénarios (recherche, panne réseau et reprise, accès refusé, brouillon et identifiant conservés après navigation, isolation par match/session). Suite Vitest complète : 196 tests. Contrôle des types et compilation web réussis. Navigateur local simulé à 390 et 1280 px : recherche et retour à la liste après rédaction, un titre principal, aucun débordement horizontal ni erreur JavaScript. Pas de nouvelle migration métier ni de modification de Supabase pour Messages.

La branche reprend aussi le commit de traçabilité de l’activation push DEV : les versions locales des migrations sont alignées sur celles attribuées par Supabase, et la migration d’infrastructure du minuteur est conservée. Ce suivi avait été publié après le commit fusionné dans la PR 30. Il ne faut pas réappliquer les migrations déjà présentes sur DEV.
