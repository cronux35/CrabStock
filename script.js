
// CrabStock – modern responsive UI (IndexedDB)
const DB_NAME = 'crabstock-db';
const STORE   = 'state';
let db;

// IndexedDB
function openDB(){
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB_NAME,1);
    r.onupgradeneeded = (e)=>{ db = e.target.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    r.onsuccess = (e)=>{ db = e.target.result; resolve(db); };
    r.onerror   = reject;
  });
}
async function getState(){
  await openDB();
  return new Promise((resolve)=>{
    const tx = db.transaction(STORE,'readonly');
    const st = tx.objectStore(STORE);
    const req = st.get('state');
    req.onsuccess = async ()=>{
      if(req.result){ resolve(req.result); }
      else {
        const resp = await fetch('seed_reformatted.json');
        const data = await resp.json();
        await setState(data);
        resolve(data);
      }
    };
  });
}
async function setState(state){
  await openDB();
  return new Promise((resolve)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(state,'state');
    tx.oncomplete = ()=> resolve(true);
  });
}
function seed(){
  return {
    ingredients: [],
    containers: { bouteilles: { '33cl':0,'50cl':0,'75cl':0 }, canettes: { '44cl':0 } },
    mouvements: [],
    config: { thresholds: { malt:1000, houblon:100, levure:50, divers:200 },
              thresholdsContainers: { bouteilles:50, canettes:50 },
              blockNegative: true }
  };
}

const byId = (id)=>document.getElementById(id);
function unitForType(type){ const t=(type||'').toLowerCase(); return (['malt','houblon','levure','grain'].some(x=>t.includes(x))||t.includes('divers'))?'g':'unit'; }
function isLow(it,cfg){ const t=(it.Type||'').toLowerCase(); const rest=Number(it['Qté restante (g)']||0);
  if(t.includes('malt')) return rest<=cfg.thresholds.malt;
  if(t.includes('houblon')) return rest<=cfg.thresholds.houblon;
  if(t.includes('levure')) return rest<=cfg.thresholds.levure;
  return rest<=cfg.thresholds.divers;
}
function toNum(v){ const n=parseFloat(String(v).replace(',','.')); return Number.isNaN(n)?0:n; }
function today(){ return new Date().toISOString().slice(0,10); }

// Navigation
function openPanel(id){ document.querySelectorAll('.panel').forEach(p=>p.hidden=true); byId('panel-'+id).hidden=false; byId('home').style.display='none'; }
function backHome(){ document.querySelectorAll('.panel').forEach(p=>p.hidden=true); byId('home').style.display=''; }
document.querySelectorAll('[data-open]').forEach(el=> el.addEventListener('click', ()=>openPanel(el.dataset.open)));
document.querySelectorAll('[data-close]').forEach(el=> el.addEventListener('click', backHome));

