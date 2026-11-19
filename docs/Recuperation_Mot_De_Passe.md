# Retour de recuperation du mot de passe

Les nouveaux e-mails web demandent un retour vers https://furrix.fr/#/auth/reset pour conserver le formulaire, meme si une session existe deja. La route callback generique pouvait afficher directement l'accueil sans que l'evenement PASSWORD_RECOVERY soit reconnu par l'interface.

Avant recette : ajouter https://furrix.fr/#/auth/reset dans Authentication > URL Configuration > Redirect URLs sur Supabase. Conserver les autres URL autorisees. Les URL locales et de preview utilisees pour ces tests doivent aussi autoriser leur route /#/auth/reset. Les liens natifs sont inchanges.

Apres publication : demander un NOUVEAU lien sur furrix.fr, l'ouvrir sur le meme navigateur, choisir le mot de passe puis verifier la reconnexion. Les anciens e-mails conservent leur ancienne destination. Aucun changement SQL ou SMTP necessaire.
