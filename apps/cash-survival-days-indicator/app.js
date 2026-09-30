/* ============================================================
   VisionQuantech Business Suite — Cash Survival Days Indicator
   apps/cash-survival-days-indicator/app.js

   Pure functions first (no DOM) — tested under node.
   Cash in hand ÷ daily burn = survival days. A runway band
   (critical / watch / safe) drives urgency actions.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CRITICAL_DAYS = 30;
  var SAFE_DAYS = 90;
  var MAX_CASH = 10000000000;

  function validateCash(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid cash-in-hand amount.' };
    if (n < 0) return { ok: false, error: 'Cash in hand cannot be negative.' };
    if (n > MAX_CASH) return { ok: false, error: 'Cash amount looks too large.' };
    return { ok: true, value: n };
  }

  function validateBurn(v, monthly) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid burn amount.' };
    if (n < 0) return { ok: false, error: 'Burn cannot be negative.' };
    var daily = monthly ? n / 30 : n;
    if (daily > 100000000) return { ok: false, error: 'Burn looks too large.' };
    return { ok: true, value: daily };
  }

  /** Survival days = cash / daily burn. Burn of 0 => infinite runway. */
  function survivalDays(cash, dailyBurn) {
    var c = validateCash(cash), b = validateBurn(dailyBurn, false);
    if (!c.ok) return c;
    if (!b.ok) return b;
    if (b.value <= 0) return { ok: true, days: Infinity, unlimited: true };
    return { ok: true, days: c.value / b.value, unlimited: false };
  }

  function runwayBand(days, unlimited) {
    if (unlimited) return {
      band: 'safe', label: 'No burn — runway is unlimited',
      color: '#1d7a3f',
      actions: ['Keep at least 3 months of expenses as a buffer anyway.',
                'Put idle cash to work only after the buffer is full.']
    };
    if (days < CRITICAL_DAYS) return {
      band: 'critical', label: 'CRITICAL — less than 30 days of runway',
      color: '#b3261e',
      actions: [
        'Call your 5 biggest debtors TODAY — collect anything due, offer 2% early-pay discount.',
        'Freeze all non-essential spending this week; approve every outflow personally.',
        'Line up a credit line/overdraft NOW while you still have leverage — do not wait.',
        'Talk to your CA about restructuring payables before a payment bounces.'
      ]
    };
    if (days < SAFE_DAYS) return {
      band: 'watch', label: 'WATCH — 30 to 90 days of runway',
      color: '#9a6b00',
      actions: [
        'Start a weekly cash-flow review with projected inflows vs outflows.',
        'Shorten your collection cycle: invoice on delivery, follow up at day 7.',
        'Delay or renegotiate large upcoming payments to land after receipts.',
        'Build toward a 90-day buffer before taking on new commitments.'
      ]
    };
    return {
      band: 'safe', label: 'SAFE — 90+ days of runway',
      color: '#1d7a3f',
      actions: [
        'Protect the buffer: keep 3 months of burn in a separate sweep account.',
        'Re-invest surplus into the highest-ROI growth lever you can measure.',
        'Review runway monthly — a single bad quarter can halve it.'
      ]
    };
  }

  /** Full indicator: {days, unlimited, band, label, color, actions}. */
  function indicate(cash, dailyBurn) {
    var s = survivalDays(cash, dailyBurn);
    if (!s.ok) return s;
    var b = runwayBand(s.days, s.unlimited);
    return { ok: true, days: s.days, unlimited: s.unlimited,
             band: b.band, label: b.label, color: b.color, actions: b.actions };
  }

  function fmtINR(n) {
    if (!isFinite(n)) return '—';
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    CRITICAL_DAYS: CRITICAL_DAYS, SAFE_DAYS: SAFE_DAYS,
    validateCash: validateCash, validateBurn: validateBurn,
    survivalDays: survivalDays, runwayBand: runwayBand,
    indicate: indicate, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cash-survival-days-indicator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('c-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r, cash, dailyBurn) {
    var card = $('c-result-card');
    card.hidden = false;
    var gaugePct = r.unlimited ? 100 : Math.min(100, (r.days / 180) * 100);
    var daysTxt = r.unlimited ? '∞' : Math.floor(r.days) + ' days';
    var actions = r.actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
    $('c-result').innerHTML =
      '<p class="vq-hint">' + fmtINR(cash) + ' ÷ ' + fmtINR(dailyBurn) + '/day</p>' +
      '<p>Survival runway: <span class="big" style="color:' + r.color + '">' + daysTxt + '</span></p>' +
      '<div class="bar" style="margin:.6rem 0"><div class="fill" style="width:' + gaugePct + '%;background:' + r.color + '"></div></div>' +
      '<p class="msg-' + (r.band === 'safe' ? 'ok' : r.band === 'watch' ? '' : 'err') + '" style="font-weight:700">' + esc(r.label) + '</p>' +
      '<h3>Urgency actions</h3><ol class="assump" style="list-style:decimal inside">' + actions + '</ol>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'cash-survival-days-indicator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cash-survival-days-indicator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How many days can my business survive on current cash?', a: 'Divide cash in hand by daily burn (all outflows ÷ 30). Below 30 days is critical, 30–90 is watch, above 90 is safe.' },
      { q: 'मेरा बिज़नेस कितने दिन चल सकता है?', a: 'हाथ में कैश ÷ रोज़ाना खर्च = बचे हुए दिन। 30 दिन से कम क्रिटिकल, 30–90 वॉच, 90 से ऊपर सुरक्षित।' },
      { q: 'What counts as daily burn?', a: 'Everything leaving the account: salaries, rent, EMIs, supplier payments, taxes, owner drawings — total monthly outflow ÷ 30.' },
      { q: 'My burn is zero — is my runway infinite?', a: 'Mathematically yes, but keep a 3-month buffer anyway. A zero-burn month rarely repeats.' },
      { q: 'Is this financial advice?', a: 'No — a planning indicator. Talk to your CA before borrowing or restructuring payables.' }
    ]);
    $('c-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('c-gate'), SLUG, FREE_LIMIT); $('c-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var cash = validateCash($('c-cash').value);
      if (!cash.ok) { msg(cash.error, false); $('c-result-card').hidden = true; return; }
      var monthly = $('c-burn-mode').value === 'monthly';
      var burn = validateBurn($('c-burn').value, monthly);
      if (!burn.ok) { msg(burn.error, false); $('c-result-card').hidden = true; return; }
      var r = indicate(cash.value, burn.value);
      msg('', null);
      renderResult(r, cash.value, burn.value);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
