const VERSION = '2.0.0';
let participants = [];

const $ = (id) => document.getElementById(id);

function setStatus(text, type = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status' + (type ? ` ${type}` : '');
}

function showResults(list) {
  participants = list;
  $('count').textContent = list.length;
  $('results').classList.remove('hidden');
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('facebook.com')) return null;
  return tab;
}

async function runOnPage(tabId, action) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['inject.js'] });
  await new Promise((r) => setTimeout(r, 300));

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (act) => {
      const api = globalThis.__FB_PARTAGES_V2;
      if (!api) {
        return { ok: false, error: 'Script v2 non chargé. Rechargez l’extension.' };
      }
      if (act === 'open') return api.openSharesList();
      if (act === 'reset') return api.resetList();
      return api.addVisibleProfiles();
    },
    args: [action],
  });

  return result;
}

$('btn-open').addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab) return setStatus('Ouvrez Facebook sur la publication.', 'error');
  setStatus('Ouverture de la liste…');
  try {
    const res = await runOnPage(tab.id, 'open');
    setStatus(
      res?.ok ? 'Liste ouverte. Défilez, puis « Ajouter ».' : 'Cliquez à la main sur 1,1 K.',
      res?.ok ? 'ok' : 'error',
    );
  } catch {
    setStatus(`[v${VERSION}] F5 sur Facebook, puis réessayez.`, 'error');
  }
});

$('btn-add').addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab) return setStatus('Ouvrez Facebook sur la publication.', 'error');

  $('btn-add').disabled = true;
  setStatus(`[v${VERSION}] Lecture…`);

  try {
    const res = await runOnPage(tab.id, 'add');

    if (!res?.ok) {
      setStatus(res?.error || 'Échec.', 'error');
      return;
    }

    if (res.version !== VERSION) {
      setStatus(`Mauvaise version (${res.version}). Rechargez l’extension v2.`, 'error');
      return;
    }

    showResults(res.participants);
    setStatus(
      `[v${VERSION}] Total ${res.count} (+${res.addedThisScan} cette fois, ${res.visibleNow} visibles). ${res.note || ''}`,
      'ok',
    );
    await chrome.storage.local.set({ lastParticipants: res.participants });
  } catch (e) {
    setStatus(`[v${VERSION}] Erreur : rechargez l’extension et F5 Facebook.`, 'error');
  } finally {
    $('btn-add').disabled = false;
  }
});

$('btn-reset').addEventListener('click', async () => {
  const tab = await getTab();
  if (tab) {
    try {
      await runOnPage(tab.id, 'reset');
    } catch {
      /* ignore */
    }
  }
  participants = [];
  $('results').classList.add('hidden');
  await chrome.storage.local.remove('lastParticipants');
  setStatus('Liste remise à zéro.', 'ok');
});

function escapeCsv(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return (
    '\uFEFF' +
    ['Nom,ID_utilisateur,Profil', ...rows.map((r) => [r.name, r.userId, r.profile].map(escapeCsv).join(','))].join(
      '\r\n',
    )
  );
}

function toExcel(rows) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const rowsXml = rows
    .map(
      (r) =>
        `<Row><Cell><Data ss:Type="String">${esc(r.name)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.userId)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.profile)}</Data></Cell></Row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Partages"><Table>
<Row><Cell><Data ss:Type="String">Nom</Data></Cell><Cell><Data ss:Type="String">ID_utilisateur</Data></Cell><Cell><Data ss:Type="String">Profil</Data></Cell></Row>
${rowsXml}</Table></Worksheet></Workbook>`;
}

function download(name, mime, body) {
  const blob = new Blob([body], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('btn-csv').addEventListener('click', () => {
  if (!participants.length) return;
  const d = new Date();
  const slug = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  download(`partages_${slug}.csv`, 'text/csv;charset=utf-8', toCsv(participants));
});

$('btn-xlsx').addEventListener('click', () => {
  if (!participants.length) return;
  const d = new Date();
  const slug = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  download(`partages_${slug}.xls`, 'application/vnd.ms-excel', toExcel(participants));
});

chrome.storage.local.get('lastParticipants', (data) => {
  if (data.lastParticipants?.length) {
    showResults(data.lastParticipants);
    setStatus(`${data.lastParticipants.length} en mémoire. Défilez puis Ajouter.`, 'ok');
  }
});
