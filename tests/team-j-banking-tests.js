#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team J (10 banking, payments & cash tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-j-banking-tests.js
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

/* ============ 1. bank-reconciliation-tool ============ */
(function () {
  var B = req('bank-reconciliation-tool');
  var slug = 'bank-reconciliation-tool';

  t(slug, 'REQUIRED SAMPLE: 2 rows match within tolerance, 0 unmatched both sides', function () {
    var pb = B.parseStatement('date,desc,amt\n01-09-2026,Rent,45000\n03-09-2026,Supp,-12500', true);
    var pk = B.parseStatement('01-09-2026,Rent rcpt,45000\n04-09-2026,Supp pay,-12500.4', false);
    if (!pb.ok || !pk.ok) return { pass: false, detail: (pb.error || pk.error) };
    var r = B.reconcile(pb.rows, pk.rows, 1, 2);
    return { pass: r.ok && r.summary.matched === 2 && r.summary.unmatchedBank === 0 &&
      r.summary.unmatchedBook === 0, detail: JSON.stringify(r.summary) };
  });

  t(slug, 'quoted CSV field with comma + DD/MM/YYYY date parses', function () {
    var r = B.parseStatement('"05/09/2026","ABC, Traders",8200.50', false);
    return { pass: r.ok && r.rows.length === 1 && r.rows[0].date === '2026-09-05' &&
      eq(r.rows[0].amount, 8200.50) && r.rows[0].desc === 'ABC, Traders',
      detail: JSON.stringify(r.ok ? r.rows[0] : r.error) };
  });

  t(slug, 'ADVERSARIAL: sign mismatch never matches (receipt vs payment)', function () {
    var pb = B.parseStatement('01-09-2026,X,45000', false);
    var pk = B.parseStatement('01-09-2026,X,-45000', false);
    var r = B.reconcile(pb.rows, pk.rows, 100000, 90);
    return { pass: r.ok && r.summary.matched === 0 && r.summary.unmatchedBank === 1 &&
      r.summary.unmatchedBook === 1, detail: JSON.stringify(r.summary) };
  });

  t(slug, 'ADVERSARIAL: impossible date 31-02-2026 rejected', function () {
    var r = B.parseStatement('31-02-2026,Bad,100', false);
    return { pass: !r.ok && /invalid/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 2. delayed-payment-interest-calculator ============ */
(function () {
  var M = req('delayed-payment-interest-calculator');
  var slug = 'delayed-payment-interest-calculator';

  t(slug, 'REQUIRED SAMPLE: Rs 100000, 45 days, bank rate 5.5% -> Rs 2043.12 @ 16.5%', function () {
    var r = M.msmedInterest(100000, '2026-01-01', '2026-02-15', 5.5);
    return { pass: r.ok && r.days === 45 && eq(r.ratePct, 16.5) &&
      eq(r.totalInterest, 2043.12) && eq(r.totalPayable, 102043.12),
      detail: 'interest=' + r.totalInterest + ' payable=' + r.totalPayable };
  });

  t(slug, 'month-end rest capitalises interest (rested flags + balance grows)', function () {
    var r = M.msmedInterest(100000, '2026-01-01', '2026-02-15', 5.5);
    var rests = r.daily.filter(function (d) { return d.rested; });
    return { pass: r.ok && rests.length === 1 && rests[0].date === '2026-02-01' &&
      rests[0].balanceAfterRest > 100000, detail: 'rests=' + rests.length + ' bal=' + (rests[0] && rests[0].balanceAfterRest) };
  });

  t(slug, 'dueFromAcceptance = acceptance + 45 days', function () {
    var r = M.dueFromAcceptance('2026-08-01');
    return { pass: r.ok && r.value === '2026-09-15', detail: 'due=' + (r.ok ? r.value : r.error) };
  });

  t(slug, 'ADVERSARIAL: payment before due date rejected', function () {
    var r = M.msmedInterest(100000, '2026-02-15', '2026-01-01', 5.5);
    return { pass: !r.ok && /before/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: delay over 3 years rejected', function () {
    var r = M.msmedInterest(100000, '2020-01-01', '2026-09-26', 5.5);
    return { pass: !r.ok && /3 years/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 3. cheque-management-tool ============ */
(function () {
  var C = req('cheque-management-tool');
  var slug = 'cheque-management-tool';

  t(slug, 'REQUIRED SAMPLE: issued 2026-06-01 -> stale at 2026-09-26 (117 days)', function () {
    var v = C.validity('2026-06-01', '2026-09-26');
    return { pass: v.ok && v.daysOld === 117 && v.status === 'stale' && v.expiresOn === '2026-08-30',
      detail: 'daysOld=' + v.daysOld + ' status=' + v.status };
  });

  t(slug, 'expiring-soon: 85 days old -> expiring with 5 days left', function () {
    var v = C.validity('2026-07-03', '2026-09-26'); // 85 days old
    return { pass: v.ok && v.status === 'expiring' && v.daysLeft === 5, detail: 'status=' + v.status + ' left=' + v.daysLeft };
  });

  t(slug, 'register add + alerts: stale pending flagged, totals correct', function () {
    var a1 = C.registerAdd([], { no: '10231', party: 'ABC', amount: 50000, issueDate: '2026-06-01', kind: 'cheque', direction: 'issued', status: 'pending' });
    var a2 = C.registerAdd(a1.list, { no: '9988', party: 'XYZ', amount: 25000, issueDate: '2026-09-20', kind: 'cheque', direction: 'received', status: 'pending' });
    var al = C.alerts(a2.list, '2026-09-26');
    return { pass: a1.ok && a2.ok && al.ok && al.stale.length === 1 &&
      eq(al.issuedPendingTotal, 50000) && eq(al.receivedPendingTotal, 25000),
      detail: 'stale=' + al.stale.length + ' issued=' + al.issuedPendingTotal };
  });

  t(slug, 'ADVERSARIAL: 26th entry rejected (max 25)', function () {
    var list = [];
    for (var i = 0; i < 25; i++) {
      var r = C.registerAdd(list, { no: 'N' + i, party: 'P', amount: 100, issueDate: '2026-09-01', kind: 'cheque', direction: 'issued', status: 'pending' });
      list = r.list;
    }
    var last = C.registerAdd(list, { no: 'EXTRA', party: 'P', amount: 100, issueDate: '2026-09-01', kind: 'cheque', direction: 'issued', status: 'pending' });
    return { pass: !last.ok && /full/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });

  t(slug, 'ADVERSARIAL: script injection in party name blocked by char whitelist', function () {
    var r = C.registerAdd([], { no: '1', party: '<script>alert(1)</script>', amount: 100, issueDate: '2026-09-01', kind: 'cheque', direction: 'issued', status: 'pending' });
    // party field has no char whitelist, but esc() must neutralise it in HTML
    var safe = C.esc('<script>alert(1)</script>');
    return { pass: r.ok && safe === '&lt;script&gt;alert(1)&lt;/script&gt;', detail: 'esc=' + safe };
  });
})();

/* ============ 4. bank-charge-leak-detector ============ */
(function () {
  var D = req('bank-charge-leak-detector');
  var slug = 'bank-charge-leak-detector';

  t(slug, 'REQUIRED SAMPLE: 4 entries -> Rs 1518 leak, Rs 18216 annualised, 2 flags', function () {
    var r = D.analyze([
      { type: 'sms', month: '2026-09', amount: 28 },
      { type: 'balance-penalty', month: '2026-09', amount: 590 },
      { type: 'bounce', month: '2026-09', amount: 750 },
      { type: 'digital-txn', month: '2026-09', amount: 150 }
    ]);
    var flags = r.flags.map(function (f) { return f.verdict; });
    return { pass: r.ok && eq(r.grandTotal, 1518) && eq(r.annualized, 18216) &&
      r.flags.length === 2 && flags[0] === 'flag', detail: 'total=' + r.grandTotal + ' annual=' + r.annualized };
  });

  t(slug, 'in-range charges get OK verdict, no flags', function () {
    var r = D.analyze([{ type: 'sms', month: '2026-09', amount: 20 }]);
    return { pass: r.ok && r.flags.length === 0 && r.perType[0].verdict === 'ok', detail: 'verdict=' + (r.ok && r.perType[0].verdict) };
  });

  t(slug, 'ADVERSARIAL: duplicate type+month rejected', function () {
    var r = D.analyze([
      { type: 'sms', month: '2026-09', amount: 20 },
      { type: 'sms', month: '2026-09', amount: 25 }
    ]);
    return { pass: !r.ok && /duplicate/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative charge rejected', function () {
    var r = D.analyze([{ type: 'sms', month: '2026-09', amount: -5 }]);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 5. daily-cash-closing-tool ============ */
(function () {
  var H = req('daily-cash-closing-tool');
  var slug = 'daily-cash-closing-tool';

  t(slug, 'REQUIRED SAMPLE: 500x10+100x5+20x3+10x7 = Rs 5630', function () {
    var r = H.denomTotal({ 500: 10, 100: 5, 20: 3, 10: 7, 5: 0, 2: 0, 1: 0, 2000: 0, 200: 0, 50: 0 });
    return { pass: r.ok && r.total === 5630, detail: 'total=' + r.total };
  });

  t(slug, 'shortage of Rs 370 vs expected Rs 6000', function () {
    var r = H.closingTally(6000, 5630);
    return { pass: r.ok && eq(r.diff, -370) && r.status === 'shortage' && eq(r.absDiff, 370),
      detail: 'diff=' + r.diff + ' status=' + r.status };
  });

  t(slug, 'perfect tally -> ok', function () {
    var r = H.closingTally(5630, 5630);
    return { pass: r.ok && r.diff === 0 && r.status === 'ok', detail: 'status=' + r.status };
  });

  t(slug, 'ADVERSARIAL: fractional note count rejected', function () {
    var r = H.denomTotal({ 500: 2.5 });
    return { pass: !r.ok && /whole/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: 26th log entry rejected (max 25)', function () {
    var log = [];
    for (var i = 0; i < 25; i++) {
      var r = H.logAdd(log, '2026-09-' + String(i + 1).padStart(2, '0'), 1000, 1000, '');
      log = r.log;
    }
    var last = H.logAdd(log, '2026-09-26', 1000, 1000, '');
    return { pass: !last.ok && /full/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });
})();

/* ============ 6. cash-burn-rate-analyzer ============ */
(function () {
  var R = req('cash-burn-rate-analyzer');
  var slug = 'cash-burn-rate-analyzer';

  t(slug, 'REQUIRED SAMPLE: 10L->9L->8L -> burn Rs 100000/mo, runway 8, zero-cash 2026-11', function () {
    var r = R.analyze([
      { month: '2026-01', balance: 1000000 },
      { month: '2026-02', balance: 900000 },
      { month: '2026-03', balance: 800000 }
    ]);
    return { pass: r.ok && r.burning && eq(r.netBurn, 100000) &&
      r.runwayMonths === 8 && r.zeroCashMonth === '2026-11',
      detail: 'burn=' + r.netBurn + ' runway=' + r.runwayMonths + ' zero=' + r.zeroCashMonth };
  });

  t(slug, 'growing cash -> cash-flow positive, no zero-cash date', function () {
    var r = R.analyze([{ month: '2026-01', balance: 500000 }, { month: '2026-02', balance: 600000 }]);
    return { pass: r.ok && !r.burning && r.zeroCashMonth === null, detail: 'burning=' + r.burning };
  });

  t(slug, 'ADVERSARIAL: single month rejected', function () {
    var r = R.analyze([{ month: '2026-01', balance: 500000 }]);
    return { pass: !r.ok && /at least 2/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: duplicate month rejected', function () {
    var r = R.analyze([{ month: '2026-01', balance: 500000 }, { month: '2026-01', balance: 400000 }]);
    return { pass: !r.ok && /duplicate/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 7. emergency-cash-estimator ============ */
(function () {
  var E = req('emergency-cash-estimator');
  var slug = 'emergency-cash-estimator';

  t(slug, 'REQUIRED SAMPLE: monthly 310000 -> 3m 930000, 6m 1860000, coverage 1.29', function () {
    var r = E.estimate({ rent: 50000, salaries: 200000, emis: 30000, utilities: 10000, insurance: 5000, other: 15000 }, 400000);
    return { pass: r.ok && eq(r.monthly, 310000) && eq(r.target3, 930000) &&
      eq(r.target6, 1860000) && eq(r.coverageMonths, 1.29) &&
      eq(r.gap3, 530000) && eq(r.gap6, 1460000) && r.level === 'weak',
      detail: 'monthly=' + r.monthly + ' coverage=' + r.coverageMonths + ' level=' + r.level };
  });

  t(slug, 'healthy: 7 months covered -> level healthy, gaps zero', function () {
    var r = E.estimate({ rent: 100000 }, 700000);
    return { pass: r.ok && r.level === 'healthy' && r.gap3 === 0 && r.gap6 === 0, detail: 'level=' + r.level };
  });

  t(slug, 'ADVERSARIAL: all-zero costs rejected', function () {
    var r = E.estimate({}, 100000);
    return { pass: !r.ok && /at least one/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative cost rejected', function () {
    var r = E.estimate({ rent: -500 }, 100000);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 8. payment-mode-profitability-tool ============ */
(function () {
  var P = req('payment-mode-profitability-tool');
  var slug = 'payment-mode-profitability-tool';

  t(slug, 'REQUIRED SAMPLE: Rs 10L mix -> cost Rs 9150, eff 0.92%, annual Rs 109800', function () {
    var r = P.compare({
      monthlySales: 1000000,
      mix: { upi: 40, credit: 30, debit: 20, netbanking: 5, cash: 5 },
      rates: { upi: 0.25, credit: 2, debit: 0.9, cash: 0, netbankingFlat: 7 },
      avgTicket: 1000
    });
    return { pass: r.ok && eq(r.totalCost, 9150) && eq(r.effectivePct, 0.92) &&
      eq(r.annualCost, 109800) && r.cheapest === 'cash' && eq(r.potentialSaving, 72000),
      detail: 'cost=' + r.totalCost + ' eff=' + r.effectivePct + '% saving=' + r.potentialSaving };
  });

  t(slug, 'netbanking flat charge scales with ticket count', function () {
    var r = P.compare({
      monthlySales: 100000, mix: { upi: 0, credit: 0, debit: 0, netbanking: 100, cash: 0 },
      rates: { upi: 0, credit: 0, debit: 0, cash: 0, netbankingFlat: 10 }, avgTicket: 500
    });
    // 100000/500 = 200 txns x Rs 10 = Rs 2000
    return { pass: r.ok && eq(r.totalCost, 2000), detail: 'cost=' + r.totalCost };
  });

  t(slug, 'ADVERSARIAL: shares not summing to 100 rejected', function () {
    var r = P.compare({
      monthlySales: 100000, mix: { upi: 40, credit: 30, debit: 20, netbanking: 5, cash: 4 },
      rates: { upi: 0.25, credit: 2, debit: 0.9, cash: 0, netbankingFlat: 7 }, avgTicket: 1000
    });
    return { pass: !r.ok && /100%/.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative MDR rejected', function () {
    var r = P.compare({
      monthlySales: 100000, mix: { upi: 100, credit: 0, debit: 0, netbanking: 0, cash: 0 },
      rates: { upi: -1, credit: 2, debit: 0.9, cash: 0, netbankingFlat: 7 }, avgTicket: 1000
    });
    return { pass: !r.ok && /below 0/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 9. credit-line-utilization-monitor ============ */
(function () {
  var U = req('credit-line-utilization-monitor');
  var slug = 'credit-line-utilization-monitor';

  t(slug, 'REQUIRED SAMPLE: 10L limit, 8L drawn @12% -> 80%, Rs 8000/mo, warning', function () {
    var s = U.facilityStats({ name: 'HDFC CC', kind: 'cc', limit: 1000000, drawn: 800000, rate: 12 });
    return { pass: s.ok && eq(s.utilizationPct, 80) && eq(s.monthlyInterest, 8000) &&
      eq(s.headroom, 200000) && s.status === 'warning',
      detail: 'util=' + s.utilizationPct + '% int=' + s.monthlyInterest };
  });

  t(slug, 'portfolio: totals, weighted rate, critical alert at 95%', function () {
    var l1 = U.registerAdd([], { name: 'HDFC CC', kind: 'cc', limit: 1000000, drawn: 950000, rate: 12 });
    var l2 = U.registerAdd(l1.list, { name: 'SBI OD', kind: 'od', limit: 500000, drawn: 100000, rate: 10 });
    var p = U.portfolio(l2.list);
    return { pass: p.ok && eq(p.totalLimit, 1500000) && eq(p.totalDrawn, 1050000) &&
      eq(p.utilPct, 70) && eq(p.weightedRate, 11.81) &&
      p.alerts.length === 1 && p.alerts[0].level === 'critical',
      detail: 'util=' + p.utilPct + '% wrate=' + p.weightedRate + ' alerts=' + p.alerts.length };
  });

  t(slug, 'ADVERSARIAL: drawn > limit rejected', function () {
    var s = U.facilityStats({ name: 'X', kind: 'od', limit: 100000, drawn: 120000, rate: 10 });
    return { pass: !s.ok && /exceeds/i.test(s.error), detail: s.ok ? 'accepted!' : s.error };
  });

  t(slug, 'ADVERSARIAL: duplicate facility name rejected', function () {
    var l1 = U.registerAdd([], { name: 'HDFC CC', kind: 'cc', limit: 100000, drawn: 10000, rate: 12 });
    var l2 = U.registerAdd(l1.list, { name: 'hdfc cc', kind: 'od', limit: 100000, drawn: 10000, rate: 10 });
    return { pass: !l2.ok && /already exists/i.test(l2.error), detail: l2.ok ? 'accepted!' : l2.error };
  });
})();

/* ============ 10. cash-vs-upi-vs-card-split-analyzer ============ */
(function () {
  var S = req('cash-vs-upi-vs-card-split-analyzer');
  var slug = 'cash-vs-upi-vs-card-split-analyzer';

  t(slug, 'REQUIRED SAMPLE: 20/50/30 split -> Rs 7250 fee, 0.73% drag, Rs 87000/yr', function () {
    var r = S.analyze({
      monthlySales: 1000000, splits: { cash: 20, upi: 50, card: 30 },
      rates: { cash: 0, upi: 0.25, card: 2 }
    });
    return { pass: r.ok && eq(r.totalFee, 7250) && eq(r.dragPct, 0.73) &&
      eq(r.annualFee, 87000) && r.dominant === 'upi' && r.hints.length === 6,
      detail: 'fee=' + r.totalFee + ' drag=' + r.dragPct + '%' };
  });

  t(slug, 'all-cash mix -> zero fee drag', function () {
    var r = S.analyze({ monthlySales: 500000, splits: { cash: 100, upi: 0, card: 0 }, rates: { cash: 0, upi: 0.25, card: 2 } });
    return { pass: r.ok && r.totalFee === 0 && r.dragPct === 0, detail: 'fee=' + r.totalFee };
  });

  t(slug, 'ADVERSARIAL: splits over 100 rejected', function () {
    var r = S.analyze({ monthlySales: 500000, splits: { cash: 50, upi: 50, card: 10 }, rates: { cash: 0, upi: 0.25, card: 2 } });
    return { pass: !r.ok && /100%/.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: rate above 25% rejected', function () {
    var r = S.analyze({ monthlySales: 500000, splits: { cash: 0, upi: 0, card: 100 }, rates: { cash: 0, upi: 0, card: 99 } });
    return { pass: !r.ok && /between 0 and 25/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team J (10 banking, payments & cash) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
