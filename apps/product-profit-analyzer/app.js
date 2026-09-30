/* ============================================================
   VisionQuantech Business Suite — Product Profit Analyzer
   apps/product-profit-analyzer/app.js

   Per-SKU profitability: revenue, COGS, gross profit, margin %,
   contribution share; ranks best/worst and gives a weighted
   average margin. SKU list is persisted on-device (max 25).

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SKU = 25;
  var MAX_AMT = 10000000000;

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function validName(v) {
    var s = String(v == null ? '' : v).trim().slice(0, 60);
    if (!s) return { ok: false, error: 'SKU name is required.' };
    return { ok: true, value: s };
  }

  function validAmt(v, name, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  /** Add a SKU to the list (max 25). Returns {ok, skus, error}. */
  function addSKU(skus, sku) {
    skus = Array.isArray(skus) ? skus.slice() : [];
    if (skus.length >= MAX_SKU) return { ok: false, error: 'SKU list is full (max 25). Delete one first.' };
    var nm = validName(sku && sku.name);
    if (!nm.ok) return nm;
    var rev = validAmt(sku && sku.revenue, 'Revenue');
    if (!rev.ok) return rev;
    var cg = validAmt(sku && sku.cogs, 'COGS', true);
    if (!cg.ok) return cg;
    var exists = skus.some(function (s) { return s.name.toLowerCase() === nm.value.toLowerCase(); });
    if (exists) return { ok: false, error: 'A SKU with this name already exists.' };
    skus.push({ name: nm.value, revenue: r2(rev.value), cogs: r2(cg.value) });
    return { ok: true, skus: skus };
  }

  function removeSKU(skus, name) {
    skus = Array.isArray(skus) ? skus.slice() : [];
    var n = String(name).toLowerCase();
    return skus.filter(function (s) { return s.name.toLowerCase() !== n; });
  }

  /**
   * Analyze a SKU list.
   * Returns totals, per-SKU margin/contribution share, ranking, best/worst,
   * and a weighted average margin.
   */
  function analyzeSKUs(skus) {
    skus = Array.isArray(skus) ? skus : [];
    if (!skus.length) return { ok: false, error: 'Add at least one SKU.' };
    var rows = [];
    var totRev = 0, totCogs = 0;
    for (var i = 0; i < skus.length; i++) {
      var s = skus[i];
      var nm = validName(s.name); if (!nm.ok) return nm;
      var rev = validAmt(s.revenue, 'Revenue'); if (!rev.ok) return rev;
      var cg = validAmt(s.cogs, 'COGS', true); if (!cg.ok) return cg;
      var gross = r2(rev.value - cg.value);
      totRev = r2(totRev + rev.value);
      totCogs = r2(totCogs + cg.value);
      rows.push({
        name: nm.value, revenue: r2(rev.value), cogs: r2(cg.value),
        gross: gross,
        marginPct: rev.value > 0 ? r1(gross / rev.value * 100) : 0
      });
    }
    var totGross = r2(totRev - totCogs);
    rows.forEach(function (r) {
      r.contributionShare = totGross !== 0 ? r1(r.gross / totGross * 100) : 0;
    });
    var ranked = rows.slice().sort(function (a, b) { return b.gross - a.gross; });
    return {
      ok: true,
      totalRevenue: totRev, totalCogs: totCogs, totalGross: totGross,
      avgMarginPct: totRev > 0 ? r1(totGross / totRev * 100) : 0,
      rows: rows,
      ranked: ranked,
      best: ranked[0],
      worst: ranked[ranked.length - 1],
      count: rows.length
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
    MAX_SKU: MAX_SKU, addSKU: addSKU, removeSKU: removeSKU,
    analyzeSKUs: analyzeSKUs, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'product-profit-analyzer';
  var FREE_LIMIT = 20;
  var skus = [];

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('pp-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function persist() { return Vault.save(SLUG, 'skus', skus); }
  function restore() {
    return Vault.load(SLUG, 'skus').then(function (rec) {
      if (Array.isArray(rec)) skus = rec.slice(0, MAX_SKU);
      renderList();
    });
  }

  function renderList() {
    var wrap = $('pp-list');
    if (!skus.length) { wrap.innerHTML = '<p class="vq-hint">No SKUs yet — add your first product above.</p>'; return; }
    wrap.innerHTML = '<table class="vq-table"><thead><tr><th>SKU</th><th style="text-align:right">Revenue</th><th style="text-align:right">COGS</th><th></th></tr></thead><tbody>' +
      skus.map(function (s) {
        return '<tr><td>' + esc(s.name) + '</td><td style="text-align:right">' + fmtINR(s.revenue) + '</td>' +
          '<td style="text-align:right">' + fmtINR(s.cogs) + '</td>' +
          '<td style="text-align:right"><button type="button" class="vq-link" data-del="' + esc(s.name) + '">delete</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="vq-hint">' + skus.length + ' / ' + MAX_SKU + ' SKUs saved on this device.</p>';
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        skus = removeSKU(skus, b.getAttribute('data-del'));
        persist().then(renderList);
      });
    });
  }

  function renderResult(a) {
    var card = $('pp-result-card');
    card.hidden = false;
    var html;
    if (!a.ok) { html = '<p class="msg-err">' + esc(a.error) + '</p>'; }
    else {
      html =
        '<p>Portfolio: <strong>' + fmtINR(a.totalGross) + '</strong> gross profit on ' + fmtINR(a.totalRevenue) + ' revenue · ' +
        'weighted avg margin <strong>' + a.avgMarginPct + '%</strong></p>' +
        '<table class="vq-table"><thead><tr><th>#</th><th>SKU</th><th style="text-align:right">Revenue</th>' +
        '<th style="text-align:right">Gross ₹</th><th style="text-align:right">Margin %</th><th style="text-align:right">Share of profit</th></tr></thead><tbody>' +
        a.ranked.map(function (r, i) {
          var cls = i === 0 ? 'msg-ok' : (i === a.ranked.length - 1 ? 'msg-err' : '');
          return '<tr><td>' + (i + 1) + '</td><td class="' + cls + '"><strong>' + esc(r.name) + '</strong></td>' +
            '<td style="text-align:right">' + fmtINR(r.revenue) + '</td>' +
            '<td style="text-align:right">' + fmtINR(r.gross) + '</td>' +
            '<td style="text-align:right">' + r.marginPct + '%</td>' +
            '<td style="text-align:right">' + r.contributionShare + '%</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="vq-hint">🏆 Best: <strong>' + esc(a.best.name) + '</strong> (' + fmtINR(a.best.gross) + ', ' + a.best.marginPct + '% margin) · ' +
        '⚠️ Worst: <strong>' + esc(a.worst.name) + '</strong> (' + fmtINR(a.worst.gross) + ', ' + a.worst.marginPct + '% margin).</p>';
    }
    $('pp-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'product-profit-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'product-profit-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I find my most profitable product?', a: 'For each SKU compute gross profit (revenue − COGS) and margin % (gross ÷ revenue). Rank by gross profit rupees — the SKU contributing the most rupees is your best, regardless of its margin %.' },
      { q: 'सबसे ज़्यादा मुनाफ़ेवाला प्रोडक्ट कैसे पता करें?', a: 'हर SKU का ग्रॉस प्रॉफ़िट (रेवेन्यू − COGS) और मार्जिन % निकालें। रुपयों में सबसे ज़्यादा योगदान देने वाला SKU सबसे अच्छा है — मार्जिन % चाहे जो हो।' },
      { q: 'Margin % vs contribution share — which matters?', a: 'Margin % tells efficiency; contribution share tells rupees. A low-margin, high-volume SKU can fund the business while a high-margin niche SKU cannot — rank by gross rupees first.' },
      { q: 'What if a product has negative margin?', a: 'It destroys value on every sale. Either reprice, cut its cost, or drop it — unless it is a deliberate loss-leader with measured cross-sell, which this tool flags for review.' },
      { q: 'Is my SKU data private?', a: 'Yes — SKUs are stored only on your device (max 25). Nothing is uploaded.' }
    ]);
    restore();

    $('pp-add').addEventListener('click', function () {
      var r = addSKU(skus, { name: $('pp-name').value, revenue: $('pp-rev').value, cogs: $('pp-cogs').value });
      if (!r.ok) { msg(r.error, false); return; }
      skus = r.skus;
      persist().then(function () { msg('SKU added.', true); $('pp-name').value = ''; $('pp-rev').value = ''; $('pp-cogs').value = ''; renderList(); });
    });

    $('pp-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('pp-gate'), SLUG, FREE_LIMIT); $('pp-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var a = analyzeSKUs(skus);
      if (!a.ok) { msg(a.error, false); $('pp-result-card').hidden = true; return; }
      msg('', null);
      renderResult(a);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
