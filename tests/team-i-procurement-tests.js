#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team I (10 procurement & vendor apps)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-i-procurement-tests.js
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

/* ============ 1. purchase-order-generator ============ */
(function () {
  var P = req('purchase-order-generator');
  var slug = 'purchase-order-generator';
  var item = { desc: 'Widget', hsn: '8471', qty: 10, rate: 100, gst: 18 };

  t(slug, 'intra-state: CGST+SGST split 90+90 on 1000 taxable', function () {
    var r = P.poTotals([P.validateItem(item).value], true);
    var l = r.lines[0];
    return { pass: r.ok && eq(l.cgst, 90) && eq(l.sgst, 90) && eq(l.igst, 0) && eq(r.grand, 1180), detail: 'grand=' + r.grand };
  });

  t(slug, 'inter-state: IGST 180, no CGST/SGST; FY numbering VQ/26-27/0001', function () {
    var r = P.poTotals([P.validateItem(item).value], false);
    var n = P.poNumber('VQ', 1, '2026-09-26');
    return { pass: r.ok && eq(r.igst, 180) && eq(r.cgst, 0) && eq(r.grand, 1180) && n === 'VQ/26-27/0001', detail: 'n=' + n };
  });

  t(slug, 'ADVERSARIAL: negative qty rejected; XSS desc escaped; bad date -> FY NA', function () {
    var neg = P.validateItem({ desc: 'x', qty: -5, rate: 10, gst: 18 });
    var xss = P.esc('<script>alert(1)</script>');
    var fy = P.fyOf('not-a-date');
    return { pass: !neg.ok && xss === '&lt;script&gt;alert(1)&lt;/script&gt;' && fy === 'NA', detail: 'neg=' + neg.error + ' fy=' + fy };
  });
})();

/* ============ 2. vendor-comparison-tool ============ */
(function () {
  var C = req('vendor-comparison-tool');
  var slug = 'vendor-comparison-tool';
  var vendors = [
    { name: 'Alpha', price: 100000, lead: 10, warranty: 12, rating: 4 },
    { name: 'Beta', price: 120000, lead: 5, warranty: 24, rating: 5 }
  ];

  t(slug, 'ranking returns a winner with scores 0-100 sorted desc', function () {
    var r = C.rankVendors(vendors, C.DEFAULT_WEIGHTS);
    return { pass: r.ok && r.rows.length === 2 && r.rows[0].score >= r.rows[1].score &&
      r.rows[0].score <= 100 && r.winner === r.rows[0].vendor.name, detail: 'winner=' + r.winner + ' score=' + r.winnerScore };
  });

  t(slug, 'price-heavy weights pick cheapest; rating-heavy picks better-rated', function () {
    var cheap = C.rankVendors(vendors, { price: 100, lead: 0, warranty: 0, rating: 0 });
    var rated = C.rankVendors(vendors, { price: 0, lead: 0, warranty: 0, rating: 100 });
    return { pass: cheap.ok && cheap.winner === 'Alpha' && rated.ok && rated.winner === 'Beta', detail: 'cheap=' + cheap.winner + ' rated=' + rated.winner };
  });

  t(slug, 'ADVERSARIAL: weights != 100 rejected; single vendor rejected; rating 9 rejected', function () {
    var w = C.validateWeights({ price: 50, lead: 20, warranty: 15, rating: 25 });
    var one = C.rankVendors([vendors[0]], C.DEFAULT_WEIGHTS);
    var bad = C.validateVendor({ name: 'X', price: 1, lead: 1, warranty: 1, rating: 9 });
    return { pass: !w.ok && !one.ok && !bad.ok, detail: w.error + ' | ' + one.error + ' | ' + bad.error };
  });
})();

