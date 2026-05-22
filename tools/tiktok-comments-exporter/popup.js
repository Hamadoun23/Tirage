let users = [];
let rawRows = [];

const EXT_VERSION = '1.1.0';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const resultsEl = $('results');

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

function showResults(list, totalComments) {
  users = list;
  $('count-users').textContent = list.length;
  $('count-comments').textContent = totalComments ?? '—';
  resultsEl.classList.remove('hidden');
}

async function getTikTokTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('tiktok.com')) return null;
  return tab;
}

async function runCollect(tabId, autoScroll) {
  const stored = await chrome.storage.local.get(['rawRows']);
  const existingRows = stored.rawRows || [];

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['inject.js'],
  });

  await new Promise((r) => setTimeout(r, 200));

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (opts) => {
      if (typeof globalThis.__TT_COMMENTS_COLLECT_V1 !== 'function') {
        return {
          ok: false,
          version: '1.1.0',
          error: 'Script non chargé. Rechargez l’extension puis F5 sur TikTok.',
          users: [],
        };
      }
      return globalThis.__TT_COMMENTS_COLLECT_V1(opts);
    },
    args: [{ autoScroll, existingRows }],
  });

  return result;
}

async function saveSession(response) {
  rawRows = response.rawRows || [];
  users = response.users || [];
  await chrome.storage.local.set({
    lastUsers: users,
    lastTotalComments: response.totalComments,
    rawRows,
  });
}

function bindCollect(btnId, autoScroll) {
  $(btnId).addEventListener('click', async () => {
    const tab = await getTikTokTab();
    if (!tab) {
      setStatus('Ouvrez la publication TikTok dans cet onglet.', 'error');
      return;
    }

    $(btnId).disabled = true;
    setStatus(`v${EXT_VERSION} — analyse…`);

    const onProgress = (msg) => {
      if (msg.action !== 'collectProgress') return;
      const u = msg.users ?? msg.count;
      let t = `v${EXT_VERSION} — ${u} personne(s), ${msg.count} commentaire(s)…`;
      if (msg.expected) t += ` / ~${msg.expected} sur TikTok`;
      setStatus(t, 'ok');
    };
    chrome.runtime.onMessage.addListener(onProgress);

    try {
      const response = await runCollect(tab.id, autoScroll);

      if (!response?.ok) {
        setStatus(response?.error || `[v${EXT_VERSION}] Échec.`, 'error');
        if (!users.length) resultsEl.classList.add('hidden');
        return;
      }

      await saveSession(response);
      showResults(users, response.totalComments);

      let msg = `[v${EXT_VERSION}] ${users.length} commentateur(s), ${response.totalComments} commentaire(s).`;
      if (response.newCount > 0 && !autoScroll) {
        msg = `[v${EXT_VERSION}] +${response.newCount} nouveau(x). ` + msg;
      }
      if (response.note) msg += ' ' + response.note;
      setStatus(msg, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(`[v${EXT_VERSION}] Erreur : ${err.message || err}`, 'error');
    } finally {
      chrome.runtime.onMessage.removeListener(onProgress);
      $(btnId).disabled = false;
    }
  });
}

bindCollect('btn-add', false);
bindCollect('btn-auto', true);

$('btn-reset').addEventListener('click', async () => {
  users = [];
  rawRows = [];
  await chrome.storage.local.remove(['lastUsers', 'lastTotalComments', 'rawRows']);
  resultsEl.classList.add('hidden');
  setStatus('Liste effacée. Scrollez les commentaires puis « Ajouter ».', 'ok');
});

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [
    'Nom,Username,Profil,Nb_commentaires',
    ...rows.map((r) =>
      [
        escapeCsv(r.name),
        escapeCsv(r.userId),
        escapeCsv(r.profile),
        escapeCsv(r.nbCommentaires),
      ].join(','),
    ),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

function toExcelXml(rows) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const rowXml = rows
    .map(
      (r) =>
        `<Row>` +
        `<Cell><Data ss:Type="String">${esc(r.name)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.userId)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.profile)}</Data></Cell>` +
        `<Cell><Data ss:Type="Number">${esc(r.nbCommentaires)}</Data></Cell>` +
        `</Row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Commentateurs">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Nom</Data></Cell>
    <Cell><Data ss:Type="String">Username</Data></Cell>
    <Cell><Data ss:Type="String">Profil</Data></Cell>
    <Cell><Data ss:Type="String">Nb_commentaires</Data></Cell>
   </Row>
   ${rowXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fileSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

$('btn-csv').addEventListener('click', () => {
  if (!users.length) return;
  downloadBlob(`commentateurs_tiktok_${fileSlug()}.csv`, 'text/csv;charset=utf-8', toCsv(users));
  setStatus('CSV téléchargé.', 'ok');
});

$('btn-xlsx').addEventListener('click', () => {
  if (!users.length) return;
  downloadBlob(`commentateurs_tiktok_${fileSlug()}.xls`, 'application/vnd.ms-excel', toExcelXml(users));
  setStatus('Excel téléchargé.', 'ok');
});

$('btn-copy').addEventListener('click', async () => {
  if (!users.length) return;
  const text = users.map((u) => `${u.name} (@${u.userId})`).join('\n');
  await navigator.clipboard.writeText(text);
  setStatus('Liste copiée.', 'ok');
});

chrome.storage.local.get(['lastUsers', 'lastTotalComments', 'rawRows'], (data) => {
  if (data.lastUsers?.length) {
    users = data.lastUsers;
    rawRows = data.rawRows || [];
    showResults(users, data.lastTotalComments);
    setStatus(`${users.length} commentateur(s) en mémoire — scrollez puis « Ajouter ».`, 'ok');
  }
});
