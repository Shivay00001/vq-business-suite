/* ============================================================
   VisionQuantech Business Suite — Vendor Performance Scorecard
   apps/vendor-performance-scorecard/app.js

   Pure functions first (no DOM) — tested under node.
   Scores a vendor on quality, delivery, price-competitiveness and
   responsiveness (0–100 each), with adjustable weights, an A+..D
   grade, period-over-period trend, and ratings history stored in
   the on-device vault (max 25 records per vendor).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var DIMS = ['quality', 'delivery', 'price', 'responsiveness'];
  var DIM_LABELS = { quality: 'Quality', delivery: 'Delivery', price: 'Price-competitiveness', responsiveness: 'Responsiveness' };
  var DEFAULT_WEIGHTS = { quality: 30, delivery: 30, price: 20, responsiveness: 20 };
  var MAX_SAVED_PER_VENDOR = 25;

  function isPeriod(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }

  function validateScores(sc) {
    if (!sc || typeof sc !== 'object') return { ok: false, error: 'Scores are required.' };
    var out = {};
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i];
      var n = Number(sc[d]);
      if (!isFinite(n) || n < 0 || n > 100)
        return { ok: false, error: DIM_LABELS[d] + ' must be between 0 and 100.' };
      out[d] = n;
    }
    return { ok: true, value: out };
  }

  function validateWeights(w) {
    if (!w || typeof w !== 'object') return { ok: false, error: 'Weights are required.' };
    var sum = 0, out = {};
    for (var i = 0; i < DIMS.length; i++) {
      var n = Number(w[DIMS[i]]);
      if (!isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Weight for ' + DIMS[i] + ' must be 0–100.' };
      out[DIMS[i]] = n; sum += n;
    }
    if (Math.abs(sum - 100) > 0.001) return { ok: false, error: 'Weights must add up to 100 (currently ' + sum + ').' };
    return { ok: true, value: out };
  }

  function overall(scores, weights) {
    var s = validateScores(scores);
    if (!s.ok) return s;
    var w = validateWeights(weights);
    if (!w.ok) return w;
    var total = 0;
    DIMS.forEach(function (d) { total += s.value[d] * (w.value[d] / 100); });
    return { ok: true, value: Math.round(total * 10) / 10 };
  }

  function gradeFor(score) {
    var n = Number(score);
    if (!isFinite(n)) return '?';
    if (n >= 90) return 'A+';
    if (n >= 80) return 'A';
    if (n >= 70) return 'B';
    if (n >= 60) return 'C';
    return 'D';
  }

  /** Trend between this period's score and the previous recorded one. */
  function trendDelta(current, previous) {
    if (previous == null || !isFinite(Number(previous))) return { ok: true, delta: null, label: 'First rating — no trend yet.' };
    var d = Math.round((Number(current) - Number(previous)) * 10) / 10;
    var label = d > 0 ? '▲ +' + d + ' vs last period' : d < 0 ? '▼ ' + d + ' vs last period' : '— unchanged vs last period';
    return { ok: true, delta: d, label: label };
  }

  /** Summarise a vendor's history (array of {period, overall}) into latest + delta + best/worst. */
  function summarizeHistory(history) {
    if (!Array.isArray(history) || history.length === 0) return { ok: true, count: 0, latest: null };
    var sorted = history.slice().sort(function (a, b) { return a.period < b.period ? -1 : a.period > b.period ? 1 : 0; });
    var latest = sorted[sorted.length - 1];
    var prev = sorted.length > 1 ? sorted[sorted.length - 2].overall : null;
    var t = trendDelta(latest.overall, prev);
    var best = sorted.reduce(function (m, r) { return r.overall > m.overall ? r : m; }, sorted[0]);
    var worst = sorted.reduce(function (m, r) { return r.overall < m.overall ? r : m; }, sorted[0]);
    return {
      ok: true, count: sorted.length, latest: latest, previous: prev,
      delta: t.delta, deltaLabel: t.label, grade: gradeFor(latest.overall),
      best: best, worst: worst, periods: sorted
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
    DIMS: DIMS, DIM_LABELS: DIM_LABELS, DEFAULT_WEIGHTS: DEFAULT_WEIGHTS,
    MAX_SAVED_PER_VENDOR: MAX_SAVED_PER_VENDOR,
    isPeriod: isPeriod, validateScores: validateScores, validateWeights: validateWeights,
    overall: overall, gradeFor: gradeFor, trendDelta: trendDelta,
    summarizeHistory: summarizeHistory, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-performance-scorecard';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function vendorKey(name) { return 'score:' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  function readScores() {
    return { quality: $('s-quality').value, delivery: $('s-delivery').value, price: $('s-price').value, responsiveness: $('s-resp').value };
  }
  function readWeights() {
    return { quality: $('sw-quality').value, delivery: $('sw-delivery').value, price: $('sw-price').value, responsiveness: $('sw-resp').value };
  }

  function renderResult(name, period, scores, weights, total, summ) {
    var bars = DIMS.map(function (d) {
      return '<div class="s-bar-row"><span>' + DIM_LABELS[d] + '</span><div class="s-bar"><div class="s-fill" style="width:' + scores[d] + '%"></div></div><strong>' + scores[d] + '</strong></div>';
    }).join('');
    var hist = summ.count ? '<h4>History — ' + esc(name) + ' (' + summ.count + ' ratings)</h4><ul class="vq-list">' +
      summ.periods.slice().reverse().slice(0, 6).map(function (r) {
        return '<li>' + esc(r.period) + ' — <strong>' + r.overall + '</strong> (' + gradeFor(r.overall) + ')</li>';
      }).join('') + '</ul>' : '';
    $('s-result').innerHTML =
      '<p><strong>' + esc(name) + '</strong> · period ' + esc(period) + '</p>' + bars +
      '<p>Overall: <span class="big">' + total + '</span> <span class="s-grade">Grade ' + gradeFor(total) + '</span></p>' +
      '<p class="vq-hint">' + esc(summ.deltaLabel) + '</p>' + hist +
      '<p><button id="s-save" class="vq-btn vq-btn-ghost" type="button">Save this rating</button> <span id="s-save-msg" class="vq-hint"></span></p>';
    $('s-result-card').hidden = false;
    $('s-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('s-save').addEventListener('click', function () {
      saveRating(name, period, scores, weights, total).then(function (ok) {
        $('s-save-msg').textContent = ok ? 'Saved on this device.' : 'Save failed.';
      });
    });
  }

  async function saveRating(name, period, scores, weights, total) {
    try {
      var key = vendorKey(name);
      var history = (await Vault.load(SLUG, key)) || [];
      history = history.filter(function (r) { return r.period !== period; });
      history.push({ period: period, scores: scores, weights: weights, overall: total, savedAt: new Date().toISOString() });
      history.sort(function (a, b) { return a.period < b.period ? -1 : 1; });
      while (history.length > MAX_SAVED_PER_VENDOR) history.shift();
      await Vault.save(SLUG, key, history);
      renderVendorList();
      return true;
    } catch (e) { return false; }
  }

  async function renderVendorList() {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('score:') === 0; });
      if (!keys.length) { $('s-vendors').innerHTML = '<p class="vq-hint">No rated vendors yet.</p>'; return; }
      var cards = [];
      for (var i = 0; i < keys.length; i++) {
        var history = await Vault.load(SLUG, keys[i]);
        if (!history || !history.length) continue;
        var summ = summarizeHistory(history);
        var name = keys[i].slice(6).replace(/-/g, ' ');
        cards.push('<div class="s-vcard"><strong>' + esc(name) + '</strong> — ' + summ.latest.overall + ' <span class="s-grade">(' + summ.grade + ')</span><br><span class="vq-hint">' + esc(summ.deltaLabel) + ' · ' + summ.count + ' ratings</span></div>');
      }
      $('s-vendors').innerHTML = cards.join('');
    } catch (e) { /* vault unavailable */ }
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-performance-scorecard-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-performance-scorecard-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I rate a vendor on a scorecard?', a: 'Enter the vendor name and month, score quality, delivery, price-competitiveness and responsiveness from 0–100 each, set your weights (total 100), and the tool gives an overall score, an A+..D grade and the trend against the previous month.' },
      { q: 'वेंडर परफॉर्मेंस स्कोरकार्ड कैसे भरें?', a: 'विक्रेता का नाम और महीना डालें, क्वालिटी, डिलीवरी, प्राइस और रिस्पॉन्सिवनेस को 0–100 में स्कोर करें, वेटेज सेट करें — कुल स्कोर, ग्रेड (A+ से D) और पिछले महीने से ट्रेंड मिलेगा।' },
      { q: 'What do the grades mean?', a: 'A+ is 90+, A is 80–89, B is 70–79, C is 60–69 and D is below 60. Grades make it easy to compare vendors at a glance.' },
      { q: 'ग्रेड का क्या मतलब है?', a: 'A+ = 90+, A = 80–89, B = 70–79, C = 60–69, D = 60 से कम।' },
      { q: 'How is the trend calculated?', a: 'The overall score is compared against the same vendor\u2019s most recent previous rating on this device. No earlier rating means no trend yet.' },
      { q: 'How much history is kept?', a: 'Up to 25 monthly ratings per vendor are kept in your browser vault on this device; the oldest is dropped. Nothing is sent anywhere.' }
    ]);

    var now = new Date();
    $('s-period').value = now.toISOString().slice(0, 7);
    $('sw-quality').value = DEFAULT_WEIGHTS.quality; $('sw-delivery').value = DEFAULT_WEIGHTS.delivery;
    $('sw-price').value = DEFAULT_WEIGHTS.price; $('sw-resp').value = DEFAULT_WEIGHTS.responsiveness;
    renderVendorList();

    $('s-score').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); $('s-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var name = $('s-vendor').value.trim();
      if (!name) { msg('Vendor name is required.', false); return; }
      var period = $('s-period').value;
      if (!isPeriod(period)) { msg('Period must be YYYY-MM.', false); return; }
      var sc = validateScores(readScores());
      if (!sc.ok) { msg(sc.error, false); $('s-result-card').hidden = true; return; }
      var w = validateWeights(readWeights());
      if (!w.ok) { msg(w.error, false); $('s-result-card').hidden = true; return; }
      msg('', null);
      var o = overall(sc.value, w.value);
      var history = [];
      try { history = (await Vault.load(SLUG, vendorKey(name))) || []; } catch (e) { /* ignore */ }
      var summ = summarizeHistory(history.concat([{ period: period, overall: o.value }]));
      renderResult(name, period, sc.value, w.value, o.value, summ);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
