/* ============================================================
   GST Interest & Late Fee Calculator — pure computation layer.
   Statutory basis (verified Sep 2026):
   - Sec 50(1) CGST Act: 18% p.a. on delayed tax payment, on NET
     cash liability only (proviso, Finance Act 2021, retrospective
     from 01-Jul-2017).
   - Sec 50(3) CGST Act: 24% p.a. on ITC wrongly availed AND
     utilised (no interest if merely availed but unutilised).
   - Rule 37 CGST Rules: 18% p.a. on ITC reversal from date of
     claim to date of reversal.
   - Sec 47 CGST Act late fee: Rs 50/day (Rs 25 CGST + Rs 25 SGST);
     nil return Rs 20/day (Rs 10 + Rs 10). Caps per
     Notification 19/2021-CT: nil -> Rs 500; turnover <= Rs 1.5cr
     -> Rs 2,000; Rs 1.5-5cr -> Rs 5,000; > Rs 5cr -> Rs 10,000.
   These functions are DOM-free so they can be unit-tested in node.
   ============================================================ */

var RATE_DELAYED_PAYMENT = 18;   // Sec 50(1)
var RATE_WRONG_ITC = 24;        // Sec 50(3)
var RATE_ITC_REVERSAL = 18;     // Rule 37

var LATE_FEE_NORMAL_PER_DAY = 50;
var LATE_FEE_NIL_PER_DAY = 20;
var LATE_FEE_CAP_NIL = 500;
var LATE_FEE_CAP_UPTO_1_5CR = 2000;
var LATE_FEE_CAP_UPTO_5CR = 5000;
var LATE_FEE_CAP_ABOVE_5CR = 10000;

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

