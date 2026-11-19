# Services — premier lot : annuaire et activité professionnelle

Ce lot remplace l’écran Services en préparation par un annuaire bêta : vétérinaires, toilettage et éducation. Garde reste un parcours distinct, accessible par lien depuis Services et Mon compte ; aucun fichier de la branche d’Alexis n’est modifié.

## Parcours disponibles

- Rechercher par ville ou code postal, sans demander le GPS. La position actuelle est une option déclenchée explicitement. Le service public de géocodage reçoit uniquement le texte saisi. Les requêtes de recherche de commune ont un délai maximal de 15 secondes et une réponse devenue obsolète est ignorée.
- Filtrer par catégorie et rayon (5, 10, 25, 50 km), consulter les 50 activités les plus proches, puis ouvrir une fiche par lien direct. Les critères appliqués restent en mémoire pendant la navigation dans Services.
- Lire les prestations, tarifs indicatifs, horaires, accès, animaux accueillis et coordonnées professionnelles volontairement publiées. Un tarif non renseigné reste « Tarif à demander ». Les sites externes exigent HTTPS, sans identifiant ni mot de passe ; le lien protège l’onglet d’origine.
- Depuis Mon compte → Mon activité, créer ou éditer son profil professionnel avec les mêmes identifiants. Ce premier lot permet une activité/catégorie par compte. Aucune modification de profiles.role, aucun rôle administrateur, aucun nouveau compte.
- Le profil démarre en pause. Le titulaire choisit explicitement sa visibilité puis enregistre. La mise en pause retire le profil de la recherche et des liens directs. Modifier la ville invalide le secteur précédemment confirmé. La position précise n’est pas renvoyée par l’annuaire.

L’appellation « Activité déclarée » n’est pas un contrôle de diplôme ni un badge vérifié. L’annuaire reste limité aux membres de la bêta active, côté appelant et titulaire. Les conditions et justificatifs pour ouvrir à des professionnels extérieurs restent à décider.

## Base et confidentialité

Migration locale à relire : `20261119165521_professional_directory.sql`. Elle crée professional_profiles (une ligne par titulaire), une lecture directe réservée au propriétaire via RLS et trois RPC : save_professional_profile, set_professional_active, search_professionals. Les écritures directes client sont révoquées. Les deux fonctions d’écriture ne prennent jamais d’identifiant de propriétaire : elles utilisent auth.uid(). Le JSON des prestations est validé, limité à vingt entrées et reconstruit avec les seules clés autorisées.

La projection de découverte est explicite : identifiant professionnel, nom d’activité, catégorie, ville, présentation, animaux accueillis, horaires, accès, téléphone et site professionnels, prestations et distance arrondie. Elle ne contient ni latitude/longitude, ni e-mail personnel, ni données animales, ni rôle de compte. Une révocation bêta masque les fiches et interdit les opérations du compte révoqué.

Les coordonnées du secteur sont arrondies à deux décimales avant stockage ; ce n’est pas une garantie contre toute estimation géographique. La ville et les coordonnées de contact sont volontairement affichées aux testeurs. Aucun appel au site professionnel, envoi d’e-mail ou appel téléphonique automatique n’est effectué.

Retour arrière : `supabase/operations/rollback_professional_directory.sql`. Il supprime uniquement les objets de ce lot et leurs données de profils professionnels ; prévoir leur sauvegarde si des profils ont été créés. Les comptes, profils personnels, animaux, rencontres et gardes sont conservés.

## Suite du parcours de référence

Les rendez-vous, disponibilités réservables, contre-propositions, messagerie professionnelle, accès d’une équipe à un établissement, vérifications professionnelles et paiements ne sont pas dans ce premier lot. Aucun créneau de démonstration, professionnel fictif ou tarif fictif n’est injecté dans la base. La fiche propose seulement les coordonnées professionnelles fournies par son titulaire et indique qu’aucun rendez-vous n’est réservé dans Furrix.

La carte du prototype n’est pas reproduite sous une apparence géographique trompeuse : ce lot utilise une liste et une recherche de secteur réelle. Un fournisseur cartographique éventuel reste une décision distincte.

## Validation locale

- Vitest : 202/202, dont six nouveaux scénarios Services : ville sans GPS et filtres, panne et reprise, statut et contact d’une fiche, liens externes, publication avec tarif en centimes et secteur, invalidation du secteur après changement de ville.
- SQL PGlite : 95/95, dont six scénarios d’annuaire et leur test parent : propriétaire, projection publique choisie, distance et catégorie, refus anonymes et écritures directes, validation atomique des prestations/liens, pause et révocations, retour arrière puis réapplication.
- PostgreSQL 18.6 jetable : toutes les migrations chargées et les six scénarios de concurrence existants réussis (sept tests avec le parent). Aucune connexion DEV pendant ces tests.
- Types et compilation web : réussis. Navigateur local simulé à 390 et 1280 px : recherche, fiche, formulaire enregistré, un h1, aucun débordement horizontal ni erreur JavaScript, cibles de boutons d’au moins 44 px.
- Le composant Button accepte target/rel pour les liens externes ; le bouton Retour utilise le jeton de cible tactile 44 px.

Pas encore réalisé : application de la migration sur DEV, essais avec les vrais comptes, compilation Android/iOS et recette sur appareils. Rien n’est déployé ni fusionné par ce lot.
