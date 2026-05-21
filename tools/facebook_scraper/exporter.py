"""Export des participants vers un fichier Excel compatible TmcSaga."""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from parser import Participant

logger = logging.getLogger(__name__)


def export_to_excel(participants: list[Participant], output_path: Path) -> None:
    """Génère un fichier .xlsx avec colonnes Nom et Profil."""
    if not participants:
        raise ValueError("Aucun participant à exporter.")

    rows = [
        {"Nom": p.name, "Profil": p.profile_url}
        for p in participants
    ]

    df = pd.DataFrame(rows)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    df.to_excel(
        output_path,
        sheet_name="Participants",
        index=False,
        engine="openpyxl",
    )

    logger.info("Fichier Excel exporté : %s (%d participants)", output_path, len(participants))
