# Extension Chrome — Export Commentateurs FB v2

Exporte **une ligne par personne** qui a commenté :

| Colonne | Description |
|---------|-------------|
| **Nom** | Dérivé de l’URL du profil (pas du texte du commentaire) |
| **ID_utilisateur** | `id=123456` ou slug `prenom.nom` |
| **Profil** | Lien Facebook |
| **Nb_commentaires** | Nombre de commentaires de cette personne sur la publication |

## Installation (obligatoire v2)

1. `chrome://extensions/`
2. **Supprimez** toute ancienne extension « Export commentaires » (v1.x)
3. **Mode développeur** → **Charger l’extension non empaquetée**
4. Dossier : `TmcSaga/tools/facebook-comments-exporter`
5. Vérifiez le titre : **« Export Commentaires FB v2 »** — version **2.0.0**
6. **Autoriser en navigation privée** si besoin

Si la popup affiche encore l’ancien message *« Aucun commentaire trouvé. Ouvrez la publication… »* sans **[v2.0]**, vous utilisez encore l’ancienne extension.

## Utilisation

1. Ouvrez la **publication** (URL avec `/posts/…`)
2. Descendez jusqu’aux **commentaires visibles**
3. **Plus pertinents** → **Tous les commentaires**
4. Extension → **Collecter** (plusieurs minutes si ~195 commentaires)
5. **CSV** ou **Excel**

Les messages d’erreur commencent par **`[v2.0.0]`** et indiquent combien de profils Facebook ont été détectés.

## Tirage TmcSaga

Renommez le fichier exporté en `Pronostic3.xlsx` ou utilisez `?file=...` — la colonne **Nom** suffit (1 ligne = 1 participant au tirage).

Si une personne a commenté 3 fois, elle n’apparaît qu’**une fois** dans l’Excel ; la colonne **Nb_commentaires** indique 3.
