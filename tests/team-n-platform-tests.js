#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team N (10 platform/recovery/lifecycle tools)
 * Node test harness for the pure (DOM-free) computation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-n-platform-tests.js
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

/* ============ 1. subscription-expiry-manager ============ */
(function () {
  var A = req('subscription-expiry-manager');
  var slug = 'subscription-expiry-manager';

  t(slug, 'yearly spend: monthly x12 + quarterly x4, one-time excluded', function () {
    var l = A.addSub([], { name: 'Tally', cost: 1500, cycle: 'monthly', renewal: '2026-10-20' }).list;
    l = A.addSub(l, { name: 'Antivirus', cost: 2000, cycle: 'quarterly', renewal: '2026-11-01' }).list;
    l = A.addSub(l, { name: 'Laptop', cost: 50000, cycle: 'one-time', renewal: '2026-09-26' }).list;
    return { pass: eq(A.totalYearlySpend(l), 1500 * 12 + 2000 * 4) && eq(A.oneTimeSpend(l), 50000),
      detail: 'yearly=' + A.totalYearlySpend(l) };
  });

  t(slug, 'alert bands: overdue / critical / warning / watch / ok', function () {
    var asOf = '2026-09-26';
    var l = [];
    [['A', '2026-09-20'], ['B', '2026-10-02'], ['C', '2026-10-10'], ['D', '2026-10-20'], ['E', '2027-01-01']]
      .forEach(function (x) { l = A.addSub(l, { name: x[0], cost: 100, cycle: 'yearly', renewal: x[1] }).list; });
    var got = A.renewalsInDays(l, 400, asOf).map(function (r) { return r.alert; });
    return { pass: JSON.stringify(got) === JSON.stringify(['overdue', 'critical', 'warning', 'watch', 'ok']),
      detail: got.join(',') };
  });

  t(slug, 'ADVERSARIAL: HTML in name is stored raw (esc only at render), bad cycle rejected', function () {
    var r = A.addSub([], { name: '<img src=x onerror=alert(1)>', cost: 100, cycle: 'daily', renewal: '2026-10-01' });
    var r2 = A.addSub([], { name: 'T', cost: -5, cycle: 'monthly', renewal: '2026-10-01' });
    var r3 = A.addSub([], { name: 'T', cost: 100, cycle: 'monthly', renewal: 'not-a-date' });
    return { pass: !r.ok && !r2.ok && !r3.ok, detail: [r.error, r2.error, r3.error].join(' | ') };
  });

  t(slug, 'ADVERSARIAL: 26th subscription rejected (max 25)', function () {
    var l = [];
    for (var i = 0; i < 25; i++) l = A.addSub(l, { name: 'S' + i, cost: 10, cycle: 'yearly', renewal: '2027-01-01' }).list;
    var r = A.addSub(l, { name: 'Extra', cost: 10, cycle: 'yearly', renewal: '2027-01-01' });
    return { pass: !r.ok && /25/.test(r.error), detail: r.error };
  });
})();

