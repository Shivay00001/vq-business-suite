/* ============================================================
   VisionQuantech Business Suite — Penalty Reduction Planner
   apps/penalty-reduction-planner/app.js

   Pure functions first (no DOM) — tested under node.
   GSTR-3B late-fee & interest scenarios: pay now vs wait N more
   days. Rates VERIFIED Sep 2026 (see sources in index.html):
     - non-nil return: Rs 50/day (Rs 25 CGST + Rs 25 SGST)
     - nil return:     Rs 20/day (Rs 10 CGST + Rs 10 SGST)
     - caps: nil Rs 500; non-nil Rs 10,000 per return
       (flat cap from July 2025, earlier turnover-based:
        <=1.5 Cr Rs 2,000 / 1.5-5 Cr Rs 5,000 / >5 Cr Rs 10,000)
     - interest: 18% p.a. on delayed net cash tax liability
   Planning aid only — confirm with your CA before filing.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var RATE_GENERAL = 50;    // Rs/day, non-nil
  var RATE_NIL = 20;        // Rs/day, nil
  var CAP_NIL = 500;
  var CAP_GENERAL = 10000;  // flat cap per return from July 2025
  var INTEREST_RATE = 0.18; // 18% p.a.
  var MAX_DAYS = 1095;
  var MAX_TAX = 1000000000;

  function validateDays(v, label) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n)
      return { ok: false, error: (label || 'Days') + ' must be a whole number.' };
    if (n < 0 || n > MAX_DAYS)
      return { ok: false, error: (label || 'Days') + ' must be between 0 and ' + MAX_DAYS + '.' };
    return { ok: true, value: n };
  }

  function validateTax(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid tax amount.' };
    if (n < 0) return { ok: false, error: 'Tax amount cannot be negative.' };
    if (n > MAX_TAX) return { ok: false, error: 'Tax amount looks too large.' };
    return { ok: true, value: n };
  }

  /** Late fee for daysLate: min(rate*days, cap). */
  function lateFee(daysLate, isNil) {
    var d = validateDays(daysLate, 'Days late');
    if (!d.ok) return d;
    var rate = isNil ? RATE_NIL : RATE_GENERAL;
    var cap = isNil ? CAP_NIL : CAP_GENERAL;
    var raw = rate * d.value;
    return {
      ok: true, days: d.value, rate: rate, cap: cap,
      raw: raw, fee: Math.min(raw, cap), capped: raw > cap,
      note: isNil
        ? 'Nil return: Rs 20/day capped at Rs 500.'
        : 'Non-nil return: Rs 50/day (Rs 25 CGST + Rs 25 SGST), flat cap Rs 10,000 per return from July 2025.'
    };
  }

  /** Interest on delayed tax: taxDue * 18% * days / 365. */
  function interestDue(taxDue, daysLate) {
    var t = validateTax(taxDue); if (!t.ok) return t;
    var d = validateDays(daysLate, 'Days late'); if (!d.ok) return d;
    var interest = (t.value * INTEREST_RATE * d.value) / 365;
    return { ok: true, taxDue: t.value, days: d.value, rate: INTEREST_RATE,
             interest: Math.round(interest * 100) / 100,
             note: '18% p.a. on delayed net cash tax liability (after ITC).' };
  }

  /** Pay now vs wait waitDays more: {now:{fee,interest,total}, later:{...}, extraCost, verdict}. */
  function compare(daysLate, waitDays, isNil, taxDue) {
    var d1 = validateDays(daysLate, 'Days late already'); if (!d1.ok) return d1;
    var d2 = validateDays(waitDays, 'Additional wait days'); if (!d2.ok) return d2;
    var feeNow = lateFee(d1.value, isNil);
    var feeLater = lateFee(d1.value + d2.value, isNil);
    var intNow = interestDue(taxDue, d1.value); if (!intNow.ok) return intNow;
    var intLater = interestDue(taxDue, d1.value + d2.value);
    var totalNow = feeNow.fee + intNow.interest;
    var totalLater = feeLater.fee + intLater.interest;
    var extra = Math.round((totalLater - totalNow) * 100) / 100;
    return {
      ok: true,
      now: { days: d1.value, fee: feeNow.fee, feeCapped: feeNow.capped, interest: intNow.interest, total: Math.round(totalNow * 100) / 100 },
      later: { days: d1.value + d2.value, fee: feeLater.fee, feeCapped: feeLater.capped, interest: intLater.interest, total: Math.round(totalLater * 100) / 100 },
      extraCost: extra,
      verdict: extra > 0
        ? 'Waiting ' + d2.value + ' more day(s) costs an EXTRA ' + fmtINR(extra) + ' — paying now is cheaper.'
        : 'No additional cost from waiting (fee already capped and no tax interest) — but file anyway to unblock future returns.'
    };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    RATE_GENERAL: RATE_GENERAL, RATE_NIL: RATE_NIL,
    CAP_NIL: CAP_NIL, CAP_GENERAL: CAP_GENERAL, INTEREST_RATE: INTEREST_RATE,
    validateDays: validateDays, validateTax: validateTax,
    lateFee: lateFee, interestDue: interestDue, compare: compare,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'penalty-reduction-planner';
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
    function col(x, title) {
      return '<div class="cmp"><h3>' + title + '</h3>' +
        '<p class="vq-hint">Days late: <strong>' + x.days + '</strong></p>' +
        '<p>Late fee: <strong>' + fmtINR(x.fee) + '</strong>' + (x.feeCapped ? ' <span class="vq-hint">(capped)</span>' : '') + '</p>' +
        '<p>Interest @18%: <strong>' + fmtINR(x.interest) + '</strong></p>' +
        '<p>Total: <span class="big">' + fmtINR(x.total) + '</span></p></div>';
    }
    $('p-result').innerHTML =
      '<div class="cmp-grid">' + col(r.now, 'Pay now') + col(r.later, 'Wait longer') + '</div>' +
      '<p class="' + (r.extraCost > 0 ? 'msg-err' : 'msg-ok') + '" style="font-weight:700">' + esc(r.verdict) + '</p>' +
      '<p class="vq-hint">Planning aid only — late fees also block future return filings until paid. Confirm with your CA before filing.</p>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'penalty-reduction-planner-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'penalty-reduction-planner-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the late fee for delayed GSTR-3B filing?', a: 'Rs 50/day for returns with tax liability (Rs 25 CGST + Rs 25 SGST) and Rs 20/day for nil returns — verified Sep 2026.' },
      { q: 'GSTR-3B में देरी पर कितना जुर्माना लगता है?', a: 'टैक्स वाली रिटर्न पर ₹50/दिन, निल रिटर्न पर ₹20/दिन। निल पर अधिकतम ₹500, बाकी पर जुलाई 2025 से ₹10,000 की फ्लैट कैप।' },
      { q: 'What is the maximum GSTR-3B late fee?', a: 'Rs 500 for nil returns; Rs 10,000 per return for others (flat cap from July 2025; earlier it was turnover-based: Rs 2,000 / 5,000 / 10,000).' },
      { q: 'What interest applies on delayed GST payment?', a: '18% per annum on the delayed net cash tax liability (after ITC), computed per day of delay.' },
      { q: 'Should I pay now or wait?', a: 'Almost always pay now — the fee grows Rs 50/day and unpaid fees block your future return filings. This tool shows the exact extra cost of waiting.' },
      { q: 'Is this official tax advice?', a: 'No — a planning aid. Confirm the final amount on the GST portal and with your CA before filing.' }
    ]);
    $('p-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = compare(
        $('p-days').value, $('p-wait').value,
        $('p-nil').checked, $('p-tax').value
      );
      if (!r.ok) { msg(r.error, false); $('p-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
