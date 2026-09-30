/* ============================================================
   VisionQuantech Business Suite — Payslip Generator
   app.js for apps/payslip-generator/

   Pure functions first (no DOM) — tested under node:
   payslipTotals, numberToWordsIndian (Indian numbering),
   amountInWords.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  function sumRows(rows) {
    return (rows || []).reduce(function (t, r) {
      var a = parseFloat(r && r.amount);
      return t + (isFinite(a) && a > 0 ? a : 0);
    }, 0);
  }

  /** {gross, deductions, net} from earnings/deduction row arrays. */
  function payslipTotals(earnings, deductions) {
    var gross = sumRows(earnings);
    var ded = sumRows(deductions);
    return { gross: gross, deductions: ded, net: gross - ded };
  }

  var W1 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
            'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
            'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var W10 = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
             'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    n = Math.round(n);
    if (n < 20) return W1[n];
    var t = Math.floor(n / 10), o = n % 10;
    return W10[t] + (o ? ' ' + W1[o] : '');
  }
  function threeDigits(n) {
    n = Math.round(n);
    var h = Math.floor(n / 100), r = n % 100, s = '';
    if (h) s = W1[h] + ' Hundred';
    if (r) s += (s ? ' ' : '') + twoDigits(r);
    return s;
  }

  /** Number to words in the Indian numbering system. */
  function numberToWordsIndian(n) {
    n = Math.round(Math.abs(+n || 0));
    if (!isFinite(n)) return '';
    if (n === 0) return 'Zero';
    var parts = [];
    var crore = Math.floor(n / 10000000); n %= 10000000;
    var lakh = Math.floor(n / 100000);    n %= 100000;
    var thousand = Math.floor(n / 1000);  n %= 1000;
    if (crore) parts.push(numberToWordsIndian(crore) + ' Crore');
    if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
    if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
    if (n) parts.push(threeDigits(n));
    return parts.join(' ');
  }

  function amountInWords(n) {
    var rupees = Math.round(Math.abs(+n || 0));
    return 'Rupees ' + numberToWordsIndian(rupees) + ' Only';
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
    payslipTotals: payslipTotals, sumRows: sumRows,
    numberToWordsIndian: numberToWordsIndian,
    amountInWords: amountInWords, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.PayslipApp = API;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'payslip-generator';
  var MONTHLY_LIMIT = 10; // payslips per calendar month

  function $(id) { return document.getElementById(id); }

  /** Monthly usage gate (Freemium.check is daily; this enforces the monthly cap). */
  function monthlyGate() {
    var d = new Date();
    var key = 'vqs:use:' + SLUG + ':' + d.getFullYear() + '-' +
              String(d.getMonth() + 1).padStart(2, '0');
    var used = 0;
    try { used = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) {}
    if (used >= MONTHLY_LIMIT) {
      return { allowed: false, used: used, limit: MONTHLY_LIMIT, remaining: 0 };
    }
    try { localStorage.setItem(key, String(used + 1)); } catch (e) {}
    return { allowed: true, used: used + 1, limit: MONTHLY_LIMIT, remaining: MONTHLY_LIMIT - used - 1 };
  }

  function gateAllows() {
    // 10/month cap (plan limit) + Freemium daily check (10/day) as contracted.
    var m = monthlyGate();
    if (!m.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, MONTHLY_LIMIT); return false; }
    var g = Freemium.check(SLUG, MONTHLY_LIMIT);
    if (!g.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, MONTHLY_LIMIT); return false; }
    return true;
  }

  function rowHTML(kind, label, amount) {
    return '<div class="prow" data-kind="' + kind + '">' +
      '<input type="text" class="plabel" value="' + esc(label) + '" placeholder="Label" aria-label="Row label">' +
      '<input type="number" class="pamt" min="0" step="0.01" value="' + esc(amount) + '" placeholder="0" aria-label="Amount">' +
      '<button type="button" class="prow-del" aria-label="Remove row">\u00D7</button></div>';
  }

  function addRow(kind, label, amount) {
    var wrap = $(kind === 'earn' ? 'earn-rows' : 'ded-rows');
    var tmp = document.createElement('div');
    tmp.innerHTML = rowHTML(kind, label || '', amount == null ? '' : amount);
    var el = tmp.firstChild;
    wrap.appendChild(el);
    wireRow(el);
    recalc();
  }

  function wireRow(el) {
    el.querySelector('.pamt').addEventListener('input', recalc);
    el.querySelector('.prow-del').addEventListener('click', function () {
      el.remove(); recalc();
    });
  }

  function readRows(kind) {
    var wrap = $(kind === 'earn' ? 'earn-rows' : 'ded-rows');
    var out = [];
    wrap.querySelectorAll('.prow').forEach(function (el) {
      out.push({
        label: el.querySelector('.plabel').value.trim(),
        amount: parseFloat(el.querySelector('.pamt').value) || 0
      });
    });
    return out;
  }

  function recalc() {
    var t = payslipTotals(readRows('earn'), readRows('ded'));
    $('earn-total').textContent = fmtINR(t.gross);
    $('ded-total').textContent = fmtINR(t.deductions);
    $('net-total').textContent = fmtINR(t.net);
    $('net-words-live').textContent = amountInWords(t.net);
  }

  function collectData() {
    return {
      company: $('p-company').value.trim(),
      companyAddr: $('p-caddr').value.trim(),
      logoText: $('p-logo').value.trim(),
      empName: $('p-ename').value.trim(),
      empId: $('p-eid').value.trim(),
      designation: $('p-desig').value.trim(),
      department: $('p-dept').value.trim(),
      pan: $('p-pan').value.trim().toUpperCase(),
      bank: $('p-bank').value.trim(),
      month: $('p-month').value,
      year: $('p-year').value,
      earnings: readRows('earn'),
      deductions: readRows('ded'),
      totals: payslipTotals(readRows('earn'), readRows('ded'))
    };
  }

  function payslipHTML(d) {
    var t = d.totals;
    var earnRows = d.earnings.filter(function (r) { return r.label || r.amount; })
      .map(function (r) {
        return '<tr><td>' + esc(r.label || '—') + '</td><td class="num">' + fmtINR(r.amount) + '</td></tr>';
      }).join('') || '<tr><td>—</td><td class="num">—</td></tr>';
    var dedRows = d.deductions.filter(function (r) { return r.label || r.amount; })
      .map(function (r) {
        return '<tr><td>' + esc(r.label || '—') + '</td><td class="num">' + fmtINR(r.amount) + '</td></tr>';
      }).join('') || '<tr><td>—</td><td class="num">—</td></tr>';

    var detail = [
      ['Employee name', d.empName], ['Employee ID', d.empId],
      ['Designation', d.designation], ['Department', d.department],
      ['PAN', d.pan], ['Bank / UAN', d.bank],
      ['Pay month', d.month + ' ' + d.year]
    ].map(function (p) {
      return '<div class="pdet"><span>' + p[0] + '</span><strong>' + esc(p[1] || '—') + '</strong></div>';
    }).join('');

    return '<div class="psheet">' +
      '<div class="phead"><div class="plogo">' + esc(d.logoText || (d.company || 'VQ').slice(0, 2).toUpperCase()) + '</div>' +
      '<div><h2>' + esc(d.company || 'Company Name') + '</h2>' +
      '<p>' + esc(d.companyAddr || '') + '</p>' +
      '<p class="psub">Payslip for ' + esc(d.month + ' ' + d.year) + '</p></div></div>' +
      '<div class="pdetails">' + detail + '</div>' +
      '<div class="pcols">' +
      '<div><h3>Earnings</h3><table class="ptab"><tbody>' + earnRows +
      '<tr class="ptotal"><td>Total earnings</td><td class="num">' + fmtINR(t.gross) + '</td></tr></tbody></table></div>' +
      '<div><h3>Deductions</h3><table class="ptab"><tbody>' + dedRows +
      '<tr class="ptotal"><td>Total deductions</td><td class="num">' + fmtINR(t.deductions) + '</td></tr></tbody></table></div>' +
      '</div>' +
      '<div class="pnet"><span>Net pay</span><strong>' + fmtINR(t.net) + '</strong></div>' +
      '<p class="pwords">' + esc(amountInWords(t.net)) + '</p>' +
      '<div class="psign"><div>Employee signature</div><div>Authorised signatory</div></div>' +
      '<p class="pfoot">This is a computer-generated payslip. Verify figures with your HR/payroll records.</p>' +
      '</div>';
  }

  function doGenerate() {
    if (!gateAllows()) { $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
    var d = collectData();
    if (!d.empName) { alert('Please enter the employee name.'); return; }
    $('payslip-doc').innerHTML = payslipHTML(d);
    $('p-actions').style.display = 'flex';
    $('payslip-doc').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.__lastPayslip = d;
  }

  async function savePayslip() {
    var d = window.__lastPayslip;
    if (!d) { alert('Generate the payslip first.'); return; }
    var key = (d.empId || 'emp').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() +
              '-' + d.year + '-' + String(d.month).replace(/\s+/g, '').slice(0, 3).toLowerCase();
    try {
      await Vault.save(SLUG, key, Object.assign({ savedAt: new Date().toISOString() }, d));
      await renderSaved();
      alert('Payslip saved.');
    } catch (e) { alert('Could not save: ' + e.message); }
  }

  async function renderSaved() {
    var list = $('saved-list');
    var entries;
    try { entries = await Vault.list(SLUG); }
    catch (e) { list.innerHTML = '<p class="vq-hint">Storage unavailable.</p>'; return; }
    if (!entries.length) {
      list.innerHTML = '<p class="vq-hint">No saved payslips yet.</p>';
      return;
    }
    var items = [];
    for (var i = 0; i < entries.length; i++) {
      try {
        var d = await Vault.load(SLUG, entries[i].key);
        if (d && d.empName) items.push({ key: entries[i].key, d: d });
      } catch (e) {}
    }
    list.innerHTML = items.length ? items.map(function (it) {
      return '<div class="saved-row"><div><strong>' + esc(it.d.empName) + '</strong>' +
        '<div class="vq-hint">' + esc(it.d.month + ' ' + it.d.year) + ' &middot; Net ' +
        fmtINR(it.d.totals.net) + '</div></div>' +
        '<div class="row-actions"><button class="vq-btn ghost sm" data-view="' + esc(it.key) + '">View/Print</button>' +
        '<button class="vq-btn ghost sm danger" data-del="' + esc(it.key) + '">Delete</button></div></div>';
    }).join('') : '<p class="vq-hint">No saved payslips yet.</p>';

    list.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var d = await Vault.load(SLUG, b.getAttribute('data-view'));
        if (!d) return;
        $('payslip-doc').innerHTML = payslipHTML(d);
        $('p-actions').style.display = 'flex';
        window.__lastPayslip = d;
        $('payslip-doc').scrollIntoView({ behavior: 'smooth' });
      });
    });
    list.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this saved payslip?')) return;
        await Vault.remove(SLUG, b.getAttribute('data-del'));
        await renderSaved();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'payslip-generator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'payslip-generator-bottom', 'leaderboard');

    SEO.faq([
      { q: '\u092a\u0947\u0938\u094d\u0932\u093f\u092a \u0915\u0948\u0938\u0947 \u092c\u0928\u093e\u090f\u0902? (How to make a payslip?)',
        a: '\u0915\u0902\u092a\u0928\u0940 \u0914\u0930 \u0915\u0930\u094d\u092e\u091a\u093e\u0930\u0940 \u0915\u093e \u0935\u093f\u0935\u0930\u0923, \u092e\u093e\u0939 \u0914\u0930 \u0935\u0930\u094d\u0937 \u091a\u0941\u0928\u0947\u0902, \u0906\u092e\u0926\u0928\u0940 (\u090f\u0930\u094d\u0928\u093f\u0902\u0917\u094d\u0938) \u0914\u0930 \u0915\u091f\u094c\u0924\u0940 (\u0921\u093f\u0921\u0915\u094d\u0936\u0928) \u0915\u0940 \u092a\u0902\u0915\u094d\u0924\u093f\u092f\u093e\u0902 \u091c\u094b\u0921\u093c\u0947\u0902 \u2014 \u0915\u0941\u0932 \u092f\u094b\u0917, \u0928\u0947\u091f \u092a\u0947 \u0914\u0930 \u0936\u092c\u094d\u0926\u094b\u0902 \u092e\u0947\u0902 \u0930\u093e\u0936\u093f \u0905\u092a\u0928\u0947 \u0906\u092a \u092c\u0928 \u091c\u093e\u090f\u0917\u0940\u0964 \u092b\u093f\u0930 \u092a\u094d\u0930\u093f\u0902\u091f \u092c\u091f\u0928 \u0926\u092c\u093e\u0915\u0930 A4 \u092a\u0947\u0938\u094d\u0932\u093f\u092a \u0928\u093f\u0915\u093e\u0932\u0947\u0902\u0964' },
      { q: 'How do I create a payslip online for free in India?',
        a: 'Enter company and employee details, add earning rows (basic, HRA, allowances) and deduction rows (PF, ESI, TDS, professional tax). Totals, net pay and the amount in words are calculated automatically, and you can print a clean A4 payslip.' },
      { q: 'What should a salary slip contain?',
        a: 'Company name, employee name/ID/designation/PAN, pay month, a breakup of earnings and deductions, gross pay, total deductions, net pay and the net amount in words.' },
      { q: 'Is my payroll data uploaded anywhere?',
        a: 'No. Payslips are stored only in your browser (localStorage) under this app\u2019s private namespace.' },
      { q: 'How many free payslips do I get?',
        a: '10 payslips per calendar month on the free plan. Saved payslips can be re-viewed and re-printed any time without using the quota.' }
    ]);
    SEO.softwareApp({
      name: 'Payslip Generator India — Free Salary Slip Maker',
      description: 'Free online payslip generator for Indian SMEs: earnings/deductions, auto totals, amount in words, printable A4 salary slip.',
      keywords: ['payslip generator', 'salary slip format India', '\u092a\u0947\u0938\u094d\u0932\u093f\u092a \u0915\u0948\u0938\u0947 \u092c\u0928\u093e\u090f\u0902', 'pay slip maker', 'salary slip download']
    });

    // default rows
    [['Basic salary', 30000], ['HRA', 12000], ['Conveyance allowance', 1600], ['Special allowance', 6400]]
      .forEach(function (r) { addRow('earn', r[0], r[1]); });
    [['Provident fund', 3600], ['Professional tax', 200]]
      .forEach(function (r) { addRow('ded', r[0], r[1]); });

    $('add-earn').addEventListener('click', function () { addRow('earn', '', ''); });
    $('add-ded').addEventListener('click', function () { addRow('ded', '', ''); });
    $('p-generate').addEventListener('click', doGenerate);
    $('p-print').addEventListener('click', function () { window.print(); });
    $('p-save').addEventListener('click', savePayslip);
    $('p-actions').style.display = 'none';
    renderSaved();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