// Stocks
function renderStocks(state){
  const tbody = document.querySelector('#ingredients-table tbody');
  const q = (byId('search')?.value||'').toLowerCase();
  const typeFilter = byId('filter-type')?.value || '';
  const onlyLow = byId('only-low')?.checked || false;

  tbody.innerHTML='';
  state.ingredients
    .filter(it=>{
      const s = [it.Type,it.Fournisseur,it.Nom,it['Numéro de lot']].map(x=>(x||'')+'').join(' ').toLowerCase();
      const match = !q || s.includes(q);
      const tmatch = !typeFilter || (it.Type===typeFilter);
      const low = isLow(it, state.config);
      return match && tmatch && (!onlyLow || low);
    })
    .forEach(it=>{
      const tr = document.createElement('tr');
      const specStr = it.Type==='Malt' ? `${it.Spec_EBC??''} EBC`
                     : it.Type==='Houblon' ? `${it.Spec_AA??''} %AA`
                     : it.Type==='Levure' ? `DLUO ${it.Peremption??''}`
                     : (it.Spec??'');
      const fields = [
        it.Type, it.Fournisseur, it.Nom, it['Numéro de lot']||'',
        specStr, it.Conditionnement||'', it.Notes||'',
        it['Qté initiale (g)']??'', it['Qté utilisée (g)']??'', it['Qté restante (g)']??''
      ];
      fields.forEach((v,i)=>{
        const td=document.createElement('td'); td.textContent=v;
        if(i===9){ const rest=Number(v||0); td.classList.add(rest<0?'neg':isLow(it,state.config)?'low':''); }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

  // Résumé contenants
  const cs = byId('containers-summary'); if(!cs) return;
  cs.innerHTML='';
  const chips=[];
  for(const [k,v] of Object.entries(state.containers.bouteilles)) chips.push(`🍾 ${k}: ${v}`);
  for(const [k,v] of Object.entries(state.containers.canettes))   chips.push(`🥫 ${k}: ${v}`);
  chips.forEach(t=>{ const c=document.createElement('span'); c.className='chip'; c.textContent=t; cs.appendChild(c); });
}
['search','filter-type','only-low'].forEach(id=> byId(id)?.addEventListener('input', ()=> getState().then(renderStocks)));

// Ajouter ingrédient
const formAdd = byId('form-add');
const rowSpec = byId('row-spec'), labelSpec = byId('label-spec');
const rowPeremp = byId('row-peremption');
formAdd?.querySelector('select[name="Type"]')?.addEventListener('change',(e)=>{
  const t = e.target.value;
  rowPeremp.hidden = (t!=='Levure');
  labelSpec.textContent = t==='Malt' ? 'EBC' : t==='Houblon' ? '%AA' : 'Spec';
  formAdd.querySelector('input[name="Spec (%AA, EBC...)"]').placeholder =
    t==='Malt' ? 'ex. 15 EBC' : t==='Houblon' ? 'ex. 6.5 %AA' : 'ex. info libre';
});
formAdd?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(formAdd);
  const t  = fd.get('Type');
  const base = {
    Type:t, Fournisseur:fd.get('Fournisseur'), Nom:fd.get('Nom'),
    'Numéro de lot':fd.get('Numéro de lot')||'', Conditionnement:fd.get('Conditionnement')||'',
    Notes:fd.get('Notes')||'',
    'Qté initiale (g)': toNum(fd.get('Qté initiale (g)')), 'Qté utilisée (g)': 0,
    'Qté restante (g)': toNum(fd.get('Qté initiale (g)')),
    unite:'g'
  };
  if(t==='Malt') base.Spec_EBC = toNum(fd.get('Spec (%AA, EBC...)'));
  else if(t==='Houblon') base.Spec_AA = toNum(fd.get('Spec (%AA, EBC...)'));
  else if(t==='Levure') base.Peremption = fd.get('Peremption');

  base.id = [t, base.Fournisseur, base.Nom, base['Numéro de lot']].map(s=>String(s||'').trim()).filter(Boolean).join('::');

  const state = await getState();
  state.ingredients.push(base);
  state.mouvements.push({date:today(), type:'entree', objet:`${t} ${base.Nom}`, quantite:base['Qté initiale (g)'], unite:'g', motif:'ajout stock', notes:''});
  await setState(state);
  alert('Ingrédient ajouté'); backHome();
});

// Sortir ingrédient
const formUse = byId('form-use'); const useSel = byId('use-select'); const useSearch = byId('use-search');
async function repopUseSelect(){
  const state = await getState(); const q=(useSearch.value||'').toLowerCase();
  useSel.innerHTML='';
  state.ingredients
    .filter(it=>{ const s=[it.Type,it.Fournisseur,it.Nom,it['Numéro de lot']].map(x=>(x||'')+'').join(' ').toLowerCase(); return !q || s.includes(q); })
    .forEach(it=>{ const opt=document.createElement('option'); opt.value=it.id; opt.textContent=`${it.Type} — ${it.Nom} (${it.Fournisseur}) lot ${it['Numéro de lot']||'-'} | restant: ${it['Qté restante (g)']??0} g`; useSel.appendChild(opt); });
}
useSearch?.addEventListener('input', repopUseSelect);
document.querySelector('[data-open="use"]')?.addEventListener('click', repopUseSelect);
formUse?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const state = await getState();
  const it = state.ingredients.find(x=>x.id===useSel.value); if(!it) return alert('Sélection invalide.');
  const qty = toNum(formUse.querySelector('input[name="quantite"]').value); if(qty<=0) return alert('Quantité invalide.');
  const reste = toNum(it['Qté restante (g)']);
  if(qty>reste && state.config.blockNegative) return alert('Refusé: la sortie dépasse le stock restant.');
  it['Qté utilisée (g)'] = toNum(it['Qté utilisée (g)']) + qty; it['Qté restante (g)'] = reste - qty;
  const motif = formUse.querySelector('input[name="motif"]').value||''; const notes = formUse.querySelector('input[name="notes"]').value||'';
  state.mouvements.push({date:today(), type:'sortie', objet:`${it.Type} ${it.Nom}`, quantite:qty, unite:'g', motif, notes});
  await setState(state); alert('Sortie enregistrée'); backHome();
});

