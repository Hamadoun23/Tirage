"""Configuration et création du navigateur Chrome avec profil persistant."""

from __future__ import annotations

import logging
import random
import time
from pathlib import Path
from typing import Any

import yaml
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config() -> dict[str, Any]:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def human_pause(min_sec: float = 1.0, max_sec: float = 3.0) -> None:
    time.sleep(random.uniform(min_sec, max_sec))


def create_driver(headless: bool = False) -> webdriver.Chrome:
    """Crée une instance Chrome avec profil utilisateur persistant."""
    config = load_config()
    chrome_cfg = config.get("chrome", {})

    user_data_dir = chrome_cfg.get("user_data_dir", r"C:\facebook_bot_profile")
    profile_directory = chrome_cfg.get("profile_directory", "Default")

    Path(user_data_dir).mkdir(parents=True, exist_ok=True)

    options = Options()
    options.add_argument(f"--user-data-dir={user_data_dir}")
    options.add_argument(f"--profile-directory={profile_directory}")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--start-maximized")
    options.add_argument("--lang=fr-FR")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    if headless:
        options.add_argument("--headless=new")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)

    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            """
        },
    )

    logger.info("Chrome démarré (profil: %s)", user_data_dir)
    return driver
