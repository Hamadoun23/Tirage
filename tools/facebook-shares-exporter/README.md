# Extension Chrome — Export des partages Facebook

Extension légère pour **lister les partages visibles** d’une publication et les **exporter en CSV ou Excel**, sans être admin de la Page.

Fonctionne avec **votre compte Facebook** : vous voyez les mêmes partages que dans le navigateur.

## Installation (mode développeur)

1. Ouvrez Chrome → `chrome://extensions/`
2. Activez **Mode développeur** (en haut à droite)
3. Cliquez **Charger l’extension non empaquetée**
4. Sélectionnez ce dossier :  
   `TmcSaga/tools/facebook-shares-exporter`

L’icône **Export Partages Facebook** apparaît dans la barre d’outils.

## Activer l’extension en navigation privée

Si la liste « Personnes qui ont partagé ça » s’affiche **uniquement en mode privé** :

1. Ouvrez `chrome://extensions/` (fenêtre **normale**, pas privée)
2. Trouvez **Export Partages Facebook**
3. Cliquez **Détails**
4. Activez **Autoriser en navigation privée** (interrupteur bleu)
5. Rouvrez une fenêtre **Navigation privée** → Facebook → ouvrez la liste des partages
6. Cliquez l’icône de l’extension → **Collecter**

Sans cette étape, l’extension est **invisible** en mode privé.

## Utilisation

1. Connectez-vous à Facebook (compte habituel)
2. Ouvrez la publication du concours, par ex.  
   [Jeu Tabaski Toguna](https://www.facebook.com/share/p/18nh8dwj2L/)
3. Cliquez sur **« X partages »** sous le post (la fenêtre liste doit être **ouverte**)
4. Cliquez l’icône de l’extension → **Collecter les partages**
5. Attendez la fin du défilement automatique
6. **CSV** ou **Excel (.xls)** pour télécharger le fichier

### Colonnes exportées

| Nom | Profil |
|-----|--------|
| Jean Dupont | https://www.facebook.com/... |

Le CSV s’ouvre directement dans Excel. Pour le tirage TmcSaga, placez le fichier à la racine du projet sous le nom `Pronostic3.xlsx` (ou convertissez le CSV en xlsx), ou copiez la colonne **Nom**.

## Lien avec TmcSaga

```text
1. Extension → export CSV/Excel
2. Renommer / convertir en Pronostic3.xlsx (colonne Nom)
3. python -m http.server 8000 dans TmcSaga
4. http://localhost:8000
```

Ou avec un export nommé :  
`http://localhost:8000/?file=exports/votre_fichier.xlsx`

## Limites

- Seuls les partages **visibles pour vous** (confidentialité Facebook)
- La modale **« X partages »** doit être ouverte avant **Collecter**
- Si la collecte échoue : F5 sur Facebook, rouvrir la liste des partages, réessayer
- Pas besoin d’être admin de la Page

## Dépannage

| Problème | Solution |
|----------|----------|
| « Ouvrez d’abord la liste des partages » | Cliquer sur le compteur « X partages » |
| 0 participant | Faire défiler la liste à la main, puis Collecter à nouveau |
| Extension ne répond pas | Recharger la page Facebook (F5) |
| Message d’erreur connexion | Recharger Facebook puis rouvrir l’extension |

## Fichiers

| Fichier | Rôle |
|---------|------|
| `manifest.json` | Configuration extension |
| `content.js` | Extraction dans la page Facebook |
| `popup.html/js` | Interface et export |
