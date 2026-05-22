# TmcSaga — Tirage au sort Fanzon TMC

Application web statique pour désigner un gagnant parmi les participants ayant pronostiqué correctement le score d’un match, dans le cadre de l’événement **Fanzon TMC** (fan zone TMC).

## But du projet

Cette page permet d’effectuer un **tirage au sort** en direct : elle charge une liste de noms depuis un fichier Excel, affiche le nombre de participants, permet de consulter la liste, puis tire **un gagnant au hasard** avec une mise en scène (suspense, confettis, son).

Le contexte affiché dans l’interface (dans `index.html`) est actuellement :

- **Match** : Mali - Sénégal
- **Score retenu** : 0 - 1
- Seuls les participants avec le **bon pronostic** sont supposés figurer dans le fichier Excel

Le filtrage des bons pronostics est fait **en amont** dans Excel ; l’application ne recalcule pas les scores.

## Structure du projet

```
TmcSaga/
├── index.html      # Interface utilisateur
├── style.css       # Styles et animations
├── script.js       # Logique (Excel, tirage, effets)
├── Pronostic3.xlsx # Liste des participants (à fournir ou généré)
├── tools/
│   └── facebook_scraper/   # Récupération auto des partages Facebook
└── logo/
    ├── Tmclogo.png
    └── toglogo.jpg
```

| Fichier | Rôle |
|---------|------|
| `index.html` | Structure de la page, textes match, boutons, zones liste/gagnant |
| `style.css` | Charte TMC (bleu `#0a57a4`, vert `#068953`), responsive |
| `script.js` | Chargement Excel, extraction des noms, tirage, confettis, son |
| CDN SheetJS | Lecture des fichiers `.xlsx` |

## Architecture

Application **100 % front-end** : pas de backend, pas de build, pas de framework.

```
Navigateur
  ├── index.html + style.css
  ├── script.js
  │     ├── fetch → Pronostic3.xlsx
  │     ├── SheetJS (CDN) → parsing Excel
  │     ├── Canvas → confettis
  │     └── Web Audio API → son de célébration
  └── Assets locaux : logo/, Pronostic3.xlsx
```

### Flux principal

1. Ouverture de la page via un **serveur HTTP local** (obligatoire pour `fetch`).
2. Au chargement : lecture de `Pronostic3.xlsx`, première feuille convertie en tableau 2D.
3. `extractCandidates()` parcourt toutes les cellules non vides, déduplique les noms.
4. Affichage du compteur ; activation des boutons « Voir la liste » et « Lancer le tirage ».
5. Tirage : sélection aléatoire immédiate, overlay de suspense 5 secondes, puis affichage du gagnant avec confettis et son.

### Extraction Excel

La fonction `extractCandidates()` collecte **toute cellule non vide** (texte ou nombre) sur la première feuille. Il n’y a pas de colonne « nom » dédiée : évitez d’y laisser des en-têtes ou libellés remplis, sinon ils peuvent entrer dans le tirage.

## Lancement en local

`fetch` ne fonctionne pas si vous ouvrez `index.html` en double-clic (`file://`). Utilisez un serveur local :

```bash
cd TmcSaga
python -m http.server 8000
```

Puis ouvrez : `http://localhost:8000`

Assurez-vous que `Pronostic3.xlsx` est dans le même dossier que `index.html`.

## Préparer la liste depuis Facebook

### Extensions Chrome (sans être admin)

| Extension | Dossier | Exporte |
|-----------|---------|---------|
| **Partages** | [facebook-shares-exporter](tools/facebook-shares-exporter/README.md) | Noms des personnes qui ont partagé |
| **Commentaires** | [facebook-comments-exporter](tools/facebook-comments-exporter/README.md) | Nom + texte de chaque commentaire |

Installation : `chrome://extensions/` → mode développeur → charger le dossier de l’extension.

Pour les **partages** : ouvrir « Personnes qui ont partagé » puis **Collecter**.  
Pour les **commentaires** : ouvrir la publication (zone commentaires visible) puis **Collecter**.

### Alternative — script Python (compte admin Page)

```bash
cd tools/facebook_scraper
python main.py --url "https://www.facebook.com/..." --manual-shares 90
```

Voir [tools/facebook_scraper/README.md](tools/facebook_scraper/README.md).

## Fonctionnalités

- Compteur de participants
- Liste des participants (grille)
- Tirage aléatoire avec compte à rebours et overlay
- Confettis (canvas, ~10 s)
- Son de célébration synthétisé (Web Audio API)

## Limites connues

- Texte du match et score **codés en dur** dans `index.html` (nouveau match = édition manuelle + nouveau Excel).
- Extraction Excel **globale** (toutes les cellules) : risque d’inclure des valeurs parasites.
- Tirage via `Math.random()` : adapté à un jeu fan, pas à un audit formel.
- Pas d’historique ni d’exclusion des gagnants déjà tirés.
- La fonction `isMobileDevice()` est définie mais non utilisée dans le flux actuel.

## Dépendances externes

- [SheetJS](https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js) (chargé depuis le CDN dans `index.html`)

## Résumé

**TmcSaga** est un tirage au sort événementiel pour la fan zone TMC : lecture d’une liste depuis Excel, tirage d’un nom au hasard avec effets visuels et sonores, le tout en JavaScript vanilla sans serveur applicatif.
