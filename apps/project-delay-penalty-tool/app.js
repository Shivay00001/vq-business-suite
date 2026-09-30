/* ============================================================
   VisionQuantech Business Suite — Project Delay Penalty Tool
   apps/project-delay-penalty-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Liquidated Damages (LD) calculator for Indian contracts:
     weeks   = ceil(delayDays / 7)        (part of a week counts)
     raw LD  = contractValue x rate%/100 x weeks
     cap     = contractValue x cap%/100
     payable = min(raw LD, cap)
   Typical government/GeM norm: 0.5% per week, capped at 10%
   of the delayed/undelivered portion — stated on-screen with a
   confirm-with-contract/CA caveat.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMOUNT = 100000000000;
  var MAX_DAYS = 3650;
  var DEFAULT_RATE = 0.5;
  var DEFAULT_CAP = 10;

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Days between two YYYY-MM-DD dates (end - start, can be negative). */
  function daysBetween(start, end) {
    var p1 = String(start).split('-').map(Number);
    var p2 = String(end).split('-').map(Number);
    if (p1.length !== 3 || p2.length !== 3) return { ok: false, error: 'Dates must be YYYY-MM-DD.' };
    var d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
    var d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
    if (!isFinite(d1) || !isFinite(d2)) return { ok: false, error: 'Invalid date(s).' };
    return { ok: true, value: Math.round((d2 - d1) / 86400000) };
  }

  function ld(inp) {
    inp = inp || {};
    var value = num(inp.contractValue, 'Contract value', 0, MAX_AMOUNT);
    if (!value.ok) return value;
    if (value.value <= 0) return { ok: false, error: 'Contract value must be greater than zero.' };
    var days = num(inp.delayDays, 'Delay (days)', 0, MAX_DAYS);
    if (!days.ok) return days;
    var rate = num(inp.ratePct == null || inp.ratePct === '' ? DEFAULT_RATE : inp.ratePct, 'LD rate % per week', 0, 5);
    if (!rate.ok) return rate;
    var cap = num(inp.capPct == null || inp.capPct === '' ? DEFAULT_CAP : inp.capPct, 'LD cap %', 0, 100);
    if (!cap.ok) return cap;

    var delayDays = Math.floor(days.value);
    var weeks = Math.ceil(delayDays / 7);
    var perWeek = round2(value.value * rate.value / 100);
    var raw = round2(perWeek * weeks);
    var capAmt = round2(value.value * cap.value / 100);
    var payable = raw > capAmt ? capAmt : raw;
    var capped = raw > capAmt;
    var grace = inp.graceDays != null && inp.graceDays !== '' ? num(inp.graceDays, 'Grace days', 0, 365) : { ok: true, value: 0 };
    if (!grace.ok) return grace;
    var chargeable = Math.max(0, delayDays - Math.floor(grace.value));
    var weeksC = Math.ceil(chargeable / 7);
    var rawC = round2(perWeek * weeksC);
    var payableC = rawC > capAmt ? capAmt : rawC;

    return {
      ok: true,
      contractValue: value.value,
      delayDays: delayDays,
      ratePct: rate.value, capPct: cap.value,
      graceDays: Math.floor(grace.value),
      chargeableDays: chargeable,
      weeks: weeksC,
      perWeek: perWeek,
      rawLD: rawC,
      capAmount: capAmt,
      payable: payableC,
      capped: rawC > capAmt,
      note: 'Part of a week counts as a full week.'
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
    DEFAULT_RATE: DEFAULT_RATE, DEFAULT_CAP: DEFAULT_CAP,
    ld: ld, daysBetween: daysBetween,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'project-delay-penalty-tool';
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
    var html = '<p class="formula">LD = ' + fmtINR(r.contractValue) + ' × ' + r.ratePct + '% × ' + r.weeks +
      ' week(s) = <strong>' + fmtINR(r.rawLD) + '</strong>' +
      (r.capped ? ' → capped at ' + r.capPct + '% (' + fmtINR(r.capAmount) + ')' : '') + '</p>' +
      '<p>Delay: <strong>' + r.delayDays + ' day(s)</strong>' +
      (r.graceDays ? ' − ' + r.graceDays + ' grace = <strong>' + r.chargeableDays + ' chargeable day(s)</strong>' : '') +
      ' → <strong>' + r.weeks + ' week(s)</strong> (part-week counts as full)</p>' +
      '<p class="vq-hint">Per-week LD: ' + fmtINR(r.perWeek) + ' · Cap: ' + fmtINR(r.capAmount) + ' (' + r.capPct + '% of contract value)</p>' +
      '<p>Liquidated damages payable: <span class="big">' + fmtINR(r.payable) + '</span></p>' +
      (r.capped ? '<p class="msg-err">Cap applied: raw LD exceeded the ' + r.capPct + '% ceiling.</p>' : '') +
      '<p class="vq-hint">LD is usually levied on the delayed/undelivered portion — enter that value above if your contract says so. Estimate only — confirm with your contract and CA.</p>';
    $('p-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'project-delay-penalty-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'project-delay-penalty-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How is liquidated damage (LD) calculated in Indian contracts?', a: 'Typically 0.5% of the contract value per week of delay (part of a week counts as a full week), capped at 10% of the delayed/undelivered portion — the standard GeM/government norm. Your contract may differ, so read its LD clause.' },
      { q: 'लिक्विडेटेड डैमेज कैसे निकालें?', a: 'आमतौर पर प्रति सप्ताह देरी पर कॉन्ट्रैक्ट मूल्य का 0.5%, अधिकतम 10% तक। सप्ताह का हिस्सा भी पूरा सप्ताह गिना जाता है। अपने कॉन्ट्रैक्ट की LD शर्त ज़रूर पढ़ें।' },
      { q: 'Is LD charged on the full contract value or the delayed portion?', a: 'Most Indian government contracts levy LD on the delayed/undelivered portion only — e.g. 0.5% per week of the undelivered quantity\u2019s value, capped at 10% of that portion. Enter the delayed portion\u2019s value above in that case.' },
      { q: 'क्या LD से बचा जा सकता है?', a: 'फोर्स मेज्योर (बाढ़, महामारी, सरकारी प्रतिबंध) जैसी परिस्थितियों में समय-वृद्धि (extension of time) माँगी जा सकती है — समय पर लिखित में आवेदन करें। यह कानूनी सलाह नहीं है।' },
      { q: 'Is this legal advice?', a: 'No — a planning estimate using the typical 0.5%/week, 10%-cap norm. Your contract\u2019s LD clause governs. Confirm with your consultant/CA.' }
    ]);

    function syncDays() {
      var s = $('p-start').value, e = $('p-end').value;
      if (s && e) {
        var d = daysBetween(s, e);
        if (d.ok && d.value >= 0) $('p-days').value = d.value;
      }
    }
    $('p-start').addEventListener('change', syncDays);
    $('p-end').addEventListener('change', syncDays);

    $('p-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = ld({
        contractValue: $('p-value').value, delayDays: $('p-days').value,
        ratePct: $('p-rate').value, capPct: $('p-cap').value, graceDays: $('p-grace').value
      });
      if (!r.ok) { msg(r.error, false); $('p-result-card').hidden = true; return; }
      msg('Calculated. ' + gate.remaining + ' free use(s) left today.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
