/* ============================================================================
   KASSE  ·  Bestellung aufnehmen, senden, sowie gesendete Bestellungen
            korrigieren (bearbeiten) oder löschen.
   ============================================================================ */

let DRINKS = [];          // [{name, price}] aus der Server-Config
let current = {};         // { name: anzahl } – laufende Bestellung
let onSite = {};          // { name: true/false } – vor Ort trinken (kein Pfand)
let pfandReturn = 0;      // Pfand-Rückgabe-Betrag (Euro = Anzahl × Satz)
let pfandReturnCount = 0; // Anzahl zurückgegebener Becher
let sending = false;
let editingId = null;     // null = neue Bestellung, sonst ID der bearbeiteten
let selectedCategory = null;  // null = alle Getränke, sonst Kategorienname

/* Laufende Bestellung lokal im Browser sichern, damit sie ein Neuladen übersteht. */
const LS_KEY = 'strassenfest_order_v2';
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ current, onSite, editingId })); } catch (_) {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && data.current && typeof data.current === 'object') {
      // nur Getränke übernehmen, die es noch gibt (Admin könnte eins gelöscht haben)
      const valid = {};
      Object.keys(data.current).forEach((name) => {
        if (DRINKS.find((g) => g.name === name) && data.current[name] > 0) valid[name] = data.current[name];
      });
      current = valid;
      onSite = data.onSite || {};
      editingId = data.editingId || null;
      if (editingId) {
        document.getElementById('orderTitle').textContent = 'Bearbeiten';
        document.getElementById('editText').textContent = `Du bearbeitest Bestellung #${editingId}`;
        document.getElementById('editBanner').classList.add('show');
      }
    }
  } catch (_) {}
}

const itemsEl = document.getElementById('items');
const menuEl  = document.getElementById('menu');

init();

async function init() {
  const role = await guard(['kasse']);
  if (!role) return;
  wireLogout();

  let cfg;
  try {
    cfg = await api('config');
    setConn(true);
  } catch (_) {
    setConn(false);
    menuEl.innerHTML = '<p class="empty">Server nicht erreichbar. Seite neu laden.</p>';
    return;
  }

  DRINKS = cfg.drinks || [];
  setWho(cfg.name);
  if (cfg.festName) {
    document.querySelectorAll('#festName').forEach((e) => (e.textContent = cfg.festName));
    document.title = `${cfg.festName} · Kasse`;
  }

  renderCategories();
  renderMenu();
  const catToggleBtn = document.getElementById('catToggle');
  if (catToggleBtn) catToggleBtn.onclick = toggleCatMenu;
  loadLocal();            // gespeicherte (noch nicht gesendete) Bestellung wiederherstellen
  renderOrder();
  startDrinksPolling();   // Preise/Getränke in Echtzeit übernehmen

  document.getElementById('clearBtn').onclick = () => { current = {}; onSite = {}; pfandReturn = 0; pfandReturnCount = 0; renderOrder(); };
  document.getElementById('sendBtn').onclick = sendOrder;
  document.getElementById('cancelEdit').onclick = exitEdit;

  // Pfandrückgabe: Becher-Zähler (Anzahl × Pfand-Satz, wird automatisch berechnet)
  const pfMinus = document.getElementById('pfandMinus');
  const pfPlus  = document.getElementById('pfandPlus');
  if (pfMinus) pfMinus.onclick = () => { pfandReturnCount = Math.max(0, pfandReturnCount - 1); renderOrder(); };
  if (pfPlus)  pfPlus.onclick  = () => { pfandReturnCount += 1; renderOrder(); };

  // Overlay "Letzte Bestellungen"
  document.getElementById('recentBtn').onclick = openRecent;
  document.getElementById('closeRecent').onclick = closeRecent;
  document.getElementById('recentOverlay').onclick = (e) => {
    if (e.target.id === 'recentOverlay') closeRecent();
  };
}

function renderCategories() {
  const catEl = document.getElementById('catFilter');
  const categories = ['Alle', ...new Set(DRINKS.map(d => d.category || 'Sonstiges'))];
  catEl.innerHTML = '';
  categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn' + (selectedCategory === (cat === 'Alle' ? null : cat) ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = () => {
      selectedCategory = (cat === 'Alle' ? null : cat);
      renderCategories();
      renderMenu();
      closeCatMenu();   // Hamburger-Dropdown nach Auswahl schließen
    };
    catEl.appendChild(btn);
  });
  // Aktuelle Kategorie im Hamburger-Button anzeigen
  const lbl = document.getElementById('catCurrentLabel');
  if (lbl) lbl.textContent = selectedCategory || 'Alle';
}

