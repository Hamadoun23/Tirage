/**
 * Export commentateurs TikTok — v1.1
 * Collecte incrémentale : à chaque clic, ajoute les commentaires visibles (vous scrollez).
 */
(function () {
  'use strict';
  const VERSION = '1.1.0';

  const SEL = {
    tabBar: '.TUXTabBar-content',
    commentMain: 'div[class*="DivCommentMain"]',
    commentList: 'div[class*="DivCommentListContainer"]',
    commentItem: 'div[class*="DivCommentObjectWrapper"]',
    replyItem: 'div[class*="DivCommentItemWrapper"]',
    viewReplies: 'div[class*="DivViewRepliesContainer"]',
    authorName: 'div[class*="DivUsernameContentWrapper"] a p[class*="TUXText"]',
    authorLink: 'div[class*="DivUsernameContentWrapper"] a',
    timestamp: 'div[class*="DivCommentSubContentSplitWrapper"] span[class*="TUXText"]',
  };

  const IGNORED = new Set([
    'répondre', 'reply', 'commentaires', 'comments', 'commentaire', 'comment',
    'tu pourrais aimer', 'you may like', 'se connecter', 'log in', 'connexion',
    'afficher', 'voir', 'masquer', 'hide', 'show', 'plus', 'more',
    'créateur', 'creator', 'épinglé', 'pinned',
  ]);

  const SCROLL = { maxRounds: 80, staleLimit: 12, pauseMs: 600 };

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function isIgnoredName(name) {
    if (!name || name.length < 2) return true;
    const lower = clean(name).toLowerCase();
    if (IGNORED.has(lower)) return true;
    if (/^\d[\d\s.,kKmM]*$/.test(lower)) return true;
    if (/^il y a\s/i.test(lower) || /^ago\b/i.test(lower)) return true;
    if (/^(afficher|voir)\s+\d+/i.test(lower)) return true;
    return false;
  }

  function progress(count, round, expected, users) {
    try {
      chrome.runtime.sendMessage({
        action: 'collectProgress',
        count,
        round,
        expected,
        users: users ?? count,
      });
    } catch {
      /* ignore */
    }
  }

  /** Compte uniquement dans le panneau commentaires (évite l’ID vidéo / la page entière). */
  function getExpectedCommentCount(zone) {
    if (!zone) return null;
    const head = (zone.innerText || '').slice(0, 1200);
    const patterns = [
      /(\d{1,5})\s*commentaires?\b/i,
      /(\d{1,5})\s*comments?\b/i,
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m) {
        const n = parseInt(m[1].replace(/\s/g, ''), 10);
        if (Number.isFinite(n) && n > 0 && n <= 50000) return n;
      }
    }
    return null;
  }

  function findCommentList() {
    const tabBar = document.querySelector(SEL.tabBar);
    if (tabBar) {
      const list = tabBar.querySelector(SEL.commentList);
      if (list) return list;
      const main = tabBar.querySelector(SEL.commentMain);
      if (main?.querySelector(SEL.commentItem)) return main.querySelector(SEL.commentList) || main;
    }

    const list = document.querySelector(SEL.commentList);
    if (list) return list;

    const main = document.querySelector(SEL.commentMain);
    if (main?.querySelector(SEL.commentItem)) return main;

    return null;
  }

  function getScrollable(root) {
    const candidates = [];
    const visit = (el) => {
      if (!el || el === document.body || el === document.documentElement) return;
      try {
        const st = window.getComputedStyle(el);
        const overflow = el.scrollHeight - el.clientHeight;
        if (overflow > 40 && (st.overflowY === 'auto' || st.overflowY === 'scroll')) {
          const inPanel = root.contains(el);
          candidates.push({ el, score: overflow + (inPanel ? 5000 : 0) });
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

  function usernameFromHref(href) {
    if (!href) return '';
    try {
      const u = new URL(href.startsWith('/') ? `https://www.tiktok.com${href}` : href);
      const m = u.pathname.match(/\/@([^/?#]+)/);
      return m ? m[1] : '';
    } catch {
      const m = String(href).match(/\/@([^/?#]+)/);
      return m ? m[1] : '';
    }
  }

  function isCommentProfileLink(href) {
    const user = usernameFromHref(href);
    if (!user) return false;
    const blocked = ['/video/', '/photo/', '/live/', '/music/', '/tag/', '/search', '/discover'];
    const url = href.startsWith('/') ? `https://www.tiktok.com${href}` : href;
    return !blocked.some((b) => url.includes(b));
  }

  function profileUrl(username) {
    return username ? `https://www.tiktok.com/@${username}` : '';
  }

  function nameFromCommentEl(el) {
    const nameEl = el.querySelector(SEL.authorName);
    let name = clean(nameEl?.textContent || '');
    if (name && !isIgnoredName(name)) return name;

    const link = el.querySelector(SEL.authorLink);
    if (link) {
      name = clean(link.getAttribute('aria-label') || '');
      if (name && !isIgnoredName(name)) return name;
      const user = usernameFromHref(link.href || '');
      if (user) {
        return user.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    return '';
  }

  function rowFromCommentEl(el, isReply = false) {
    const link = el.querySelector(SEL.authorLink);
    if (!link) return null;

    const href = link.href || link.getAttribute('href') || '';
    if (!isCommentProfileLink(href)) return null;

    const userId = usernameFromHref(href);
    if (!userId || userId.length < 2) return null;

    const name = nameFromCommentEl(el) || userId;
    if (isIgnoredName(name)) return null;

    const tsEl = el.querySelector(SEL.timestamp);
    const date = clean(tsEl?.textContent || '');

    const textEl = el.querySelector('span[data-e2e^="comment-level-"] span[class*="TUXText"]');
    let commentText = '';
    if (textEl && !link.contains(textEl)) {
      commentText = clean(textEl.textContent || '').slice(0, 200);
    }

    return {
      userId,
      name,
      profile: profileUrl(userId),
      comment: commentText,
      date,
      isReply,
    };
  }

  function rowKey(row) {
    const txt = (row.comment || '').slice(0, 40);
    return `u:${row.userId.toLowerCase()}:${row.date}:${txt}`;
  }

  function extractFromList(listRoot) {
    const items = [];
    const seen = new Set();

    const add = (row) => {
      if (!row) return;
      const k = rowKey(row);
      if (seen.has(k)) return;
      seen.add(k);
      items.push(row);
    };

    for (const el of listRoot.querySelectorAll(SEL.commentItem)) {
      add(rowFromCommentEl(el, false));
    }
    for (const el of listRoot.querySelectorAll(SEL.replyItem)) {
      add(rowFromCommentEl(el, true));
    }

    return items;
  }

  async function expandReplies(listRoot, maxPasses = 6) {
    const patterns = [
      /^afficher\s+\d+\s+r[eé]ponse/i,
      /^voir\s+\d+\s+r[eé]ponse/i,
      /^view\s+\d+\s+repl/i,
    ];

    for (let pass = 0; pass < maxPasses; pass++) {
      let hit = false;
      for (const container of listRoot.querySelectorAll(SEL.viewReplies)) {
        const t = clean(container.innerText || '');
        if (!patterns.some((p) => p.test(t))) continue;
        const btn = container.querySelector('button') || container;
        btn.click();
        hit = true;
        await sleep(500);
        break;
      }
      if (!hit) break;
    }
  }

  function dedupeRows(rows) {
    const map = new Map();
    for (const row of rows) {
      const k = rowKey(row);
      if (!map.has(k)) map.set(k, row);
    }
    return [...map.values()];
  }

  function aggregateByUser(commentRows) {
    const map = new Map();

    for (const row of commentRows) {
      const k = row.userId.toLowerCase();
      if (!map.has(k)) {
        map.set(k, {
          userId: row.userId,
          name: row.name,
          profile: row.profile,
          nbCommentaires: 0,
        });
      }
      const u = map.get(k);
      u.nbCommentaires += 1;
      if (row.name && row.name.length > u.name.length) u.name = row.name;
    }

    return [...map.values()].sort((a, b) => b.nbCommentaires - a.nbCommentaires);
  }

  async function scrollStep(listRoot, scrollable) {
    const items = listRoot.querySelectorAll(SEL.commentItem);
    const last = items[items.length - 1];
    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
    scrollable.scrollTop = Math.min(
      scrollable.scrollTop + scrollable.clientHeight * 0.85,
      scrollable.scrollHeight,
    );
    await sleep(80);
  }

  /**
   * @param {{ autoScroll?: boolean, existingRows?: object[] }} options
   */
  async function collectComments(options = {}) {
    const autoScroll = options.autoScroll === true;
    const existingRows = Array.isArray(options.existingRows) ? options.existingRows : [];

    const listRoot = findCommentList();
    if (!listRoot) {
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] Panneau commentaires introuvable. Onglet « Commentaires » ouvert, puis F5.`,
        users: [],
        newRows: [],
      };
    }

    const expectedN = getExpectedCommentCount(listRoot);
    const byKey = new Map();

    for (const row of existingRows) {
      byKey.set(rowKey(row), row);
    }
    const startSize = byKey.size;

    const merge = (batch) => {
      for (const row of batch) {
        byKey.set(rowKey(row), row);
      }
    };

    await expandReplies(listRoot, autoScroll ? 8 : 4);
    merge(extractFromList(listRoot));

    const usersBefore = aggregateByUser([...byKey.values()]).length;
    progress([...byKey.values()].length, 0, expectedN, usersBefore);

    if (autoScroll) {
      const scrollable = getScrollable(listRoot.closest(SEL.commentMain) || listRoot);
      let stale = 0;
      let lastCount = byKey.size;

      for (let round = 0; round < SCROLL.maxRounds; round++) {
        const before = byKey.size;
        await expandReplies(listRoot, 2);
        merge(extractFromList(listRoot));

        const count = byKey.size;
        const userCount = aggregateByUser([...byKey.values()]).length;
        if (count > before) stale = 0;
        else stale += 1;

        progress(count, round, expectedN, userCount);

        const atBottom =
          scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 40;
        const targetReached = expectedN && count >= expectedN;
        if (targetReached && stale >= 3 && atBottom) break;
        if (stale >= SCROLL.staleLimit && atBottom) break;
        if (count === lastCount && stale >= 6 && atBottom) break;

        lastCount = count;
        await scrollStep(listRoot, scrollable);
        await sleep(SCROLL.pauseMs);
      }

      await expandReplies(listRoot, 4);
      merge(extractFromList(listRoot));
    }

    const raw = dedupeRows([...byKey.values()]);
    const users = aggregateByUser(raw);
    const newCount = raw.length - startSize;

    if (!users.length) {
      const items = listRoot.querySelectorAll(SEL.commentItem).length;
      return {
        ok: false,
        version: VERSION,
        error: `[v${VERSION}] 0 commentateur. ${items} bloc(s) commentaire visible(s). Scrollez le panneau puis réessayez.`,
        users: [],
        newRows: [],
      };
    }

    let note = autoScroll
      ? `${users.length} commentateur(s), ${raw.length} commentaire(s).`
      : `+${Math.max(0, newCount)} commentaire(s) ajouté(s). Total : ${users.length} personne(s), ${raw.length} commentaire(s). Scrollez puis recliquez « Ajouter ».`;

    if (expectedN && raw.length > expectedN + 5) {
      note += ` (TikTok indique ~${expectedN} — vérifiez la liste.)`;
    } else if (expectedN && raw.length < expectedN) {
      note += ` (${raw.length} / ~${expectedN} — scrollez et recliquez « Ajouter ».)`;
    }

    return {
      ok: true,
      version: VERSION,
      users,
      rawRows: raw,
      newRows: raw.slice(startSize),
      newCount: Math.max(0, newCount),
      count: users.length,
      totalComments: raw.length,
      expectedTotal: expectedN,
      note,
      incremental: !autoScroll,
    };
  }

  globalThis.__TT_COMMENTS_COLLECT_V1 = collectComments;
  globalThis.__TT_COMMENTS_VERSION_V1 = VERSION;
})();
