# Extension Chrome — Export Commentateurs TikTok v1.1

## Mode recommandé (comme Facebook)

1. Ouvrez la publication → onglet **Commentaires**
2. Cliquez **Ajouter (commentaires visibles)**
3. **Scrollez** un peu dans le panneau commentaires (à droite)
4. Recliquez **Ajouter** → les nouveaux noms s’ajoutent à la liste
5. Répétez jusqu’à avoir ~17 commentaires (ou le total affiché par TikTok)
6. Exportez en **Excel** ou CSV

**Réinitialiser la liste** efface la mémoire si vous recommencez.

## Bouton « Tout collecter »

Défilement automatique limité au panneau commentaires (pas toute la page). À utiliser seulement si le mode « Ajouter » ne suffit pas.

## Corrections v1.1

- Fin des faux comptages (ex. 1264 / 630187613) : extraction limitée au panneau commentaires
- Déduplication correcte : un même commentaire n’est plus compté à chaque passage
- Compteur TikTok lu uniquement dans l’en-tête « 17 commentaires »

## Installation

`chrome://extensions/` → Mode développeur → Charger `TmcSaga/tools/tiktok-comments-exporter` → **Recharger** l’extension après mise à jour.

## Tirage TmcSaga

Colonne **Nom** dans l’Excel exporté (1 ligne = 1 personne).
