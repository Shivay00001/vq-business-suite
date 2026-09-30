/* ============================================================
   VisionQuantech Business Suite — Project Cost Overrun Detector
   apps/project-cost-overrun-detector/app.js

   Pure functions first (no DOM) — tested under node.
   Earned-value basics per cost head:
     EV (earned value)  = budget x % complete
     CV (cost variance) = EV - actual
     CPI                = EV / actual   (CPI < 1 = over budget)
     EAC (estimate at completion) = BAC / CPI  (CPI-stable forecast)
     VAC                = BAC - EAC    (negative = forecast overrun)
   Status: CPI >= 1 on-track; 0.9-1 watch; < 0.9 overrun.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_HEADS = 25;
  var MAX_AMOUNT = 100000000000;
  var MAX_NAME = 80;

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function text(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: name + ' is required.' };
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function uid() {
    return 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function addHead(list, h) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_HEADS) return { ok: false, error: 'Head list is full (max ' + MAX_HEADS + '). Remove one first.' };
    h = h || {};
    var name = text(h.head, 'Cost head', MAX_NAME);
    if (!name.ok) return name;
    var budget = num(h.budget, 'Budget for "' + name.value + '"', 0, MAX_AMOUNT);
    if (!budget.ok) return budget;
    if (budget.value <= 0) return { ok: false, error: 'Budget for "' + name.value + '" must be greater than zero.' };
    var actual = num(h.actual == null || h.actual === '' ? 0 : h.actual, 'Actual spent for "' + name.value + '"', 0, MAX_AMOUNT);
    if (!actual.ok) return actual;
    var pct = num(h.pctComplete == null || h.pctComplete === '' ? 0 : h.pctComplete, '% complete for "' + name.value + '"', 0, 100);
    if (!pct.ok) return pct;
    if (pct.value > 100) return { ok: false, error: '% complete for "' + name.value + '" cannot exceed 100.' };
    var rec = {
      id: uid(), head: name.value, budget: round2(budget.value),
      actual: round2(actual.value), pctComplete: round2(pct.value)
    };
    return { ok: true, headRec: rec, list: list.concat([rec]) };
  }

  function removeHead(list, id) {
    list = Array.isArray(list) ? list : [];
    var nl = list.filter(function (h) { return h.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Cost head not found.' };
    return { ok: true, list: nl };
  }

  /** Earned-value stats for one head. */
  function headStats(h) {
    var ev = round2(h.budget * h.pctComplete / 100);
    var cv = round2(ev - h.actual);
    var cpi = h.actual > 0 ? round2(ev / h.actual * 1000) / 1000
      : (ev > 0 ? Infinity : 1);
    var eac, status;
    if (h.actual > 0) {
      eac = ev > 0 ? round2(h.budget / (ev / h.actual)) : h.budget; // BAC / CPI
      var cpiR = ev / h.actual;
      status = cpiR >= 1 ? 'on-track' : cpiR >= 0.9 ? 'watch' : 'overrun';
    } else {
      eac = h.budget;
      status = h.pctComplete > 0 ? 'watch' : 'on-track'; // work done, nothing booked — verify
    }
    var vac = round2(h.budget - eac);
    var varPct = ev > 0 ? round2((h.actual - ev) / ev * 100) : (h.actual > 0 ? Infinity : 0);
    return { ok: true, ev: ev, cv: cv, cpi: cpi, eac: eac, vac: vac, varPct: varPct, status: status };
  }

  function portfolio(list) {
    list = Array.isArray(list) ? list : [];
    var bac = 0, ac = 0, ev = 0;
    var rows = list.map(function (h) {
      var s = headStats(h);
      bac += h.budget; ac += h.actual; ev += s.ev;
      return { head: h, stats: s };
    });
    bac = round2(bac); ac = round2(ac); ev = round2(ev);
    var cpi = ac > 0 ? ev / ac : (ev > 0 ? Infinity : 1);
    var eac = ac > 0 && ev > 0 ? round2(bac / cpi) : bac;
    var vac = round2(bac - eac);
    var status = !isFinite(cpi) ? 'watch' : cpi >= 1 ? 'on-track' : cpi >= 0.9 ? 'watch' : 'overrun';
    return {
      ok: true, rows: rows,
      bac: bac, ac: ac, ev: ev,
      cpi: isFinite(cpi) ? round2(cpi * 1000) / 1000 : cpi,
      eac: eac, vac: vac, status: status,
      overrunPct: bac > 0 ? round2((eac - bac) / bac * 100) : 0
    };
  }

  function fmtINR(n) {
    if (!isFinite(n)) return '—';
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
    MAX_HEADS: MAX_HEADS,
    addHead: addHead, removeHead: removeHead,
    headStats: headStats, portfolio: portfolio,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'project-cost-overrun-detector';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'overrun-heads';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('o-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { heads: [] };

  function statusBadge(s) {
    return s === 'on-track' ? '<span class="badge b-ok">On track</span>'
      : s === 'watch' ? '<span class="badge b-warn">Watch</span>'
      : '<span class="badge b-bad">Overrun</span>';
  }

  function renderList() {
    var box = $('o-list');
    if (!state.heads.length) {
      box.innerHTML = '<p class="vq-hint">No cost heads yet — add your first one above.</p>';
      $('o-summary').innerHTML = '';
      return;
    }
    var p = portfolio(state.heads);
    $('o-summary').innerHTML =
      '<div class="sum-strip">' +
      '<span>Budget (BAC): <strong>' + fmtINR(p.bac) + '</strong></span>' +
      '<span>Spent (AC): <strong>' + fmtINR(p.ac) + '</strong></span>' +
      '<span>Earned (EV): <strong>' + fmtINR(p.ev) + '</strong></span>' +
      '<span>CPI: <strong>' + p.cpi + '</strong></span>' +
      '<span>Projected final (EAC): <strong>' + fmtINR(p.eac) + '</strong></span>' +
      '<span>Forecast variance: <strong class="' + (p.vac < 0 ? 'neg' : 'pos') + '">' + fmtINR(p.vac) + '</strong> (' + p.overrunPct + '%)</span>' +
      '<span>' + statusBadge(p.status) + '</span>' +
      '</div>';
    var html = '<table class="vq-table"><thead><tr><th>Cost head</th><th>Budget</th><th>Spent</th><th>% done</th><th>EV</th><th>CPI</th><th>EAC</th><th>Status</th><th></th></tr></thead><tbody>';
    p.rows.forEach(function (r) {
      html += '<tr><td>' + esc(r.head.head) + '</td><td>' + fmtINR(r.head.budget) + '</td><td>' + fmtINR(r.head.actual) + '</td>' +
        '<td>' + r.head.pctComplete + '%</td><td>' + fmtINR(r.stats.ev) + '</td><td>' + r.stats.cpi + '</td>' +
        '<td>' + fmtINR(r.stats.eac) + '</td><td>' + statusBadge(r.stats.status) + '</td>' +
        '<td><button type="button" class="vq-btn vq-btn-ghost" data-remove="' + esc(r.head.id) + '">×</button></td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), heads: state.heads.slice(0, MAX_HEADS) });
      msg('Saved on this device (' + state.heads.length + ' head(s)).', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.heads)) { state.heads = rec.heads.slice(0, MAX_HEADS); renderList(); }
    } catch (e) { /* nothing saved yet */ }
  }

  function init() {
    Ads.render($('ad-top'), 'project-cost-overrun-detector-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'project-cost-overrun-detector-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I detect cost overrun on a project early?', a: 'Use earned value: EV = budget × % complete. If actual spent (AC) exceeds EV, you are over budget. CPI = EV ÷ AC below 1.0 confirms it; projected final cost EAC = budget ÷ CPI.' },
      { q: 'कॉस्ट ओवररन कैसे पहचानें?', a: 'अर्न्ड वैल्यू निकालें: EV = बजट × पूर्णता %। अगर वास्तविक खर्च (AC) EV से ज़्यादा है, तो आप बजट से ऊपर हैं। CPI = EV ÷ AC; 1 से कम मतलब ओवररन।' },
      { q: 'What is EAC = BAC / CPI?', a: 'Estimate at Completion: your total budget (BAC) divided by cost performance index (CPI). It assumes current cost efficiency continues — a standard, conservative forecast used worldwide.' },
      { q: 'CPI 0.9 से कम का क्या मतलब है?', a: 'हर ₹1 खर्च पर ₹0.90 से कम मूल्य मिल रहा है — गंभीर ओवररन। कारण खोजें (दर वृद्धि, स्कोप क्रीप, कम उत्पादकता) और सुधारात्मक कदम उठाएँ।' },
      { q: 'Is this project accounting advice?', a: 'No — a planning aid using standard earned-value math. Confirm with your project accountant/CA before contractual claims.' }
    ]);

    $('o-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('o-gate'), SLUG, FREE_LIMIT); $('o-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addHead(state.heads, {
        head: $('o-head').value, budget: $('o-budget').value,
        actual: $('o-actual').value, pctComplete: $('o-pct').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      state.heads = r.list;
      var p = portfolio(state.heads);
      msg('Head added. Portfolio CPI ' + p.cpi + ', projected final ' + fmtINR(p.eac) + '. ' + gate.remaining + ' free use(s) left today.', true);
      $('o-head').value = ''; $('o-budget').value = ''; $('o-actual').value = ''; $('o-pct').value = '';
      renderList();
    });

    $('o-list').addEventListener('click', function (e) {
      var b = e.target;
      if (b && b.dataset && b.dataset.remove) {
        var r = removeHead(state.heads, b.dataset.remove);
        if (r.ok) { state.heads = r.list; renderList(); }
      }
    });

    $('o-save').addEventListener('click', persist);
    renderList();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
