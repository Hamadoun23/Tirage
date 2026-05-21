#!/usr/bin/env python3
"""CLI — Récupération des partages Facebook et export Excel pour TmcSaga."""

from __future__ import annotations

import argparse
import logging
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

from auth import create_driver, human_pause
from exporter import export_to_excel
from parser import deduplicate_participants
from scraper import scrape_shares

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
EXPORTS_DIR = PROJECT_ROOT / "exports"
LEGACY_OUTPUT = PROJECT_ROOT / "Pronostic3.xlsx"


def output_path_from_url(url: str) -> Path:
    """Génère un fichier Excel unique par publication (dossier exports/)."""
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

    patterns = [
        r"/share/p/([^/?]+)",
        r"/posts/(\d+)",
        r"/permalink/(\d+)",
        r"story_fbid=(\d+)",
        r"fbid=(\d+)",
    ]
    slug = None
    for pattern in patterns:
        match = re.search(pattern, url, re.IGNORECASE)
        if match:
            slug = match.group(1)
            break

    if not slug:
        slug = datetime.now().strftime("%Y%m%d_%H%M%S")

    return EXPORTS_DIR / f"participants_{slug}.xlsx"


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Récupère les personnes ayant partagé une publication Facebook "
        "et génère un fichier Excel pour le tirage TmcSaga.",
    )
    parser.add_argument(
        "--url",
        required=True,
        help="URL de la publication Facebook (Page)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Chemin Excel personnalisé (défaut: exports/participants_<id>.xlsx)",
    )
    parser.add_argument(
        "--sync-pronostic",
        action="store_true",
        help="Copie aussi vers Pronostic3.xlsx pour le tirage sans paramètre URL",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Lancer Chrome en mode headless (déconseillé pour la connexion)",
    )
    parser.add_argument(
        "--login-wait",
        type=int,
        default=0,
        help="Secondes d'attente pour connexion manuelle (ex: 120 au premier lancement)",
    )
    parser.add_argument(
        "--manual-shares",
        type=int,
        default=0,
        metavar="SECONDES",
        help="Temps pour cliquer vous-même sur « X partages » (ex: 60)",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Logs détaillés",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)
    log = logging.getLogger(__name__)

    post_url = args.url.strip()
    if "facebook.com" not in post_url:
        log.error("L'URL doit être une adresse facebook.com valide.")
        return 1

    output_path = args.output or output_path_from_url(post_url)
    log.info("Fichier de sortie : %s", output_path)

    driver = None
    try:
        driver = create_driver(headless=args.headless)

        if args.login_wait > 0:
            log.info(
                "Connectez-vous à Facebook dans la fenêtre Chrome (%d s)…",
                args.login_wait,
            )
            driver.get("https://www.facebook.com")
            human_pause(args.login_wait, args.login_wait)

        raw = scrape_shares(driver, post_url, manual_wait=args.manual_shares)
        participants = deduplicate_participants(raw)

        if not participants:
            log.error(
                "Aucun participant trouvé. Vérifiez l'URL, les droits admin de la Page "
                "et que la liste des partages est accessible."
            )
            return 1

        export_to_excel(participants, output_path)

        if args.sync_pronostic:
            shutil.copy2(output_path, LEGACY_OUTPUT)
            log.info("Copie vers %s", LEGACY_OUTPUT)

        latest_file = PROJECT_ROOT / "exports" / "latest.txt"
        latest_file.write_text(
            f"{output_path.relative_to(PROJECT_ROOT).as_posix()}\n",
            encoding="utf-8",
        )

        rel = output_path.relative_to(PROJECT_ROOT).as_posix()
        log.info("Terminé : %d participants → %s", len(participants), output_path)
        log.info(
            "Tirage : http://localhost:8000/?file=%s",
            rel,
        )
        return 0

    except KeyboardInterrupt:
        log.warning("Interruption utilisateur.")
        return 130
    except Exception as exc:
        log.error("Erreur : %s", exc, exc_info=args.verbose)
        return 1
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
