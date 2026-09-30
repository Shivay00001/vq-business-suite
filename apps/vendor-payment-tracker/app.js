/* ============================================================
   VisionQuantech Business Suite — Vendor Payment Tracker
   apps/vendor-payment-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   Payables ledger with MSMED Act delayed-payment rules:
   - Sec 15: buyer must pay within the agreed credit period,
     capped at 45 days from acceptance for MSME suppliers.
   - Sec 16: delay attracts compound interest with MONTHLY
     RESTS at THREE TIMES the RBI bank rate.
   RBI bank rate verified Sep 2026: 5.50%  =>  interest 16.50%
   p.a. (repo 5.25%, MSF/bank rate 5.50%). The rate is baked in
   as RBI_BANK_RATE and shown on-screen so a future rate change
   is visible; confirm with your CA before filing a claim.
   Interest model: monthly compounding for each completed
   30-day block beyond the due date, simple interest on
   (principal + accrued) for leftover days — an estimate, not a
   legal computation. Disputes go to the MSE Facilitation
   Council via the MSME Samadhaan portal.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var RBI_BANK_RATE = 5.50;            // % p.a., verified Sep 2026 (MSF = bank rate)
  var MSME_INTEREST_RATE = RBI_BANK_RATE * 3; // 16.50 % p.a., MSMED Act Sec 16
  var MSME_MAX_DAYS = 45;             // Sec 15: agreed period cannot exceed 45 days
  var MAX_INVOICES = 25;

  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }
  function toUTC(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function addDays(dateStr, n) {
    var d = new Date(toUTC(dateStr) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function validateInvoice(inv) {
    if (!inv || typeof inv !== 'object') return { ok: false, error: 'Invoice data is required.' };
    if (!String(inv.vendor || '').trim()) return { ok: false, error: 'Vendor name is required.' };
    if (String(inv.vendor).length > 120) return { ok: false, error: 'Vendor name too long (max 120).' };
    if (!String(inv.invoiceNo || '').trim()) return { ok: false, error: 'Invoice number is required.' };
    if (String(inv.invoiceNo).length > 60) return { ok: false, error: 'Invoice number too long (max 60).' };
    if (!isDateStr(inv.invoiceDate)) return { ok: false, error: 'Invoice date must be YYYY-MM-DD.' };
    var amt = Number(inv.amount);
    if (!isFinite(amt) || amt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (amt > 1e10) return { ok: false, error: 'Amount looks too large.' };
    var cd = Number(inv.creditDays);
    if (!isFinite(cd) || Math.floor(cd) !== cd || cd < 0 || cd > 180)
      return { ok: false, error: 'Agreed credit days must be 0–180.' };
    if (inv.paidDate && !isDateStr(inv.paidDate)) return { ok: false, error: 'Paid date must be YYYY-MM-DD.' };
    if (inv.paidDate && daysBetween(inv.invoiceDate, inv.paidDate) < 0)
      return { ok: false, error: 'Paid date cannot be before the invoice date.' };
    return { ok: true };
  }

  /** Effective credit days: MSME suppliers are capped at 45 (Sec 15). */
  function effectiveCreditDays(inv) {
    var cd = Math.floor(Number(inv.creditDays)) || 0;
    return inv.msme ? Math.min(cd, MSME_MAX_DAYS) : cd;
  }

  function dueDateOf(inv) {
    return addDays(inv.invoiceDate, effectiveCreditDays(inv));
  }

  /**
   * Status of an invoice on `today` (YYYY-MM-DD):
   * paid | ok | due-soon (<=7d) | overdue | msme-risk (MSME & >45d overdue)
   */
  function statusOf(inv, today) {
    var v = validateInvoice(inv);
    if (!v.ok) return v;
    var t = isDateStr(today) ? today : new Date().toISOString().slice(0, 10);
    if (inv.paidDate) return { ok: true, status: 'paid', dueDate: dueDateOf(inv), daysOverdue: 0, interest: 0 };
    var due = dueDateOf(inv);
    var over = daysBetween(due, t);
    var interest = 0, st;
    if (over <= 0) st = (over >= -7) ? 'due-soon' : 'ok';
    else {
      st = 'overdue';
      if (inv.msme) {
        interest = msmeInterest(Number(inv.amount), over).value;
        if (over > MSME_MAX_DAYS) st = 'msme-risk';
      }
    }
    return { ok: true, status: st, dueDate: due, daysOverdue: Math.max(0, over), interest: interest, effectiveCredit: effectiveCreditDays(inv) };
  }

  /**
   * MSMED Sec 16 interest estimate: compound with monthly rests at
   * MSME_INTEREST_RATE p.a. Monthly compounding for each completed
   * 30-day block; simple interest on (principal + accrued) for
   * leftover days. Returns {value} rounded to 2 dp.
   */
  function msmeInterest(principal, daysOverdue) {
    var p = Number(principal), d = Math.floor(Number(daysOverdue));
    if (!isFinite(p) || p <= 0 || !isFinite(d) || d <= 0) return { ok: true, value: 0 };
    var r = MSME_INTEREST_RATE / 100;
    var months = Math.floor(d / 30), rem = d % 30;
    var accrued = p * Math.pow(1 + r / 12, months);
    var total = accrued + accrued * r * (rem / 365);
    return { ok: true, value: Math.round((total - p) * 100) / 100, months: months, remDays: rem, rate: MSME_INTEREST_RATE };
  }

  function ledgerSummary(invoices, today) {
    var t = isDateStr(today) ? today : new Date().toISOString().slice(0, 10);
    var s = { outstanding: 0, overdue: 0, overdueCount: 0, msmeRiskCount: 0, interestExposure: 0, paid: 0 };
    (invoices || []).forEach(function (inv) {
      var st = statusOf(inv, t);
      if (!st.ok) return;
      if (st.status === 'paid') { s.paid += Number(inv.amount); return; }
      s.outstanding += Number(inv.amount);
      if (st.status === 'overdue' || st.status === 'msme-risk') {
        s.overdue += Number(inv.amount); s.overdueCount++;
        s.interestExposure += st.interest;
      }
      if (st.status === 'msme-risk') s.msmeRiskCount++;
    });
    Object.keys(s).forEach(function (k) { s[k] = Math.round(s[k] * 100) / 100; });
    return { ok: true, value: s };
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
    RBI_BANK_RATE: RBI_BANK_RATE, MSME_INTEREST_RATE: MSME_INTEREST_RATE,
    MSME_MAX_DAYS: MSME_MAX_DAYS, MAX_INVOICES: MAX_INVOICES,
    isDateStr: isDateStr, daysBetween: daysBetween, addDays: addDays,
    validateInvoice: validateInvoice, effectiveCreditDays: effectiveCreditDays,
    dueDateOf: dueDateOf, statusOf: statusOf,
    msmeInterest: msmeInterest, ledgerSummary: ledgerSummary,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-payment-tracker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('t-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  async function loadLedger() {
    try { return (await Vault.load(SLUG, 'ledger')) || []; } catch (e) { return []; }
  }
  async function saveLedger(ledger) {
    await Vault.save(SLUG, 'ledger', ledger.slice(0, MAX_INVOICES));
  }

  function badge(st) {
    var map = {
      'paid': '<span class="a-badge a-ok">Paid</span>',
      'ok': '<span class="a-badge a-ok">On track</span>',
      'due-soon': '<span class="a-badge a-wait">Due soon</span>',
      'overdue': '<span class="a-badge a-bad">Overdue</span>',
      'msme-risk': '<span class="a-badge a-bad">MSME 45-day breach</span>'
    };
    return map[st.status] || '';
  }

  async function renderLedger() {
    var ledger = await loadLedger();
    var t = todayStr();
    ledger.sort(function (a, b) { return a.invoiceDate < b.invoiceDate ? -1 : 1; });
    var summ = ledgerSummary(ledger, t).value;

    var rows = ledger.map(function (inv) {
      var st = statusOf(inv, t);
      var cells = '<td><strong>' + esc(inv.vendor) + '</strong><br><span class="vq-hint">' + esc(inv.invoiceNo) + (inv.msme ? ' · MSME' : '') + '</span></td>' +
        '<td>' + esc(inv.invoiceDate) + '</td><td class="num">' + fmtINR(inv.amount) + '</td>' +
        '<td>' + (st.ok ? esc(st.dueDate) + '<br><span class="vq-hint">' + (st.status === 'paid' ? 'paid ' + esc(inv.paidDate) : st.daysOverdue > 0 ? st.daysOverdue + 'd overdue' : 'credit ' + st.effectiveCredit + 'd') + '</span>' : esc(st.error)) + '</td>' +
        '<td class="num">' + (st.ok && st.interest > 0 ? fmtINR(st.interest) : '—') + '</td>' +
        '<td>' + (st.ok ? badge(st) : '') + '</td>';
      var acts = st.ok && st.status !== 'paid'
        ? '<button class="vq-btn vq-btn-ghost t-pay" data-id="' + esc(inv.id) + '" type="button">Mark paid</button> '
        : '';
      return '<tr>' + cells + '<td>' + acts + '<button class="vq-btn vq-btn-ghost t-del" data-id="' + esc(inv.id) + '" type="button">Delete</button></td></tr>';
    }).join('');

    $('t-ledger').innerHTML =
      '<div class="t-cards">' +
      '<div class="t-card"><span class="vq-hint">Outstanding</span><strong>' + fmtINR(summ.outstanding) + '</strong></div>' +
      '<div class="t-card"><span class="vq-hint">Overdue (' + summ.overdueCount + ')</span><strong>' + fmtINR(summ.overdue) + '</strong></div>' +
      '<div class="t-card t-warn"><span class="vq-hint">MSME 45-day breaches</span><strong>' + summ.msmeRiskCount + '</strong></div>' +
      '<div class="t-card"><span class="vq-hint">Interest exposure (est.)</span><strong>' + fmtINR(summ.interestExposure) + '</strong></div>' +
      '</div>' +
      (ledger.length ? '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Vendor / Invoice</th><th>Inv. date</th><th class="num">Amount</th><th>Due date</th><th class="num">MSME interest*</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<p class="vq-hint">*Interest estimate at 3 × RBI bank rate = ' + MSME_INTEREST_RATE.toFixed(2) + '% p.a., compound with monthly rests (MSMED Act Sec 16). Estimate only.</p>'
        : '<p class="vq-hint">No invoices yet. Max ' + MAX_INVOICES + ' invoices on this device.</p>');

    Array.prototype.forEach.call(document.querySelectorAll('.t-pay'), function (b) {
      b.addEventListener('click', async function () {
        var l = await loadLedger();
        var inv = null; for (var i = 0; i < l.length; i++) if (l[i].id === b.getAttribute('data-id')) inv = l[i];
        if (inv) { inv.paidDate = todayStr(); await saveLedger(l); renderLedger(); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.t-del'), function (b) {
      b.addEventListener('click', async function () {
        var l = await loadLedger();
        l = l.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        await saveLedger(l); renderLedger();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-payment-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-payment-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the MSME 45-day payment rule?', a: 'Under Section 15 of the MSMED Act 2006, a buyer must pay an MSME supplier within the agreed credit period, which cannot exceed 45 days from acceptance of goods/services — even if the contract says longer.' },
      { q: 'MSME 45-दिन का भुगतान नियम क्या है?', a: 'MSMED एक्ट 2006 की धारा 15 के तहत खरीदार को MSME सप्लायर को स्वीकृति के 45 दिनों के भीतर भुगतान करना होता है — अनुबंध में ज़्यादा अवधि लिखी हो तो भी।' },
      { q: 'What interest applies on delayed MSME payments?', a: 'Section 16 mandates compound interest with monthly rests at three times the RBI bank rate. With the bank rate at 5.50% (verified Sep 2026), that is 16.50% p.a. Confirm the current rate with your CA before filing a claim.' },
      { q: 'MSME भुगतान में देरी पर कितना ब्याज लगता है?', a: 'धारा 16 के तहत मासिक चक्रवृद्धि के साथ RBI बैंक दर के तीन गुने की दर से ब्याज — बैंक दर 5.50% (सितंबर 2026 सत्यापित) पर यह 16.50% वार्षिक है।' },
      { q: 'How does this tracker flag breaches?', a: 'Tick "MSME-registered supplier" and the agreed credit is capped at 45 days. Invoices still unpaid beyond that are flagged "MSME 45-day breach" with an interest estimate; all overdue invoices are listed with days overdue.' },
      { q: 'Where can an MSME complain about delayed payment?', a: 'On the government MSME Samadhaan portal, which routes the case to the Micro and Small Enterprises Facilitation Council (MSEFC) for conciliation and arbitration under Section 18.' }
    ]);

    $('t-date').value = todayStr();
    renderLedger();

    $('t-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('t-gate'), SLUG, FREE_LIMIT); $('t-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var inv = {
        id: 'inv-' + Date.now(),
        vendor: $('t-vendor').value, invoiceNo: $('t-invno').value, invoiceDate: $('t-date').value,
        amount: $('t-amount').value, creditDays: $('t-credit').value, msme: $('t-msme').checked, paidDate: null
      };
      var v = validateInvoice(inv);
      if (!v.ok) { msg(v.error, false); return; }
      var ledger = await loadLedger();
      if (ledger.length >= MAX_INVOICES) { msg('Ledger is full (max ' + MAX_INVOICES + ' invoices). Delete or mark old ones paid.', false); return; }
      ledger.push({ id: inv.id, vendor: inv.vendor.trim(), invoiceNo: inv.invoiceNo.trim(), invoiceDate: inv.invoiceDate, amount: Number(inv.amount), creditDays: Math.floor(Number(inv.creditDays)), msme: inv.msme, paidDate: null });
      await saveLedger(ledger);
      msg('Invoice added.', true);
      $('t-vendor').value = ''; $('t-invno').value = ''; $('t-amount').value = '';
      renderLedger();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