/* Kategorie-Hamburger auf/zu */
function toggleCatMenu() {
  const cf = document.getElementById('catFilter');
  const tg = document.getElementById('catToggle');
  if (!cf) return;
  const open = cf.classList.toggle('open');
  if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeCatMenu() {
  const cf = document.getElementById('catFilter');
  const tg = document.getElementById('catToggle');
  if (cf) cf.classList.remove('open');
  if (tg) tg.setAttribute('aria-expanded', 'false');
}

function renderMenu() {
  menuEl.innerHTML = '';
  const filtered = selectedCategory
    ? DRINKS.filter(g => (g.category || 'Sonstiges') === selectedCategory)
    : DRINKS;

  if (filtered.length === 0) {
    menuEl.innerHTML = '<p class="empty" style="grid-column:1/-1; margin-top:48px;">Keine Getränke in dieser Kategorie.</p>';
    return;
  }

  filtered.forEach((g) => {
    const b = document.createElement('button');
    const hasImg = isImageIcon(g.icon);
    b.className = 'drink' + (hasImg ? ' has-img' : '');
    const visual = hasImg
      ? `<span class="dbg" style="background-image:url('${g.icon}')"></span><span class="dover"></span>`
      : `<span class="dicon">${iconMarkup(g.icon)}</span>`;
    const pfandTag = (g.pfand > 0) ? `<span class="pfandtag">+ ${eur(g.pfand)} € Pfand</span>` : '';
    b.innerHTML = `${visual}
                   <span class="name">${g.name}</span>
                   <span class="price">${eur(g.price)}</span>
                   ${pfandTag}`;
    b.onclick = () => { current[g.name] = (current[g.name] || 0) + 1; renderOrder(); };
    menuEl.appendChild(b);
  });
}

/* Holt regelmäßig die Getränke-Config; bei Änderung (neuer Preis, neues/gelöschtes
   Getränk) wird das Menü sofort aktualisiert – ohne die laufende Bestellung zu verlieren. */
function startDrinksPolling() {
  setInterval(async () => {
    try {
      const cfg = await api('config');
      const fresh = JSON.stringify(cfg.drinks || []);
      if (fresh !== JSON.stringify(DRINKS)) {
        DRINKS = cfg.drinks || [];
        renderCategories();
        renderMenu();
        renderOrder();
      }
    } catch (_) { /* still ignorieren, nächster Tick versucht es erneut */ }
  }, 5000);
}

function priceOf(name) {
  const d = DRINKS.find((g) => g.name === name);
  return d ? d.price : 0;
}
function pfandOf(name) {
  const d = DRINKS.find((g) => g.name === name);
  return d && d.pfand ? d.pfand : 0;
}
/* Pfand-Satz (Betrag pro Becher): höchster Pfandwert der Getränke, sonst 2 €. */
function pfandRate() {
  const vals = DRINKS.map((d) => Number(d.pfand) || 0).filter((v) => v > 0);
  return vals.length ? Math.max(...vals) : 2;
}
/* Einheit (Becher/Flasche) + Pfand-Satz aus den Pfand-Positionen der Bestellung ableiten.
   Flaschen erkennen wir an Kategorie "Flaschen" oder "Flasche" im Namen. */
function pfandContext() {
  const names = Object.keys(current).filter((n) => !onSite[n] && pfandOf(n) > 0);
  let bottle = false, cup = false, rate = 0;
  names.forEach((n) => {
    const d = DRINKS.find((g) => g.name === n);
    const isBottle = d && ((d.category === 'Flaschen') || /flasche/i.test(d.name));
    if (isBottle) bottle = true; else cup = true;
    rate = Math.max(rate, pfandOf(n));
  });
  if (rate === 0) rate = pfandRate();
  if (bottle && !cup) return { singular: 'Flasche', plural: 'Flaschen', rate };
  if (cup && !bottle) return { singular: 'Becher', plural: 'Becher', rate };
  return { singular: 'Pfand', plural: 'Pfand', rate };   // gemischt
}

function removeDrink(name) {
  if (!current[name]) return;
  if (--current[name] <= 0) delete current[name];
  renderOrder();
}

function renderOrder() {
  const names = Object.keys(current);
  let drinkTotal = 0;
  let pfandTotal = 0;

  if (names.length === 0) {
    itemsEl.innerHTML = '<p class="empty">Getränk antippen, um zu starten</p>';
  } else {
    itemsEl.innerHTML = '';
    names.forEach((name) => {
      const qty = current[name];
      const pf = onSite[name] ? 0 : pfandOf(name);  // Kein Pfand wenn vor Ort
      drinkTotal += qty * priceOf(name);
      pfandTotal += qty * pf;
      const lineSum = qty * (priceOf(name) + pf);
      const row = document.createElement('div');
      row.className = 'item';
      const isOnSite = onSite[name] ? true : false;
      const pfNote = pf > 0 ? `<span class="ipfand">inkl. ${eur(pf)} € Pfand</span>` : (isOnSite ? '<span class="ipfand" style="color:var(--green);">☕ vor Ort</span>' : '');
      row.innerHTML = `<span class="qty">${qty}×</span>
                       <span class="iname">${name}${pfNote}</span>
                       <span class="sum">${eur(lineSum)} €</span>`;
      const rm = document.createElement('button');
      rm.className = 'rm'; rm.textContent = '−';
      rm.onclick = () => removeDrink(name);

      // Toggle für "Vor Ort trinken" - nur wenn Pfand anfällt
      if (pfandOf(name) > 0) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.style.width = '38px';
        toggle.style.height = '38px';
        toggle.style.border = isOnSite ? '2px solid var(--green)' : '1px solid var(--border)';
        toggle.style.background = isOnSite ? 'rgba(43,210,126,.2)' : 'var(--surface)';
        toggle.style.borderRadius = '10px';
        toggle.style.color = isOnSite ? 'var(--green)' : 'var(--muted)';
        toggle.style.fontSize = '18px';
        toggle.style.cursor = 'pointer';
        toggle.textContent = '☕';
        toggle.title = 'Vor Ort trinken (ohne Pfand)';
        toggle.onclick = () => {
          onSite[name] = !onSite[name];
          renderOrder();
        };
        row.appendChild(toggle);
      }

      row.appendChild(rm);
      itemsEl.appendChild(row);
    });
  }

  // Pfand-Zeile nur zeigen, wenn Pfand anfällt
  const pl = document.getElementById('pfandLine');
  if (pl) {
    if (pfandTotal > 0) {
      pl.style.display = 'flex';
      document.getElementById('pfandSum').textContent = eur(pfandTotal) + ' €';
    } else {
      pl.style.display = 'none';
    }
  }

  // Pfandrückgabe-Zeile (Becher-Zähler: Anzahl × Satz)
  const prl = document.getElementById('pfandReturnLine');
  if (prl) {
    if (pfandTotal > 0) {
      prl.style.display = 'flex';
      const ctx = pfandContext();
      pfandReturn = pfandReturnCount * ctx.rate;
      const cntEl = document.getElementById('pfandReturnCount');
      if (cntEl) cntEl.textContent = pfandReturnCount;
      const unitEl = document.getElementById('pfandReturnUnit');
      if (unitEl) unitEl.textContent = pfandReturnCount === 1 ? ctx.singular : ctx.plural;
      const calcEl = document.getElementById('pfandReturnCalc');
      if (calcEl) calcEl.textContent = pfandReturnCount > 0 ? `${pfandReturnCount} × ${eur(ctx.rate)} €` : '';
      document.getElementById('pfandReturnSum').textContent = '-' + eur(pfandReturn) + ' €';
    } else {
      prl.style.display = 'none';
      pfandReturnCount = 0;
      pfandReturn = 0;
    }
  }

  const totalQty = names.reduce((s, n) => s + current[n], 0);
  document.getElementById('orderCount').textContent = totalQty;
  const finalTotal = drinkTotal + pfandTotal - pfandReturn;
  document.getElementById('total').textContent = eur(Math.max(0, finalTotal));
  const isDisabled = names.length === 0 || sending;
  document.getElementById('sendBtn').disabled = isDisabled;

  saveLocal();   // Stand bei jeder Änderung lokal sichern
}

