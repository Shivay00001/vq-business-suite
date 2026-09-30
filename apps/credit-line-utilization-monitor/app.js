/* ============================================================
   VisionQuantech Business Suite — Credit Line Utilization Monitor
   apps/credit-line-utilization-monitor/app.js

   Pure functions first (no DOM) — tested under node.
   Tracks credit facilities (CC / OD / term loan / bill discounting):
   limit vs drawn, utilization %, estimated monthly interest on the
   drawn amount, and utilization alerts (>75% warning, >=90% critical).
   Interest estimate assumes interest is charged on the utilized
   amount at the contracted annual rate (stated on screen) — actual
   billing may add fees, penal interest or minimum charges.
   Max 25 facilities (Vault), reads unmetered.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SAVED = 25;
  var MAX_AMOUNT = 100000000000;
  var MAX_RATE = 60;

  var KINDS = ['cc', 'od', 'term-loan', 'bill-discounting', 'other'];
  var KIND_LABELS = { 'cc': 'Cash Credit', 'od': 'Overdraft', 'term-loan': 'Term Loan', 'bill-discounting': 'Bill Discounting', 'other': 'Other' };

  var WARN_PCT = 75, CRIT_PCT = 90;

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function validateFacility(f) {
    f = f || {};
    var name = trim(f.name);
    if (!name) return { ok: false, error: 'Enter a facility name (e.g. HDFC CC).' };
    if (name.length > 60) return { ok: false, error: 'Name too long (max 60 chars).' };
    if (KINDS.indexOf(f.kind) < 0) return { ok: false, error: 'Unknown facility type.' };
    var limit = Number(f.limit);
    if (!isFinite(limit)) return { ok: false, error: 'Enter a valid sanctioned limit.' };
    if (limit <= 0) return { ok: false, error: 'Limit must be greater than zero.' };
    if (limit > MAX_AMOUNT) return { ok: false, error: 'Limit looks too large.' };
    var drawn = Number(f.drawn);
    if (!isFinite(drawn)) return { ok: false, error: 'Enter a valid drawn/utilized amount.' };
    if (drawn < 0) return { ok: false, error: 'Drawn amount cannot be negative.' };
    if (drawn > limit) return { ok: false, error: 'Drawn amount exceeds the sanctioned limit.' };
    var rate = Number(f.rate);
    if (!isFinite(rate)) return { ok: false, error: 'Enter a valid interest rate.' };
    if (rate < 0 || rate > MAX_RATE) return { ok: false, error: 'Rate must be between 0 and 60%.' };
    return {
      ok: true,
      facility: {
        name: name.slice(0, 60), kind: f.kind,
        limit: Math.round(limit * 100) / 100,
        drawn: Math.round(drawn * 100) / 100,
        rate: Math.round(rate * 100) / 100
      }
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Per-facility stats: utilization %, monthly interest, headroom, status. */
  function facilityStats(f) {
    var v = validateFacility(f);
    if (!v.ok) return v;
    var fc = v.facility;
    var util = round2(fc.drawn / fc.limit * 100);
    var monthlyInterest = round2(fc.drawn * fc.rate / 100 / 12);
    var headroom = round2(fc.limit - fc.drawn);
    var status = util >= CRIT_PCT ? 'critical' : (util >= WARN_PCT ? 'warning' : 'ok');
    return { ok: true, facility: fc, utilizationPct: util, monthlyInterest: monthlyInterest, headroom: headroom, status: status };
  }

  function registerAdd(list, facility) {
    var v = validateFacility(facility);
    if (!v.ok) return v;
    var arr = Array.isArray(list) ? list.slice() : [];
    if (arr.length >= MAX_SAVED)
      return { ok: false, error: 'Too many facilities (max ' + MAX_SAVED + ').' };
    var dup = arr.some(function (e) { return e.name.toLowerCase() === v.facility.name.toLowerCase(); });
    if (dup) return { ok: false, error: 'A facility with this name already exists.' };
    arr.push(v.facility);
    return { ok: true, list: arr };
  }

  function registerRemove(list, name) {
    var arr = (Array.isArray(list) ? list : []).filter(function (e) { return e.name !== name; });
    return { ok: true, list: arr };
  }

  /**
   * Portfolio view across facilities.
   * Returns {ok, facilities:[stats], totalLimit, totalDrawn, utilPct,
   *          monthlyInterest, weightedRate, alerts:[...]}.
   */
  function portfolio(list) {
    var arr = Array.isArray(list) ? list : [];
    if (!arr.length) return { ok: false, error: 'Add at least one facility.' };
    var facs = [], totalLimit = 0, totalDrawn = 0, monthlyInterest = 0, alerts = [];
    for (var i = 0; i < arr.length; i++) {
      var s = facilityStats(arr[i]);
      if (!s.ok) return { ok: false, error: 'Facility ' + (i + 1) + ': ' + s.error };
      facs.push(s);
      totalLimit = round2(totalLimit + s.facility.limit);
      totalDrawn = round2(totalDrawn + s.facility.drawn);
      monthlyInterest = round2(monthlyInterest + s.monthlyInterest);
      if (s.status !== 'ok')
        alerts.push({
          name: s.facility.name, utilizationPct: s.utilizationPct,
          level: s.status,
          text: s.status === 'critical'
            ? 'Utilization ≥90% — near-maxed; one over-limit event can trigger penal charges.'
            : 'Utilization ≥75% — headroom is thin; plan repayments before drawing more.'
        });
    }
    var utilPct = totalLimit ? round2(totalDrawn / totalLimit * 100) : 0;
    var weightedRate = totalDrawn ? round2(facs.reduce(function (a, s) { return a + s.facility.drawn * s.facility.rate; }, 0) / totalDrawn) : 0;
    alerts.sort(function (a, b) { return (a.level === 'critical' ? 0 : 1) - (b.level === 'critical' ? 0 : 1); });
    return {
      ok: true, facilities: facs, totalLimit: totalLimit, totalDrawn: totalDrawn,
      utilPct: utilPct, monthlyInterest: monthlyInterest, weightedRate: weightedRate,
      annualInterest: round2(monthlyInterest * 12), alerts: alerts
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
    MAX_SAVED: MAX_SAVED, KINDS: KINDS, KIND_LABELS: KIND_LABELS,
    WARN_PCT: WARN_PCT, CRIT_PCT: CRIT_PCT,
    validateFacility: validateFacility, facilityStats: facilityStats,
    registerAdd: registerAdd, registerRemove: registerRemove, portfolio: portfolio,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'credit-line-utilization-monitor';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'facilities';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('u-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  async function loadList() {
    try { var l = await Vault.load(SLUG, VAULT_KEY); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  async function saveList(list) { await Vault.save(SLUG, VAULT_KEY, list); }

  function bar(pct) {
    var cls = pct >= CRIT_PCT ? 'bar-crit' : pct >= WARN_PCT ? 'bar-warn' : 'bar-ok';
    return '<div class="ubar"><div class="ufill ' + cls + '" style="width:' + Math.min(100, pct) + '%"></div></div>';
  }

  async function renderAll() {
    var list = await loadList();
    var h;
    if (!list.length) {
      h = '<p class="vq-hint">No facilities yet — add your CC / OD / loan above.</p>';
    } else {
      var p = portfolio(list);
      h = '<div class="kpi-row">' +
        '<div class="kpi"><div class="kpi-n">' + fmtINR(p.totalLimit) + '</div><div class="kpi-l">total sanctioned</div></div>' +
        '<div class="kpi"><div class="kpi-n">' + fmtINR(p.totalDrawn) + '</div><div class="kpi-l">total drawn (' + p.utilPct + '%)</div></div>' +
        '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(p.monthlyInterest) + '</div><div class="kpi-l">est. monthly interest</div></div>' +
        '<div class="kpi"><div class="kpi-n">' + p.weightedRate.toFixed(2) + '%</div><div class="kpi-l">weighted avg rate</div></div>' +
        '</div>';
      if (p.alerts.length) {
        p.alerts.forEach(function (a) {
          h += '<p class="' + (a.level === 'critical' ? 'msg-err' : 'msg-warn') + '">⚠ ' + esc(a.name) + ' — ' + a.utilizationPct + '% utilized. ' + esc(a.text) + '</p>';
        });
      }
      h += '<div class="tbl-wrap"><table class="tbl"><tr><th>Facility</th><th>Type</th><th>Limit</th><th>Drawn</th><th>Utilization</th><th>Rate</th><th>Est. int./mo</th><th></th></tr>';
      p.facilities.forEach(function (s) {
        var badge = s.status === 'critical' ? '<span class="tag tag-bad">CRITICAL</span>'
          : s.status === 'warning' ? '<span class="tag tag-warn">WATCH</span>' : '<span class="tag tag-ok">OK</span>';
        h += '<tr><td>' + esc(s.facility.name) + '</td><td>' + esc(KIND_LABELS[s.facility.kind]) + '</td>' +
          '<td class="num">' + fmtINR(s.facility.limit) + '</td><td class="num">' + fmtINR(s.facility.drawn) + '</td>' +
          '<td>' + bar(s.utilizationPct) + '<span class="vq-hint">' + s.utilizationPct + '%</span> ' + badge + '</td>' +
          '<td class="num">' + s.facility.rate.toFixed(2) + '%</td>' +
          '<td class="num">' + fmtINR(s.monthlyInterest) + '</td>' +
          '<td><button type="button" class="vq-btn vq-btn-sm" data-del="' + esc(s.facility.name) + '">✕</button></td></tr>';
      });
      h += '</table></div>';
      h += '<p class="vq-hint">Interest is estimated on the drawn amount at the contracted annual rate (÷12). Fees, penal interest, compounding frequency and minimum charges are not modelled — your sanction letter / statement is final.</p>';
    }
    $('u-portfolio').innerHTML = h;
    var btns = $('u-portfolio').querySelectorAll('[data-del]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', async function () {
        await saveList(registerRemove(await loadList(), this.getAttribute('data-del')).list);
        renderAll();
      });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'credit-line-utilization-monitor-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'credit-line-utilization-monitor-bottom', 'leaderboard');
    var sel = $('u-kind');
    KINDS.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = KIND_LABELS[k];
      sel.appendChild(o);
    });
    SEO.faq([
      { q: 'What is credit line utilization?', a: 'Drawn amount ÷ sanctioned limit, as a %. High utilization (≥75–90%) signals stress to lenders, leaves no headroom, and can trigger penal charges on over-limit drawings.' },
      { q: 'क्रेडिट लाइन यूटिलाइज़ेशन क्या है?', a: 'उपयोग की गई राशि ÷ स्वीकृत सीमा। 75% से ऊपर चेतावनी, 90% से ऊपर गंभीर — हेडरूम खत्म हो जाता है और पेनल्टी लग सकती है।' },
      { q: 'How is the interest estimated?', a: 'On the drawn amount at your contracted annual rate ÷ 12. Fees, penal interest, compounding and minimum charges are not modelled — your sanction letter and statement are final.' },
      { q: 'Why track utilization across facilities?', a: 'To see total exposure, the weighted average cost of borrowed money, and which facility to repay first (usually the highest rate / highest utilization).' },
      { q: 'Where is my facility data stored?', a: 'On your own device (up to 25 facilities). Nothing is uploaded anywhere.' },
      { q: 'Does this replace my bank statement?', a: 'No — update the drawn amounts from your statements monthly; this is a monitoring dashboard, not an official record.' }
    ]);

    $('u-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('u-gate'), SLUG, FREE_LIMIT); $('u-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = registerAdd(await loadList(), {
        name: $('u-name').value, kind: $('u-kind').value,
        limit: $('u-limit').value, drawn: $('u-drawn').value, rate: $('u-rate').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      await saveList(r.list); // Vault save awaited, max 25
      msg('Facility added.', true);
      $('u-name').value = ''; $('u-limit').value = ''; $('u-drawn').value = ''; $('u-rate').value = '';
      renderAll();
    });

    renderAll(); // reads are unmetered
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
