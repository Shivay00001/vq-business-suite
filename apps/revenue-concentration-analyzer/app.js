/* ============================================================
   VisionQuantech Business Suite — Revenue Concentration Analyzer
   apps/revenue-concentration-analyzer/app.js

   Herfindahl–Hirschman style concentration over customers (or SKUs):
     share_i = revenue_i / total (in %)
     HHI     = Σ share_i²          (0–10,000 scale)
     top-1 share, top-3 share, effective count N* = 10,000 / HHI

   Risk rating (antitrust-style bands):
     HHI < 1500            -> Diversified
     1500 <= HHI < 2500    -> Moderate
     HHI >= 2500           -> Concentrated / high risk

   "What if my top customer leaves?" impact is computed too.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_ITEMS = 25;
  var MAX_AMT = 10000000000;

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function validName(v) {
    var s = String(v == null ? '' : v).trim().slice(0, 60);
    if (!s) return { ok: false, error: 'Name is required.' };
    return { ok: true, value: s };
  }

  function validAmt(v, name) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (n === 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  /** Add an entity (customer/SKU) to the list (max 25). */
  function addItem(items, item) {
    items = Array.isArray(items) ? items.slice() : [];
    if (items.length >= MAX_ITEMS) return { ok: false, error: 'List is full (max 25).' };
    var nm = validName(item && item.name);
    if (!nm.ok) return nm;
    var rev = validAmt(item && item.revenue, 'Revenue');
    if (!rev.ok) return rev;
    var exists = items.some(function (x) { return x.name.toLowerCase() === nm.value.toLowerCase(); });
    if (exists) return { ok: false, error: 'This name already exists.' };
    items.push({ name: nm.value, revenue: r2(rev.value) });
    return { ok: true, items: items };
  }

  function removeItem(items, name) {
    items = Array.isArray(items) ? items.slice() : [];
    var n = String(name).toLowerCase();
    return items.filter(function (x) { return x.name.toLowerCase() !== n; });
  }

  /**
   * Concentration analysis.
   * Returns HHI, top-1/top-3 shares, effective count, risk rating,
   * and the revenue impact of losing the top customer/SKU.
   */
  function analyze(items) {
    items = Array.isArray(items) ? items : [];
    if (items.length < 2) return { ok: false, error: 'Enter at least 2 customers/SKUs to measure concentration.' };
    var rows = [];
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var nm = validName(items[i].name); if (!nm.ok) return nm;
      var rev = validAmt(items[i].revenue, 'Revenue'); if (!rev.ok) return rev;
      rows.push({ name: nm.value, revenue: r2(rev.value) });
      total = r2(total + rev.value);
    }
    rows.forEach(function (r) { r.sharePct = r1(r.revenue / total * 100); });
    var ranked = rows.slice().sort(function (a, b) { return b.revenue - a.revenue; });
    var hhi = Math.round(ranked.reduce(function (a, r) { return a + r.sharePct * r.sharePct; }, 0));
    var top1 = ranked[0].sharePct;
    var top3 = r1(ranked.slice(0, 3).reduce(function (a, r) { return a + r.sharePct; }, 0));
    var effN = hhi > 0 ? r1(10000 / hhi) : 0;
    var rating, advice;
    if (hhi < 1500) { rating = 'Diversified'; advice = 'Revenue is well spread. Keep acquiring to stay this way.'; }
    else if (hhi < 2500) { rating = 'Moderate'; advice = 'Watch the top accounts — reduce dependence on the top 1–2.'; }
    else { rating = 'High risk'; advice = 'Concentrated: losing your top customer/SKU would be painful. Diversify urgently.'; }
    var lossTop = ranked[0];
    return {
      ok: true, count: rows.length,
      totalRevenue: total,
      ranked: ranked,
      hhi: hhi, top1Share: top1, top3Share: top3,
      effectiveCount: effN,
      rating: rating, advice: advice,
      topLoss: {
        name: lossTop.name,
        revenueAtRisk: lossTop.revenue,
        revenueAtRiskPct: lossTop.sharePct,
        remainingRevenue: r2(total - lossTop.revenue)
      }
    };
  }

  function fmtINR(n) {
    var v = r2(+n || 0);
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_ITEMS: MAX_ITEMS, addItem: addItem, removeItem: removeItem,
    analyze: analyze, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'revenue-concentration-analyzer';
  var FREE_LIMIT = 20;
  var items = [];
  var mode = 'customer';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('rc-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function persist() { return Vault.save(SLUG, 'items', items); }
  function restore() {
    return Vault.load(SLUG, 'items').then(function (rec) {
      if (Array.isArray(rec)) items = rec.slice(0, MAX_ITEMS);
      renderList();
    });
  }

  function renderList() {
    var wrap = $('rc-list');
    if (!items.length) { wrap.innerHTML = '<p class="vq-hint">No entries yet — add your first one above.</p>'; return; }
    wrap.innerHTML = '<table class="vq-table"><thead><tr><th>Name</th><th style="text-align:right">Revenue</th><th></th></tr></thead><tbody>' +
      items.map(function (x) {
        return '<tr><td>' + esc(x.name) + '</td><td style="text-align:right">' + fmtINR(x.revenue) + '</td>' +
          '<td style="text-align:right"><button type="button" class="vq-link" data-del="' + esc(x.name) + '">delete</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="vq-hint">' + items.length + ' / ' + MAX_ITEMS + ' stored on this device.</p>';
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        items = removeItem(items, b.getAttribute('data-del'));
        persist().then(renderList);
      });
    });
  }

  function renderResult(a) {
    var card = $('rc-result-card');
    card.hidden = false;
    var html;
    if (!a.ok) { html = '<p class="msg-err">' + esc(a.error) + '</p>'; }
    else {
      var cls = a.rating === 'High risk' ? 'msg-err' : (a.rating === 'Moderate' ? '' : 'msg-ok');
      html =
        '<p>Concentration (HHI): <span class="big">' + a.hhi.toLocaleString('en-IN') + '</span> / 10,000 · ' +
        'risk rating: <strong class="' + cls + '">' + esc(a.rating) + '</strong></p>' +
        '<p class="vq-hint">' + esc(a.advice) + '</p>' +
        '<table class="vq-table"><tbody>' +
        '<tr><td>Top 1 share (' + esc(a.ranked[0].name) + ')</td><td style="text-align:right"><strong>' + a.top1Share + '%</strong></td></tr>' +
        '<tr><td>Top 3 share</td><td style="text-align:right"><strong>' + a.top3Share + '%</strong></td></tr>' +
        '<tr><td>Effective number of equal-sized ' + (mode === 'customer' ? 'customers' : 'SKUs') + '</td><td style="text-align:right">' + a.effectiveCount + '</td></tr>' +
        '<tr><td>If <strong>' + esc(a.topLoss.name) + '</strong> leaves</td><td style="text-align:right"><span class="msg-err">−' + fmtINR(a.topLoss.revenueAtRisk) +
        ' (' + a.topLoss.revenueAtRiskPct + '%)</span> → ' + fmtINR(a.topLoss.remainingRevenue) + ' remains</td></tr>' +
        '</tbody></table>' +
        '<table class="vq-table"><thead><tr><th>#</th><th>' + (mode === 'customer' ? 'Customer' : 'SKU') + '</th><th style="text-align:right">Revenue</th><th style="text-align:right">Share</th></tr></thead><tbody>' +
        a.ranked.map(function (r, i) {
          return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td>' +
            '<td style="text-align:right">' + fmtINR(r.revenue) + '</td>' +
            '<td style="text-align:right">' + r.sharePct + '%</td></tr>';
        }).join('') + '</tbody></table>';
    }
    $('rc-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'revenue-concentration-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'revenue-concentration-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I measure customer concentration risk?', a: 'Use the Herfindahl index (HHI): square each customer\'s revenue share % and add them up (0–10,000 scale). Under 1,500 = diversified, 1,500–2,500 = moderate, above 2,500 = high risk.' },
      { q: 'रेवेन्यू कंसंट्रेशन रिस्क कैसे मापें?', a: 'हर ग्राहक के रेवेन्यू शेयर % का वर्ग करके जोड़ें (HHI, 0–10,000)। 1,500 से कम = विविध, 1,500–2,500 = मध्यम, 2,500 से ज़्यादा = ज़्यादा जोखिम।' },
      { q: 'What is a safe top-customer share?', a: 'A common rule: no single customer above 15–20% of revenue. Above 30% you are effectively a captive supplier — negotiate, diversify, or build switching-cost protection.' },
      { q: 'Can I use this for SKUs instead of customers?', a: 'Yes — the same HHI math works for SKU/product concentration. Pick the mode and the interpretation adapts.' },
      { q: 'Is my customer list private?', a: 'Yes — stored only on your device (max 25 entries). Nothing is uploaded.' }
    ]);
    restore();

    $('rc-mode').addEventListener('change', function () {
      mode = $('rc-mode').value;
      $('rc-name-label').textContent = mode === 'customer' ? 'Customer name' : 'SKU / product name';
    });

    $('rc-add').addEventListener('click', function () {
      var r = addItem(items, { name: $('rc-name').value, revenue: $('rc-rev').value });
      if (!r.ok) { msg(r.error, false); return; }
      items = r.items;
      persist().then(function () { msg('Added.', true); $('rc-name').value = ''; $('rc-rev').value = ''; renderList(); });
    });

    $('rc-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('rc-gate'), SLUG, FREE_LIMIT); $('rc-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var a = analyze(items);
      if (!a.ok) { msg(a.error, false); $('rc-result-card').hidden = true; return; }
      msg('', null);
      renderResult(a);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
