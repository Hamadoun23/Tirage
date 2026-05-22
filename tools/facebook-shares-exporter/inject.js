/**
 * Export Partages Facebook v2 — mode manuel.
 */
(function () {
  'use strict';

  const VERSION = '2.0.3';

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

  function decodeSafe(s) {
    try {
      return decodeURIComponent(String(s).replace(/\+/g, ' '));
    } catch {
      return String(s);
    }
  }

  function fullUrl(href) {
    if (!href) return '';
    return href.startsWith('/') ? `https://www.facebook.com${href}` : href;
  }

  function slugToDisplayName(slug) {
    const s = decodeSafe(slug);
    const words = s
      .replace(/\.\d+$/, '')
      .replace(/[._-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !/^\d+$/.test(w) && !/^pfbid/i.test(w));
    if (!words.length) return '';
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  function parseProfilePath(href) {
    try {
      const u = new URL(fullUrl(href));
      const rawParts = u.pathname.split('/').filter(Boolean);
      const pathLower = u.pathname.toLowerCase();

      if (pathLower.includes('/posts/') || pathLower.includes('/shares/')) return null;

      const idQ = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && idQ) {
        return {
          userId: idQ[1],
          name: `Utilisateur ${idQ[1]}`,
          profile: `https://www.facebook.com/profile.php?id=${idQ[1]}`,
        };
      }

      if (rawParts[0] === 'people') {
        if (rawParts.length < 2 || /^pfbid/i.test(rawParts[1])) return null;

        const urlSlug = rawParts[1];
        const displayName = slugToDisplayName(urlSlug);
        if (!displayName) return null;

        const numericId = rawParts.find((p, i) => i >= 2 && /^\d{5,}$/.test(p));
        const pfbidId = rawParts.find((p, i) => i >= 2 && /^pfbid/i.test(p));

        if (numericId) {
          return {
            userId: numericId,
            name: displayName,
            profile: `https://www.facebook.com/people/${urlSlug}/${numericId}/`,
          };
        }

        if (pfbidId) {
          return {
            userId: pfbidId,
            name: displayName,
            profile: `https://www.facebook.com/people/${urlSlug}/`,
          };
        }

        if (rawParts.length === 2) {
          return {
            userId: urlSlug,
            name: displayName,
            profile: `https://www.facebook.com/people/${urlSlug}/`,
          };
        }

        return {
          userId: pfbidId || urlSlug,
          name: displayName,
          profile: `https://www.facebook.com/people/${urlSlug}/`,
        };
      }

      const slug = rawParts[0];
      const sys = ['pages', 'groups', 'watch', 'reel', 'gaming', 'marketplace', 'hashtag', 'stories', 'login', 'people'];
      if (!sys.includes(slug.toLowerCase()) && slug.length > 1 && !/^pfbid/i.test(slug)) {
        const name = slugToDisplayName(slug);
        if (!name) return null;
        return {
          userId: slug,
          name,
          profile: `https://www.facebook.com/${slug}`,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function isProfileLink(href) {
    if (!href) return false;
    const url = fullUrl(href);
    if (!url.includes('facebook.com') && !href.startsWith('/')) return false;
    const blocked = ['/shares', '/photo', '/photos/', '/watch', '/reel/', '/groups/', 'l.facebook.com', '/posts/'];
    if (blocked.some((b) => url.toLowerCase().includes(b))) return false;
    return parseProfilePath(href) !== null;
  }

  function profileKey(parsed) {
    return `id:${parsed.userId}`;
  }

  function isIgnoredName(name, fromUrl = false) {
    if (!name || name.length < 2 || name.length > 80) return true;
    const lower = clean(name).toLowerCase();
    if (IGNORED.has(lower)) return true;
    if (!fromUrl && /%[0-9a-f]{2}/i.test(name)) return true;
    if (/pfbid|facebook\.com|https?:\/\//i.test(name)) return true;
    if (/[/\\]/.test(name)) return true;
    if (/^\d[\d\s.,kKmM]*$/.test(lower)) return true;
    if (/^\d+\s*[hj]$/i.test(lower)) return true;
    return false;
  }

  function nameForLink(link) {
    const row = link.closest('[role="listitem"], [role="row"], [role="article"]');
    if (row) {
      for (const line of (row.innerText || '').split('\n').map(clean).filter(Boolean)) {
        if (!isIgnoredName(line) && !/afficher la pièce/i.test(line)) return line;
      }
    }

    const parsed = parseProfilePath(link.href || link.getAttribute('href') || '');
    if (parsed?.name && !isIgnoredName(parsed.name, true)) return parsed.name;

    const label = clean(link.getAttribute('aria-label') || link.innerText || '');
    if (!isIgnoredName(label)) return label;

    return parsed?.name || '';
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
      if (t.includes('personnes qui ont partagé') || t.includes('people who shared')) return d;
    }

    let best = null;
    let bestScore = 0;
    for (const d of dialogs) {
      const profiles = [...d.querySelectorAll('a')].filter((a) =>
        isProfileLink(a.href || a.getAttribute('href') || ''),
      ).length;
      const items = d.querySelectorAll('[role="listitem"], [role="row"]').length;
      const score = items * 10 + profiles * 5;
      if (score > bestScore && (profiles >= 1 || items >= 3)) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  }

  function extractVisible(modal) {
    const seen = new Set();
    const out = [];

    const tryAdd = (link) => {
      const href = fullUrl(link.href || link.getAttribute('href') || '');
      const parsed = parseProfilePath(href);
      if (!parsed) return;

      let name = nameForLink(link);
      if (!name || isIgnoredName(name)) name = parsed.name;
      if (!name || isIgnoredName(name, true)) return;

      const key = profileKey(parsed);
      if (seen.has(key)) return;
      seen.add(key);

      out.push({
        name,
        userId: parsed.userId,
        profile: parsed.profile,
      });
    };

    const rowSel = '[role="listitem"], [role="row"], [role="article"]';
    const rows = modal.querySelectorAll(rowSel);

    for (const item of rows) {
      for (const link of item.querySelectorAll('a[href]')) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href) continue;
        if (!isProfileLink(href)) continue;
        tryAdd(link);
        break;
      }
    }

    for (const link of modal.querySelectorAll('a[href*="facebook.com"], a[href^="/"]')) {
      const href = link.href || link.getAttribute('href') || '';
      if (!isProfileLink(href)) continue;
      tryAdd(link);
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
        error: `[v${VERSION}] Ouvrez « Personnes qui ont partagé » (clic 1,1 K), puis Ajouter.`,
        participants: [],
      };
    }

    const batch = extractVisible(modal);
    const saved = await loadSaved();
    const map = new Map();
    for (const p of saved) {
      map.set(`id:${p.userId}`, p);
    }

    let added = 0;
    for (const p of batch) {
      const k = `id:${p.userId}`;
      if (!map.has(k)) added += 1;
      map.set(k, p);
    }

    const participants = [...map.values()];
    await saveSaved(participants);

    if (!participants.length && !batch.length) {
      const probe = [...modal.querySelectorAll('a[href]')].slice(0, 8).map((a) => a.getAttribute('href') || '').join(' | ');
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] Aucun profil détecté. Défilez la liste (quelques noms visibles), puis Ajouter. Liens vus : ${probe.slice(0, 120) || 'aucun'}`,
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
