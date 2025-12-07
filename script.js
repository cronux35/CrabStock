
// CrabStock – script corrigé
const DB_NAME = 'crabstock-db';
const STORE = 'state';
let db;

// ---------- IndexedDB ----------
async function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = (e) => { db = e.target.result; resolve(db); };
    r.onerror = reject;
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

function defaultState() {
  return {
    ingredients: [],
    mouvements: [],
    fermentation: [],
    conditionnement: []
  };
}

// Essaie de charger seed_reformatted.json sinon retourne un état par défaut
async function getState() {
  await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const req = st.get('state');
    req.onsuccess = async () => {
      if (req.result) {
        // normalisation minimale
        const s = req.result;
        s.ingredients ||= [];
        s.mouvements ||= [];
        s.fermentation ||= [];
        s.conditionnement ||= [];
        resolve(s);
      } else {
        // fallback: tenter le seed si présent, sinon défaut
        try {
          const resp = await fetch('seed_reformatted.json');
          if (!resp.ok) throw new Error('Seed indisponible');
          const data = await resp.json();
          data.ingredients ||= [];
          data.mouvements ||= [];
          data.fermentation ||= [];
          data.conditionnement ||= [];
          await setState(data);
          resolve(data);
        } catch {
          const init = defaultState();
          await setState(init);
          resolve(init);
        }
      }
    };
  });
}

// ---------- Utils ----------
const byId = (id) => document.getElementById(id);
function toNum(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}
// Date locale YYYY-MM-DD (évite l’UTC de toISOString)
function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- Variétés pour auto-complétion ----------
let varieties = { Malt: [], Houblon: [], Levure: [] };

async function loadVarieties() {
  try {
    const malt = await (await fetch('malt.json')).json();
    varieties.Malt = Array.isArray(malt.varieties) ? malt.varieties : [];
  } catch { varieties.Malt = []; }
  try {
    const hops = await (await fetch('hops.json')).json();
    varieties.Houblon = Array.isArray(hops.varieties) ? hops.varieties : [];
  } catch { varieties.Houblon = []; }
  try {
    const yeast = await (await fetch('yeast.json')).json();
    varieties.Levure = Array.isArray(yeast.varieties) ? yeast.varieties : [];
  } catch { varieties.Levure = []; }
}

function setupAutocomplete() {
  const inputNom = byId('input-nom');
  if (!inputNom) return;

  const ensureDatalist = () => {
    let datalist = byId('datalist-nom');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'datalist-nom';
      document.body.appendChild(datalist);
      inputNom.setAttribute('list', 'datalist-nom');
    }
    return datalist;
  };

  const refresh = () => {
    const t = document.querySelector('select[name="Type"]')?.value || 'Malt';
    const val = (inputNom.value || '').toLowerCase();
    const list = varieties[t] || []; // <-- correction
    const suggestions = list.filter(v => v.toLowerCase().includes(val)).slice(0, 20);
    const datalist = ensureDatalist();
    datalist.innerHTML = '';
    suggestions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      datalist.appendChild(opt);
    });
  };

  inputNom.addEventListener('input', refresh);
  document.querySelector('select[name="Type"]')?.addEventListener('change', refresh);
}

