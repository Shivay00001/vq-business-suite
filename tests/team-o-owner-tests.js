#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team O (10 OWNER, LEGAL, RESCUE & AI UTILITIES tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-o-owner-tests.js
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
function S(scores) { // helper: build a full 0-5 scores object
  var o = {};
  ['cash', 'profit', 'compliance', 'customers', 'operations'].forEach(function (k, i) {
    o[k] = scores[i];
  });
  return o;
}

/* ============ 1. business-health-score-engine ============ */
(function () {
  var A = req('business-health-score-engine');
  var slug = 'business-health-score-engine';

  t(slug, 'all 3s -> score 60, grade C, 3 fixes', function () {
    var r = A.calculate(S([3, 3, 3, 3, 3]));
    return { pass: r.ok && r.score === 60 && r.grade === 'C' && r.topFixes.length === 3,
      detail: 'score=' + r.score + ' grade=' + r.grade };
  });

  t(slug, 'all 5s -> 100/A; all 0s -> 0/F', function () {
    var hi = A.calculate(S([5, 5, 5, 5, 5]));
    var lo = A.calculate(S([0, 0, 0, 0, 0]));
    return { pass: hi.ok && hi.score === 100 && hi.grade === 'A' && lo.ok && lo.score === 0 && lo.grade === 'F',
      detail: 'hi=' + hi.score + hi.grade + ' lo=' + lo.score + lo.grade };
  });

  t(slug, 'weakest dimension surfaces in top fixes', function () {
    var r = A.calculate(S([1, 4, 4, 4, 4]));
    return { pass: r.ok && r.topFixes[0].dimension === 'Cash & liquidity' && r.topFixes[0].score === 1,
      detail: 'first fix dim=' + r.topFixes[0].dimension };
  });

  t(slug, 'ADVERSARIAL: score 6 rejected', function () {
    var r = A.calculate(S([6, 3, 3, 3, 3]));
    return { pass: !r.ok && /between 0 and 5/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: non-integer / missing score rejected', function () {
    var r1 = A.calculate(S([2.5, 3, 3, 3, 3]));
    var r2 = A.calculate({ cash: 3 });
    return { pass: !r1.ok && !r2.ok, detail: (r1.ok ? 'accepted 2.5! ' : '') + (r2.ok ? 'accepted missing!' : 'both rejected') };
  });
})();

/* ============ 2. cash-survival-days-indicator ============ */
(function () {
  var A = req('cash-survival-days-indicator');
  var slug = 'cash-survival-days-indicator';

  t(slug, '500000 / 10000/day -> 50 days, watch band, actions present', function () {
    var r = A.indicate(500000, 10000);
    return { pass: r.ok && r.days === 50 && r.band === 'watch' && r.actions.length >= 3,
      detail: 'days=' + r.days + ' band=' + r.band };
  });

  t(slug, 'boundaries: 29d critical, 30d watch, 90d safe', function () {
    var c = A.indicate(29000, 1000), w = A.indicate(30000, 1000), s = A.indicate(90000, 1000);
    return { pass: c.band === 'critical' && w.band === 'watch' && s.band === 'safe',
      detail: c.band + '/' + w.band + '/' + s.band };
  });

  t(slug, 'zero burn -> unlimited runway, safe', function () {
    var r = A.indicate(100000, 0);
    return { pass: r.ok && r.unlimited === true && r.band === 'safe', detail: 'unlimited=' + r.unlimited };
  });

  t(slug, 'ADVERSARIAL: negative cash rejected', function () {
    var r = A.indicate(-5000, 1000);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: non-numeric burn rejected', function () {
    var r = A.indicate(100000, 'abc');
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 3. business-valuation-estimator ============ */
(function () {
  var A = req('business-valuation-estimator');
  var slug = 'business-valuation-estimator';

  t(slug, 'revenue 1Cr @12% growth -> 0.75x-1.5x = 75L-1.5Cr', function () {
    var r = A.revenueMethod(10000000, 12);
    return { pass: r.ok && r.low === 7500000 && r.high === 15000000, detail: 'low=' + r.low + ' high=' + r.high };
  });

  t(slug, 'PAT 15L -> 3x-6x = 45L-90L', function () {
    var r = A.profitMethod(1500000);
    return { pass: r.ok && r.low === 4500000 && r.high === 9000000, detail: 'low=' + r.low + ' high=' + r.high };
  });

  t(slug, 'DCF-lite: 12L FCF, 5y, 15% discount -> sane ordered range', function () {
    var r = A.dcfMethod(1200000, 10, 15, 5);
    return { pass: r.ok && r.low > 0 && r.high >= r.low && r.low < 1200000 * 5,
      detail: 'low=' + Math.round(r.low) + ' high=' + Math.round(r.high) };
  });

  t(slug, 'estimate() returns ESTIMATE label + overall range', function () {
    var r = A.estimate(10000000, 1500000, 12, 1200000, 15, 5);
    return { pass: r.ok && r.label === 'ESTIMATE' && r.range.low <= r.range.high && r.methods.length === 3,
      detail: 'range=' + r.range.low + '-' + r.range.high };
  });

  t(slug, 'ADVERSARIAL: negative revenue rejected', function () {
    var r = A.revenueMethod(-100, 10);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: discount rate 3% (below 5) rejected', function () {
    var r = A.dcfMethod(1000000, 10, 3, 5);
    return { pass: !r.ok && /discount/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 4. legal-notice-draft-tool ============ */
(function () {
  var A = req('legal-notice-draft-tool');
  var slug = 'legal-notice-draft-tool';
  function good() {
    return { senderName: 'Sharma Traders', senderAddress: '12 MG Road, Indore',
      recipientName: 'Gupta Retail', recipientAddress: '5 Park Street, Bhopal',
      invoiceNo: 'INV-1042', amount: 85000, invoiceDate: '2026-06-01',
      dueDate: '2026-06-30', demandDays: 15, dateOfNotice: '2026-09-26' };
  }

  t(slug, 'valid notice -> draft contains amount, invoice, disclaimer', function () {
    var v = A.validateNotice(good());
    if (!v.ok) return { pass: false, detail: v.error };
    var txt = A.buildNotice(v.value);
    return { pass: txt.indexOf('INV-1042') !== -1 && txt.indexOf('\u20B985,000') !== -1 &&
      txt.indexOf('NOT LEGAL ADVICE') !== -1,
      detail: 'len=' + txt.length };
  });

  t(slug, 'overdue days computed (88 days)', function () {
    var v = A.validateNotice(good());
    var txt = A.buildNotice(v.value);
    return { pass: txt.indexOf('88 day(s) overdue') !== -1, detail: 'has 88 days=' + (txt.indexOf('88 day(s) overdue') !== -1) };
  });

  t(slug, 'ADVERSARIAL: empty sender name rejected', function () {
    var d = good(); d.senderName = '  ';
    var r = A.validateNotice(d);
    return { pass: !r.ok && /Sender/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: due date before invoice date rejected', function () {
    var d = good(); d.dueDate = '2026-05-01';
    var r = A.validateNotice(d);
    return { pass: !r.ok && /before the invoice/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: script injection in recipient name is escaped in output', function () {
    var d = good(); d.recipientName = '<script>alert(1)</script>';
    var v = A.validateNotice(d);
    if (!v.ok) return { pass: false, detail: v.error };
    var txt = A.buildNotice(v.value);
    var rendered = A.esc(txt);
    return { pass: rendered.indexOf('<script>') === -1 && rendered.indexOf('&lt;script&gt;') !== -1,
      detail: 'escaped ok' };
  });
})();

/* ============ 5. demand-letter-generator ============ */
(function () {
  var A = req('demand-letter-generator');
  var slug = 'demand-letter-generator';
  function good(stage, lang) {
    return { stage: stage || 'polite', lang: lang || 'en', fromName: 'Ramesh',
      businessName: 'Sharma Traders', toName: 'Gupta Retail',
      amount: 50000, invoiceNo: 'INV-9', dueDate: '2026-08-15' };
  }

  t(slug, 'polite EN letter mentions invoice + amount', function () {
    var v = A.validateLetter(good('polite', 'en'));
    if (!v.ok) return { pass: false, detail: v.error };
    var txt = A.letterText(v.value);
    return { pass: /gentle reminder/i.test(txt) && txt.indexOf('INV-9') !== -1 && txt.indexOf('\u20B950,000') !== -1,
      detail: 'len=' + txt.length };
  });

  t(slug, 'final EN is sterner than polite; HI letter is Hindi', function () {
    var vp = A.validateLetter(good('polite', 'en'));
    var vf = A.validateLetter(good('final', 'en'));
    var vh = A.validateLetter(good('polite', 'hi'));
    var tp = A.letterText(vp.value), tf = A.letterText(vf.value), th = A.letterText(vh.value);
    return { pass: /FINAL communication/i.test(tf) && !/FINAL communication/i.test(tp) && /अनुस्मारक/.test(th),
      detail: 'tones differ, hindi present' };
  });

  t(slug, 'ADVERSARIAL: bogus stage rejected', function () {
    var r = A.validateLetter(good('nuclear', 'en'));
    return { pass: !r.ok && /Stage/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: HTML in business name escaped on render', function () {
    var d = good('firm', 'en'); d.businessName = 'ACME <img src=x onerror=alert(1)>';
    var v = A.validateLetter(d);
    if (!v.ok) return { pass: false, detail: v.error };
    var rendered = A.esc(A.letterText(v.value));
    return { pass: rendered.indexOf('<img') === -1 && rendered.indexOf('&lt;img') !== -1,
      detail: 'escaped ok' };
  });
})();

/* ============ 6. payment-followup-letter-tool ============ */
(function () {
  var A = req('payment-followup-letter-tool');
  var slug = 'payment-followup-letter-tool';
  function good(due) {
    return { customerName: 'Gupta Retail', invoiceNo: 'INV-77', amount: 120000,
      dueDate: due || '2026-08-12', businessName: 'Sharma Traders',
      fromName: 'Ramesh', todayStr: '2026-09-26' };
  }

  t(slug, 'stage boundaries: 29->first, 30->30-day, 60->60-day, 90->90-day', function () {
    var s1 = A.stageForDays(29), s2 = A.stageForDays(30), s3 = A.stageForDays(60), s4 = A.stageForDays(90);
    return { pass: s1.value === 'first-reminder' && s2.value === '30-day' && s3.value === '60-day' && s4.value === '90-day',
      detail: [s1.value, s2.value, s3.value, s4.value].join('/') };
  });

  t(slug, 'due 2026-08-12 vs 2026-09-26 -> 45 days overdue, 30-day stage letter', function () {
    var v = A.validateLetter(good());
    if (!v.ok) return { pass: false, detail: v.error };
    var txt = A.letterBody(v.value);
    return { pass: v.value.daysOverdue === 45 && v.value.stage === '30-day' && txt.indexOf('INV-77') !== -1,
      detail: 'days=' + v.value.daysOverdue + ' stage=' + v.value.stage };
  });

  t(slug, 'ADVERSARIAL: future due date rejected (nothing overdue)', function () {
    var r = A.validateLetter(good('2026-10-15'));
    return { pass: !r.ok && /future/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: malformed date rejected', function () {
    var r = A.validateLetter(good('2026-13-99'));
    return { pass: !r.ok, detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 7. daily-founder-dashboard ============ */
(function () {
  var A = req('daily-founder-dashboard');
  var slug = 'daily-founder-dashboard';

  t(slug, 'summary: net = cash + in - out; task counts right', function () {
    var tasks = [{ id: 't1', title: 'call', done: true }, { id: 't2', title: 'pay', done: false }];
    var s = A.computeSummary(500000, 200000, 100000, tasks);
    return { pass: s.ok && s.net === 600000 && s.openTasks === 1 && s.doneTasks === 1,
      detail: 'net=' + s.net + ' open=' + s.openTasks };
  });

  t(slug, 'critical alert when payables exceed cash', function () {
    var s = A.computeSummary(100000, 50000, 250000, []);
    var crit = s.alerts.filter(function (a) { return a.level === 'critical'; });
    return { pass: s.ok && crit.length >= 1, detail: 'alerts=' + s.alerts.length };
  });

  t(slug, 'ADVERSARIAL: 26th task rejected (max 25)', function () {
    var list = [];
    for (var i = 0; i < 25; i++) {
      var r = A.addTask(list, 'task ' + i);
      list = r.tasks;
    }
    var last = A.addTask(list, 'one too many');
    return { pass: !last.ok && /max 25/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });

  t(slug, 'ADVERSARIAL: empty task title rejected; negative cash rejected', function () {
    var r1 = A.addTask([], '   ');
    var r2 = A.computeSummary(-100, 0, 0, []);
    return { pass: !r1.ok && !r2.ok, detail: (r1.ok ? 'accepted empty! ' : '') + (r2.ok ? 'accepted negative!' : 'both rejected') };
  });
})();

/* ============ 8. exit-succession-planner ============ */
(function () {
  var A = req('exit-succession-planner');
  var slug = 'exit-succession-planner';

  t(slug, 'empty checklist -> 0% High risk; all checked -> 100% Exit-ready', function () {
    var lo = A.readinessScore([]);
    var all = A.CHECKLIST.map(function (c) { return c.id; });
    var hi = A.readinessScore(all);
    return { pass: lo.ok && lo.pct === 0 && /High risk/.test(lo.band) &&
      hi.ok && hi.pct === 100 && /Exit-ready/.test(hi.band),
      detail: 'lo=' + lo.pct + ' hi=' + hi.pct };
  });

  t(slug, 'valuation snapshot: PAT 10L x 4 -> mid 40L, range 32L-48L, ESTIMATE', function () {
    var s = A.valuationSnapshot(1000000, 4);
    return { pass: s.ok && s.mid === 4000000 && s.low === 3200000 && s.high === 4800000 && s.label === 'ESTIMATE',
      detail: 'low=' + s.low + ' high=' + s.high };
  });

  t(slug, 'handover tasks cover 5 areas', function () {
    var h = A.handoverTasks();
    return { pass: h.length === 5 && h.every(function (x) { return x.tasks.length >= 3; }),
      detail: 'areas=' + h.map(function (x) { return x.area; }).join(',') };
  });

  t(slug, 'ADVERSARIAL: profit multiple 0 rejected', function () {
    var s = A.valuationSnapshot(1000000, 0);
    return { pass: !s.ok && /between 1 and 10/i.test(s.error), detail: s.ok ? 'accepted!' : s.error };
  });

  t(slug, 'ADVERSARIAL: unknown checklist ids are ignored (no crash, no credit)', function () {
    var r = A.readinessScore(['nope-1', 'nope-2']);
    return { pass: r.ok && r.pct === 0, detail: 'pct=' + r.pct };
  });
})();

/* ============ 9. penalty-reduction-planner ============ */
(function () {
  var A = req('penalty-reduction-planner');
  var slug = 'penalty-reduction-planner';

  t(slug, '45 days late non-nil -> Rs 2,250 fee (below cap)', function () {
    var f = A.lateFee(45, false);
    return { pass: f.ok && f.fee === 2250 && !f.capped && f.rate === 50, detail: 'fee=' + f.fee };
  });

  t(slug, '300 days late non-nil -> capped at Rs 10,000 (flat cap Jul-2025)', function () {
    var f = A.lateFee(300, false);
    return { pass: f.ok && f.fee === 10000 && f.capped, detail: 'fee=' + f.fee };
  });

  t(slug, '30 days late nil -> Rs 600 raw, capped at Rs 500', function () {
    var f = A.lateFee(30, true);
    return { pass: f.ok && f.raw === 600 && f.fee === 500 && f.capped, detail: 'fee=' + f.fee };
  });

  t(slug, 'interest: 1L tax, 45 days @18% -> Rs 2,219.18', function () {
    var r = A.interestDue(100000, 45);
    return { pass: r.ok && eq(r.interest, 2219.18), detail: 'interest=' + r.interest };
  });

  t(slug, 'compare: waiting 30 more days costs extra (fee + interest grow)', function () {
    var c = A.compare(45, 30, false, 100000);
    return { pass: c.ok && c.extraCost > 0 && /EXTRA/.test(c.verdict) &&
      eq(c.later.total, c.now.total + c.extraCost),
      detail: 'now=' + c.now.total + ' later=' + c.later.total + ' extra=' + c.extraCost };
  });

  t(slug, 'ADVERSARIAL: negative days rejected', function () {
    var f = A.lateFee(-5, false);
    return { pass: !f.ok && /between 0 and/i.test(f.error), detail: f.ok ? 'accepted!' : f.error };
  });

  t(slug, 'ADVERSARIAL: fractional days rejected', function () {
    var f = A.lateFee(10.5, false);
    return { pass: !f.ok && /whole number/i.test(f.error), detail: f.ok ? 'accepted!' : f.error };
  });
})();

/* ============ 10. plain-language-summary-generator ============ */
(function () {
  var A = req('plain-language-summary-generator');
  var slug = 'plain-language-summary-generator';
  var SAMPLE = 'Whereas the assessee failed to furnish the return within the stipulated time, a late fee of Rs 50 per day shall be levied. The outstanding tax of \u20B91,25,000 carries interest at 18% per annum. Payment must be made within 30 days of this notice, failing which recovery proceedings will be initiated pursuant to the provisions hereinabove.';

  t(slug, 'extractNumbers finds amount, %, days', function () {
    var n = A.extractNumbers(SAMPLE);
    return { pass: n.amounts.length >= 1 && n.percents.indexOf('18%') !== -1 && n.days.length >= 1,
      detail: 'amounts=' + n.amounts.join('|') + ' percents=' + n.percents.join('|') + ' days=' + n.days.join('|') };
  });

  t(slug, 'summarize returns 2-6 plain bullets containing a signal word', function () {
    var r = A.summarize(SAMPLE);
    var hasSignal = r.bullets.some(function (b) { return /late fee|interest|penalty|notice|within/i.test(b); });
    return { pass: r.ok && r.bullets.length >= 2 && r.bullets.length <= 6 && hasSignal,
      detail: 'bullets=' + r.bullets.length };
  });

  t(slug, 'jargon words are replaced (hereby -> by this)', function () {
    var s = A.simplifySentence('The notice is hereby issued.');
    return { pass: s.indexOf('hereby') === -1 && s.indexOf('by this') !== -1, detail: s };
  });

  t(slug, 'ADVERSARIAL: empty text rejected', function () {
    var r = A.summarize('   ');
    return { pass: !r.ok && /Paste some text/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: over-long text rejected; script tag escaped on render', function () {
    var long = new Array(20002).join('x');
    var r1 = A.summarize(long);
    var r2 = A.summarize('<script>alert(1)</script> Notice: pay Rs 100 within 7 days or penalty applies.');
    var rendered = r2.ok ? A.esc(r2.bullets.join(' ')) : '';
    return { pass: !r1.ok && r2.ok && rendered.indexOf('<script>') === -1,
      detail: 'long rejected=' + !r1.ok + ' escaped=' + (rendered.indexOf('<script>') === -1) };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team O (10 owner/legal) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
