/* ============================================================================
   ADMIN  ·  Statistik + eingebettete Live-Ansichten (Bar & Kasse)
   ============================================================================ */

let statsTimer = null;
let currentDay = null;

init();

async function init() {
  const role = await guard(['admin']);
  if (!role) return;
  wireLogout();

  try {
    const cfg = await api('config');
    setWho(cfg.name);
    if (cfg.festName) {
      document.querySelectorAll('#festName').forEach((e) => (e.textContent = cfg.festName));
      document.title = `${cfg.festName} · Admin`;
    }
  } catch (_) {}

  wireTabs();
  document.getElementById('daySel').onchange = (e) => {
    currentDay = e.target.value;
    loadStats();
  };

  // Getränke-Verwaltung: Add-Formular verdrahten
  document.getElementById('addIcon').onclick = async () => {
    if (DRINK_IMAGES.length === 0) { try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {} }
    const e = await uiIconPicker(addIconValue, DRINK_IMAGES);
    if (e) { addIconValue = e; document.getElementById('addIcon').innerHTML = iconMarkup(e); }
  };
  document.getElementById('addImageBtn').onclick = () => document.getElementById('addImageFile').click();
  document.getElementById('addImageFile').onchange = uploadDrinkImage;
  document.getElementById('addBtn').onclick = addDrink;

  // Essen-Verwaltung: Add-Formular verdrahten
  const foodIconBtn = document.getElementById('foodIcon');
  if (foodIconBtn) {
    foodIconBtn.onclick = async () => {
      if (DRINK_IMAGES.length === 0) { try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {} }
      const e = await uiIconPicker(addFoodIconValue, DRINK_IMAGES);
      if (e) { addFoodIconValue = e; foodIconBtn.innerHTML = iconMarkup(e); }
    };
    document.getElementById('foodImageBtn').onclick = () => document.getElementById('foodImageFile').click();
    document.getElementById('foodImageFile').onchange = uploadFoodImage;
    document.getElementById('foodBtn').onclick = addFood;
  }

  await loadStats(); // füllt auch die Tages-Auswahl
  startStatsAutoRefresh();
}

/* ---- Tabs: Statistik | Bar (iframe) | Kasse (iframe) ---------------------- */
function wireTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.onclick = () => {
      tabs.forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('panel-' + which).classList.add('active');
      if (which === 'drinks') loadDrinks();
      else if (which === 'food') loadFood();
      else if (which === 'settings') initAdminSettings();
      else ensureIframe(which);
    };
  });
}

/* ========================================================================
   GETRÄNKE VERWALTEN
   ======================================================================== */
let addIconValue = '🍹';
let addFoodIconValue = '🍔';
let addCategoryValue = 'Sonstiges';
let DRINK_IMAGES = [];   // verfügbare Getränke-Bilder für den Auswähler
let CATEGORIES = ['Softdrinks', 'Bier', 'Alkoholische Mischgetränke', 'Kurze', 'Sonstiges'];

async function loadDrinks() {
  const list = document.getElementById('daList');
  let data;
  try {
    data = await api('drinks');
    try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {}
    try {
      const catData = await api('categories');
      CATEGORIES = catData.categories || CATEGORIES;
    } catch (_) {}
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    list.innerHTML = '<p class="da-empty">Konnte nicht laden.</p>';
    return;
  }
  renderDrinksAdmin((data.drinks || []).filter((d) => (d.type || 'drink') !== 'food'));
}