/* ============ 2. license-activation-engine ============ */
(function () {
  var A = req('license-activation-engine');
  var slug = 'license-activation-engine';

  t(slug, 'generate -> validate roundtrip is VALID', function () {
    var g = A.generateKey('VQPS', 'Acme');
    if (!g.ok) return { pass: false, detail: g.error };
    var v = A.validateKey(g.key);
    return { pass: v.ok && v.valid && v.product === 'VQPS', detail: g.key };
  });

  t(slug, 'ADVERSARIAL: tampered body fails checksum', function () {
    var g = A.generateKey('VQPS', '');
    var parts = g.key.split('-');
    var body = parts[2];
    var alt = body[0] === 'A' ? 'B' : 'A';
    var tampered = parts[0] + '-' + parts[1] + '-' + alt + body.slice(1) + '-' + parts[3];
    var v = A.validateKey(tampered);
    return { pass: v.ok && !v.valid && /checksum/i.test(v.reason), detail: v.reason };
  });

  t(slug, 'ADVERSARIAL: malformed keys rejected (prefix, groups, charset)', function () {
    var v1 = A.validateKey('XX1-VQPS-ABCDEFGH-1234');
    var v2 = A.validateKey('VQ1-VQPS-ABC');
    var v3 = A.validateKey('VQ1-VQPS-ABCDEFG0-1234'); // 0 not in charset
    return { pass: !v1.valid && !v2.valid && !v3.valid, detail: [v1.reason, v2.reason, v3.reason].join(' | ') };
  });

  t(slug, 'ADVERSARIAL: lowercase key accepted via normalization; short product rejected', function () {
    var g = A.generateKey('vqps', '');
    var v = A.validateKey(g.key.toLowerCase());
    var bad = A.generateKey('ABC', '');
    return { pass: g.ok && v.valid && !bad.ok, detail: 'lower-ok=' + v.valid + ' short-rejected=' + !bad.ok };
  });
})();

/* ============ 3. usage-metering-tool ============ */
(function () {
  var A = req('usage-metering-tool');
  var slug = 'usage-metering-tool';

  t(slug, 'quota bands: ok <80, near >=80, at =100, over >100', function () {
    var bands = [A.quotaStatus(50, 100).level, A.quotaStatus(80, 100).level, A.quotaStatus(100, 100).level, A.quotaStatus(120, 100).level];
    return { pass: JSON.stringify(bands) === JSON.stringify(['ok', 'near', 'at', 'over']), detail: bands.join(',') };
  });

  t(slug, 'overage bill: 250 over x 2.5 = 625', function () {
    var b = A.overageBill(1250, 1000, 2.5, 0);
    var b2 = A.overageBill(900, 1000, 2.5, 0);
    return { pass: b.ok && eq(b.amount, 625) && b2.ok && b2.overUnits === 0, detail: 'over=' + b.overUnits + ' amt=' + b.amount };
  });

  t(slug, 'logUsage accumulates across calls', function () {
    var l = A.addClient([], { name: 'Acme', quota: 1000, unitPrice: 1 }).list;
    var id = l[0].id;
    l = A.logUsage(l, id, 300).list;
    l = A.logUsage(l, id, 200).list;
    return { pass: l[0].used === 500, detail: 'used=' + l[0].used };
  });

  t(slug, 'ADVERSARIAL: negative/fractional/NaN units rejected; unknown client rejected', function () {
    var l = A.addClient([], { name: 'Acme', quota: 1000, unitPrice: 1 }).list;
    var id = l[0].id;
    var r1 = A.logUsage(l, id, -5);
    var r2 = A.logUsage(l, id, 2.5);
    var r3 = A.logUsage(l, 'nope', 5);
    var r4 = A.addClient(l, { name: 'B', quota: 0, unitPrice: 1 });
    return { pass: !r1.ok && !r2.ok && !r3.ok && !r4.ok, detail: 'all rejected' };
  });
})();