/** Whole days the payment date falls after the due date (0 if on time). */
function daysDelayed(dueISO, payISO) {
  var due = new Date(String(dueISO).slice(0, 10) + 'T00:00:00');
  var pay = new Date(String(payISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(due.getTime()) || isNaN(pay.getTime())) return NaN;
  var d = Math.floor((pay - due) / 86400000);
  return d > 0 ? d : 0;
}

/**
 * Interest = amount x rate/100/365 x days.
 * Simple interest on a daily basis, as the GST portal computes it.
 */
function calcInterest(amount, ratePct, days) {
  amount = Number(amount); ratePct = Number(ratePct); days = Number(days);
  if (!(amount > 0) || !(ratePct > 0) || !(days > 0)) return 0;
  return round2(amount * (ratePct / 100) / 365 * days);
}

function lateFeePerDay(isNil) {
  return isNil ? LATE_FEE_NIL_PER_DAY : LATE_FEE_NORMAL_PER_DAY;
}

/** Maximum late fee per return, based on nil flag + annual turnover. */
function lateFeeCap(isNil, turnover) {
  if (isNil) return LATE_FEE_CAP_NIL;
  turnover = Number(turnover);
  if (!(turnover > 0)) return LATE_FEE_CAP_UPTO_5CR; // unknown -> mid cap
  if (turnover <= 15000000) return LATE_FEE_CAP_UPTO_1_5CR;
  if (turnover <= 50000000) return LATE_FEE_CAP_UPTO_5CR;
  return LATE_FEE_CAP_ABOVE_5CR;
}

/** Late fee for `days` of delay, capped per return. */
function calcLateFee(days, isNil, turnover) {
  days = Number(days);
  if (!(days > 0)) return 0;
  return Math.min(days * lateFeePerDay(isNil), lateFeeCap(isNil, turnover));
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function gsticInit() {
  var SLUG = 'gst-interest-calculator';
  var FREE_LIMIT = 20; // calculations per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'GST late payment par interest kitna lagta hai? (What is the GST interest rate for delayed payment?)',
      a: '18% per annum under Section 50(1) of the CGST Act, calculated on a daily basis on the net tax liability paid in cash (net of ITC). Formula: unpaid net cash tax × 18 ÷ 100 ÷ 365 × days delayed.' },
    { q: 'Galat ITC claim karne par kitna interest lagta hai? (Interest on wrongly availed ITC?)',
      a: '24% per annum under Section 50(3) CGST Act — but only if the ITC was both wrongly availed AND utilised to pay outward tax. If it merely sat unutilised in the credit ledger, no interest applies on reversal.' },
    { q: 'GSTR-3B ka late fee per day kitna hai? (What is the GSTR-3B late fee per day?)',
      a: 'Rs 50 per day (Rs 25 CGST + Rs 25 SGST), or Rs 20 per day (Rs 10 + Rs 10) for a nil return. Maximum per return: Rs 500 (nil), Rs 2,000 (turnover up to Rs 1.5 crore), Rs 5,000 (Rs 1.5–5 crore), Rs 10,000 (above Rs 5 crore) — Notification 19/2021-Central Tax.' },
    { q: 'Kya ITC se offset hui liability par interest lagta hai? (Is interest charged on the ITC portion?)',
      a: 'No. After the Finance Act 2021 amendment (retrospective from 1 July 2017), interest on delayed GSTR-3B filing applies only on the net tax liability discharged through the electronic cash ledger — the ITC-offset portion attracts zero interest.' },
    { q: 'Interest kab se kab tak lagta hai? (From which date is interest charged?)',
      a: 'From the day succeeding the due date of the return up to the date of actual payment/debit of the cash ledger. This calculator counts whole days between the due date and the payment date.' }
  ]);
  SEO.softwareApp({
    name: 'GST Interest & Late Fee Calculator — जीएसटी ब्याज कैलकुलेटर',
    description: 'Free GST interest and late fee calculator for Indian SMEs: 18% p.a. delayed-payment interest, 24% wrong-ITC interest, GSTR-3B late fee with statutory caps.',
    keywords: ['GST interest calculator', 'जीएसटी ब्याज कैलकुलेटर', 'GST late fee kaise calculate kare', 'GSTR-3B late fee', 'Section 50 interest', 'GST penalty calculator']
  });

  // default dates: due = 20th of last month, pay = today
  var now = new Date();
  var dueDefault = new Date(now.getFullYear(), now.getMonth() - 1, 20);
  el('dueDate').value = dueDefault.toISOString().slice(0, 10);
  el('payDate').value = now.toISOString().slice(0, 10);

  function rateFor(type) {
    if (type === 'itc-wrong') return RATE_WRONG_ITC;
    return RATE_DELAYED_PAYMENT; // 'delayed' and 'itc-reversal'
  }

  function calculate() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('gstic-upsell'), SLUG, FREE_LIMIT);
      el('gstic-result').style.display = 'none';
      return;
    }
    el('gstic-upsell').innerHTML = '';

    var type = el('liabType').value;
    var amount = parseFloat(el('amount').value);
    var due = el('dueDate').value, pay = el('payDate').value;
    var isNil = el('returnType').value === 'nil';
    var turnover = parseFloat(el('turnover').value) || 0;

    var err = el('gstic-error');
    err.textContent = '';
    if (!(amount > 0)) { err.textContent = 'Please enter the unpaid tax amount (₹).'; return; }
    if (!due || !pay) { err.textContent = 'Please pick both the due date and the payment date.'; return; }
    var days = daysDelayed(due, pay);
    if (isNaN(days)) { err.textContent = 'Invalid dates.'; return; }

    var rate = rateFor(type);
    var interest = isNil ? 0 : calcInterest(amount, rate, days);
    var fee = calcLateFee(days, isNil, turnover);
    var total = round2(interest + fee);
    var perDayInterest = isNil ? 0 : round2(amount * (rate / 100) / 365);

    var typeLabel = {
      'delayed': 'Delayed payment of tax — Section 50(1)',
      'itc-wrong': 'ITC wrongly availed & utilised — Section 50(3)',
      'itc-reversal': 'ITC reversal — Rule 37'
    }[type];

    el('r-days').textContent = days + (days === 1 ? ' day' : ' days');
    el('r-interest').textContent = inr(interest);
    el('r-fee').textContent = inr(fee);
    el('r-total').textContent = inr(total);
    el('r-note').innerHTML =
      'Type: <strong>' + typeLabel + '</strong> @ ' + rate + '% p.a.<br>' +
      'Interest per day: <strong>' + inr(perDayInterest) + '</strong>' +
      ' (' + inr(amount) + ' × ' + rate + '% ÷ 365)<br>' +
      'Late fee per day: <strong>₹' + lateFeePerDay(isNil) + '</strong>' +
      (fee >= lateFeeCap(isNil, turnover) && days > 0
        ? ' — <strong>capped</strong> at ₹' + lateFeeCap(isNil, turnover).toLocaleString('en-IN') + ' for this return'
        : '') + '<br>' +
      (isNil
        ? 'Nil return: no tax liability, so no interest — only late fee.'
        : (type === 'delayed'
            ? 'Interest computed on the <strong>net cash liability</strong> you entered (ITC-offset portion carries zero interest).'
            : (type === 'itc-wrong'
                ? 'Interest runs from the date the wrong ITC was utilised till reversal/payment.'
                : 'Interest runs from the date of original ITC claim till reversal.')));
    el('gstic-result').style.display = 'block';
  }

  el('calcBtn').addEventListener('click', calculate);
  ['liabType', 'amount', 'dueDate', 'payDate', 'returnType', 'turnover'].forEach(function (id) {
    el(id).addEventListener('change', function () { el('gstic-error').textContent = ''; });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gsticInit);
  } else { gsticInit(); }
}
