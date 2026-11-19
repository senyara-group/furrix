# Fin de match et blocage

## Comportement

Depuis une conversation, « Mettre fin au match » ouvre une confirmation avec « Garder le match » et « Confirmer la fin du match ». Rien ne change avant la réponse positive du serveur ; une erreur permet de réessayer. Deux clics ne lancent pas deux requêtes simultanées.

La fermeture est définitive pour cette paire d’animaux : le match disparaît des listes des deux personnes, les messages et propositions ne sont plus lisibles, aucune nouvelle écriture ni réactivation par un ancien j’aime n’est possible. Les propositions en attente sont retirées et les rencontres confirmées annulées. Les autres matchs, même entre d’autres animaux des mêmes propriétaires, restent ouverts.

Le blocage existant reste une action différente : il concerne les deux propriétaires et tous leurs animaux. Cette migration en renforce l’effet sur les lectures directes de messages, propositions et matchs, ainsi que sur les écritures concurrentes. Elle retire aussi les propositions ouvertes entre ces propriétaires. La découverte et l’accès aux photos restent soumis au blocage déjà en place.

Les lignes historiques sont conservées en base ; ce lot ne crée pas une politique de suppression des données. Un contenu déjà téléchargé ne peut pas être retiré d’une copie faite par son destinataire. La liste des conversations et le match ouvert sont actualisés toutes les 15 secondes lorsque la page est visible. Les contrôles serveur s’appliquent immédiatement après validation de l’action, même si un ancien écran reste affiché.

## Migration à appliquer après revue

`20261119133628_meeting_match_closure.sql` se place après toutes les migrations déjà présentes, dont `20261119104712_lost_alerts_completion.sql`. Aucun fichier déjà appliqué n’a été modifié. Aucun changement appliqué sur Supabase DEV pendant ce développement.

- Ajout de `ended_at` et `ended_by` sur `matches`, RPC `end_pet_match` réservée aux participants de la bêta active ; un tiers et un anonyme sont refusés. Le rejeu conserve la première fermeture.
- Verrou transactionnel commun entre deux propriétaires, partagé par fermeture, blocage, message, création/réponse de proposition et swipe. Tous prennent ce verrou avant les verrous de proposition ou de paire d’animaux, pour éviter les ordres contradictoires.
- Les fonctions de lecture privilégiées filtrent les matchs terminés. Une règle RLS restrictive couvre la lecture directe des matchs ; les règles de messages et de propositions utilisent le contrôle de participation renforcé. Les écritures directes restent interdites. Les fonctions internes ne sont pas exécutables par les clients.

Retour arrière : `supabase/rollbacks/meeting_match_closure.sql`, testé sur une base locale vide de recette. Il restaure les anciennes fonctions et supprime les colonnes et la RPC ajoutées. **Il rouvre les matchs et ne restaure pas les anciens statuts des propositions déjà retirées ou annulées** : ce n’est pas un outil d’annulation de décisions utilisateur. Après une recette réelle, préférer une correction en avant.

Déployer l’interface seulement après application de la migration validée, sinon sa nouvelle action échouera sans fermer le match. Les applications Android déjà installées conservent leur ancienne interface ; une recompilation sera nécessaire pour y ajouter cette action après validation du lot.

## Contrôles réellement exécutés

- TypeScript et compilation web : OK ; Vitest : 161/161.
- SQL PGlite : 80/80, dont fermeture, rejeu, tiers/anonyme, compte révoqué, autres animaux, blocage, lectures directes et RPC, propositions retirées/annulées, retour arrière puis réapplication.
- La suite SQL tourne avec deux fichiers simultanés pour tenir dans la mémoire de ce PC ; son lancement sans limite avait échoué par manque de mémoire.
- PostgreSQL 18.6 local, dix paires et jusqu’à trente connexions simultanées : cinq scénarios réussis (six tests en comptant le parent). Le nouveau scénario observe quatre connexions en attente du verrou côté serveur, puis confirme leur refus après commit de la fermeture ou du blocage. Les autres vérifient les likes réciproques, leurs rejeux, les décisions contradictoires et les messages rejoués sans doublon.
- Reproduction du test PostgreSQL sur un serveur jetable uniquement : définir `FURRIX_TEST_PG_URL`, éventuellement `FURRIX_TEST_PAIRS=10` (100 par défaut), puis `npm run test:pg --prefix supabase/tests`. Ne jamais cibler DEV : le test crée puis supprime une base dédiée.

## Recette restante sur DEV

Après application de la migration et déploiement validés : deux vrais comptes sur deux appareils, match avec proposition en attente puis confirmée, fermeture depuis l’un et envoi depuis l’autre ; vérifier la disparition des listes et le refus des anciens liens. Refaire avec un autre match pour le blocage, y compris les autres animaux de ces propriétaires. Un troisième compte doit conserver ses propres conversations.

Le signalement existant enregistre une demande, mais ce lot n’ajoute pas de console de traitement, de déblocage, de notifications push ni de limites de fréquence. Ces limites restent à traiter avant élargissement de la bêta.

Aperçu navigateur local avec client fictif : confirmation et succès vérifiés à 390 et 1280 px, sans débordement horizontal ni erreur JavaScript. Les deux actions mesurent au moins 48 px de haut. Cet aperçu isolé ne valide ni l’authentification réelle, ni une installation Android/iOS.


## Application DEV du 19 novembre 2026

Migration appliquée après accord de Guillaume, enregistrée par Supabase sous la version 20261119133628. Le fichier initial 20261119131309 a été renommé sans changer son SQL. Empreinte MD5 du SQL Git et du SQL enregistré sur DEV : 7e3809b959fd66647a97bbf0bdeae015.

Vérifications après application : ended_at et ended_by présentes ; RPC réservée à authenticated et refusée à anon ; verrou interne non exécutable par les clients ; règle restrictive de lecture présente. Appels sans session et sous rôle anon refusés lors de sondes transactionnelles annulées. Aucune fermeture, aucun blocage et aucun message créés pour ces vérifications. Les tables de matchs, messages et propositions étaient vides avant et après.

Les conseillers Supabase signalent les RPC privilégiées accessibles aux comptes connectés, dont end_pet_match : cet accès est intentionnel et contrôlé par participation et bêta. Les points déjà relevés sur handle_new_user, touch_updated_at et la protection des mots de passe compromis restent hors de cette application. La recette avec deux vrais comptes reste à réaliser.
