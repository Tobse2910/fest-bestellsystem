/* ============================================================================
   GEMEINSAME HELFER  ·  von allen Ansichten genutzt
   ============================================================================ */

const API = 'api/api.php';

/* fetch-Wrapper für die API. Wirft bei Fehlern, gibt sonst JSON zurück. */
async function api(action, { method = 'GET', body = null, params = null } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let url = `${API}?action=${encodeURIComponent(action)}`;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') {
        url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
      }
    }
  }
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* Euro-Formatierung: 3.5 -> "3,50" */
const eur = (n) => Number(n).toFixed(2).replace('.', ',');

/* HTML-sicher machen (für Namen etc. in innerHTML) */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Uhrzeit hh:mm aus ms-Zeitstempel */
const hhmm = (ts) =>
  new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/* Schützt eine Seite: prüft die Session-Rolle. Bei fehlender Berechtigung
   zurück zur Startseite. Gibt die aktuelle Rolle zurück. */
async function guard(allowedRoles) {
  let role = null;
  try {
    const s = await api('session');
    role = s.role;
  } catch (_) {}
  if (!role || (!allowedRoles.includes(role) && role !== 'admin')) {
    location.href = 'index.html';
    return null;
  }
  return role;
}

/* Logout-Button verdrahten (sofern vorhanden) */
function wireLogout() {
  const b = document.getElementById('logoutBtn');
  if (!b) return;
  // In einer eingebetteten Ansicht (Admin-iframe) kein Logout anbieten –
  // sonst würde die gemeinsame Session für alle zerstört.
  if (window.self !== window.top) { b.style.display = 'none'; return; }
  b.onclick = async () => {
    try { await api('logout', { method: 'POST' }); } catch (_) {}
    location.href = 'index.html';
  };
}

/* Eigenes Bestätigungs-Modal (statt des Browser-confirm). Gibt ein Promise<bool>. */
function uiConfirm(message, opts = {}) {
  const { title = 'Bestätigen', okText = 'Löschen', cancelText = 'Abbrechen', danger = true } = opts;
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ui-overlay';
    ov.innerHTML = `<div class="ui-modal">
        <div class="ui-title"></div>
        <p class="ui-msg"></p>
        <div class="ui-row">
          <button class="btn ghost ui-cancel"></button>
          <button class="btn ${danger ? 'danger' : 'gold'} ui-ok"></button>
        </div>
      </div>`;
    ov.querySelector('.ui-title').textContent = title;
    ov.querySelector('.ui-msg').textContent = message;
    ov.querySelector('.ui-cancel').textContent = cancelText;
    ov.querySelector('.ui-ok').textContent = okText;
    const done = (v) => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 150); resolve(v); };
    ov.querySelector('.ui-cancel').onclick = () => done(false);
    ov.querySelector('.ui-ok').onclick = () => done(true);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
  });
}

/* Erkennt, ob ein Icon ein Bildpfad ist (statt eines Emojis). */
function isImageIcon(icon) {
  return typeof icon === 'string' && /\.(png|jpe?g|webp|gif|svg)$/i.test(icon);
}
/* Liefert die HTML-Darstellung eines Icons – als <img> oder als Emoji. */
function iconMarkup(icon) {
  if (isImageIcon(icon)) return `<img src="${icon}" alt="" class="dimg">`;
  return `<span class="demoji">${icon || '🍹'}</span>`;
}

/* Icon-Auswähler: Getränke-Bilder (falls vorhanden) + Emojis. Promise<wert|null>. */
const DRINK_ICONS = ['🍺','🍻','🍷','🥂','🥃','🍹','🍸','🍶','🍾','🥤','🧃','💧','🧊','🧉','☕','🍋','🥛','🍊','🍫','⚡'];
function uiIconPicker(current, images = []) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ui-overlay';
    const cell = (val, inner) =>
      `<button type="button" class="ic-cell${val === current ? ' sel' : ''}" data-e="${val}">${inner}</button>`;
    const imgCells = images.map((p) => cell(p, `<img src="${p}" alt="" class="ic-img">`)).join('');
    const imgBlock = images.length
      ? `<div class="ic-label">Bild wählen</div><div class="ic-grid">${imgCells}</div>`
      : `<p style="color:var(--muted); font-size:14px; margin:10px 2px;">Noch keine Bilder vorhanden. Lade im Getränke-Formular über „Bild hochladen“ eins hoch – es erscheint dann hier.</p>`;
    ov.innerHTML = `<div class="ui-modal">
        <div class="ui-title">Bild wählen</div>
        ${imgBlock}
        <div class="ui-row"><button class="btn ghost ic-cancel">Abbrechen</button></div>
      </div>`;
    const done = (v) => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 150); resolve(v); };
    ov.querySelectorAll('.ic-cell').forEach((c) => (c.onclick = () => done(c.dataset.e)));
    ov.querySelector('.ic-cancel').onclick = () => done(null);
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
  });
}

/* Namen sauber darstellen: "max mustermann" -> "Max Mustermann" (auch Bindestrich-Namen). */
function formatName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s\-])([a-zäöüß])/g, (_, sep, ch) => sep + ch.toUpperCase());
}
/* Kleines Personen-Icon (statt Emoji) – übernimmt die Textfarbe. */
const PERSON_SVG = '<svg class="pico" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z"/></svg>';
/* Verkäufer-Badge (Icon + formatierter Name); leerer String, wenn kein Name. */
function sellerBadge(name) {
  const n = formatName(name);
  return n ? PERSON_SVG + '<span class="pname">' + esc(n) + '</span>' : '';
}

/* Eingeloggten Namen in der Kopfzeile anzeigen */
function setWho(name) {
  const el = document.getElementById('whoami');
  if (el) el.innerHTML = sellerBadge(name);
}

/* Verbindungs-LED umschalten */
function setConn(online) {
  document.querySelectorAll('.pill .led').forEach((led) => {
    led.classList.toggle('off', !online);
  });
  document.querySelectorAll('.pill .conn-text').forEach((t) => {
    t.textContent = online ? 'verbunden' : 'keine Verbindung';
  });
}
