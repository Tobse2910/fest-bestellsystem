/* ============================================================================
   WARTESCHLANGE  ·  Anzeige offener Bestellungen + Polling + Wischen.
   Wird von Ausschank UND Admin genutzt.
   ============================================================================ */

/* Rendert die offenen Bestellungen in das Element `el`.
   knownFreshIds: Set von IDs, die schon gesehen wurden (für "neu"-Hervorhebung). */
function renderQueue(el, orders, opts = {}) {
  const { onDone, freshIds = new Set() } = opts;
  const countEl = opts.countEl;
  if (countEl) countEl.textContent = orders.length;

  if (orders.length === 0) {
    el.innerHTML = '<p class="bar-empty">Noch keine offenen Bestellungen</p>';
    return;
  }
  el.innerHTML = '';
  // neueste oben
  [...orders].reverse().forEach((o) => {
    const t = document.createElement('div');
    const isFresh = freshIds.has(o.id);
    t.className = 'ticket' + (isFresh ? ' fresh' : '');
    const seller = o.seller ? `<span class="tseller">${sellerBadge(o.seller)}</span>` : '';
    t.innerHTML = `
      <div class="thead">
        <span class="no">${o.id}</span>
        <span class="thead-right">${seller}<span class="time">${hhmm(o.ts)} Uhr</span></span>
      </div>
      <span class="hint">← wischen</span>
      <ul>${o.items.map((it) => `<li><span class="q">${it.qty}×</span> ${esc(it.name)}</li>`).join('')}</ul>
      ${onDone ? '<button class="done">Erledigt</button>' : ''}`;
    if (onDone) {
      t.querySelector('.done').onclick = () => onDone(o.id);
      enableSwipe(t, () => onDone(o.id));
    }
    el.appendChild(t);
  });
}

/* Startet einen Polling-Controller. Holt alle `intervalMs` die offenen
   Bestellungen und ruft render(). Gibt {stop} zurück. */
function startQueuePolling(el, opts = {}) {
  const { intervalMs = 2000, onDone, countEl } = opts;
  const seen = new Set();
  let firstLoad = true;
  let timer = null;
  let stopped = false;

  async function tick() {
    try {
      const res = await api('open');
      setConn(true);
      const orders = res.orders || [];

      // "frisch" = IDs, die wir vorher noch nicht gesehen haben (außer beim Erstladen)
      const freshIds = new Set();
      orders.forEach((o) => {
        if (!seen.has(o.id) && !firstLoad) freshIds.add(o.id);
        seen.add(o.id);
      });
      firstLoad = false;

      renderQueue(el, orders, { onDone, freshIds, countEl });
    } catch (err) {
      setConn(false);
      if (err.status === 401) { location.href = 'index.html'; return; }
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}

/* Wischen nach links zum Entfernen (Touch + Maus) */
function enableSwipe(elTicket, onDismiss) {
  let startX = 0, dx = 0, active = false;
  const down = (x) => { startX = x; active = true; elTicket.style.transition = 'none'; };
  const move = (x) => {
    if (!active) return;
    dx = x - startX;
    if (dx < 0) elTicket.style.transform = `translateX(${dx}px)`;
    elTicket.style.opacity = String(Math.max(0.3, 1 + dx / 300));
  };
  const up = () => {
    if (!active) return; active = false;
    elTicket.style.transition = 'transform .2s ease, opacity .2s ease';
    if (dx < -120) {
      elTicket.style.transform = 'translateX(-120%)';
      elTicket.style.opacity = '0';
      setTimeout(onDismiss, 170);
    } else {
      elTicket.style.transform = '';
      elTicket.style.opacity = '1';
    }
    dx = 0;
  };
  elTicket.addEventListener('touchstart', (e) => down(e.touches[0].clientX), { passive: true });
  elTicket.addEventListener('touchmove', (e) => move(e.touches[0].clientX), { passive: true });
  elTicket.addEventListener('touchend', up);
  elTicket.addEventListener('mousedown', (e) => down(e.clientX));
  window.addEventListener('mousemove', (e) => move(e.clientX));
  window.addEventListener('mouseup', up);
}
