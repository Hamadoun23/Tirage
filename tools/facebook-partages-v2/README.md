# Export Partages FB v2

Extension Chrome **réécrite from scratch** (version **2.0.0**).

## Installation

1. `chrome://extensions/`
2. **Supprimez** toute ancienne « Export Partages Facebook » (v1.1, bouton Erreurs rouge)
3. Mode développeur → **Charger l’extension non empaquetée**
4. Dossier : `TmcSaga/tools/facebook-shares-exporter`
5. Vérifiez :
   - Titre : **Export Partages FB v2**
   - Version : **2.0.0**
   - Popup : **v2.0 — installation propre**
6. Navigation privée : **Autoriser en navigation privée**

## Utilisation

1. Ouvrez la publication Facebook
2. Clic **1,1 K** (partages) → « Personnes qui ont partagé »
3. **Défilez** la liste à la main
4. Extension → **Ajouter les profils visibles** (répéter)
5. **Excel** ou **CSV** → colonne **Nom** pour TmcSaga (`Pronostic3.xlsx`)

Pas de scroll automatique, pas de `content.js`.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `manifest.json` | Config v2 |
| `inject.js` | Script injecté à la demande |
| `popup.html/js` | Interface |

## Dépannage

| Problème | Solution |
|----------|----------|
| Encore v1.1 dans Chrome | Supprimer l’ancienne extension, recharger ce dossier |
| Message rouge F5 | Recharger extension + F5 Facebook |
| 0 profil | Liste partages ouverte + défilez + Ajouter |
