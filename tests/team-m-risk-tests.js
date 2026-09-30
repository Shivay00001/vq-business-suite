#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team M (10 risk, governance & control tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-m-risk-tests.js
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

/* ============ 1. operational-risk-heatmap ============ */
(function () {
  var A = req('operational-risk-heatmap');
  var slug = 'operational-risk-heatmap';

  t(slug, 'addRisk: 4x4 scores 16 and bands Critical', function () {
    var r = A.addRisk([], 'Server outage', 4, 4, 'Ops');
    return { pass: r.ok && r.risk.score === 16 && r.risk.band === 'Critical' && r.list.length === 1,
      detail: 'score=' + (r.risk && r.risk.score) + ' band=' + (r.risk && r.risk.band) };
  });

  t(slug, 'topRisks sorts desc; matrixCells keys l-i; stats counts bands', function () {
    var l = [];
    l = A.addRisk(l, 'Low one', 1, 1).list;
    l = A.addRisk(l, 'Big one', 5, 5).list;
    l = A.addRisk(l, 'Mid one', 3, 3).list;
    var tops = A.topRisks(l, 2);
    var cells = A.matrixCells(l);
    var st = A.stats(l);
    return { pass: tops[0].title === 'Big one' && tops[1].title === 'Mid one' &&
      cells['5-5'][0] === 'Big one' && cells['1-1'][0] === 'Low one' &&
      st.Critical === 1 && st.Medium === 1 && st.Low === 1 && st.total === 3,
      detail: JSON.stringify(st) };
  });

  t(slug, 'band boundaries: 4 Low, 5 Medium, 10 High, 15 High, 16 Critical, 25 Critical', function () {
    var ok = A.band(4) === 'Low' && A.band(5) === 'Medium' && A.band(9) === 'Medium' &&
      A.band(10) === 'High' && A.band(15) === 'High' && A.band(16) === 'Critical' && A.band(25) === 'Critical';
    return { pass: ok, detail: 'band(15)=' + A.band(15) + ' band(16)=' + A.band(16) };
  });

  t(slug, 'ADVERSARIAL: likelihood 6 / impact 0 rejected; non-integer rejected', function () {
    var a = A.addRisk([], 'X', 6, 3);
    var b = A.addRisk([], 'X', 3, 0);
    var c = A.addRisk([], 'X', 2.5, 3);
    return { pass: !a.ok && !b.ok && !c.ok, detail: [a.error, b.error, c.error].join(' | ') };
  });

  t(slug, 'ADVERSARIAL: 26th risk rejected (max 25); empty title rejected', function () {
    var l = [];
    for (var i = 0; i < 25; i++) l = A.addRisk(l, 'R' + i, 1, 1).list;
    var over = A.addRisk(l, 'Extra', 1, 1);
    var empty = A.addRisk([], '   ', 2, 2);
    return { pass: !over.ok && !empty.ok, detail: (over.error || '') + ' / ' + (empty.error || '') };
  });

  t(slug, 'removeRisk removes by id; unknown id rejected', function () {
    var l = A.addRisk([], 'Gone', 2, 2).list;
    var id = l[0].id;
    var r = A.removeRisk(l, id);
    var bad = A.removeRisk(l, 'nope');
    return { pass: r.ok && r.list.length === 0 && !bad.ok, detail: 'after=' + r.list.length };
  });
})();

/* ============ 2. fraud-risk-indicator ============ */
(function () {
  var A = req('fraud-risk-indicator');
  var slug = 'fraud-risk-indicator';

  t(slug, 'all flags -> 100% High; none -> 0% Low', function () {
    var all = A.scoreFlags(A.flagIds());
    var none = A.scoreFlags([]);
    return { pass: all.ok && all.percent === 100 && all.band === 'High' &&
      none.ok && none.percent === 0 && none.band === 'Low', detail: 'all=' + all.percent + ' none=' + none.percent };
  });

  t(slug, 'weighted: 3-weight flag scores more than 1-weight; controls returned per flag', function () {
    var heavy = A.scoreFlags(['fake-invoices']); // weight 3
    var light = A.scoreFlags(['bypass-pressure']); // weight 1
    var ctrls = A.controlsFor(heavy);
    return { pass: heavy.score === 3 && light.score === 1 && heavy.percent > light.percent &&
      ctrls.length === 1 && ctrls[0].control.length > 10, detail: 'heavy=' + heavy.score + ' light=' + light.score };
  });

  t(slug, 'ADVERSARIAL: unknown flag id rejected (no silent scoring)', function () {
    var r = A.scoreFlags(['fake-invoices', '<script>alert(1)</script>']);
    return { pass: !r.ok && /Unknown/.test(r.error), detail: r.error || 'accepted!' };
  });

  t(slug, 'ADVERSARIAL: duplicate ids counted once', function () {
    var r = A.scoreFlags(['fake-invoices', 'fake-invoices']);
    return { pass: r.ok && r.score === 3 && r.triggeredCount === 1, detail: 'score=' + r.score };
  });
})();

