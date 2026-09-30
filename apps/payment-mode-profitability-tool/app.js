/* ============================================================
   VisionQuantech Business Suite — Payment Mode Profitability Tool
   apps/payment-mode-profitability-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Compares UPI / credit card / debit card / netbanking / cash on
   MERCHANT cost: editable MDR % per mode, flat per-transaction
   charge for netbanking (needs avg ticket size). Outputs per-mode
   cost, total cost, effective cost %, annual cost, and the saving
   from shifting mix toward the cheapest mode.
   Rate assumptions (Sep 2026, editable on screen):
     UPI 0.25% blended — NPCI MDR from 15-Oct-2026: 0% on P2M up to
       ₹2,000; 0.40% above ₹2,000, capped at ₹300/txn.
     Credit card ~2.0% (typical 1.5–2.5%), debit card ~0.90%,
     netbanking ~₹7 flat/txn, cash 0%.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MODES = [
    { id: 'upi',        label: 'UPI',        kind: 'pct' },
    { id: 'credit',     label: 'Credit card', kind: 'pct' },
    { id: 'debit',      label: 'Debit card',  kind: 'pct' },
    { id: 'netbanking', label: 'Netbanking',  kind: 'flat' },
    { id: 'cash',       label: 'Cash',        kind: 'pct' }
  ];

  var DEFAULT_RATES = { upi: 0.25, credit: 2.0, debit: 0.9, netbankingFlat: 7, cash: 0 };

  var MAX_SALES = 100000000000;
  var MAX_RATE = 25;
  var MAX_FLAT = 10000;
  var MAX_TICKET = 100000000;

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function num(v, name, min, max) {
    if (trim(v) === '' && min === 0) return { ok: true, value: 0 };
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < min) return { ok: false, error: name + ': cannot be below ' + min + '.' };
    if (n > max) return { ok: false, error: name + ': too large.' };
    return { ok: true, value: n };
  }

  function validateMix(raw) {
    var mix = {}, sum = 0;
    for (var i = 0; i < MODES.length; i++) {
      var v = num(raw[MODES[i].id], MODES[i].label + ' share', 0, 100);
      if (!v.ok) return v;
      mix[MODES[i].id] = v.value;
      sum = Math.round((sum + v.value) * 100) / 100;
    }
    if (Math.abs(sum - 100) > 0.01)
      return { ok: false, error: 'Shares must add up to 100% (currently ' + sum + '%).' };
    return { ok: true, mix: mix };
  }

  function validateRates(raw) {
    var out = {};
    var fields = [
      ['upi', 'UPI rate', 0, MAX_RATE], ['credit', 'Credit card rate', 0, MAX_RATE],
      ['debit', 'Debit card rate', 0, MAX_RATE], ['cash', 'Cash rate', 0, MAX_RATE]
    ];
    for (var i = 0; i < fields.length; i++) {
      var v = num(raw[fields[i][0]], fields[i][1], fields[i][2], fields[i][3]);
      if (!v.ok) return v;
      out[fields[i][0]] = v.value;
    }
    var f = num(raw.netbankingFlat, 'Netbanking flat charge', 0, MAX_FLAT);
    if (!f.ok) return f;
    out.netbankingFlat = f.value;
    return { ok: true, rates: out };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * compare({monthlySales, mix:{upi,credit,debit,netbanking,cash} (%),
   *          rates:{upi,credit,debit,cash (%), netbankingFlat (₹)},
   *          avgTicket})
   * Returns {ok, rows:[{id,label,sales,share,cost,costPct}], totalCost,
   *          effectivePct, annualCost, cheapest, ranking, potentialSaving}.
   * potentialSaving: annual saving if the priciest share moved to cheapest.
   */
  function compare(input) {
    input = input || {};
    var s = num(input.monthlySales, 'Monthly sales', 1, MAX_SALES);
    if (!s.ok) return s;
    var mx = validateMix(input.mix);
    if (!mx.ok) return mx;
    var rt = validateRates(input.rates);
    if (!rt.ok) return rt;
    var t = num(input.avgTicket, 'Average ticket size', 1, MAX_TICKET);
    if (!t.ok) return t;

    var rows = [], totalCost = 0;
    for (var i = 0; i < MODES.length; i++) {
      var m = MODES[i];
      var share = mx.mix[m.id];
      var sales = round2(s.value * share / 100);
      var cost;
      if (m.kind === 'pct') cost = round2(sales * rt.rates[m.id] / 100);
      else {
        var txns = sales / t.value;
        cost = round2(txns * rt.rates.netbankingFlat);
      }
      totalCost = round2(totalCost + cost);
      rows.push({
        id: m.id, label: m.label, share: share, sales: sales,
        rate: m.kind === 'pct' ? rt.rates[m.id] : rt.rates.netbankingFlat,
        rateKind: m.kind, cost: cost,
        costPct: sales ? round2(cost / sales * 100) : 0
      });
    }
    var effectivePct = round2(totalCost / s.value * 100);
    var annualCost = round2(totalCost * 12);
    var ranked = rows.slice().sort(function (a, b) { return a.costPct - b.costPct; });
    var cheapest = ranked[0], priciest = ranked[ranked.length - 1];
    // Saving if priciest mode's volume moved to the cheapest mode:
    var movedCost = round2(priciest.sales * cheapest.costPct / 100);
    var potentialSaving = round2((priciest.cost - movedCost) * 12);
    return {
      ok: true, rows: rows, totalCost: totalCost, effectivePct: effectivePct,
      annualCost: annualCost, cheapest: cheapest.id, ranking: ranked.map(function (r) { return r.id; }),
      potentialSaving: potentialSaving > 0 ? potentialSaving : 0
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
    MODES: MODES, DEFAULT_RATES: DEFAULT_RATES,
    validateMix: validateMix, validateRates: validateRates,
    compare: compare, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'payment-mode-profitability-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('p-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r) {
    var card = $('p-result-card');
    card.hidden = false;
    var h = '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.totalCost) + '</div><div class="kpi-l">monthly payment cost</div></div>' +
      '<div class="kpi"><div class="kpi-n">' + r.effectivePct.toFixed(2) + '%</div><div class="kpi-l">effective cost of sales</div></div>' +
      '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.annualCost) + '</div><div class="kpi-l">annual cost</div></div>' +
      '</div>';
    h += '<div class="tbl-wrap"><table class="tbl"><tr><th>Mode</th><th>Share</th><th>Sales</th><th>Rate</th><th>Cost</th><th>Cost %</th></tr>';
    r.rows.forEach(function (row) {
      var rate = row.rateKind === 'pct' ? row.rate.toFixed(2) + '%' : '₹' + row.rate + '/txn';
      h += '<tr><td>' + esc(row.label) + '</td><td>' + row.share + '%</td><td class="num">' + fmtINR(row.sales) + '</td>' +
        '<td>' + esc(rate) + '</td><td class="num">' + fmtINR(row.cost) + '</td><td class="num">' + row.costPct.toFixed(2) + '%</td></tr>';
    });
    h += '</table></div>';
    var cheapLabel = '', priceyLabel = '';
    r.rows.forEach(function (row) {
      if (row.id === r.cheapest) cheapLabel = row.label;
      if (row.id === r.ranking[r.ranking.length - 1]) priceyLabel = row.label;
    });
    if (r.potentialSaving > 0)
      h += '<p class="msg-ok">Cheapest mode: <strong>' + esc(cheapLabel) + '</strong>. Moving ' + esc(priceyLabel) +
        ' volume to it could save up to <strong>' + fmtINR(r.potentialSaving) + '/year</strong> — before settlement-speed and customer-preference trade-offs.</p>';
    h += '<p class="vq-hint">MDR rates are editable assumptions (Sep 2026 benchmarks). Actual rates depend on your acquirer and volumes — confirm on your settlement statement.</p>';
    $('p-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'payment-mode-profitability-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'payment-mode-profitability-tool-bottom', 'leaderboard');
    var mixGrid = $('p-mix'), rateGrid = $('p-rates');
    MODES.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'vq-field';
      div.innerHTML = '<label for="p-mix-' + m.id + '">' + esc(m.label) + ' share %</label>' +
        '<input id="p-mix-' + m.id + '" type="number" min="0" max="100" step="0.1" value="" placeholder="0" inputmode="decimal">';
      mixGrid.appendChild(div);
      var rd = document.createElement('div');
      rd.className = 'vq-field';
      if (m.kind === 'pct') {
        var def = DEFAULT_RATES[m.id];
        rd.innerHTML = '<label for="p-rate-' + m.id + '">' + esc(m.label) + ' MDR %</label>' +
          '<input id="p-rate-' + m.id + '" type="number" min="0" max="25" step="0.01" value="' + def + '" inputmode="decimal">';
      } else {
        rd.innerHTML = '<label for="p-rate-nb">Netbanking ₹/txn</label>' +
          '<input id="p-rate-nb" type="number" min="0" max="10000" step="0.01" value="' + DEFAULT_RATES.netbankingFlat + '" inputmode="decimal">';
      }
      rateGrid.appendChild(rd);
    });
    SEO.faq([
      { q: 'Which payment mode is cheapest for Indian merchants?', a: 'Cash is free; UPI is cheapest digitally — 0% up to ₹2,000 per P2M transaction and 0.40% above that (capped ₹300) under the NPCI MDR rules effective 15-Oct-2026. Debit cards cost up to 0.90% and credit cards typically 1.5–2.5%.' },
      { q: 'UPI, कार्ड या कैश — कौन सस्ता है?', a: 'कैश मुफ़्त है। UPI सबसे सस्ता डिजिटल माध्यम है — ₹2,000 तक 0%, उससे ऊपर 0.40% (अधिकतम ₹300)। क्रेडिट कार्ड 1.5–2.5% तक पड़ता है।' },
      { q: 'What is MDR?', a: 'Merchant Discount Rate — the fee your bank/acquirer deducts per transaction. It is a merchant cost; it cannot be passed to the customer.' },
      { q: 'Is UPI really free for merchants now?', a: 'Not fully. From 15-Oct-2026, eligible P2M UPI transactions above ₹2,000 carry 0.40% MDR (capped at ₹300); small merchants under the P2PM category and P2P transfers stay at zero.' },
      { q: 'Should I push customers to the cheapest mode?', a: 'Only partly — settlement speed, ticket size and customer preference matter too. Use this tool to see the rupee cost, then decide the trade-off consciously.' },
      { q: 'Are these MDR rates fixed?', a: 'No — they are editable Sep-2026 benchmarks. Your actual rates depend on your acquirer, volumes and card mix; confirm on your settlement statement.' }
    ]);

    $('p-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var mix = {}, rates = {};
      MODES.forEach(function (m) {
        mix[m.id] = $('p-mix-' + m.id).value;
        rates[m.id === 'netbanking' ? 'netbankingFlat' : m.id] =
          m.kind === 'pct' ? $('p-rate-' + m.id).value : $('p-rate-nb').value;
      });
      var r = compare({ monthlySales: $('p-sales').value, mix: mix, rates: rates, avgTicket: $('p-ticket').value });
      if (!r.ok) { msg(r.error, false); $('p-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
