/* ============================================================
   VisionQuantech Business Suite — Governance Score Engine
   apps/governance-score-engine/app.js

   Self-assessment tool: answer Yes / Partial / No across four
   dimensions (board oversight, compliance, transparency, financial
   discipline) -> weighted 0-100 governance score, a rating, and
   improvement actions for the weakest dimensions.

   Pure functions first (no DOM) — tested under node.
   Estimate — confirm with your CA/auditor.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var DIMENSIONS = ['Board oversight', 'Compliance', 'Transparency', 'Financial discipline'];

  var DIM_ACTIONS = {
    'Board oversight': 'Hold a monthly review meeting with written minutes; separate the roles of owner and day-to-day manager where possible; document major decisions.',
    'Compliance': 'Build a statutory calendar (GST, PF, ESI, Shops Act) with one owner per filing; file before the due date, not on it.',
    'Transparency': 'Share monthly numbers with key staff/partners; keep written agreements for every related-party transaction.',
    'Financial discipline': 'Separate business and personal accounts; prepare monthly P&L; get books reviewed by an external accountant yearly.'
  };

  var QUESTIONS = [
    { id: 'b1', dim: 'Board oversight', text: 'Major decisions (loans, big purchases, new verticals) are discussed and minuted, not taken alone on a phone call', weight: 3 },
    { id: 'b2', dim: 'Board oversight', text: 'Someone independent reviews the numbers at least quarterly (advisor, CA, or partner not running daily ops)', weight: 2 },
    { id: 'b3', dim: 'Board oversight', text: 'Roles are written down — who can sign, spend, and hire above what limit', weight: 2 },
    { id: 'c1', dim: 'Compliance', text: 'All statutory filings (GST, PF/ESI if applicable, Shops Act) were on time in the last 6 months', weight: 3 },
    { id: 'c2', dim: 'Compliance', text: 'There is a single calendar/owner tracking every compliance due date', weight: 2 },
    { id: 'c3', dim: 'Compliance', text: 'Contracts with key vendors, staff and partners exist in writing', weight: 2 },
    { id: 't1', dim: 'Transparency', text: 'Monthly financial summary is shared with partners / key managers', weight: 2 },
    { id: 't2', dim: 'Transparency', text: 'Related-party transactions (family vendors, owner withdrawals) are documented', weight: 3 },
    { id: 't3', dim: 'Transparency', text: 'Employees know how to raise a concern without fear (even informally)', weight: 2 },
    { id: 'f1', dim: 'Financial discipline', text: 'Business money and personal money are fully separate', weight: 3 },
    { id: 'f2', dim: 'Financial discipline', text: 'A monthly P&L and cash position is prepared and reviewed', weight: 2 },
    { id: 'f3', dim: 'Financial discipline', text: 'Books are reviewed by an external accountant/CA at least yearly', weight: 2 }
  ];

  var ANSWER_VALUES = { yes: 1, partial: 0.5, no: 0 };

  function scoreAnswers(answers) {
    if (answers == null || typeof answers !== 'object') return { ok: false, error: 'Internal error: answers must be an object.' };
    var dims = {}, i, q;
    DIMENSIONS.forEach(function (d) { dims[d] = { earned: 0, total: 0 }; });
    for (i = 0; i < QUESTIONS.length; i++) {
      q = QUESTIONS[i];
      var a = answers[q.id];
      if (a == null) return { ok: false, error: 'Please answer every question (missing: "' + q.text.slice(0, 40) + '…").' };
      if (!(a in ANSWER_VALUES)) return { ok: false, error: 'Invalid answer for "' + q.id + '": use yes, partial or no.' };
      dims[q.dim].earned += ANSWER_VALUES[a] * q.weight;
      dims[q.dim].total += q.weight;
    }
    var dimScores = {}, sum = 0;
    DIMENSIONS.forEach(function (d) {
      dimScores[d] = dims[d].total ? Math.round((dims[d].earned / dims[d].total) * 100) : 0;
      sum += dimScores[d];
    });
    var overall = Math.round(sum / DIMENSIONS.length);
    var rating = overall >= 80 ? 'Strong' : overall >= 60 ? 'Adequate' : overall >= 40 ? 'Needs improvement' : 'Weak';
    var actions = DIMENSIONS.filter(function (d) { return dimScores[d] < 60; })
      .map(function (d) { return { dimension: d, score: dimScores[d], action: DIM_ACTIONS[d] }; });
    return { ok: true, overall: overall, rating: rating, dimScores: dimScores, actions: actions };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { DIMENSIONS: DIMENSIONS, QUESTIONS: QUESTIONS, scoreAnswers: scoreAnswers, esc: esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'governance-score-engine';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('gse-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderQuestions() {
    var html = '';
    DIMENSIONS.forEach(function (d) {
      html += '<h3 class="vq-section-title">' + esc(d) + '</h3>';
      QUESTIONS.filter(function (q) { return q.dim === d; }).forEach(function (q) {
        html += '<fieldset class="q"><legend>' + esc(q.text) + '</legend>' +
          '<label><input type="radio" name="gse-' + q.id + '" value="yes"> Yes</label>' +
          '<label><input type="radio" name="gse-' + q.id + '" value="partial"> Partial</label>' +
          '<label><input type="radio" name="gse-' + q.id + '" value="no" checked> No</label></fieldset>';
      });
    });
    $('gse-list').innerHTML = html;
  }

  function ratingClass(r) {
    return r === 'Strong' ? 'b-low' : r === 'Adequate' ? 'b-med' : r === 'Needs improvement' ? 'b-high' : 'b-crit';
  }

  function renderResult(r) {
    var html = '<p>Governance score: <span class="big">' + r.overall + '/100</span> ' +
      '<span class="chip ' + ratingClass(r.rating) + '">' + r.rating + '</span></p>' +
      '<table class="proc"><tbody>';
    DIMENSIONS.forEach(function (d) {
      html += '<tr><td>' + esc(d) + '</td><td><div class="bar"><div class="fill" style="width:' + r.dimScores[d] + '%"></div></div></td>' +
        '<td class="pct">' + r.dimScores[d] + '</td></tr>';
    });
    html += '</tbody></table>';
    if (r.actions.length) {
      html += '<h3 class="vq-section-title">Improvement actions — weakest first</h3><ul class="acts">';
      r.actions.sort(function (a, b) { return a.score - b.score; }).forEach(function (a) {
        html += '<li><strong>' + esc(a.dimension) + ' (' + a.score + '/100):</strong> ' + esc(a.action) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">All dimensions at 60+/100 — keep the rhythm of monthly reviews and filings.</p>';
    }
    html += '<p class="vq-hint">Self-assessment estimate — confirm with your CA/auditor.</p>';
    $('gse-result').innerHTML = html;
    $('gse-result-card').hidden = false;
    $('gse-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'governance-score-engine-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'governance-score-engine-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a governance score?', a: 'A 0–100 self-assessment across board oversight, compliance, transparency and financial discipline. You answer Yes/Partial/No to 12 questions; the tool weights and scores them and suggests fixes for weak areas.' },
      { q: 'गवर्नेंस स्कोर क्या है?', a: 'बोर्ड निगरानी, अनुपालन, पारदर्शिता और वित्तीय अनुशासन — चार आयामों में 0–100 का आत्म-मूल्यांकन स्कोर। कमजोर क्षेत्रों के लिए सुधार सुझाव मिलते हैं।' },
      { q: 'What is a good governance score for a small business?', a: '80+ Strong, 60–79 Adequate, 40–59 Needs improvement, below 40 Weak. Most small businesses land in 40–65 — the tool shows exactly which dimension to fix first.' },
      { q: 'Is this a corporate governance audit?', a: 'No. It is a self-assessment for SMEs, not a statutory audit under the Companies Act. Listed-company governance has far stricter requirements.' },
      { q: 'Which dimension should I fix first?', a: 'Fix the lowest-scoring dimension first — usually financial discipline (separate accounts, monthly P&L) or compliance (a filing calendar with one owner).' }
    ]);

    renderQuestions();

    $('gse-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('gse-gate'), SLUG, FREE_LIMIT); $('gse-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var answers = {};
      QUESTIONS.forEach(function (q) {
        var sel = document.querySelector('input[name="gse-' + q.id + '"]:checked');
        answers[q.id] = sel ? sel.value : null;
      });
      var r = scoreAnswers(answers);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._gseLast = r;
    });

    $('gse-save').addEventListener('click', async function () {
      var r = window._gseLast;
      if (!r) { msg('Run the scoring first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('gse-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'score-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), overall: r.overall, rating: r.rating,
          dimScores: r.dimScores, actions: r.actions
        });
        msg('Score saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