async function sendOrder() {
  const names = Object.keys(current);
  if (names.length === 0 || sending) return;

  sending = true;
  document.getElementById('sendBtn').disabled = true;
  const items = names.map((name) => ({ name, qty: current[name], onSite: onSite[name] || false }));

  try {
    if (editingId) {
      const res = await api('update', { method: 'POST', body: { id: editingId, items, pfandReturn } });
      setConn(true);
      flash(`Bestellung #${editingId} geändert ✓`);
      exitEdit();
    } else {
      const res = await api('order', { method: 'POST', body: { items, pfandReturn } });
      setConn(true);
      flash(`Bestellung #${res.order.id} gesendet ✓`);
    }
    current = {};
    onSite = {};
    pfandReturn = 0;
    pfandReturnCount = 0;
    renderOrder();
  } catch (err) {
    setConn(false);
    if (err.status === 401) { location.href = 'index.html'; return; }
    flash('Aktion fehlgeschlagen – nochmal versuchen', true);
  } finally {
    sending = false;
    renderOrder();
  }
}

/* ---- Bearbeiten-Modus ----------------------------------------------------- */
function enterEdit(order) {
  editingId = order.id;
  current = {};
  onSite = {};
  pfandReturn = 0;
  pfandReturnCount = 0;
  order.items.forEach((it) => {
    current[it.name] = it.qty;
    if (it.onSite) onSite[it.name] = true;
  });
  document.getElementById('orderTitle').textContent = 'Bearbeiten';
  document.getElementById('editText').textContent = `Du bearbeitest Bestellung #${order.id}`;
  document.getElementById('editBanner').classList.add('show');
  closeRecent();
  renderOrder();
}
function exitEdit() {
  editingId = null;
  onSite = {};
  pfandReturn = 0;
  pfandReturnCount = 0;
  document.getElementById('orderTitle').textContent = 'Bestellung';
  document.getElementById('editBanner').classList.remove('show');
  renderOrder();
}