function renderDrinksAdmin(drinks) {
  const list = document.getElementById('daList');
  if (drinks.length === 0) {
    list.innerHTML = '<p class="da-empty">Noch keine Getränke. Oben eins hinzufügen.</p>';
    return;
  }
  list.innerHTML = '';
  drinks.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'da-row';
    row.dataset.id = d.id;
    row.dataset.icon = d.icon;
    const catOptions = CATEGORIES.map(c => `<option value="${c}" ${c === d.category ? 'selected' : ''}>${c}</option>`).join('');
    row.innerHTML = `
      <button type="button" class="icon-btn r-icon">${iconMarkup(d.icon)}</button>
      <input type="text" class="r-name" value="${escapeAttr(d.name)}" maxlength="40">
      <div class="fld"><label>Kategorie</label>
        <select class="r-category">${catOptions}</select></div>
      <div class="fld"><label>Preis</label>
        <div class="price-wrap"><input type="number" class="r-price" value="${Number(d.price).toFixed(2)}" step="0.10" min="0" inputmode="decimal"><span>€</span></div></div>
      <div class="fld"><label>Pfand</label>
        <div class="price-wrap"><input type="number" class="r-pfand" value="${Number(d.pfand || 0).toFixed(2)}" step="0.50" min="0" inputmode="decimal"><span>€</span></div></div>
      <span class="saved">gespeichert ✓</span>
      <button type="button" class="del" title="Löschen">🗑</button>`;

    const iconBtn = row.querySelector('.r-icon');
    iconBtn.onclick = async () => {
      const e = await uiIconPicker(row.dataset.icon, DRINK_IMAGES);
      if (e) { row.dataset.icon = e; iconBtn.innerHTML = iconMarkup(e); saveDrink(row); }
    };
    row.querySelector('.r-name').onchange = () => saveDrink(row);
    row.querySelector('.r-category').onchange = () => saveDrink(row);
    row.querySelector('.r-price').onchange = () => saveDrink(row);
    row.querySelector('.r-pfand').onchange = () => saveDrink(row);
    row.querySelector('.del').onclick = () => deleteDrinkRow(row, d);
    list.appendChild(row);
  });
  updateAddCategorySelect();
}

function updateAddCategorySelect() {
  const sel = document.getElementById('addCategory');
  if (!sel) return;
  const currentValue = sel.value;
  sel.innerHTML = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = currentValue && CATEGORIES.includes(currentValue) ? currentValue : (CATEGORIES[0] || 'Sonstiges');
}

async function saveDrink(row) {
  const id = Number(row.dataset.id);
  const name = row.querySelector('.r-name').value.trim();
  const category = row.querySelector('.r-category').value;
  const price = parseFloat(row.querySelector('.r-price').value);
  const pfand = parseFloat(row.querySelector('.r-pfand').value) || 0;
  const icon = row.dataset.icon;
  if (!name || isNaN(price) || price < 0 || pfand < 0) { loadDrinks(); return; }
  try {
    await api('drink_update', { method: 'POST', body: { id, name, price, pfand, icon, category } });
    const s = row.querySelector('.saved');
    s.classList.add('show');
    setTimeout(() => s.classList.remove('show'), 1400);
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    loadDrinks();
  }
}

async function addDrink() {
  const nameEl = document.getElementById('addName');
  const priceEl = document.getElementById('addPrice');
  const pfandEl = document.getElementById('addPfand');
  const categoryEl = document.getElementById('addCategory');
  const name = nameEl.value.trim();
  const price = parseFloat(priceEl.value);
  const pfand = parseFloat(pfandEl.value) || 0;
  const category = categoryEl ? categoryEl.value : 'Sonstiges';
  if (!name) { nameEl.focus(); return; }
  if (isNaN(price) || price < 0) { priceEl.focus(); return; }
  try {
    await api('drink_add', { method: 'POST', body: { name, price, pfand, icon: addIconValue, category } });
    nameEl.value = ''; priceEl.value = ''; pfandEl.value = '';
    if (categoryEl) categoryEl.value = 'Sonstiges';
    addIconValue = '🍹'; document.getElementById('addIcon').innerHTML = iconMarkup('🍹');
    loadDrinks();
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
  }
}