/* ============ 3. vendor-performance-scorecard ============ */
(function () {
  var S = req('vendor-performance-scorecard');
  var slug = 'vendor-performance-scorecard';
  var scores = { quality: 80, delivery: 80, price: 70, responsiveness: 70 };

  t(slug, 'weighted overall = 76 with default weights; grade B', function () {
    var o = S.overall(scores, S.DEFAULT_WEIGHTS);
    return { pass: o.ok && eq(o.value, 76) && S.gradeFor(o.value) === 'B', detail: 'overall=' + o.value + ' grade=' + S.gradeFor(o.value) };
  });

  t(slug, 'trend delta +6 vs previous 70; history summarises best/worst', function () {
    var tr = S.trendDelta(76, 70);
    var summ = S.summarizeHistory([{ period: '2026-07', overall: 70 }, { period: '2026-08', overall: 76 }]);
    return { pass: tr.ok && eq(tr.delta, 6) && summ.ok && summ.count === 2 && eq(summ.best.overall, 76) && eq(summ.worst.overall, 70), detail: tr.label };
  });

  t(slug, 'ADVERSARIAL: score 101 rejected; weights summing to 90 rejected; XSS name escaped', function () {
    var s = S.validateScores({ quality: 101, delivery: 80, price: 70, responsiveness: 70 });
    var w = S.validateWeights({ quality: 30, delivery: 30, price: 20, responsiveness: 10 });
    var x = S.esc('"><img src=x onerror=alert(1)>');
    return { pass: !s.ok && !w.ok && x.indexOf('<') === -1, detail: s.error + ' | ' + w.error };
  });
})();

/* ============ 4. purchase-approval-workflow ============ */
(function () {
  var A = req('purchase-approval-workflow');
  var slug = 'purchase-approval-workflow';

  t(slug, 'slab mapping: 50k -> HOD,Finance; 600k -> HOD,Finance,Director,MD', function () {
    var c1 = A.approvalChain(50000), c2 = A.approvalChain(600000);
    return { pass: c1.ok && c1.value.join(',') === 'HOD,Finance' && c2.ok && c2.value.length === 4, detail: c1.value.join('>') + ' | ' + c2.value.join('>') };
  });

  t(slug, 'ordered approvals: HOD then Finance; status approved after full chain', function () {
    var nr = A.newRequest({ title: 'Paper', vendor: 'Gupta', amount: 50000, requestedBy: 'Ravi' }, null, 1727220000000);
    if (!nr.ok) return { pass: false, detail: nr.error };
    var a1 = A.applyAction(nr.value, 'HOD', 'approve', '', 1727220000001);
    if (!a1.ok) return { pass: false, detail: a1.error };
    var a2 = A.applyAction(a1.value, 'Finance', 'approve', 'ok', 1727220000002);
    if (!a2.ok) return { pass: false, detail: a2.error };
    return { pass: a2.status === 'approved' && a2.value.trail.length === 3, detail: 'status=' + a2.status };
  });

  t(slug, 'ADVERSARIAL: out-of-turn approve refused; action after close refused; reject closes', function () {
    var nr = A.newRequest({ title: 'Toner', vendor: 'Khan', amount: 50000, requestedBy: 'Ravi' }, null, 1727220000000);
    var oot = A.applyAction(nr.value, 'Finance', 'approve', '');
    var rj = A.applyAction(nr.value, 'HOD', 'reject', 'too costly');
    var after = rj.ok ? A.applyAction(rj.value, 'Finance', 'approve', '') : { ok: true };
    return { pass: !oot.ok && rj.ok && rj.status === 'rejected' && !after.ok, detail: oot.error + ' | ' + after.error };
  });
})();

