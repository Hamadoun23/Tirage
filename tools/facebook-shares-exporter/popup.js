let participants = [];

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const resultsEl = $('results');

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

function showResults(list) {
  participants = list;
  $('count').textContent = list.length;
  resultsEl.classList.remove('hidden');
}

async function getFacebookTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('facebook.com')) {
    return null;
  }
  return tab;
}

$('btn-open').addEventListener('click', async () => {
  const tab = await getFacebookTab();
  if (!tab) {
    setStatus('Ouvrez la publication Facebook dans cet onglet.', 'error');
    return;
  }
  setStatus('Recherche du compteur « 1,1 K »…');
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'openSharesList' });
    if (res?.ok) {
      setStatus(`Liste ouverte (${res.text || res.method}). Cliquez Collecter.`, 'ok');
    } else {
      setStatus('Cliquez à la main sur « 1,1 K » à droite des commentaires.', 'error');
    }
  } catch {
    setStatus('Rechargez Facebook (F5) puis réessayez.', 'error');
  }
});

$('btn-collect').addEventListener('click', async () => {
  const tab = await getFacebookTab();
  if (!tab) {
    setStatus('Ouvrez Facebook sur la publication concernée.', 'error');
    return;
  }

  $('btn-collect').disabled = true;
  setStatus('Collecte en cours… 1 à 5 min si la liste est longue. Ne fermez pas la fenêtre.');

  const onProgress = (msg) => {
    if (msg.action === 'collectProgress' && msg.count != null) {
      setStatus(`${msg.count} profil(s) collecté(s)… défilement en cours`, 'ok');
    }
  };
  chrome.runtime.onMessage.addListener(onProgress);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'collectShares' });

    if (!response?.ok) {
      setStatus(response?.error || 'Échec de la collecte.', 'error');
      resultsEl.classList.add('hidden');
      return;
    }

    showResults(response.participants);
    let msg = `${response.count} profil(s) unique(s) enregistré(s).`;
    if (response.note) msg += ' ' + response.note;
    setStatus(msg, 'ok');
    await chrome.storage.local.set({ lastParticipants: response.participants });
  } catch (err) {
    setStatus(
      'Rechargez la page Facebook (F5), rouvrez « X partages », puis réessayez.',
      'error',
    );
    console.error(err);
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
    $('btn-collect').disabled = false;
  }
});

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads?.download?.({ url, filename, saveAs: true });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const header = 'Nom,Profil';
  const lines = rows.map((r) => `${escapeCsv(r.name)},${escapeCsv(r.profile)}`);
  return '\uFEFF' + [header, ...lines].join('\r\n');
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
        `<Row><Cell><Data ss:Type="String">${esc(r.name)}</Data></Cell>` +
        `<Cell><Data ss:Type="String">${esc(r.profile)}</Data></Cell></Row>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Participants">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Nom</Data></Cell>
    <Cell><Data ss:Type="String">Profil</Data></Cell>
   </Row>
   ${rowXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

function fileSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

$('btn-csv').addEventListener('click', () => {
  if (!participants.length) return;
  downloadBlob(`partages_facebook_${fileSlug()}.csv`, 'text/csv;charset=utf-8', toCsv(participants));
  setStatus('CSV téléchargé.', 'ok');
});

$('btn-xlsx').addEventListener('click', () => {
  if (!participants.length) return;
  const xml = toExcelXml(participants);
  downloadBlob(
    `partages_facebook_${fileSlug()}.xls`,
    'application/vnd.ms-excel',
    xml,
  );
  setStatus('Excel téléchargé (.xls).', 'ok');
});

$('btn-copy').addEventListener('click', async () => {
  if (!participants.length) return;
  const text = participants.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
  await navigator.clipboard.writeText(text);
  setStatus('Liste copiée.', 'ok');
});

chrome.storage.local.get('lastParticipants', (data) => {
  if (data.lastParticipants?.length) {
    showResults(data.lastParticipants);
    setStatus(`${data.lastParticipants.length} partage(s) en mémoire.`, 'ok');
  }
});