async function deleteDrinkRow(row, d) {
  const ok = await uiConfirm(`„${d.name}" wirklich löschen?`, { title: 'Getränk löschen' });
  if (!ok) return;
  try {
    await api('drink_delete', { method: 'POST', body: { id: d.id } });
    row.remove();
    if (document.querySelectorAll('#daList .da-row').length === 0) loadDrinks();
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
  }
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ========================================================================
   ESSEN VERWALTEN  ·  gleiche Produkt-Tabelle wie Getränke, aber type='food'.
   Erscheint an der Kasse unter seiner Kategorie. Kein Pfand.
   ======================================================================== */
async function loadFood() {
  const list = document.getElementById('foodList');
  let data;
  try {
    data = await api('drinks');
    try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {}
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    list.innerHTML = '<p class="da-empty">Konnte nicht laden.</p>';
    return;
  }
  renderFoodAdmin((data.drinks || []).filter((d) => (d.type || 'drink') === 'food'));
}

function renderFoodAdmin(foods) {
  const list = document.getElementById('foodList');
  if (foods.length === 0) {
    list.innerHTML = '<p class="da-empty">Noch kein Essen. Oben etwas hinzufügen.</p>';
    return;
  }
  list.innerHTML = '';
  foods.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'da-row';
    row.dataset.id = d.id;
    row.dataset.icon = d.icon;
    row.innerHTML = `
      <button type="button" class="icon-btn r-icon">${iconMarkup(d.icon)}</button>
      <input type="text" class="r-name" value="${escapeAttr(d.name)}" maxlength="40">
      <div class="fld"><label>Kategorie</label>
        <input type="text" class="r-category" value="${escapeAttr(d.category || 'Essen')}" maxlength="40"></div>
      <div class="fld"><label>Preis</label>
        <div class="price-wrap"><input type="number" class="r-price" value="${Number(d.price).toFixed(2)}" step="0.10" min="0" inputmode="decimal"><span>€</span></div></div>
      <span class="saved">gespeichert ✓</span>
      <button type="button" class="del" title="Löschen">🗑</button>`;

    const iconBtn = row.querySelector('.r-icon');
    iconBtn.onclick = async () => {
      const e = await uiIconPicker(row.dataset.icon, DRINK_IMAGES);
      if (e) { row.dataset.icon = e; iconBtn.innerHTML = iconMarkup(e); saveFood(row); }
    };
    row.querySelector('.r-name').onchange = () => saveFood(row);
    row.querySelector('.r-category').onchange = () => saveFood(row);
    row.querySelector('.r-price').onchange = () => saveFood(row);
    row.querySelector('.del').onclick = () => deleteFoodRow(row, d);
    list.appendChild(row);
  });
}

async function saveFood(row) {
  const id = Number(row.dataset.id);
  const name = row.querySelector('.r-name').value.trim();
  const category = row.querySelector('.r-category').value.trim() || 'Essen';
  const price = parseFloat(row.querySelector('.r-price').value);
  const icon = row.dataset.icon;
  if (!name || isNaN(price) || price < 0) { loadFood(); return; }
  try {
    await api('drink_update', { method: 'POST', body: { id, name, price, pfand: 0, icon, category } });
    const s = row.querySelector('.saved');
    s.classList.add('show');
    setTimeout(() => s.classList.remove('show'), 1400);
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    loadFood();
  }
}

async function addFood() {
  const nameEl = document.getElementById('foodName');
  const priceEl = document.getElementById('foodPrice');
  const catEl = document.getElementById('foodCategory');
  const name = nameEl.value.trim();
  const price = parseFloat(priceEl.value);
  const category = (catEl && catEl.value.trim()) || 'Essen';
  if (!name) { nameEl.focus(); return; }
  if (isNaN(price) || price < 0) { priceEl.focus(); return; }
  try {
    await api('drink_add', { method: 'POST', body: { name, price, pfand: 0, icon: addFoodIconValue, category, type: 'food' } });
    nameEl.value = ''; priceEl.value = ''; if (catEl) catEl.value = 'Essen';
    addFoodIconValue = '🍔'; document.getElementById('foodIcon').innerHTML = iconMarkup('🍔');
    loadFood();
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
  }
}

async function deleteFoodRow(row, d) {
  const ok = await uiConfirm(`„${d.name}" wirklich löschen?`, { title: 'Essen löschen' });
  if (!ok) return;
  try {
    await api('drink_delete', { method: 'POST', body: { id: d.id } });
    row.remove();
    if (document.querySelectorAll('#foodList .da-row').length === 0) loadFood();
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
  }
}

