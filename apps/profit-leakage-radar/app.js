/* ============================================================
   VisionQuantech Business Suite — Profit Leakage Radar
   apps/profit-leakage-radar/app.js

   Checklist-scored leakage: the user estimates a MONTHLY rupee
   loss for each of five classic leak channels. The tool annualises
   them, ranks them, and rates the total against annual revenue:

     annualLeak   = Σ monthlyLoss × 12
     leakPct      = annualLeak / annualRevenue × 100
     rating       = <2% Guarded · 2–5% Watch · 5–10% Leaking · >10% Critical

   Severity (0–3) feeds a 0–100 leakage-pressure score as a
   qualitative cross-check against the rupee estimate.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SAVE = 25;
  var MAX_AMT = 10000000000;

  var LEAKS = [
    { id: 'discounts', name: 'Excess discounts & freebies', hint: 'Unplanned discounts, staff freebies, promo overruns', max: 3 },
    { id: 'wastage', name: 'Wastage & spoilage', hint: 'Expired, damaged, over-portioned, over-produced stock', max: 3 },
    { id: 'returns', name: 'Returns & rework', hint: 'Customer returns, refunds, redoing faulty work', max: 3 },
    { id: 'shrinkage', name: 'Shrinkage / pilferage', hint: 'Theft, unrecorded cash sales, inventory gaps', max: 3 },
    { id: 'idle', name: 'Idle staff & capacity', hint: 'Paid hours with no output, idle machines, empty tables', max: 3 }
  ];

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function num(v, name, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  function sev(v, name) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < 0 || n > 3) {
      return { ok: false, error: name + ': severity must be 0–3.' };
    }
    return { ok: true, value: n };
  }

  /**
   * Estimate annual leakage.
   * opts: {annualRevenue, items: {discounts:{monthly,severity}, wastage:..., ...}}
   */
  function estimateLeaks(opts) {
    opts = opts || {};
    var rev = num(opts.annualRevenue, 'Annual revenue');
    if (!rev.ok) return rev;
    var items = opts.items || {};
    var rows = [];
    for (var i = 0; i < LEAKS.length; i++) {
      var L = LEAKS[i];
      var it = items[L.id] || {};
      var m = num(it.monthly == null || it.monthly === '' ? 0 : it.monthly, L.name + ' monthly loss', true);
      if (!m.ok) return m;
      var s = sev(it.severity == null || it.severity === '' ? 0 : it.severity, L.name + ' severity');
      if (!s.ok) return s;
      rows.push({
        id: L.id, name: L.name, hint: L.hint,
        monthly: r2(m.value), annual: r2(m.value * 12), severity: s.value
      });
    }
    var annualLeak = r2(rows.reduce(function (a, r) { return a + r.annual; }, 0));
    var leakPct = rev.value > 0 ? r1(annualLeak / rev.value * 100) : 0;
    var ranked = rows.slice().sort(function (a, b) { return b.annual - a.annual; });
    var rating, action;
    if (leakPct < 2) { rating = 'Guarded'; action = 'Leakage is under control. Re-run quarterly.'; }
    else if (leakPct < 5) { rating = 'Watch'; action = 'Moderate leakage — tighten the top leak channel this month.'; }
    else if (leakPct < 10) { rating = 'Leaking'; action = 'Significant leakage — put one owner on each of the top 2 channels.'; }
    else { rating = 'Critical'; action = 'Over 10% of revenue is leaking. Treat this as an emergency review with your team.'; }
    // Qualitative cross-check: severity pressure score 0–100
    var sevSum = rows.reduce(function (a, r) { return a + r.severity; }, 0);
    var pressure = Math.round(sevSum / (LEAKS.length * 3) * 100);
    return {
      ok: true,
      annualRevenue: r2(rev.value),
      rows: rows, ranked: ranked,
      annualLeak: annualLeak, monthlyLeak: r2(annualLeak / 12),
      leakPct: leakPct, rating: rating, action: action,
      pressureScore: pressure,
      topLeak: ranked[0].annual > 0 ? ranked[0] : null
    };
  }

  /** Saved-assessment helper: max 25, newest first. */
  function addRecord(records, rec) {
    records = Array.isArray(records) ? records : [];
    if (records.length >= MAX_SAVE) return { ok: false, error: 'Saved list is full (max 25).' };
    var label = String(rec && rec.label != null ? rec.label : '').slice(0, 60);
    if (!label) return { ok: false, error: 'Give the assessment a short label.' };
    return { ok: true, records: [{ label: label, at: new Date().toISOString(), data: rec.data || null }].concat(records) };
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
    MAX_SAVE: MAX_SAVE, LEAKS: LEAKS,
    estimateLeaks: estimateLeaks, addRecord: addRecord,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'profit-leakage-radar';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('pl-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function buildForm() {
    $('pl-leaks').innerHTML = LEAKS.map(function (L) {
      return '<div class="card" style="margin:0 0 1rem"><h3 class="vq-section-title" style="margin-top:0">' + esc(L.name) + '</h3>' +
        '<p class="vq-hint" style="margin-top:0">' + esc(L.hint) + '</p>' +
        '<div class="form-grid">' +
        '<div class="vq-field"><label for="pl-' + L.id + '-m">Estimated monthly loss (₹)</label>' +
        '<input id="pl-' + L.id + '-m" type="number" min="0" step="0.01" value="0" inputmode="decimal"></div>' +
        '<div class="vq-field"><label for="pl-' + L.id + '-s">Severity 0–3 (0 none · 3 severe)</label>' +
        '<input id="pl-' + L.id + '-s" type="number" min="0" max="3" step="1" value="0" inputmode="numeric"></div>' +
        '</div></div>';
    }).join('');
  }

  function renderResult(r) {
    var card = $('pl-result-card');
    card.hidden = false;
    var html;
    if (!r.ok) { html = '<p class="msg-err">' + esc(r.error) + '</p>'; }
    else {
      html =
        '<p>Estimated annual leakage: <span class="big">' + fmtINR(r.annualLeak) + '</span> ' +
        '<span class="vq-hint">(' + fmtINR(r.monthlyLeak) + ' / month · ' + r.leakPct + '% of revenue)</span></p>' +
        '<p>Risk rating: <span class="big">' + esc(r.rating) + '</span> · severity-pressure score: <strong>' + r.pressureScore + '/100</strong></p>' +
        '<p class="vq-hint">' + esc(r.action) + '</p>' +
        '<table class="vq-table"><thead><tr><th>#</th><th>Leak channel</th><th style="text-align:right">Monthly</th>' +
        '<th style="text-align:right">Annual</th><th style="text-align:right">Severity</th></tr></thead><tbody>' +
        r.ranked.map(function (x, i) {
          return '<tr><td>' + (i + 1) + '</td><td><strong>' + esc(x.name) + '</strong><br><span class="vq-hint">' + esc(x.hint) + '</span></td>' +
            '<td style="text-align:right">' + fmtINR(x.monthly) + '</td>' +
            '<td style="text-align:right"><strong>' + fmtINR(x.annual) + '</strong></td>' +
            '<td style="text-align:right">' + x.severity + '/3</td></tr>';
        }).join('') + '</tbody></table>' +
        (r.topLeak ? '<p class="vq-hint">🎯 Fix first: <strong>' + esc(r.topLeak.name) + '</strong> — ' + fmtINR(r.topLeak.annual) + '/year, the biggest single leak.</p>'
                   : '<p class="vq-hint">No leakage estimated — either genuinely tight, or estimates are too optimistic. Re-check honestly.</p>');
    }
    $('pl-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'profit-leakage-radar-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'profit-leakage-radar-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is profit leakage?', a: 'Profit that silently disappears through excess discounts, wastage, returns, shrinkage/theft and idle staff or capacity — costs that never appear as one line item but add up to lakhs per year.' },
      { q: 'प्रॉफ़िट लीकेज क्या है?', a: 'ज़्यादा छूट, बर्बादी, रिटर्न, चोरी/ग़ायब स्टॉक और खाली स्टाफ़ के ज़रिए चुपचाप ग़ायब होता मुनाफ़ा — जो एक साथ लाखों का होता है।' },
      { q: 'How do I estimate leakage I cannot measure?', a: 'Use honest monthly rupee estimates per channel plus a 0–3 severity score. The tool annualises them and cross-checks with a severity-pressure score — direction matters more than precision.' },
      { q: 'What leakage % is acceptable?', a: 'Roughly: under 2% of revenue = guarded, 2–5% = watch, 5–10% = leaking, over 10% = critical. Retail and food businesses often discover 5–8% when they first measure.' },
      { q: 'Which leak should I fix first?', a: 'The biggest rupee leak, not the most embarrassing one. The report ranks channels by annual rupees so you attack the largest first.' }
    ]);
    buildForm();

    $('pl-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('pl-gate'), SLUG, FREE_LIMIT); $('pl-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var items = {};
      LEAKS.forEach(function (L) {
        items[L.id] = {
          monthly: $('pl-' + L.id + '-m').value,
          severity: $('pl-' + L.id + '-s').value
        };
      });
      var r = estimateLeaks({ annualRevenue: $('pl-rev').value, items: items });
      if (!r.ok) { msg(r.error, false); $('pl-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
