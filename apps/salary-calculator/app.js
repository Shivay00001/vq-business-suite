/* ============================================================
   VisionQuantech Business Suite — Salary Calculator (India)
   app.js for apps/salary-calculator/

   STATUTORY BASELINES (web-verified for FY 2025-26, Sep 2026):
   - Income tax slabs: New regime 0/5/10/15/20/25/30% on
     0-4L/4-8L/8-12L/12-16L/16-20L/20-24L/>24L; Old regime
     0%/2.5L, 5%/2.5-5L, 20%/5-10L, 30%/>10L. 87A rebate: new
     regime nil tax up to 12L taxable (max 60,000); old regime nil
     tax up to 5L (max 12,500). Std deduction: 75,000 (new),
     50,000 (old). 4% health & education cess.
     Sources: Economic Times Budget 2026 live slab tables,
     taxconcept.net, manthanexperts.com.
   - EPF: 12% employee + 12% employer on Basic+DA, wage ceiling
     25,000/month (max 3,000/mo each), w.e.f. 17-09-2026, S.O. 5109(E).
     Employer split 8.33% EPS + 3.67% EPF.
     Sources: financialexpress.com, ksandk.com, indiaherald.com.
   - ESI: 0.75% employee + 3.25% employer on gross, wage ceiling
     21,000/month (25,000 for disabled). Sources: thepeoplesboard.com,
     kredily.com.
   - Professional tax: state tables (monthly): Maharashtra
     0 to 7,500; 175 for 7,501-10,000 (women exempt to 10,000);
     200 above 10,000 (300 in Feb). Karnataka 0 to 15,000; 200 above.
     West Bengal 90/110/130/150/200 across 8,501-10K/10-15K/15-25K/
     25-40K/>40K. Tamil Nadu monthly equivalents of half-yearly
     slabs: 0 to 21,000; 23 / 53 / 115 / 171 / 208 above.
     Gujarat 80/150/200 for 6-9K/9-12K/12K+. AP & Telangana
     0 to 15K; 150 for 15-20K; 200 above. Kerala monthly
     equivalents: 0 to 12K; 20/30/50/75/100/125/167/208 above.
     Delhi & most northern states: none.
     Sources: github.com/eurth/claude-for-ca PT skill (FY 2025-26),
     factohr.com, vakilsearch.com, hrcalcy.in.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- statutory constants ---------------- */
  var PF_RATE = 0.12;
  var PF_CEILING_ANNUAL = 25000 * 12;          // Rs 25,000/month wage ceiling (w.e.f. 17-09-2026, S.O. 5109(E))
  var ESI_EMP = 0.0075, ESI_EMPR = 0.0325;
  var ESI_LIMIT_MONTHLY = 21000;
  var STD_DED_NEW = 75000, STD_DED_OLD = 50000;
  var REBATE_NEW_LIMIT = 1200000, REBATE_OLD_LIMIT = 500000;
  var CESS = 0.04;

  var NEW_SLABS = [
    [400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15],
    [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]
  ];
  var OLD_SLABS = [
    [250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30]
  ];

  /* ---------------- pure computations ---------------- */

  function slabTax(taxable, slabs) {
    var t = 0, prev = 0;
    for (var i = 0; i < slabs.length; i++) {
      var cap = slabs[i][0], rate = slabs[i][1];
      if (taxable > prev) t += (Math.min(taxable, cap) - prev) * rate;
      if (taxable <= cap) break;
      prev = cap;
    }
    return t;
  }

  function surchargeNew(t) {
    return t > 20000000 ? 0.25 : t > 10000000 ? 0.15 : t > 5000000 ? 0.10 : 0;
  }
  function surchargeOld(t) {
    return t > 50000000 ? 0.37 : t > 20000000 ? 0.25 : t > 10000000 ? 0.15 :
           t > 5000000 ? 0.10 : 0;
  }

  /** New-regime tax for FY 2025-26 incl. 87A rebate + marginal relief. */
  function incomeTaxNew(taxable) {
    taxable = Math.max(0, +taxable || 0);
    var tax = slabTax(taxable, NEW_SLABS);
    var rebate = 0;
    if (taxable <= REBATE_NEW_LIMIT) { rebate = tax; tax = 0; }
    else {
      // marginal relief: liability capped at income over Rs 12L
      var excess = taxable - REBATE_NEW_LIMIT;
      if (tax > excess) tax = excess;
    }
    var sur = tax * surchargeNew(taxable);
    var cess = (tax + sur) * CESS;
    return { slabTax: tax, rebate: rebate, surcharge: sur, cess: cess,
             total: tax + sur + cess, regime: 'new' };
  }

  /** Old-regime tax for FY 2025-26 incl. 87A rebate. */
  function incomeTaxOld(taxable) {
    taxable = Math.max(0, +taxable || 0);
    var tax = slabTax(taxable, OLD_SLABS);
    var rebate = 0;
    if (taxable <= REBATE_OLD_LIMIT) { rebate = tax; tax = 0; }
    var sur = tax * surchargeOld(taxable);
    var cess = (tax + sur) * CESS;
    return { slabTax: tax, rebate: rebate, surcharge: sur, cess: cess,
             total: tax + sur + cess, regime: 'old' };
  }

  /** Employee PF: 12% of Basic(+DA), capped at Rs 25,000/month wage ceiling (w.e.f. 17-09-2026). */
  function pfEmployee(basicAnnual) {
    return Math.min(Math.max(0, +basicAnnual || 0), PF_CEILING_ANNUAL) * PF_RATE;
  }
  /** Employer PF (shown for info; split 8.33% EPS + 3.67% EPF). */
  function pfEmployer(basicAnnual) { return pfEmployee(basicAnnual); }

  function esiEligible(grossMonthly) {
    return grossMonthly > 0 && grossMonthly <= ESI_LIMIT_MONTHLY;
  }
  function esiEmployee(grossAnnual) {
    return esiEligible(grossAnnual / 12) ? grossAnnual * ESI_EMP : 0;
  }
  function esiEmployer(grossAnnual) {
    return esiEligible(grossAnnual / 12) ? grossAnnual * ESI_EMPR : 0;
  }

  /* Monthly professional-tax tables, verified for FY 2025-26. */
  var PT = {
    none: function () { return 0; },
    maharashtra: function (m) {
      if (m <= 7500) return 0;
      if (m <= 10000) return 175; // women exempt up to 10,000; 175 shown for men
      return 200;                  // Rs 300 in February (year total 2,500)
    },
    karnataka: function (m) { return m >= 15001 ? 200 : 0; },
    'west-bengal': function (m) {
      if (m <= 8500) return 0;
      if (m <= 10000) return 90;
      if (m <= 15000) return 110;
      if (m <= 25000) return 130;
      if (m <= 40000) return 150;
      return 200;
    },
    'tamil-nadu': function (m) { // monthly equivalents of half-yearly slabs
      if (m <= 21000) return 0;
      if (m <= 30000) return 23;
      if (m <= 45000) return 53;
      if (m <= 60000) return 115;
      if (m <= 75000) return 171;
      return 208;
    },
    gujarat: function (m) {
      if (m < 6000) return 0;
      if (m < 9000) return 80;
      if (m < 12000) return 150;
      return 200;
    },
    'andhra-pradesh': function (m) {
      if (m <= 15000) return 0;
      if (m <= 20000) return 150;
      return 200;
    },
    telangana: function (m) {
      if (m <= 15000) return 0;
      if (m <= 20000) return 150;
      return 200;
    },
    kerala: function (m) { // monthly equivalents of half-yearly slabs
      if (m < 12000) return 0;
      if (m < 18000) return 20;
      if (m < 30000) return 30;
      if (m < 45000) return 50;
      if (m < 60000) return 75;
      if (m < 75000) return 100;
      if (m < 100000) return 125;
      if (m < 125000) return 167;
      return 208;
    }
  };
  function professionalTax(state, monthlyGross) {
    var f = PT[state] || PT.none;
    return f(Math.max(0, +monthlyGross || 0));
  }

  /**
   * HRA exemption u/s 10(13A): least of (a) HRA received,
   * (b) rent paid minus 10% of (Basic+DA), (c) 50%/40% of (Basic+DA).
   */
  function hraExemption(hraReceived, rentPaidAnnual, basicAnnual, metro) {
    var a = Math.max(0, +hraReceived || 0);
    var b = Math.max(0, (+rentPaidAnnual || 0) - 0.10 * Math.max(0, +basicAnnual || 0));
    var c = (metro ? 0.50 : 0.40) * Math.max(0, +basicAnnual || 0);
    return Math.min(a, b, c);
  }

  /**
   * Full salary breakup from annual CTC.
   * inp: {ctc, state, basicPct, hraPct, daPct, metro, rentMonthly, other80C, d80}
   */
  function salaryBreakup(inp) {
    inp = inp || {};
    var ctc = Math.max(0, +inp.ctc || 0);
    var basic = ctc * (+inp.basicPct > 0 ? +inp.basicPct : 40) / 100;
    var hra = basic * (+inp.hraPct > 0 ? +inp.hraPct : 40) / 100;
    var da = ctc * (Math.max(0, +inp.daPct || 0)) / 100;

    var empPF = pfEmployee(basic);
    var employerPF = pfEmployer(basic);
    var gratuity = (basic + da) / 26 * 15; // annual, employer cost inside CTC

    // Solve gross from: CTC = gross + employerPF + employerESI + gratuity,
    // employerESI = 3.25% of gross when eligible.
    var base = Math.max(0, ctc - employerPF - gratuity);
    var gross = base, employerESI = 0, eligible = esiEligible(base / 12);
    if (eligible) {
      gross = base / (1 + ESI_EMPR);
      employerESI = gross * ESI_EMPR;
      if (!esiEligible(gross / 12)) { gross = base; employerESI = 0; eligible = false; }
    }
    var special = Math.max(0, gross - basic - hra - da);
    var empESI = eligible ? gross * ESI_EMP : 0;

    var ptMonthly = professionalTax(inp.state, gross / 12);
    var ptAnnual = ptMonthly * 12;

    // --- old regime ---
    var c80 = Math.min(150000, empPF + Math.max(0, +inp.other80C || 0));
    var d80 = Math.max(0, +inp.d80 || 0);
    var hraEx = hraExemption(hra, (+inp.rentMonthly || 0) * 12, basic, !!inp.metro);
    var taxableOld = Math.max(0, gross - STD_DED_OLD - c80 - d80 - hraEx - ptAnnual);
    var taxOld = incomeTaxOld(taxableOld);

    // --- new regime ---
    var taxableNew = Math.max(0, gross - STD_DED_NEW);
    var taxNew = incomeTaxNew(taxableNew);

    var inHandNew = (gross - empPF - empESI - ptAnnual - taxNew.total) / 12;
    var inHandOld = (gross - empPF - empESI - ptAnnual - taxOld.total) / 12;

    return {
      ctc: ctc, basic: basic, hra: hra, da: da, special: special,
      employerPF: employerPF, employerESI: employerESI, gratuity: gratuity,
      gross: gross, empPF: empPF, empESI: empESI, esiEligible: eligible,
      ptMonthly: ptMonthly, ptAnnual: ptAnnual,
      oldRegime: { c80: c80, d80: d80, hraExemption: hraEx,
                   taxable: taxableOld, tax: taxOld, inHand: inHandOld },
      newRegime: { taxable: taxableNew, tax: taxNew, inHand: inHandNew },
      better: taxNew.total <= taxOld.total ? 'new' : 'old'
    };
  }

  function fmtINR(n) {
    var v = Math.round(+n || 0);
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    incomeTaxNew: incomeTaxNew, incomeTaxOld: incomeTaxOld,
    slabTax: slabTax, pfEmployee: pfEmployee, pfEmployer: pfEmployer,
    esiEmployee: esiEmployee, esiEmployer: esiEmployer,
    esiEligible: esiEligible, professionalTax: professionalTax,
    hraExemption: hraExemption, salaryBreakup: salaryBreakup,
    fmtINR: fmtINR, esc: esc,
    CONST: { PF_RATE: PF_RATE, PF_CEILING_ANNUAL: PF_CEILING_ANNUAL,
             ESI_EMP: ESI_EMP, ESI_EMPR: ESI_EMPR, ESI_LIMIT_MONTHLY: ESI_LIMIT_MONTHLY,
             STD_DED_NEW: STD_DED_NEW, STD_DED_OLD: STD_DED_OLD, CESS: CESS }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.SalaryApp = API;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'salary-calculator';
  var FREE_LIMIT = 20; // calculations per day

  function $(id) { return document.getElementById(id); }

  function readInputs() {
    return {
      ctc: parseFloat($('s-ctc').value) || 0,
      state: $('s-state').value,
      basicPct: parseFloat($('s-basic').value),
      hraPct: parseFloat($('s-hra').value),
      daPct: parseFloat($('s-da').value),
      metro: $('s-metro').checked,
      rentMonthly: parseFloat($('s-rent').value) || 0,
      other80C: parseFloat($('s-80c').value) || 0,
      d80: parseFloat($('s-80d').value) || 0
    };
  }

  function row(label, val, cls) {
    return '<tr><td>' + label + '</td><td class="' + (cls || '') + '">' + fmtINR(val) + '</td></tr>';
  }

  function render(b) {
    var box = $('s-results');
    if (!(b.ctc > 0)) {
      box.innerHTML = '<div class="vq-notice">Enter your annual CTC to see the breakup.</div>';
      return;
    }
    var n = b.newRegime, o = b.oldRegime;
    var esiNote = b.esiEligible
      ? 'ESI applies (gross \u2264 \u20B921,000/month).'
      : 'No ESI (gross above \u20B921,000/month ceiling).';
    box.innerHTML =
      '<div class="vq-result"><h3>Monthly in-hand salary</h3>' +
      '<div class="stat-grid">' +
      '<div><span>New regime (FY 2025-26)</span><strong class="big">' + fmtINR(n.inHand) + '</strong>' +
        '<div class="vq-hint">Tax: ' + fmtINR(n.tax.total) + '/yr</div></div>' +
      '<div><span>Old regime (FY 2025-26)</span><strong class="big">' + fmtINR(o.inHand) + '</strong>' +
        '<div class="vq-hint">Tax: ' + fmtINR(o.tax.total) + '/yr</div></div>' +
      '</div>' +
      '<p class="vq-hint">Better for you: <strong>' + (b.better === 'new' ? 'New regime' : 'Old regime') +
      '</strong> (lower total tax). Tax is an estimate, not filing advice.</p></div>' +

      '<h3>Salary breakup (annual)</h3>' +
      '<div class="vq-table-wrap"><table class="vq-table"><thead><tr><th>Component</th><th>Amount</th></tr></thead><tbody>' +
      row('Basic salary', b.basic) +
      row('HRA', b.hra) +
      row('Dearness allowance (DA)', b.da) +
      row('Special allowance (balancing figure)', b.special) +
      row('<strong>Gross salary</strong>', b.gross, 'hl') +
      row('Employer PF (12%, info — inside CTC)', b.employerPF, 'dim') +
      row('Employer ESI (3.25%, info — inside CTC)', b.employerESI, 'dim') +
      row('Gratuity accrual (info — inside CTC)', b.gratuity, 'dim') +
      row('<strong>CTC check</strong> (gross + employer PF + ESI + gratuity)', b.gross + b.employerPF + b.employerESI + b.gratuity, 'dim') +
      '</tbody></table></div>' +

      '<h3>Deductions (annual)</h3>' +
      '<div class="vq-table-wrap"><table class="vq-table"><thead><tr><th>Deduction</th><th>Amount</th></tr></thead><tbody>' +
      row('Employee PF @12% of Basic (cap \u20B925,000/mo)', b.empPF) +
      row('Employee ESI @0.75%', b.empESI) +
      row('Professional tax (' + esc(stateLabel($('s-state').value)) + ')', b.ptAnnual) +
      row('Income tax (TDS) — new regime', n.tax.total) +
      row('Income tax (TDS) — old regime', o.tax.total) +
      '</tbody></table></div>' +
      '<p class="vq-hint">' + esiNote + ' PT shown at normal monthly rate; Maharashtra deducts \u20B9300 in February (annual total \u20B92,500).</p>' +

      '<h3>Tax working — new vs old regime</h3>' +
      '<div class="vq-table-wrap"><table class="vq-table"><thead><tr><th></th><th>New regime</th><th>Old regime</th></tr></thead><tbody>' +
      '<tr><td>Gross salary</td><td>' + fmtINR(b.gross) + '</td><td>' + fmtINR(b.gross) + '</td></tr>' +
      '<tr><td>Standard deduction</td><td>' + fmtINR(STD_DED_NEW) + '</td><td>' + fmtINR(STD_DED_OLD) + '</td></tr>' +
      '<tr><td>80C (PF + your extras, max 1.5L)</td><td class="dim">not allowed</td><td>' + fmtINR(o.c80) + '</td></tr>' +
      '<tr><td>80D (health insurance)</td><td class="dim">not allowed</td><td>' + fmtINR(o.d80) + '</td></tr>' +
      '<tr><td>HRA exemption</td><td class="dim">not allowed</td><td>' + fmtINR(o.hraExemption) + '</td></tr>' +
      '<tr><td>Professional tax (16(iii))</td><td class="dim">not allowed</td><td>' + fmtINR(b.ptAnnual) + '</td></tr>' +
      '<tr><td><strong>Taxable income</strong></td><td class="hl">' + fmtINR(n.taxable) + '</td><td class="hl">' + fmtINR(o.taxable) + '</td></tr>' +
      '<tr><td>Slab tax</td><td>' + fmtINR(n.tax.slabTax) + '</td><td>' + fmtINR(o.tax.slabTax) + '</td></tr>' +
      '<tr><td>87A rebate</td><td>' + fmtINR(n.tax.rebate) + '</td><td>' + fmtINR(o.tax.rebate) + '</td></tr>' +
      '<tr><td>Surcharge</td><td>' + fmtINR(n.tax.surcharge) + '</td><td>' + fmtINR(o.tax.surcharge) + '</td></tr>' +
      '<tr><td>4% health &amp; education cess</td><td>' + fmtINR(n.tax.cess) + '</td><td>' + fmtINR(o.tax.cess) + '</td></tr>' +
      '<tr><td><strong>Total tax</strong></td><td class="hl"><strong>' + fmtINR(n.tax.total) + '</strong></td>' +
        '<td class="hl"><strong>' + fmtINR(o.tax.total) + '</strong></td></tr>' +
      '</tbody></table></div>';

    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stateLabel(v) {
    var el = $('s-state');
    for (var i = 0; i < el.options.length; i++) {
      if (el.options[i].value === v) return el.options[i].text;
    }
    return v;
  }

  function doCalculate() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT);
      $('s-gate').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    render(salaryBreakup(readInputs()));
  }

  function init() {
    Ads.render($('ad-top'), 'salary-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'salary-calculator-bottom', 'leaderboard');

    SEO.faq([
      { q: 'How is in-hand salary calculated from CTC in India?',
        a: 'Gross salary = CTC minus employer PF (12% of Basic up to Rs 25,000/month, w.e.f. 17-09-2026), employer ESI (3.25% if gross is within Rs 21,000/month) and gratuity accrual. In-hand = gross minus employee PF (12%), employee ESI (0.75%), professional tax and income-tax TDS.' },
      { q: '\u0938\u0948\u0932\u0930\u0940 \u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f\u0930 \u0915\u0948\u0938\u0947 \u0915\u093e\u092e \u0915\u0930\u0924\u093e \u0939\u0948? (How does the salary calculator work?)',
        a: '\u0905\u092a\u0928\u093e \u0938\u093e\u0932\u093e\u0928\u093e CTC, \u0930\u093e\u091c\u094d\u092f \u0914\u0930 \u0915\u093f\u0930\u093e\u092f\u093e \u0921\u093e\u0932\u0947\u0902 \u2014 \u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f\u0930 PF, ESI, \u092a\u094d\u0930\u094b\u092b\u0947\u0936\u0928\u0932 \u091f\u0948\u0915\u094d\u0938 \u0914\u0930 \u0907\u0928\u0915\u092e \u091f\u0948\u0915\u094d\u0938 (\u0928\u090f \u0914\u0930 \u092a\u0941\u0930\u093e\u0928\u0947 \u0926\u094b\u0928\u094b\u0902 \u0930\u0940\u091c\u0940\u092e \u092e\u0947\u0902) \u0918\u091f\u093e\u0915\u0930 \u092e\u093e\u0938\u093f\u0915 \u0907\u0928-\u0939\u0948\u0902\u0921 \u0938\u0948\u0932\u0930\u0940 \u092c\u0924\u093e\u0924\u093e \u0939\u0948\u0964' },
      { q: 'What is the PF deduction on salary in 2026?',
        a: '12% of Basic + DA from the employee, matched by 12% from the employer, on wages up to Rs 25,000/month (Rs 3,000/month each), w.e.f. 17-09-2026, S.O. 5109(E). The employer share splits into 8.33% pension (EPS) and 3.67% PF.' },
      { q: 'What is the ESI deduction rate?',
        a: '0.75% of gross salary from the employee and 3.25% from the employer, applicable when gross monthly wages are Rs 21,000 or less (Rs 25,000 for persons with disabilities).' },
      { q: 'Which tax regime is better for salaried employees in FY 2025-26?',
        a: 'It depends on your deductions. The new regime has lower slab rates, a Rs 75,000 standard deduction and zero tax up to Rs 12 lakh taxable income; the old regime allows 80C, 80D, HRA and other deductions with a Rs 50,000 standard deduction. This calculator shows both side by side.' },
      { q: 'Is this tax calculation official advice?',
        a: 'No. Figures use FY 2025-26 statutory rates for estimation only. Verify with a chartered accountant before filing.' }
    ]);
    SEO.softwareApp({
      name: 'Salary Calculator India — CTC to In-Hand Salary',
      description: 'Free Indian salary calculator: CTC breakup with PF, ESI, professional tax and income tax under both new and old regimes (FY 2025-26).',
      keywords: ['salary calculator India', 'CTC to in-hand salary', 'in-hand salary calculator', '\u0938\u0948\u0932\u0930\u0940 \u0915\u0948\u0932\u0915\u0941\u0932\u0947\u091f\u0930', 'take home salary', 'PF ESI calculation']
    });

    $('s-calc').addEventListener('click', doCalculate);
    ['s-ctc','s-basic','s-hra','s-da','s-rent','s-80c','s-80d'].forEach(function (id) {
      $(id).addEventListener('input', function () { /* live later on demand */ });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
