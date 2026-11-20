# Rendez-vous Services — bêta privée

## Parcours

Depuis Services, « Mes rendez-vous » regroupe les demandes envoyées et reçues.
« Gérer mes créneaux professionnels » ouvre le calendrier du titulaire d’une activité.
Créer l’activité reste possible depuis le formulaire existant, sans nouveau compte ni rôle administrateur.

Le professionnel publie des créneaux réels, avec un début et une durée. Un calendrier unique représente l’activité entière : plusieurs salariés ou ressources ne sont pas gérés dans ce lot. Les heures sont saisies et affichées dans le fuseau de l’appareil ; le serveur stocke des instants avec fuseau. Un créneau peut durer au plus 24 heures. Aucun horaire fictif n’est ajouté.

Le propriétaire choisit un créneau sur la fiche, son animal et une prestation. Le prix indicatif et son unité sont copiés au moment de la demande. Une modification ultérieure de l’annuaire ne modifie pas cette copie. Les prestations portant exactement le même nom dans une activité ne sont pas réservables tant que le titulaire ne les distingue pas.

Une demande n’est pas un rendez-vous confirmé :

- `pending` : le professionnel peut confirmer, refuser ou proposer un autre créneau ;
- `countered` : le propriétaire peut accepter le nouveau créneau ou retirer sa demande ; le professionnel peut refaire une proposition ou refuser ;
- `confirmed` : chaque participant peut annuler, après confirmation explicite, tant que le rendez-vous n’est pas terminé ;
- `declined`, `withdrawn`, `cancelled` : états terminaux conservés dans le suivi.

Plusieurs personnes peuvent demander le même créneau. Une seule confirmation est possible ; les autres demandes restent en attente et doivent être traitées. Le propriétaire peut retirer une demande en attente. Un créneau lié à une demande ouverte ou à un rendez-vous confirmé ne peut pas être fermé avant son traitement.

Les changements sont visibles après actualisation du suivi. **Aucune notification automatique, messagerie professionnelle, téléconsultation ni opération de paiement n’est ajoutée.** Il n’y a pas de délai d’expiration ni de politique de frais inventés. Les accords de prestation et de prix restent à confirmer directement avec l’établissement. La garde reste un parcours distinct.

## Confidentialité et autorisations

Toutes les fonctions exigent un compte bêta actif. L’activité doit être publiée et son titulaire actif pour recevoir une nouvelle demande. Mettre l’activité en pause ne supprime pas le suivi des rendez-vous existants.

Le partage de l’animal est décoché par défaut. S’il est accepté, seuls nom, espèce, race et âge sont transmis à l’établissement pour cette demande. Sans partage, aucun champ de l’animal ni son identifiant ne sort vers le professionnel. Le propriétaire conserve l’accès à son propre animal. Santé, allergies, poids, photos, e-mail et coordonnées personnelles ne sont pas projetés. Le message libre reste un choix du propriétaire : l’écran lui demande d’éviter les informations médicales sensibles.

Les deux nouvelles tables n’accordent aucun accès direct au client, même authentifié. Six fonctions à projection explicite assurent lecture et mutations. Un tiers ne lit pas la demande. Aucun rôle de compte existant n’est modifié.

La confirmation verrouille d’abord l’animal puis le calendrier professionnel. Elle refuse les chevauchements pour l’établissement **et pour le même animal**, même entre deux établissements. La demande conserve un identifiant de requête rejouable après une réponse perdue, vérifié avec son contenu initial. La publication d’un créneau fait de même. Les créations sont limitées à 20 demandes par propriétaire sur 24 heures ; une reprise identique ne consomme pas la limite.

## Migration et retour arrière

`20261120100223_professional_appointments.sql` dépend de `20261119171727_professional_directory.sql` et des tables animaux/bêta existantes. Aucune migration antérieure n’est réécrite. **Appliquée sur DEV le 20 novembre 2026 avec autorisation de Guillaume**, après fusion de la PR #36. Le fichier initial `20261120093911_professional_appointments.sql` est renommé pour correspondre à la version enregistrée par Supabase ; son contenu SQL reste identique.

Contrôles après application : les deux tables ont RLS activé et aucun droit direct de lecture ou d’insertion pour `anon` et `authenticated`. Les six fonctions refusent l’exécution anonyme et fixent leur `search_path`. Les sondes sous rôles réels refusent une lecture directe, un appel de suivi sans identité et une publication sans identité ; la transaction de sondes est annulée. Les nouvelles tables contiennent zéro créneau et zéro rendez-vous. Aucune modification des comptes ou des données métier existantes.

Les conseillers Supabase signalent l’[absence de politiques sur ces tables privées](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) et les [fonctions privilégiées accessibles aux membres](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) : ces choix sont intentionnels, l’accès métier passant uniquement par les fonctions contrôlées. Les avertissements antérieurs concernant [`touch_updated_at`](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [`handle_new_user`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) et la [protection des mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) restent hors de cette activation.

Une sonde de lecture sous rôle `authenticated`, avec le contexte SQL d’un membre bêta ayant accepté la notice, exécute les deux fonctions de liste sans erreur. Elle ne remplace pas une connexion réelle par l’API Auth. Après renommage : contrôle des types, 222 tests Vitest, compilation et 17 tests SQL ciblés annuaire/rendez-vous réussis.

Le retour arrière est `supabase/operations/rollback_professional_appointments.sql`. Il supprime les créneaux et demandes de ce lot : sauvegarder ces données avant toute utilisation hors base de test. Il préserve animaux, profils et activités professionnelles. Pour retirer également l’annuaire, retirer d’abord les rendez-vous, puis l’annuaire ; réappliquer dans l’ordre inverse.

## Validation et recette restante

- Vitest : 222 tests, dont quatre nouveaux scénarios : partage facultatif et identifiant conservé après coupure, attente serveur et créneau exact, actions du professionnel sans accès à l’animal non partagé, confirmation explicite d’annulation.
- SQL PGlite : 117 tests réussis au total, dont neuf scénarios rendez-vous et leur parent ; rôles, confidentialité, consentement, reprises, contre-proposition, ancien créneau refusé, prix figé, annulation et chevauchement pour un animal. Retour arrière/réapplication exécutés. L’ancien test de retour arrière de l’annuaire est adapté à l’ordre des dépendances.
- PostgreSQL local 18.6 : 13 scénarios de concurrence et leur parent, dont trois nouveaux : confirmation concurrente du même créneau, deux établissements pour le même animal, demande simultanément rejouée. Les tests observent l’attente d’un verrou avant de libérer la première transaction.
- Navigateur local, client simulé, 390 et 1 280 px : demande, attente, réponse professionnelle, annulation et créneaux ; un titre principal, pas de débordement horizontal ni erreur JavaScript, boutons/liens d’action d’au moins 44 px.

Restent la recette des vraies API Supabase avec plusieurs comptes, la réception et le suivi des demandes sur DEV, puis les essais Android/iOS. Les contrôles techniques d’application ne prouvent pas ces parcours complets. Aucun rendez-vous réel, notification, message ou e-mail n’a été créé pendant l’activation.

Les listes sont limitées aux 100 demandes les plus récemment mises à jour et aux 100 premiers créneaux actifs à venir. Pas d’archivage paginé ni de recherche d’historique complet dans ce lot. Le partage porte sur les valeurs courantes de l’animal : ce n’est pas une copie de son profil au moment de la demande.
