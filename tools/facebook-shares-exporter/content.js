/**
 * Collecte les partages — défilement long pour charger toute la liste Facebook.
 */

const IGNORED = new Set([
  'partager', 'share', 'voir plus', 'see more', "j'aime", 'like',
  'commenter', 'comment', 'nom', 'profil', 'facebook', 'partages', 'shares',
  'afficher la pièce jointe', 'show attachment', 'pièce jointe', 'attachment',
]);

const SHARE_COUNT_TEXT = /^\d[\d\s.,]*\s*[kKmM]?(?:\s*(partages?|shares?))?$/i;

const SCROLL = {
  maxRounds: 500,
  staleLimit: 15,
  pauseMs: 750,
};

function cleanName(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isIgnoredName(name) {
  if (!name || name.length < 2) return true;
  const lower = name.toLowerCase();
  if (IGNORED.has(lower)) return true;
  if (/^\d[\d\s.,kKmMhH]*$/.test(lower)) return true;
  if (/^\d+\s*[hj]$/i.test(lower)) return true;
  if (lower.includes('afficher la')) return true;
  return false;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, location.origin);
    const path = u.pathname.replace(/\/$/, '');
    const idMatch = u.search.match(/[?&]id=(\d+)/);
    if (path.includes('profile.php') && idMatch) return `profile:${idMatch[1]}`;
    const parts = path.split('/').filter(Boolean);
    if (parts.length) return parts[0] === 'people' ? `people:${parts.slice(0, 2).join('/')}` : parts[0];
    return url.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isProfileLink(href) {
  if (!href) return false;
  if (!href.includes('facebook.com') && !href.startsWith('/')) return false;
  const full = href.startsWith('/') ? `https://www.facebook.com${href}` : href;
  const blocked = ['/shares', '/posts', '/photo', '/photos', '/watch', '/reel', '/events', '/groups/', 'l.facebook.com', '/plugins/'];
  return !blocked.some((b) => full.includes(b));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function reportProgress(count, round) {
  try {
    chrome.runtime.sendMessage({ action: 'collectProgress', count, round });
  } catch {
    /* popup fermé */
  }
}

function isPostDialog(dialog) {
  const t = (dialog.innerText || '').toLowerCase();
  return (
    t.includes('commenter en tant') ||
    t.includes('publication de') ||
    (t.includes('commentaire') && t.includes('partage') && !t.includes('personnes qui ont partagé'))
  );
}

function isSharesListDialog(dialog) {
  const t = dialog.innerText || '';
  const lower = t.toLowerCase();
  if (isPostDialog(dialog)) return false;

  const firstLine = t.split('\n')[0]?.trim().toLowerCase() || '';
  if (
    firstLine.includes('personnes qui ont partagé') ||
    firstLine.includes('people who shared') ||
    firstLine === 'partages' ||
    firstLine === 'shares'
  ) {
    return true;
  }

  const profileLinks = [...dialog.querySelectorAll('a[href*="facebook.com"], a[href^="/"]')].filter(
    (a) => isProfileLink(a.getAttribute('href') || a.href || ''),
  ).length;

  return profileLinks >= 2;
}

function findPostDialog() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.offsetParent !== null);
  return dialogs.find(isPostDialog) || dialogs[0] || null;
}

function findSharesModal() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.offsetParent !== null);
  return dialogs.find(isSharesListDialog) || null;
}

function getClickable(el) {
  return el.closest('a, [role="button"], [role="link"], [tabindex="0"]') || el;
}

function looksLikeShareCount(text) {
  const t = cleanName(text);
  if (!t || t.length > 25) return false;
  return SHARE_COUNT_TEXT.test(t) || /^\d[\d\s.,]+\s*[kKmM]$/i.test(t);
}

async function tryOpenSharesList() {
  const postDialog = findPostDialog() || document.body;
  const shareLinks = postDialog.querySelectorAll(
    'a[href*="shares"], a[href*="/share/"], a[aria-label*="partage" i], a[aria-label*="share" i]',
  );
  for (const link of shareLinks) {
    if (!link.offsetParent) continue;
    const label = (link.getAttribute('aria-label') || link.innerText || '').toLowerCase();
    if (label.includes('partager') && !label.includes('partage') && !/\d/.test(label)) continue;
    link.click();
    await sleep(2000);
    if (findSharesModal()) return { ok: true, method: 'lien' };
  }

  const nodes = postDialog.querySelectorAll('span, a, div[role="button"], div[role="link"]');
  for (const el of nodes) {
    const text = cleanName(el.innerText || el.getAttribute('aria-label') || '');
    if (!looksLikeShareCount(text)) continue;
    const clickable = getClickable(el);
    clickable.scrollIntoView({ block: 'center', behavior: 'instant' });
    clickable.click();
    await sleep(2000);
    if (findSharesModal()) return { ok: true, method: 'compteur', text };
  }
  return { ok: false };
}