async function uploadFoodImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch('api/api.php?action=drink_image_upload', { method: 'POST', body: formData }).then((r) => r.json());
    if (res.error) { alert('Fehler: ' + res.error); return; }
    addFoodIconValue = res.path;
    document.getElementById('foodIcon').innerHTML = `<img class="ic-img" src="${res.path}" alt="">`;
    document.getElementById('foodImageFile').value = '';
    try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {}
  } catch (err) {
    alert('Upload fehlgeschlagen');
  }
}

/* iframes erst laden, wenn der Tab zum ersten Mal geöffnet wird */
function ensureIframe(which) {
  if (which === 'bar') {
    const box = document.getElementById('panel-bar');
    if (!box.querySelector('iframe')) {
      const f = document.createElement('iframe');
      f.src = 'ausschank.html';
      box.appendChild(f);
    }
  } else if (which === 'kasse') {
    const box = document.getElementById('panel-kasse');
    if (!box.querySelector('iframe')) {
      const f = document.createElement('iframe');
      f.src = 'kasse.html';
      box.appendChild(f);
    }
  }
}

/* ---- Statistik laden ----------------------------------------------------- */
async function loadStats() {
  let data;
  try {
    data = await api('stats', { params: currentDay ? { day: currentDay } : null });
    setConn(true);
  } catch (err) {
    setConn(false);
    if (err.status === 401) { location.href = 'index.html'; }
    return;
  }

  currentDay = data.day;
  renderDaySelect(data.days, data.day);

  const revenue = data.revenue || 0;
  const count = data.count || 0;
  document.getElementById('kpiRevenue').textContent = eur(revenue) + ' €';
  document.getElementById('kpiCount').textContent = count;
  document.getElementById('kpiAvg').textContent = eur(count > 0 ? revenue / count : 0) + ' €';

  // Offene Bestellungen (aktueller Stand, unabhängig vom gewählten Tag)
  try {
    const o = await api('open');
    document.getElementById('kpiOpen').textContent = (o.orders || []).length;
  } catch (_) {}

  renderRevChart(data.byHour || []);
  renderTopProducts(data.perDrink || []);
  renderDrinkBars(data.perDrink || []);
  renderDrinks(data.perDrink);
  renderSellers(data.perSeller);
}

