/* ============================================================
   VisionQuantech Business Suite — Vendor Comparison Tool
   apps/vendor-comparison-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Compares vendor quotes side-by-side on price, lead time,
   warranty and rating with adjustable weights. Each criterion
   is normalised to 0–1 across the compared vendors (lower is
   better for price and lead time; higher is better for
   warranty and rating), then a weighted sum ranks the vendors.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CRITERIA = ['price', 'lead', 'warranty', 'rating'];
  var DEFAULT_WEIGHTS = { price: 40, lead: 20, warranty: 15, rating: 25 };
  var MAX_VENDORS = 10;

  function validateVendor(v) {
    if (!v || typeof v !== 'object') return { ok: false, error: 'Vendor must be an object.' };
    var name = String(v.name || '').trim();
    if (!name) return { ok: false, error: 'Vendor name is required.' };
    if (name.length > 120) return { ok: false, error: 'Vendor name too long (max 120).' };
    var price = Number(v.price);
    if (!isFinite(price) || price < 0) return { ok: false, error: 'Price must be a non-negative number.' };
    if (price > 1e9) return { ok: false, error: 'Price looks too large.' };
    var lead = Number(v.lead);
    if (!isFinite(lead) || Math.floor(lead) !== lead || lead < 0 || lead > 730)
      return { ok: false, error: 'Lead time must be a whole number of days (0–730).' };
    var warranty = Number(v.warranty);
    if (!isFinite(warranty) || Math.floor(warranty) !== warranty || warranty < 0 || warranty > 120)
      return { ok: false, error: 'Warranty must be whole months (0–120).' };
    var rating = Number(v.rating);
    if (!isFinite(rating) || rating < 1 || rating > 5)
      return { ok: false, error: 'Rating must be between 1 and 5.' };
    return { ok: true, value: { name: name, price: price, lead: lead, warranty: warranty, rating: rating } };
  }

  function validateWeights(w) {
    if (!w || typeof w !== 'object') return { ok: false, error: 'Weights are required.' };
    var sum = 0, out = {};
    for (var i = 0; i < CRITERIA.length; i++) {
      var c = CRITERIA[i];
      var n = Number(w[c]);
      if (!isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Weight for ' + c + ' must be 0–100.' };
      out[c] = n; sum += n;
    }
    if (Math.abs(sum - 100) > 0.001) return { ok: false, error: 'Weights must add up to 100 (currently ' + sum + ').' };
    return { ok: true, value: out };
  }

  function validateSet(vendors, weights) {
    if (!Array.isArray(vendors) || vendors.length < 2) return { ok: false, error: 'Compare at least 2 vendors.' };
    if (vendors.length > MAX_VENDORS) return { ok: false, error: 'Max ' + MAX_VENDORS + ' vendors per comparison.' };
    var vals = [];
    for (var i = 0; i < vendors.length; i++) {
      var v = validateVendor(vendors[i]);
      if (!v.ok) return { ok: false, error: 'Vendor ' + (i + 1) + ': ' + v.error };
      vals.push(v.value);
    }
    var w = validateWeights(weights);
    if (!w.ok) return w;
    return { ok: true, vendors: vals, weights: w.value };
  }

  /** Normalise each criterion to 0..1 across the set. lowerIsBetter: price, lead. */
  function normalize(vendors) {
    var cols = { price: [], lead: [], warranty: [], rating: [] };
    vendors.forEach(function (v) { CRITERIA.forEach(function (c) { cols[c].push(v[c]); }); });
    return vendors.map(function (v) {
      var n = {};
      CRITERIA.forEach(function (c) {
        var lo = Math.min.apply(null, cols[c]), hi = Math.max.apply(null, cols[c]);
        if (hi === lo) { n[c] = 1; return; }
        var lowerBetter = (c === 'price' || c === 'lead');
        n[c] = lowerBetter ? (hi - v[c]) / (hi - lo) : (v[c] - lo) / (hi - lo);
      });
      return n;
    });
  }

  function scoreVendor(norm, weights) {
    var s = 0;
    CRITERIA.forEach(function (c) { s += norm[c] * (weights[c] / 100); });
    return Math.round(s * 1000) / 10; // 0–100, 1 decimal
  }

  function rankVendors(vendors, weights) {
    var set = validateSet(vendors, weights);
    if (!set.ok) return set;
    var norms = normalize(set.vendors);
    var rows = set.vendors.map(function (v, i) {
      var sc = scoreVendor(norms[i], set.weights);
      return { vendor: v, norm: norms[i], score: sc };
    });
    rows.sort(function (a, b) { return b.score - a.score; });
    var best = rows[0];
    return {
      ok: true, weights: set.weights, rows: rows,
      winner: best.vendor.name, winnerScore: best.score,
      // price spread vs winner for context
      priceGap: best.vendor.price > 0
        ? rows.map(function (r) { return { name: r.vendor.name, pct: Math.round(((r.vendor.price - best.vendor.price) / best.vendor.price) * 1000) / 10 }; })
        : []
    };
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
    CRITERIA: CRITERIA, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS, MAX_VENDORS: MAX_VENDORS,
    validateVendor: validateVendor, validateWeights: validateWeights,
    normalize: normalize, scoreVendor: scoreVendor, rankVendors: rankVendors,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-comparison-tool';
  var FREE_LIMIT = 20;
  var MAX_SAVED = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('c-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function addVendorRow(v) {
    v = v || {};
    var tbody = $('c-vendors');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="vq-input c-name" placeholder="Vendor name" value="' + esc(v.name || '') + '"></td>' +
      '<td><input class="vq-input c-price" type="number" min="0" step="0.01" value="' + esc(v.price == null ? '' : v.price) + '"></td>' +
      '<td><input class="vq-input c-lead" type="number" min="0" max="730" step="1" value="' + esc(v.lead == null ? '' : v.lead) + '"></td>' +
      '<td><input class="vq-input c-warranty" type="number" min="0" max="120" step="1" value="' + esc(v.warranty == null ? '' : v.warranty) + '"></td>' +
      '<td><input class="vq-input c-rating" type="number" min="1" max="5" step="0.1" value="' + esc(v.rating == null ? '' : v.rating) + '"></td>' +
      '<td><button type="button" class="vq-btn vq-btn-ghost c-del" title="Remove vendor">&times;</button></td>';
    tr.querySelector('.c-del').addEventListener('click', function () {
      if (tbody.rows.length > 2) tbody.removeChild(tr);
    });
    tbody.appendChild(tr);
  }

  function readVendors() {
    var vendors = [], rows = $('c-vendors').rows;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var name = r.querySelector('.c-name').value.trim();
      if (!name && !r.querySelector('.c-price').value) continue;
      vendors.push({
        name: name, price: r.querySelector('.c-price').value, lead: r.querySelector('.c-lead').value,
        warranty: r.querySelector('.c-warranty').value, rating: r.querySelector('.c-rating').value
      });
    }
    return vendors;
  }

  function readWeights() {
    return { price: $('w-price').value, lead: $('w-lead').value, warranty: $('w-warranty').value, rating: $('w-rating').value };
  }

  function renderResult(r) {
    var rows = r.rows.map(function (row, i) {
      var medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      var v = row.vendor;
      return '<tr' + (i === 0 ? ' class="c-winner"' : '') + '><td>' + (i + 1) + medal + '</td>' +
        '<td><strong>' + esc(v.name) + '</strong></td><td class="num">' + fmtINR(v.price) + '</td>' +
        '<td class="num">' + v.lead + ' d</td><td class="num">' + v.warranty + ' mo</td>' +
        '<td class="num">' + v.rating + ' / 5</td><td class="num"><strong>' + row.score.toFixed(1) + '</strong></td></tr>';
    }).join('');
    var gap = r.priceGap.length ? '<p class="vq-hint">Price vs winner: ' +
      r.priceGap.map(function (g) { return esc(g.name) + ' ' + (g.pct > 0 ? '+' : '') + g.pct + '%'; }).join(' · ') + '</p>' : '';
    $('c-result').innerHTML =
      '<p class="vq-hint">Weights — Price ' + r.weights.price + '%, Lead ' + r.weights.lead + '%, Warranty ' + r.weights.warranty + '%, Rating ' + r.weights.rating + '%</p>' +
      '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>#</th><th>Vendor</th><th class="num">Price</th><th class="num">Lead time</th><th class="num">Warranty</th><th class="num">Rating</th><th class="num">Score / 100</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' + gap +
      '<p>Recommended vendor: <span class="big">' + esc(r.winner) + '</span> <span class="vq-hint">(score ' + r.winnerScore.toFixed(1) + ')</span></p>' +
      '<p><button id="c-save" class="vq-btn vq-btn-ghost" type="button">Save comparison</button> <span id="c-save-msg" class="vq-hint"></span></p>';
    $('c-result-card').hidden = false;
    $('c-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('c-save').addEventListener('click', function () {
      saveComparison(r).then(function (ok) {
        $('c-save-msg').textContent = ok ? 'Saved on this device.' : 'Save failed.';
      });
    });
  }

  async function saveComparison(r) {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('cmp:') === 0; }).sort();
      while (keys.length >= MAX_SAVED) { await Vault.remove(SLUG, keys.shift()); }
      await Vault.save(SLUG, 'cmp:' + Date.now(), { at: new Date().toISOString(), rows: r.rows, weights: r.weights, winner: r.winner });
      renderSaved();
      return true;
    } catch (e) { return false; }
  }

  async function renderSaved() {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('cmp:') === 0; }).sort().reverse();
      if (!keys.length) { $('c-saved').innerHTML = '<p class="vq-hint">No saved comparisons yet.</p>'; return; }
      var items = [];
      for (var i = 0; i < Math.min(keys.length, 8); i++) {
        var rec = await Vault.load(SLUG, keys[i]);
        if (rec) items.push('<li>' + esc(new Date(rec.at).toLocaleDateString('en-IN')) + ' — winner <strong>' + esc(rec.winner) + '</strong> (' + rec.rows.length + ' vendors)</li>');
      }
      $('c-saved').innerHTML = '<ul class="vq-list">' + items.join('') + '</ul><p class="vq-hint">Max ' + MAX_SAVED + ' saved — oldest is dropped.</p>';
    } catch (e) { /* vault unavailable */ }
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-comparison-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-comparison-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I compare vendor quotes?', a: 'Enter each vendor quote — price, lead time in days, warranty in months and rating out of 5 — set your criterion weights (they must total 100), and the tool scores and ranks every vendor 0–100.' },
      { q: 'विक्रेता कोटेशन की तुलना कैसे करें?', a: 'हर विक्रेता का प्राइस, लीड टाइम (दिन), वारंटी (महीने) और रेटिंग (5 में से) डालें, वेटेज सेट करें — टूल हर विक्रेता को 0–100 स्कोर देकर रैंक करेगा।' },
      { q: 'How is the vendor score calculated?', a: 'Each criterion is normalised 0–1 across the vendors you compare: for price and lead time lower is better; for warranty and rating higher is better. The weighted sum (weights as you set them) gives the final score.' },
      { q: 'वेंडर स्कोर कैसे निकाला जाता है?', a: 'हर मानदंड को तुलना किए गए विक्रेताओं में 0–1 पर सामान्यीकृत किया जाता है: प्राइस और लीड टाइम में कम बेहतर, वारंटी और रेटिंग में ज़्यादा बेहतर। आपके वेटेज से भारित योग अंतिम स्कोर देता है।' },
      { q: 'What weights should I use?', a: 'Start with the defaults: price 40%, lead time 20%, warranty 15%, rating 25%. Raise price weight for commoditised items, lead time weight for urgent orders.' },
      { q: 'Is my comparison data stored online?', a: 'No. Up to 25 comparisons are saved in your browser vault on this device only.' }
    ]);

    $('w-price').value = DEFAULT_WEIGHTS.price; $('w-lead').value = DEFAULT_WEIGHTS.lead;
    $('w-warranty').value = DEFAULT_WEIGHTS.warranty; $('w-rating').value = DEFAULT_WEIGHTS.rating;
    addVendorRow(); addVendorRow(); addVendorRow();
    renderSaved();

    $('c-add').addEventListener('click', function () {
      if ($('c-vendors').rows.length < MAX_VENDORS) addVendorRow();
    });

    $('c-compare').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('c-gate'), SLUG, FREE_LIMIT); $('c-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = rankVendors(readVendors(), readWeights());
      if (!r.ok) { msg(r.error, false); $('c-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
