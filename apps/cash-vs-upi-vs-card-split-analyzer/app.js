/* ============================================================
   VisionQuantech Business Suite — Cash vs UPI vs Card Split Analyzer
   apps/cash-vs-upi-vs-card-split-analyzer/app.js

   Pure functions first (no DOM) — tested under node.
   Sales-mix analyzer: fee drag per payment mode, settlement-lag
   notes, and a reconciliation checklist. Complements the
   payment-mode-profitability tool (which compares merchant cost)
   by focusing on MIX management and reconciliation.
   Rate assumptions (Sep 2026, editable on screen):
     UPI 0.25% blended (NPCI MDR eff. 15-Oct-2026: 0% to ₹2,000;
       0.40% above, capped ₹300/txn), cards ~2.0% blended
       (debit ≤0.90%, credit 1.5–2.5%), cash 0%.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MODES = [
    { id: 'cash', label: 'Cash', hint: 'Settlement: same day. Risk: theft, unrecorded sales, GST mismatch.' },
    { id: 'upi',  label: 'UPI',  hint: 'Settlement: usually same day / T+1. Check P2M vs P2PM classification.' },
    { id: 'card', label: 'Cards (debit + credit)', hint: 'Settlement: T+1 / T+2 via acquirer. Net of MDR — reconcile gross vs net.' }
  ];

  var DEFAULT_RATES = { cash: 0, upi: 0.25, card: 2.0 };
  var MAX_SALES = 100000000000;
  var MAX_RATE = 25;

  var HINTS = [
    'Match each day\u2019s POS/UPI-app sales report against the bank credit (settlement) for that day — flag missing credits within 2 days.',
    'Card settlements arrive NET of MDR: reconcile GROSS sale vs NET credit; the difference should equal your MDR % — investigate anything else.',
    'UPI: confirm whether your QR is P2M or P2PM (small-merchant) — P2PM merchants (≤₹1L/month) and P2M payments up to ₹2,000 carry zero MDR.',
    'Cash: deposit daily; tally the cash drawer against the day\u2019s cash sales before banking (see Daily Cash Closing Tool).',
    'Book sales GST-inclusive consistently — fee drag is on the gross (GST-inclusive) transaction value.',
    'Watch refund/chargeback deductions in card settlements — they reduce the net credit without a matching sale.'
  ];

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < min || n > max) return { ok: false, error: name + ': must be between ' + min + ' and ' + max + '.' };
    return { ok: true, value: n };
  }

  function validateSplits(raw) {
    var splits = {}, sum = 0;
    for (var i = 0; i < MODES.length; i++) {
      var v = num(raw[MODES[i].id], MODES[i].label + ' split', 0, 100);
      if (!v.ok) return v;
      splits[MODES[i].id] = v.value;
      sum = Math.round((sum + v.value) * 100) / 100;
    }
    if (Math.abs(sum - 100) > 0.01)
      return { ok: false, error: 'Splits must add up to 100% (currently ' + sum + '%).' };
    return { ok: true, splits: splits };
  }

  function validateRates(raw) {
    var out = {};
    for (var i = 0; i < MODES.length; i++) {
      var v = num(raw[MODES[i].id], MODES[i].label + ' rate', 0, MAX_RATE);
      if (!v.ok) return v;
      out[MODES[i].id] = v.value;
    }
    return { ok: true, rates: out };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * analyze({monthlySales, splits:{cash,upi,card} (%), rates:{cash,upi,card} (%)}).
   * Returns {ok, rows:[{id,label,share,sales,rate,fee,dragPct,hint}],
   *          totalFee, dragPct, annualFee, dominant, hints}.
   */
  function analyze(input) {
    input = input || {};
    var s = num(input.monthlySales, 'Monthly sales', 1, MAX_SALES);
    if (!s.ok) return s;
    var sp = validateSplits(input.splits);
    if (!sp.ok) return sp;
    var rt = validateRates(input.rates);
    if (!rt.ok) return rt;

    var rows = [], totalFee = 0, dominant = MODES[0].id, domShare = -1;
    for (var i = 0; i < MODES.length; i++) {
      var m = MODES[i];
      var share = sp.splits[m.id];
      var sales = round2(s.value * share / 100);
      var fee = round2(sales * rt.rates[m.id] / 100);
      totalFee = round2(totalFee + fee);
      if (share > domShare) { domShare = share; dominant = m.id; }
      rows.push({
        id: m.id, label: m.label, share: share, sales: sales,
        rate: rt.rates[m.id], fee: fee,
        dragPct: sales ? round2(fee / sales * 100) : 0,
        hint: m.hint
      });
    }
    var dragPct = round2(totalFee / s.value * 100);
    return {
      ok: true, rows: rows, totalFee: totalFee, dragPct: dragPct,
      annualFee: round2(totalFee * 12), dominant: dominant, hints: HINTS.slice()
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
    MODES: MODES, DEFAULT_RATES: DEFAULT_RATES, HINTS: HINTS,
    validateSplits: validateSplits, validateRates: validateRates,
    analyze: analyze, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cash-vs-upi-vs-card-split-analyzer';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function bar(share) {
    return '<div class="ubar"><div class="ufill bar-ok" style="width:' + Math.min(100, share) + '%"></div></div>';
  }

  function renderResult(r) {
    var card = $('s-result-card');
    card.hidden = false;
    var h = '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.totalFee) + '</div><div class="kpi-l">monthly fee drag</div></div>' +
      '<div class="kpi"><div class="kpi-n">' + r.dragPct.toFixed(2) + '%</div><div class="kpi-l">of sales lost to fees</div></div>' +
      '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.annualFee) + '</div><div class="kpi-l">annual fee drag</div></div>' +
      '</div>';
    h += '<div class="tbl-wrap"><table class="tbl"><tr><th>Mode</th><th>Split</th><th>Sales</th><th>Fee rate</th><th>Fee drag</th><th>Settlement note</th></tr>';
    r.rows.forEach(function (row) {
      h += '<tr><td><strong>' + esc(row.label) + '</strong></td><td>' + bar(row.share) + '<span class="vq-hint">' + row.share + '%</span></td>' +
        '<td class="num">' + fmtINR(row.sales) + '</td><td class="num">' + row.rate.toFixed(2) + '%</td>' +
        '<td class="num">' + fmtINR(row.fee) + '</td><td class="vq-hint">' + esc(row.hint) + '</td></tr>';
    });
    h += '</table></div>';
    h += '<h3>Reconciliation checklist</h3><ul class="assump">';
    r.hints.forEach(function (x) { h += '<li>' + esc(x) + '</li>'; });
    h += '</ul><p class="vq-hint">Rates are editable Sep-2026 benchmarks. Estimate only — confirm with your CA.</p>';
    $('s-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'cash-vs-upi-vs-card-split-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cash-vs-upi-vs-card-split-analyzer-bottom', 'leaderboard');
    var splitGrid = $('s-splits'), rateGrid = $('s-rates');
    MODES.forEach(function (m) {
      var d1 = document.createElement('div');
      d1.className = 'vq-field';
      d1.innerHTML = '<label for="s-split-' + m.id + '">' + esc(m.label) + ' % of sales</label>' +
        '<input id="s-split-' + m.id + '" type="number" min="0" max="100" step="0.1" value="" placeholder="0" inputmode="decimal">';
      splitGrid.appendChild(d1);
      var d2 = document.createElement('div');
      d2.className = 'vq-field';
      d2.innerHTML = '<label for="s-rate-' + m.id + '">' + esc(m.label) + ' fee %</label>' +
        '<input id="s-rate-' + m.id + '" type="number" min="0" max="25" step="0.01" value="' + DEFAULT_RATES[m.id] + '" inputmode="decimal">';
      rateGrid.appendChild(d2);
    });
    SEO.faq([
      { q: 'What is fee drag in a sales mix?', a: 'The % of your sales lost to payment acceptance fees — MDR on cards and UPI, zero on cash. A 2% drag on ₹10 lakh monthly sales is ₹20,000/month leaking to fees.' },
      { q: 'सेल्स मिक्स में फ़ी ड्रैग क्या है?', a: 'भुगतान शुल्क में जाने वाली बिक्री का प्रतिशत। ₹10 लाख की बिक्री पर 2% ड्रैग = ₹20,000/माह का नुकसान।' },
      { q: 'How fast does each mode settle?', a: 'Cash: same day. UPI: usually same day or T+1. Cards: T+1/T+2 via the acquirer, credited net of MDR.' },
      { q: 'Why don\u2019t card credits match my sales report?', a: 'Settlements arrive NET of MDR and may deduct refunds/chargebacks. Reconcile gross sale vs net credit; the gap should equal your MDR %.' },
      { q: 'How do I reconcile UPI sales?', a: 'Match the day\u2019s UPI-app/POS report against bank credits within 2 days, and confirm your QR\u2019s P2M vs P2PM classification for the correct MDR.' },
      { q: 'Are the fee rates fixed?', a: 'No — editable Sep-2026 benchmarks (UPI 0.25% blended, cards 2.0% blended). Your acquirer\u2019s settlement statement is final.' }
    ]);

    $('s-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); $('s-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var splits = {}, rates = {};
      MODES.forEach(function (m) {
        splits[m.id] = $('s-split-' + m.id).value;
        rates[m.id] = $('s-rate-' + m.id).value;
      });
      var r = analyze({ monthlySales: $('s-sales').value, splits: splits, rates: rates });
      if (!r.ok) { msg(r.error, false); $('s-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
