/**
 * Export Partages Facebook v2 — mode manuel uniquement.
 * Pas de content.js, pas de scroll automatique.
 */
(function () {
  'use strict';

  const VERSION = '2.0.0';

  const IGNORED = new Set([
    'partager', 'share', 'voir plus', 'see more', "j'aime", 'like', 'commenter', 'comment',
    'nom', 'profil', 'facebook', 'partages', 'shares', 'afficher la pièce jointe',
    'personnes qui ont partagé', 'people who shared',
  ]);

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function fullUrl(href) {
    if (!href) return '';
    return href.startsWith('/') ? `https://www.facebook.com${href}` : href;
  }

  function isProfileLink(href) {
    if (!href) return false;
    const url = fullUrl(href);
    if (!url.includes('facebook.com') && !href.startsWith('/')) return false;
    const blocked = ['/shares', '/posts', '/photo', '/photos/', '/watch', '/reel/', '/groups/', 'l.facebook.com'];
    if (blocked.some((b) => url.toLowerCase().includes(b))) return false;
    try {
      const u = new URL(url);
      if (u.pathname.includes('profile.php')) return /[?&]id=\d+/.test(u.search);
      const slug = u.pathname.split('/').filter(Boolean)[0];
      if (!slug) return false;
      const sys = ['people', 'pages', 'groups', 'watch', 'reel', 'gaming', 'marketplace', 'hashtag', 'stories', 'login'];
      return !sys.includes(slug.toLowerCase()) && slug.length > 1;
    } catch {
      return false;
    }
  }

  function profileKey(href) {
    try {
      const u = new URL(fullUrl(href));
      const id = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && id) return `id:${id[1]}`;
      const slug = u.pathname.split('/').filter(Boolean)[0];
      return slug ? slug.toLowerCase() : fullUrl(href);
    } catch {
      return fullUrl(href);
    }
  }

  function cleanProfileUrl(href) {
    try {
      const u = new URL(fullUrl(href));
      const id = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && id) {
        return `https://www.facebook.com/profile.php?id=${id[1]}`;
      }
      u.search = '';
      u.hash = '';
      return (u.origin + u.pathname).replace(/\/$/, '');
    } catch {
      return fullUrl(href).split('?')[0];
    }
  }

  function nameFromUrl(href) {
    try {
      const u = new URL(fullUrl(href));
      const id = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && id) return `Utilisateur ${id[1]}`;
      const slug = u.pathname.split('/').filter(Boolean)[0];
      if (!slug) return '';
      const words = slug
        .replace(/\.\d+$/, '')
        .replace(/[._-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w && !/^\d+$/.test(w));
      if (!words.length) return slug;
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    } catch {
      return '';
    }
  }

  function isIgnoredName(name) {
    if (!name || name.length < 2) return true;
    const lower = clean(name).toLowerCase();
    return IGNORED.has(lower) || /^\d[\d\s.,kKmM]*$/.test(lower) || /^\d+\s*[hj]$/i.test(lower);
  }

  function nameForLink(link) {
    const href = fullUrl(link.href || link.getAttribute('href') || '');
    let name = nameFromUrl(href);
    if (name && !isIgnoredName(name)) return name;

    name = clean(link.getAttribute('aria-label') || link.innerText || '');
    if (name && !isIgnoredName(name)) return name;

    const row = link.closest('[role="listitem"], [role="row"]');
    if (row) {
      for (const line of (row.innerText || '').split('\n').map(clean).filter(Boolean)) {
        if (!isIgnoredName(line) && line.length > 2 && line.length < 80) return line;
      }
    }
    return nameFromUrl(href);
  }

  function storageKey() {
    return `fb_partages_v2_${location.pathname.slice(-80)}`;
  }

  function loadSaved() {
    return new Promise((resolve) => {
      chrome.storage.local.get(storageKey(), (data) => resolve(data[storageKey()] || []));
    });
  }

  function saveSaved(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [storageKey()]: list }, resolve);
    });
  }

  function findSharesModal() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 100 && r.height > 100 && d.offsetParent !== null;
    });

    for (const d of dialogs) {
      const t = (d.innerText || '').toLowerCase();
      if (t.includes('personnes qui ont partagé') || t.includes('people who shared')) {
        return d;
      }
    }

    let best = null;
    let bestScore = 0;
    for (const d of dialogs) {
      const items = d.querySelectorAll('[role="listitem"]').length;
      const profiles = [...d.querySelectorAll('a')].filter((a) =>
        isProfileLink(a.href || a.getAttribute('href') || ''),
      ).length;
      const score = items * 10 + profiles;
      if (score > bestScore && profiles >= 2) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  function extractVisible(modal) {
    const seen = new Set();
    const out = [];

    const add = (href, name) => {
      if (!href || !name || isIgnoredName(name)) return;
      const key = profileKey(href);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        name,
        profile: cleanProfileUrl(href),
        userId: key.replace(/^id:/, ''),
      });
    };

    for (const item of modal.querySelectorAll('[role="listitem"], [role="row"]')) {
      for (const link of item.querySelectorAll('a[href*="facebook.com"], a[href^="/"]')) {
        const href = fullUrl(link.href || link.getAttribute('href') || '');
        if (!isProfileLink(href)) continue;
        add(href, nameForLink(link));
        break;
      }
    }

    for (const link of modal.querySelectorAll('a[href*="facebook.com"], a[href^="/"]')) {
      const href = fullUrl(link.href || link.getAttribute('href') || '');
      if (!isProfileLink(href)) continue;
      add(href, nameForLink(link));
    }

    return out;
  }

  async function openSharesList() {
    const root = document.querySelector('[role="main"]') || document.body;

    for (const link of root.querySelectorAll('a[href*="shares"], a[href*="/share/"]')) {
      if (!link.offsetParent) continue;
      link.click();
      await sleep(2000);
      if (findSharesModal()) return { ok: true, method: 'lien' };
    }

    for (const el of root.querySelectorAll('span, a, [role="button"]')) {
      const t = clean(el.innerText || el.getAttribute('aria-label') || '');
      if (!/^\d[\d\s.,]*\s*[kKmM]?$/i.test(t) || t.length > 20) continue;
      (el.closest('a, [role="button"]') || el).click();
      await sleep(2000);
      if (findSharesModal()) return { ok: true, method: 'compteur', text: t };
    }

    return { ok: false };
  }

  async function addVisibleProfiles() {
    const modal = findSharesModal();
    if (!modal) {
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] Ouvrez « Personnes qui ont partagé » (clic sur 1,1 K), puis Ajouter.`,
        participants: [],
      };
    }

    const batch = extractVisible(modal);
    const saved = await loadSaved();
    const map = new Map();
    for (const p of saved) map.set(profileKey(p.profile), p);

    let added = 0;
    for (const p of batch) {
      const k = profileKey(p.profile);
      if (!map.has(k)) added += 1;
      map.set(k, p);
    }

    const participants = [...map.values()];
    await saveSaved(participants);

    if (!participants.length && !batch.length) {
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] Aucun profil visible. Défilez la liste, puis Ajouter.`,
        participants: [],
      };
    }

    return {
      ok: true,
      version: VERSION,
      participants,
      count: participants.length,
      addedThisScan: added,
      visibleNow: batch.length,
      note: `+${added} ajouté(s). Total ${participants.length}. Défilez, recliquez Ajouter, puis Excel.`,
    };
  }

  function resetList() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(storageKey(), () => resolve({ ok: true, version: VERSION }));
    });
  }

  globalThis.__FB_PARTAGES_V2 = {
    version: VERSION,
    openSharesList,
    addVisibleProfiles,
    resetList,
  };
})();
