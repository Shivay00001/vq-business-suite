/* ============================================================
   VisionQuantech Business Suite — Tender Eligibility Checker
   apps/tender-eligibility-checker/app.js

   Pure functions first (no DOM) — tested under node.
   Compares tender criteria (min turnover, experience, past
   contracts, EMD capacity, category, registration) against your
   company profile and returns eligible / marginal / no-go with
   a per-criterion gap list.
   Verdict rule per numeric criterion:
     actual >= required            -> pass
     actual >= 90% of required     -> marginal
     otherwise                     -> fail
   Overall: any fail -> no-go; any marginal -> marginal;
   otherwise eligible.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMOUNT = 100000000000;

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function optText(v, max) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > max) return { ok: false, error: 'Text must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function verdictNumeric(required, actual) {
    if (!(required > 0)) return { verdict: 'pass', note: 'No minimum set in tender — treated as met.' };
    if (actual >= required) return { verdict: 'pass', note: 'Meets requirement.' };
    if (actual >= 0.9 * required) {
      var gap = required - actual;
      return { verdict: 'marginal', note: 'Short by ' + gap.toLocaleString('en-IN') + ' (within 10% — risky).' };
    }
    var gap2 = required - actual;
    return { verdict: 'fail', note: 'Short by ' + gap2.toLocaleString('en-IN') + '.' };
  }

  function fmtShort(n) {
    var v = +n || 0;
    if (v >= 10000000) return '₹' + (Math.round(v / 100000) / 100).toLocaleString('en-IN') + ' Cr';
    if (v >= 100000) return '₹' + (Math.round(v / 1000) / 100).toLocaleString('en-IN') + ' L';
    return '₹' + v.toLocaleString('en-IN');
  }

  function assess(tender, profile) {
    tender = tender || {}; profile = profile || {};
    var tTurn = num(tender.minTurnover == null || tender.minTurnover === '' ? 0 : tender.minTurnover, 'Minimum turnover', 0, MAX_AMOUNT);
    if (!tTurn.ok) return tTurn;
    var tExp = num(tender.minExperience == null || tender.minExperience === '' ? 0 : tender.minExperience, 'Minimum experience (years)', 0, 100);
    if (!tExp.ok) return tExp;
    var tCon = num(tender.minContracts == null || tender.minContracts === '' ? 0 : tender.minContracts, 'Minimum past contracts', 0, 10000);
    if (!tCon.ok) return tCon;
    var tEmd = num(tender.emd == null || tender.emd === '' ? 0 : tender.emd, 'EMD required', 0, MAX_AMOUNT);
    if (!tEmd.ok) return tEmd;
    var pTurn = num(profile.turnover == null || profile.turnover === '' ? 0 : profile.turnover, 'Your turnover', 0, MAX_AMOUNT);
    if (!pTurn.ok) return pTurn;
    var pExp = num(profile.experience == null || profile.experience === '' ? 0 : profile.experience, 'Your experience (years)', 0, 100);
    if (!pExp.ok) return pExp;
    var pCon = num(profile.contracts == null || profile.contracts === '' ? 0 : profile.contracts, 'Your past contracts', 0, 10000);
    if (!pCon.ok) return pCon;
    var pEmd = num(profile.emdCapacity == null || profile.emdCapacity === '' ? 0 : profile.emdCapacity, 'Your EMD capacity', 0, MAX_AMOUNT);
    if (!pEmd.ok) return pEmd;
    var cat = optText(tender.category, 60); if (!cat.ok) return cat;
    var pcat = optText(profile.category, 60); if (!pcat.ok) return pcat;
    var reg = optText(tender.registration, 60); if (!reg.ok) return reg;
    var preg = optText(profile.registration, 60); if (!preg.ok) return preg;

    var criteria = [];
    var v;

    v = verdictNumeric(tTurn.value, pTurn.value);
    criteria.push({ id: 'turnover', label: 'Average annual turnover', required: fmtShort(tTurn.value), actual: fmtShort(pTurn.value), verdict: v.verdict, note: v.note });
    v = verdictNumeric(tExp.value, pExp.value);
    criteria.push({ id: 'experience', label: 'Years of experience', required: tExp.value + ' yr', actual: pExp.value + ' yr', verdict: v.verdict, note: v.note });
    v = verdictNumeric(tCon.value, pCon.value);
    criteria.push({ id: 'contracts', label: 'Similar past contracts', required: String(tCon.value), actual: String(pCon.value), verdict: v.verdict, note: v.note });

    if (tEmd.value > 0) {
      var emdV = pEmd.value >= tEmd.value
        ? { verdict: 'pass', note: 'You can arrange the EMD.' }
        : { verdict: 'fail', note: 'EMD of ' + fmtShort(tEmd.value) + ' exceeds your capacity of ' + fmtShort(pEmd.value) + '.' };
      criteria.push({ id: 'emd', label: 'EMD capacity', required: fmtShort(tEmd.value), actual: fmtShort(pEmd.value), verdict: emdV.verdict, note: emdV.note });
    } else {
      criteria.push({ id: 'emd', label: 'EMD capacity', required: '—', actual: fmtShort(pEmd.value), verdict: 'pass', note: 'No EMD stated in tender (verify NIT — MSE/Startup may be exempt).' });
    }

    if (cat.value) {
      var cm = pcat.value.toLowerCase() === cat.value.toLowerCase();
      criteria.push({ id: 'category', label: 'Bidder category', required: cat.value, actual: pcat.value || '—', verdict: cm ? 'pass' : 'fail', note: cm ? 'Category matches.' : 'Tender requires category "' + cat.value + '" — yours differs.' });
    }
    if (reg.value) {
      var rm = pcat.value || preg.value;
      var rmOk = preg.value.toLowerCase().indexOf(reg.value.toLowerCase()) !== -1 || pcat.value.toLowerCase().indexOf(reg.value.toLowerCase()) !== -1;
      criteria.push({ id: 'registration', label: 'Registration required', required: reg.value, actual: rm || '—', verdict: rmOk ? 'pass' : 'fail', note: rmOk ? 'Registration stated.' : 'State the required registration in your profile (e.g. NSIC/MSE/Udyam).' });
    }

    var fails = criteria.filter(function (c) { return c.verdict === 'fail'; });
    var marginals = criteria.filter(function (c) { return c.verdict === 'marginal'; });
    var passes = criteria.filter(function (c) { return c.verdict === 'pass'; });
    var status = fails.length ? 'no-go' : marginals.length ? 'marginal' : 'eligible';
    var score = criteria.length ? Math.round((passes.length + 0.5 * marginals.length) / criteria.length * 100) : 100;
    var gaps = fails.concat(marginals).map(function (c) {
      return { criterion: c.label, required: c.required, actual: c.actual, verdict: c.verdict, note: c.note };
    });

    return {
      ok: true, status: status, score: score,
      counts: { pass: passes.length, marginal: marginals.length, fail: fails.length, total: criteria.length },
      criteria: criteria, gaps: gaps
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
    assess: assess, verdictNumeric: verdictNumeric, fmtShort: fmtShort,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'tender-eligibility-checker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('e-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function statusBadge(status) {
    if (status === 'eligible') return '<span class="badge b-ok">ELIGIBLE</span>';
    if (status === 'marginal') return '<span class="badge b-warn">MARGINAL</span>';
    return '<span class="badge b-bad">NO-GO</span>';
  }

  function renderResult(r) {
    var card = $('e-result-card');
    card.hidden = false;
    var html = '<p>Verdict: ' + statusBadge(r.status) + ' <span class="vq-hint">score ' + r.score + '/100 · ' +
      r.counts.pass + ' pass · ' + r.counts.marginal + ' marginal · ' + r.counts.fail + ' fail</span></p>';
    html += '<table class="vq-table"><thead><tr><th>Criterion</th><th>Required</th><th>Yours</th><th>Verdict</th></tr></thead><tbody>';
    r.criteria.forEach(function (c) {
      var b = c.verdict === 'pass' ? '<span class="badge b-ok">pass</span>'
        : c.verdict === 'marginal' ? '<span class="badge b-warn">marginal</span>'
        : '<span class="badge b-bad">fail</span>';
      html += '<tr><td>' + esc(c.label) + '<br><span class="vq-hint">' + esc(c.note) + '</span></td>' +
        '<td>' + esc(c.required) + '</td><td>' + esc(c.actual) + '</td><td>' + b + '</td></tr>';
    });
    html += '</tbody></table>';
    if (r.gaps.length) {
      html += '<h3>Gaps to fix</h3><ul class="assump">';
      r.gaps.forEach(function (g) {
        html += '<li><strong>' + esc(g.criterion) + '</strong> (' + esc(g.verdict) + '): ' + esc(g.note) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">All criteria met — you can bid with confidence. Still read the full NIT for technical specs.</p>';
    }
    html += '<p class="vq-hint">Heuristic only — tender committees decide on the documents you submit. Confirm with your CA/consultant.</p>';
    $('e-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'tender-eligibility-checker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'tender-eligibility-checker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I check if I am eligible for a government tender?', a: 'Compare the tender\u2019s minimum criteria — average annual turnover, years of experience, similar past contracts, EMD capacity and category — against your profile. This tool marks each criterion pass, marginal (within 10% shortfall) or fail, and gives an overall eligible/marginal/no-go verdict.' },
      { q: 'टेंडर एलिजिबिलिटी कैसे चेक करें?', a: 'टेंडर के न्यूनतम मानदंड — औसत वार्षिक टर्नओवर, अनुभव के वर्ष, समान कार्य, EMD क्षमता और श्रेणी — अपनी प्रोफ़ाइल से मिलाएँ। टूल हर बिंदु पर pass/marginal/fail बताता है।' },
      { q: 'What does a marginal verdict mean?', a: 'You are within 10% of a numeric requirement — bidding is possible but risky, since evaluation committees apply criteria strictly. Consider bidding only if other strengths compensate, and confirm with your consultant.' },
      { q: 'क्या MSE/Startup को EMD में छूट मिलती है?', a: 'हाँ — कई सरकारी टेंडरों में NSIC/MSE/Udyam या Startup India पंजीकृत बोलीदाताओं को EMD छूट मिलती है (Bid Securing Declaration के साथ)। NIT में छूट शर्त ज़रूर जाँचें।' },
      { q: 'Is this eligibility verdict official?', a: 'No — it is a self-assessment heuristic. Only the tender evaluation committee\u2019s decision counts. Confirm with your CA/consultant before spending on EMD and bid preparation.' }
    ]);

    $('e-check').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('e-gate'), SLUG, FREE_LIMIT); $('e-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = assess(
        {
          minTurnover: $('e-min-turn').value, minExperience: $('e-min-exp').value,
          minContracts: $('e-min-con').value, emd: $('e-emd').value,
          category: $('e-cat').value, registration: $('e-reg').value
        },
        {
          turnover: $('e-turn').value, experience: $('e-exp').value,
          contracts: $('e-con').value, emdCapacity: $('e-emdcap').value,
          category: $('e-pcat').value, registration: $('e-preg').value
        }
      );
      if (!r.ok) { msg(r.error, false); $('e-result-card').hidden = true; return; }
      msg('Checked. ' + gate.remaining + ' free use(s) left today.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
