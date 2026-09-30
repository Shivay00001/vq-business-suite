/* ============================================================
   VisionQuantech Business Suite — What-If Scenario Simulator
   apps/what-if-scenario-simulator/app.js

   Three scenarios (base / optimistic / pessimistic) over price,
   volume, unit cost and fixed cost. Profit per scenario plus an
   exact profit waterfall that decomposes the delta between any
   two scenarios into four additive effects:

     P  = (p - c)·v - F
     ΔP = Δp·vB            (price effect)
        + (pA - cB)·Δv     (volume effect)
        - Δc·vA            (cost effect)
        - ΔF               (fixed-cost effect)

   The four effects sum exactly to (PA - PB). Verified in tests.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SAVE = 25;

  function num(v, name, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > 1e12) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  /** Validate one scenario object. */
  function validateScenario(s, label) {
    s = s || {};
    label = label || 'scenario';
    var p = num(s.price, label + ': price'); if (!p.ok) return p;
    var v = num(s.volume, label + ': volume', true); if (!v.ok) return v;
    var c = num(s.unitCost, label + ': unit cost', true); if (!c.ok) return c;
    var f = num(s.fixedCost, label + ': fixed cost', true); if (!f.ok) return f;
    return { ok: true, value: { price: p.value, volume: v.value, unitCost: c.value, fixedCost: f.value } };
  }

  /** Profit = (price - unitCost) * volume - fixedCost. */
  function scenarioProfit(s) {
    var r = validateScenario(s, 'base');
    if (!r.ok) return r;
    var x = r.value;
    return {
      ok: true,
      contribution: r2((x.price - x.unitCost) * x.volume),
      contributionPerUnit: r2(x.price - x.unitCost),
      fixedCost: x.fixedCost,
      profit: r2((x.price - x.unitCost) * x.volume - x.fixedCost),
      marginPct: x.price > 0 ? r2((x.price - x.unitCost) / x.price * 100) : 0
    };
  }

  /** Compare alt scenarios against base; adds delta and deltaPct. */
  function compareScenarios(base, alts) {
    var b = validateScenario(base, 'base');
    if (!b.ok) return b;
    var bp = scenarioProfit(b.value);
    var out = [];
    for (var i = 0; i < alts.length; i++) {
      var a = validateScenario(alts[i].scenario || alts[i], alts[i].name || ('scenario ' + (i + 1)));
      if (!a.ok) return a;
      var ap = scenarioProfit(a.value);
      var delta = r2(ap.profit - bp.profit);
      out.push({
        name: alts[i].name || ('Scenario ' + (i + 1)),
        scenario: a.value,
        profit: ap.profit,
        contribution: ap.contribution,
        contributionPerUnit: ap.contributionPerUnit,
        marginPct: ap.marginPct,
        delta: delta,
        deltaPct: bp.profit !== 0 ? r2(delta / Math.abs(bp.profit) * 100) : (delta === 0 ? 0 : Infinity)
      });
    }
    return {
      ok: true,
      base: { name: 'Base', scenario: b.value, profit: bp.profit, contribution: bp.contribution,
              contributionPerUnit: bp.contributionPerUnit, marginPct: bp.marginPct },
      scenarios: out
    };
  }

  /**
   * Exact waterfall: decompose (alt - base) profit delta into
   * price / volume / cost / fixed effects. Sums to total.
   */
  function waterfall(base, alt) {
    var b = validateScenario(base, 'base');
    if (!b.ok) return b;
    var a = validateScenario(alt, 'alt');
    if (!a.ok) return a;
    var B = b.value, A = a.value;
    var priceEffect = r2((A.price - B.price) * B.volume);
    var volumeEffect = r2((A.price - B.unitCost) * (A.volume - B.volume));
    var costEffect = r2(-(A.unitCost - B.unitCost) * A.volume);
    var fixedEffect = r2(-(A.fixedCost - B.fixedCost));
    var total = r2(priceEffect + volumeEffect + costEffect + fixedEffect);
    return {
      ok: true,
      priceEffect: priceEffect, volumeEffect: volumeEffect,
      costEffect: costEffect, fixedEffect: fixedEffect,
      total: total,
      baseProfit: scenarioProfit(B).profit,
      altProfit: scenarioProfit(A).profit
    };
  }

  /** Saved-plan helper: max 25, newest first. */
  function addRecord(records, rec) {
    records = Array.isArray(records) ? records : [];
    if (records.length >= MAX_SAVE) return { ok: false, error: 'Saved list is full (max 25).' };
    var label = String(rec && rec.label != null ? rec.label : '').slice(0, 60);
    if (!label) return { ok: false, error: 'Give the plan a short label.' };
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
    MAX_SAVE: MAX_SAVE, validateScenario: validateScenario,
    scenarioProfit: scenarioProfit, compareScenarios: compareScenarios,
    waterfall: waterfall, addRecord: addRecord, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'what-if-scenario-simulator';
  var FREE_LIMIT = 20;

  var SCEN = [
    { id: 'base', name: 'Base', price: '100', volume: '1000', unitCost: '60', fixedCost: '10000' },
    { id: 'opt', name: 'Optimistic', price: '110', volume: '1200', unitCost: '58', fixedCost: '10000' },
    { id: 'pess', name: 'Pessimistic', price: '95', volume: '800', unitCost: '62', fixedCost: '12000' }
  ];

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('ws-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function readScenario(id) {
    return {
      price: $(id + '-price').value, volume: $(id + '-volume'),
      unitCost: $(id + '-cost').value, fixedCost: $(id + '-fixed').value
    };
  }

  function renderResult(cmp, wfSel) {
    var card = $('ws-result-card');
    card.hidden = false;
    var rows = [cmp.base].concat(cmp.scenarios).map(function (s, i) {
      var isBase = i === 0;
      return '<tr><td><strong>' + esc(s.name) + '</strong></td>' +
        '<td style="text-align:right">' + fmtINR(s.scenario.price) + '</td>' +
        '<td style="text-align:right">' + s.scenario.volume.toLocaleString('en-IN') + '</td>' +
        '<td style="text-align:right">' + fmtINR(s.scenario.unitCost) + '</td>' +
        '<td style="text-align:right">' + fmtINR(s.scenario.fixedCost) + '</td>' +
        '<td style="text-align:right">' + fmtINR(s.contribution) + '</td>' +
        '<td style="text-align:right"><strong>' + fmtINR(s.profit) + '</strong></td>' +
        '<td style="text-align:right">' + (isBase ? '—' : (s.delta >= 0 ? '+' : '') + fmtINR(s.delta) +
          ' <span class="vq-hint">(' + (s.deltaPct === Infinity ? '∞' : (s.deltaPct >= 0 ? '+' : '') + s.deltaPct + '%') + ')</span>') + '</td></tr>';
    }).join('');
    var wf = wfSel ? waterfall(cmp.base.scenario, cmp.scenarios[wfSel].scenario) : null;
    var wfHtml = '';
    if (wf && wf.ok) {
      var eff = [
        ['Price effect (Δp × base volume)', wf.priceEffect],
        ['Volume effect ((new p − base c) × Δv)', wf.volumeEffect],
        ['Cost effect (−Δc × new volume)', wf.costEffect],
        ['Fixed-cost effect (−ΔF)', wf.fixedEffect]
      ];
      wfHtml = '<h3 class="vq-section-title">Profit waterfall — Base → ' + esc(cmp.scenarios[wfSel].name) + '</h3>' +
        '<table class="vq-table"><tbody>' +
        '<tr><td>Base profit</td><td style="text-align:right">' + fmtINR(wf.baseProfit) + '</td></tr>' +
        eff.map(function (e) {
          return '<tr><td>' + esc(e[0]) + '</td><td style="text-align:right">' +
            (e[1] >= 0 ? '<span class="msg-ok">+' : '<span class="msg-err">') + fmtINR(e[1]) + '</span></td></tr>';
        }).join('') +
        '<tr><td><strong>' + esc(cmp.scenarios[wfSel].name) + ' profit</strong></td><td style="text-align:right"><strong>' + fmtINR(wf.altProfit) + '</strong></td></tr>' +
        '</tbody></table>' +
        '<p class="vq-hint">The four effects add up exactly to the profit difference (' + fmtINR(wf.total) + ').</p>';
    }
    $('ws-result').innerHTML =
      '<table class="vq-table"><thead><tr><th>Scenario</th><th style="text-align:right">Price</th><th style="text-align:right">Volume</th>' +
      '<th style="text-align:right">Unit cost</th><th style="text-align:right">Fixed</th><th style="text-align:right">Contribution</th>' +
      '<th style="text-align:right">Profit</th><th style="text-align:right">Δ vs base</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="vq-field"><label for="ws-wf">Show waterfall for</label><select id="ws-wf">' +
      cmp.scenarios.map(function (s, i) {
        return '<option value="' + i + '"' + (i === wfSel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</select></div>' + wfHtml;
    var sel = $('ws-wf');
    if (sel) sel.addEventListener('change', function () { renderResult(cmp, parseInt(sel.value, 10)); });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildForm() {
    $('ws-scenarios').innerHTML = SCEN.map(function (s) {
      return '<div class="card" style="margin:0 0 1rem"><h3 class="vq-section-title" style="margin-top:0">' + esc(s.name) + '</h3>' +
        '<div class="form-grid">' +
        '<div class="vq-field"><label for="' + s.id + '-price">Price (₹)</label><input id="' + s.id + '-price" type="number" min="0" step="0.01" value="' + s.price + '"></div>' +
        '<div class="vq-field"><label for="' + s.id + '-volume">Volume (units)</label><input id="' + s.id + '-volume" type="number" min="0" step="1" value="' + s.volume + '"></div>' +
        '<div class="vq-field"><label for="' + s.id + '-cost">Unit cost (₹)</label><input id="' + s.id + '-cost" type="number" min="0" step="0.01" value="' + s.unitCost + '"></div>' +
        '<div class="vq-field"><label for="' + s.id + '-fixed">Fixed cost (₹)</label><input id="' + s.id + '-fixed" type="number" min="0" step="0.01" value="' + s.fixedCost + '"></div>' +
        '</div></div>';
    }).join('');
  }

  function init() {
    Ads.render($('ad-top'), 'what-if-scenario-simulator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'what-if-scenario-simulator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a what-if scenario analysis?', a: 'You define a base case and alternative scenarios (optimistic/pessimistic) over price, volume, unit cost and fixed cost, and compare the resulting profit side by side instead of guessing.' },
      { q: 'व्हाट-इफ़ सिनेरियो एनालिसिस क्या है?', a: 'बेस केस और वैकल्पिक सिनेरियो (आशावादी/निराशावादी) में कीमत, वॉल्यूम, यूनिट लागत और फिक्स्ड लागत बदलकर मुनाफ़े की तुलना करें।' },
      { q: 'How does the profit waterfall work?', a: 'The profit difference between two scenarios is split exactly into four additive effects: price effect (Δp × base volume), volume effect ((new price − base cost) × Δvolume), cost effect (−Δcost × new volume) and fixed-cost effect (−Δfixed). They sum to the total difference.' },
      { q: 'Which lever moves profit most?', a: 'Usually price: every ₹1 of price flows almost fully to profit, while a ₹1 cost change is diluted. The waterfall shows each lever\'s exact rupee contribution for your numbers.' },
      { q: 'Is this a financial forecast?', a: 'No — it is a deterministic comparison of scenarios you define. It does not model probability, seasonality, or demand elasticity.' }
    ]);
    buildForm();

    $('ws-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('ws-gate'), SLUG, FREE_LIMIT); $('ws-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var cmp = compareScenarios(readScenario('base'), [
        { name: 'Optimistic', scenario: readScenario('opt') },
        { name: 'Pessimistic', scenario: readScenario('pess') }
      ]);
      if (!cmp.ok) { msg(cmp.error, false); $('ws-result-card').hidden = true; return; }
      msg('', null);
      renderResult(cmp, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
