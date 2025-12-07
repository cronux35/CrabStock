
// CrabStock – script complet
const DB_NAME = 'crabstock-db';
const STORE = 'state';
let db;

async function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1 });    const r = indexedDB.open(DB_NAME, 1);
}

async function getState() {
  await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const req = st.get('state');
    req.onsuccess = async () => {
      if (req.result) resolve(req.result);
      else {
        const resp = await fetch('seed_reformatted.json');
        const data = await resp.json();
        await setState(data);
        resolve(data);
      }
    };
  });
}

async function setState(state) {
  await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, 'state');
    tx.oncomplete = () => resolve(true);
  });
}

const byId = (id) => document.getElementById(id);
function toNum(v) { const n = parseFloat(String(v).replace(',', '.')); return Number.isNaN(n) ? 0 : n; }
function today() { return new Date().toISOString().slice(0, 10); }

// Auto-complétion pour Nom
let varieties = { Malt: [], Houblon: [], Levure: [] };
async function loadVarieties() {
  const malt = await (await fetch('malt.json')).json();
  const hops = await (await fetch('hops.json')).json();
  const yeast = await (await fetch('yeast.json')).json();
  varieties.Malt = malt.varieties;
  varieties.Houblon = hops.varieties;
  varieties.Levure = yeast.varieties;
}

function setupAutocomplete() {
  const inputNom = byId('input-nom');
  inputNom.addEventListener('input', () => {
    const t = document.querySelector('select[name="Type"]').value;
    const val = inputNom.value.toLowerCase();
    const list = varieties[t] || [];
    const suggestions = list.filter(v => v.toLowerCase().includes(val));
    let datalist = byId('datalist-nom');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'datalist-nom';
      document.body.appendChild(datalist);
      inputNom.setAttribute('list', 'datalist-nom');
    }
    datalist.innerHTML = '';
    suggestions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      datalist.appendChild(opt);
    });
  });
}

// Rendu stocks
function renderStocks(state) {
  const tbody = document.querySelector('#ingredients-table tbody');
  tbody.innerHTML = '';
  state.ingredients.forEach(it => {
    const tr = document.createElement('tr');
    if (Number(it['Qté restante (g)']) < 0) tr.classList.add('neg');
    const specStr = it.Type === 'Malt' ? `${it.Spec_EBC ?? ''} EBC` :
      it.Type === 'Houblon' ? `${it.Spec_AA ?? ''} %AA` :
        it.Type === 'Levure' ? `DLUO ${it.Peremption ?? ''}` : (it.Spec ?? '');
    const fields = [it.Type, it.Fournisseur, it.Nom, it['Numéro de lot'] || '', specStr,
      it.Conditionnement || '', it.Notes || '', it['Qté initiale (g)'] ?? '',
      it['Qté utilisée (g)'] ?? '', it['Qté restante (g)'] ?? ''];
    fields.forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
    const tdEdit = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✏️';
    btn.addEventListener('click', async () => {
      const newVal = prompt('Nouvelle quantité restante (g):', it['Qté restante (g)']);
      if (newVal !== null) {
        it['Qté restante (g)'] = toNum(newVal);
        await setState(state);
        renderStocks(state);
      }
    });
    tdEdit.appendChild(btn);
    tr.appendChild(tdEdit);
    tbody.appendChild(tr);
  });
}

// Formulaire ajout
const formAdd = byId('form-add');
formAdd?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(formAdd);
  const t = fd.get('Type');
  const nom = fd.get('Nom');
  if (nom && !varieties[t].includes(nom)) {
    if (confirm(`Ajouter ${nom} à la base ${t}?`)) varieties[t].push(nom);
  }
  const base = {
    Type: t, Fournisseur: fd.get('Fournisseur'), Nom: nom,
    'Numéro de lot': fd.get('Numéro de lot') || '', Conditionnement: fd.get('Conditionnement') || '',
    Notes: fd.get('Notes') || '', 'Qté initiale (g)': toNum(fd.get('Qté initiale (g)')),
    'Qté utilisée (g)': 0, 'Qté restante (g)': toNum(fd.get('Qté initiale (g)')), unite: 'g'
  };
  if (t === 'Malt') base.Spec_EBC = toNum(fd.get('Spec (%AA, EBC...)'));
  else if (t === 'Houblon') base.Spec_AA = toNum(fd.get('Spec (%AA, EBC...)'));
  else if (t === 'Levure') base.Peremption = fd.get('Peremption');
  base.id = [t, base.Fournisseur, base.Nom, base['Numéro de lot']].map(s => String(s || '').trim()).filter(Boolean).join('::');
  const state = await getState();
  state.ingredients.push(base);
  state.mouvements.push({ date: today(), type: 'entree', objet: `${t} ${base.Nom}`, quantite: base['Qté initiale (g)'], unite: 'g', motif: 'ajout stock', notes: '' });
  await setState(state);
  alert('Ingrédient ajouté');
  renderStocks(state);
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadVarieties();
  setupAutocomplete();
  const state = await getState();
  renderStocks(state);
});

    r.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = (e) => { db = e.target.result; resolve(db); };
    r.onerror = reject;