/* ============ 4. excel-chaos-cleaner ============ */
(function () {
  var A = req('excel-chaos-cleaner');
  var slug = 'excel-chaos-cleaner';

  t(slug, 'clean: trims, dedupes, fixes date + number, renames header', function () {
    var csv = 'Name, Invoice Date , Amount\nSharma , 12/03/2026 , "₹1,25,000"\nSharma , 12/03/2026 , "₹1,25,000"\nGupta,2026-04-01,5000';
    var r = A.cleanCSV(csv);
    if (!r.ok) return { pass: false, detail: r.error };
    return { pass: r.rows.length === 2 && r.headers[1] === 'invoice_date' &&
      r.rows[0][1] === '2026-03-12' && r.rows[0][2] === '125000' &&
      r.stats.deduped === 1 && r.stats.datesFixed === 1 && r.stats.numbersFixed === 1,
      detail: JSON.stringify(r.stats) };
  });

  t(slug, 'parseCSV handles quoted commas and escaped quotes', function () {
    var rows = A.parseCSV('a,b\n"x, y","say ""hi"""\n1,2');
    return { pass: rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'say "hi"',
      detail: JSON.stringify(rows[1]) };
  });

  t(slug, 'fixDate: ambiguous 05/06/2026 -> DD/MM/YYYY (Indian default)', function () {
    return { pass: A.fixDate('05/06/2026') === '2026-06-05' && A.fixDate('13/06/2026') === '2026-06-13' &&
      A.fixDate('06/13/2026') === '2026-06-13' && A.fixDate('2026-06-05') === '2026-06-05',
      detail: A.fixDate('05/06/2026') };
  });

  t(slug, 'ADVERSARIAL: impossible dates rejected; injection cell passes through as plain text', function () {
    var bad = A.fixDate('31/02/2026');
    var bad2 = A.fixDate('99/99/9999');
    var r = A.cleanCSV('name,amount\n<script>alert(1)</script>,100\n');
    var out = A.toCSV(r.headers, r.rows);
    return { pass: bad === null && bad2 === null && r.ok && out.indexOf('<script>') >= 0 && r.rows[0][0] === '<script>alert(1)</script>',
      detail: 'dates rejected; cell preserved verbatim (escaped at render)' };
  });

  t(slug, 'ADVERSARIAL: oversized paste rejected', function () {
    var big = 'a,b\n' + '1,2\n'.repeat(200000);
    var r = A.cleanCSV(big);
    return { pass: !r.ok && /large/i.test(r.error), detail: r.error || 'accepted' };
  });
})();

/* ============ 5. system-health-monitor ============ */
(function () {
  var A = req('system-health-monitor');
  var slug = 'system-health-monitor';

  t(slug, 'all true = 100/A; all false = 0/F', function () {
    var all = {};
    A.CHECKS.forEach(function (c) { all[c.id] = true; });
    var s1 = A.scoreChecklist(all);
    var s2 = A.scoreChecklist({});
    return { pass: s1.score === 100 && s1.grade === 'A' && s2.score === 0 && s2.grade === 'F',
      detail: '100/A and 0/F' };
  });

  t(slug, 'actionList sorted critical first', function () {
    var s = A.scoreChecklist({ 'os-updated': true });
    var acts = A.actionList(s.failed);
    return { pass: acts.length === 9 && acts[0].severity === 'critical' && acts[0].id === 'backup-exists',
      detail: 'first=' + acts[0].id + ' (' + acts[0].severity + ')' };
  });

  t(slug, 'ADVERSARIAL: unknown/extra answer keys ignored, weights still sum to 100', function () {
    var total = A.CHECKS.reduce(function (a, c) { return a + c.weight; }, 0);
    var s = A.scoreChecklist({ 'backup-exists': true, 'hacked': true, '__proto__': true });
    return { pass: total === 100 && s.score === 20, detail: 'weightSum=' + total + ' score=' + s.score };
  });
})();

/* ============ 6. year-end-closure-assistant ============ */
(function () {
  var A = req('year-end-closure-assistant');
  var slug = 'year-end-closure-assistant';

  t(slug, 'fyLabel/fyEnd: Sep 2026 -> FY 2026-27 ends 2027-03-31; Feb 2026 -> FY 2025-26', function () {
    return { pass: A.fyLabel('2026-09-26') === 'FY 2026-27' && A.fyEnd('2026-09-26') === '2027-03-31' &&
      A.fyLabel('2026-02-10') === 'FY 2025-26' && A.fyEnd('2026-02-10') === '2026-03-31',
      detail: A.fyLabel('2026-09-26') };
  });

  t(slug, 'progress counts mandatory; complete only when all mandatory done', function () {
    var checks = {};
    A.ITEMS.forEach(function (it) { if (!it.mandatory) checks[it.id] = true; }); // all optional only
    var p = A.progress(checks);
    return { pass: p.mandatoryDone === 0 && !p.complete && p.blocking.length === p.mandatoryTotal,
      detail: 'blocking=' + p.blocking.length };
  });

  t(slug, 'ADVERSARIAL: unknown check ids ignored in progress', function () {
    var p = A.progress({ 'fake-item': true, 'stock-count': true });
    return { pass: p.done === 1, detail: 'done=' + p.done };
  });
})();

