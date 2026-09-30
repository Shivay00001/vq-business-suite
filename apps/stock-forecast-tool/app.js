/* ============================================================
   Stock Forecast Tool — pure computation layer.
   items:   {id, name, unit, currentStock, leadDays, safetyQty, avgManual|null}
   history: {id, itemId, date, qty}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateFcItem(it) {
  if (!it || !String(it.name || '').trim()) return 'Item name is required.';
  if (String(it.name).length > 200) return 'Item name too long (max 200 characters).';
  if (!(Number(it.currentStock) >= 0 && Number(it.currentStock) < 1e9))
    return 'Current stock must be 0 or more (and realistic).';
  if (!(Number(it.leadDays) >= 0 && Number(it.leadDays) < 3650))
    return 'Lead time must be 0 or more days (max 3650).';
  if (!(Number(it.safetyQty) >= 0 && Number(it.safetyQty) < 1e9))
    return 'Safety stock must be 0 or more (and realistic).';
  if (it.avgManual !== null && it.avgManual !== undefined && it.avgManual !== '' &&
      !(Number(it.avgManual) >= 0 && Number(it.avgManual) < 1e9))
    return 'Avg daily sales must be 0 or more (and realistic).';
  if (String(it.unit || '').length > 20) return 'Unit too long (max 20 characters).';
  return '';
}

function validateHistory(h) {
  if (!h || !h.itemId) return 'Please pick an item.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(h.date || ''))) return 'Date is required.';
  if (!(Number(h.qty) > 0 && Number(h.qty) < 1e9)) return 'Quantity must be between 0 and 1,00,00,00,000.';
  return '';
}

/**
 * Avg daily sales for an item.
 * Manual value wins; else total sold / distinct days in history; else 0.
 */
function avgDailySales(item, history) {
  if (item.avgManual !== null && item.avgManual !== undefined && item.avgManual !== '' &&
      Number(item.avgManual) >= 0) {
    return round2(Number(item.avgManual));
  }
  var days = {}, total = 0;
  (history || []).forEach(function (h) {
    if (h.itemId !== item.id) return;
    days[h.date] = 1;
    total += Number(h.qty) || 0;
  });
  var n = Object.keys(days).length;
  return n > 0 ? round2(total / n) : 0;
}

/**
 * Forecast for one item.
 * Returns {avgDaily, rop, daysLeft, suggested, needOrder}
 */
function forecastItem(item, history) {
  var avg = avgDailySales(item, history);
  var lead = Number(item.leadDays) || 0;
  var safety = Number(item.safetyQty) || 0;
  var stock = Number(item.currentStock) || 0;
  var rop = round2(avg * lead + safety);
  var suggested = Math.max(0, Math.ceil(rop - stock));
  var daysLeft = avg > 0 ? round2(stock / avg) : null;
  return { avgDaily: avg, rop: rop, daysLeft: daysLeft,
    suggested: suggested, needOrder: stock <= rop && avg > 0 };
}