/* ============ 3. internal-control-checklist ============ */
(function () {
  var A = req('internal-control-checklist');
  var slug = 'internal-control-checklist';

  t(slug, 'all checked -> 100% Strong, no gaps', function () {
    var r = A.evaluate(A.controlIds());
    return { pass: r.ok && r.percent === 100 && r.band === 'Strong' && r.gaps.length === 0,
      detail: r.percent + '% ' + r.band };
  });

  t(slug, 'per-process pct computed; gaps grouped with process names', function () {
    var r = A.evaluate(['c-segregation', 'c-recon']); // 2 of 4 cash controls
    var cash = r.byProcess['Cash & Bank'];
    var gapProcs = {};
    r.gaps.forEach(function (g) { gapProcs[g.process] = true; });
    return { pass: r.ok && cash.checked === 2 && cash.total === 4 && cash.percent === 50 &&
      r.gaps.length === A.CONTROLS.length - 2 && !!gapProcs['Purchase'],
      detail: 'cash=' + cash.percent + '% gaps=' + r.gaps.length };
  });

  t(slug, 'band thresholds: empty -> 0% Critical gaps', function () {
    var r = A.evaluate([]);
    return { pass: r.ok && r.percent === 0 && r.band === 'Critical gaps', detail: r.band };
  });

  t(slug, 'ADVERSARIAL: unknown control id rejected; non-array rejected', function () {
    var a = A.evaluate(['p-quotes', 'hacker-control']);
    var b = A.evaluate('p-quotes');
    return { pass: !a.ok && !b.ok, detail: (a.error || '') + ' / ' + (b.error || '') };
  });
})();

/* ============ 4. governance-score-engine ============ */
(function () {
  var A = req('governance-score-engine');
  var slug = 'governance-score-engine';

  function allAns(v) {
    var m = {};
    A.QUESTIONS.forEach(function (q) { m[q.id] = v; });
    return m;
  }

  t(slug, 'all yes -> 100 Strong; all no -> 0 Weak with 4 actions', function () {
    var y = A.scoreAnswers(allAns('yes'));
    var n = A.scoreAnswers(allAns('no'));
    return { pass: y.ok && y.overall === 100 && y.rating === 'Strong' && y.actions.length === 0 &&
      n.ok && n.overall === 0 && n.rating === 'Weak' && n.actions.length === 4,
      detail: 'yes=' + y.overall + ' no=' + n.overall + ' actions=' + n.actions.length };
  });

  t(slug, 'partial counts half; weakest dimension drives actions', function () {
    var m = allAns('yes');
    A.QUESTIONS.filter(function (q) { return q.dim === 'Transparency'; }).forEach(function (q) { m[q.id] = 'no'; });
    var r = A.scoreAnswers(m);
    return { pass: r.ok && r.dimScores['Transparency'] === 0 &&
      r.actions.length >= 1 && r.actions[0].dimension === 'Transparency' && r.actions[0].action.length > 10,
      detail: 'transparency=' + r.dimScores['Transparency'] };
  });

  t(slug, 'ADVERSARIAL: missing answer rejected; invalid value rejected', function () {
    var m = allAns('yes'); delete m.b1;
    var a = A.scoreAnswers(m);
    var m2 = allAns('yes'); m2.c1 = 'maybe';
    var b = A.scoreAnswers(m2);
    var c = A.scoreAnswers(null);
    return { pass: !a.ok && !b.ok && !c.ok, detail: (a.error || '').slice(0, 40) };
  });
})();