/* ---- Overlay: letzte Bestellungen ---------------------------------------- */
async function openRecent() {
  document.getElementById('recentOverlay').classList.add('show');
  const list = document.getElementById('recentList');
  list.innerHTML = '<p class="recent-empty">Wird geladen …</p>';
  let data;
  try {
    data = await api('recent', { params: { limit: 25 } });
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    list.innerHTML = '<p class="recent-empty">Konnte nicht laden.</p>';
    return;
  }
  renderRecent(data.orders || []);
}
function closeRecent() { document.getElementById('recentOverlay').classList.remove('show'); }

function renderRecent(orders) {
  const list = document.getElementById('recentList');
  if (orders.length === 0) {
    list.innerHTML = '<p class="recent-empty">Heute noch keine Bestellungen.</p>';
    return;
  }
  list.innerHTML = '';
  orders.forEach((o) => {
    const itemsTxt = o.items.map((it) => `${it.qty}× ${esc(it.name)}`).join(', ');
    const seller = o.seller ? `<span class="rseller">${sellerBadge(o.seller)}</span>` : '';
    const div = document.createElement('div');
    div.className = 'rorder';
    div.innerHTML = `
      <div class="top">
        <span class="rno">${o.id}</span>
        <span class="rtime">${hhmm(o.ts)} Uhr</span>
        <span class="rstatus ${o.status}">${o.status === 'done' ? 'erledigt' : 'offen'}</span>
        ${seller}
        <span class="rtotal">${eur(o.total)} €</span>
      </div>
      <div class="ritems">${itemsTxt}</div>
      <div class="ract">
        <button class="btn gold edit">Bearbeiten</button>
        <button class="btn del">Löschen</button>
      </div>`;
    div.querySelector('.edit').onclick = () => enterEdit(o);
    div.querySelector('.del').onclick = () => deleteOrder(o);
    list.appendChild(div);
  });
}

async function deleteOrder(o) {
  const ok = await uiConfirm(`Bestellung #${o.id} wirklich löschen?`, { title: 'Bestellung löschen' });
  if (!ok) return;
  try {
    await api('delete', { method: 'POST', body: { id: o.id } });
    if (editingId === o.id) exitEdit();
    flash(`Bestellung #${o.id} gelöscht`);
    openRecent(); // Liste neu laden
  } catch (err) {
    if (err.status === 401) { location.href = 'index.html'; return; }
    flash('Löschen fehlgeschlagen', true);
  }
}

let flashTimer = null;
function flash(text, isError = false) {
  const el = document.getElementById('flash');
  el.textContent = text;
  el.style.background = isError ? 'var(--red)' : 'var(--green)';
  el.style.color = isError ? '#fff' : '#06120b';
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