function renderDaySelect(days, selected) {
  const sel = document.getElementById('daySel');
  // sicherstellen, dass der ausgewählte Tag enthalten ist (z.B. heute ohne Daten)
  const list = Array.from(new Set([selected, ...(days || [])]));
  sel.innerHTML = '';
  list.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = formatDay(d);
    if (d === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function formatDay(d) {
  // "2026-06-14" -> "Sa, 14.06.2026"
  const [y, m, day] = d.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(day));
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* Auswertung: Bestellungen pro Person (Verkäufer) */
function renderSellers(perSeller) {
  const box = document.getElementById('sellerBox');
  if (!perSeller || perSeller.length === 0) { box.innerHTML = ''; return; }
  const rows = perSeller.map((s) => `
    <tr>
      <td>${esc(s.name)}</td>
      <td class="num qty">${s.count}</td>
      <td class="num">${eur(s.revenue)} €</td>
      <td class="num">${eur(s.total)} €</td>
    </tr>`).join('');
  box.innerHTML = `
    <h3 class="seller-h">Bestellungen pro Person</h3>
    <table class="drinks">
      <thead>
        <tr><th>Person</th><th class="num">Bestellungen</th><th class="num">Umsatz</th><th class="num">inkl. Pfand</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* Umsatzverlauf als Flächen-/Liniendiagramm (SVG, aus byHour) */
function renderRevChart(byHour) {
  const el = document.getElementById('revChart');
  if (!el) return;
  if (!byHour.length) { el.innerHTML = '<p class="stats-empty" style="padding:24px;">Noch keine Daten an diesem Tag.</p>'; return; }
  const max = Math.max(...byHour.map((h) => h.revenue), 0.01);
  el.innerHTML = '<div class="rev-bars">' + byHour.map((h) => {
    const pct = h.revenue > 0 ? Math.max(4, Math.round((h.revenue / max) * 100)) : 0;
    const val = h.revenue > 0 ? '<span class="rev-val">' + eur(h.revenue) + '</span>' : '';
    return '<div class="rev-col" title="' + h.hour + ':00 Uhr · ' + eur(h.revenue) + ' €">' +
             '<div class="rev-slot">' + val + '<div class="rev-bar" style="height:' + pct + '%"></div></div>' +
             '<span class="rev-h">' + h.hour + '</span>' +
           '</div>';
  }).join('') + '</div>';
}

/* Top Produkte nach Umsatz (€) */
function renderTopProducts(perDrink) {
  const el = document.getElementById('topProducts');
  if (!el) return;
  const list = [...perDrink].sort((a, b) => b.sum - a.sum).slice(0, 6);
  if (!list.length) { el.innerHTML = '<p class="stats-empty" style="padding:14px;">—</p>'; return; }
  el.innerHTML = list.map((d) =>
    '<div class="tp-row"><span class="tp-n">' + esc(d.name) + '</span><span class="tp-v">' + eur(d.sum) + ' €</span></div>'
  ).join('');
}

/* Verkaufte Mengen je Getränk (horizontale Balken) */
function renderDrinkBars(perDrink) {
  const el = document.getElementById('drinkChart');
  if (!el) return;
  if (!perDrink.length) { el.innerHTML = '<p class="stats-empty" style="padding:14px;">Noch keine Bestellungen an diesem Tag.</p>'; return; }
  const maxQty = Math.max(...perDrink.map((d) => d.qty), 1);
  el.innerHTML = perDrink.map((d) => {
    const pct = Math.max(3, Math.round((d.qty / maxQty) * 100));
    return '<div class="hbar"><span class="hn">' + escapeAttr(d.name) + '</span>' +
           '<div class="ht"><div class="hf" style="width:' + pct + '%"></div></div>' +
           '<span class="hq">' + d.qty + '×</span></div>';
  }).join('');
}

function renderDrinks(perDrink) {
  const box = document.getElementById('drinksBox');
  if (!perDrink || perDrink.length === 0) {
    box.innerHTML = '<p class="stats-empty">Noch keine Bestellungen an diesem Tag.</p>';
    return;
  }
  let totalQty = 0, totalSum = 0;
  const rows = perDrink.map((d) => {
    totalQty += d.qty; totalSum += d.sum;
    return `<tr>
      <td>${d.name}</td>
      <td class="num qty">${d.qty}×</td>
      <td class="num">${eur(d.sum)} €</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <table class="drinks">
      <thead>
        <tr><th>Getränk</th><th class="num">Menge</th><th class="num">Umsatz</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Gesamt</td><td class="num">${totalQty}×</td><td class="num">${eur(totalSum)} €</td></tr>
      </tfoot>
    </table>`;
}

/* Statistik alle 5 s aktualisieren, solange der Statistik-Tab offen ist */
function startStatsAutoRefresh() {
  clearInterval(statsTimer);
  statsTimer = setInterval(() => {
    const statsActive = document.getElementById('panel-stats').classList.contains('active');
    if (statsActive) loadStats();
  }, 5000);
}

/* Admin-Verwaltung: User löschen, Passwörter, DB Reset */
async function initAdminSettings() {
  const deleteUserBtn = document.getElementById('deleteUserBtn');
  const deleteUserInput = document.getElementById('deleteUserInput');
  const pwBtn = document.getElementById('pwBtn');
  const resetDbBtn = document.getElementById('resetDbBtn');
  const resetOrdersBtn = document.getElementById('resetOrdersBtn');
  const msgEl = document.getElementById('settingsMsg');

  // Kategorien laden
  try {
    const catData = await api('categories');
    CATEGORIES = catData.categories || CATEGORIES;
    renderCategories();
  } catch (_) {}

  function showMsg(text, type = 'success') {
    msgEl.textContent = text;
    msgEl.style.background = type === 'success' ? 'rgba(43,210,126,.2)' : 'rgba(255,90,71,.2)';
    msgEl.style.color = type === 'success' ? '#2BD27E' : '#FF5A47';
    msgEl.style.display = 'block';
    setTimeout(() => (msgEl.style.display = 'none'), 4000);
  }

  // Seite anpassen: Titel, Hintergrundbild, Impressum
  const festNameInput = document.getElementById('festNameInput');
  const festNameBtn   = document.getElementById('festNameBtn');
  const bgBtn         = document.getElementById('bgBtn');
  const bgFile        = document.getElementById('bgFile');
  const impressumInput = document.getElementById('impressumInput');
  const impressumBtn   = document.getElementById('impressumBtn');
  const footerInput    = document.getElementById('footerInput');
  const footerBtn      = document.getElementById('footerBtn');
  const kickerInput    = document.getElementById('kickerInput');
  const sloganInput    = document.getElementById('sloganInput');
  const heroBtn        = document.getElementById('heroBtn');

  try {
    const info = await api('public_info');
    if (festNameInput) festNameInput.value = info.festName || '';
    if (impressumInput) impressumInput.value = info.impressum || '';
    if (footerInput) footerInput.value = info.footerText || '';
    if (kickerInput) kickerInput.value = info.kicker || '';
    if (sloganInput) sloganInput.value = info.slogan || '';
  } catch (_) {}

  if (heroBtn) heroBtn.onclick = async () => {
    try {
      await api('site_update', { method: 'POST', body: { kicker: kickerInput.value, slogan: sloganInput.value } });
      showMsg('✓ Startseiten-Texte gespeichert.');
    } catch (err) { showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error'); }
  };

  if (festNameBtn) festNameBtn.onclick = async () => {
    const festName = festNameInput.value.trim();
    if (!festName) { showMsg('Bitte einen Titel/Namen eingeben.', 'error'); return; }
    try {
      await api('site_update', { method: 'POST', body: { festName } });
      document.querySelectorAll('#festName').forEach((e) => (e.textContent = festName));
      document.title = festName + ' · Admin';
      showMsg('✓ Titel gespeichert.');
    } catch (err) { showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error'); }
  };

  if (impressumBtn) impressumBtn.onclick = async () => {
    try {
      await api('site_update', { method: 'POST', body: { impressum: impressumInput.value } });
      showMsg('✓ Impressum gespeichert.');
    } catch (err) { showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error'); }
  };

  if (footerBtn) footerBtn.onclick = async () => {
    try {
      await api('site_update', { method: 'POST', body: { footerText: footerInput.value } });
      showMsg('✓ Fußzeile gespeichert.');
    } catch (err) { showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error'); }
  };

  if (bgBtn && bgFile) {
    bgBtn.onclick = () => bgFile.click();
    bgFile.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showMsg('Bild wird hochgeladen …');
      const fd = new FormData();
      fd.append('image', file);
      try {
        const res = await fetch('api/api.php?action=bg_upload', { method: 'POST', body: fd }).then((r) => r.json());
        if (res.error) { showMsg('Fehler: ' + res.error, 'error'); return; }
        showMsg('✓ Hintergrund gespeichert. Bitte Strg+Shift+R drücken.');
        bgFile.value = '';
      } catch (_) { showMsg('Upload fehlgeschlagen.', 'error'); }
    };
  }

  if (deleteUserBtn) deleteUserBtn.onclick = async () => {
    const seller = deleteUserInput.value.trim();
    if (!seller) {
      showMsg('Bitte Namen eingeben.', 'error');
      return;
    }
    const ok = await uiConfirm(
      'Alle Bestellungen von "' + esc(seller) + '" werden gelöscht. Wirklich?',
      { title: 'User löschen', okText: 'Ja, löschen', danger: true }
    );
    if (!ok) return;
    try {
      const res = await api('admin_delete_user', { method: 'POST', body: { seller } });
      showMsg('✓ ' + res.message);
      deleteUserInput.value = '';
      setTimeout(() => loadStats(), 500);
    } catch (err) {
      showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error');
    }
  };

  if (pwBtn) pwBtn.onclick = async () => {
    const role = document.getElementById('pwRole').value;
    const password = document.getElementById('pwInput').value.trim();
    if (!password || password.length < 3) {
      showMsg('Passwort mindestens 3 Zeichen.', 'error');
      return;
    }
    try {
      await api('admin_set_password', { method: 'POST', body: { role, password } });
      showMsg('✓ Passwort für "' + role + '" geändert.');
      document.getElementById('pwInput').value = '';
    } catch (err) {
      showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error');
    }
  };

  if (resetDbBtn) resetDbBtn.onclick = async () => {
    const ok = await uiConfirm(
      'ALLE eingegebenen Bestellungen/Verkäufe werden gelöscht. Getränke, Preise und Bilder bleiben erhalten. Wirklich?',
      { title: 'Bestellungen löschen', okText: 'JA, LÖSCHEN', danger: true }
    );
    if (!ok) return;
    try {
      const res = await api('admin_reset_orders', { method: 'POST', body: { confirm: true } });
      showMsg('✓ ' + (res.message || 'Bestellungen gelöscht.'));
      setTimeout(() => loadStats(), 800);
    } catch (err) {
      showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error');
    }
  };

  if (resetOrdersBtn) resetOrdersBtn.onclick = async () => {
    const ok = await uiConfirm(
      'Alle Bestellungen werden gelöscht. Getränke bleiben.',
      { title: 'Bestellungen löschen', okText: 'Ja, löschen', danger: true }
    );
    if (!ok) return;
    try {
      const res = await api('admin_reset_orders', { method: 'POST', body: { confirm: true } });
      showMsg('✓ ' + res.message);
      setTimeout(() => loadStats(), 500);
    } catch (err) {
      showMsg('Fehler: ' + (err.data?.error || 'Unbekannt'), 'error');
    }
  };

  const addCatBtn = document.getElementById('addCatBtn');
  const newCatInput = document.getElementById('newCatInput');
  if (addCatBtn) addCatBtn.onclick = addCategory;
  if (newCatInput) newCatInput.onkeyup = (e) => { if (e.key === 'Enter') addCategory(); };
}

function renderCategories() {
  const list = document.getElementById('catList');
  if (!list) return;
  list.innerHTML = '';
  CATEGORIES.forEach((cat, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.innerHTML = `
      <input type="text" value="${escapeAttr(cat)}" style="flex:1; padding:10px 12px; border-radius:10px; background:var(--navy); border:1px solid var(--border-2); color:var(--text); font-size:15px;">
      <button class="btn" style="background:rgba(255,90,71,.14); border:1px solid rgba(255,90,71,.3); color:var(--red); padding:10px 14px; font-weight:600; cursor:pointer;">Entfernen</button>`;
    const input = row.querySelector('input');
    const delBtn = row.querySelector('.btn');
    input.onchange = () => saveCategories();
    delBtn.onclick = () => {
      CATEGORIES.splice(idx, 1);
      saveCategories();
    };
    list.appendChild(row);
  });
}

async function addCategory() {
  const input = document.getElementById('newCatInput');
  const cat = input.value.trim();
  if (!cat) { input.focus(); return; }
  if (!CATEGORIES.includes(cat)) {
    CATEGORIES.push(cat);
    input.value = '';
    await saveCategories();
  }
}

async function saveCategories() {
  const inputs = document.querySelectorAll('#catList input[type=text]');
  const cats = Array.from(inputs).map(i => i.value.trim()).filter(c => c);
  if (cats.length === 0) {
    CATEGORIES = ['Sonstiges'];
  } else {
    CATEGORIES = cats;
  }
  try {
    await api('categories_update', { method: 'POST', body: { categories: CATEGORIES } });
    renderCategories();
    updateAddCategorySelect();
    loadDrinks();
  } catch (_) {}
}

/* ---- Bild-Upload für Getränke ------------------------------------------- */
async function uploadDrinkImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch('api/api.php?action=drink_image_upload', {
      method: 'POST',
      headers: { 'X-Login': localStorage.getItem('login') || '' },
      body: formData
    }).then(r => r.json());
    if (res.error) { alert('Fehler: ' + res.error); return; }
    addIconValue = res.path;
    document.getElementById('addIcon').innerHTML = `<img class="ic-img" src="${res.path}" alt="">`;
    document.getElementById('addImageFile').value = '';
    try { DRINK_IMAGES = (await api('drink_images')).images || []; } catch (_) {}
  } catch (err) {
    alert('Upload fehlgeschlagen');
  }
}
