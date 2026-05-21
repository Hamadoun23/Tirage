"""Nettoyage, normalisation et dédoublonnage des participants."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse, urlunparse

from auth import load_config


@dataclass
class Participant:
    name: str
    profile_url: str


def _get_ignore_names() -> set[str]:
    config = load_config()
    return {n.lower() for n in config.get("ignore_names", [])}


def normalize_profile_url(url: str) -> str:
    """Normalise une URL de profil Facebook pour la déduplication."""
    if not url:
        return ""

    url = url.strip()
    if url.startswith("/"):
        url = "https://www.facebook.com" + url

    if "facebook.com" not in url and "fb.com" not in url:
        return url.lower()

    parsed = urlparse(url)
    path = parsed.path.rstrip("/")

    # profile.php?id=123
    if "profile.php" in path:
        match = re.search(r"id=(\d+)", parsed.query)
        if match:
            return f"facebook.com/profile/{match.group(1)}"

    # /people/Name/123456/
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[0] in ("people", "profile"):
        return f"facebook.com/{'/'.join(parts[:3])}".lower()

    if parts:
        return f"facebook.com/{parts[0]}".lower()

    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", "")).lower()


def is_valid_profile_url(url: str) -> bool:
    if not url or "facebook.com" not in url:
        return False

    lowered = url.lower()
    blocked = (
        "/shares",
        "/posts",
        "/photo",
        "/photos",
        "/watch",
        "/reel",
        "/events",
        "/groups/",
        "l.facebook.com",
        "lm.facebook.com",
    )
    return not any(b in lowered for b in blocked)


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    return name


def is_ignored_name(name: str) -> bool:
    if not name:
        return True
    lower = name.lower().strip()
    if lower in _get_ignore_names():
        return True
    if len(lower) < 2:
        return True
    if lower.isdigit():
        return True
    return False


def deduplicate_participants(raw: list[dict[str, str]]) -> list[Participant]:
    """
    Déduplique par URL de profil (prioritaire) puis par nom.
    raw: liste de dicts avec clés 'name' et 'profile_url'
    """
    seen_urls: set[str] = set()
    seen_names: set[str] = set()
    result: list[Participant] = []

    for item in raw:
        name = clean_name(item.get("name", ""))
        profile_url = item.get("profile_url", "").strip()

        if is_ignored_name(name):
            continue
        if profile_url and not is_valid_profile_url(profile_url):
            continue

        url_key = normalize_profile_url(profile_url) if profile_url else ""
        name_key = name.lower()

        if url_key:
            if url_key in seen_urls:
                continue
            seen_urls.add(url_key)
        elif name_key in seen_names:
            continue

        seen_names.add(name_key)
        result.append(Participant(name=name, profile_url=profile_url))

    return result
