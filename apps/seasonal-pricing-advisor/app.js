/* ============================================================
   VisionQuantech Business Suite — Seasonal Pricing Advisor
   apps/seasonal-pricing-advisor/app.js

   From 12 monthly sales (units or revenue) + a base price:
     avg             = Σ sales / 12
     seasonality idx = month / avg × 100
     peak   = idx > 110  -> suggested multiplier 1.05 (+5%)
     off-peak = idx < 90 -> suggested multiplier 0.95 (−5%)
     else   -> 1.00

   Suggested price per month = base price × multiplier.
   Also reports peak/off-peak revenue opportunity: re-running
   the year's volume at suggested prices.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMT = 10000000000;
  var PEAK_MULT = 1.05;
  var OFF_MULT = 0.95;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function validSales(v, name) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (n > MAX_AMT) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  function validPrice(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Base price: enter a valid number.' };
    if (n <= 0) return { ok: false, error: 'Base price must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: 'Base price looks too large.' };
    return { ok: true, value: n };
  }

  function multiplierFor(index) {
    if (index > 110) return { mult: PEAK_MULT, band: 'peak' };
    if (index < 90) return { mult: OFF_MULT, band: 'off-peak' };
    return { mult: 1.0, band: 'normal' };
  }

  /**
   * Analyze 12 monthly sales figures.
   * opts: {sales: [12 numbers], basePrice}
   */
  function analyze(opts) {
    opts = opts || {};
    var sales = opts.sales;
    if (!Array.isArray(sales) || sales.length !== 12) {
      return { ok: false, error: 'Enter sales for all 12 months.' };
    }
    var vals = [];
    for (var i = 0; i < 12; i++) {
      var r = validSales(sales[i], MONTHS[i] + ' sales');
      if (!r.ok) return r;
      vals.push(r2(r.value));
    }
    var total = r2(vals.reduce(function (a, b) { return a + b; }, 0));
    if (total <= 0) return { ok: false, error: 'Total annual sales must be greater than zero.' };
    var p = validPrice(opts.basePrice);
    if (!p.ok) return p;
    var avg = total / 12;
    var rows = vals.map(function (v, i) {
      var idx = r1(v / avg * 100);
      var m = multiplierFor(idx);
      return {
        month: MONTHS[i], sales: v, index: idx,
        band: m.band, multiplier: m.mult,
        suggestedPrice: r2(p.value * m.mult)
      };
    });
    var peaks = rows.filter(function (r) { return r.band === 'peak'; });
    var offs = rows.filter(function (r) { return r.band === 'off-peak'; });
    // Revenue opportunity: same volume at suggested prices vs base price
    var baseRev = r2(total * p.value);
    var adjRev = r2(rows.reduce(function (a, r) { return a + r.sales * r.suggestedPrice; }, 0));
    return {
      ok: true,
      basePrice: r2(p.value), totalSales: total, avgMonthly: r2(avg),
      rows: rows,
      peakMonths: peaks.map(function (r) { return r.month; }),
      offPeakMonths: offs.map(function (r) { return r.month; }),
      baseRevenue: baseRev,
      adjustedRevenue: adjRev,
      revenueUplift: r2(adjRev - baseRev),
      revenueUpliftPct: baseRev > 0 ? r1((adjRev - baseRev) / baseRev * 100) : 0,
      PEAK_MULT: PEAK_MULT, OFF_MULT: OFF_MULT
    };
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
    MONTHS: MONTHS, PEAK_MULT: PEAK_MULT, OFF_MULT: OFF_MULT,
    analyze: analyze, multiplierFor: multiplierFor,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'seasonal-pricing-advisor';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('sp-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function buildForm() {
    var sample = [80, 75, 90, 100, 110, 95, 85, 90, 105, 140, 130, 120];
    $('sp-months').innerHTML = MONTHS.map(function (m, i) {
      return '<div class="vq-field"><label for="sp-m' + i + '">' + m + '</label>' +
        '<input id="sp-m' + i + '" type="number" min="0" step="0.01" value="' + sample[i] + '" inputmode="decimal"></div>';
    }).join('');
  }

  function persist(vals, price) { return Vault.save(SLUG, 'year', { sales: vals, basePrice: price }); }
  function restore() {
    return Vault.load(SLUG, 'year').then(function (rec) {
      if (rec && Array.isArray(rec.sales) && rec.sales.length === 12) {
        rec.sales.forEach(function (v, i) { var el = $('sp-m' + i); if (el) el.value = v; });
        if (rec.basePrice) $('sp-price').value = rec.basePrice;
      }
    });
  }

  function bandBadge(band) {
    if (band === 'peak') return '<span class="msg-ok">🔺 peak +5%</span>';
    if (band === 'off-peak') return '<span class="msg-err">🔻 off-peak −5%</span>';
    return '<span class="vq-hint">normal</span>';
  }

  function renderResult(a) {
    var card = $('sp-result-card');
    card.hidden = false;
    var html;
    if (!a.ok) { html = '<p class="msg-err">' + esc(a.error) + '</p>'; }
    else {
      html =
        '<p>Peak months: <strong>' + (a.peakMonths.length ? esc(a.peakMonths.join(', ')) : 'none') + '</strong> · ' +
        'Off-peak: <strong>' + (a.offPeakMonths.length ? esc(a.offPeakMonths.join(', ')) : 'none') + '</strong></p>' +
        '<p>Revenue at flat base price: <strong>' + fmtINR(a.baseRevenue) + '</strong> · ' +
        'with seasonal pricing: <strong>' + fmtINR(a.adjustedRevenue) + '</strong> ' +
        '(<span class="msg-ok">+' + fmtINR(a.revenueUplift) + ' · +' + a.revenueUpliftPct + '%</span>)</p>' +
        '<table class="vq-table"><thead><tr><th>Month</th><th style="text-align:right">Sales</th><th style="text-align:right">Index</th><th>Band</th><th style="text-align:right">Suggested price</th></tr></thead><tbody>' +
        a.rows.map(function (r) {
          return '<tr><td>' + r.month + '</td><td style="text-align:right">' + r.sales.toLocaleString('en-IN') + '</td>' +
            '<td style="text-align:right">' + r.index + '</td><td>' + bandBadge(r.band) + '</td>' +
            '<td style="text-align:right"><strong>' + fmtINR(r.suggestedPrice) + '</strong></td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="vq-hint">Index 100 = average month. Multipliers: peak ×1.05, off-peak ×0.95. ' +
        'Assumes volume does not react to the price change — verify with a small test first.</p>';
    }
    $('sp-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'seasonal-pricing-advisor-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'seasonal-pricing-advisor-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a seasonality index?', a: 'Monthly sales ÷ average monthly sales × 100. An index of 130 means the month sells 30% above average; 70 means 30% below. It is the standard way to see your yearly rhythm.' },
      { q: 'सीज़नैलिटी इंडेक्स क्या है?', a: 'मासिक बिक्री ÷ औसत मासिक बिक्री × 100। 130 का इंडेक्स मतलब औसत से 30% ज़्यादा बिक्री, 70 मतलब 30% कम।' },
      { q: 'Should I raise prices in peak season?', a: 'Usually yes, modestly: +5% in peak months captures willingness to pay, and −5% in off-peak months can stimulate volume. Test small first — demand elasticity varies by product.' },
      { q: 'How is the revenue uplift calculated?', a: 'Same monthly volumes re-priced: peak months at base × 1.05, off-peak at base × 0.95. It assumes volume does not change with price — a simplification, so treat it as directional.' },
      { q: 'Is my sales data private?', a: 'Yes — saved only on your device. Nothing is uploaded.' }
    ]);
    buildForm();
    restore();

    $('sp-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('sp-gate'), SLUG, FREE_LIMIT); $('sp-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var sales = [];
      for (var i = 0; i < 12; i++) sales.push($('sp-m' + i).value);
      var a = analyze({ sales: sales, basePrice: $('sp-price').value });
      if (!a.ok) { msg(a.error, false); $('sp-result-card').hidden = true; return; }
      msg('', null);
      persist(sales.map(Number), $('sp-price').value);
      renderResult(a);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