function getScrollable(modal) {
  const candidates = [];

  const visit = (el) => {
    try {
      const style = window.getComputedStyle(el);
      const canScroll = el.scrollHeight - el.clientHeight > 80;
      if (canScroll && (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto')) {
        candidates.push({ el, score: el.scrollHeight - el.clientHeight });
      }
    } catch {
      /* ignore */
    }
    for (const child of el.children) visit(child);
  };

  visit(modal);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.el || modal;
}

function extractNameFromRow(link) {
  let name = cleanName(link.getAttribute('aria-label') || '');
  if (name && !isIgnoredName(name)) return name;

  name = cleanName(link.innerText || '');
  if (name && !isIgnoredName(name)) return name;

  const row = link.closest('[role="listitem"], [data-visualcompletion], li, div');
  if (!row) return '';

  const lines = (row.innerText || '').split('\n').map(cleanName).filter(Boolean);
  for (const line of lines) {
    if (!isIgnoredName(line) && line.length > 2 && line.length < 80) return line;
  }
  return '';
}

function extractFromModal(modal) {
  const items = [];
  const seen = new Set();
  const links = modal.querySelectorAll('a[href*="facebook.com"], a[href^="/"]');

  for (const link of links) {
    const href = link.href || (link.getAttribute('href')?.startsWith('/') ? `https://www.facebook.com${link.getAttribute('href')}` : '');
    if (!isProfileLink(href)) continue;

    const key = normalizeUrl(href);
    if (seen.has(key)) continue;

    const name = extractNameFromRow(link);
    if (!name) continue;

    seen.add(key);
    items.push({ name, profile: href });
  }
  return items;
}

async function scrollSharesList(scrollable, modal) {
  const last = modal.querySelector('[role="listitem"]:last-child, a[href*="facebook.com"]:last-of-type');
  if (last) {
    last.scrollIntoView({ block: 'end', behavior: 'instant' });
  }
  scrollable.scrollTop = scrollable.scrollHeight;
  scrollable.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200, bubbles: true, cancelable: true }));
}

async function collectShares() {
  let modal = findSharesModal();

  if (!modal) {
    const opened = await tryOpenSharesList();
    await sleep(1000);
    modal = findSharesModal();
    if (!modal) {
      return {
        ok: false,
        error: opened.ok
          ? 'Liste non détectée. Ouvrez « Personnes qui ont partagé », puis Collecter.'
          : 'Ouvrez la liste des partages (1,1 K), puis Collecter.',
        participants: [],
      };
    }
  }

  const scrollable = getScrollable(modal);
  const byKey = new Map();
  let stale = 0;
  let lastScrollHeight = 0;
  let lastCount = 0;

  reportProgress(0, 0);

  for (let round = 0; round < SCROLL.maxRounds; round++) {
    const batch = extractFromModal(modal);
    const before = byKey.size;

    for (const p of batch) {
      const key = normalizeUrl(p.profile) || p.name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, p);
    }

    const count = byKey.size;
    if (count > before) {
      stale = 0;
      reportProgress(count, round);
    } else {
      stale += 1;
    }

    const sh = scrollable.scrollHeight;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= sh - 30;

    if (sh > lastScrollHeight) {
      stale = Math.max(0, stale - 2);
      lastScrollHeight = sh;
    }

    if (stale >= SCROLL.staleLimit && atBottom) break;
    if (count === lastCount && stale >= 8 && atBottom) break;

    lastCount = count;
    await scrollSharesList(scrollable, modal);
    await sleep(SCROLL.pauseMs);

    modal = findSharesModal() || modal;
    const newScrollable = getScrollable(modal);
    if (newScrollable) scrollable = newScrollable;
  }

  const participants = Array.from(byKey.values());

  if (!participants.length) {
    return {
      ok: false,
      error: 'Aucun nom trouvé. Gardez la fenêtre « Personnes qui ont partagé » ouverte.',
      participants: [],
    };
  }

  return {
    ok: true,
    participants,
    count: participants.length,
    note: participants.length < 50
      ? 'Si le total est bien plus élevé (ex. 1,1 K), faites défiler la liste à la main pendant la collecte, ou relancez Collecter.'
      : undefined,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'collectShares') {
    collectShares().then(sendResponse);
    return true;
  }
  if (msg.action === 'openSharesList') {
    tryOpenSharesList().then(sendResponse);
    return true;
  }
  return false;
});
