#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 3, Team F (8 HR & payroll tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-f-hr-payroll-tests.js
 */
'use strict';

var path = require('path');
var APPS = path.join(__dirname, '..', 'apps');

function req(slug) { return require(path.join(APPS, slug, 'app.js')); }

var results = [];
function t(app, name, fn) {
  try {
    var r = fn(); // returns true, or {pass, detail}
    var pass = r === true || (r && r.pass);
    var detail = (r && r.detail) || '';
    results.push({ app: app, name: name, pass: !!pass, detail: detail });
  } catch (err) {
    results.push({ app: app, name: name, pass: false, detail: 'THREW: ' + err.message });
  }
}
function eq(a, b) { return Math.abs(a - b) < 0.011; }

/* ============ 1. attendance-register ============ */
(function () {
  var A = req('attendance-register');
  var slug = 'attendance-register';

  t(slug, 'monthly summary: P + 0.5*HD present-equivalent', function () {
    var s = {};
    var emp = { id: 'e1', name: 'Asha', code: 'E01' };
    var r = A.setDayMarks(s, '2026-09-01', { e1: 'P' }); if (!r.ok) return { pass: false, detail: r.error };
    var r2 = A.setDayMarks(r.store, '2026-09-02', { e1: 'HD' }); if (!r2.ok) return { pass: false, detail: r2.error };
    var r3 = A.setDayMarks(r2.store, '2026-09-03', { e1: 'A' }); if (!r3.ok) return { pass: false, detail: r3.error };
    var ms = A.monthlySummary(r3.store, [emp], '2026-09');
    var row = ms.rows[0];
    return { pass: ms.ok && row.present === 1 && row.halfday === 1 && row.absent === 1 &&
      eq(row.presentEquiv, 1.5), detail: 'presentEquiv=' + row.presentEquiv };
  });

  t(slug, 'ADVERSARIAL: invalid status values are silently dropped (no crash, no injection)', function () {
    var r = A.setDayMarks({}, '2026-09-01', { e1: '<script>P</script>', e2: 'ZZ' });
    return { pass: r.ok && Object.keys(r.store['2026-09-01']).length === 0, detail: 'day keys=' + JSON.stringify(Object.keys(r.store['2026-09-01'])) };
  });

  t(slug, 'ADVERSARIAL: 26th employee rejected (max 25)', function () {
    var list = [];
    for (var i = 0; i < 25; i++) {
      var r = A.addEmployee(list, 'Emp' + i, 'E' + i);
      list.push(r.employee);
    }
    var last = A.addEmployee(list, 'Extra', 'EX');
    return { pass: !last.ok && /limit/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });

  t(slug, 'ADVERSARIAL: invalid date rejected', function () {
    var r = A.setDayMarks({}, '2026-13-40', { e1: 'P' });
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 2. leave-tracker ============ */
(function () {
  var L = req('leave-tracker');
  var slug = 'leave-tracker';
  var st, empId = 'e1';

  t(slug, 'apply + approve deducts EL balance correctly', function () {
    st = { quotas: L.defaultQuotas(), ledger: [] };
    var ap = L.applyLeave(st, empId, 'EL', '2026-10-01', '2026-10-03', 'family');
    if (!ap.ok) return { pass: false, detail: ap.error };
    var ok = L.approveLeave(ap.state, ap.entry.id);
    var b = L.balances(ap.state, empId, 2026);
    return { pass: ok.ok && b.EL.balance === 12 && b.EL.availed === 3, detail: 'EL balance=' + b.EL.balance + ' availed=' + b.EL.availed };
  });

  t(slug, 'ADVERSARIAL: approval blocked when balance exhausted by earlier approvals', function () {
    // Two pending requests totalling more than quota: approval of the
    // second must fail once the first is approved.
    var s2 = { quotas: { CL: 5, SL: 12, EL: 15 }, ledger: [] };
    var b = L.applyLeave(s2, empId, 'CL', '2026-11-10', '2026-11-11', 'y'); // 2 days, pending
    if (!b.ok) return { pass: false, detail: 'setup B: ' + b.error };
    var c = L.applyLeave(b.state, empId, 'CL', '2026-11-20', '2026-11-23', 'z'); // 4 days, pending
    if (!c.ok) return { pass: false, detail: 'setup C: ' + c.error };
    var apc = L.approveLeave(c.state, c.entry.id); // 4 approved -> 1 left
    if (!apc.ok) return { pass: false, detail: 'approve C: ' + apc.error };
    var apb = L.approveLeave(c.state, b.entry.id); // 2 days > 1 left -> blocked
    return { pass: !apb.ok && /Cannot approve/.test(apb.error), detail: apb.ok ? 'approved!' : apb.error };
  });

  t(slug, 'ADVERSARIAL: oversized reason rejected (>200 chars)', function () {
    var r = L.applyLeave({ quotas: L.defaultQuotas(), ledger: [] }, empId, 'CL', '2026-12-01', '2026-12-01', 'x'.repeat(500));
    return { pass: !r.ok && /too long/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: reversed date range rejected', function () {
    var r = L.applyLeave({ quotas: L.defaultQuotas(), ledger: [] }, empId, 'SL', '2026-12-10', '2026-12-01', 'sick');
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 3. overtime-calculator ============ */
(function () {
  var O = req('overtime-calculator');
  var slug = 'overtime-calculator';

  t(slug, 'OT pay: 10 hrs x Rs 250 x 2x = Rs 5000', function () {
    var r = O.otPay(10, 250, 2);
    return { pass: r.ok && eq(r.value, 5000), detail: 'value=' + r.value };
  });

  t(slug, 'hourly derivation from salary /208 with statutory 2x note', function () {
    var h = O.hourlyFromSalary(26000);
    var pay = O.otPay(5, h.value, 2);
    return { pass: h.ok && eq(h.value, 125) && pay.ok && eq(pay.value, 1250), detail: 'hourly=' + h.value + ' pay=' + pay.value };
  });

  t(slug, 'ADVERSARIAL: negative hours rejected', function () {
    var r = O.otPay(-5, 250, 2);
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: multiplier outside {1,1.5,2} rejected', function () {
    var r = O.validateMultiplier(3);
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: 26th saved entry rejected (max 25)', function () {
    var entries = [];
    for (var i = 0; i < 25; i++) {
      var r = O.addEntry(entries, { name: 'Emp' + i, month: '2026-09', salary: 26000, hourly: '', hours: 2, multiplier: 2, category: 'factory' });
      entries = r.entries;
    }
    var last = O.addEntry(entries, { name: 'Extra', month: '2026-09', salary: 26000, hourly: '', hours: 2, multiplier: 2, category: 'factory' });
    return { pass: !last.ok && /full/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });
})();

/* ============ 4. gratuity-calculator ============ */
(function () {
  var G = req('gratuity-calculator');
  var slug = 'gratuity-calculator';

  t(slug, 'REQUIRED SAMPLE: Rs 30000 x 5 yrs = Rs 86538.46', function () {
    var r = G.calculate(30000, 5, 0, true, false);
    return { pass: r.ok && r.eligible && eq(r.payable, 86538.46), detail: 'payable=' + r.payable };
  });

  t(slug, 'part-year >6 months rounds up; <=6 does not', function () {
    var up = G.calculate(30000, 4, 7, true, false);   // 5 billable -> eligible
    var no = G.calculate(30000, 4, 6, true, false);   // 4 billable -> not eligible
    return { pass: up.ok && up.billable === 5 && up.eligible && no.ok && !no.eligible, detail: '7mo->' + up.billable + '/' + up.eligible + ', 6mo->' + no.billable + '/' + no.eligible };
  });

  t(slug, 'ADVERSARIAL: statutory Rs 20L cap enforced', function () {
    var r = G.calculate(500000, 40, 0, true, false); // raw = 500000*15*40/26 = 11.5cr
    return { pass: r.ok && r.capped === true && r.payable === 2000000, detail: 'payable=' + r.payable + ' capped=' + r.capped };
  });

  t(slug, 'ADVERSARIAL: negative salary rejected', function () {
    var r = G.calculate(-1000, 5, 0, true, false);
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'death/disablement overrides 5-year rule', function () {
    var r = G.calculate(30000, 1, 0, true, true);
    return { pass: r.ok && r.eligible && eq(r.payable, 17307.69), detail: 'payable=' + r.payable };
  });
})();

/* ============ 5. exit-settlement-calculator ============ */
(function () {
  var X = req('exit-settlement-calculator');
  var slug = 'exit-settlement-calculator';

  t(slug, 'full settlement nets correctly', function () {
    var r = X.settle({ name: 'Ravi Kumar', exitDate: '2026-09-30', basic: 30000, unpaidDays: 10, divisor: 26,
      elDays: 12, gratYears: 6, gratMonths: 0, gratManual: '', bonus: 5000, notice: 30000,
      advances: 2000, tds: 1000, other: 500 });
    // unpaid = 30000/26*10 = 11538.46; enc = 30000/26*12 = 13846.15; grat = 30000*15*6/26 = 103846.15
    var exp = 11538.46 + 13846.15 + 103846.15 + 5000 + 30000 - 2000 - 1000 - 500;
    return { pass: r.ok && eq(r.net, exp), detail: 'net=' + r.net + ' expected~' + Math.round(exp * 100) / 100 };
  });

  t(slug, 'ADVERSARIAL: negative deduction rejected', function () {
    var r = X.settle({ name: 'A', exitDate: '2026-09-30', basic: 30000, unpaidDays: 10, divisor: 26,
      elDays: 0, gratYears: 6, gratMonths: 0, gratManual: '', bonus: 0, notice: 0,
      advances: -500, tds: 0, other: 0 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: gratuity manual override cannot exceed Rs 20L cap', function () {
    var r = X.settle({ name: 'A', exitDate: '2026-09-30', basic: 30000, unpaidDays: 1, divisor: 26,
      elDays: 0, gratYears: 30, gratMonths: 0, gratManual: 5000000, bonus: 0, notice: 0,
      advances: 0, tds: 0, other: 0 });
    return { pass: !r.ok && /cap/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: divisor restricted to 26 or 30', function () {
    var r = X.settle({ name: 'A', exitDate: '2026-09-30', basic: 30000, unpaidDays: 10, divisor: 31,
      elDays: 0, gratYears: 6, gratMonths: 0, gratManual: '', bonus: 0, notice: 0,
      advances: 0, tds: 0, other: 0 });
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 6. pf-compliance-checker ============ */
(function () {
  var P = req('pf-compliance-checker');
  var slug = 'pf-compliance-checker';

  t(slug, 'Rs 25000 ceiling: ee=Rs 3000, EPS=Rs 2083, EPF=Rs 917, EDLI=Rs 125, admin=Rs 125', function () {
    var m = P.pfMath(25000);
    return { pass: m.ok && eq(m.employee, 3000) && eq(m.eps, 2083) && eq(m.epf, 917) &&
      eq(m.edli, 125) && eq(m.admin, 125), detail: 'ee=' + m.employee + ' eps=' + m.eps + ' epf=' + m.epf };
  });

  t(slug, 'wages above ceiling capped; compliant input -> all 6 pass', function () {
    var m = P.pfMath(60000);
    var r = P.pfChecks({ empCount: 25, registered: 'yes', pfWage: 60000, eeRate: 12, erRate: 12,
      splitOk: 'yes', dueOk: 'yes', uan: 'yes', kyc: 'yes' });
    return { pass: m.ok && m.capped === 25000 && r.ok && r.passed === 6, detail: 'capped=' + m.capped + ' passed=' + r.passed + '/6' };
  });

  t(slug, 'ADVERSARIAL: 20+ employees unregistered -> applicability FAIL', function () {
    var r = P.pfChecks({ empCount: 30, registered: 'no', pfWage: 15000, eeRate: 12, erRate: 12,
      splitOk: 'yes', dueOk: 'yes', uan: 'yes', kyc: 'yes' });
    var c = r.checks.filter(function (x) { return x.id === 'applicability'; })[0];
    return { pass: r.ok && c.status === 'fail', detail: 'status=' + c.status };
  });

  t(slug, 'ADVERSARIAL: negative headcount rejected', function () {
    var r = P.pfChecks({ empCount: -5, registered: 'yes', pfWage: 15000, eeRate: 12, erRate: 12,
      splitOk: 'yes', dueOk: 'yes', uan: 'yes', kyc: 'yes' });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 7. esi-compliance-checker ============ */
(function () {
  var E = req('esi-compliance-checker');
  var slug = 'esi-compliance-checker';

  t(slug, 'Rs 15000 gross: ee=Rs 112.5, er=Rs 487.5, total=Rs 600', function () {
    var m = E.esiMath(15000);
    return { pass: m.ok && m.covered && eq(m.employee, 112.5) && eq(m.employer, 487.5) && eq(m.total, 600),
      detail: 'ee=' + m.employee + ' er=' + m.employer + ' total=' + m.total };
  });

  t(slug, 'wages above Rs 21000 -> not covered; 10+ unregistered -> applicability FAIL', function () {
    var m = E.esiMath(25000);
    var r = E.esiChecks({ empCount: 12, area: 'yes', registered: 'no', ceilingOk: 'yes', gross: 15000,
      ratesOk: 'yes', dueOk: 'yes', joinerOk: 'yes', returnsOk: 'yes' });
    var c = r.checks.filter(function (x) { return x.id === 'applicability'; })[0];
    return { pass: m.ok && !m.covered && r.ok && c.status === 'fail', detail: 'covered=' + m.covered + ' app=' + c.status };
  });

  t(slug, 'ADVERSARIAL: negative gross wage rejected', function () {
    var m = E.esiMath(-100);
    return { pass: !m.ok && /negative/i.test(m.error), detail: m.ok ? 'accepted!' : m.error };
  });

  t(slug, 'ADVERSARIAL: non-numeric wage rejected', function () {
    var m = E.esiMath('abc');
    return { pass: !m.ok, detail: m.ok ? 'accepted!' : m.error };
  });
})();

/* ============ 8. minimum-wage-checker ============ */
(function () {
  var M = req('minimum-wage-checker');
  var slug = 'minimum-wage-checker';

  t(slug, 'Karnataka skilled Zone I = Rs 28285.47 (eff 2026-05-22)', function () {
    var r = M.findRate('Karnataka', 'General rates', 'Skilled', 'Zone I');
    return { pass: r.ok && eq(r.minimum, 28285.47) && r.eff === '2026-05-22', detail: 'min=' + r.minimum + ' eff=' + r.eff };
  });

  t(slug, 'Delhi unskilled official = Rs 19846; below wage -> shortfall', function () {
    var r = M.checkWage('Delhi', 'All scheduled employments', 'Unskilled', null, 19000);
    return { pass: r.ok && !r.compliant && eq(r.shortfall, 846), detail: 'compliant=' + r.compliant + ' shortfall=' + r.shortfall };
  });

  t(slug, 'compliant wage passes', function () {
    var r = M.checkWage('Telangana', 'General rates', 'Skilled', 'Zone I', 19000);
    return { pass: r.ok && r.compliant && r.shortfall === 0, detail: 'compliant=' + r.compliant };
  });

  t(slug, 'ADVERSARIAL: negative wage rejected', function () {
    var r = M.checkWage('Delhi', 'All scheduled employments', 'Unskilled', null, -500);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: unverified combo -> honest "not in dataset", never guessed', function () {
    var r = M.checkWage('Bihar', 'General rates', 'Unskilled', 'Zone I', 12000);
    return { pass: !r.ok && /not in our dataset/i.test(r.error), detail: r.ok ? 'guessed!' : r.error };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team F (8 HR & payroll) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
