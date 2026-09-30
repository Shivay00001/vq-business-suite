/* ============================================================
   VisionQuantech Business Suite — Repeat Purchase Predictor
   apps/repeat-purchase-predictor/app.js

   Pure functions first (no DOM) — tested under node.
   From an item's purchase history (date + qty), current stock
   on hand and supplier lead time, predicts the reorder date:
     avgDailyUsage = total purchased / days between first and
       last purchase (min 1 day)
     daysOfCover  = currentStock / avgDailyUsage
     reorderDate  = today + (daysOfCover − leadTime − safetyDays)
   If the reorder date is today or past → "order now".
   Seasonal or lumpy demand makes the average misleading —
   stated on-screen.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_ITEMS = 25;
  var MAX_PURCHASES = 60;

  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }
  function toUTC(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(dateStr, n) {
    var d = new Date(toUTC(dateStr) + Math.round(n) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function validatePurchase(p) {
    if (!p || typeof p !== 'object') return { ok: false, error: 'Purchase must be an object.' };
    if (!isDateStr(p.date)) return { ok: false, error: 'Purchase date must be YYYY-MM-DD.' };
    var q = Number(p.qty);
    if (!isFinite(q) || q <= 0) return { ok: false, error: 'Purchase qty must be greater than zero.' };
    if (q > 1e9) return { ok: false, error: 'Purchase qty looks too large.' };
    return { ok: true, value: { date: p.date, qty: q } };
  }

  function validateItem(it) {
    if (!it || typeof it !== 'object') return { ok: false, error: 'Item data is required.' };
    if (!String(it.name || '').trim()) return { ok: false, error: 'Item name is required.' };
    if (String(it.name).length > 120) return { ok: false, error: 'Item name too long (max 120).' };
    if (!Array.isArray(it.purchases) || it.purchases.length === 0)
      return { ok: false, error: 'Add at least one past purchase.' };
    if (it.purchases.length > MAX_PURCHASES) return { ok: false, error: 'Max ' + MAX_PURCHASES + ' purchases per item.' };
    var ps = [];
    for (var i = 0; i < it.purchases.length; i++) {
      var v = validatePurchase(it.purchases[i]);
      if (!v.ok) return { ok: false, error: 'Purchase ' + (i + 1) + ': ' + v.error };
      ps.push(v.value);
    }
    ps.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var stock = Number(it.currentStock);
    if (!isFinite(stock) || stock < 0) return { ok: false, error: 'Current stock cannot be negative.' };
    if (stock > 1e9) return { ok: false, error: 'Current stock looks too large.' };
    var lead = Number(it.leadTime);
    if (!isFinite(lead) || Math.floor(lead) !== lead || lead < 0 || lead > 365)
      return { ok: false, error: 'Lead time must be whole days (0–365).' };
    var safety = Number(it.safetyDays == null || it.safetyDays === '' ? 0 : it.safetyDays);
    if (!isFinite(safety) || Math.floor(safety) !== safety || safety < 0 || safety > 90)
      return { ok: false, error: 'Safety days must be whole days (0–90).' };
    return { ok: true, value: { name: String(it.name).trim(), purchases: ps, currentStock: stock, leadTime: lead, safetyDays: safety } };
  }

  /** Avg daily usage = total qty / days between first and last purchase (min 1). */
  function avgDailyUsage(purchases) {
    if (!Array.isArray(purchases) || purchases.length === 0) return { ok: false, error: 'No purchase history.' };
    var sorted = purchases.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var total = sorted.reduce(function (s, p) { return s + Number(p.qty); }, 0);
    var span = Math.max(1, Math.round((toUTC(sorted[sorted.length - 1].date) - toUTC(sorted[0].date)) / 86400000));
    var usage = total / span;
    return { ok: true, value: Math.round(usage * 1000) / 1000, totalQty: total, spanDays: span };
  }

  /** Full prediction for one item on `today`. */
  function predict(item, today) {
    var v = validateItem(item);
    if (!v.ok) return v;
    var it = v.value;
    var t = isDateStr(today) ? today : new Date().toISOString().slice(0, 10);
    var u = avgDailyUsage(it.purchases);
    if (!u.ok) return u;
    var usage = u.value;
    var cover = usage > 0 ? it.currentStock / usage : Infinity;
    var daysToReorder = Math.floor(cover - it.leadTime - it.safetyDays);
    var reorderDate = addDays(t, Math.min(daysToReorder, 3650));
    var status, label;
    if (!isFinite(cover)) { status = 'unknown'; label = 'No usage detected — cannot predict.'; }
    else if (daysToReorder <= 0) { status = 'order-now'; label = 'Order now — stock covers ~' + Math.max(0, Math.floor(cover)) + ' day(s), less than lead time.'; }
    else if (daysToReorder <= 7) { status = 'due-soon'; label = 'Reorder within ' + daysToReorder + ' day(s).'; }
    else { status = 'ok'; label = 'Reorder in ~' + daysToReorder + ' day(s).'; }
    return {
      ok: true, name: it.name, usagePerDay: usage, spanDays: u.spanDays,
      totalPurchased: u.totalQty, daysOfCover: isFinite(cover) ? Math.round(cover * 10) / 10 : null,
      leadTime: it.leadTime, safetyDays: it.safetyDays,
      reorderDate: reorderDate, daysToReorder: daysToReorder,
      status: status, label: label
    };
  }

  function predictAll(items, today) {
    if (!Array.isArray(items) || !items.length) return { ok: false, error: 'No items to predict.' };
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var r = predict(items[i], today);
      if (!r.ok) return { ok: false, error: items[i] && items[i].name ? items[i].name + ': ' + r.error : r.error };
      out.push(r);
    }
    var rank = { 'order-now': 0, 'due-soon': 1, 'ok': 2, 'unknown': 3 };
    out.sort(function (a, b) { return rank[a.status] - rank[b.status] || a.daysToReorder - b.daysToReorder; });
    return { ok: true, value: out };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_ITEMS: MAX_ITEMS, MAX_PURCHASES: MAX_PURCHASES,
    isDateStr: isDateStr, validatePurchase: validatePurchase,
    validateItem: validateItem, avgDailyUsage: avgDailyUsage,
    predict: predict, predictAll: predictAll,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'repeat-purchase-predictor';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('p-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  async function loadItems() {
    try { return (await Vault.load(SLUG, 'items')) || []; } catch (e) { return []; }
  }
  async function saveItems(items) {
    await Vault.save(SLUG, 'items', items.slice(0, MAX_ITEMS));
  }

  function addPurchaseRow(date, qty) {
    var tbody = $('p-history');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="vq-input ph-date" type="date" value="' + esc(date || '') + '"></td>' +
      '<td><input class="vq-input ph-qty" type="number" min="0" step="0.01" value="' + esc(qty == null ? '' : qty) + '"></td>' +
      '<td><button type="button" class="vq-btn vq-btn-ghost ph-del" title="Remove">&times;</button></td>';
    tr.querySelector('.ph-del').addEventListener('click', function () {
      if (tbody.rows.length > 1) tbody.removeChild(tr);
    });
    tbody.appendChild(tr);
  }

  function readPurchases() {
    var out = [], rows = $('p-history').rows;
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].querySelector('.ph-date').value, q = rows[i].querySelector('.ph-qty').value;
      if (!d && !q) continue;
      out.push({ date: d, qty: q });
    }
    return out;
  }

  function statusBadge(st) {
    var map = {
      'order-now': '<span class="a-badge a-bad">Order now</span>',
      'due-soon': '<span class="a-badge a-wait">Due soon</span>',
      'ok': '<span class="a-badge a-ok">On track</span>',
      'unknown': '<span class="a-badge a-wait">Unknown</span>'
    };
    return map[st] || '';
  }

  async function renderItems() {
    var items = await loadItems();
    var t = todayStr();
    if (!items.length) { $('p-items').innerHTML = '<p class="vq-hint">No items yet — add your first item above. Max ' + MAX_ITEMS + ' items on this device.</p>'; return; }
    var r = predictAll(items, t);
    if (!r.ok) { $('p-items').innerHTML = '<p class="msg-err">' + esc(r.error) + '</p>'; return; }
    $('p-items').innerHTML = r.value.map(function (p) {
      return '<div class="a-req"><div class="a-req-head"><strong>' + esc(p.name) + '</strong> ' + statusBadge(p.status) + '</div>' +
        '<p class="vq-hint">Usage ~' + p.usagePerDay + '/day (' + p.totalPurchased + ' over ' + p.spanDays + 'd) · covers ~' + (p.daysOfCover == null ? '—' : p.daysOfCover) + ' days · lead ' + p.leadTime + 'd · safety ' + p.safetyDays + 'd</p>' +
        '<p>Reorder by: <strong>' + esc(p.reorderDate) + '</strong> <span class="vq-hint">' + esc(p.label) + '</span></p>' +
        '<p><button class="vq-btn vq-btn-ghost p-del-item" data-name="' + esc(p.name) + '" type="button">Delete</button></p></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.p-del-item'), function (b) {
      b.addEventListener('click', async function () {
        var l = await loadItems();
        l = l.filter(function (x) { return x.name !== b.getAttribute('data-name'); });
        await saveItems(l); renderItems();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'repeat-purchase-predictor-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'repeat-purchase-predictor-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I predict when to reorder stock?', a: 'Add the item, its past purchases (date + quantity), current stock on hand and supplier lead time. The tool computes average daily usage from your history and gives a reorder date: today + (days of cover − lead time − safety days).' },
      { q: 'रीऑर्डर की तारीख कैसे जानें?', a: 'आइटम, पुरानी खरीद (तारीख + मात्रा), मौजूदा स्टॉक और सप्लायर लीड टाइम डालें — टूल औसत दैनिक खपत से रीऑर्डर तारीख बताएगा।' },
      { q: 'How is average daily usage calculated?', a: 'Total quantity purchased divided by the days between the first and last purchase (minimum 1 day). It assumes roughly steady consumption — see the caveat for seasonal items.' },
      { q: 'औसत दैनिक खपत कैसे निकलती है?', a: 'कुल खरीदी गई मात्रा ÷ पहली और आखिरी खरीद के बीच के दिन (कम से कम 1 दिन)।' },
      { q: 'What if my demand is seasonal?', a: 'The average will mislead for lumpy or seasonal demand — it may tell you to reorder too late or too early. Use only recent, representative history, or split the item into seasons.' },
      { q: 'Is my purchase history stored online?', a: 'No. Up to 25 items with their history are saved in your browser vault on this device only.' }
    ]);

    addPurchaseRow(); addPurchaseRow();
    renderItems();

    $('p-add-row').addEventListener('click', function () {
      if ($('p-history').rows.length < MAX_PURCHASES) addPurchaseRow();
    });

    $('p-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var item = {
        name: $('p-name').value, purchases: readPurchases(),
        currentStock: $('p-stock').value, leadTime: $('p-lead').value, safetyDays: $('p-safety').value
      };
      var v = validateItem(item);
      if (!v.ok) { msg(v.error, false); return; }
      var items = await loadItems();
      if (items.length >= MAX_ITEMS && !items.some(function (x) { return x.name === v.value.name; })) {
        msg('Item list is full (max ' + MAX_ITEMS + '). Delete an item first.', false); return;
      }
      items = items.filter(function (x) { return x.name !== v.value.name; });
      items.push(v.value);
      await saveItems(items);
      msg('Item saved.', true);
      $('p-name').value = ''; $('p-stock').value = ''; $('p-history').innerHTML = '';
      addPurchaseRow(); addPurchaseRow();
      renderItems();
      $('p-result-card').hidden = true;
    });

    $('p-predict').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var items = await loadItems();
      var r = predictAll(items, todayStr());
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      $('p-result').innerHTML = r.value.map(function (p) {
        return '<p>' + statusBadge(p.status) + ' <strong>' + esc(p.name) + '</strong> — reorder by <strong>' + esc(p.reorderDate) + '</strong> <span class="vq-hint">' + esc(p.label) + '</span></p>';
      }).join('');
      $('p-result-card').hidden = false;
      $('p-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