/* ============ 5. vendor-rate-analyzer ============ */
(function () {
  var R = req('vendor-rate-analyzer');
  var slug = 'vendor-rate-analyzer';
  var CSV = 'item,vendor,rate,date\nA4 paper,Gupta,240,2026-06-02\nA4 paper,Gupta,265,2026-09-10\nA4 paper,Sharma,252,2026-09-12';

  t(slug, 'CSV parses 3 quotes; best vendor per item = Sharma at 252', function () {
    var p = R.parseCSV(CSV);
    if (!p.ok) return { pass: false, detail: p.error };
    var b = R.bestVendorPerItem(p.quotes);
    return { pass: b.ok && b.value.length === 1 && b.value[0].vendor === 'Sharma' && eq(b.value[0].rate, 252), detail: 'best=' + b.value[0].vendor };
  });

  t(slug, 'hike detection flags Gupta +10.42% vs prev at 5% threshold', function () {
    var p = R.parseCSV(CSV);
    var h = R.detectHikes(p.quotes, 5);
    var gupta = h.hikes.filter(function (x) { return x.vendor === 'Gupta'; })[0];
    return { pass: h.ok && h.hikes.length >= 1 && gupta && eq(gupta.hikeVsPrev, 10.42), detail: 'hikes=' + h.hikes.length + ' gupta=' + (gupta && gupta.hikeVsPrev) };
  });

  t(slug, 'ADVERSARIAL: header missing "date" rejected; zero rate rejected; quoted comma field parses', function () {
    var bad = R.parseCSV('item,vendor,rate\nA4,Gupta,240');
    var zero = R.validateQuote({ item: 'A4', vendor: 'G', rate: 0, date: '2026-09-01' });
    var qc = R.parseCSV('item,vendor,rate,date\n"Paper, A4",Gupta,240,2026-09-01');
    return { pass: !bad.ok && !zero.ok && qc.ok && qc.quotes[0].item === 'Paper, A4', detail: bad.error + ' | ' + zero.error };
  });
})();

/* ============ 6. bulk-purchase-optimizer ============ */
(function () {
  var B = req('bulk-purchase-optimizer');
  var slug = 'bulk-purchase-optimizer';

  t(slug, 'EOQ(12000, 500, 20) = sqrt(600000) ~ 774.6', function () {
    var e = B.eoq(12000, 500, 20);
    return { pass: e.ok && eq(e.value, 774.5967), detail: 'eoq=' + e.value };
  });

  t(slug, 'discount tier wins when its total cost beats EOQ total', function () {
    var r = B.bestOption({ demand: 12000, orderCost: 500, holdCost: 20, unitPrice: 100, tiers: [{ qty: 2000, discount: 10 }] });
    return { pass: r.ok && r.winner.qty === 2000 && r.winner.total < r.options[1].total && r.savingVsNext > 0,
      detail: 'winner qty=' + r.winner.qty + ' total=' + r.winner.total + ' saving=' + r.savingVsNext };
  });

  t(slug, 'ADVERSARIAL: zero demand rejected; discount 100 rejected; negative holding cost rejected', function () {
    var z = B.validateInputs({ demand: 0, orderCost: 500, holdCost: 20, unitPrice: 100 });
    var d = B.validateInputs({ demand: 100, orderCost: 500, holdCost: 20, unitPrice: 100, tiers: [{ qty: 10, discount: 100 }] });
    var h = B.validateInputs({ demand: 100, orderCost: 500, holdCost: -5, unitPrice: 100 });
    return { pass: !z.ok && !d.ok && !h.ok, detail: z.error + ' | ' + d.error + ' | ' + h.error };
  });
})();

