/* ============================================================
   VisionQuantech Business Suite — PF Compliance Checker
   apps/pf-compliance-checker/app.js

   Pure functions first (no DOM) — tested under node.
   Interactive EPF checklist (6 checks): applicability (20+
   employees), 12% contribution math, wage ceiling Rs 25,000
   w.e.f. 17-09-2026 (S.O. 5109(E), superseding the Rs 15,000
   ceiling), employer split 8.33% EPS + 3.67% EPF, EDLI 0.5% +
   admin 0.5%, due date 15th, UAN/KYC. Stateless: nothing stored.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CEILING = 25000;              // w.e.f. 17-09-2026, S.O. 5109(E)
  var CEILING_BEFORE = 15000;       // before 17-09-2026
  var CEILING_DATE = '17 September 2026';
  var APPLICABILITY_HEADCOUNT = 20;
  var DUE_DAY = 15;

  function validateCount(v) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Enter a whole number.' };
    if (n < 0) return { ok: false, error: 'Employee count cannot be negative.' };
    if (n > 1000000) return { ok: false, error: 'Employee count looks too large.' };
    return { ok: true, value: n };
  }

  function validateWage(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid wage amount.' };
    if (n < 0) return { ok: false, error: 'Wage cannot be negative.' };
    if (n > 10000000) return { ok: false, error: 'Wage looks too large.' };
    return { ok: true, value: n };
  }

  function validateRate(v, label) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid ' + label + '.' };
    if (n < 0 || n > 100) return { ok: false, error: label + ' must be between 0 and 100.' };
    return { ok: true, value: n };
  }

  /**
   * Contribution math on PF wages (Basic + DA), capped at the ceiling.
   * Returns {capped, employee, eps, epf, employerTotal, edli, admin}.
   */
  function pfMath(wage, ceiling) {
    var w = validateWage(wage);
    if (!w.ok) return w;
    ceiling = ceiling || CEILING;
    var capped = Math.min(w.value, ceiling);
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    var emp = r2(capped * 0.12);
    var eps = Math.round(capped * 0.0833);      // EPFO rounds EPS to the nearest rupee
    var epf = Math.round(capped * 0.12) - eps; // employer EPF = 12% - EPS, keeps totals exact
    return {
      ok: true, capped: capped, ceiling: ceiling,
      employee: emp,
      eps: eps, epf: epf, employerTotal: eps + epf,
      edli: r2(capped * 0.005), admin: r2(capped * 0.005)
    };
  }

  function yn(v) { return String(v) === 'yes'; }

  /**
   * Run the 6 checks. inp: {empCount, registered, pfWage, eeRate,
   * erRate, splitOk, dueOk, uan, kyc}. Each check: {id, title,
   * status: 'pass'|'fail'|'warn', detail}.
   */
  function pfChecks(inp) {
    var ec = validateCount(inp.empCount);
    if (!ec.ok) return { ok: false, error: 'Employees: ' + ec.error };
    var pw = validateWage(inp.pfWage);
    if (!pw.ok) return { ok: false, error: 'PF wages: ' + pw.error };
    var ee = validateRate(inp.eeRate, 'employee rate');
    if (!ee.ok) return { ok: false, error: ee.error };
    var er = validateRate(inp.erRate, 'employer rate');
    if (!er.ok) return { ok: false, error: er.error };

    var checks = [];

    // 1. Applicability
    if (ec.value >= APPLICABILITY_HEADCOUNT) {
      checks.push(yn(inp.registered)
        ? { id: 'applicability', title: 'Applicability — 20+ employees', status: 'pass',
            detail: 'With ' + ec.value + ' employees you are mandatorily covered. Once the Act applies, it keeps applying even if headcount later falls below 20.' }
        : { id: 'applicability', title: 'Applicability — 20+ employees', status: 'fail',
            detail: 'With ' + ec.value + ' employees, EPFO registration is MANDATORY. Register on the EPFO Unified Portal immediately — delays attract interest and damages.' });
    } else {
      checks.push(yn(inp.registered)
        ? { id: 'applicability', title: 'Applicability — under 20 employees', status: 'pass',
            detail: 'Under 20 employees, registration is voluntary — but since you are registered, all EPF rules apply to you (once covered, always covered).' }
        : { id: 'applicability', title: 'Applicability — under 20 employees', status: 'pass',
            detail: 'Under 20 employees, EPFO registration is not mandatory. Note: certain scheduled industries and voluntary coverage differ — confirm with your CA.' });
    }

    // 2. Wage ceiling
    var m = pfMath(pw.value);
    checks.push({
      id: 'ceiling', title: 'Wage ceiling — ₹25,000 (w.e.f. ' + CEILING_DATE + ')', status: 'pass',
      detail: 'On PF wages of ₹' + pw.value.toLocaleString('en-IN') + '/month, contributions are computed on ₹' +
        m.capped.toLocaleString('en-IN') + ' (capped at ₹25,000). Max: ₹3,000 employee + ₹3,000 employer per month. ' +
        'Rule change: the ceiling was ₹15,000 before ' + CEILING_DATE + ' (S.O. 5109(E)).'
    });

    // 3. Contribution rate 12%
    if (ee.value === 12 && er.value === 12) {
      checks.push({ id: 'rate', title: 'Contribution rate — 12% + 12%', status: 'pass',
        detail: 'Correct: 12% employee + 12% employer on PF wages (Basic + DA).' });
    } else {
      checks.push({ id: 'rate', title: 'Contribution rate — 12% + 12%', status: 'fail',
        detail: 'Statutory rate is 12% employee + 12% employer. You entered ' + ee.value + '% / ' + er.value + '%. ' +
          'Lower rates apply only in notified cases — confirm with your CA before deviating.' });
    }

    // 4. Employer split + charges
    if (yn(inp.splitOk)) {
      checks.push({ id: 'split', title: 'Employer split & charges', status: 'pass',
        detail: 'Employer 12% = 8.33% EPS (₹' + m.eps.toLocaleString('en-IN') + ') + 3.67% EPF (₹' + m.epf.toLocaleString('en-IN') +
          ') at these wages, plus 0.5% EDLI (₹' + m.edli.toLocaleString('en-IN') + ') and 0.5% admin (₹' + m.admin.toLocaleString('en-IN') + ').' });
    } else {
      checks.push({ id: 'split', title: 'Employer split & charges', status: 'fail',
        detail: 'The employer 12% must split into 8.33% EPS + 3.67% EPF (EPS always capped at the wage ceiling), plus 0.5% EDLI and 0.5% admin charges. Fix your payroll mapping.' });
    }

    // 5. Due date
    checks.push(yn(inp.dueOk)
      ? { id: 'duedate', title: 'Due date — 15th of next month', status: 'pass',
          detail: 'Contributions + ECR are due by the 15th of the following month. Keep it up — late deposits attract 12% p.a. interest plus damages of 5–25%.' }
      : { id: 'duedate', title: 'Due date — 15th of next month', status: 'fail',
          detail: 'ECR + payment are due by the 15th of the following month, every month. Late payment attracts interest (12% p.a.) and damages (5–25% of arrears). Set a calendar reminder.' });

    // 6. UAN + KYC
    var uan = yn(inp.uan), kyc = yn(inp.kyc);
    if (uan && kyc) {
      checks.push({ id: 'uankyc', title: 'UAN & KYC', status: 'pass',
        detail: 'UANs generated and KYC seeded — withdrawals, transfers and claims can process.' });
    } else if (uan || kyc) {
      checks.push({ id: 'uankyc', title: 'UAN & KYC', status: 'warn',
        detail: (uan ? 'UANs exist but KYC is incomplete.' : 'KYC started but UANs are missing.') + ' Claims and transfers will stall until both are done.' });
    } else {
      checks.push({ id: 'uankyc', title: 'UAN & KYC', status: 'fail',
        detail: 'Generate a UAN for every eligible employee and seed Aadhaar/bank/PAN KYC. Without this, settlements and claims cannot be processed.' });
    }

    var passed = checks.filter(function (c) { return c.status === 'pass'; }).length;
    return { ok: true, checks: checks, passed: passed, total: checks.length };
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
    CEILING: CEILING, CEILING_BEFORE: CEILING_BEFORE, CEILING_DATE: CEILING_DATE,
    pfMath: pfMath, pfChecks: pfChecks, validateCount: validateCount,
    validateWage: validateWage, validateRate: validateRate,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'pf-compliance-checker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('pf-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }

  function renderResults(r, wage) {
    $('pf-result-card').hidden = false;
    $('pf-score').textContent = r.passed + ' / ' + r.total + ' checks passed';
    var fails = r.checks.filter(function (c) { return c.status === 'fail'; }).length;
    var warns = r.checks.filter(function (c) { return c.status === 'warn'; }).length;
    $('pf-verdict').textContent = fails ? '— fix the failed items urgently.'
      : warns ? '— mostly compliant; clear the warnings.' : '— looking compliant. Re-check monthly.';

    var m = pfMath(wage);
    $('pf-sample').innerHTML = '<p class="vq-hint">Sample math on ₹' + Number(wage).toLocaleString('en-IN') +
      '/month PF wages (capped ₹' + m.capped.toLocaleString('en-IN') + '):</p>' +
      '<div class="vq-table-wrap"><table class="vq-table"><tbody>' +
      '<tr><td>Employee share (12%)</td><td style="text-align:right"><strong>' + fmtINR(m.employee) + '</strong></td></tr>' +
      '<tr><td>Employer → EPS pension (8.33%)</td><td style="text-align:right">' + fmtINR(m.eps) + '</td></tr>' +
      '<tr><td>Employer → EPF (3.67%)</td><td style="text-align:right">' + fmtINR(m.epf) + '</td></tr>' +
      '<tr><td>EDLI insurance (0.5%)</td><td style="text-align:right">' + fmtINR(m.edli) + '</td></tr>' +
      '<tr><td>Admin charges (0.5%)</td><td style="text-align:right">' + fmtINR(m.admin) + '</td></tr>' +
      '</tbody></table></div>';

    $('pf-results').innerHTML = r.checks.map(function (c) {
      var b = c.status === 'pass' ? 'b-pass' : c.status === 'fail' ? 'b-fail' : 'b-warn';
      return '<div class="chk ' + c.status + '"><span class="badge ' + b + '">' +
        c.status.toUpperCase() + '</span><h3>' + esc(c.title) + '</h3><p>' + esc(c.detail) + '</p></div>';
    }).join('') + '<p class="vq-hint">Self-check only — confirm with your CA / PF consultant. Rule change noted: ceiling ₹25,000 w.e.f. 17 Sep 2026.</p>';
    $('pf-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'pf-compliance-checker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'pf-compliance-checker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'When is PF registration mandatory?', a: 'Establishments with 20 or more employees (in scheduled industries) must register with EPFO. Once the Act applies, it keeps applying even if headcount later falls below 20.' },
      { q: 'पीएफ कब अनिवार्य है?', a: '20 या अधिक कर्मचारियों वाले प्रतिष्ठानों के लिए EPFO पंजीकरण अनिवार्य है। एक बार लागू होने के बाद, कर्मचारियों की संख्या घटने पर भी यह लागू रहता है।' },
      { q: 'What is the current PF wage ceiling?', a: '₹25,000/month w.e.f. 17 September 2026 (S.O. 5109(E)) — raised from ₹15,000. At the ceiling, each side contributes ₹3,000/month (12%).' },
      { q: 'By when must PF be deposited?', a: 'Contributions and the ECR are due by the 15th of the following month via the EPFO Unified Portal. Late payment attracts interest and damages.' },
      { q: 'Why do UAN and KYC matter?', a: 'Every eligible employee needs a Universal Account Number (UAN); Aadhaar/bank/PAN KYC seeded against it is required for withdrawals, transfers and claims.' },
      { q: 'Is this official compliance advice?', a: 'No — this is a self-check for awareness. Confirm your position with a CA or PF consultant.' }
    ]);

    $('pf-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('pf-gate'), SLUG, FREE_LIMIT); $('pf-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = pfChecks({
        empCount: $('pf-empcount').value, registered: $('pf-registered').value,
        pfWage: $('pf-pfwage').value, eeRate: $('pf-eerate').value, erRate: $('pf-errate').value,
        splitOk: $('pf-split').value, dueOk: $('pf-duedate').value,
        uan: $('pf-uan').value, kyc: $('pf-kyc').value
      });
      if (!r.ok) { msg(r.error, false); $('pf-result-card').hidden = true; return; }
      msg('', true);
      renderResults(r, $('pf-pfwage').value);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
