/* ============================================================
   VisionQuantech Business Suite — Emergency Cash Estimator
   apps/emergency-cash-estimator/app.js

   Pure functions first (no DOM) — tested under node.
   From monthly FIXED (essential) costs, computes the 3-month and
   6-month emergency-reserve targets, the coverage of current cash,
   and the funding gap. Uses only essential costs — discretionary
   spend is deliberately excluded (stated on screen).
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_COST = 10000000000;

  var COST_FIELDS = [
    { id: 'rent',       label: 'Rent / premises' },
    { id: 'salaries',   label: 'Salaries & wages (essential staff)' },
    { id: 'emis',       label: 'Loan EMIs / debt payments' },
    { id: 'utilities',  label: 'Utilities (electricity, water, internet)' },
    { id: 'insurance',  label: 'Insurance premiums (monthly share)' },
    { id: 'other',      label: 'Other fixed essentials' }
  ];

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function validateCost(v, label) {
    if (trim(v) === '') return { ok: true, value: 0 };
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: label + ': enter a valid amount.' };
    if (n < 0) return { ok: false, error: label + ': amount cannot be negative.' };
    if (n > MAX_COST) return { ok: false, error: label + ': amount looks too large.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  function validateCosts(raw) {
    raw = raw || {};
    var costs = {}, total = 0;
    for (var i = 0; i < COST_FIELDS.length; i++) {
      var f = COST_FIELDS[i];
      var v = validateCost(raw[f.id], f.label);
      if (!v.ok) return v;
      costs[f.id] = v.value;
      total = Math.round((total + v.value) * 100) / 100;
    }
    if (total <= 0) return { ok: false, error: 'Enter at least one essential monthly cost.' };
    return { ok: true, costs: costs, monthly: total };
  }

  function validateCash(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid current cash figure.' };
    if (n < 0) return { ok: false, error: 'Current cash cannot be negative.' };
    if (n > MAX_COST) return { ok: false, error: 'Amount looks too large.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * Estimate reserve targets.
   * Returns {ok, costs, monthly, target3, target6, currentCash,
   *          coverageMonths, gap3, gap6, verdict}.
   */
  function estimate(rawCosts, currentCash) {
    var c = validateCosts(rawCosts);
    if (!c.ok) return c;
    var k = validateCash(currentCash);
    if (!k.ok) return k;
    var target3 = round2(c.monthly * 3);
    var target6 = round2(c.monthly * 6);
    var coverage = round2(k.value / c.monthly);
    var gap3 = Math.max(0, round2(target3 - k.value));
    var gap6 = Math.max(0, round2(target6 - k.value));
    var verdict, level;
    if (coverage < 1) { level = 'critical'; verdict = 'Under 1 month of essential costs — one bad month can break you. Stop discretionary spend and build cash first.'; }
    else if (coverage < 3) { level = 'weak'; verdict = 'Below the 3-month minimum. Target ' + fmtINR(target3) + ' before anything else.'; }
    else if (coverage < 6) { level = 'partial'; verdict = 'Meets the 3-month minimum. Stretch to ' + fmtINR(target6) + ' for a full 6-month buffer.'; }
    else { level = 'healthy'; verdict = 'Healthy — 6+ months of essential costs covered. Keep it liquid (savings/current account), not locked in.'; }
    return {
      ok: true, costs: c.costs, monthly: c.monthly,
      target3: target3, target6: target6, currentCash: k.value,
      coverageMonths: coverage, gap3: gap3, gap6: gap6,
      verdict: verdict, level: level
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
    COST_FIELDS: COST_FIELDS,
    validateCost: validateCost, validateCosts: validateCosts,
    validateCash: validateCash, estimate: estimate,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'emergency-cash-estimator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('e-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r) {
    var card = $('e-result-card');
    card.hidden = false;
    var badge = r.level === 'healthy' ? '<span class="tag tag-ok">HEALTHY</span>'
      : r.level === 'partial' ? '<span class="tag tag-ok">PARTIAL</span>'
      : r.level === 'weak' ? '<span class="tag tag-warn">WEAK</span>'
      : '<span class="tag tag-bad">CRITICAL</span>';
    var h = '<p class="vq-hint">Essential monthly costs: <strong>' + fmtINR(r.monthly) + '</strong> ' + badge + '</p>' +
      '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n">' + fmtINR(r.target3) + '</div><div class="kpi-l">3-month target</div></div>' +
      '<div class="kpi"><div class="kpi-n">' + fmtINR(r.target6) + '</div><div class="kpi-l">6-month target</div></div>' +
      '<div class="kpi"><div class="kpi-n">' + r.coverageMonths + '</div><div class="kpi-l">months covered now</div></div>' +
      '</div>';
    if (r.gap6 > 0)
      h += '<p>Gap to 6-month target: <span class="big">' + fmtINR(r.gap6) + '</span> ' +
        '<span class="vq-hint">(gap to 3-month: ' + fmtINR(r.gap3) + ')</span></p>';
    else h += '<p class="msg-ok">6-month target fully covered.</p>';
    h += '<p><strong>' + esc(r.verdict) + '</strong></p>' +
      '<p class="vq-hint">Covers FIXED essentials only — discretionary spend excluded. Keep the reserve liquid; this is a planning aid, not financial advice.</p>';
    $('e-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'emergency-cash-estimator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'emergency-cash-estimator-bottom', 'leaderboard');
    var grid = $('e-costs');
    COST_FIELDS.forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'vq-field';
      div.innerHTML = '<label for="e-' + f.id + '">' + esc(f.label) + ' (₹/month)</label>' +
        '<input id="e-' + f.id + '" type="number" min="0" step="0.01" value="" placeholder="0" inputmode="decimal">';
      grid.appendChild(div);
    });
    SEO.faq([
      { q: 'How much emergency cash should a small business keep?', a: 'The standard rule: 3–6 months of essential fixed costs, kept liquid. Enter your fixed costs here to get your exact 3-month and 6-month targets.' },
      { q: 'इमरजेंसी के लिए कितना कैश रखना चाहिए?', a: 'आम नियम: 3 से 6 महीने के ज़रूरी तय खर्च। यहाँ अपने मासिक खर्च दर्ज करें — टूल 3 और 6 महीने का लक्ष्य बता देगा।' },
      { q: 'What counts as an essential cost?', a: 'Rent, essential salaries, loan EMIs, utilities, insurance — costs that continue even with zero sales. Discretionary spend (ads, travel, bonuses) is excluded.' },
      { q: 'Where should the emergency reserve sit?', a: 'Liquid — a savings or current account, or an overnight/liquid fund. Not locked in FDs you cannot break or in inventory.' },
      { q: 'My coverage is under 1 month — what first?', a: 'Stop discretionary spend, chase receivables, and divert the next surplus rupee to the reserve before growth spending.' },
      { q: 'Is this financial advice?', a: 'No — a planning estimate. Talk to your CA for advice suited to your business.' }
    ]);

    $('e-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('e-gate'), SLUG, FREE_LIMIT); $('e-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var raw = {};
      COST_FIELDS.forEach(function (f) { raw[f.id] = $('e-' + f.id).value; });
      var r = estimate(raw, $('e-cash').value);
      if (!r.ok) { msg(r.error, false); $('e-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
