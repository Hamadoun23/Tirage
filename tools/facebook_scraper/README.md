# Récupération automatique des partages Facebook

Outil en ligne de commande pour extraire la liste des personnes ayant partagé une publication de **Page Facebook**, puis générer un fichier Excel compatible avec le tirage [TmcSaga](../../README.md).

## Prérequis

- **Windows** avec Google Chrome installé
- **Python 3.10+**
- Compte Facebook ayant les droits **admin** sur la Page TMC
- URL de la publication concernée

## Installation

```bash
cd tools/facebook_scraper
pip install -r requirements.txt
```

## Premier lancement (connexion Facebook)

Au premier usage, connectez-vous manuellement une fois. Le profil Chrome est sauvegardé dans `C:\facebook_bot_profile` (modifiable dans `config.yaml`).

```bash
python main.py --url "https://www.facebook.com/VOTRE_PAGE/posts/XXXX" --login-wait 120
```

1. Chrome s’ouvre sur facebook.com
2. Connectez-vous au compte admin de la Page
3. Après la pause, le script ouvre la publication et récupère les partages

Les lancements suivants n’ont en général plus besoin de `--login-wait`.

## Utilisation normale

```bash
python main.py --url "https://www.facebook.com/VOTRE_PAGE/posts/XXXX" --output "../../Pronostic3.xlsx"
```

### Options

| Option | Description |
|--------|-------------|
| `--url` | URL de la publication (obligatoire) |
| `--output` | Fichier Excel de sortie (défaut : `Pronostic3.xlsx` à la racine TmcSaga) |
| `--login-wait N` | Attente en secondes pour connexion manuelle |
| `--headless` | Chrome sans fenêtre (déconseillé) |
| `-v` | Logs détaillés |

## Lancer le tirage TmcSaga

```bash
cd ../..
python -m http.server 8000
```

Ouvrez `http://localhost:8000` — le site charge automatiquement `Pronostic3.xlsx`.

## Format Excel généré

| Nom | Profil |
|-----|--------|
| Jean Dupont | https://www.facebook.com/jean.dupont |

- Feuille : `Participants`
- Seule la colonne **Nom** est utilisée par le tirage (la colonne Profil sert à vérifier les doublons)
- Les en-têtes `Nom` / `Profil` sont exclus automatiquement du tirage

## Dépannage

### Bouton « partages » introuvable

Facebook change souvent son interface. Éditez les sélecteurs XPath dans [`config.yaml`](config.yaml) section `selectors.shares_link`.

### Captcha ou vérification de sécurité

- Relancez **sans** `--headless`
- Utilisez `--login-wait 180` pour vous connecter tranquillement
- Évitez de lancer le script trop souvent d’affilée

### Liste incomplète

- Seuls les partages **visibles** pour votre compte admin sont récupérés
- Augmentez `timeouts.max_scroll_minutes` dans `config.yaml` pour les publications avec beaucoup de partages

### Aucun participant

- Vérifiez que vous êtes connecté au bon compte
- Ouvrez l’URL de la publication manuellement et confirmez que « X partages » est cliquable

## Limites

- Automatisation soumise aux conditions d’utilisation de Facebook
- Interface Facebook variable : maintenance des sélecteurs possible
- Pas d’accès aux partages masqués par la confidentialité des utilisateurs

## Structure des modules

| Fichier | Rôle |
|---------|------|
| `main.py` | Point d’entrée CLI |
| `auth.py` | Chrome + profil persistant |
| `scraper.py` | Navigation, scroll, extraction |
| `parser.py` | Nettoyage et dédoublonnage |
| `exporter.py` | Export `.xlsx` |
| `config.yaml` | Sélecteurs et timeouts |
