/* ============================================================
   VisionQuantech Business Suite — Cash Burn Rate Analyzer
   apps/cash-burn-rate-analyzer/app.js

   Pure functions first (no DOM) — tested under node.
   From month-end cash balances, computes the average monthly NET
   BURN (cash decrease), the RUNWAY in months at that burn, and the
   projected ZERO-CASH date. If cash is growing, it reports the
   business as cash-flow positive instead.
   Enter at least 2 month-end balances; more months = steadier avg.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_MONTHS = 60;
  var MAX_BAL = 100000000000;

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function validateMonth(s) {
    s = trim(s);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { ok: false, error: 'Month "' + s.slice(0, 20) + '" must be YYYY-MM.' };
    var y = +s.slice(0, 4);
    if (y < 2000 || y > 2100) return { ok: false, error: 'Year out of range.' };
    return { ok: true, value: s };
  }

  function validateBalance(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid balance.' };
    if (n < 0) return { ok: false, error: 'Balance cannot be negative (enter current cash in hand + bank).' };
    if (n > MAX_BAL) return { ok: false, error: 'Balance looks too large.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  /** Validate + sort a list of {month, balance}. */
  function validateSeries(rows) {
    if (!Array.isArray(rows)) return { ok: false, error: 'Internal error: rows must be an array.' };
    if (rows.length < 2) return { ok: false, error: 'Enter at least 2 month-end balances.' };
    if (rows.length > MAX_MONTHS) return { ok: false, error: 'Too many months (max ' + MAX_MONTHS + ').' };
    var seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var mp = validateMonth(rows[i].month);
      if (!mp.ok) return { ok: false, error: 'Row ' + (i + 1) + ': ' + mp.error };
      var bp = validateBalance(rows[i].balance);
      if (!bp.ok) return { ok: false, error: 'Row ' + (i + 1) + ': ' + bp.error };
      if (seen[mp.value]) return { ok: false, error: 'Row ' + (i + 1) + ': duplicate month ' + mp.value + '.' };
      seen[mp.value] = true;
      out.push({ month: mp.value, balance: bp.value });
    }
    out.sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    return { ok: true, series: out };
  }

  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    var d = new Date(Date.UTC(y, m + Math.floor(n), 1));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * Core analysis. netBurn = (first.balance - last.balance) / (n-1).
   * Positive netBurn => burning; zero/negative => cash-flow positive.
   * Returns {ok, months, startBal, endBal, netBurn, burning, runwayMonths,
   *          zeroCashMonth, verdict}.
   */
  function analyze(rows) {
    var v = validateSeries(rows);
    if (!v.ok) return v;
    var s = v.series;
    var n = s.length;
    var netBurn = round2((s[0].balance - s[n - 1].balance) / (n - 1));
    var burning = netBurn > 0;
    var endBal = s[n - 1].balance;
    var runwayMonths = burning ? endBal / netBurn : Infinity;
    var runwayRounded = burning ? Math.floor(runwayMonths * 10) / 10 : null;
    var zeroCashMonth = burning ? addMonths(s[n - 1].month, Math.ceil(runwayMonths)) : null;
    var verdict;
    if (!burning) verdict = endBal === 0 ? 'Cash is flat at zero — no buffer and no burn.' : 'Cash-flow POSITIVE — balance is growing. Keep at least 3–6 months of essential expenses as reserve.';
    else if (runwayMonths < 3) verdict = 'CRITICAL — under 3 months of runway. Cut discretionary spend and chase receivables now.';
    else if (runwayMonths < 6) verdict = 'TIGHT — under 6 months of runway. Build an emergency reserve (see Emergency Cash Estimator).';
    else verdict = 'Comfortable runway, but keep monitoring monthly.';
    return {
      ok: true, months: n, firstMonth: s[0].month, lastMonth: s[n - 1].month,
      startBal: s[0].balance, endBal: endBal,
      netBurn: netBurn, burning: burning,
      runwayMonths: runwayRounded, zeroCashMonth: zeroCashMonth,
      verdict: verdict, series: s
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
    MAX_MONTHS: MAX_MONTHS,
    validateMonth: validateMonth, validateBalance: validateBalance,
    validateSeries: validateSeries, analyze: analyze, addMonths: addMonths,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cash-burn-rate-analyzer';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('r-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function monthRows() {
    var rows = [];
    var wrap = $('r-rows');
    for (var i = 0; i < wrap.children.length; i++) {
      var div = wrap.children[i];
      var m = div.querySelector('.r-m').value, b = div.querySelector('.r-b').value;
      if (m || b) rows.push({ month: m, balance: b });
    }
    return rows;
  }

  function addRow(month, balance) {
    var div = document.createElement('div');
    div.className = 'dyn-row';
    div.innerHTML = '<input class="r-m" type="month" aria-label="Month" value="' + esc(month || '') + '">' +
      '<input class="r-b" type="number" min="0" step="0.01" placeholder="Month-end balance ₹" aria-label="Balance" value="' + esc(balance || '') + '" inputmode="decimal">' +
      '<button type="button" class="vq-btn vq-btn-sm r-x" aria-label="Remove">✕</button>';
    div.querySelector('.r-x').addEventListener('click', function () { div.remove(); });
    $('r-rows').appendChild(div);
  }

  function renderResult(r) {
    var card = $('r-result-card');
    card.hidden = false;
    var h;
    if (!r.burning) {
      h = '<p class="msg-ok">Cash-flow positive ✓</p>' +
        '<p>Balance grew from ' + fmtINR(r.startBal) + ' (' + esc(r.firstMonth) + ') to ' +
        fmtINR(r.endBal) + ' (' + esc(r.lastMonth) + ') — average net <strong>gain</strong> of ' +
        fmtINR(Math.abs(r.netBurn)) + '/month. No burn, no zero-cash date.</p>';
    } else {
      h = '<div class="kpi-row">' +
        '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.netBurn) + '</div><div class="kpi-l">avg net burn / month</div></div>' +
        '<div class="kpi"><div class="kpi-n">' + r.runwayMonths + '</div><div class="kpi-l">months of runway</div></div>' +
        '<div class="kpi"><div class="kpi-n txt-bad">' + esc(r.zeroCashMonth) + '</div><div class="kpi-l">projected zero-cash month</div></div>' +
        '</div>' +
        '<p class="vq-hint">Cash fell from ' + fmtINR(r.startBal) + ' (' + esc(r.firstMonth) + ') to ' +
        fmtINR(r.endBal) + ' (' + esc(r.lastMonth) + ') over ' + r.months + ' months.</p>';
    }
    h += '<p><strong>' + esc(r.verdict) + '</strong></p>' +
      '<p class="vq-hint">Assumes the average burn continues unchanged — seasonality, one-off expenses and new funding are not modelled. Review monthly.</p>';
    $('r-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'cash-burn-rate-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cash-burn-rate-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is cash burn rate?', a: 'The average monthly decrease in your cash balance. If you had ₹10 lakh in January and ₹7 lakh in April, your net burn is ₹1 lakh per month.' },
      { q: 'कैश बर्न रेट क्या है?', a: 'आपके कैश बैलेंस में औसत मासिक कमी। रनवे = मौजूदा कैश ÷ मासिक बर्न — यह बताता है कि पैसा कितने महीने चलेगा।' },
      { q: 'What is runway?', a: 'Runway = current cash ÷ monthly net burn. It is the number of months you can operate at the current burn before cash hits zero.' },
      { q: 'How many months of balances should I enter?', a: 'At least 2; 6–12 months gives a steadier average that smooths one-off spikes.' },
      { q: 'My balance is growing — what does the tool say?', a: 'It reports you as cash-flow positive with no burn and no zero-cash date, and still recommends a 3–6 month emergency reserve.' },
      { q: 'Is this a forecast?', a: 'A simple projection, not a forecast — it assumes the average burn continues. Seasonality and new funding are not modelled.' }
    ]);

    for (var i = 0; i < 6; i++) addRow('', '');
    $('r-addrow').addEventListener('click', function () { addRow('', ''); });

    $('r-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); $('r-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = analyze(monthRows());
      if (!r.ok) { msg(r.error, false); $('r-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