/* ============ 7. vendor-payment-tracker ============ */
(function () {
  var T = req('vendor-payment-tracker');
  var slug = 'vendor-payment-tracker';

  t(slug, 'MSME credit capped at 45 days: 90 agreed -> due = invoice + 45', function () {
    var inv = { vendor: 'Gupta', invoiceNo: 'INV-1', invoiceDate: '2026-06-01', amount: 100000, creditDays: 90, msme: true };
    return { pass: T.effectiveCreditDays(inv) === 45 && T.dueDateOf(inv) === '2026-07-16', detail: 'due=' + T.dueDateOf(inv) };
  });

  t(slug, 'constants: RBI bank rate 5.50, MSME interest 16.50; non-MSME keeps agreed 90d', function () {
    var inv = { vendor: 'G', invoiceNo: 'I', invoiceDate: '2026-06-01', amount: 1, creditDays: 90, msme: false };
    return { pass: T.RBI_BANK_RATE === 5.50 && T.MSME_INTEREST_RATE === 16.50 && T.effectiveCreditDays(inv) === 90, detail: 'rate=' + T.MSME_INTEREST_RATE };
  });

  t(slug, 'ADVERSARIAL: msme-risk at 87d overdue; interest ~4023.39; paid-before-invoice rejected; negative amount rejected', function () {
    var inv = { vendor: 'Gupta', invoiceNo: 'INV-1', invoiceDate: '2026-06-01', amount: 100000, creditDays: 30, msme: true };
    var st = T.statusOf(inv, '2026-09-26');
    var i = T.msmeInterest(100000, 87);
    var badDate = T.validateInvoice({ vendor: 'G', invoiceNo: 'I', invoiceDate: '2026-09-10', amount: 100, creditDays: 30, paidDate: '2026-09-01' });
    var neg = T.validateInvoice({ vendor: 'G', invoiceNo: 'I', invoiceDate: '2026-09-10', amount: -50, creditDays: 30 });
    return { pass: st.ok && st.status === 'msme-risk' && st.daysOverdue === 87 && eq(i.value, 4023.25) && !badDate.ok && !neg.ok,
      detail: 'status=' + st.status + ' interest=' + i.value + ' ' + badDate.error };
  });
})();

/* ============ 8. repeat-purchase-predictor ============ */
(function () {
  var P = req('repeat-purchase-predictor');
  var slug = 'repeat-purchase-predictor';
  var item = { name: 'A4 paper', purchases: [{ date: '2026-08-01', qty: 150 }, { date: '2026-08-31', qty: 150 }], currentStock: 150, leadTime: 7, safetyDays: 3 };

  t(slug, 'avg daily usage 10 over 30d span; reorder in 5 days -> due-soon', function () {
    var u = P.avgDailyUsage(item.purchases);
    var pr = P.predict(item, '2026-09-26');
    return { pass: u.ok && eq(u.value, 10) && u.spanDays === 30 && pr.ok && pr.status === 'due-soon' &&
      pr.daysToReorder === 5 && pr.reorderDate === '2026-10-01', detail: 'usage=' + u.value + ' reorder=' + pr.reorderDate };
  });

  t(slug, 'zero stock -> order-now; single purchase uses min 1-day span', function () {
    var pr = P.predict({ name: 'Toner', purchases: [{ date: '2026-09-01', qty: 10 }], currentStock: 0, leadTime: 7, safetyDays: 0 }, '2026-09-26');
    var u = P.avgDailyUsage([{ date: '2026-09-01', qty: 10 }]);
    return { pass: pr.ok && pr.status === 'order-now' && u.ok && u.spanDays === 1 && eq(u.value, 10), detail: pr.label };
  });

  t(slug, 'ADVERSARIAL: empty purchases rejected; negative stock rejected; huge qty rejected', function () {
    var e = P.validateItem({ name: 'X', purchases: [], currentStock: 1, leadTime: 1 });
    var n = P.validateItem({ name: 'X', purchases: [{ date: '2026-09-01', qty: 1 }], currentStock: -2, leadTime: 1 });
    var h = P.validatePurchase({ date: '2026-09-01', qty: 1e10 });
    return { pass: !e.ok && !n.ok && !h.ok, detail: e.error + ' | ' + n.error + ' | ' + h.error };
  });
})();

