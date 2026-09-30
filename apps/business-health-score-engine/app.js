/* ============================================================
   VisionQuantech Business Suite — Business Health Score Engine
   apps/business-health-score-engine/app.js

   Pure functions first (no DOM) — tested under node.
   Five dimensions (cash, profit, compliance, customers,
   operations), each scored 0-5. Total is normalised to 0-100,
   graded A-F, and the 3 weakest dimensions map to concrete fixes.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var DIMENSIONS = [
    { id: 'cash', name: 'Cash & liquidity', max: 5,
      hint: 'Cash in hand, runway, receivables discipline',
      fixes: [
        'Move to weekly cash-flow reviews — know your closing cash every Friday.',
        'Chase dues older than 30 days with a written 30/60/90-day sequence.',
        'Build a 3-month cash buffer before spending on growth.'
      ] },
    { id: 'profit', name: 'Profitability', max: 5,
      hint: 'Net margins, pricing, cost control',
      fixes: [
        'Reprice your top 3 services/products — most SMEs are under-priced 10-15%.',
        'Kill or fix the lowest-margin offering; cost it fully (time + overhead).',
        'Track P&L monthly, not yearly — act on a bad month immediately.'
      ] },
    { id: 'compliance', name: 'Compliance & filings', max: 5,
      hint: 'GST, TDS, PF/ESI, returns filed on time',
      fixes: [
        'Put every statutory due date on one calendar with 7-day reminders.',
        'File GSTR-3B/GSTR-1 before the due date — late fees compound fast.',
        'Reconcile books vs returns quarterly with your CA.'
      ] },
    { id: 'customers', name: 'Customers & sales', max: 5,
      hint: 'Pipeline, concentration risk, repeat business',
      fixes: [
        'No single customer should be >25% of revenue — diversify now.',
        'Build a repeatable lead engine; referrals are not a strategy.',
        'Ask lost deals why — the answers are your cheapest consulting.'
      ] },
    { id: 'operations', name: 'Operations & team', max: 5,
      hint: 'Processes, delegation, documentation',
      fixes: [
        'Document the top 5 repeat processes so the business runs without you.',
        'Name one backup for every critical role — key-person risk kills deals.',
        'Hold a 30-minute weekly review: numbers, blockers, next actions.'
      ] }
  ];

  function dimIds() { return DIMENSIONS.map(function (d) { return d.id; }); }

  function validateScores(scores) {
    var out = {};
    for (var i = 0; i < DIMENSIONS.length; i++) {
      var id = DIMENSIONS[i].id;
      var raw = scores ? scores[id] : undefined;
      var n = Number(raw);
      if (raw === undefined || raw === null || raw === '' || !isFinite(n) || Math.floor(n) !== n)
        return { ok: false, error: 'Score for "' + DIMENSIONS[i].name + '" must be a whole number from 0 to 5.' };
      if (n < 0 || n > 5)
        return { ok: false, error: 'Score for "' + DIMENSIONS[i].name + '" must be between 0 and 5.' };
      out[id] = n;
    }
    return { ok: true, value: out };
  }

  function gradeFor(score) {
    if (score >= 85) return { grade: 'A', label: 'Excellent — strong, resilient business', color: '#1d7a3f' };
    if (score >= 70) return { grade: 'B', label: 'Good — healthy with fixable gaps', color: '#3a7d1d' };
    if (score >= 55) return { grade: 'C', label: 'Average — needs attention this quarter', color: '#9a6b00' };
    if (score >= 40) return { grade: 'D', label: 'Weak — fix the bottom 3 before growing', color: '#b3541e' };
    return { grade: 'F', label: 'Critical — stabilise basics before anything else', color: '#b3261e' };
  }

  /** Full calculation: {score, grade..., breakdown, topFixes}. */
  function calculate(scores) {
    var v = validateScores(scores);
    if (!v.ok) return v;
    var s = v.value;
    var breakdown = DIMENSIONS.map(function (d) {
      return { id: d.id, name: d.name, hint: d.hint, score: s[d.id], max: d.max,
               pct: Math.round((s[d.id] / d.max) * 100) };
    });
    var total = 0;
    breakdown.forEach(function (b) { total += b.score; });
    var score = Math.round((total / (DIMENSIONS.length * 5)) * 100);
    var g = gradeFor(score);
    var weakest = breakdown.slice().sort(function (a, b) { return a.score - b.score; }).slice(0, 3);
    var topFixes = weakest.map(function (w) {
      var d = DIMENSIONS.filter(function (x) { return x.id === w.id; })[0];
      return { dimension: w.name, score: w.score,
               fix: d.fixes[Math.min(w.score, d.fixes.length - 1)] };
    });
    return {
      ok: true, score: score, grade: g.grade, gradeLabel: g.label, gradeColor: g.color,
      breakdown: breakdown, topFixes: topFixes
    };
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    DIMENSIONS: DIMENSIONS, dimIds: dimIds,
    validateScores: validateScores, gradeFor: gradeFor,
    calculate: calculate, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'business-health-score-engine';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('h-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function buildForm() {
    var host = $('h-dims');
    host.innerHTML = DIMENSIONS.map(function (d) {
      var opts = '';
      for (var i = 0; i <= 5; i++) opts += '<option value="' + i + '"' + (i === 3 ? ' selected' : '') + '>' + i + '</option>';
      return '<div class="vq-field"><label for="h-' + d.id + '">' + esc(d.name) + ' <span class="vq-hint">— ' + esc(d.hint) + '</span></label>' +
        '<select id="h-' + d.id + '">' + opts + '</select></div>';
    }).join('');
  }

  function renderResult(r) {
    var card = $('h-result-card');
    card.hidden = false;
    var rows = r.breakdown.map(function (b) {
      var bar = '<div class="bar"><div class="fill" style="width:' + b.pct + '%;background:' + (b.pct >= 70 ? '#1d7a3f' : b.pct >= 40 ? '#9a6b00' : '#b3261e') + '"></div></div>';
      return '<tr><td>' + esc(b.name) + '<div class="vq-hint">' + esc(b.hint) + '</div></td><td><strong>' + b.score + '/5</strong></td><td style="min-width:120px">' + bar + '</td></tr>';
    }).join('');
    var fixes = r.topFixes.map(function (f, i) {
      return '<li><strong>' + (i + 1) + '. ' + esc(f.dimension) + ' (' + f.score + '/5):</strong> ' + esc(f.fix) + '</li>';
    }).join('');
    $('h-result').innerHTML =
      '<p>Overall business health score: <span class="big" style="color:' + r.gradeColor + '">' + r.score + '/100</span> ' +
      '<span class="grade">' + esc(r.grade) + '</span></p>' +
      '<p class="vq-hint"><strong>' + esc(r.gradeLabel) + '</strong></p>' +
      '<table class="vq-table"><tbody>' + rows + '</tbody></table>' +
      '<h3>Top 3 fixes to work on first</h3><ol class="assump" style="list-style:decimal inside">' + fixes + '</ol>' +
      '<p class="vq-hint">Self-assessment, not a financial audit — validate with your CA before big decisions.</p>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'business-health-score-engine-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'business-health-score-engine-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a business health score?', a: 'A 0–100 score across five dimensions — cash, profitability, compliance, customers and operations — each self-scored 0–5. The weakest three dimensions give you your priority fixes.' },
      { q: 'बिज़नेस हेल्थ स्कोर क्या है?', a: 'पांच क्षेत्रों — कैश, लाभ, कंप्लायंस, ग्राहक और ऑपरेशंस — में 0–5 की सेल्फ-रेटिंग से 0–100 का स्कोर। सबसे कमज़ोर तीन क्षेत्रों से आपकी प्राथमिकता तय होती है।' },
      { q: 'What is a good business health score?', a: '85+ (A) is excellent, 70+ (B) is good, 55–69 (C) is average and needs attention this quarter. Below 40 means stabilise basics before growing.' },
      { q: 'How often should I re-score my business?', a: 'Quarterly is ideal. Re-score after any major change — a big contract, a loan, or a compliance slip.' },
      { q: 'Is this a financial audit?', a: 'No — it is a self-assessment framework. Use it to prioritise fixes, and validate big decisions with your CA.' }
    ]);
    buildForm();
    $('h-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('h-gate'), SLUG, FREE_LIMIT); $('h-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var scores = {};
      DIMENSIONS.forEach(function (d) { scores[d.id] = $('h-' + d.id).value; });
      var r = calculate(scores);
      if (!r.ok) { msg(r.error, false); $('h-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
