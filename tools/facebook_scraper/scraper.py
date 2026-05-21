"""Récupération des partages d'une publication Facebook via Selenium."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from auth import human_pause, load_config
from parser import clean_name, is_valid_profile_url

logger = logging.getLogger(__name__)

SHARES_JS = """
const keywords = ['partage', 'partages', 'partagé', 'share', 'shares', 'shared'];
const nodes = document.querySelectorAll('span, a, div[role="button"], div[role="link"]');
for (const el of nodes) {
  const t = (el.innerText || el.textContent || '').trim().toLowerCase();
  if (!t || t.length > 100) continue;
  const hasKeyword = keywords.some(k => t.includes(k));
  const hasNumber = /\\d/.test(t);
  if (hasKeyword && (hasNumber || t.includes('partage') || t.includes('share'))) {
    el.scrollIntoView({block: 'center'});
    el.click();
    return true;
  }
}
return false;
"""


def _find_first(driver: webdriver.Chrome, xpaths: list[str], timeout: int = 10):
    wait = WebDriverWait(driver, timeout)
    for xpath in xpaths:
        try:
            return wait.until(EC.presence_of_element_located((By.XPATH, xpath)))
        except TimeoutException:
            continue
    return None


def _find_clickable(driver: webdriver.Chrome, xpaths: list[str], timeout: int = 10):
    wait = WebDriverWait(driver, timeout)
    for xpath in xpaths:
        try:
            return wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
        except TimeoutException:
            continue
    return None


def _dismiss_cookies(driver: webdriver.Chrome, config: dict[str, Any]) -> None:
    selectors = config.get("selectors", {}).get("cookie_buttons", [])
    for xpath in selectors:
        try:
            buttons = driver.find_elements(By.XPATH, xpath)
            for btn in buttons:
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    human_pause(1, 2)
                    logger.info("Bannière cookies fermée.")
                    return
        except Exception:
            continue


def _scroll_page(driver: webdriver.Chrome) -> None:
    driver.execute_script("window.scrollTo(0, 400);")
    human_pause(0.5, 1)
    driver.execute_script("window.scrollTo(0, 0);")
    human_pause(0.5, 1)


def _click_via_javascript(driver: webdriver.Chrome) -> bool:
    try:
        clicked = driver.execute_script(SHARES_JS)
        if clicked:
            logger.info("Partages ouverts via recherche JavaScript.")
            human_pause(2, 3)
            return True
    except Exception as exc:
        logger.debug("JS partages échoué: %s", exc)
    return False


def _click_shares_link(driver: webdriver.Chrome, config: dict[str, Any]) -> bool:
    selectors = config.get("selectors", {})
    shares_xpaths = selectors.get("shares_link", [])
    timeouts = config.get("timeouts", {})

    element = _find_clickable(driver, shares_xpaths, timeout=timeouts.get("element_wait", 10))
    if element:
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        human_pause(0.5, 1.5)
        try:
            element.click()
        except Exception:
            driver.execute_script("arguments[0].click();", element)
        logger.info("Lien des partages cliqué (XPath).")
        return True

    # Repli : liens href shares / share
    for pattern in ("shares", "share"):
        try:
            links = driver.find_elements(By.XPATH, f"//a[contains(@href,'{pattern}')]")
            for link in links:
                if link.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", link)
                    driver.execute_script("arguments[0].click();", link)
                    logger.info("Lien partages (href=%s) cliqué.", pattern)
                    human_pause(2, 3)
                    return True
        except NoSuchElementException:
            pass

    # Repli : texte « N partages » dans un élément cliquable
    try:
        pattern = re.compile(r"\d+\s*(partage|partages|share|shares)", re.I)
        for el in driver.find_elements(By.XPATH, "//span | //a | //div[@role='button']"):
            text = (el.text or "").strip()
            if text and pattern.search(text) and el.is_displayed():
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
                driver.execute_script("arguments[0].click();", el)
                logger.info("Compteur partages cliqué : %s", text[:50])
                human_pause(2, 3)
                return True
    except Exception:
        pass

    return _click_via_javascript(driver)


def wait_manual_shares_click(seconds: int) -> None:
    logger.info(
        ">>> Dans Chrome : cliquez sur « X partages » sous la publication. "
        "Le script reprend dans %d secondes…",
        seconds,
    )
    human_pause(seconds, seconds)


def _get_modal(driver: webdriver.Chrome, config: dict[str, Any]):
    selectors = config.get("selectors", {})
    modal_xpaths = selectors.get("modal", [])
    timeouts = config.get("timeouts", {})
    modal = _find_first(driver, modal_xpaths, timeout=timeouts.get("modal_wait", 15))
    if modal:
        return modal
    # Repli : toute modale visible
    try:
        dialogs = driver.find_elements(By.XPATH, "//div[@role='dialog']")
        for d in dialogs:
            if d.is_displayed():
                return d
    except Exception:
        pass
    return None


def _get_scroll_container(driver: webdriver.Chrome, modal) -> Any:
    candidates = modal.find_elements(By.XPATH, ".//*")
    best = modal
    best_scroll = 0

    for el in candidates:
        try:
            scroll_height = driver.execute_script(
                "return arguments[0].scrollHeight - arguments[0].clientHeight;",
                el,
            )
            if scroll_height and scroll_height > best_scroll:
                best_scroll = scroll_height
                best = el
        except Exception:
            continue

    return best


def _extract_from_modal(modal, config: dict[str, Any]) -> list[dict[str, str]]:
    selectors = config.get("selectors", {})
    link_xpath = selectors.get("profile_links", [".//a[contains(@href,'facebook.com')]"])[0]

    raw: list[dict[str, str]] = []
    seen_hrefs: set[str] = set()

    links = modal.find_elements(By.XPATH, link_xpath)
    for link in links:
        try:
            href = link.get_attribute("href") or ""
            if not href or href in seen_hrefs:
                continue
            if not is_valid_profile_url(href):
                continue

            name = clean_name(link.text or link.get_attribute("aria-label") or "")
            if not name:
                try:
                    parent = link.find_element(By.XPATH, "./ancestor::div[1]")
                    name = clean_name(parent.text.split("\n")[0] if parent.text else "")
                except NoSuchElementException:
                    name = ""

            if not name:
                continue

            seen_hrefs.add(href)
            raw.append({"name": name, "profile_url": href})
        except Exception:
            continue

    return raw


def scrape_shares(
    driver: webdriver.Chrome,
    post_url: str,
    manual_wait: int = 0,
) -> list[dict[str, str]]:
    """
    Ouvre une publication Facebook, ouvre la liste des partages,
    scroll jusqu'à la fin et extrait noms + URLs.
    """
    config = load_config()
    timeouts = config.get("timeouts", {})
    scroll_cfg = config.get("scroll", {})

    pause_min = scroll_cfg.get("pause_min", 1.0)
    pause_max = scroll_cfg.get("pause_max", 3.0)
    pixel_step = scroll_cfg.get("pixel_step", 600)
    stale_rounds = timeouts.get("scroll_stale_rounds", 3)
    max_minutes = timeouts.get("max_scroll_minutes", 10)

    driver.set_page_load_timeout(timeouts.get("page_load", 30))
    logger.info("Ouverture de la publication : %s", post_url)
    driver.get(post_url)
    human_pause(3, 5)

    _dismiss_cookies(driver, config)
    _scroll_page(driver)

    shares_opened = _click_shares_link(driver, config)

    if not shares_opened and manual_wait > 0:
        wait_manual_shares_click(manual_wait)
        shares_opened = True
    elif not shares_opened:
        logger.warning("Clic auto échoué — attente manuelle 45 s…")
        wait_manual_shares_click(45)
        shares_opened = True

    if not shares_opened:
        raise RuntimeError(
            "Impossible d'ouvrir la liste des partages. "
            "Relancez avec --manual-shares 90 après connexion Facebook."
        )

    human_pause(2, 3)
    modal = _get_modal(driver, config)
    if not modal:
        raise RuntimeError(
            "Modale des partages introuvable. "
            "Cliquez bien sur le compteur « X partages » puis relancez avec --manual-shares 90."
        )

    logger.info("Modale des partages ouverte. Défilement en cours…")

    container = modal
    try:
        scrollable = _get_scroll_container(driver, modal)
        if scrollable:
            container = scrollable
    except Exception:
        pass

    all_raw: dict[str, dict[str, str]] = {}
    stale_count = 0
    start_time = time.time()
    max_seconds = max_minutes * 60

    while True:
        if time.time() - start_time > max_seconds:
            logger.warning("Timeout scroll atteint (%d min).", max_minutes)
            break

        batch = _extract_from_modal(modal, config)
        prev_count = len(all_raw)
        for item in batch:
            key = item.get("profile_url") or item.get("name", "")
            if key:
                all_raw[key] = item

        current_count = len(all_raw)
        if current_count > prev_count:
            stale_count = 0
            logger.info("%d profils collectés…", current_count)
        else:
            stale_count += 1

        if stale_count >= stale_rounds:
            logger.info("Fin de liste détectée (%d rounds sans nouveau profil).", stale_rounds)
            break

        driver.execute_script(
            "arguments[0].scrollTop = arguments[0].scrollTop + arguments[1];",
            container,
            pixel_step,
        )
        human_pause(pause_min, pause_max)

        try:
            modal = _get_modal(driver, config) or modal
        except Exception:
            pass

    result = list(all_raw.values())
    logger.info("Extraction terminée : %d entrées brutes.", len(result))
    return result
