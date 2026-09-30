/* ============================================================
   VisionQuantech Business Suite — EMI & Loan Tracker
   app.js for apps/emi-loan-tracker/

   Pure computation functions (EMI, amortization, prepayment
   impact) are defined first with NO DOM dependencies so they can
   be unit-tested under node. The browser UI is wired at the bottom.
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     PURE COMPUTATIONS — no DOM, no globals. Tested under node.
     ========================================================== */

  /**
   * Monthly EMI from the standard reducing-balance formula:
   *   EMI = P * r * (1+r)^n / ((1+r)^n - 1),  r = annualRate/1200
   */
  function emi(principal, annualRatePct, months) {
    var P = +principal, r = (+annualRatePct) / 1200, n = Math.round(+months);
    if (!(P > 0) || !(n > 0) || !isFinite(P) || !isFinite(r)) return 0;
    if (r === 0) return P / n;
    var f = Math.pow(1 + r, n);
    if (!isFinite(f) || f <= 1) return 0;
    return (P * r * f) / (f - 1);
  }

  /**
   * Full amortization schedule.
   * prepayments: [{month: 1-based, amount}] applied against principal.
   * mode: 'tenure' (default) keeps EMI, shortens the loan;
   *       'emi' re-computes a lower EMI for the remaining tenure.
   * Returns {rows, monthsTaken, totalInterest, totalPaid, finalEmi}.
   * Row: {month, emi, principal, interest, balance, extra}
   */
  function amortization(principal, annualRatePct, months, prepayments, mode) {
    var P = +principal, r = (+annualRatePct) / 1200, n = Math.round(+months);
    var E = emi(P, annualRatePct, n);
    if (E <= 0) return { rows: [], monthsTaken: 0, totalInterest: 0, totalPaid: 0, finalEmi: 0 };
    mode = (mode === 'emi') ? 'emi' : 'tenure';

    var prepay = {};
    (prepayments || []).forEach(function (p) {
      var m = Math.round(+p.month), a = +p.amount;
      if (m >= 1 && a > 0 && isFinite(a)) prepay[m] = (prepay[m] || 0) + a;
    });

    var rows = [], balance = P, month = 0;
    var totalInterest = 0, totalPaid = 0;

    while (balance > 0.005 && month < 1200) {
      month += 1;
      var interest = balance * r;
      var principalPart = E - interest;
      var extra = prepay[month] || 0;
      // never overpay the loan
      if (extra > Math.max(0, balance - principalPart)) {
        extra = Math.max(0, balance - principalPart);
      }
      principalPart += extra;
      if (principalPart > balance) principalPart = balance;
      var paid = principalPart + interest;
      balance = Math.max(0, balance - principalPart);
      totalInterest += interest;
      totalPaid += paid;
      rows.push({
        month: month, emi: paid, principal: principalPart,
        interest: interest, balance: balance, extra: extra
      });
      if (mode === 'emi' && extra > 0) {
        var rem = n - month;
        if (rem > 0 && balance > 0.005) E = emi(balance, annualRatePct, rem);
      }
    }
    return {
      rows: rows, monthsTaken: month, totalInterest: totalInterest,
      totalPaid: totalPaid, finalEmi: E
    };
  }

  /**
   * Full loan summary incl. prepayment impact.
   */
  function loanSummary(principal, annualRatePct, months, prepayments, mode) {
    var E = emi(principal, annualRatePct, months);
    var base = amortization(principal, annualRatePct, months, [], 'tenure');
    var withPre = amortization(principal, annualRatePct, months,
                              prepayments || [], mode || 'tenure');
    var hasPre = (prepayments || []).some(function (p) { return (+p.amount || 0) > 0; });
    return {
      emi: E,
      months: Math.round(+months),
      totalInterest: base.totalInterest,
      totalPayable: base.totalPaid,
      hasPrepayment: hasPre,
      withPrepay: withPre,
      monthsSaved: hasPre ? Math.max(0, base.monthsTaken - withPre.monthsTaken) : 0,
      interestSaved: hasPre ? Math.max(0, base.totalInterest - withPre.totalInterest) : 0
    };
  }

  /** Indian-rupee formatting, no paise. */
  function fmtINR(n) {
    var v = Math.round(+n || 0);
    var neg = v < 0;
    var s = Math.abs(v).toLocaleString('en-IN');
    return (neg ? '-\u20B9' : '\u20B9') + s;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function slugify(s) {
    return String(s || 'loan').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'loan';
  }

  var API = {
    emi: emi,
    amortization: amortization,
    loanSummary: loanSummary,
    fmtINR: fmtINR,
    esc: esc,
    slugify: slugify
  };

  /* Expose pure API: node (tests) or browser window. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.EmiApp = API;
  }

  /* ==========================================================
     BROWSER UI — skipped under node.
     ========================================================== */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'emi-loan-tracker';
  var FREE_LIMIT = 20; // calculations per day

  function $(id) { return document.getElementById(id); }

  function readForm() {
    var tenureVal = parseFloat($('f-tenure').value) || 0;
    var unit = $('f-tenure-unit').value === 'years' ? 12 : 1;
    var preAmt = parseFloat($('f-prepay-amt').value) || 0;
    var preMonth = parseInt($('f-prepay-month').value, 10) || 0;
    var prepayments = [];
    if (preAmt > 0 && preMonth > 0) prepayments.push({ month: preMonth, amount: preAmt });
    return {
      name: $('f-name').value.trim() || 'My Loan',
      principal: parseFloat($('f-principal').value) || 0,
      rate: parseFloat($('f-rate').value) || 0,
      months: Math.round(tenureVal * unit),
      prepayments: prepayments,
      mode: $('f-mode').value
    };
  }

  function renderResults(input, s) {
    var box = $('results');
    if (!(input.principal > 0) || !(input.months > 0)) {
      box.innerHTML = '<div class="vq-notice">Please enter a valid loan amount and tenure.</div>';
      return;
    }
    var pre = '';
    if (s.hasPrepayment) {
      pre =
        '<div class="vq-result prepay"><h3>Prepayment impact</h3>' +
        '<div class="stat-grid">' +
        '<div><span>Months saved</span><strong>' + s.monthsSaved + '</strong></div>' +
        '<div><span>Interest saved</span><strong>' + fmtINR(s.interestSaved) + '</strong></div>' +
        '<div><span>New tenure</span><strong>' + s.withPrepay.monthsTaken + ' months</strong></div>' +
        '</div></div>';
    }
    var rowsHtml = s.withPrepay.rows.map(function (r) {
      return '<tr><td>' + r.month + '</td><td>' + fmtINR(r.emi) + '</td>' +
        '<td>' + fmtINR(r.principal) + '</td><td>' + fmtINR(r.interest) + '</td>' +
        '<td>' + fmtINR(r.balance) + '</td></tr>';
    }).join('');

    box.innerHTML =
      '<div class="vq-result"><h3>Loan summary</h3>' +
      '<div class="stat-grid">' +
      '<div><span>Monthly EMI</span><strong class="big">' + fmtINR(s.emi) + '</strong></div>' +
      '<div><span>Total interest</span><strong>' + fmtINR(s.totalInterest) + '</strong></div>' +
      '<div><span>Total payable</span><strong>' + fmtINR(s.totalPayable) + '</strong></div>' +
      '<div><span>Tenure</span><strong>' + s.months + ' months</strong></div>' +
      '</div>' +
      '<p class="vq-hint">Formula: EMI = P&middot;r&middot;(1+r)<sup>n</sup> / ((1+r)<sup>n</sup> &minus; 1), ' +
      'where r = annual rate &divide; 1200, n = tenure in months (reducing balance).</p>' +
      '</div>' + pre +
      '<h3>Amortization schedule</h3>' +
      '<div class="vq-table-wrap sched"><table class="vq-table">' +
      '<thead><tr><th>Month</th><th>EMI paid</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<p class="vq-hint">' + s.withPrepay.monthsTaken + ' payments shown.</p>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function doCalculate() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell($('gate-banner'), SLUG, FREE_LIMIT);
      $('gate-banner').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    var input = readForm();
    var s = loanSummary(input.principal, input.rate, input.months,
                        input.prepayments, input.mode);
    renderResults(input, s);
    window.__lastCalc = { input: input, summary: s };
  }

  function vaultKeyFor(input) {
    return slugify(input.name) + '-' + Date.now().toString(36);
  }

  async function saveLoan() {
    var last = window.__lastCalc;
    if (!last) { alert('Calculate the loan first, then save it.'); return; }
    var key = vaultKeyFor(last.input);
    try {
      await Vault.save(SLUG, key, {
        name: last.input.name, principal: last.input.principal,
        rate: last.input.rate, months: last.input.months,
        prepayments: last.input.prepayments, mode: last.input.mode,
        emi: last.summary.emi, totalInterest: last.summary.totalInterest,
        totalPayable: last.summary.totalPayable, savedAt: new Date().toISOString()
      });
      await renderSaved();
    } catch (e) { alert('Could not save: ' + e.message); }
  }

  async function renderSaved() {
    var list = $('saved-list');
    var compare = $('compare-wrap');
    var entries;
    try { entries = await Vault.list(SLUG); }
    catch (e) { list.innerHTML = '<p class="vq-hint">Storage unavailable.</p>'; return; }
    var loans = [];
    for (var i = 0; i < entries.length; i++) {
      try {
        var d = await Vault.load(SLUG, entries[i].key);
        if (d && d.principal) loans.push({ key: entries[i].key, data: d });
      } catch (e) { /* skip unreadable */ }
    }
    if (!loans.length) {
      list.innerHTML = '<p class="vq-hint">No saved loans yet. Calculate one above and tap "Save this loan".</p>';
      compare.innerHTML = '';
      return;
    }
    list.innerHTML = loans.map(function (l) {
      var d = l.data;
      return '<div class="saved-row"><div><strong>' + esc(d.name) + '</strong>' +
        '<div class="vq-hint">' + fmtINR(d.principal) + ' @ ' + esc(d.rate) + '% &middot; ' +
        d.months + ' months &middot; EMI ' + fmtINR(d.emi) + '</div></div>' +
        '<div class="row-actions"><button class="vq-btn ghost sm" data-load="' + esc(l.key) + '">Load</button>' +
        '<button class="vq-btn ghost sm danger" data-del="' + esc(l.key) + '">Delete</button></div></div>';
    }).join('');
    compare.innerHTML =
      '<h3>Compare saved loans</h3><div class="vq-table-wrap"><table class="vq-table">' +
      '<thead><tr><th>Loan</th><th>Principal</th><th>Rate</th><th>Tenure</th>' +
      '<th>EMI</th><th>Total interest</th><th>Total payable</th></tr></thead><tbody>' +
      loans.map(function (l) {
        var d = l.data;
        return '<tr><td>' + esc(d.name) + '</td><td>' + fmtINR(d.principal) + '</td>' +
          '<td>' + esc(d.rate) + '%</td><td>' + d.months + ' mo</td>' +
          '<td><strong>' + fmtINR(d.emi) + '</strong></td>' +
          '<td>' + fmtINR(d.totalInterest) + '</td><td>' + fmtINR(d.totalPayable) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    list.querySelectorAll('[data-load]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var d = await Vault.load(SLUG, b.getAttribute('data-load'));
        if (!d) return;
        $('f-name').value = d.name || '';
        $('f-principal').value = d.principal || '';
        $('f-rate').value = d.rate || '';
        if (d.months % 12 === 0 && d.months >= 12) {
          $('f-tenure').value = d.months / 12; $('f-tenure-unit').value = 'years';
        } else { $('f-tenure').value = d.months; $('f-tenure-unit').value = 'months'; }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        doCalculate();
      });
    });
    list.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this saved loan?')) return;
        await Vault.remove(SLUG, b.getAttribute('data-del'));
        await renderSaved();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'emi-loan-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'emi-loan-tracker-bottom', 'leaderboard');

    SEO.faq([
      { q: 'How is EMI calculated in India?',
        a: 'EMI is calculated on a reducing-balance basis: EMI = P \u00D7 r \u00D7 (1+r)^n / ((1+r)^n \u2212 1), where P is the loan amount, r is the monthly interest rate (annual rate \u00F7 12 \u00F7 100) and n is the tenure in months. This tracker uses exactly that formula.' },
      { q: '\u0932\u094b\u0928 EMI \u0915\u0948\u0938\u0947 \u0928\u093f\u0915\u093e\u0932\u0947\u0902? (How to calculate loan EMI?)',
        a: '\u0909\u092a\u0930 \u092b\u093e\u0930\u092e \u092e\u0947\u0902 \u0932\u094b\u0928 \u0930\u093e\u0936\u093f, \u0935\u093e\u0930\u094d\u0937\u093f\u0915 \u092c\u094d\u092f\u093e\u091c \u0926\u0930 \u0914\u0930 \u0905\u0935\u0927\u093f \u0921\u093e\u0932\u0947\u0902 \u2014 \u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f \u092c\u091f\u0928 \u0926\u092c\u093e\u0928\u0947 \u092a\u0930 \u092e\u093e\u0938\u093f\u0915 EMI, \u0915\u0941\u0932 \u092c\u094d\u092f\u093e\u091c \u0914\u0930 \u092a\u0942\u0930\u0940 \u0905\u092e\u094b\u0930\u094d\u091f\u093e\u0907\u091c\u0947\u0936\u0928 \u0936\u0947\u0921\u094d\u092f\u0942\u0932 \u0924\u0941\u0930\u0902\u0924 \u092e\u093f\u0932 \u091c\u093e\u090f\u0917\u093e\u0964' },
      { q: 'Does a prepayment reduce my EMI or my tenure?',
        a: 'Both are possible. This tracker lets you choose: "Reduce tenure" keeps the EMI the same so the loan ends earlier (usually saves more interest); "Reduce EMI" re-computes a lower EMI for the remaining tenure. The impact box shows months saved and interest saved.' },
      { q: 'Is my loan data stored online?',
        a: 'No. Saved loans stay in your own browser (localStorage) under this app\u2019s private namespace. Nothing is uploaded anywhere.' },
      { q: 'Is this financial advice?',
        a: 'No. This is a general-purpose calculator. Actual bank EMIs may differ slightly due to rounding, processing dates and floating rates \u2014 confirm with your lender.' }
    ]);
    SEO.softwareApp({
      name: 'EMI & Loan Tracker — Free EMI Calculator India',
      description: 'Free EMI calculator for Indian home, car and personal loans with full amortization schedule, prepayment impact and loan comparison.',
      keywords: ['EMI calculator', 'home loan EMI calculator India', 'EMI \u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f\u0930', 'loan amortization', 'prepayment calculator']
    });

    $('btn-calc').addEventListener('click', doCalculate);
    $('btn-save').addEventListener('click', saveLoan);
    renderSaved();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
