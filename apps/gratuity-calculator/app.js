/* ============================================================
   VisionQuantech Business Suite — Gratuity Calculator
   apps/gratuity-calculator/app.js

   Pure functions first (no DOM) — tested under node.
   Formula (Payment of Gratuity Act, 1972):
     Gratuity = (last-drawn monthly salary x 15 x billable years) / 26
   - salary = Basic + DA (HRA/bonus/OT excluded)
   - billable years: completed years; >6 months in final year = +1
   - eligibility: 5 years continuous service (waived on death /
     disablement); applicability: establishments with 10+ employees
   - statutory cap: Rs 20,00,000 (2018 amendment)
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SALARY = 100000000;
  var MAX_YEARS = 60;
  var GRATUITY_CAP = 2000000;

  function validateSalary(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid last-drawn monthly salary.' };
    if (n <= 0) return { ok: false, error: 'Salary must be greater than zero.' };
    if (n > MAX_SALARY) return { ok: false, error: 'Salary looks too large (max ₹' + MAX_SALARY.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function validateYears(v) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Years must be a whole number.' };
    if (n < 0 || n > MAX_YEARS) return { ok: false, error: 'Years must be between 0 and ' + MAX_YEARS + '.' };
    return { ok: true, value: n };
  }

  function validateMonths(v) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Months must be a whole number.' };
    if (n < 0 || n > 11) return { ok: false, error: 'Extra months must be between 0 and 11.' };
    return { ok: true, value: n };
  }

  /** Billable years: >6 months in the final year counts as a full year. */
  function billableYears(years, months) {
    var y = validateYears(years), m = validateMonths(months);
    if (!y.ok) return y;
    if (!m.ok) return m;
    return { ok: true, value: y.value + (m.value > 6 ? 1 : 0), roundedUp: m.value > 6 };
  }

  function eligible(billable, covered, specialCase) {
    if (!covered) return { ok: true, eligible: false, reason: 'Establishment is not covered by the Act (needs 10+ employees). Gratuity may still be paid ex-gratia — confirm with your CA.' };
    if (specialCase) return { ok: true, eligible: true, reason: 'Payable on death/disablement regardless of tenure.' };
    if (billable >= 5) return { ok: true, eligible: true, reason: '5+ years of continuous service completed.' };
    return { ok: true, eligible: false, reason: 'Only ' + billable + ' billable year(s) — 5 years of continuous service required.' };
  }

  /** Raw gratuity (uncapped). */
  function gratuityRaw(salary, billable) {
    var s = validateSalary(salary);
    if (!s.ok) return s;
    if (!isFinite(billable) || billable < 0) return { ok: false, error: 'Invalid service years.' };
    return { ok: true, value: Math.round(((s.value * 15 * billable) / 26) * 100) / 100 };
  }

  /** Full calculation: {billable, eligible, reason, raw, capped, payable}. */
  function calculate(salary, years, months, covered, specialCase) {
    var by = billableYears(years, months);
    if (!by.ok) return by;
    var el = eligible(by.value, !!covered, !!specialCase);
    if (!el.eligible) return { ok: true, billable: by.value, eligible: false, reason: el.reason, raw: 0, payable: 0, capped: false };
    var g = gratuityRaw(salary, by.value);
    if (!g.ok) return g;
    var capped = g.value > GRATUITY_CAP;
    return {
      ok: true, billable: by.value, roundedUp: by.roundedUp,
      eligible: true, reason: el.reason,
      raw: g.value, capped: capped, cap: GRATUITY_CAP,
      payable: capped ? GRATUITY_CAP : g.value
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
    GRATUITY_CAP: GRATUITY_CAP,
    validateSalary: validateSalary, validateYears: validateYears,
    validateMonths: validateMonths, billableYears: billableYears,
    eligible: eligible, gratuityRaw: gratuityRaw,
    calculate: calculate, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'gratuity-calculator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('g-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r, salary) {
    var card = $('g-result-card');
    card.hidden = false;
    var html;
    if (!r.ok) { html = '<p class="msg-err">' + esc(r.error) + '</p>'; }
    else if (!r.eligible) {
      html = '<p class="msg-err">Not eligible: ' + esc(r.reason) + '</p>' +
        '<p class="vq-hint">Billable years: ' + r.billable + '. Gratuity payable: <strong>₹0</strong>.</p>';
    } else {
      html = '<p class="vq-hint">Billable years of service: <strong>' + r.billable + '</strong>' +
        (r.roundedUp ? ' (final-year months rounded up)' : '') + ' · ' + esc(r.reason) + '</p>' +
        '<p class="vq-hint">(' + fmtINR(salary) + ' × 15 × ' + r.billable + ') ÷ 26 = <strong>' + fmtINR(r.raw) + '</strong></p>' +
        (r.capped
          ? '<p class="msg-err">Statutory cap applies: payable is capped at ' + fmtINR(r.cap) + ' (2018 amendment). The excess is taxable.</p>'
          : '') +
        '<p>Gratuity payable: <span class="big">' + fmtINR(r.payable) + '</span></p>' +
        '<p class="vq-hint">Estimate only — confirm with your CA before paying or filing.</p>';
    }
    $('g-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'gratuity-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'gratuity-calculator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How is gratuity calculated in India?', a: 'Gratuity = (last-drawn monthly salary × 15 × completed years of service) ÷ 26, where salary means Basic + DA. A month is taken as 26 working days, hence 15/26.' },
      { q: 'ग्रेच्युटी कैसे निकालें?', a: 'ग्रेच्युटी = (अंतिम मासिक वेतन × 15 × सेवा के पूर्ण वर्ष) ÷ 26। वेतन में बेसिक + DA शामिल है। 5 साल की निरंतर सेवा ज़रूरी है।' },
      { q: 'Who is eligible for gratuity?', a: 'Employees of establishments with 10+ workers who complete 5 years of continuous service. The 5-year rule is waived on death or disablement due to accident/disease.' },
      { q: 'Is there a maximum gratuity amount?', a: 'Yes — ₹20,00,000 under the Payment of Gratuity Act (raised from ₹10 lakh in 2018). Anything above that is taxable.' },
      { q: 'Is this official legal advice?', a: 'No — this is an estimate using the statutory formula. Confirm with your CA or labour consultant before paying or filing.' }
    ]);

    $('g-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('g-gate'), SLUG, FREE_LIMIT); $('g-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var salary = $('g-salary').value;
      var r = calculate(salary, $('g-years').value, $('g-months').value, $('g-covered').checked, $('g-special').checked);
      if (!r.ok) { msg(r.error, false); $('g-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r, salary);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
