
// ---------- IndexedDB ----------
const DB_NAME = 'brasserie-stock';
const STORE = 'data';
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}
async function getData() {
  await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get('state');
    req.onsuccess = () => resolve(req.result || seed());
  });
}
async function setData(data) {
  await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, 'state');
    tx.oncomplete = () => resolve(true);
  });
}
function seed() {
  return {
    ingredients: [],
    containers: { bouteilles: { '33cl': 0, '50cl': 0, '75cl': 0 }, canettes: { '44cl': 0 } },
    mouvements: [],
    config: {
      thresholds: { malt: 1000, houblon: 100, levure: 50, grain: 500 },
      thresholdsContainers: { bouteilles: 50, canettes: 50 },
      blockNegative: true
    }
  };
}

// ---------- Helpers ----------
function unitForType(type) {
  const t = (type || '').toLowerCase();
  return (t.includes('malt') || t.includes('houblon') || t.includes('levure') || t.includes('grain')) ? 'g' : 'unit';
}
function isLowStock(item, cfg) {
  const t = (item['Type'] || '').toLowerCase();
  const rest = Number(item['Qté restante'] || 0);
  if (t.includes('malt'))    return rest <= cfg.thresholds.malt;
  if (t.includes('houblon')) return rest <= cfg.thresholds.houblon;
  if (t.includes('levure'))  return rest <= cfg.thresholds.levure;
  if (t.includes('grain'))   return rest <= cfg.thresholds.grain;
  return false;
}
function toNum(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

// ---------- Render ----------
function renderIngredients(data) {
  const tbody = document.querySelector('#ingredients-table tbody');
  tbody.innerHTML = '';
  const q = (document.getElementById('search').value || '').toLowerCase();
  const onlyLow = document.getElementById('only-low').checked;

  data.ingredients
    .filter(it => {
      const s = [it['Type'], it['Nom + Fournisseur'], it['Numéro de lot']]
        .map(x => (x || '') + '').join(' ').toLowerCase();
      const match = !q || s.includes(q);
      const low = isLowStock(it, data.config);
      return match && (!onlyLow || low);
    })
    .forEach(it => {
      const tr = document.createElement('tr');
      const cols = ['Type','Nom + Fournisseur','Numéro de lot','Spec (%AA, EBC...)',
                    'Conditionnement','Notes','Qté initiale (g)','Qté utilisée (g)','Qté restante'];
      cols.forEach(c => {
        const td = document.createElement('td');
        const val = it[c] != null ? it[c] : '';
        td.textContent = val;
        if (c === 'Qté restante') {
          const n = Number(val || 0);
          td.classList.remove('negative','low','ok');
          if (n < 0) td.classList.add('negative');
          else if (isLowStock(it, data.config)) td.classList.add('low');
          else td.classList.add('ok');
        }
        tr.appendChild(td);
      });
      const tdAct = document.createElement('td');
      tdAct.innerHTML = `
        entreeEntrée</button>
        sortieSortie</button>
        ajustementAjustement</button>`;
      tdAct.querySelectorAll('button').forEach(b => b.addEventListener('click', () => openMvtModal(b.dataset.action, it, data)));
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
}

function renderContainers(data) {
  const b = data.containers.bouteilles, c = data.containers.canettes;
  const id = (size) => document.getElementById(`bouteilles-${size.replace('cl','')}`);
  const ic = (size) => document.getElementById(`canettes-${size.replace('cl','')}`);
  if (id('33cl')) id('33cl').value = b['33cl'] ?? 0;
  if (id('50cl')) id('50cl').value = b['50cl'] ?? 0;
  if (id('75cl')) id('75cl').value = b['75cl'] ?? 0;
  if (ic('44cl')) ic('44cl').value = c['44cl'] ?? 0;
}

function renderMouvements(data) {
  const tbody = document.querySelector('#mvt-table tbody');
  tbody.innerHTML = '';
  (data.mouvements || []).forEach(m => {
    const tr = document.createElement('tr');
    ['date','type','objet','quantite','unite','motif','notes']
      .forEach(k => { const td = document.createElement('td'); td.textContent = m[k] || ''; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
}

function renderSettings(data) {
  const th = data.config.thresholds, tc = data.config.thresholdsContainers;
  document.getElementById('th-malt').value = th.malt;
  document.getElementById('th-houblon').value = th.houblon;
  document.getElementById('th-levure').value = th.levure;
  document.getElementById('th-grain').value = th.grain;
  document.getElementById('th-bouteilles').value = tc.bouteilles;
  document.getElementById('th-canettes').value = tc.canettes;
  document.getElementById('block-negative').checked = !!data.config.blockNegative;
}

// ---------- UI wiring ----------
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
}
function wireUI(data) {
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('search').addEventListener('input', () => renderIngredients(data));
  document.getElementById('only-low').addEventListener('change', () => renderIngredients(data));

  // Ajustement contenants
  document.querySelectorAll('.adjust').forEach(btn => btn.addEventListener('click', async () => {
    const [group, size] = btn.dataset.target.split('.');
    const input = document.getElementById(`${group === 'bouteilles' ? 'bouteilles' : 'canettes'}-${size.replace('cl','')}`);
    const val = parseInt(input.value || '0', 10);
    const before = data.containers[group][size] || 0;
    data.containers[group][size] = val;
    data.mouvements.push({
      date: new Date().toISOString().slice(0,10),
      type: 'ajustement-contenant',
      objet: `${group}.${size}`,
      quantite: val - before,
      unite: 'unit',
      motif: 'ajustement manuel',
      notes: ''
    });
    await setData(data);
    renderMouvements(data);
  }));

  // Ajouter format
  document.getElementById('add-format').addEventListener('click', async () => {
    const group = document.getElementById('new-format-group').value;
    const size = (document.getElementById('new-format-size').value || '').trim();
    if (!size) return alert('Précise un format (ex: 37.5cl)');
    if (!data.containers[group]) data.containers[group] = {};
    if (data.containers[group][size] == null) data.containers[group][size] = 0;
    await setData(data);
    alert(`Format ajouté: ${group}.${size}`);
  });

  // Export / Import
  document.getElementById('export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock-brasserie.json'; a.click();
  });
  document.getElementById('copy-json').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('JSON copié dans le presse‑papiers');
  });
  document.getElementById('export-csv').addEventListener('click', () => exportCSV(data));

  document.getElementById('import-json').addEventListener('click', async () => {
    const f = document.getElementById('import-file-json').files[0];
    if (!f) return alert('Choisir un fichier JSON');
    const text = await f.text();
    const imported = JSON.parse(text);
    await setData(imported);
    location.reload();
  });

  document.getElementById('import-csv').addEventListener('click', async () => {
    const f = document.getElementById('import-file-csv').files[0];
    if (!f) return alert('Choisir un fichier CSV (feuille Stock)');
    const text = await f.text();
    const items = parseStockCSV(text);
    items.forEach(it => {
      const key = [it['Type']||'', it['Nom + Fournisseur']||it['Nom']||'', it['Numéro de lot']||'']
        .map(s => String(s).trim()).filter(Boolean).join('::');
      it.id = key;
      it.unite = unitForType(it['Type']);
      ['Qté initiale (g)','Qté utilisée (g)','Qté restante'].forEach(k => {
        const v = (it[k] ?? '').toString().replace(',', '.');
        it[k] = isNaN(parseFloat(v)) ? null : parseFloat(v);
      });
    });
    data.ingredients = items;
    await setData(data);
    location.reload();
  });

  // FAB mouvement global
  document.getElementById('new-mouvement').addEventListener('click', () => openMvtModal('ajustement', null, data));

  // Settings
  document.getElementById('save-settings').addEventListener('click', async () => {
    const th = data.config.thresholds, tc = data.config.thresholdsContainers;
    th.malt    = parseInt(document.getElementById('th-malt').value || '0', 10);
    th.houblon = parseInt(document.getElementById('th-houblon').value || '0', 10);
    th.levure  = parseInt(document.getElementById('th-levure').value || '0', 10);
    th.grain   = parseInt(document.getElementById('th-grain').value || '0', 10);
    tc.bouteilles = parseInt(document.getElementById('th-bouteilles').value || '0', 10);
    tc.canettes   = parseInt(document.getElementById('th-canettes').value || '0', 10);
    data.config.blockNegative = !!document.getElementById('block-negative').checked;
    await setData(data);
    alert('Paramètres enregistrés');
    renderIngredients(data);
  });
}

// ---------- Export CSV ----------
function exportCSV(data) {
  const rows = [['Type','Nom + Fournisseur','Lot','Spec','Conditionnement','Notes','Initial (g)','Utilisée (g)','Restante (g)']];
  data.ingredients.forEach(it => {
    rows.push([
      it['Type']||'', it['Nom + Fournisseur']||'', it['Numéro de lot']||'',
      it['Spec (%AA, EBC...)']||'', it['Conditionnement']||'', it['Notes']||'',
      it['Qté initiale (g)'] ?? '', it['Qté utilisée (g)'] ?? '', it['Qté restante'] ?? ''
    ]);
  });
  const content = rows.map(r => r.map(v => `"${String(v).replaceAll('"','\\"')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type:'text/csv'}));
  a.download = 'ingredients.csv'; a.click();
}

// ---------- Mouvement ----------
function openMvtModal(type, item, data) {
  const quantite = parseFloat(prompt(`Quantité (${item ? 'g' : 'unit'})`));
  if (Number.isNaN(quantite)) return;
  const motif = prompt('Motif (ex: brassin #5, inventaire, casse...)') || '';
  const notes = prompt('Notes') || '';

  data.mouvements = data.mouvements || [];
  const m = {
    date: new Date().toISOString().slice(0,10),
    type,
    objet: item ? (item['Nom + Fournisseur'] || item['Nom'] || item.id) : 'global',
    quantite,
    unite: item ? 'g' : 'unit',
    motif,
    notes
  };
  data.mouvements.push(m);

  if (item) {
    const t = data.ingredients.find(i => i.id === item.id);
    if (type === 'entree') {
      t['Qté initiale (g)'] = toNum(t['Qté initiale (g)']) + quantite;
      t['Qté restante']     = toNum(t['Qté restante']) + quantite;
    } else if (type === 'sortie') {
      const reste = toNum(t['Qté restante']);
      if (quantite > reste) {
        if (data.config.blockNegative) {
          alert('Opération refusée : la sortie dépasserait le stock restant.');
          return;
        } else if (!confirm('La quantité sortie dépasse le stock restant. Continuer ?')) {
          return;
        }
      }
      t['Qté utilisée (g)'] = toNum(t['Qté utilisée (g)']) + quantite;
      t['Qté restante']     = reste - quantite;
    } else if (type === 'ajustement') {
      // Ajuste le restant, sans impacter “Utilisée (g)”
      t['Qté restante'] = toNum(t['Qté restante']) + quantite;
    }
  }
  setData(data).then(() => { renderIngredients(data); renderMouvements(data); });
}

// ---------- CSV “Stock” -> objets ----------
function parseStockCSV(text) {
  const lines = text.replace(/\r/g,'').split('\n').filter(x => x.trim().length > 0);
  const rows = lines.map(line => {
    const out = []; let cur = ''; let q = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i], nx = line[i+1];
      if (ch === '"' && q && nx === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur); cur=''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  });

  const headers = rows[0];
  const idx = (name) => headers.findIndex(h => h.trim().toLowerCase() === name.trim().toLowerCase());
  const needed = [
    'Type','Fournisseur','Nom','Numéro de lot','Spec (%AA, EBC...)',
    'Conditionnement','Notes','Nom + Fournisseur','Qté initiale (g)','Qté utilisée (g)','Qté restante'
  ];
  const missing = needed.filter(n => idx(n) === -1);
  if (missing.length) {
    alert('Colonnes manquantes : ' + missing.join(', '));
    return [];
  }
  return rows.slice(1).map(r => Object.fromEntries(needed.map(n => [n, r[idx(n)] ?? ''])));
}

// ---------- Boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  const data = await getData();
  renderIngredients(data);
  renderContainers(data);
  renderMouvements(data);
  renderSettings(data);
  wireUI(data);
});
