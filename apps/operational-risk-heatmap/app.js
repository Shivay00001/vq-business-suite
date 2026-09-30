/* ============================================================
   VisionQuantech Business Suite — Operational Risk Heatmap
   apps/operational-risk-heatmap/app.js

   Self-assessment tool: register operational risks on a 5x5
   likelihood x impact matrix, score them (likelihood x impact),
   band them, and surface the top risks.

   Bands (standard 5x5 practice):
     1-4   Low | 5-9  Medium | 10-15 High | 16-25 Critical

   Pure functions first (no DOM) — tested under node.
   Estimate only — confirm with your auditor/CA.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_RISKS = 25;
  var MAX_TITLE = 120;
  var MAX_OWNER = 60;

  var LEVEL_NAMES = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
  var IMPACT_NAMES = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

  function band(score) {
    var s = Number(score);
    if (!isFinite(s)) return 'Low';
    if (s >= 16) return 'Critical';
    if (s >= 10) return 'High';
    if (s >= 5) return 'Medium';
    return 'Low';
  }

  function validateRisk(title, likelihood, impact) {
    var t = String(title == null ? '' : title).trim();
    if (!t) return { ok: false, error: 'Enter a risk title (e.g. "Server failure during billing").' };
    if (t.length > MAX_TITLE) return { ok: false, error: 'Risk title must be under ' + MAX_TITLE + ' characters.' };
    var l = Number(likelihood);
    if (!isFinite(l) || Math.floor(l) !== l || l < 1 || l > 5)
      return { ok: false, error: 'Likelihood must be a whole number from 1 (Rare) to 5 (Almost certain).' };
    var im = Number(impact);
    if (!isFinite(im) || Math.floor(im) !== im || im < 1 || im > 5)
      return { ok: false, error: 'Impact must be a whole number from 1 (Insignificant) to 5 (Catastrophic).' };
    return { ok: true, title: t, likelihood: l, impact: im };
  }

  function addRisk(list, title, likelihood, impact, owner) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: risk list is not an array.' };
    if (list.length >= MAX_RISKS)
      return { ok: false, error: 'Risk register is full (max ' + MAX_RISKS + '). Remove an entry or save a snapshot first.' };
    var v = validateRisk(title, likelihood, impact);
    if (!v.ok) return v;
    var score = v.likelihood * v.impact;
    var risk = {
      id: 'risk-' + (list.length + 1) + '-' + Date.now().toString(36),
      title: v.title,
      likelihood: v.likelihood,
      impact: v.impact,
      score: score,
      band: band(score),
      owner: String(owner == null ? '' : owner).trim().slice(0, MAX_OWNER)
    };
    return { ok: true, risk: risk, list: list.concat([risk]) };
  }

  function removeRisk(list, id) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: risk list is not an array.' };
    var nl = list.filter(function (r) { return r && r.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Risk not found.' };
    return { ok: true, list: nl };
  }

  /** Risks sorted by score desc, then title. */
  function topRisks(list, n) {
    if (!Array.isArray(list)) return [];
    var k = Math.max(1, Math.min(25, Math.floor(Number(n) || 5)));
    return list.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.title).localeCompare(String(b.title));
    }).slice(0, k);
  }

  /** Map "likelihood-impact" -> array of risk titles, for grid rendering. */
  function matrixCells(list) {
    var cells = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      var key = r.likelihood + '-' + r.impact;
      if (!cells[key]) cells[key] = [];
      cells[key].push(r.title);
    });
    return cells;
  }

  function stats(list) {
    var s = { total: 0, Critical: 0, High: 0, Medium: 0, Low: 0, topScore: 0, avgScore: 0 };
    var arr = Array.isArray(list) ? list : [];
    s.total = arr.length;
    if (!arr.length) return s;
    var sum = 0;
    arr.forEach(function (r) {
      if (s[r.band] != null) s[r.band]++;
      sum += r.score;
      if (r.score > s.topScore) s.topScore = r.score;
    });
    s.avgScore = Math.round((sum / arr.length) * 10) / 10;
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_RISKS: MAX_RISKS, LEVEL_NAMES: LEVEL_NAMES, IMPACT_NAMES: IMPACT_NAMES,
    band: band, validateRisk: validateRisk, addRisk: addRisk,
    removeRisk: removeRisk, topRisks: topRisks,
    matrixCells: matrixCells, stats: stats, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'operational-risk-heatmap';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('orh-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var register = [];

  var BAND_CLASS = { Critical: 'b-crit', High: 'b-high', Medium: 'b-med', Low: 'b-low' };

  function render() {
    var cells = matrixCells(register);
    var html = '<table class="heat" aria-label="5 by 5 risk heatmap"><tbody>';
    for (var im = 5; im >= 1; im--) {
      html += '<tr><th scope="row" class="axis">' + IMPACT_NAMES[im - 1] + '<br><span>' + im + '</span></th>';
      for (var l = 1; l <= 5; l++) {
        var score = l * im, b = band(score);
        var titles = cells[l + '-' + im] || [];
        html += '<td class="' + BAND_CLASS[b] + '"><span class="cell-score">' + score + '</span>';
        titles.forEach(function (t) { html += '<span class="cell-risk">' + esc(t) + '</span>'; });
        html += '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p class="vq-hint">Likelihood → 1 Rare … 5 Almost certain · Rows: impact ↑ 1 Insignificant … 5 Catastrophic. Cell number = likelihood × impact.</p>';
    $('orh-grid').innerHTML = html;

    var st = stats(register);
    $('orh-stats').innerHTML =
      '<p class="vq-hint">Registered: <strong>' + st.total + '</strong> · ' +
      '<span class="chip b-crit">Critical ' + st.Critical + '</span> ' +
      '<span class="chip b-high">High ' + st.High + '</span> ' +
      '<span class="chip b-med">Medium ' + st.Medium + '</span> ' +
      '<span class="chip b-low">Low ' + st.Low + '</span>' +
      (st.total ? ' · Avg score: <strong>' + st.avgScore + '</strong>' : '') + '</p>';

    var tops = topRisks(register, 5);
    if (tops.length) {
      var th = '<ol class="top-list">';
      tops.forEach(function (r) {
        th += '<li><span class="chip ' + BAND_CLASS[r.band] + '">' + r.band + ' · ' + r.score + '</span> ' +
          '<strong>' + esc(r.title) + '</strong> <span class="vq-hint">(L' + r.likelihood + ' × I' + r.impact +
          (r.owner ? ' · owner: ' + esc(r.owner) : '') + ')</span></li>';
      });
      th += '</ol>';
      $('orh-top').innerHTML = '<h2 class="vq-section-title">Top risks — act on these first</h2>' + th;
    } else {
      $('orh-top').innerHTML = '<p class="vq-hint">No risks registered yet — add your first risk above.</p>';
    }
  }

  function init() {
    Ads.render($('ad-top'), 'operational-risk-heatmap-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'operational-risk-heatmap-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a 5x5 risk heatmap?', a: 'A 5x5 risk heatmap plots each risk by likelihood (1=Rare to 5=Almost certain) against impact (1=Insignificant to 5=Catastrophic). The score is likelihood × impact, from 1 to 25.' },
      { q: 'रिस्क हीटमैप क्या है?', a: 'रिस्क हीटमैप में हर जोखिम को संभावना (1–5) और प्रभाव (1–5) के आधार पर रखा जाता है। स्कोर = संभावना × प्रभाव। यह आत्म-मूल्यांकन का उपकरण है।' },
      { q: 'How is the risk score calculated?', a: 'Risk score = likelihood rating × impact rating. Bands: 1–4 Low, 5–9 Medium, 10–15 High, 16–25 Critical.' },
      { q: 'What do the risk bands mean?', a: 'Low: monitor. Medium: review controls periodically. High: needs a mitigation plan and owner. Critical: act now — the business could be seriously harmed.' },
      { q: 'How many risks can I register?', a: 'Up to 25 risks per register. You can save register snapshots on this device (max 25 saved snapshots).' },
      { q: 'Is this a substitute for a professional risk audit?', a: 'No. This is a self-assessment estimate to help you prioritise. Confirm your risk treatment with your auditor or CA before acting on it.' }
    ]);

    $('orh-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('orh-gate'), SLUG, FREE_LIMIT); $('orh-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addRisk(register, $('orh-title').value, $('orh-lik').value, $('orh-imp').value, $('orh-owner').value);
      if (!r.ok) { msg(r.error, false); return; }
      register = r.list;
      $('orh-title').value = '';
      $('orh-owner').value = '';
      msg('Risk added: "' + r.risk.title + '" — score ' + r.risk.score + ' (' + r.risk.band + ').', true);
      render();
    });

    $('orh-clear').addEventListener('click', function () {
      register = [];
      msg('Register cleared.', true);
      render();
    });

    $('orh-save').addEventListener('click', async function () {
      if (!register.length) { msg('Nothing to save yet — add at least one risk.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) {
          Freemium.renderUpsell($('orh-upsell'), SLUG, SAVE_CAP);
          return;
        }
        await Vault.save(SLUG, 'snapshot-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), stats: stats(register), risks: register
        });
        msg('Snapshot saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) {
        msg('Could not save: ' + e.message, false);
      }
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