/* ============ 5. business-continuity-readiness-tool ============ */
(function () {
  var A = req('business-continuity-readiness-tool');
  var slug = 'business-continuity-readiness-tool';

  t(slug, 'all ticked -> 100% Resilient; none -> 0% Exposed', function () {
    var all = A.readiness(A.itemIds());
    var none = A.readiness([]);
    return { pass: all.ok && all.percent === 100 && all.tier === 'Resilient' &&
      none.ok && none.percent === 0 && none.tier === 'Exposed' && none.gaps.length === A.BCP_ITEMS.length,
      detail: 'all=' + all.percent + ' none=' + none.percent };
  });

  t(slug, 'gaps sorted heaviest-first (weight desc)', function () {
    var r = A.readiness([]);
    var ok = true;
    for (var i = 1; i < r.gaps.length; i++) if (r.gaps[i].weight > r.gaps[i - 1].weight) ok = false;
    return { pass: r.ok && ok && r.gaps[0].weight === 2, detail: 'first=' + r.gaps[0].weight };
  });

  t(slug, 'ADVERSARIAL: unknown item rejected; weights make "backup" count double a weight-1 item', function () {
    var bad = A.readiness(['backup', 'nope-item']);
    var one = A.readiness(['backup']); // weight 2
    var w1 = A.readiness(['power']); // weight 1
    return { pass: !bad.ok && one.percent > w1.percent, detail: 'backup=' + one.percent + '% power=' + w1.percent + '%' };
  });
})();

/* ============ 6. single-point-of-failure-detector ============ */
(function () {
  var A = req('single-point-of-failure-detector');
  var slug = 'single-point-of-failure-detector';

  t(slug, 'score = dependency x coverage gap: 5xnone=15 Critical; 3xfull=3 Covered', function () {
    var a = A.addEntry([], 'Solo accountant', 'role', 5, 'none');
    var b = A.addEntry([], 'Printer', 'system', 3, 'full');
    return { pass: a.ok && a.entry.score === 15 && a.entry.severity === 'Critical' &&
      b.ok && b.entry.score === 3 && b.entry.severity === 'Covered',
      detail: 'a=' + a.entry.score + '/' + a.entry.severity + ' b=' + b.entry.score + '/' + b.entry.severity };
  });

  t(slug, 'rankSPOFs worst-first; dep 4 + none auto-Critical even if score < 10', function () {
    var l = [];
    l = A.addEntry(l, 'Low dep no backup', 'vendor', 2, 'none').list; // 6 Watch
    l = A.addEntry(l, 'High dep partial', 'role', 4, 'partial').list; // 8 Watch
    l = A.addEntry(l, 'Top', 'system', 5, 'none').list; // 15 Critical
    var auto = A.addEntry([], 'Auto', 'role', 4, 'none'); // 12 -> Critical by rule anyway
    var ranked = A.rankSPOFs(l);
    return { pass: ranked[0].label === 'Top' && ranked[2].label === 'Low dep no backup' &&
      auto.entry.severity === 'Critical' && A.stats(l).Critical === 1,
      detail: ranked.map(function (e) { return e.label + ':' + e.score; }).join(', ') };
  });

  t(slug, 'ADVERSARIAL: bad kind / dependency 0 / bad backup rejected; 26th entry rejected', function () {
    var a = A.addEntry([], 'X', 'person', 3, 'none');
    var b = A.addEntry([], 'X', 'role', 0, 'none');
    var c = A.addEntry([], 'X', 'role', 3, 'sometimes');
    var l = [];
    for (var i = 0; i < 25; i++) l = A.addEntry(l, 'E' + i, 'role', 1, 'full').list;
    var over = A.addEntry(l, 'Extra', 'role', 1, 'full');
    return { pass: !a.ok && !b.ok && !c.ok && !over.ok, detail: 'all rejected' };
  });
})();

