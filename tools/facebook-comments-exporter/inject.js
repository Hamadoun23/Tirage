/**
 * Export commentaires Facebook — v2.1
 * Priorité : liens comment_id (1 commentaire = 1 ID), scroll jusqu'au compteur FB.
 */
(function () {
  'use strict';
  const VERSION = '2.2.0';

  const IGNORED = new Set([
    'partager', 'share', 'voir plus', 'see more', "j'aime", 'like', 'répondre', 'reply',
    'commenter', 'comment', 'nom', 'profil', 'facebook', 'commentaires', 'comments',
    'plus pertinent', 'most relevant', 'afficher', 'see', 'masquer', 'hide',
  ]);

  const BADGES = /^(super|top|rising|loyal|nouveau)\s*fan$|^fan\s+(de la page|enthousiaste|fidèle)$/i;

  const SCROLL = { maxRounds: 500, staleLimit: 18, pauseMs: 650 };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function isBadge(t) {
    const x = clean(t).toLowerCase();
    return BADGES.test(x) || x === 'fan' || x === 'super fan' || x === 'top fan';
  }

  function isIgnoredName(name) {
    if (!name || name.length < 2) return true;
    const lower = clean(name).toLowerCase();
    if (IGNORED.has(lower)) return true;
    if (isBadge(name)) return true;
    if (/^\d[\d\s.,kKmMhH]*$/.test(lower)) return true;
    if (/^\d+\s*[hj]$/i.test(lower)) return true;
    return false;
  }

  function fullUrl(href) {
    if (!href) return '';
    if (href.startsWith('/')) return `https://www.facebook.com${href}`;
    return href;
  }

  function isProfileLink(href) {
    if (!href) return false;
    const url = fullUrl(href);
    if (!url.includes('facebook.com') && !href.startsWith('/')) return false;
    const blocked = [
      '/shares', '/share/', '/photo', '/photos/', '/watch', '/reel/', '/events/',
      '/groups/', 'l.facebook.com', '/plugins/', '/help/', '/policies/',
    ];
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
      return slug ? slug.toLowerCase() : fullUrl(href).toLowerCase();
    } catch {
      return fullUrl(href).toLowerCase();
    }
  }

  /** ID stable : id numérique Facebook ou slug du profil. */
  function userIdFromProfile(href) {
    try {
      const u = new URL(fullUrl(href));
      const id = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && id) return id[1];
      const slug = u.pathname.split('/').filter(Boolean)[0];
      return slug ? slug.toLowerCase() : profileKey(href);
    } catch {
      return profileKey(href);
    }
  }

  /** Nom dérivé uniquement de l’URL profil (pas du texte du commentaire). */
  function nameFromUrl(href) {
    try {
      const u = new URL(fullUrl(href));
      const id = u.search.match(/[?&]id=(\d+)/);
      if (u.pathname.includes('profile.php') && id) return `Utilisateur ${id[1]}`;
      const slug = u.pathname.split('/').filter(Boolean)[0];
      if (!slug) return '';
      let words = slug.replace(/\.\d+$/, '').replace(/[._-]/g, ' ').split(/\s+/).filter(Boolean);
      words = words.filter((w) => !/^\d+$/.test(w));
      if (!words.length) return slug;
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    } catch {
      return '';
    }
  }

  function authorFromProfile(href) {
    const profile = cleanProfileUrl(href);
    const userId = userIdFromProfile(href);
    let name = nameFromUrl(href);
    if (!name || isIgnoredName(name)) name = `Utilisateur ${userId}`;
    return { userId, name, profile };
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

  function commentIdFromHref(href) {
    if (!href) return null;
    const m = String(href).match(/comment_id=(\d+)/i);
    return m ? m[1] : null;
  }

  function progress(count, round, expected) {
    try {
      chrome.runtime.sendMessage({ action: 'collectProgress', count, round, expected });
    } catch {
      /* ignore */
    }
  }

  function getExpectedCommentCount(zone) {
    const text = zone.innerText || '';
    const m = text.match(/(\d[\d\s.,]*)\s*commentaires?/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(/\s/g, '').replace(',', ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function findCommentsZone() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 120 && r.height > 120 && d.offsetParent !== null;
    });

    const withComments = dialogs.filter((d) => {
      const t = (d.innerText || '').toLowerCase();
      return (t.includes('commentaire') || t.includes('comment')) && d.querySelectorAll('a').length >= 3;
    });

    if (withComments.length) {
      return withComments.sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0))[0];
    }

    const main = document.querySelector('[role="main"]');
    if (main) return main;
    return document.body;
  }

  function getScrollable(root) {
    const candidates = [];
    const visit = (el) => {
      try {
        const st = window.getComputedStyle(el);
        const overflow = el.scrollHeight - el.clientHeight;
        if (overflow > 40 && (st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflow === 'auto')) {
          candidates.push({ el, score: overflow });
        }
      } catch {
        /* ignore */
      }
      for (const c of el.children) visit(c);
    };
    visit(root);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || root;
  }

  function getClickable(el) {
    return el.closest('a, [role="button"], [role="link"], [tabindex="0"]') || el;
  }

  async function switchSort(zone) {
    const triggers = ['plus pertinents', 'most relevant', 'pertinents', 'relevant'];
    let trigger = null;
    for (const el of zone.querySelectorAll('span, div[role="button"], [role="combobox"]')) {
      const t = clean(el.innerText || el.getAttribute('aria-label') || '').toLowerCase();
      if (triggers.some((x) => t.includes(x))) {
        trigger = getClickable(el);
        break;
      }
    }
    if (trigger) {
      trigger.click();
      await sleep(900);
    }

    const opts = [
      'tous les commentaires', 'all comments', 'les plus récents', 'plus récents',
      'newest', 'most recent', 'du plus récent',
    ];
    for (const matcher of opts) {
      for (const opt of document.querySelectorAll('[role="menuitem"], [role="option"], span, div')) {
        const t = clean(opt.innerText).toLowerCase();
        if (t === matcher || t.includes(matcher)) {
          getClickable(opt).click();
          await sleep(2200);
          return true;
        }
      }
    }
    return false;
  }

  async function expandMore(zone) {
    const patterns = [
      'plus de commentaires', 'more comments', 'view more comments', 'afficher les commentaires',
      'see more comments', 'autres commentaires', 'commentaires précédents', 'view previous',
      'voir les réponses', 'view replies', 'afficher plus de réponses', 'more replies',
      'afficher plus', 'see more', 'view more',
    ];
    for (let i = 0; i < 50; i++) {
      let hit = false;
      for (const el of zone.querySelectorAll('span, div[role="button"], a, [role="link"]')) {
        const t = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase();
        if (!t || t.length > 90) continue;
        if (patterns.some((p) => t.includes(p))) {
          getClickable(el).click();
          hit = true;
          await sleep(900);
          break;
        }
      }
      if (!hit) break;
    }
  }

  function nameFromLink(link) {
    let name = clean(link.getAttribute('aria-label') || '');
    if (name && !isIgnoredName(name) && !isBadge(name)) return name;

    name = clean(link.querySelector('span[dir="auto"]')?.innerText || link.innerText || '');
    if (name && !isIgnoredName(name) && !isBadge(name)) return name;

    return nameFromUrl(link.href || link.getAttribute('href') || '');
  }

  function pickAuthorLink(container) {
    if (!container) return null;
    const links = [...container.querySelectorAll('a[href*="facebook.com"], a[href^="/"]')].filter((a) =>
      isProfileLink(a.getAttribute('href') || a.href || ''),
    );
    if (!links.length) return null;

    const scored = links.map((link) => {
      const text = clean(link.getAttribute('aria-label') || link.innerText || '');
      let score = 100;
      if (isBadge(text)) score -= 300;
      if (text.split(/\s+/).length >= 2) score += 40;
      if ((link.href || '').includes('comment_id')) score += 30;
      return { link, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.link || links[0];
  }

  function findCommentContainer(link) {
    let node = link.parentElement;
    for (let i = 0; i < 16 && node; i++) {
      if (node.querySelector('[role="article"]') === node) return node;
      const len = (node.innerText || '').length;
      if (len > 10 && len < 4000 && node.querySelector('a[href*="facebook.com"], a[href^="/"]')) {
        return node;
      }
      node = node.parentElement;
    }
    return link.closest('[role="article"], [role="listitem"], li, div') || link.parentElement;
  }

  function commentFromContainer(container, authorLink, name) {
    if (!container) return '';

    const parts = [];
    for (const el of container.querySelectorAll('div[dir="auto"], span[dir="auto"]')) {
      if (authorLink && authorLink.contains(el)) continue;
      const t = clean(el.innerText);
      if (!t || t === name || isBadge(t) || isIgnoredName(t)) continue;
      if (/^(j'aime|like|répondre|reply|partager|\d+\s*[hj])$/i.test(t)) continue;
      if (/^\d+\s+(réponse|replies)$/i.test(t)) continue;
      parts.push(t);
    }

    let text = [...new Set(parts)].join(' ').trim();
    if (!text) {
      const lines = (container.innerText || '').split('\n').map(clean).filter(Boolean);
      let past = false;
      for (const line of lines) {
        if (!past) {
          if (line === name || isBadge(line) || /^\d+\s*[hj]$/i.test(line)) continue;
          past = true;
          continue;
        }
        if (!isBadge(line) && !isIgnoredName(line)) text = text ? `${text} ${line}` : line;
      }
    }
    return text.slice(0, 2000);
  }

  function rowFromCommentLink(link) {
    const href = fullUrl(link.href || link.getAttribute('href') || '');
    const commentId = commentIdFromHref(href);
    if (!commentId) return null;

    const container = link.closest('[role="article"]') || findCommentContainer(link);
    const authorLink = pickAuthorLink(container) || link;
    const authorHref = fullUrl(authorLink.getAttribute('href') || authorLink.href || '');
    if (!isProfileLink(authorHref)) return null;

    const author = authorFromProfile(authorHref);
    if (!author.userId) return null;

    const abbr = container?.querySelector('abbr');
    const date = abbr ? clean(abbr.innerText || abbr.getAttribute('aria-label') || '') : '';

    return {
      ...author,
      comment: '',
      date,
      commentId,
    };
  }

  function isPostArticle(article, articles) {
    if (article !== articles[0]) return false;
    return ![...article.querySelectorAll('a')].some((a) => (a.href || '').includes('comment_id'));
  }

  function extractFromArticle(article) {
    const authorLink = pickAuthorLink(article);
    if (!authorLink) return null;

    const href = fullUrl(authorLink.getAttribute('href') || authorLink.href || '');
    const author = authorFromProfile(href);
    if (!author.userId) return null;

    const commentId =
      [...article.querySelectorAll('a[href*="comment_id"]')]
        .map((a) => commentIdFromHref(a.href))
        .find(Boolean) || commentIdFromHref(href) || null;

    const abbr = article.querySelector('abbr');
    const date = abbr ? clean(abbr.innerText || abbr.getAttribute('aria-label') || '') : '';

    return { ...author, comment: '', date, commentId };
  }

  /** 3 passes : comment_id (fiable), articles, listitems — zone complète. */
  function extractFromZone(zone) {
    const items = [];
    const seen = new Set();

    let tmpIdx = 0;
    const add = (row) => {
      if (!row) return;
      const key = row.commentId
        ? `cid:${row.commentId}`
        : `u:${profileKey(row.profile)}:${row.date}:${++tmpIdx}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(row);
    };

    for (const link of zone.querySelectorAll('a[href*="comment_id"]')) {
      add(rowFromCommentLink(link));
    }

    const articles = [...zone.querySelectorAll('[role="article"]')];
    for (const article of articles) {
      if (isPostArticle(article, articles)) continue;
      add(extractFromArticle(article));
    }

    for (const item of zone.querySelectorAll('[role="listitem"]')) {
      const link = pickAuthorLink(item);
      if (!link) continue;
      const href = fullUrl(link.href || link.getAttribute('href') || '');
      const cid = [...item.querySelectorAll('a[href*="comment_id"]')]
        .map((a) => commentIdFromHref(a.href))
        .find(Boolean);
      const author = authorFromProfile(href);
      if (!author.userId) continue;
      add({
        ...author,
        comment: '',
        date: clean(item.querySelector('abbr')?.innerText || ''),
        commentId: cid,
      });
    }

    return items;
  }

  function dedupeRows(rows) {
    const map = new Map();
    let i = 0;
    for (const row of rows) {
      const key = row.commentId
        ? `cid:${row.commentId}`
        : `u:${profileKey(row.profile)}:${row.date}:${i++}`;
      if (!map.has(key)) map.set(key, row);
    }
    return [...map.values()];
  }

  function finalizeRows(rows, expectedN) {
    const deduped = dedupeRows(rows);

    if (!expectedN) {
      return { rows: deduped, note: null };
    }

    if (deduped.length > expectedN + 8) {
      const withId = deduped.filter((r) => r.commentId);
      if (withId.length >= expectedN * 0.88 && withId.length <= expectedN + 10) {
        return {
          rows: dedupeRows(withId),
          note: `${deduped.length} détectés → ${dedupeRows(withId).length} après retrait des doublons (Facebook : ${expectedN}).`,
        };
      }
    }

    if (deduped.length < expectedN * 0.85) {
      return {
        rows: deduped,
        note: `${deduped.length} / ${expectedN} — relancez : tri « Tous les commentaires », faites défiler pendant la collecte.`,
      };
    }

    return { rows: deduped, note: null };
  }

  /** Une ligne par commentateur : ID, nom (URL), nb de commentaires. */
  function aggregateByUser(commentRows) {
    const map = new Map();

    for (const row of commentRows) {
      const k = profileKey(row.profile);
      const userId = row.userId || userIdFromProfile(row.profile);
      const name = nameFromUrl(row.profile) || row.name || `Utilisateur ${userId}`;

      if (!map.has(k)) {
        map.set(k, {
          userId,
          name,
          profile: row.profile,
          nbCommentaires: 0,
        });
      }
      map.get(k).nbCommentaires += 1;
    }

    return [...map.values()].sort((a, b) => b.nbCommentaires - a.nbCommentaires);
  }

  async function scrollStep(zone, scrollable) {
    const articles = zone.querySelectorAll('[role="article"]');
    const last = articles[articles.length - 1];
    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });

    scrollable.scrollTop = scrollable.scrollHeight;
    scrollable.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200, bubbles: true }));
    window.scrollBy(0, 500);
    await sleep(80);
    scrollable.scrollTop = scrollable.scrollHeight;
  }

  async function collectComments() {
    const zone = findCommentsZone();
    if (!zone) {
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] Ouvrez la publication, descendez aux commentaires, F5, Collecter.`,
        comments: [],
      };
    }

    const expectedN = getExpectedCommentCount(zone);
    await switchSort(zone);
    await sleep(500);
    await expandMore(zone);

    const scrollable = getScrollable(zone);
    const byKey = new Map();
    let stale = 0;
    let lastH = 0;
    let lastCount = 0;

    let mergeIdx = 0;
    const merge = (batch) => {
      for (const row of batch) {
        const k = row.commentId
          ? `cid:${row.commentId}`
          : `u:${profileKey(row.profile)}:${row.date}:${mergeIdx++}`;
        if (!byKey.has(k)) byKey.set(k, row);
      }
    };

    merge(extractFromZone(zone));
    progress(byKey.size, 0, expectedN);

    const staleLimit =
      expectedN && byKey.size < expectedN * 0.9 ? 28 : SCROLL.staleLimit;

    for (let round = 0; round < SCROLL.maxRounds; round++) {
      const before = byKey.size;
      merge(extractFromZone(zone));

      const count = byKey.size;
      if (count > before) stale = 0;
      else stale += 1;

      progress(count, round, expectedN);

      const sh = scrollable.scrollHeight;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= sh - 60;
      if (sh > lastH) {
        stale = Math.max(0, stale - 2);
        lastH = sh;
      }

      const targetReached = expectedN && count >= expectedN * 0.92;
      if (targetReached && stale >= 4 && atBottom) break;
      if (stale >= staleLimit && atBottom) break;
      if (count === lastCount && stale >= 10 && atBottom && !expectedN) break;

      lastCount = count;
      await scrollStep(zone, scrollable);
      await sleep(SCROLL.pauseMs);

      if (round % 6 === 0) await expandMore(zone);
      if (round % 15 === 0) await switchSort(zone);
    }

    await expandMore(zone);
    merge(extractFromZone(zone));

    const raw = dedupeRows([...byKey.values()]);
    const finalized = finalizeRows(raw, expectedN);
    const users = aggregateByUser(finalized.rows);
    const totalComments = finalized.rows.length;

    if (!users.length) {
      const cidLinks = zone.querySelectorAll('a[href*="comment_id"]').length;
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] 0 commentateur. ${cidLinks} liens comment_id visibles. Tri « Tous les commentaires » + F5.`,
        users: [],
      };
    }

    let note =
      `${users.length} commentateur(s), ${totalComments} commentaire(s) au total. ` +
      'Noms issus de l’ID profil Facebook (pas du texte tapé dans le commentaire).';
    if (finalized.note) note += ' ' + finalized.note;
    if (expectedN) note += ` (${totalComments} commentaires collectés / ~${expectedN} sur Facebook).`;

    return {
      ok: true,
      version: VERSION,
      users,
      comments: users,
      count: users.length,
      totalComments,
      rawCount: raw.length,
      expectedTotal: expectedN,
      note,
    };
  }

  globalThis.__FB_COMMENTS_COLLECT_V2 = collectComments;
  globalThis.__FB_COMMENTS_VERSION_V2 = VERSION;
})();
