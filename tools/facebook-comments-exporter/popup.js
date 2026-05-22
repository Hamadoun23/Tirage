let users = [];

const EXT_VERSION = '2.2.0';

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

async function getFacebookTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('facebook.com')) return null;
  return tab;
}

async function runCollect(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['inject.js'],
  });

  await new Promise((r) => setTimeout(r, 300));

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      if (typeof globalThis.__FB_COMMENTS_COLLECT_V2 !== 'function') {
        return {
          ok: false,
          version: '2.2.0',
          error: 'Script non chargé. Rechargez l’extension puis F5 sur Facebook.',
          users: [],
        };
      }
      return globalThis.__FB_COMMENTS_COLLECT_V2();
    },
  });

  return result;
}

$('btn-collect').addEventListener('click', async () => {
  const tab = await getFacebookTab();
  if (!tab) {
    setStatus('Ouvrez la publication Facebook dans cet onglet.', 'error');
    return;
  }

  $('btn-collect').disabled = true;
  setStatus(`v${EXT_VERSION} — chargement…`);

  const onProgress = (msg) => {
    if (msg.action === 'collectProgress' && msg.count != null) {
      let t = `v${EXT_VERSION} — ${msg.count} commentaire(s) détecté(s)…`;
      if (msg.expected) t += ` / ~${msg.expected}`;
      setStatus(t, 'ok');
    }
  };
  chrome.runtime.onMessage.addListener(onProgress);

  try {
    setStatus(`v${EXT_VERSION} — collecte (1 à 5 min)…`);

    const response = await runCollect(tab.id);

    if (!response) {
      setStatus(`[v${EXT_VERSION}] Réponse vide. F5 sur Facebook puis réessayez.`, 'error');
      return;
    }

    if (response.version && response.version !== EXT_VERSION) {
      setStatus(`Version ${response.version} — rechargez l’extension (v${EXT_VERSION}).`, 'error');
      return;
    }

    if (!response.ok) {
      setStatus(response.error || `[v${EXT_VERSION}] Échec.`, 'error');
      resultsEl.classList.add('hidden');
      return;
    }

    const list = response.users || response.comments || [];
    showResults(list, response.totalComments);
    let msg = `[v${EXT_VERSION}] ${list.length} commentateur(s), ${response.totalComments || '?'} commentaire(s).`;
    if (response.note) msg += ' ' + response.note;
    setStatus(msg, 'ok');
    await chrome.storage.local.set({
      lastUsers: list,
      lastTotalComments: response.totalComments,
    });
  } catch (err) {
    console.error(err);
    setStatus(`[v${EXT_VERSION}] Erreur : ${err.message || err}`, 'error');
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
    $('btn-collect').disabled = false;
  }
});

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [
    'Nom,ID_utilisateur,Profil,Nb_commentaires',
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
    <Cell><Data ss:Type="String">ID_utilisateur</Data></Cell>
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
  downloadBlob(`commentateurs_facebook_${fileSlug()}.csv`, 'text/csv;charset=utf-8', toCsv(users));
  setStatus('CSV téléchargé.', 'ok');
});

$('btn-xlsx').addEventListener('click', () => {
  if (!users.length) return;
  downloadBlob(`commentateurs_facebook_${fileSlug()}.xls`, 'application/vnd.ms-excel', toExcelXml(users));
  setStatus('Excel téléchargé (1 ligne = 1 commentateur).', 'ok');
});

$('btn-copy').addEventListener('click', async () => {
  if (!users.length) return;
  const text = users.map((u) => `${u.name} (${u.nbCommentaires} commentaire(s))`).join('\n');
  await navigator.clipboard.writeText(text);
  setStatus('Liste copiée.', 'ok');
});

chrome.storage.local.get(['lastUsers', 'lastTotalComments'], (data) => {
  if (data.lastUsers?.length) {
    showResults(data.lastUsers, data.lastTotalComments);
    setStatus(`${data.lastUsers.length} commentateur(s) en mémoire.`, 'ok');
  }
});