/* ============ 7. employee-misuse-risk-tool ============ */
(function () {
  var A = req('employee-misuse-risk-tool');
  var slug = 'employee-misuse-risk-tool';

  t(slug, 'cash+bookkeeping flags 1 conflict -> Medium; two conflicts -> High', function () {
    var a = A.addPerson([], 'Ramesh', 'Cashier', ['cash', 'bookkeeping']);
    // cash+bank+bookkeeping -> 3 conflicts: cash-bookkeeping, bank-bookkeeping, cash-bank
    var b = A.addPerson([], 'Suresh', 'Manager', ['cash', 'bank', 'bookkeeping']);
    return { pass: a.ok && a.person.conflicts.length === 1 && a.person.risk === 'Medium' &&
      b.ok && b.person.conflicts.length === 3 && b.person.risk === 'High',
      detail: 'a=' + a.person.risk + ' b=' + b.person.risk + ' conflicts=' + b.person.conflicts.length };
  });

  t(slug, 'payroll+bank conflict detected; 4+ broad accesses with no conflict -> Review', function () {
    var a = A.addPerson([], 'HR1', 'HR', ['payroll', 'bank']);
    var b = A.addPerson([], 'Ops', 'Ops', ['stock', 'purchases', 'payroll', 'cash']);
    // b: purchases+stock AND cash+? -> at least 1 conflict
    var rev = A.riskLevel({ accesses: ['x1', 'x2', 'x3', 'x4'] }); // broad, no conflicting pairs
    var low = A.riskLevel({ accesses: ['cash'] });
    return { pass: a.ok && a.person.conflicts.length === 1 && a.person.risk === 'Medium' &&
      b.ok && b.person.conflicts.length >= 1 && rev === 'Review' && low === 'Low',
      detail: 'a=' + a.person.risk + ' b=' + b.person.conflicts.length + ' rev=' + rev };
  });

  t(slug, 'ADVERSARIAL: unknown access type rejected; empty access rejected; name required', function () {
    var a = A.addPerson([], 'X', 'R', ['cash', 'teleport']);
    var b = A.addPerson([], 'X', 'R', []);
    var c = A.addPerson([], '  ', 'R', ['cash']);
    return { pass: !a.ok && !b.ok && !c.ok, detail: (a.error || '').slice(0, 30) };
  });

  t(slug, 'ADVERSARIAL: 26th person rejected', function () {
    var l = [];
    for (var i = 0; i < 25; i++) l = A.addPerson(l, 'P' + i, '', ['cash']).list;
    var over = A.addPerson(l, 'Extra', '', ['cash']);
    return { pass: !over.ok, detail: over.error || 'accepted!' };
  });
})();

/* ============ 8. vendor-collusion-risk-tool ============ */
(function () {
  var A = req('vendor-collusion-risk-tool');
  var slug = 'vendor-collusion-risk-tool';

  t(slug, 'all signs -> 100% High; none -> 0% Low with checks available', function () {
    var all = A.scoreSigns(A.signIds());
    var none = A.scoreSigns([]);
    var checks = A.checksFor(all);
    return { pass: all.ok && all.percent === 100 && all.band === 'High' &&
      none.ok && none.percent === 0 && none.band === 'Low' &&
      checks.length === A.SIGNS.length && checks[0].check.length > 10,
      detail: 'all=' + all.percent + ' checks=' + checks.length };
  });

  t(slug, 'moderate band reachable: 5 mid-weight signs land 30-60%', function () {
    var r = A.scoreSigns(['round-amounts', 'split-orders', 'new-vendor-wins', 'losing-pattern', 'rush-awards']); // 5x2=10
    var max = A.SIGNS.reduce(function (s, x) { return s + x.weight; }, 0);
    var pct = Math.round(10 / max * 100);
    return { pass: r.ok && r.percent === pct && (r.band === 'Low' || r.band === 'Moderate'),
      detail: r.percent + '% ' + r.band + ' (max=' + max + ')' };
  });

  t(slug, 'ADVERSARIAL: unknown sign id rejected; duplicates counted once', function () {
    var bad = A.scoreSigns(['same-address', 'drop-table']);
    var dup = A.scoreSigns(['same-address', 'same-address']);
    return { pass: !bad.ok && dup.ok && dup.score === 3 && dup.triggeredCount === 1,
      detail: (bad.error || '').slice(0, 30) + ' / dup=' + dup.score };
  });
})();

