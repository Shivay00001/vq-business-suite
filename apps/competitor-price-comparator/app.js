/* ============================================================
   VisionQuantech Business Suite — Competitor Price Comparator
   apps/competitor-price-comparator/app.js

   Your price vs competitors per SKU:
     avgComp  = mean of competitor prices
     gap%     = (your - avgComp) / avgComp × 100
     positioning: gap > +5%  -> Premium
                  gap < -5%  -> Budget
                  else       -> At par
     alert when |gap| > 15% (configurable threshold)

   Portfolio summary: counts per position + average absolute gap.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SKU = 25;
  var MAX_COMP = 10;
  var MAX_AMT = 10000000000;
  var PAR_BAND = 5;    // within ±5% = at par
  var ALERT_GAP = 15;  // |gap| beyond this raises an alert

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function validName(v) {
    var s = String(v == null ? '' : v).trim().slice(0, 60);
    if (!s) return { ok: false, error: 'SKU name is required.' };
    return { ok: true, value: s };
  }

  function validPrice(v, name) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  /**
   * Add/compare one SKU. compPrices: array of numbers/strings.
   * Returns {ok, entry, error} with avgComp, gapPct, positioning, alert.
   */
  function compareSKU(sku) {
    sku = sku || {};
    var nm = validName(sku.name); if (!nm.ok) return nm;
    var yp = validPrice(sku.yourPrice, 'Your price'); if (!yp.ok) return yp;
    var raw = sku.compPrices;
    if (!Array.isArray(raw)) raw = String(raw == null ? '' : raw).split(/[,\s]+/);
    var comps = [];
    for (var i = 0; i < raw.length; i++) {
      var s = String(raw[i]).trim();
      if (!s) continue;
      var c = validPrice(s, 'Competitor price #' + (i + 1));
      if (!c.ok) return c;
      comps.push(r2(c.value));
    }
    if (!comps.length) return { ok: false, error: 'Enter at least one competitor price.' };
    if (comps.length > MAX_COMP) return { ok: false, error: 'Max ' + MAX_COMP + ' competitor prices per SKU.' };
    var avg = r2(comps.reduce(function (a, b) { return a + b; }, 0) / comps.length);
    var gap = r1((yp.value - avg) / avg * 100);
    var positioning = gap > PAR_BAND ? 'Premium' : (gap < -PAR_BAND ? 'Budget' : 'At par');
    var alert = Math.abs(gap) > ALERT_GAP
      ? (gap > 0
          ? 'You are ' + Math.abs(gap) + '% above the market — justify with value or risk losing share.'
          : 'You are ' + Math.abs(gap) + '% below the market — you may be leaving money on the table.')
      : '';
    return {
      ok: true,
      entry: {
        name: nm.value, yourPrice: r2(yp.value), compPrices: comps,
        avgComp: avg, minComp: Math.min.apply(null, comps), maxComp: Math.max.apply(null, comps),
        gapPct: gap, positioning: positioning, alert: alert
      }
    };
  }

  /** Add a compared SKU to the list (max 25, unique names). */
  function addSKU(skus, entry) {
    skus = Array.isArray(skus) ? skus.slice() : [];
    if (skus.length >= MAX_SKU) return { ok: false, error: 'SKU list is full (max 25).' };
    var exists = skus.some(function (s) { return s.name.toLowerCase() === entry.name.toLowerCase(); });
    if (exists) return { ok: false, error: 'A SKU with this name already exists.' };
    skus.push(entry);
    return { ok: true, skus: skus };
  }

  function removeSKU(skus, name) {
    skus = Array.isArray(skus) ? skus.slice() : [];
    var n = String(name).toLowerCase();
    return skus.filter(function (s) { return s.name.toLowerCase() !== n; });
  }

  /** Portfolio summary across compared SKUs. */
  function portfolioSummary(skus) {
    skus = Array.isArray(skus) ? skus : [];
    if (!skus.length) return { ok: false, error: 'Add at least one SKU.' };
    var counts = { Premium: 0, 'At par': 0, Budget: 0 };
    var sumAbs = 0, alerts = 0;
    skus.forEach(function (s) {
      if (counts[s.positioning] == null) counts[s.positioning] = 0;
      counts[s.positioning]++;
      sumAbs += Math.abs(s.gapPct);
      if (s.alert) alerts++;
    });
    return {
      ok: true, count: skus.length, counts: counts,
      avgAbsGap: r1(sumAbs / skus.length), alertCount: alerts,
      rows: skus.slice().sort(function (a, b) { return Math.abs(b.gapPct) - Math.abs(a.gapPct); })
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
    MAX_SKU: MAX_SKU, MAX_COMP: MAX_COMP, PAR_BAND: PAR_BAND, ALERT_GAP: ALERT_GAP,
    compareSKU: compareSKU, addSKU: addSKU, removeSKU: removeSKU,
    portfolioSummary: portfolioSummary, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'competitor-price-comparator';
  var FREE_LIMIT = 20;
  var skus = [];

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('cp-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function persist() { return Vault.save(SLUG, 'skus', skus); }
  function restore() {
    return Vault.load(SLUG, 'skus').then(function (rec) {
      if (Array.isArray(rec)) skus = rec.slice(0, MAX_SKU);
      renderAll();
    });
  }

  function posBadge(p) {
    if (p === 'Premium') return '<span class="msg-ok">⬆ Premium</span>';
    if (p === 'Budget') return '<span class="msg-err">⬇ Budget</span>';
    return '<span class="vq-hint">═ At par</span>';
  }

  function renderAll() {
    var wrap = $('cp-list');
    var sum = portfolioSummary(skus);
    if (!sum.ok) { wrap.innerHTML = '<p class="vq-hint">' + esc(sum.error) + ' Add your first SKU above.</p>'; return; }
    wrap.innerHTML =
      '<p>Portfolio: <strong>' + sum.counts.Premium + '</strong> premium · <strong>' + sum.counts['At par'] + '</strong> at par · ' +
      '<strong>' + sum.counts.Budget + '</strong> budget · avg |gap| <strong>' + sum.avgAbsGap + '%</strong>' +
      (sum.alertCount ? ' · ⚠️ <span class="msg-err">' + sum.alertCount + ' alert(s)</span>' : '') + '</p>' +
      '<table class="vq-table"><thead><tr><th>SKU</th><th style="text-align:right">Your ₹</th><th style="text-align:right">Market avg</th>' +
      '<th style="text-align:right">Gap</th><th>Position</th><th></th></tr></thead><tbody>' +
      sum.rows.map(function (s) {
        return '<tr><td><strong>' + esc(s.name) + '</strong>' + (s.alert ? '<br><span class="msg-err" style="font-size:.82rem">⚠️ ' + esc(s.alert) + '</span>' : '') + '</td>' +
          '<td style="text-align:right">' + fmtINR(s.yourPrice) + '</td>' +
          '<td style="text-align:right">' + fmtINR(s.avgComp) + ' <span class="vq-hint">(' + s.compPrices.length + ' comps)</span></td>' +
          '<td style="text-align:right">' + (s.gapPct >= 0 ? '+' : '') + s.gapPct + '%</td>' +
          '<td>' + posBadge(s.positioning) + '</td>' +
          '<td style="text-align:right"><button type="button" class="vq-link" data-del="' + esc(s.name) + '">delete</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="vq-hint">' + skus.length + ' / ' + MAX_SKU + ' SKUs stored on this device.</p>';
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        skus = removeSKU(skus, b.getAttribute('data-del'));
        persist().then(renderAll);
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'competitor-price-comparator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'competitor-price-comparator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I compare my price with competitors?', a: 'For each SKU, list competitor prices, take the average, and compute the gap % = (your price − market average) ÷ market average × 100. Within ±5% = at par; above = premium; below = budget.' },
      { q: 'कॉम्पिटिटर कीमतों से तुलना कैसे करें?', a: 'हर SKU के लिए कॉम्पिटिटर कीमतों का औसत निकालें। गैप % = (आपकी कीमत − बाज़ार औसत) ÷ बाज़ार औसत × 100। ±5% के अंदर = बराबर, ऊपर = प्रीमियम, नीचे = बजट।' },
      { q: 'When should a price gap worry me?', a: 'Beyond ±15% deserves attention: 15%+ above market needs a clear value story (brand, service, quality) or you lose share; 15%+ below may mean you are leaving money on the table.' },
      { q: 'Does premium positioning always hurt sales?', a: 'No — premium works when customers perceive extra value. The gap tells you where you stand; whether it is sustainable depends on differentiation, which this tool does not measure.' },
      { q: 'Is my pricing data private?', a: 'Yes — stored only on your device (max 25 SKUs, 10 competitor prices each). Nothing is uploaded.' }
    ]);
    restore();

    $('cp-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('cp-gate'), SLUG, FREE_LIMIT); $('cp-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = compareSKU({ name: $('cp-name').value, yourPrice: $('cp-your').value, compPrices: $('cp-comps').value });
      if (!r.ok) { msg(r.error, false); return; }
      var a = addSKU(skus, r.entry);
      if (!a.ok) { msg(a.error, false); return; }
      skus = a.skus;
      persist().then(function () {
        msg(r.entry.name + ': ' + r.entry.positioning + ' (' + (r.entry.gapPct >= 0 ? '+' : '') + r.entry.gapPct + '% vs market).', true);
        $('cp-name').value = ''; $('cp-your').value = ''; $('cp-comps').value = '';
        renderAll();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
