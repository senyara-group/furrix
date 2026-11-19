# E-mails d'authentification Furrix

Trois modeles francais Plein air, livres sans modification du SMTP, sans envoi et sans activation des inscriptions publiques. Brevo transporte les messages ; le contenu est gere dans Supabase.

## Installation sur le projet Furrix

Supabase > Authentication > Emails > Templates : sauvegarder une copie de chaque ancien objet et contenu avant remplacement. Utiliser le mode source HTML, pas le texte d'un apercu de navigateur.

- Invite user : objet « Ton invitation à la bêta Furrix », contenu supabase/templates/private-beta-invite.html.
- Confirm sign up : objet « Confirme ton adresse e-mail — Furrix », contenu supabase/templates/confirm-signup.html.
- Reset password : objet « Choisis ton nouveau mot de passe — Furrix », contenu supabase/templates/reset-password.html.

Les objets sont aussi dans supabase/templates/subjects.json. Enregistrer chaque modele separement. La fusion Git ne publie PAS ces modeles sur Supabase heberge. Aucun changement config.toml ou migration n'est necessaire pour cette installation manuelle. Conserver les inscriptions desactivees et les permissions beta existantes.

## Liens a conserver

Invitation : SiteURL + /#/auth/invite?token_hash=TokenHash&type=invite. Le bouton mene a une page intermediaire : l'utilisateur accepte lui-meme l'invitation puis choisit son mot de passe. Ne pas remplacer par ConfirmationURL, car le parcours actuel utilise explicitement verifyOtp invite.
Confirmation et recuperation : ConfirmationURL generee par Supabase, sans reconstruction manuelle. Cela conserve redirectTo et le flux PKCE. Site URL attendu : https://furrix.fr ; routes de retour autorisees : https://furrix.fr/#/auth/callback et https://furrix.fr/#/auth/reset. Ne pas toucher aux URL locales, Vercel et natives existantes.

Les apercus dans outputs utilisent des liens fictifs sans jeton reel : ne pas les coller comme modeles. Copier les fichiers supabase/templates, qui contiennent les variables {{ .ConfirmationURL }}, {{ .SiteURL }} et {{ .TokenHash }}.

## Presentation et controles

Mise en page en tableaux, styles en ligne et largeur fluide plafonnee a 600 px. Palette issue des jetons Plein air ; Arial/Helvetica de secours pour les messageries, sans police ni image distante. Pre-en-tete, titre unique, bouton principal et lien de secours, textes courts, aucun delai d'expiration invente.

Le rendu navigateur ne remplace pas les moteurs Gmail, Outlook ou Apple Mail. Apres installation : demander un nouveau mail de recuperation, verifier objet/expediteur/contenu, retour vers le formulaire et reconnexion apres modification. Tester l'invitation uniquement lors de la prochaine invitation autorisee, pas en creant un nouveau compte pour cette verification. La confirmation d'inscription reste preparee, non testee en production tant que les inscriptions sont fermees.

Desactiver le suivi des clics pour les e-mails d'authentification dans le prestataire, s'il est active : la reecriture des liens peut casser les liens Supabase. Ne pas modifier le suivi global d'autres projets Brevo sans en evaluer l'effet. Ne jamais stocker de liens reels a jeton dans des captures ou dans Git.

Sources : https://supabase.com/docs/guides/auth/auth-email-templates ; https://supabase.com/docs/guides/auth/auth-smtp.

Validation de livraison : les trois fichiers ont leurs variables et liens de secours verifies. Apercus navigateur : recuperation sur ordinateur ; invitation et confirmation a 390 px sans debordement horizontal. Aucun test de reception Gmail/Outlook reel effectue avec ces nouveaux modeles.