/* ============ 9. vendor-contract-tracker ============ */
(function () {
  var K = req('vendor-contract-tracker');
  var slug = 'vendor-contract-tracker';
  var c = { vendor: 'Gupta', title: 'AMC printers', startDate: '2025-10-01', endDate: '2026-10-20', autoRenew: false, noticeDays: 60 };

  t(slug, '24 days to expiry -> 30-day alert; 100 days -> no alert', function () {
    var a1 = K.alertFor(c, '2026-09-26');
    var a2 = K.alertFor(c, '2026-07-12');
    return { pass: a1.ok && a1.level === '30' && a1.daysLeft === 24 && a2.ok && a2.level === null, detail: 'a1=' + a1.level };
  });

  t(slug, 'expired contract flagged; alerts sorted most-urgent-first', function () {
    var old = { vendor: 'Khan', title: 'Old', startDate: '2024-01-01', endDate: '2026-09-01', autoRenew: true, noticeDays: 60 };
    var a = K.alertFor(old, '2026-09-26');
    var all = K.alertsFor([c, old], '2026-09-26');
    return { pass: a.ok && a.level === 'expired' && all.ok && all.alerts[0].level === 'expired', detail: 'first=' + all.alerts[0].level };
  });

  t(slug, 'ADVERSARIAL: end before start rejected; bad date rejected; >10yr term rejected', function () {
    var e = K.validateContract({ vendor: 'G', title: 'T', startDate: '2026-10-01', endDate: '2026-09-01' });
    var b = K.validateContract({ vendor: 'G', title: 'T', startDate: '2026-13-01', endDate: '2027-01-01' });
    var l = K.validateContract({ vendor: 'G', title: 'T', startDate: '2026-01-01', endDate: '2037-01-02' });
    return { pass: !e.ok && !b.ok && !l.ok, detail: e.error + ' | ' + b.error + ' | ' + l.error };
  });
})();

/* ============ 10. purchase-budget-control-tool ============ */
(function () {
  var D = req('purchase-budget-control-tool');
  var slug = 'purchase-budget-control-tool';

  t(slug, '85% spend -> watch; 110% -> overrun; variance signed correctly', function () {
    var b = [{ month: '2026-09', category: 'Raw material', amount: 100000 }];
    var r1 = D.monthReport(b, [{ date: '2026-09-05', month: '2026-09', category: 'Raw material', amount: 85000 }], '2026-09');
    var r2 = D.monthReport(b, [{ date: '2026-09-05', month: '2026-09', category: 'Raw material', amount: 110000 }], '2026-09');
    return { pass: r1.ok && r1.rows[0].status === 'watch' && r2.ok && r2.rows[0].status === 'overrun' && eq(r2.rows[0].variance, -10000),
      detail: 'r1=' + r1.rows[0].status + ' r2=' + r2.rows[0].status };
  });

  t(slug, 'setBudget replaces same month+category; spend with no budget flagged', function () {
    var s = D.setBudget([{ month: '2026-09', category: 'RM', amount: 50000 }], { month: '2026-09', category: 'rm', amount: 80000 });
    var r = D.monthReport([], [{ date: '2026-09-05', month: '2026-09', category: 'Travel', amount: 5000 }], '2026-09');
    return { pass: s.ok && s.value.length === 1 && s.value[0].amount === 80000 && r.ok && r.rows[0].status === 'no-budget', detail: 'budgets=' + s.value.length };
  });

  t(slug, 'ADVERSARIAL: bad month rejected; zero budget rejected; negative spend rejected', function () {
    var m = D.validateBudget({ month: '2026-13', category: 'RM', amount: 100 });
    var z = D.validateBudget({ month: '2026-09', category: 'RM', amount: 0 });
    var n = D.validateActual({ date: '2026-09-05', category: 'RM', amount: -10 });
    return { pass: !m.ok && !z.ok && !n.ok, detail: m.error + ' | ' + z.error + ' | ' + n.error };
  });
})();

/* ============ summary ============ */
var failed = results.filter(function (r) { return !r.pass; });
console.log('Team I procurement tests: ' + results.length + ' total, ' +
  (results.length - failed.length) + ' passed, ' + failed.length + ' failed.');
failed.forEach(function (r) {
  console.log('FAIL [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed.length ? 1 : 0);