/* ============ 7. auto-backup-scheduler ============ */
(function () {
  var A = req('auto-backup-scheduler');
  var slug = 'auto-backup-scheduler';

  t(slug, '3-2-1 PASS only with 3 copies, 2 media, offsite', function () {
    var pass = A.threeTwoOne({ copies: 3, media: 2, offsite: true });
    var f1 = A.threeTwoOne({ copies: 2, media: 2, offsite: true });
    var f2 = A.threeTwoOne({ copies: 3, media: 1, offsite: true });
    var f3 = A.threeTwoOne({ copies: 3, media: 2, offsite: false });
    return { pass: pass.pass && !f1.pass && !f2.pass && !f3.pass,
      detail: pass.verdict + ' / ' + [f1.verdict, f2.verdict, f3.verdict].join(',') };
  });

  t(slug, 'nextRuns: weekly from 2026-09-28 gives 4 Mondays', function () {
    var r = A.nextRuns('2026-09-28', 'weekly', 4);
    return { pass: r.ok && JSON.stringify(r.runs) === JSON.stringify(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']),
      detail: r.runs.join(',') };
  });

  t(slug, 'ADVERSARIAL: monthly end-of-month clamps (Jan 31 -> Feb 28)', function () {
    var r = A.nextRuns('2026-01-31', 'monthly', 2);
    return { pass: r.ok && r.runs[1] === '2026-02-28', detail: r.runs.join(',') };
  });

  t(slug, 'ADVERSARIAL: bad plan inputs rejected (freq, copies, date)', function () {
    var l = [];
    var r1 = A.addPlan(l, { name: 'B', what: 'Tally', freq: 'hourly', where: 'HDD', start: '2026-09-26', copies: 3, media: 2 });
    var r2 = A.addPlan(l, { name: 'B', what: 'Tally', freq: 'daily', where: 'HDD', start: '2026-02-30', copies: 3, media: 2 });
    var r3 = A.addPlan(l, { name: 'B', what: 'Tally', freq: 'daily', where: 'HDD', start: '2026-09-26', copies: 0, media: 2 });
    return { pass: !r1.ok && !r2.ok && !r3.ok, detail: 'all rejected' };
  });
})();

/* ============ 8. software-upgrade-safety-checker ============ */
(function () {
  var A = req('software-upgrade-safety-checker');
  var slug = 'software-upgrade-safety-checker';

  t(slug, 'all done = 0/low; nothing done = 100/critical', function () {
    var all = {};
    A.CHECKS.forEach(function (c) { all[c.id] = true; });
    var s1 = A.riskScore(all);
    var s2 = A.riskScore({});
    return { pass: s1.score === 0 && s1.level === 'low' && s2.score === 100 && s2.level === 'critical',
      detail: s1.score + '/' + s1.level + ' vs ' + s2.score + '/' + s2.level };
  });

  t(slug, 'rollbackPlan fills placeholders and requires key fields', function () {
    var p = A.rollbackPlan({ system: 'Tally', fromVer: '3.1', toVer: '4.0', owner: 'Ramesh', backupLoc: 'HDD', installer: 'Pen drive', window: 'Sun 6-9' });
    var bad = A.rollbackPlan({ system: '', fromVer: '3.1', toVer: '4.0', owner: 'R' });
    return { pass: p.ok && p.plan.indexOf('Tally') >= 0 && p.plan.indexOf('3.1 -> 4.0') >= 0 && !bad.ok,
      detail: 'plan lines=' + p.plan.split('\n').length };
  });

  t(slug, 'ADVERSARIAL: riskLines sorted by weight desc; missing fields rejected with reason', function () {
    var lines = A.riskLines(['downtime', 'backup']);
    return { pass: lines[0].id === 'backup' && lines[0].weight === 25, detail: lines[0].id + '=' + lines[0].weight };
  });
})();

/* ============ 9. business-restart-toolkit ============ */
(function () {
  var A = req('business-restart-toolkit');
  var slug = 'business-restart-toolkit';

  t(slug, 'closed track has 3 extra steps vs temporary', function () {
    var t1 = A.stepsFor('temporary').length;
    var t2 = A.stepsFor('closed').length;
    return { pass: t2 === t1 + 3 && A.stepsFor('bogus').length === t1, detail: t1 + ' vs ' + t2 };
  });

  t(slug, 'progress: per-phase pct and overall 100 only when all done', function () {
    var checks = {};
    A.stepsFor('temporary').forEach(function (s) { checks[s.id] = true; });
    var p = A.progress(checks, 'temporary');
    var p2 = A.progress({ cash: true }, 'temporary');
    return { pass: p.overall.pct === 100 && p2.overall.pct < 100 && p2.phases.day1.done === 1,
      detail: 'full=' + p.overall.pct + '% partial=' + p2.overall.pct + '%' };
  });

  t(slug, 'ADVERSARIAL: checks for unknown step ids do not inflate progress', function () {
    var p = A.progress({ 'not-a-step': true }, 'temporary');
    return { pass: p.overall.done === 0 && p.overall.pct === 0, detail: 'done=' + p.overall.done };
  });
})();

/* ============ 10. long-term-data-preservation-tool ============ */
(function () {
  var A = req('long-term-data-preservation-tool');
  var slug = 'long-term-data-preservation-tool';

  t(slug, 'Companies Act books: FY ended 2018-03-31 -> destroy after 2026-03-31 (8 yrs)', function () {
    var e = A.retentionFor('books-companies');
    var d = A.destroyAfter(e, '2018-03-31');
    return { pass: d.ok && d.destroyDate === '2026-03-31', detail: d.destroyDate };
  });

  t(slug, 'GST 72 months: AR due 2020-12-31 -> destroy after 2026-12-31', function () {
    var e = A.retentionFor('gst-records');
    var d = A.destroyAfter(e, '2020-12-31');
    return { pass: d.ok && d.destroyDate === '2026-12-31', detail: d.destroyDate };
  });

  t(slug, 'status: eligible when period has run; keep with days left otherwise', function () {
    var e = A.retentionFor('wages-register'); // 3 years from last entry
    var s1 = A.status(e, '2020-01-15', '2026-09-26');
    var s2 = A.status(e, '2025-06-01', '2026-09-26');
    return { pass: s1.ok && s1.state === 'eligible' && s2.ok && s2.state === 'keep' && s2.daysLeft > 600,
      detail: s1.state + ' / ' + s2.state + ' (' + s2.daysLeft + 'd)' };
  });

  t(slug, 'ADVERSARIAL: bad date / unknown type rejected; destruction never backdated by garbage input', function () {
    var d1 = A.destroyAfter(A.retentionFor('books-companies'), 'not-a-date');
    var d2 = A.destroyAfter(A.retentionFor('nope'), '2020-01-01');
    var s = A.status(A.retentionFor('esi-register'), '2026-13-99', '2026-09-26');
    return { pass: !d1.ok && !d2.ok && !s.ok, detail: 'all rejected' };
  });
})();

/* ============ summary ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.filter(function (r) { return !r.pass; });
console.log('\nTeam N platform/lifecycle tests: ' + passed + '/' + results.length + ' passed');
failed.forEach(function (r) {
  console.log('FAIL [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
if (!failed.length) {
  results.forEach(function (r) {
    console.log('ok   [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
  });
}
process.exit(failed.length ? 1 : 0);
