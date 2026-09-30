/* ============================================================
   VisionQuantech Business Suite — Decision Support Engine
   apps/decision-support-engine/app.js

   Weighted scoring of business options across criteria:
     score(option) = Σ weight_c × score_c(option)   (scores 1–10)
     weights must sum to 1 (±0.001 tolerance), all > 0

   Sensitivity check: each criterion weight is perturbed +20% and
   −20% (renormalised), and the engine reports whether the winning
   option changes — a robustness verdict on the recommendation.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_CRITERIA = 25;
  var MAX_OPTIONS = 25;
  var SENS_PCT = 0.20;

  function r3(n) { return Math.round(n * 1000) / 1000; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function validName(v, what) {
    var s = String(v == null ? '' : v).trim().slice(0, 60);
    if (!s) return { ok: false, error: (what || 'Name') + ' is required.' };
    return { ok: true, value: s };
  }

  function validWeight(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Weight must be a number.' };
    if (n <= 0 || n > 1) return { ok: false, error: 'Weight must be between 0 and 1 (exclusive of 0).' };
    return { ok: true, value: n };
  }

  function validScore(v, critName, optName) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Score for "' + critName + '" on "' + optName + '" must be a number.' };
    if (n < 1 || n > 10) return { ok: false, error: 'Scores must be 1–10 ("' + critName + '" on "' + optName + '").' };
    return { ok: true, value: n };
  }

  function addCriterion(criteria, c) {
    criteria = Array.isArray(criteria) ? criteria.slice() : [];
    if (criteria.length >= MAX_CRITERIA) return { ok: false, error: 'Criteria list is full (max 25).' };
    var nm = validName(c && c.name, 'Criterion'); if (!nm.ok) return nm;
    var w = validWeight(c && c.weight); if (!w.ok) return w;
    var exists = criteria.some(function (x) { return x.name.toLowerCase() === nm.value.toLowerCase(); });
    if (exists) return { ok: false, error: 'This criterion already exists.' };
    criteria.push({ name: nm.value, weight: w.value });
    return { ok: true, criteria: criteria };
  }

  function addOption(options, o) {
    options = Array.isArray(options) ? options.slice() : [];
    if (options.length >= MAX_OPTIONS) return { ok: false, error: 'Options list is full (max 25).' };
    var nm = validName(o && o.name, 'Option'); if (!nm.ok) return nm;
    var exists = options.some(function (x) { return x.name.toLowerCase() === nm.value.toLowerCase(); });
    if (exists) return { ok: false, error: 'This option already exists.' };
    options.push({ name: nm.value, scores: (o && o.scores) || {} });
    return { ok: true, options: options };
  }

  function normalizeWeights(criteria) {
    var sum = criteria.reduce(function (a, c) { return a + c.weight; }, 0);
    if (sum <= 0) return { ok: false, error: 'Weights must sum to a positive number.' };
    if (Math.abs(sum - 1) > 0.001) {
      return { ok: false, error: 'Weights must sum to 1.00 (currently ' + r3(sum) + '). Adjust them first.' };
    }
    return { ok: true, sum: sum };
  }

  /**
   * Score options. criteria: [{name, weight}], options: [{name, scores:{criterion: 1-10}}].
   * Returns ranked options with weighted scores.
   */
  function scoreOptions(criteria, options) {
    criteria = Array.isArray(criteria) ? criteria : [];
    options = Array.isArray(options) ? options : [];
    if (criteria.length < 2) return { ok: false, error: 'Add at least 2 criteria.' };
    if (options.length < 2) return { ok: false, error: 'Add at least 2 options to compare.' };
    var nw = normalizeWeights(criteria);
    if (!nw.ok) return nw;
    var scored = [];
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var nm = validName(o.name, 'Option'); if (!nm.ok) return nm;
      var total = 0, parts = [];
      for (var j = 0; j < criteria.length; j++) {
        var c = criteria[j];
        var sv = validScore(o.scores ? o.scores[c.name] : undefined, c.name, nm.value);
        if (!sv.ok) return sv;
        var contrib = r3(c.weight * sv.value);
        total = r3(total + contrib);
        parts.push({ criterion: c.name, weight: c.weight, score: sv.value, contribution: contrib });
      }
      scored.push({ name: nm.value, score: total, parts: parts });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return { ok: true, ranked: scored, winner: scored[0], runnerUp: scored[1] };
  }

  /**
   * Sensitivity: perturb each criterion weight ±20% (renormalise the rest
   * proportionally), re-score, and report whether the winner changes.
   */
  function sensitivity(criteria, options) {
    var base = scoreOptions(criteria, options);
    if (!base.ok) return base;
    var baseWinner = base.winner.name;
    var flips = [];
    criteria.forEach(function (c) {
      [SENS_PCT, -SENS_PCT].forEach(function (delta) {
        var pert = criteria.map(function (x) {
          if (x.name === c.name) return { name: x.name, weight: r3(x.weight * (1 + delta)) };
          return { name: x.name, weight: x.weight };
        });
        // renormalise to sum 1
        var sum = pert.reduce(function (a, x) { return a + x.weight; }, 0);
        pert.forEach(function (x) { x.weight = r3(x.weight / sum); });
        var r = scoreOptions(pert, options);
        if (r.ok && r.winner.name !== baseWinner) {
          flips.push({
            criterion: c.name,
            direction: delta > 0 ? '+' + Math.round(SENS_PCT * 100) + '%' : '−' + Math.round(SENS_PCT * 100) + '%',
            newWinner: r.winner.name,
            newScore: r.winner.score, oldWinnerScore: r.ranked.filter(function (x) { return x.name === baseWinner; })[0].score
          });
        }
      });
    });
    return {
      ok: true, baseWinner: baseWinner, baseScore: base.winner.score,
      runnerUp: base.winner.name === base.runnerUp.name ? null : base.runnerUp,
      flips: flips,
      robust: flips.length === 0,
      verdict: flips.length === 0
        ? 'Robust: the winner holds even if any single weight moves ±20%.'
        : 'Fragile: ' + flips.length + ' weight change(s) flip the winner — re-examine those criteria weights before deciding.'
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
    MAX_CRITERIA: MAX_CRITERIA, MAX_OPTIONS: MAX_OPTIONS, SENS_PCT: SENS_PCT,
    addCriterion: addCriterion, addOption: addOption,
    normalizeWeights: normalizeWeights, scoreOptions: scoreOptions,
    sensitivity: sensitivity, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'decision-support-engine';
  var FREE_LIMIT = 20;
  var criteria = [];
  var options = [];

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('ds-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function persist() { return Vault.save(SLUG, 'model', { criteria: criteria, options: options }); }
  function restore() {
    return Vault.load(SLUG, 'model').then(function (rec) {
      if (rec) {
        if (Array.isArray(rec.criteria)) criteria = rec.criteria.slice(0, MAX_CRITERIA);
        if (Array.isArray(rec.options)) options = rec.options.slice(0, MAX_OPTIONS);
      }
      renderAll();
    });
  }

  function weightSum() {
    return r3(criteria.reduce(function (a, c) { return a + c.weight; }, 0));
  }

  function renderAll() {
    var cw = $('ds-criteria');
    cw.innerHTML = criteria.length
      ? '<table class="vq-table"><thead><tr><th>Criterion</th><th style="text-align:right">Weight</th><th></th></tr></thead><tbody>' +
        criteria.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td style="text-align:right">' + c.weight + '</td>' +
            '<td style="text-align:right"><button type="button" class="vq-link" data-cdel="' + esc(c.name) + '">delete</button></td></tr>';
        }).join('') + '</tbody></table><p class="vq-hint">Weight sum: <strong>' + weightSum() + '</strong> (must be 1.00)</p>'
      : '<p class="vq-hint">No criteria yet — e.g. Cost, Revenue upside, Risk, Effort.</p>';
    cw.querySelectorAll('[data-cdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-cdel').toLowerCase();
        criteria = criteria.filter(function (c) { return c.name.toLowerCase() !== n; });
        options.forEach(function (o) { delete o.scores[b.getAttribute('data-cdel')]; });
        persist().then(renderAll);
      });
    });

    var ow = $('ds-options');
    ow.innerHTML = options.length
      ? options.map(function (o) {
          var rows = criteria.map(function (c) {
            var v = o.scores && o.scores[c.name] != null ? o.scores[c.name] : '';
            return '<div class="vq-field" style="margin-bottom:.4rem"><label for="ds-s-' + esc(o.name) + '-' + esc(c.name) + '">' + esc(c.name) + ' (1–10)</label>' +
              '<input id="ds-s-' + esc(o.name) + '-' + esc(c.name) + '" type="number" min="1" max="10" step="0.5" value="' + esc(String(v)) + '" data-opt="' + esc(o.name) + '" data-crit="' + esc(c.name) + '" inputmode="decimal"></div>';
          }).join('');
          return '<div class="card" style="margin:0 0 1rem"><h3 class="vq-section-title" style="margin-top:0">' + esc(o.name) + ' ' +
            '<button type="button" class="vq-link" data-odel="' + esc(o.name) + '">delete</button></h3>' + (rows || '<p class="vq-hint">Add criteria first.</p>') + '</div>';
        }).join('')
      : '<p class="vq-hint">No options yet — e.g. Expand now, Hold, Expand later.</p>';
    ow.querySelectorAll('[data-odel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-odel').toLowerCase();
        options = options.filter(function (o) { return o.name.toLowerCase() !== n; });
        persist().then(renderAll);
      });
    });
    ow.querySelectorAll('[data-opt]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var o = options.filter(function (x) { return x.name === inp.getAttribute('data-opt'); })[0];
        if (o) { o.scores[inp.getAttribute('data-crit')] = inp.value; persist(); }
      });
    });
  }

  function renderResult(s, sens) {
    var card = $('ds-result-card');
    card.hidden = false;
    var html;
    if (!s.ok) { html = '<p class="msg-err">' + esc(s.error) + '</p>'; }
    else {
      html = '<p>Recommended: <span class="big">' + esc(s.winner.name) + '</span> <span class="vq-hint">score ' + s.winner.score + ' / 10</span></p>' +
        '<table class="vq-table"><thead><tr><th>#</th><th>Option</th><th style="text-align:right">Weighted score</th><th>Breakdown</th></tr></thead><tbody>' +
        s.ranked.map(function (o, i) {
          return '<tr><td>' + (i + 1) + '</td><td><strong>' + esc(o.name) + '</strong></td>' +
            '<td style="text-align:right"><strong>' + o.score + '</strong></td>' +
            '<td><span class="vq-hint">' + o.parts.map(function (p) { return esc(p.criterion) + ' ' + p.score + '×' + p.weight; }).join(' · ') + '</span></td></tr>';
        }).join('') + '</tbody></table>';
      if (sens && sens.ok) {
        html += '<h3 class="vq-section-title">Sensitivity check (±20% per weight)</h3>' +
          '<p class="' + (sens.robust ? 'msg-ok' : 'msg-err') + '"><strong>' + esc(sens.verdict) + '</strong></p>';
        if (sens.flips.length) {
          html += '<table class="vq-table"><thead><tr><th>Weight change</th><th>New winner</th></tr></thead><tbody>' +
            sens.flips.map(function (f) {
              return '<tr><td>' + esc(f.criterion) + ' ' + esc(f.direction) + '</td><td><strong>' + esc(f.newWinner) + '</strong> (' + f.newScore + ' vs ' + f.oldWinnerScore + ')</td></tr>';
            }).join('') + '</tbody></table>';
        }
      }
    }
    $('ds-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'decision-support-engine-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'decision-support-engine-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does weighted scoring help a business decision?', a: 'List criteria (cost, upside, risk, effort), weight them to sum to 1, score each option 1–10 per criterion. The weighted total ranks options transparently — anyone can see which criterion drove the result.' },
      { q: 'वेटेड स्कोरिंग से फ़ैसला कैसे लें?', a: 'मानदंड तय करें, वज़न दें (योग 1), हर विकल्प को 1–10 स्कोर दें। वेटेड स्कोर से पारदर्शी रैंकिंग मिलती है।' },
      { q: 'What is the sensitivity check?', a: 'Each criterion weight is moved ±20% (others renormalised) and the ranking re-run. If the winner never changes, the recommendation is robust; if it flips, those weights need a second look before you commit.' },
      { q: 'Why must weights sum to 1?', a: 'So scores stay on the 1–10 scale and weights mean "share of importance". The tool refuses to score until the sum is exactly 1.00.' },
      { q: 'Is my decision model private?', a: 'Yes — stored only on your device. Nothing is uploaded.' }
    ]);
    restore();

    $('ds-add-crit').addEventListener('click', function () {
      var r = addCriterion(criteria, { name: $('ds-crit-name').value, weight: $('ds-crit-w').value });
      if (!r.ok) { msg(r.error, false); return; }
      criteria = r.criteria;
      persist().then(function () { msg('Criterion added.', true); $('ds-crit-name').value = ''; $('ds-crit-w').value = ''; renderAll(); });
    });

    $('ds-add-opt').addEventListener('click', function () {
      var r = addOption(options, { name: $('ds-opt-name').value, scores: {} });
      if (!r.ok) { msg(r.error, false); return; }
      options = r.options;
      persist().then(function () { msg('Option added — now score it on each criterion.', true); $('ds-opt-name').value = ''; renderAll(); });
    });

    $('ds-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('ds-gate'), SLUG, FREE_LIMIT); $('ds-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      // collect latest score inputs
      document.querySelectorAll('#ds-options [data-opt]').forEach(function (inp) {
        var o = options.filter(function (x) { return x.name === inp.getAttribute('data-opt'); })[0];
        if (o) o.scores[inp.getAttribute('data-crit')] = inp.value;
      });
      var s = scoreOptions(criteria, options);
      if (!s.ok) { msg(s.error, false); $('ds-result-card').hidden = true; return; }
      msg('', null);
      persist();
      renderResult(s, sensitivity(criteria, options));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
