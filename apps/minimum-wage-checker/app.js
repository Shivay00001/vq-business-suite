/* ============================================================
   VisionQuantech Business Suite — Minimum Wage Checker
   apps/minimum-wage-checker/app.js

   Pure functions first (no DOM) — tested under node.
   Compares a gross monthly wage against a VERIFIED minimum-wage
   dataset (state, employment, skill, zone, monthly minimum,
   effective date, source). Only values taken directly from cited
   sources are included; missing zones are omitted, never guessed.
   Stateless: nothing stored.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- verified dataset ---------------- */
  // R(state, employment, effectiveDate, source, skill, zone, monthly)
  var DATA = [
    // Delhi — official order, eff 2025-10-01 (single state rate, no zones)
    ['Delhi', 'All scheduled employments', '2025-10-01', 'Delhi Labour Dept official order', 'Unskilled', null, 19846],
    ['Delhi', 'All scheduled employments', '2025-10-01', 'Delhi Labour Dept official order', 'Semi-skilled', null, 21813],
    ['Delhi', 'All scheduled employments', '2025-10-01', 'Delhi Labour Dept official order', 'Skilled', null, 23905],
    ['Delhi', 'All scheduled employments', '2025-10-01', 'Delhi Labour Dept official order', 'Graduate (clerical/supervisory)', null, 25876],
    // Maharashtra general — Simpliance via India Briefing, eff 2026-01-01
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone I', 13921],
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone II', 13325],
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone III', 12728],
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Skilled', 'Zone I', 15532],
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Skilled', 'Zone II', 14936],
    ['Maharashtra', 'General rates', '2026-01-01', 'Simpliance via India Briefing', 'Skilled', 'Zone III', 14340],
    // Maharashtra shops & commercial establishments — labourcodes360, eff 2026-07-01
    ['Maharashtra', 'Shops & commercial establishments', '2026-07-01', 'labourcodes360.com', 'Semi-skilled', 'Zone I', 14990],
    ['Maharashtra', 'Shops & commercial establishments', '2026-07-01', 'labourcodes360.com', 'Semi-skilled', 'Zone II', 14394],
    ['Maharashtra', 'Shops & commercial establishments', '2026-07-01', 'labourcodes360.com', 'Semi-skilled', 'Zone III', 13798],
    ['Maharashtra', 'Shops & commercial establishments', '2026-07-01', 'labourcodes360.com', 'Skilled', 'Zone I', 15766],
    ['Maharashtra', 'Shops & commercial establishments', '2026-07-01', 'labourcodes360.com', 'Skilled', 'Zone II', 15170],
    // Karnataka — Simpliance via India Briefing, eff 2026-05-22
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Unskilled', 'Zone I', 23376.43],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Unskilled', 'Zone II', 21251.30],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Unskilled', 'Zone III', 19319.36],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Skilled', 'Zone I', 28285.47],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Skilled', 'Zone II', 25714.07],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Skilled', 'Zone III', 23376.43],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Highly skilled', 'Zone I', 31114.02],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Highly skilled', 'Zone II', 28285.47],
    ['Karnataka', 'General rates', '2026-05-22', 'Simpliance via India Briefing', 'Highly skilled', 'Zone III', 25714.07],
    // Telangana — Simpliance via India Briefing, eff 2026-06-01
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone I', 16000],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone II', 15000],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Unskilled', 'Zone III', 14000],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Skilled', 'Zone I', 18500],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Skilled', 'Zone II', 17500],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Skilled', 'Zone III', 16500],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Highly skilled', 'Zone I', 20000],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Highly skilled', 'Zone II', 19000],
    ['Telangana', 'General rates', '2026-06-01', 'Simpliance via India Briefing', 'Highly skilled', 'Zone III', 18000],
    // Central sphere — Chief Labour Commissioner VDA revision, eff 2026-04-01 (daily × 26)
    ['Central sphere', 'Sweeping & cleaning', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area A', 21346],
    ['Central sphere', 'Sweeping & cleaning', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area B', 18018],
    ['Central sphere', 'Sweeping & cleaning', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area C', 14456],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area A', 21346],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area B', 18018],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Unskilled', 'Area C', 14456],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Semi-skilled/supervisory', 'Area A', 23868],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Semi-skilled/supervisory', 'Area B', 20306],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Semi-skilled/supervisory', 'Area C', 16900],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Skilled/clerical', 'Area A', 26208],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Skilled/clerical', 'Area B', 23868],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Skilled/clerical', 'Area C', 20306],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Highly skilled', 'Area A', 28444],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Highly skilled', 'Area B', 26208],
    ['Central sphere', 'Construction & maintenance', '2026-04-01', 'CLC (GoI) VDA revision', 'Highly skilled', 'Area C', 23868],
    ['Central sphere', 'Watch & ward (without arms)', '2026-04-01', 'CLC (GoI) VDA revision', 'Watchman', 'Area A', 26208],
    ['Central sphere', 'Watch & ward (without arms)', '2026-04-01', 'CLC (GoI) VDA revision', 'Watchman', 'Area B', 23868],
    ['Central sphere', 'Watch & ward (without arms)', '2026-04-01', 'CLC (GoI) VDA revision', 'Watchman', 'Area C', 20306]
  ];

  /* ---------------- pure computations ---------------- */

  function states() {
    var out = [];
    DATA.forEach(function (r) { if (out.indexOf(r[0]) === -1) out.push(r[0]); });
    return out;
  }
  function employments(state) {
    var out = [];
    DATA.forEach(function (r) { if (r[0] === state && out.indexOf(r[1]) === -1) out.push(r[1]); });
    return out;
  }
  function skills(state, employment) {
    var out = [];
    DATA.forEach(function (r) { if (r[0] === state && r[1] === employment && out.indexOf(r[4]) === -1) out.push(r[4]); });
    return out;
  }
  function zones(state, employment, skill) {
    var out = [];
    DATA.forEach(function (r) { if (r[0] === state && r[1] === employment && r[4] === skill && r[5] && out.indexOf(r[5]) === -1) out.push(r[5]); });
    return out;
  }
  function findRate(state, employment, skill, zone) {
    for (var i = 0; i < DATA.length; i++) {
      var r = DATA[i];
      if (r[0] === state && r[1] === employment && r[4] === skill && (r[5] || '') === (zone || '')) {
        return { ok: true, state: r[0], employment: r[1], eff: r[2], source: r[3], skill: r[4], zone: r[5], minimum: r[6] };
      }
    }
    return { ok: false, error: 'No verified rate for that combination — it is not in our dataset. Do not guess: check the official state notification.' };
  }

  function checkWage(state, employment, skill, zone, wage) {
    var n = Number(wage);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid wage amount.' };
    if (n < 0) return { ok: false, error: 'Wage cannot be negative.' };
    if (n > 10000000) return { ok: false, error: 'Wage looks too large.' };
    var rate = findRate(state, employment, skill, zone);
    if (!rate.ok) return rate;
    var diff = Math.round((n - rate.minimum) * 100) / 100;
    return {
      ok: true, rate: rate, wage: n,
      compliant: n >= rate.minimum,
      shortfall: diff < 0 ? Math.round(-diff * 100) / 100 : 0
    };
  }

  function fmtDate(iso) {
    var p = String(iso).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
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
    states: states, employments: employments, skills: skills, zones: zones,
    findRate: findRate, checkWage: checkWage,
    fmtDate: fmtDate, fmtINR: fmtINR, esc: esc, rowCount: DATA.length
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'minimum-wage-checker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('mw-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }
  function fill(sel, items, placeholder) {
    sel.innerHTML = items.map(function (x) { return '<option value="' + esc(x) + '">' + esc(x) + '</option>'; }).join('');
    if (placeholder) sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + sel.innerHTML;
  }

  function cascade(from) {
    var st = $('mw-state').value, em = $('mw-emp').value, sk = $('mw-skill').value;
    if (from === 'state' || !st) {
      fill($('mw-state'), states());
      st = $('mw-state').value;
    }
    if (from === 'state' || from === 'emp' || !em) {
      fill($('mw-emp'), employments(st));
      em = $('mw-emp').value;
    }
    if (from === 'state' || from === 'emp' || from === 'skill' || !sk) {
      fill($('mw-skill'), skills(st, em));
      sk = $('mw-skill').value;
    }
    var zs = zones(st, em, sk);
    if (zs.length) {
      $('mw-zone-row').style.display = '';
      fill($('mw-zone'), zs);
    } else {
      $('mw-zone-row').style.display = 'none';
      $('mw-zone').innerHTML = '';
    }
  }

  function renderResult(r) {
    $('mw-result-card').hidden = false;
    var rate = r.rate;
    var cls = r.compliant ? 'verdict-pass' : 'verdict-fail';
    var badge = r.compliant ? '<span class="badge b-pass">COMPLIANT</span>' : '<span class="badge b-fail">BELOW MINIMUM</span>';
    $('mw-result').innerHTML =
      '<div class="' + cls + '" style="border:1px solid var(--line);border-radius:10px;padding:1rem">' +
      badge +
      '<p>Verified minimum: <span class="big">' + fmtINR(rate.minimum) + '</span>/month' +
      (rate.zone ? ' · ' + esc(rate.zone) : '') + '</p>' +
      '<p>Worker\'s wage: <strong>' + fmtINR(r.wage) + '</strong>/month</p>' +
      (r.compliant
        ? '<p class="msg-ok">At or above the verified minimum.</p>'
        : '<p class="msg-err">Shortfall of <strong>' + fmtINR(r.shortfall) + '</strong>/month. Raise to at least ' + fmtINR(rate.minimum) + ' — paying below minimum wage can lead to prosecution and arrears.</p>') +
      '<p class="vq-hint">' + esc(rate.state) + ' · ' + esc(rate.employment) + ' · ' + esc(rate.skill) +
      ' · effective ' + esc(fmtDate(rate.eff)) + ' · source: ' + esc(rate.source) +
      '. <strong>Rates change — verify the latest state notification.</strong></p>' +
      '</div>';
    $('mw-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'minimum-wage-checker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'minimum-wage-checker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'Is there one national minimum wage in India?', a: 'No. States fix their own minimum wages by skill level, zone and scheduled employment; the Code on Wages, 2019 adds a central floor wage as a baseline. Always check your state notification.' },
      { q: 'क्या पूरे भारत में एक न्यूनतम वेतन है?', a: 'नहीं। राज्य कौशल स्तर, ज़ोन और निर्धारित नियोजन के अनुसार अपने न्यूनतम वेतन तय करते हैं। हमेशा अपने राज्य की अधिसूचना जाँचें।' },
      { q: 'What is VDA and how often do rates change?', a: 'Variable Dearness Allowance (VDA) is the inflation-linked part of the wage, revised usually every six months (1 April and 1 October in the central sphere).' },
      { q: 'Why does this checker cover only some states?', a: 'Because we only include values we could verify directly from a cited source, with effective dates. Unverified or OCR-unclear values are deliberately excluded rather than guessed.' },
      { q: 'What is the penalty for paying below minimum wage?', a: 'Under the Code on Wages, paying below the notified minimum wage can lead to imprisonment up to three months and/or a fine up to ₹1,00,000, plus payment of arrears.' },
      { q: 'Is this official compliance advice?', a: 'No — this is a self-check. Confirm the latest notification of your state labour department before relying on it.' }
    ]);

    cascade('state');
    $('mw-state').addEventListener('change', function () { cascade('state'); });
    $('mw-emp').addEventListener('change', function () { cascade('emp'); });
    $('mw-skill').addEventListener('change', function () { cascade('skill'); });

    $('mw-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('mw-gate'), SLUG, FREE_LIMIT); $('mw-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = checkWage($('mw-state').value, $('mw-emp').value, $('mw-skill').value,
        $('mw-zone-row').style.display === 'none' ? null : $('mw-zone').value, $('mw-wage').value);
      if (!r.ok) { msg(r.error, false); $('mw-result-card').hidden = true; return; }
      msg('', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