function forecastReport(items, history) {
  return (items || []).map(function (it) {
    var f = forecastItem(it, history);
    return { item: it, avgDaily: f.avgDaily, rop: f.rop, daysLeft: f.daysLeft,
      suggested: f.suggested, needOrder: f.needOrder };
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function sftInit() {
  var SLUG = 'stock-forecast-tool';
  var SAVE_LIMIT = 25;
  var items = [];
  var history = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Reorder point kya hota hai?',
      a: 'Woh stock level jahan pahunchte hi naya order kar dena chahiye — formula: (Avg daily sales × Lead time) + Safety stock.' },
    { q: 'Safety stock kyun rakhein?',
      a: 'Supplier delay ya achanak demand badhne par stockout se bachne ke liye extra buffer — bina iske har delay me sale rukti hai.' },
    { q: 'Avg daily sales kaise nikle?',
      a: 'Sales history darj karein — app total sold qty ko history ke dino se divide karke avg nikaalta hai. History na ho to manual value bhi daal sakte hain.' },
    { q: 'स्टॉक फोरकास्ट से क्या फायदा है?',
      a: 'Sahi time par sahi quantity ka order — na stockout ka nuksaan, na overstocking me fasa paisa. Chhote business ke liye ye sabse sasta planning tool hai.' }
  ]);
  SEO.softwareApp({
    name: 'Stock Forecast Tool — स्टॉक फोरकास्ट',
    description: 'Free stock forecast tool for Indian SMEs: reorder point & suggested order quantity from avg daily sales, lead time and safety stock.',
    keywords: ['stock forecast', 'स्टॉक फोरकास्ट', 'reorder point calculator', 'reorder level formula', 'safety stock calculator', 'lead time demand', 'demand forecasting inventory', 'inventory planning India']
  });

  el('passSetBtn').addEventListener('click', async function () {
    var msg = el('passMsg');
    try {
      await Vault.setPassphrase(el('passInput').value);
      msg.textContent = '✓ Vault encrypted for this session. Naye saves encrypted honge.';
      el('passInput').value = '';
    } catch (e) {
      msg.textContent = 'Encryption unavailable (' + e.message + ') — data unencrypted save hoga.';
    }
  });
  el('passClearBtn').addEventListener('click', function () {
    Vault.clearPassphrase();
    el('passMsg').textContent = 'Vault locked. Encrypted records padhne ke liye passphrase dobara set karein.';
  });

  function persist() {
    return Vault.save(SLUG, 'data', { items: items, history: history }).catch(function () {});
  }

  function saveItem() {
    var err = el('f-error'); err.textContent = '';
    var name = el('f-name').value.trim();
    var existing = items.filter(function (x) {
      return x.name.toLowerCase() === name.toLowerCase();
    })[0];
    var it = existing || { id: uid('f') };
    it.name = name;
    it.currentStock = parseFloat(el('f-stock').value);
    it.leadDays = parseFloat(el('f-lead').value);
    it.safetyQty = parseFloat(el('f-safety').value);
    it.avgManual = el('f-avg').value === '' ? null : parseFloat(el('f-avg').value);
    it.unit = el('f-unit').value.trim();
    var verr = validateFcItem(it);
    if (verr) { err.textContent = verr; return; }
    if (!existing) items.push(it);
    el('f-name').value = ''; el('f-stock').value = ''; el('f-avg').value = '';
    el('f-lead').value = ''; el('f-safety').value = ''; el('f-unit').value = '';
    persist().then(renderAll);
  }

  function addHist() {
    var err = el('h-error'); err.textContent = '';
    var h = { id: uid('h'), itemId: el('h-item').value, date: el('h-date').value,
      qty: parseFloat(el('h-qty').value) || 0 };
    var verr = validateHistory(h);
    if (verr) { err.textContent = verr; return; }
    history.push(h);
    el('h-qty').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var sel = el('h-item');
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + it.id + '">' + esc(it.name) + '</option>';
    }).join('') || '<option value="">— pehle item add karein —</option>';

    var rows = forecastReport(items, history);
    el('fcBody').innerHTML = rows.length ? rows.map(function (r) {
      var it = r.item;
      var status = r.needOrder ? '<span class="pill p-warn">🛒 Order now</span>'
        : (r.avgDaily > 0 ? '<span class="pill p-in">OK</span>' : '<span class="pill p-out">No sales data</span>');
      return '<tr class="' + (r.needOrder ? 'order' : '') + '"><td>' + esc(it.name) +
        (it.unit ? '<div class="vq-hint">' + esc(it.unit) + '</div>' : '') + '<div>' + status + '</div></td>' +
        '<td class="r">' + r.avgDaily + '</td><td class="r">' + it.leadDays + '</td>' +
        '<td class="r">' + it.safetyQty + '</td><td class="r">' + it.currentStock + '</td>' +
        '<td class="r"><strong>' + r.rop + '</strong></td>' +
        '<td class="r">' + (r.daysLeft === null ? '—' : r.daysLeft) + '</td>' +
        '<td class="r"><strong>' + r.suggested + '</strong></td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-f" data-id="' + it.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="9" class="vq-hint">Abhi koi item nahi hai.</td></tr>';

    el('fcBody').querySelectorAll('.del-f').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this item and its history?')) return;
        var id = b.getAttribute('data-id');
        items = items.filter(function (x) { return x.id !== id; });
        history = history.filter(function (h) { return h.itemId !== id; });
        persist().then(renderAll);
      });
    });

    var hs = history.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-20);
    el('histBody').innerHTML = hs.length ? hs.map(function (h) {
      var it = items.filter(function (x) { return x.id === h.itemId; })[0];
      return '<tr><td>' + esc(h.date) + '</td><td>' + esc(it ? it.name : '(deleted)') + '</td>' +
        '<td class="r">' + h.qty + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-h" data-id="' + h.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="4" class="vq-hint">Koi sales history nahi hai.</td></tr>';

    el('histBody').querySelectorAll('.del-h').forEach(function (b) {
      b.addEventListener('click', function () {
        history = history.filter(function (h) { return h.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(),
        report: forecastReport(items, history)
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('f-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addItemBtn').addEventListener('click', saveItem);
  el('addHistBtn').addEventListener('click', addHist);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('h-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.items)) items = d.items;
    if (d && Array.isArray(d.history)) history = d.history;
    renderAll();
  }).catch(renderAll);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sftInit);
  } else { sftInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validateFcItem: validateFcItem,
    validateHistory: validateHistory, avgDailySales: avgDailySales,
    forecastItem: forecastItem, forecastReport: forecastReport };
}