// ---------- Rendu stocks ----------
function renderStocks(state) {
  const tbody = document.querySelector('#ingredients-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  (state.ingredients || []).forEach(it => {
    const tr = document.createElement('tr');
    if (Number(it['Qté restante (g)']) < 0) tr.classList.add('neg');

    const specStr =
      it.Type === 'Malt'    ? `${it.Spec_EBC ?? it.Spec ?? ''} EBC`
    : it.Type === 'Houblon' ? `${it.Spec_AA ?? it.Spec ?? ''} %AA`
    : it.Type === 'Levure'  ? `DLUO ${it.Peremption ?? ''}`
    : (it.Spec ?? '');

    const fields = [
      it.Type,
      it.Fournisseur,
      it.Nom,
      it['Numéro de lot'] ?? '',
      specStr,
      it.Conditionnement ?? '',
      it.Notes ?? '',
      it['Qté initiale (g)'] ?? '',
      it['Qté utilisée (g)'] ?? '',
      it['Qté restante (g)'] ?? ''
    ];

    fields.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });

    const tdEdit = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✏️';
    btn.addEventListener('click', async () => {
      const newVal = prompt('Nouvelle quantité restante (g) :', it['Qté restante (g)']);
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

// ---------- Ajout ingrédient ----------
const formAdd = byId('form-add');
formAdd?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(formAdd);
  const t = fd.get('Type');
  const nom = fd.get('Nom');

  // Alimenter la base de variétés
  if (nom && !((varieties[t] || []).includes(nom))) {
    if (confirm(`Ajouter ${nom} à la base ${t} ?`)) {
      varieties[t] = varieties[t] || [];
      varieties[t].push(nom);
    }
  }

  const base = {
    Type: t,
    Fournisseur: fd.get('Fournisseur'),
    Nom: nom,
    'Numéro de lot': fd.get('Numéro de lot') ?? '',
    Conditionnement: fd.get('Conditionnement') ?? '',
    Notes: fd.get('Notes') ?? '',
    'Qté initiale (g)': toNum(fd.get('Qté initiale (g)')),
    'Qté utilisée (g)': 0,
    'Qté restante (g)': toNum(fd.get('Qté initiale (g)')),
    unite: 'g'
  };

  // Spécification selon type : on lit le champ "Spec"
  const specVal = fd.get('Spec');
  if (t === 'Malt')      base.Spec_EBC = toNum(specVal);
  else if (t === 'Houblon') base.Spec_AA  = toNum(specVal);
  else                     base.Spec      = specVal;

  if (t === 'Levure') base.Peremption = fd.get('Peremption');

  base.id = [t, base.Fournisseur, base.Nom, base['Numéro de lot']]
    .map(s => String(s ?? '').trim())
    .filter(Boolean)
    .join('::');

  const state = await getState();
  state.ingredients ||= [];
  state.mouvements ||= [];
  state.ingredients.push(base);
  state.mouvements.push({
    date: today(),
    type: 'entree',
    objet: `${t} ${base.Nom}`,
    quantite: base['Qté initiale (g)'],
    unite: 'g',
    motif: 'ajout stock',
    notes: ''
  });

  await setState(state);
  alert('Ingrédient ajouté');
  renderStocks(state);
});

// ---------- Fermentation ----------
function renderFermentation(state) {
  const tbody = document.querySelector('#fermentation-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (state.fermentation || []).forEach(f => {
    const tr = document.createElement('tr');
    ['date','nom_biere','style','densite','temperature','ph','purge'].forEach(k => {
      const td = document.createElement('td');
      td.textContent = f[k] ?? '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

byId('form-fermentation')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entry = {
    date: today(),
    nom_biere: fd.get('nom_biere'),
    style: fd.get('style'),
    densite: fd.get('densite'),
    temperature: fd.get('temperature'),
    ph: fd.get('ph'),
    purge: fd.get('purge')
  };
  const state = await getState();
  state.fermentation ||= [];
  state.fermentation.push(entry);
  await setState(state);
  renderFermentation(state);
  alert('Suivi fermentation ajouté');
});

// ---------- Conditionnement ----------
function genLot() { return 'LOT-' + Date.now(); }

function renderConditionnement(state) {
  const tbody = document.querySelector('#conditionnement-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (state.conditionnement || []).forEach(c => {
    const tr = document.createElement('tr');
    ['date','nom_biere','volume_total','futs','bouteilles_33','bouteilles_50','bouteilles_75','canettes_44','lot'].forEach(k => {
      const td = document.createElement('td');
      td.textContent = c[k] ?? '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

byId('form-conditionnement')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entry = {
    date: today(),
    nom_biere: fd.get('nom_biere'),
    volume_total: fd.get('volume_total'),
    futs: fd.get('futs'),
    bouteilles_33: fd.get('bouteilles_33'),
    bouteilles_50: fd.get('bouteilles_50'),
    bouteilles_75: fd.get('bouteilles_75'),
    canettes_44: fd.get('canettes_44'),
    lot: genLot()
  };
  const state = await getState();
  state.conditionnement ||= [];
  state.conditionnement.push(entry);
  await setState(state);
  renderConditionnement(state);
  alert('Conditionnement ajouté');
});

// ---------- Import / Export ----------
byId('btn-export')?.addEventListener('click', async () => {
  const state = await getState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crabstock-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

byId('file-import')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // Minimal sanity-check
    data.ingredients ||= [];
    data.mouvements ||= [];
    data.fermentation ||= [];
    data.conditionnement ||= [];
    await setState(data);
    alert('Import réussi');
    renderStocks(data);
    renderFermentation(data);
    renderConditionnement(data);
  } catch (err) {
    alert('Import échoué: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ---------- Boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  await loadVarieties();        // OK même si les fichiers n'existent pas
  setupAutocomplete();

  const state = await getState();
  renderStocks(state);
  renderFermentation(state);
  renderConditionnement(state);
});