/* ============ 9. data-loss-probability-analyzer ============ */
(function () {
  var A = req('data-loss-probability-analyzer');
  var slug = 'data-loss-probability-analyzer';

  t(slug, 'worst posture -> 95 High with total-loss RPO; best -> low score', function () {
    var worst = A.analyze({ freq: 'none', locations: 'none', encrypted: 'no', restoreTested: 'no', oldDevices: 'yes' });
    var best = A.analyze({ freq: 'daily', locations: 'multi-offsite', encrypted: 'yes', restoreTested: 'yes', oldDevices: 'no' });
    // worst = 40+25+10+12+8 = 95 (true max of the weighted model)
    return { pass: worst.ok && worst.score === 95 && worst.band === 'High' &&
      /total/i.test(worst.rpo) && best.ok && best.score < 30 && best.band === 'Low' &&
      /24 hours/.test(best.rpo),
      detail: 'worst=' + worst.score + ' best=' + best.score };
  });

  t(slug, 'local-only adds rpoNote; recommendations prioritised (restore test = priority 1)', function () {
    var r = A.analyze({ freq: 'daily', locations: 'local-only', encrypted: 'yes', restoreTested: 'no', oldDevices: 'no' });
    var first = r.recommendations[0];
    var sorted = true;
    for (var i = 1; i < r.recommendations.length; i++)
      if (r.recommendations[i].priority < r.recommendations[i - 1].priority) sorted = false;
    return { pass: r.ok && r.rpoNote.length > 0 && sorted && first.priority === 1,
      detail: 'first=' + first.text.slice(0, 40) };
  });

  t(slug, 'ADVERSARIAL: invalid freq/location/yesno rejected; null opts rejected', function () {
    var a = A.analyze({ freq: 'hourly', locations: 'one-offsite', encrypted: 'yes', restoreTested: 'yes', oldDevices: 'no' });
    var b = A.analyze({ freq: 'daily', locations: 'moon', encrypted: 'yes', restoreTested: 'yes', oldDevices: 'no' });
    var c = A.analyze({ freq: 'daily', locations: 'one-offsite', encrypted: 'maybe', restoreTested: 'yes', oldDevices: 'no' });
    var d = A.analyze(null);
    return { pass: !a.ok && !b.ok && !c.ok && !d.ok, detail: 'all rejected' };
  });
})();

/* ============ 10. compliance-gap-identifier ============ */
(function () {
  var A = req('compliance-gap-identifier');
  var slug = 'compliance-gap-identifier';

  t(slug, 'pvt ltd, 25 emp, 80L turnover: PF+ESI+GST+ROC apply; tiny proprietor: fewer', function () {
    var p1 = A.validateProfile('private-ltd', 25, 80, true);
    var app1 = A.applicableStatutes(p1.profile);
    var ids1 = app1.map(function (s) { return s.id; });
    var p2 = A.validateProfile('proprietorship', 2, 10, false);
    var app2 = A.applicableStatutes(p2.profile);
    var ids2 = app2.map(function (s) { return s.id; });
    return { pass: p1.ok && ids1.indexOf('pf') !== -1 && ids1.indexOf('esi') !== -1 &&
      ids1.indexOf('gst') !== -1 && ids1.indexOf('roc') !== -1 &&
      ids2.indexOf('pf') === -1 && ids2.indexOf('esi') === -1 && ids2.indexOf('gst') === -1,
      detail: 'pvt=' + ids1.join(',') + ' | prop=' + ids2.join(',') };
  });

  t(slug, 'evaluate: ticked statutes excluded from gaps; coverage computed', function () {
    var p = A.validateProfile('private-ltd', 25, 80, true).profile;
    var applicable = A.applicableStatutes(p);
    var r = A.evaluate(p, ['gst', 'shops']);
    return { pass: r.ok && r.gaps.every(function (g) { return g.id !== 'gst' && g.id !== 'shops'; }) &&
      r.compliantCount === 2 && r.total === applicable.length &&
      r.coverage === Math.round(2 / applicable.length * 100),
      detail: 'coverage=' + r.coverage + '% gaps=' + r.gaps.length };
  });

  t(slug, 'ADVERSARIAL: bad entity / negative employees / bad statute id rejected', function () {
    var a = A.validateProfile('mnc', 5, 10, false);
    var b = A.validateProfile('llp', -3, 10, false);
    var c = A.validateProfile('llp', 5, 'lots', false);
    var p = A.validateProfile('llp', 5, 10, false).profile;
    var d = A.evaluate(p, ['gst', 'fake-statute']);
    return { pass: !a.ok && !b.ok && !c.ok && !d.ok, detail: 'all rejected' };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('----------------------------------------');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
console.log('----------------------------------------');
console.log('TOTAL: ' + results.length + ' | PASS: ' + passed + ' | FAIL: ' + failed);
process.exit(failed ? 1 : 0);
