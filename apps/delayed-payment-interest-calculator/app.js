/* ============================================================
   VisionQuantech Business Suite — Delayed Payment Interest Calculator
   apps/delayed-payment-interest-calculator/app.js

   Pure functions first (no DOM) — tested under node.
   MSMED Act, 2006 — Section 16: where a buyer defaults on payment
   to a micro/small enterprise supplier, the buyer is liable to pay
   COMPOUND INTEREST WITH MONTHLY RESTS at THREE TIMES the bank rate
   notified by the RBI, from the appointed day until paid.
   Section 15: payment cannot be delayed beyond 45 days from
   acceptance (or the agreed date, which itself cannot exceed 45 days).

   The user enters the DUE date (= appointed day / end of the 45-day
   window — see on-screen help) and the actual PAYMENT date; interest
   accrues daily at (3 x bankRate)/365 and is capitalised at each
   month-end (monthly rests).
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_PRINCIPAL = 10000000000;
  var MAX_DELAY_DAYS = 1095; // 3 years — beyond this, consult counsel
  var MULTIPLE = 3;          // Section 16: three times the RBI bank rate

  /** Strict YYYY-MM-DD calendar parse. */
  function strictDate(s) {
    s = String(s == null ? '' : s).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return { ok: false, error: 'Invalid calendar date.' };
    if (y < 1900 || y > 2100) return { ok: false, error: 'Year out of range.' };
    return { ok: true, value: s };
  }

  function validatePrincipal(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid principal amount.' };
    if (n <= 0) return { ok: false, error: 'Principal must be greater than zero.' };
    if (n > MAX_PRINCIPAL) return { ok: false, error: 'Principal looks too large.' };
    return { ok: true, value: n };
  }

  function validateBankRate(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid RBI bank rate.' };
    if (n <= 0 || n > 30) return { ok: false, error: 'Bank rate must be between 0 and 30%.' };
    return { ok: true, value: n };
  }

  function diffDays(fromISO, toISO) {
    var a = new Date(fromISO + 'T00:00:00Z').getTime();
    var b = new Date(toISO + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86400000);
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * MSMED Sec 16 interest. Interest accrues daily at annualRate/365 on the
   * running balance and is capitalised at each calendar month-end
   * (monthly rests). Charged for days AFTER the due date, up to and
   * including the payment date.
   * Returns {ok, days, ratePct, daily:[{date, interest, balanceAfterRest}],
   *          totalInterest, totalPayable}.
   */
  function msmedInterest(principal, dueISO, paidISO, bankRatePct) {
    var p = validatePrincipal(principal);
    if (!p.ok) return p;
    var r = validateBankRate(bankRatePct);
    if (!r.ok) return r;
    var dd = strictDate(dueISO);
    if (!dd.ok) return { ok: false, error: 'Due date: ' + dd.error };
    var pd = strictDate(paidISO);
    if (!pd.ok) return { ok: false, error: 'Payment date: ' + pd.error };
    var days = diffDays(dd.value, pd.value);
    if (days < 0) return { ok: false, error: 'Payment date cannot be before the due date.' };
    if (days === 0)
      return { ok: true, days: 0, ratePct: round2(MULTIPLE * r.value), daily: [], totalInterest: 0, totalPayable: p.value };
    if (days > MAX_DELAY_DAYS)
      return { ok: false, error: 'Delay exceeds 3 years — split into periods or consult your CA/lawyer.' };

    var annualRate = MULTIPLE * r.value / 100;
    var dailyRate = annualRate / 365;
    var balance = p.value;
    var accrued = 0;
    var daily = [];
    var curMonth = dd.value.slice(0, 7);
    for (var i = 1; i <= days; i++) {
      var dISO = addDays(dd.value, i);
      var intr = balance * dailyRate;
      accrued += intr;
      var m = dISO.slice(0, 7);
      var rested = false;
      if (m !== curMonth) { balance += accrued; accrued = 0; curMonth = m; rested = true; }
      daily.push({ date: dISO, interest: round2(intr), balanceAfterRest: round2(balance), rested: rested });
    }
    var totalInterest = round2(balance + accrued - p.value);
    return {
      ok: true, days: days, ratePct: round2(MULTIPLE * r.value),
      daily: daily, totalInterest: totalInterest,
      totalPayable: round2(p.value + totalInterest)
    };
  }

  /** Appointed-day helper: due date = acceptance date + 45 days (statutory max). */
  function dueFromAcceptance(acceptanceISO) {
    var a = strictDate(acceptanceISO);
    if (!a.ok) return a;
    return { ok: true, value: addDays(a.value, 45) };
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
    MULTIPLE: MULTIPLE, MAX_DELAY_DAYS: MAX_DELAY_DAYS,
    strictDate: strictDate, validatePrincipal: validatePrincipal,
    validateBankRate: validateBankRate, diffDays: diffDays,
    msmedInterest: msmedInterest, dueFromAcceptance: dueFromAcceptance,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'delayed-payment-interest-calculator';
  var FREE_LIMIT = 20;
  var VERIFIED_BANK_RATE = 5.50; // RBI Bank Rate, verified Sep 2026 (repo 5.25%)

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('m-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r, principal) {
    var card = $('m-result-card');
    card.hidden = false;
    var h;
    if (r.days === 0) {
      h = '<p class="msg-ok">Paid on the due date — no delayed-payment interest.</p>';
    } else {
      h = '<p class="vq-hint">Delay: <strong>' + r.days + ' day(s)</strong> · Rate: <strong>' +
        r.ratePct.toFixed(2) + '% p.a.</strong> (3 × RBI bank rate, compound interest with monthly rests)</p>' +
        '<p>Interest due: <span class="big">' + fmtINR(r.totalInterest) + '</span></p>' +
        '<p class="vq-hint">Principal ' + fmtINR(principal) + ' + interest = <strong>' + fmtINR(r.totalPayable) + '</strong> total claim</p>';
      var show = r.daily.slice(-30);
      h += '<h3>Day-wise interest (last ' + show.length + ' days)</h3>' +
        '<div class="tbl-wrap"><table class="tbl"><tr><th>Date</th><th>Day\u2019s interest</th><th>Balance after month-end rest</th></tr>';
      show.forEach(function (d) {
        h += '<tr><td>' + d.date + '</td><td class="num">' + fmtINR(d.interest) + '</td><td class="num">' +
          fmtINR(d.balanceAfterRest) + (d.rested ? ' *' : '') + '</td></tr>';
      });
      h += '</table></div><p class="vq-hint">* month-end: accrued interest capitalised (monthly rest).</p>';
    }
    h += '<p class="vq-hint">Estimate only — MSME Facilitation Council / legal advice needed before filing. Confirm with your CA.</p>';
    $('m-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'delayed-payment-interest-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'delayed-payment-interest-calculator-bottom', 'leaderboard');
    $('m-bankrate').value = VERIFIED_BANK_RATE.toFixed(2);
    SEO.faq([
      { q: 'What interest applies on delayed payments to MSME suppliers?', a: 'Under MSMED Act Section 16, the buyer must pay compound interest with monthly rests at three times the RBI bank rate, from the appointed day until payment — regardless of any contrary agreement.' },
      { q: 'MSME को देर से भुगतान पर कितना ब्याज मिलता है?', a: 'MSMED एक्ट की धारा 16 के तहत खरीदार को RBI बैंक दर के तीन गुना पर मासिक चक्रवृद्धि ब्याज देना होता है — नियत तिथि से भुगतान तक।' },
      { q: 'What is the current RBI bank rate used here?', a: 'The default is 5.50% p.a., the RBI Bank Rate verified in September 2026 (repo 5.25%). That makes the Section 16 rate 16.50% p.a. The rate is editable — always re-check the latest RBI notification before filing a claim.' },
      { q: 'Within how many days must a buyer pay an MSME supplier?', a: 'Section 15: on or before the agreed date in writing, and in no case later than 45 days from acceptance of goods/services. Interest runs from the appointed day (15 days after acceptance) when no date is agreed.' },
      { q: 'Can I claim interest even if the principal was paid late?', a: 'Yes — interest can be claimed on its own even if the principal was eventually paid. File through the MSME Samadhaan portal / Facilitation Council of the supplier\u2019s state.' },
      { q: 'Is this legal advice?', a: 'No — this is a calculation aid. Confirm the rate, dates and claim procedure with your CA or lawyer before filing.' }
    ]);

    $('m-fill-due').addEventListener('click', function () {
      var a = $('m-accept').value;
      var r = dueFromAcceptance(a);
      if (!r.ok) { msg('Acceptance date: ' + r.error, false); return; }
      $('m-due').value = r.value;
      msg('Due date set to acceptance + 45 days (statutory maximum).', true);
    });

    $('m-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('m-gate'), SLUG, FREE_LIMIT); $('m-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = msmedInterest($('m-principal').value, $('m-due').value, $('m-paid').value, $('m-bankrate').value);
      if (!r.ok) { msg(r.error, false); $('m-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r, Number($('m-principal').value));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