// Contenants
document.querySelectorAll('[data-cont]')?.forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const state = await getState();
    const [group,size] = btn.dataset.cont.split('.'); const dir=btn.dataset.dir;
    const inputId = `${group==='bouteilles'?'bouteilles':'canettes'}-${size.replace('cl','')}`;
    const val = parseInt(byId(inputId).value||'0',10); if(val<=0) return alert('Quantité invalide.');
    const before = state.containers[group][size]||0; const after = dir==='in' ? before+val : before-val;
    if(after<0 && state.config.blockNegative) return alert('Refusé: stock négatif.');
    state.containers[group][size] = after;
    state.mouvements.push({date:today(), type: dir==='in'?'container-in':'container-out', objet:`${group}.${size}`, quantite:val, unite:'unit', motif:'', notes:''});
    await setState(state); alert('Mouvement conteneur OK'); renderStocks(state);
  });
});

// Historique
function renderHistory(state){
  const tbody = document.querySelector('#mvt-table tbody');
  const tf = byId('history-filter-type')?.value || ''; const q = (byId('history-search')?.value||'').toLowerCase();
  tbody.innerHTML='';
  (state.mouvements||[])
    .filter(m=>{ const tmatch=!tf || m.type===tf; const s=[m.type,m.objet,m.motif,m.notes].map(x=>(x||'')+'').join(' ').toLowerCase(); return tmatch && (!q || s.includes(q)); })
    .forEach(m=>{
      const tr=document.createElement('tr'); ['date','type','objet','quantite','unite','motif','notes'].forEach(k=>{ const td=document.createElement('td'); td.textContent=m[k]??''; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
}
['history-filter-type','history-search'].forEach(id=> byId(id)?.addEventListener('input', ()=> getState().then(renderHistory)));
document.querySelector('[data-open="history"]')?.addEventListener('click', ()=> getState().then(renderHistory));

// Import Excel/CSV
async function importFromSheetJS(file){
  const data = await file.arrayBuffer(); const wb = XLSX.read(data, { type:'array' });
  const sheetName='Stock'; const ws = wb.Sheets[sheetName]; if(!ws) return alert(`Feuille "${sheetName}" introuvable.`);
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true });

  const NEEDED = ['Type','Fournisseur','Nom','Numéro de lot','Spec (%AA, EBC...)','Conditionnement','Notes','Nom + Fournisseur','Qté initiale (g)','Qté utilisée (g)','Qté restante'];
  let hi=-1; for(let i=0;i<rows.length;i++){ const vals=rows[i].map(v=>String(v||'').trim()); const hits=NEEDED.filter(c=>vals.includes(c)).length; if(vals.includes('Type') && hits>=6){ hi=i; break; } }
  if(hi<0) return alert('En-têtes non détectés (colonne "Type").');

  const headers = rows[hi].map(v=>String(v||'').trim()); const idx=(name)=> headers.findIndex(h=>h===name);
  const items=[];
  for(let r=hi+1;r<rows.length;r++){
    const row = rows[r]; const get=(n)=>{ const i=idx(n); return i>=0? row[i] : ''; };
    const t=get('Type').trim(); const spec=get('Spec (%AA, EBC...)');
    const it = {
      Type:t, Fournisseur:get('Fournisseur'), Nom:get('Nom'), 'Numéro de lot':get('Numéro de lot'),
      Conditionnement:get('Conditionnement'), Notes:get('Notes'),
      'Qté initiale (g)': parseFloat(String(get('Qté initiale (g)')).replace(',','.')) || null,
      'Qté utilisée (g)': parseFloat(String(get('Qté utilisée (g)')).replace(',','.')) || null,
      'Qté restante (g)': parseFloat(String(get('Qté restante')).replace(',','.')) || null,
      unite:'g'
    };
    if(t==='Malt') it.Spec_EBC = parseFloat(String(spec).replace(',','.')) || null;
    else if(t==='Houblon') it.Spec_AA = parseFloat(String(spec).replace(',','.')) || null;
    else if(t==='Levure') it.Peremption = get('Peremption') || '';
    else it.Spec = spec || '';
    it.id = [it.Type,it.Fournisseur,it.Nom,it['Numéro de lot']].map(s=>String(s||'').trim()).filter(Boolean).join('::');
    items.push(it);
  }
  const state = await getState(); state.ingredients = items.filter(it=> it.Type && it.Nom);
  await setState(state); alert(`Import Excel OK (${state.ingredients.length} lignes)`); renderStocks(state);
}
async function importFromCSV(file){
  const text = await file.text(); const lines = text.replace(/\r/g,'').split('\n').filter(x=>x.trim().length>0);
  const rows = lines.map(line=>{ const out=[]; let cur=''; let q=false; for(let i=0;i<line.length;i++){ const ch=line[i], nx=line[i+1];
    if(ch==='"'&& q && nx=== '"'){ cur+='"'; i++; continue; } if(ch==='"'){ q=!q; continue; } if(ch===',' && !q){ out.push(cur); cur=''; continue; } cur+=ch; } out.push(cur); return out; });
  const headers = rows[0]; const idx=(name)=> headers.findIndex(h=>h.trim().toLowerCase()===name.trim().toLowerCase());
  const needed = ['Type','Fournisseur','Nom','Numéro de lot','Spec (%AA, EBC...)','Conditionnement','Notes','Nom + Fournisseur','Qté initiale (g)','Qté utilisée (g)','Qté restante'];
  const missing = needed.filter(n=> idx(n)===-1); if(missing.length) return alert('Colonnes manquantes: '+missing.join(', '));
  const items = rows.slice(1).map(r=>{
    const get=(n)=> r[idx(n)] ?? ''; const t=get('Type').trim(); const spec=get('Spec (%AA, EBC...)');
    const it = {
      Type:t, Fournisseur:get('Fournisseur'), Nom:get('Nom'), 'Numéro de lot':get('Numéro de lot'),
      Conditionnement:get('Conditionnement'), Notes:get('Notes'),
      'Qté initiale (g)': parseFloat(String(get('Qté initiale (g)')).replace(',','.')) || null,
      'Qté utilisée (g)': parseFloat(String(get('Qté utilisée (g)')).replace(',','.')) || null,
      'Qté restante (g)': parseFloat(String(get('Qté restante')).replace(',','.')) || null, unite:'g'
    };
    if(t==='Malt') it.Spec_EBC = parseFloat(String(spec).replace(',','.')) || null;
    else if(t==='Houblon') it.Spec_AA = parseFloat(String(spec).replace(',','.')) || null;
    else if(t==='Levure') it.Peremption = get('Peremption') || '';
    else it.Spec = spec || '';
    it.id = [it.Type,it.Fournisseur,it.Nom,it['Numéro de lot']].map(s=>String(s||'').trim()).filter(Boolean).join('::');
    return it;
  });
  const state = await getState(); state.ingredients = items.filter(it=> it.Type && it.Nom);
  await setState(state); alert(`Import CSV OK (${state.ingredients.length} lignes)`); renderStocks(state);
}
byId('btn-import-xlsx')?.addEventListener('click', ()=>{ const f=byId('import-xlsx').files[0]; if(!f) return alert('Choisir un .xlsx'); importFromSheetJS(f); });
byId('btn-import-csv')?.addEventListener('click', ()=>{ const f=byId('import-csv').files[0]; if(!f) return alert('Choisir un .csv'); importFromCSV(f); });
byId('export-json')?.addEventListener('click', async ()=>{
  const state = await getState(); const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='crabstock.json'; a.click();
});

// Ajouter format contenants
byId('add-format')?.addEventListener('click', async ()=>{
  const state = await getState(); const group=byId('new-format-group').value; const size=(byId('new-format-size').value||'').trim();
  if(!size) return alert('Format vide.'); if(!state.containers[group]) state.containers[group]={}; if(state.containers[group][size]==null) state.containers[group][size]=0;
  await setState(state); alert(`Format ajouté: ${group}.${size}`);
});

// Boot
window.addEventListener('DOMContentLoaded', async ()=>{
  const state = await getState(); renderStocks(state);
  byId('bouteilles-33') && (byId('bouteilles-33').value = state.containers.bouteilles['33cl']||0);
  byId('bouteilles-50') && (byId('bouteilles-50').value = state.containers.bouteilles['50cl']||0);
  byId('bouteilles-75') && (byId('bouteilles-75').value = state.containers.bouteilles['75cl']||0);
  byId('canettes-44')   && (byId('canettes-44').value   = state.containers.canettes['44cl']||0);
});
