#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team L (10 tender/project tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-l-tender-tests.js
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

/* ============ 1. tender-deadline-tracker ============ */
(function () {
  var T = req('tender-deadline-tracker');
  var slug = 'tender-deadline-tracker';

  t(slug, 'daysLeft: 2026-10-01 vs now 2026-09-26 = 5 days', function () {
    var r = T.daysLeft('2026-10-01', '2026-09-26');
    return { pass: r.ok && r.value === 5, detail: 'days=' + r.value };
  });

  t(slug, 'urgency bands: overdue/critical(<=3)/soon(<=7)/normal', function () {
    var o = T.urgency('2026-09-20', '2026-09-26');
    var c = T.urgency('2026-09-28', '2026-09-26');
    var s = T.urgency('2026-10-03', '2026-09-26');
    var n = T.urgency('2026-11-26', '2026-09-26');
    return { pass: o.ok && o.band === 'overdue' && c.ok && c.band === 'critical' &&
      s.ok && s.band === 'soon' && n.ok && n.band === 'normal',
      detail: [o.band, c.band, s.band, n.band].join('/') };
  });

  t(slug, 'docPct + add/toggle flow', function () {
    var r = T.addTender([], { name: 'Road work', deadline: '2026-10-15', docs: 'GST\nPAN\nEMD' });
    if (!r.ok) return { pass: false, detail: r.error };
    var t2 = T.toggleDoc(r.list, r.tender.id, 0);
    if (!t2.ok) return { pass: false, detail: t2.error };
    var dp = T.docPct(t2.list[0].docs);
    var sum = T.summarize(t2.list, '2026-09-26');
    return { pass: dp.ok && dp.done === 1 && dp.total === 3 && eq(dp.pct, 33.3) &&
      sum.ok && sum.counts.total === 1 && sum.counts.soon === 0 && sum.counts.normal === 1,
      detail: 'done=' + dp.done + '/' + dp.total + ' pct=' + dp.pct };
  });

  t(slug, 'ADVERSARIAL: invalid calendar date rejected (2026-02-30)', function () {
    var r = T.addTender([], { name: 'X', deadline: '2026-02-30' });
    return { pass: !r.ok && /real calendar/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: 26th tender rejected (max 25)', function () {
    var list = [];
    for (var i = 0; i < 25; i++) {
      var r = T.addTender(list, { name: 'T' + i, deadline: '2026-12-01' });
      list = r.list;
    }
    var last = T.addTender(list, { name: 'Extra', deadline: '2026-12-01' });
    return { pass: !last.ok && /full/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });

  t(slug, 'ADVERSARIAL: XSS name is escaped in esc()', function () {
    var out = T.esc('<script>alert(1)</script>');
    return { pass: out.indexOf('<script>') === -1 && out.indexOf('&lt;script&gt;') !== -1, detail: out };
  });
})();

/* ============ 2. tender-eligibility-checker ============ */
(function () {
  var E = req('tender-eligibility-checker');
  var slug = 'tender-eligibility-checker';

  t(slug, 'all criteria met -> eligible, score 100', function () {
    var r = E.assess(
      { minTurnover: 10000000, minExperience: 3, minContracts: 2, emd: 200000, category: 'Class A', registration: 'NSIC' },
      { turnover: 15000000, experience: 5, contracts: 4, emdCapacity: 500000, category: 'class a', registration: 'Udyam, NSIC' }
    );
    return { pass: r.ok && r.status === 'eligible' && r.score === 100 && r.gaps.length === 0,
      detail: 'status=' + r.status + ' score=' + r.score };
  });

  t(slug, 'turnover 5% short -> marginal with gap', function () {
    var r = E.assess(
      { minTurnover: 10000000, minExperience: 3, minContracts: 0, emd: 0 },
      { turnover: 9500000, experience: 10, contracts: 5, emdCapacity: 100000 }
    );
    var turn = r.criteria.filter(function (c) { return c.id === 'turnover'; })[0];
    return { pass: r.ok && r.status === 'marginal' && turn.verdict === 'marginal' && r.gaps.length === 1,
      detail: 'status=' + r.status + ' gaps=' + r.gaps.length };
  });

  t(slug, 'experience fail + category mismatch -> no-go', function () {
    var r = E.assess(
      { minTurnover: 10000000, minExperience: 5, minContracts: 0, emd: 500000, category: 'Class A' },
      { turnover: 20000000, experience: 1, contracts: 0, emdCapacity: 600000, category: 'Class B' }
    );
    return { pass: r.ok && r.status === 'no-go' && r.counts.fail === 2, detail: 'status=' + r.status + ' fails=' + r.counts.fail };
  });

  t(slug, 'ADVERSARIAL: negative turnover rejected', function () {
    var r = E.assess({ minTurnover: 100 }, { turnover: -5000 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: non-numeric EMD rejected', function () {
    var r = E.assess({ emd: 'abc' }, {});
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 3. tender-cost-estimator ============ */
(function () {
  var C = req('tender-cost-estimator');
  var slug = 'tender-cost-estimator';

  t(slug, 'buildup: 100 direct + 8% ind + 5% cont + 10% margin = 124.30 bid', function () {
    var r = C.buildup({
      directs: 'Materials: 60\nLabour: 40',
      indirectPct: 8, contingencyPct: 5, marginPct: 10, tenderFee: 1000, emdAmount: 50000
    });
    // direct=100, ind=8, cont=5, cost=113, margin=11.3, bid=124.3, upfront=113+1000+50000=51113
    return { pass: r.ok && eq(r.directTotal, 100) && eq(r.totalCost, 113) &&
      eq(r.margin, 11.3) && eq(r.bidPrice, 124.3) && eq(r.upfrontCash, 51113),
      detail: 'bid=' + r.bidPrice + ' upfront=' + r.upfrontCash };
  });

  t(slug, 'per-head shares sum to 100%', function () {
    var r = C.buildup({ directs: 'A: 300\nB: 100', indirectPct: 0, contingencyPct: 0, marginPct: 0 });
    var sum = r.heads.reduce(function (a, h) { return a + h.share; }, 0);
    return { pass: r.ok && eq(sum, 100) && r.heads.length === 2, detail: 'shareSum=' + sum };
  });

  t(slug, 'ADVERSARIAL: negative direct amount rejected', function () {
    var r = C.buildup({ directs: 'Materials: -500', indirectPct: 0, contingencyPct: 0, marginPct: 0 });
    return { pass: !r.ok && /negative|name: amount/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: margin >100% rejected; malformed line rejected', function () {
    var r1 = C.buildup({ directs: 'A: 100', indirectPct: 0, contingencyPct: 0, marginPct: 150 });
    var r2 = C.buildup({ directs: 'just a name', indirectPct: 0, contingencyPct: 0, marginPct: 0 });
    return { pass: !r1.ok && /exceed/i.test(r1.error) && !r2.ok && /name: amount/i.test(r2.error),
      detail: r1.error + ' | ' + r2.error };
  });
})();

/* ============ 4. bid-price-optimizer ============ */
(function () {
  var B = req('bid-price-optimizer');
  var slug = 'bid-price-optimizer';

  t(slug, 'REQUIRED SAMPLE: cost=100, band 100-200, p 0.9->0.1 -> best ~= 156.25, EV ~= 25.31', function () {
    var r = B.optimize({ cost: 100, floor: 100, ceiling: 200, pFloor: 0.9, pCeiling: 0.1, steps: 200 });
    return { pass: r.ok && Math.abs(r.best.price - 156.25) < 1.5 && eq(r.best.ev, 25.31),
      detail: 'price=' + r.best.price + ' ev=' + r.best.ev };
  });

  t(slug, 'evaluateBids picks the highest-EV explicit point', function () {
    var r = B.evaluateBids(100, [
      { price: 110, prob: 0.9 },   // ev 9
      { price: 150, prob: 0.5 },   // ev 25
      { price: 190, prob: 0.2 }    // ev 18
    ]);
    return { pass: r.ok && r.best.price === 150 && eq(r.best.ev, 25) && r.rows.length === 3,
      detail: 'best=' + r.best.price + ' ev=' + r.best.ev };
  });

  t(slug, 'winProb interpolates linearly and clamps', function () {
    var m = B.winProb(150, 100, 200, 0.9, 0.1);
    var lo = B.winProb(50, 100, 200, 0.9, 0.1);
    var hi = B.winProb(300, 100, 200, 0.9, 0.1);
    return { pass: m.ok && eq(m.value, 0.5) && lo.ok && lo.value === 0.9 && hi.ok && hi.value === 0.1,
      detail: 'mid=' + m.value };
  });

  t(slug, 'ADVERSARIAL: probability >1 rejected', function () {
    var r = B.optimize({ cost: 100, floor: 100, ceiling: 200, pFloor: 1.5, pCeiling: 0.1, steps: 100 });
    return { pass: !r.ok && /between 0 and 1/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: floor below cost rejected; rising-prob curve rejected', function () {
    var r1 = B.optimize({ cost: 120, floor: 100, ceiling: 200, pFloor: 0.9, pCeiling: 0.1, steps: 100 });
    var r2 = B.optimize({ cost: 100, floor: 100, ceiling: 200, pFloor: 0.1, pCeiling: 0.9, steps: 100 });
    return { pass: !r1.ok && /below your estimated cost/i.test(r1.error) && !r2.ok && /fall/i.test(r2.error),
      detail: r1.error + ' | ' + r2.error };
  });
})();

/* ============ 5. retention-money-calculator ============ */
(function () {
  var R = req('retention-money-calculator');
  var slug = 'retention-money-calculator';

  t(slug, '10% of 25L = 2.5L retention; release due = completion + 12 months', function () {
    var r = R.addContract([], { name: 'Waterproofing', value: 2500000, retentionPct: 10, completionDate: '2026-03-15', dlpMonths: 12 });
    return { pass: r.ok && eq(r.contract.retention, 250000) && r.contract.releaseDue === '2027-03-15',
      detail: 'ret=' + r.contract.retention + ' due=' + r.contract.releaseDue };
  });

  t(slug, 'addMonths clamps month-end (2026-01-31 + 1mo = 2026-02-28)', function () {
    return { pass: R.addMonths('2026-01-31', 1) === '2026-02-28', detail: R.addMonths('2026-01-31', 1) };
  });

  t(slug, 'totals: locked vs released vs dueNow', function () {
    var a = R.addContract([], { name: 'A', value: 1000000, retentionPct: 10, completionDate: '2025-01-01', dlpMonths: 12 });
    var b = R.addContract(a.list, { name: 'B', value: 2000000, retentionPct: 5, completionDate: '2026-01-01', dlpMonths: 24 });
    var rel = R.markReleased(b.list, b.contract.id, '2026-06-01');
    var t = R.totals(rel.list, '2026-09-26').totals;
    // A: 100k due (past due, not released); B: 100k released
    return { pass: t.totalRetained === 200000 && t.locked === 100000 && t.released === 100000 &&
      t.dueNow.length === 1 && t.dueNow[0].name === 'A',
      detail: 'locked=' + t.locked + ' released=' + t.released + ' dueNow=' + t.dueNow.length };
  });

  t(slug, 'ADVERSARIAL: retention 30% rejected (max 25%)', function () {
    var r = R.addContract([], { name: 'A', value: 1000000, retentionPct: 30, completionDate: '2026-01-01', dlpMonths: 12 });
    return { pass: !r.ok && /too large/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative contract value rejected', function () {
    var r = R.retentionFor(-1000, 10);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 6. project-cost-overrun-detector ============ */
(function () {
  var O = req('project-cost-overrun-detector');
  var slug = 'project-cost-overrun-detector';

  t(slug, 'REQUIRED SAMPLE: BAC=100k, AC=60k, 50% -> EV=50k, CPI=0.833, EAC=120k, overrun', function () {
    var r = O.addHead([], { head: 'Civil', budget: 100000, actual: 60000, pctComplete: 50 });
    if (!r.ok) return { pass: false, detail: r.error };
    var s = O.headStats(r.headRec);
    return { pass: s.ok && eq(s.ev, 50000) && eq(s.cpi, 0.833) && eq(s.eac, 120000) &&
      eq(s.vac, -20000) && s.status === 'overrun',
      detail: 'cpi=' + s.cpi + ' eac=' + s.eac + ' status=' + s.status };
  });

  t(slug, 'on-track head: CPI>=1 and portfolio aggregates', function () {
    var a = O.addHead([], { head: 'A', budget: 100000, actual: 40000, pctComplete: 50 }); // ev 50k, cpi 1.25
    var b = O.addHead(a.list, { head: 'B', budget: 200000, actual: 100000, pctComplete: 50 }); // ev 100k, cpi 1.0
    var p = O.portfolio(b.list);
    // bac=300k, ac=140k, ev=150k, cpi=150/140=1.071, eac=300000/1.071=280000
    return { pass: p.ok && eq(p.cpi, 1.071) && eq(p.eac, 280000) && p.status === 'on-track',
      detail: 'cpi=' + p.cpi + ' eac=' + p.eac + ' status=' + p.status };
  });

  t(slug, 'watch band: CPI 0.9-1.0', function () {
    var r = O.addHead([], { head: 'W', budget: 100000, actual: 100000, pctComplete: 95 }); // ev 95k cpi 0.95
    var s = O.headStats(r.headRec);
    return { pass: s.status === 'watch', detail: 'status=' + s.status + ' cpi=' + s.cpi };
  });

  t(slug, 'ADVERSARIAL: % complete >100 rejected', function () {
    var r = O.addHead([], { head: 'X', budget: 100000, actual: 1000, pctComplete: 150 });
    return { pass: !r.ok && /too large|exceed 100/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative actual rejected; zero budget rejected', function () {
    var r1 = O.addHead([], { head: 'X', budget: 100000, actual: -500, pctComplete: 10 });
    var r2 = O.addHead([], { head: 'Y', budget: 0, actual: 0, pctComplete: 0 });
    return { pass: !r1.ok && /negative/i.test(r1.error) && !r2.ok && /greater than zero/i.test(r2.error),
      detail: r1.error + ' | ' + r2.error };
  });
})();

/* ============ 7. contract-milestone-tracker ============ */
(function () {
  var M = req('contract-milestone-tracker');
  var slug = 'contract-milestone-tracker';

  t(slug, 'delayed flag + delayDays; due-soon band', function () {
    var a = M.addMilestone([], { name: 'M1', due: '2026-09-20', pctComplete: 40 });
    var b = M.addMilestone(a.list, { name: 'M2', due: '2026-09-30', pctComplete: 10 });
    var sa = M.milestoneStatus(a.milestone, '2026-09-26');
    var sb = M.milestoneStatus(b.milestone, '2026-09-26');
    var sc = M.milestoneStatus({ pctComplete: 100, due: '2026-01-01' }, '2026-09-26');
    return { pass: sa.status === 'delayed' && sa.delayDays === 6 && sb.status === 'due-soon' && sc.status === 'complete',
      detail: sa.status + '/' + sa.delayDays + ' ' + sb.status + ' ' + sc.status };
  });

  t(slug, 'weighted progress + payment summary', function () {
    var a = M.addMilestone([], { name: 'M1', due: '2026-10-10', weight: 70, pctComplete: 100, payment: 300000 });
    var b = M.addMilestone(a.list, { name: 'M2', due: '2026-11-10', weight: 30, pctComplete: 50, payment: 200000 });
    var p = M.progress(b.list);
    var ps = M.paymentSummary(b.list).summary;
    // progress = 100*0.7 + 50*0.3 = 85
    return { pass: eq(p.pct, 85) && ps.total === 500000 && ps.released === 300000 && ps.pending === 200000,
      detail: 'progress=' + p.pct + ' released=' + ps.released };
  });

  t(slug, 'equal weights when all weights are 0', function () {
    var a = M.addMilestone([], { name: 'M1', due: '2026-10-10', pctComplete: 100 });
    var b = M.addMilestone(a.list, { name: 'M2', due: '2026-11-10', pctComplete: 0 });
    var p = M.progress(b.list);
    return { pass: eq(p.pct, 50), detail: 'progress=' + p.pct };
  });

  t(slug, 'ADVERSARIAL: invalid due date rejected', function () {
    var r = M.addMilestone([], { name: 'M', due: '2026-13-01', pctComplete: 0 });
    return { pass: !r.ok && /real calendar|YYYY-MM-DD/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: updatePct >100 rejected; 26th milestone rejected', function () {
    var a = M.addMilestone([], { name: 'M', due: '2026-10-10', pctComplete: 0 });
    var u = M.updatePct(a.list, a.milestone.id, 101);
    var list = [];
    for (var i = 0; i < 25; i++) { var r = M.addMilestone(list, { name: 'M' + i, due: '2026-12-01' }); list = r.list; }
    var last = M.addMilestone(list, { name: 'Extra', due: '2026-12-01' });
    return { pass: !u.ok && /too large/i.test(u.error) && !last.ok && /full/i.test(last.error),
      detail: u.error + ' | ' + last.error };
  });
})();

/* ============ 8. project-delay-penalty-tool ============ */
(function () {
  var P = req('project-delay-penalty-tool');
  var slug = 'project-delay-penalty-tool';

  t(slug, 'REQUIRED SAMPLE: 1cr, 14 days, 0.5%/wk -> 2 wks -> Rs 1,00,000', function () {
    var r = P.ld({ contractValue: 10000000, delayDays: 14, ratePct: 0.5, capPct: 10 });
    return { pass: r.ok && r.weeks === 2 && eq(r.perWeek, 50000) && eq(r.payable, 100000) && !r.capped,
      detail: 'weeks=' + r.weeks + ' payable=' + r.payable };
  });

  t(slug, 'part-week rounds up; cap enforced at 10%', function () {
    var r1 = P.ld({ contractValue: 10000000, delayDays: 8, ratePct: 0.5, capPct: 10 }); // 2 wks = 100k
    var r2 = P.ld({ contractValue: 10000000, delayDays: 200, ratePct: 0.5, capPct: 10 }); // 29 wks = 14.5L -> cap 10L
    return { pass: r1.ok && r1.weeks === 2 && eq(r1.payable, 100000) &&
      r2.ok && r2.capped && eq(r2.payable, 1000000),
      detail: 'r1=' + r1.payable + ' r2=' + r2.payable + ' capped=' + r2.capped };
  });

  t(slug, 'grace days excluded; daysBetween helper', function () {
    var r = P.ld({ contractValue: 10000000, delayDays: 21, ratePct: 0.5, capPct: 10, graceDays: 7 }); // 14 chargeable -> 2 wks
    var d = P.daysBetween('2026-09-01', '2026-09-26');
    return { pass: r.ok && r.chargeableDays === 14 && r.weeks === 2 && d.ok && d.value === 25,
      detail: 'chargeable=' + r.chargeableDays + ' daysBetween=' + d.value };
  });

  t(slug, 'ADVERSARIAL: negative delay rejected', function () {
    var r = P.ld({ contractValue: 10000000, delayDays: -5, ratePct: 0.5, capPct: 10 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: rate >5% rejected (implausible LD rate)', function () {
    var r = P.ld({ contractValue: 10000000, delayDays: 14, ratePct: 8, capPct: 10 });
    return { pass: !r.ok && /too large/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 9. tender-submission-checklist ============ */
(function () {
  var S = req('tender-submission-checklist');
  var slug = 'tender-submission-checklist';

  t(slug, 'defaults: 16 technical + 6 financial; completion 0% -> tick all -> ready', function () {
    var cl = S.defaultChecklist();
    var c0 = S.completion(cl);
    // tick everything
    ['technical', 'financial'].forEach(function (sec) {
      cl[sec].forEach(function (d) {
        var r = S.toggleDoc(cl, sec, d.id);
        cl = r.checklist;
      });
    });
    var c1 = S.completion(cl);
    return { pass: cl.technical.length === 16 && cl.financial.length === 6 &&
      c0.ok && c0.overall === 0 && c1.ok && c1.overall === 100 && c1.ready,
      detail: 'tech=' + cl.technical.length + ' fin=' + cl.financial.length + ' ready=' + c1.ready };
  });

  t(slug, 'partial: 1 of 22 -> 4.5%; pendingList names it', function () {
    var cl = S.defaultChecklist();
    var r = S.toggleDoc(cl, 'technical', cl.technical[0].id);
    var c = S.completion(r.checklist);
    var pend = S.pendingList(r.checklist).pending;
    return { pass: eq(c.overall, 4.5) && pend.length === 21 && !c.ready,
      detail: 'overall=' + c.overall + ' pending=' + pend.length };
  });

  t(slug, 'ADVERSARIAL: invalid section rejected', function () {
    var cl = S.defaultChecklist();
    var r = S.addDoc(cl, 'envelope3', 'Mystery doc');
    return { pass: !r.ok && /technical.*financial/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: duplicate document rejected', function () {
    var cl = S.defaultChecklist();
    var r = S.addDoc(cl, 'technical', 'pan card (firm / company)');
    return { pass: !r.ok && /already/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: XSS doc name escaped', function () {
    var out = S.esc('"><img src=x onerror=alert(1)>');
    return { pass: out.indexOf('<img') === -1 && out.indexOf('&lt;img') !== -1, detail: out };
  });
})();

/* ============ 10. contractor-payment-manager ============ */
(function () {
  var A = req('contractor-payment-manager');
  var slug = 'contractor-payment-manager';

  t(slug, 'bill stats: 5L certified, 3L paid, 10% holdback -> unpaid 2L, holdback 50k, collectible 1.5L', function () {
    var r = A.addBill([], { billNo: 'RA-01', date: '2026-08-01', certified: 500000, paid: 300000, holdbackPct: 10 });
    if (!r.ok) return { pass: false, detail: r.error };
    var st = A.billStats(r.bill, '2026-09-26');
    return { pass: st.ok && eq(st.unpaid, 200000) && eq(st.holdback, 50000) &&
      eq(st.collectible, 150000) && st.bucket === '31-60' && st.ageDays === 56,
      detail: 'unpaid=' + st.unpaid + ' bucket=' + st.bucket };
  });

  t(slug, 'recordPayment accumulates; summary + 90+ aging bucket', function () {
    var a = A.addBill([], { billNo: 'RA-01', date: '2026-05-01', certified: 500000, paid: 0, holdbackPct: 10 });
    var b = A.addBill(a.list, { billNo: 'RA-02', date: '2026-09-20', certified: 200000, paid: 200000, holdbackPct: 0 });
    var p = A.recordPayment(b.list, a.bill.id, 100000);
    if (!p.ok) return { pass: false, detail: p.error };
    var s = A.registerSummary(p.list, '2026-09-26').summary;
    // RA-01: unpaid 400k, bucket 90+; RA-02: unpaid 0
    return { pass: s.bills === 2 && eq(s.certified, 700000) && eq(s.paid, 300000) &&
      eq(s.unpaid, 400000) && eq(s.buckets['90+'], 400000) && eq(s.recoveryPct, 42.86),
      detail: 'unpaid=' + s.unpaid + ' 90+=' + s.buckets['90+'] + ' recovery=' + s.recoveryPct };
  });

  t(slug, 'ADVERSARIAL: paid > certified rejected at add', function () {
    var r = A.addBill([], { billNo: 'RA-01', date: '2026-08-01', certified: 100000, paid: 150000, holdbackPct: 0 });
    return { pass: !r.ok && /exceed/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: payment that would overpay rejected', function () {
    var a = A.addBill([], { billNo: 'RA-01', date: '2026-08-01', certified: 100000, paid: 90000, holdbackPct: 0 });
    var r = A.recordPayment(a.list, a.bill.id, 20000);
    return { pass: !r.ok && /exceed/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: duplicate bill no. rejected', function () {
    var a = A.addBill([], { billNo: 'RA-01', date: '2026-08-01', certified: 100000, paid: 0, holdbackPct: 0 });
    var r = A.addBill(a.list, { billNo: 'ra-01', date: '2026-08-02', certified: 50000, paid: 0, holdbackPct: 0 });
    return { pass: !r.ok && /already/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team L (10 tender/project) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
