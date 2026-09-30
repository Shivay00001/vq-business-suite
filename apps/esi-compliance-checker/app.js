/* ============================================================
   VisionQuantech Business Suite — ESI Compliance Checker
   apps/esi-compliance-checker/app.js

   Pure functions first (no DOM) — tested under node.
   Interactive ESIC checklist (6 checks): applicability (10+
   employees in notified areas), wage ceiling Rs 21,000
   (Rs 25,000 for persons with disabilities), contribution
   rates 0.75% employee / 3.25% employer (since Jul 2019), due
   date 15th, new-joiner IP registration (10 days), half-yearly
   returns (11 Nov / 12 May). Stateless: nothing stored.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CEILING = 21000;
  var CEILING_DISABLED = 25000;
  var EE_RATE = 0.0075, ER_RATE = 0.0325;
  var APPLICABILITY_HEADCOUNT = 10;
  var DAILY_WAGE_EXEMPT = 176; // avg daily wage: employee share exempt

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

  /**
   * ESI math on gross monthly wages. Returns zeros + covered:false
   * when wages exceed the ceiling (employee exits coverage).
   */
  function esiMath(gross) {
    var w = validateWage(gross);
    if (!w.ok) return w;
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    if (w.value > CEILING) {
      return { ok: true, covered: false, employee: 0, employer: 0, total: 0,
               note: 'Gross wages exceed ₹' + CEILING.toLocaleString('en-IN') + ' — not covered under ESI.' };
    }
    var ee = r2(w.value * EE_RATE), er = r2(w.value * ER_RATE);
    return { ok: true, covered: true, employee: ee, employer: er, total: r2(ee + er) };
  }

  function yn(v) { return String(v) === 'yes'; }

  /**
   * Run the 6 checks. inp: {empCount, area, registered, ceilingOk,
   * gross, ratesOk, dueOk, joinerOk, returnsOk}.
   */
  function esiChecks(inp) {
    var ec = validateCount(inp.empCount);
    if (!ec.ok) return { ok: false, error: 'Employees: ' + ec.error };
    var g = validateWage(inp.gross);
    if (!g.ok) return { ok: false, error: 'Gross wage: ' + g.error };

    var checks = [];
    var area = String(inp.area);

    // 1. Applicability
    if (ec.value >= APPLICABILITY_HEADCOUNT && area === 'yes') {
      checks.push(yn(inp.registered)
        ? { id: 'applicability', title: 'Applicability — 10+ employees, notified area', status: 'pass',
            detail: 'With ' + ec.value + ' employees in a notified area, ESIC registration is mandatory (register within 15 days of eligibility). Once registered, coverage continues even if headcount drops below 10.' }
        : { id: 'applicability', title: 'Applicability — 10+ employees, notified area', status: 'fail',
            detail: 'With ' + ec.value + ' employees in a notified area, registration on the ESIC portal is MANDATORY. Register immediately — ESI is the #1 source of labour-department notices.' });
    } else if (area === 'unsure') {
      checks.push({ id: 'applicability', title: 'Applicability — area notification unknown', status: 'warn',
        detail: 'ESI applies only in areas notified under the Act (threshold is 10 employees; 20 in some states such as Maharashtra/Chandigarh for certain establishments). Check the ESIC notification for your district before concluding.' });
    } else if (ec.value >= APPLICABILITY_HEADCOUNT) {
      checks.push({ id: 'applicability', title: 'Applicability — 10+ employees, non-notified area', status: 'warn',
        detail: 'You have ' + ec.value + ' employees but the area is not ESI-notified, so registration is not currently required. Re-check when ESIC extends coverage to your area.' });
    } else {
      checks.push({ id: 'applicability', title: 'Applicability — under 10 employees', status: 'pass',
        detail: 'Under 10 employees, ESIC registration is not mandatory. Voluntary coverage is possible — confirm with your consultant.' });
    }

    // 2. Wage ceiling
    checks.push(yn(inp.ceilingOk)
      ? { id: 'ceiling', title: 'Wage ceiling — ₹21,000 (₹25,000 disabled)', status: 'pass',
          detail: 'All employees with gross wages ≤ ₹21,000/month (≤ ₹25,000 for persons with disabilities) are covered. Anyone crossing the ceiling exits from the next contribution period.' }
      : { id: 'ceiling', title: 'Wage ceiling — ₹21,000 (₹25,000 disabled)', status: 'fail',
          detail: 'Every employee with gross wages ≤ ₹21,000/month (≤ ₹25,000 for persons with disabilities) MUST be covered. Audit your payroll — uncovered employees mean short payment and penalties.' });

    // 3. Rates
    var m = esiMath(g.value);
    checks.push(yn(inp.ratesOk)
      ? { id: 'rates', title: 'Contribution rates — 0.75% / 3.25%', status: 'pass',
          detail: 'Correct: 0.75% employee + 3.25% employer = 4% of gross wages (unchanged since July 2019). On ₹' + g.value.toLocaleString('en-IN') +
            ': employee ₹' + m.employee.toLocaleString('en-IN') + ', employer ₹' + m.employer.toLocaleString('en-IN') +
            (m.covered ? '.' : ' (above ceiling — not coverable).') +
            ' Employees averaging ≤ ₹176/day are exempt from the employee share (employer still pays).' }
      : { id: 'rates', title: 'Contribution rates — 0.75% / 3.25%', status: 'fail',
          detail: 'Deduct 0.75% from the employee and add 3.25% as employer share on gross wages (4% total). The employer remits both together. Fix your payroll mapping.' });

    // 4. Due date
    checks.push(yn(inp.dueOk)
      ? { id: 'duedate', title: 'Due date — 15th of next month', status: 'pass',
          detail: 'Monthly contributions are due by the 15th of the following month via the ESIC portal (NIL declaration still due on the 15th in months with no coverable employees).' }
      : { id: 'duedate', title: 'Due date — 15th of next month', status: 'fail',
          detail: 'Contributions are due by the 15th of the following month, every month. Late payment attracts interest and damages — set a calendar reminder.' });

    // 5. New joiner IP registration
    checks.push(yn(inp.joinerOk)
      ? { id: 'joiner', title: 'New joiners — IP registration in 10 days', status: 'pass',
          detail: 'Every eligible new joiner is registered as an Insured Person within 10 days of joining. Keep the habit — backdated coverage is not allowed.' }
      : { id: 'joiner', title: 'New joiners — IP registration in 10 days', status: 'fail',
          detail: 'Every eligible new joiner must be registered as an Insured Person within 10 days of joining. Add this to your onboarding checklist.' });

    // 6. Half-yearly returns
    checks.push(yn(inp.returnsOk)
      ? { id: 'returns', title: 'Half-yearly returns — 11 Nov / 12 May', status: 'pass',
          detail: 'Returns filed for Apr–Sep (due 11 Nov) and Oct–Mar (due 12 May).' }
      : { id: 'returns', title: 'Half-yearly returns — 11 Nov / 12 May', status: 'fail',
          detail: 'Half-yearly returns are due 11 November (Apr–Sep period) and 12 May (Oct–Mar period). File any pending returns now.' });

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
    CEILING: CEILING, CEILING_DISABLED: CEILING_DISABLED,
    EE_RATE: EE_RATE, ER_RATE: ER_RATE,
    esiMath: esiMath, esiChecks: esiChecks,
    validateCount: validateCount, validateWage: validateWage,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'esi-compliance-checker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('esi-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }

  function renderResults(r, gross) {
    $('esi-result-card').hidden = false;
    $('esi-score').textContent = r.passed + ' / ' + r.total + ' checks passed';
    var fails = r.checks.filter(function (c) { return c.status === 'fail'; }).length;
    var warns = r.checks.filter(function (c) { return c.status === 'warn'; }).length;
    $('esi-verdict').textContent = fails ? '— fix the failed items urgently.'
      : warns ? '— mostly compliant; clear the warnings.' : '— looking compliant. Re-check monthly.';

    var m = esiMath(gross);
    $('esi-sample').innerHTML = '<p class="vq-hint">Sample math on ₹' + Number(gross).toLocaleString('en-IN') + '/month gross wages:</p>' +
      '<div class="vq-table-wrap"><table class="vq-table"><tbody>' +
      (m.covered
        ? '<tr><td>Employee share (0.75%)</td><td style="text-align:right"><strong>' + fmtINR(m.employee) + '</strong></td></tr>' +
          '<tr><td>Employer share (3.25%)</td><td style="text-align:right"><strong>' + fmtINR(m.employer) + '</strong></td></tr>' +
          '<tr><td>Total contribution (4%)</td><td style="text-align:right"><strong>' + fmtINR(m.total) + '</strong></td></tr>'
        : '<tr><td colspan="2">Above the ₹21,000 ceiling — ' + esc(m.note) + '</td></tr>') +
      '</tbody></table></div>';

    $('esi-results').innerHTML = r.checks.map(function (c) {
      var b = c.status === 'pass' ? 'b-pass' : c.status === 'fail' ? 'b-fail' : 'b-warn';
      return '<div class="chk ' + c.status + '"><span class="badge ' + b + '">' +
        c.status.toUpperCase() + '</span><h3>' + esc(c.title) + '</h3><p>' + esc(c.detail) + '</p></div>';
    }).join('') + '<p class="vq-hint">Self-check only — confirm with your CA / ESI consultant.</p>';
    $('esi-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'esi-compliance-checker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'esi-compliance-checker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'When is ESI registration mandatory?', a: 'Non-seasonal factories/establishments with 10 or more employees in an ESI-notified area must register within 15 days of becoming eligible. Once registered, coverage continues even if headcount drops.' },
      { q: 'ईएसआई पंजीकरण कब अनिवार्य है?', a: 'ईएसआई-लागू क्षेत्र में 10 या अधिक कर्मचारियों वाले कारखानों/प्रतिष्ठानों के लिए पंजीकरण अनिवार्य है।' },
      { q: 'What are the ESI contribution rates?', a: '0.75% of gross wages from the employee and 3.25% from the employer — 4% total, unchanged since July 2019.' },
      { q: 'Who is covered under ESI?', a: 'Employees with gross monthly wages up to ₹21,000 (₹25,000 for persons with disabilities).' },
      { q: 'By when must ESI be deposited?', a: 'By the 15th of the following month through the ESIC portal; half-yearly returns due 11 November and 12 May.' },
      { q: 'Is this official compliance advice?', a: 'No — this is a self-check for awareness. Confirm your position with a CA or ESI consultant.' }
    ]);

    $('esi-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('esi-gate'), SLUG, FREE_LIMIT); $('esi-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = esiChecks({
        empCount: $('esi-empcount').value, area: $('esi-area').value,
        registered: $('esi-registered').value, ceilingOk: $('esi-ceiling-ok').value,
        gross: $('esi-gross').value, ratesOk: $('esi-rates-ok').value,
        dueOk: $('esi-duedate').value, joinerOk: $('esi-joiner').value,
        returnsOk: $('esi-returns').value
      });
      if (!r.ok) { msg(r.error, false); $('esi-result-card').hidden = true; return; }
      msg('', true);
      renderResults(r, $('esi-gross').value);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
