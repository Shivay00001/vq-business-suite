#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team K (10 pricing/profit/decision tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-k-pricing-tests.js
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

/* ============ 1. cost-buildup-calculator ============ */
(function () {
  var C = req('cost-buildup-calculator');
  var slug = 'cost-buildup-calculator';
  var base = { material: 40000, labour: 15000, overhead: 5000, freight: 2000, units: 1000, gstRate: 18, itc: 'no', targetMargin: 30 };

  t(slug, 'no-ITC: preGST 62000, inputGST 11160, landed 73160, per-unit 73.16', function () {
    var r = C.landedCost(base);
    return { pass: r.ok && eq(r.preGst, 62000) && eq(r.inputGst, 11160) &&
      eq(r.landed, 73160) && eq(r.perUnit, 73.16),
      detail: 'perUnit=' + r.perUnit + ' landed=' + r.landed };
  });

  t(slug, 'ITC claimable: GST excluded, per-unit 62; 30% margin -> price 88.57', function () {
    var r = C.landedCost(Object.assign({}, base, { itc: 'yes' }));
    return { pass: r.ok && eq(r.landed, 62000) && eq(r.perUnit, 62) &&
      eq(r.suggestedPrice, 88.57),
      detail: 'perUnit=' + r.perUnit + ' suggested=' + r.suggestedPrice };
  });

  t(slug, 'ADVERSARIAL: zero units rejected (division by zero)', function () {
    var r = C.landedCost(Object.assign({}, base, { units: 0 }));
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative material cost rejected', function () {
    var r = C.landedCost(Object.assign({}, base, { material: -100 }));
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 2. discount-impact-analyzer ============ */
(function () {
  var D = req('discount-impact-analyzer');
  var slug = 'discount-impact-analyzer';

  t(slug, 'REQUIRED FORMULA: uplift(40%, 10%) = d/(m-d) = 33.3%', function () {
    var r = D.requiredUplift(40, 10);
    return { pass: r.ok && r.feasible && eq(r.upliftPct, 33.3) && eq(r.ratio, 1.33),
      detail: 'upliftPct=' + r.upliftPct };
  });

  t(slug, 'profit comparison: 1000/600/500/10% -> old 2L, same-vol 1.5L, req vol 667', function () {
    var r = D.profitComparison({ price: 1000, unitCost: 600, volume: 500, discountPct: 10 });
    return { pass: r.ok && eq(r.marginPct, 40) && eq(r.oldProfit, 200000) &&
      eq(r.newProfitSameVol, 150000) && eq(r.profitLostSameVol, 50000) &&
      r.feasible && r.requiredVolume === 667 && eq(r.profitAtRequiredVolume, 200100),
      detail: 'old=' + r.oldProfit + ' sameVol=' + r.newProfitSameVol + ' reqVol=' + r.requiredVolume };
  });

  t(slug, 'ADVERSARIAL: discount >= margin is unrecoverable (feasible=false)', function () {
    var r = D.requiredUplift(20, 25);
    return { pass: r.ok && r.feasible === false, detail: r.ok ? 'feasible=' + r.feasible : r.error };
  });

  t(slug, 'ADVERSARIAL: 100% discount is unrecoverable, not infinite math', function () {
    var r = D.requiredUplift(40, 100);
    return { pass: r.ok && r.feasible === false && r.upliftPct === Infinity, detail: 'feasible=' + r.feasible };
  });

  t(slug, 'ADVERSARIAL: zero margin rejected', function () {
    var r = D.requiredUplift(0, 10);
    return { pass: !r.ok && /zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 3. what-if-scenario-simulator ============ */
(function () {
  var W = req('what-if-scenario-simulator');
  var slug = 'what-if-scenario-simulator';

  t(slug, 'scenario profit: (100-60)*1000-10000 = 30000', function () {
    var r = W.scenarioProfit({ price: 100, volume: 1000, unitCost: 60, fixedCost: 10000 });
    return { pass: r.ok && eq(r.profit, 30000) && eq(r.contribution, 40000) && eq(r.marginPct, 40),
      detail: 'profit=' + r.profit };
  });

  t(slug, 'waterfall effects sum exactly to profit delta (1200)', function () {
    var base = { price: 100, volume: 1000, unitCost: 60, fixedCost: 10000 };
    var alt = { price: 110, volume: 900, unitCost: 62, fixedCost: 12000 };
    var w = W.waterfall(base, alt);
    var delta = w.altProfit - w.baseProfit;
    return { pass: w.ok && eq(w.priceEffect, 10000) && eq(w.volumeEffect, -5000) &&
      eq(w.costEffect, -1800) && eq(w.fixedEffect, -2000) &&
      eq(w.total, 1200) && eq(w.total, delta),
      detail: 'total=' + w.total + ' delta=' + delta };
  });

  t(slug, 'compareScenarios: optimistic delta positive, pessimistic negative', function () {
    var c = W.compareScenarios(
      { price: 100, volume: 1000, unitCost: 60, fixedCost: 10000 },
      [{ name: 'Opt', scenario: { price: 110, volume: 1200, unitCost: 58, fixedCost: 10000 } },
       { name: 'Pess', scenario: { price: 95, volume: 800, unitCost: 62, fixedCost: 12000 } }]);
    return { pass: c.ok && c.scenarios[0].delta > 0 && c.scenarios[1].delta < 0,
      detail: 'opt delta=' + c.scenarios[0].delta + ' pess delta=' + c.scenarios[1].delta };
  });

  t(slug, 'ADVERSARIAL: negative price rejected', function () {
    var r = W.scenarioProfit({ price: -50, volume: 1000, unitCost: 60, fixedCost: 10000 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 4. product-profit-analyzer ============ */
(function () {
  var P = req('product-profit-analyzer');
  var slug = 'product-profit-analyzer';

  function sample() {
    var skus = [];
    skus = P.addSKU(skus, { name: 'A', revenue: 100000, cogs: 60000 }).skus;
    skus = P.addSKU(skus, { name: 'B', revenue: 50000, cogs: 45000 }).skus;
    skus = P.addSKU(skus, { name: 'C', revenue: 20000, cogs: 25000 }).skus;
    return skus;
  }

  t(slug, 'per-SKU gross/margin + ranking: best=A (40000), worst=C (-5000)', function () {
    var a = P.analyzeSKUs(sample());
    var ra = a.ranked[0];
    return { pass: a.ok && eq(a.totalGross, 40000) && eq(a.avgMarginPct, 23.5) &&
      a.best.name === 'A' && a.worst.name === 'C' &&
      eq(ra.gross, 40000) && eq(ra.marginPct, 40) && eq(ra.contributionShare, 100),
      detail: 'totalGross=' + a.totalGross + ' avgMargin=' + a.avgMarginPct };
  });

  t(slug, 'ADVERSARIAL: zero revenue rejected', function () {
    var r = P.addSKU([], { name: 'Z', revenue: 0, cogs: 100 });
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative COGS rejected', function () {
    var r = P.addSKU([], { name: 'Z', revenue: 1000, cogs: -50 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: 26th SKU rejected (max 25)', function () {
    var skus = [];
    for (var i = 0; i < 25; i++) skus = P.addSKU(skus, { name: 'S' + i, revenue: 100, cogs: 50 }).skus;
    var last = P.addSKU(skus, { name: 'Extra', revenue: 100, cogs: 50 });
    return { pass: !last.ok && /full/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });
})();

/* ============ 5. margin-volatility-tracker ============ */
(function () {
  var M = req('margin-volatility-tracker');
  var slug = 'margin-volatility-tracker';

  function series() {
    // margins: 20,21,19,20,21,40 -> mean 23.5, sample sd ~8.12, 40 flagged high
    var data = [
      ['2026-01', 100, 80], ['2026-02', 100, 79], ['2026-03', 100, 81],
      ['2026-04', 100, 80], ['2026-05', 100, 79], ['2026-06', 100, 60]
    ];
    var ms = [];
    data.forEach(function (d) { ms = M.addMonth(ms, { month: d[0], revenue: d[1], cost: d[2] }).months; });
    return ms;
  }

  t(slug, 'mean 23.5, sd ~8.12, only Jun-2026 flagged beyond +2sigma', function () {
    var a = M.analyze(series());
    return { pass: a.ok && eq(a.mean, 23.5) && eq(a.stddev, 8.12) &&
      a.flaggedCount === 1 && a.flagged[0].month === '2026-06' && a.flagged[0].flagDir === 'high',
      detail: 'mean=' + a.mean + ' sd=' + a.stddev + ' flagged=' + a.flaggedCount };
  });

  t(slug, 'flat margins -> sd 0, no flags, rating Stable', function () {
    var ms = [];
    ['2026-01', '2026-02', '2026-03'].forEach(function (m) {
      ms = M.addMonth(ms, { month: m, revenue: 100, cost: 70 }).months;
    });
    var a = M.analyze(ms);
    return { pass: a.ok && a.stddev === 0 && a.flaggedCount === 0 && a.rating === 'Stable',
      detail: 'sd=' + a.stddev + ' rating=' + a.rating };
  });

  t(slug, 'ADVERSARIAL: single month cannot measure volatility', function () {
    var ms = M.addMonth([], { month: '2026-01', revenue: 100, cost: 70 }).months;
    var a = M.analyze(ms);
    return { pass: !a.ok && /at least 2/i.test(a.error), detail: a.ok ? 'accepted!' : a.error };
  });

  t(slug, 'ADVERSARIAL: bad month format and negative revenue rejected', function () {
    var bad = M.addMonth([], { month: 'Jan 2026', revenue: 100, cost: 70 });
    var neg = M.addMonth([], { month: '2026-01', revenue: -100, cost: 70 });
    return { pass: !bad.ok && !neg.ok, detail: (bad.ok ? 'bad month accepted!' : bad.error) + ' | ' + (neg.ok ? 'neg accepted!' : neg.error) };
  });
})();

/* ============ 6. profit-leakage-radar ============ */
(function () {
  var L = req('profit-leakage-radar');
  var slug = 'profit-leakage-radar';

  function sample() {
    return {
      annualRevenue: 6000000,
      items: {
        discounts: { monthly: 10000, severity: 2 },
        wastage: { monthly: 5000, severity: 1 },
        returns: { monthly: 3000, severity: 1 },
        shrinkage: { monthly: 2000, severity: 0 },
        idle: { monthly: 0, severity: 0 }
      }
    };
  }

  t(slug, 'annual leak 240000 (4% of 60L) -> Watch; top leak = discounts', function () {
    var r = L.estimateLeaks(sample());
    return { pass: r.ok && eq(r.annualLeak, 240000) && eq(r.monthlyLeak, 20000) &&
      eq(r.leakPct, 4) && r.rating === 'Watch' &&
      r.topLeak && r.topLeak.id === 'discounts' && eq(r.topLeak.annual, 120000),
      detail: 'annual=' + r.annualLeak + ' pct=' + r.leakPct + ' rating=' + r.rating };
  });

  t(slug, 'severity pressure score: (2+1+1+0+0)/15*100 = 27', function () {
    var r = L.estimateLeaks(sample());
    return { pass: r.ok && r.pressureScore === 27, detail: 'pressure=' + r.pressureScore };
  });

  t(slug, 'ADVERSARIAL: negative monthly loss rejected', function () {
    var s = sample();
    s.items.wastage.monthly = -500;
    var r = L.estimateLeaks(s);
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: severity outside 0-3 rejected', function () {
    var s = sample();
    s.items.idle.severity = 5;
    var r = L.estimateLeaks(s);
    return { pass: !r.ok && /0–3/.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 7. revenue-concentration-analyzer ============ */
(function () {
  var R = req('revenue-concentration-analyzer');
  var slug = 'revenue-concentration-analyzer';

  t(slug, '10 equal customers -> HHI 1000, Diversified, top1 10%, effN 10', function () {
    var items = [];
    for (var i = 0; i < 10; i++) items = R.addItem(items, { name: 'C' + i, revenue: 100000 }).items;
    var a = R.analyze(items);
    return { pass: a.ok && a.hhi === 1000 && a.rating === 'Diversified' &&
      eq(a.top1Share, 10) && eq(a.effectiveCount, 10),
      detail: 'hhi=' + a.hhi + ' rating=' + a.rating };
  });

  t(slug, '50/50 split -> HHI 5000, High risk; top-leaves wipes 50%', function () {
    var items = R.addItem([], { name: 'Big', revenue: 500000 }).items;
    items = R.addItem(items, { name: 'Small', revenue: 500000 }).items;
    var a = R.analyze(items);
    return { pass: a.ok && a.hhi === 5000 && a.rating === 'High risk' &&
      eq(a.topLoss.revenueAtRiskPct, 50) && eq(a.topLoss.remainingRevenue, 500000),
      detail: 'hhi=' + a.hhi + ' atRiskPct=' + a.topLoss.revenueAtRiskPct };
  });

  t(slug, 'ADVERSARIAL: negative revenue rejected', function () {
    var r = R.addItem([], { name: 'X', revenue: -100 });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: single customer cannot measure concentration', function () {
    var items = R.addItem([], { name: 'Only', revenue: 1000 }).items;
    var a = R.analyze(items);
    return { pass: !a.ok && /at least 2/i.test(a.error), detail: a.ok ? 'accepted!' : a.error };
  });
})();

/* ============ 8. seasonal-pricing-advisor ============ */
(function () {
  var S = req('seasonal-pricing-advisor');
  var slug = 'seasonal-pricing-advisor';

  t(slug, 'flat sales -> all indices 100, no peak/off-peak, zero uplift', function () {
    var a = S.analyze({ sales: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], basePrice: 500 });
    var allNormal = a.rows.every(function (r) { return r.band === 'normal' && r.multiplier === 1.0; });
    return { pass: a.ok && allNormal && a.peakMonths.length === 0 && a.offPeakMonths.length === 0 &&
      eq(a.revenueUplift, 0),
      detail: 'uplift=' + a.revenueUplift };
  });

  t(slug, 'peaked year: Oct peak x1.05 (525), Feb off-peak x0.95 (475)', function () {
    var a = S.analyze({ sales: [80, 75, 90, 100, 110, 95, 85, 90, 105, 140, 130, 120], basePrice: 500 });
    var oct = a.rows[9], feb = a.rows[1];
    return { pass: a.ok && oct.band === 'peak' && eq(oct.suggestedPrice, 525) &&
      feb.band === 'off-peak' && eq(feb.suggestedPrice, 475) &&
      a.peakMonths.indexOf('Oct') >= 0 && a.offPeakMonths.indexOf('Feb') >= 0 &&
      eq(a.revenueUplift, -750), // more volume sits in off-peak months here, so the net is negative — correct
      detail: 'oct=' + oct.suggestedPrice + ' feb=' + feb.suggestedPrice + ' uplift=' + a.revenueUplift };
  });

  t(slug, 'ADVERSARIAL: 11 months rejected', function () {
    var a = S.analyze({ sales: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], basePrice: 500 });
    return { pass: !a.ok && /12 months/i.test(a.error), detail: a.ok ? 'accepted!' : a.error };
  });

  t(slug, 'ADVERSARIAL: negative sales rejected', function () {
    var s = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, -5];
    var a = S.analyze({ sales: s, basePrice: 500 });
    return { pass: !a.ok && /negative/i.test(a.error), detail: a.ok ? 'accepted!' : a.error };
  });
})();

/* ============ 9. competitor-price-comparator ============ */
(function () {
  var K = req('competitor-price-comparator');
  var slug = 'competitor-price-comparator';

  t(slug, '500 vs (480,495,470): gap +3.8% -> At par, no alert', function () {
    var r = K.compareSKU({ name: 'Rice', yourPrice: 500, compPrices: [480, 495, 470] });
    return { pass: r.ok && eq(r.entry.avgComp, 481.67) && eq(r.entry.gapPct, 3.8) &&
      r.entry.positioning === 'At par' && r.entry.alert === '',
      detail: 'gap=' + r.entry.gapPct + ' pos=' + r.entry.positioning };
  });

  t(slug, '600 vs same market: gap +24.6% -> Premium with alert', function () {
    var r = K.compareSKU({ name: 'Rice', yourPrice: 600, compPrices: '480, 495, 470' });
    return { pass: r.ok && r.entry.positioning === 'Premium' && r.entry.alert !== '' &&
      eq(r.entry.gapPct, 24.6),
      detail: 'gap=' + r.entry.gapPct + ' alert=' + (r.entry.alert ? 'yes' : 'no') };
  });

  t(slug, '400 vs same market: gap negative -> Budget', function () {
    var r = K.compareSKU({ name: 'Rice', yourPrice: 400, compPrices: [480, 495, 470] });
    return { pass: r.ok && r.entry.positioning === 'Budget' && r.entry.gapPct < -5,
      detail: 'gap=' + r.entry.gapPct };
  });

  t(slug, 'ADVERSARIAL: empty competitor list rejected', function () {
    var r = K.compareSKU({ name: 'Rice', yourPrice: 500, compPrices: [] });
    return { pass: !r.ok && /at least one/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative your-price rejected', function () {
    var r = K.compareSKU({ name: 'Rice', yourPrice: -10, compPrices: [480] });
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });
})();

/* ============ 10. decision-support-engine ============ */
(function () {
  var E = req('decision-support-engine');
  var slug = 'decision-support-engine';

  function model() {
    var criteria = [];
    criteria = E.addCriterion(criteria, { name: 'Cost', weight: 0.4 }).criteria;
    criteria = E.addCriterion(criteria, { name: 'Upside', weight: 0.35 }).criteria;
    criteria = E.addCriterion(criteria, { name: 'Risk', weight: 0.25 }).criteria;
    var options = [];
    options = E.addOption(options, { name: 'Expand', scores: { Cost: 6, Upside: 9, Risk: 4 } }).options;
    options = E.addOption(options, { name: 'Hold', scores: { Cost: 8, Upside: 5, Risk: 8 } }).options;
    return { criteria: criteria, options: options };
  }

  t(slug, 'weighted scores: Hold 6.95 beats Expand 6.55', function () {
    var m = model();
    var s = E.scoreOptions(m.criteria, m.options);
    var hold = s.ranked.filter(function (o) { return o.name === 'Hold'; })[0];
    var expand = s.ranked.filter(function (o) { return o.name === 'Expand'; })[0];
    return { pass: s.ok && s.winner.name === 'Hold' &&
      Math.abs(hold.score - 6.95) < 0.011 && Math.abs(expand.score - 6.55) < 0.011,
      detail: 'winner=' + s.winner.name + ' hold=' + hold.score + ' expand=' + expand.score };
  });

  t(slug, 'sensitivity runs and returns a verdict', function () {
    var m = model();
    var s = E.sensitivity(m.criteria, m.options);
    return { pass: s.ok && typeof s.robust === 'boolean' && Array.isArray(s.flips) &&
      typeof s.verdict === 'string' && s.verdict.length > 0,
      detail: 'robust=' + s.robust + ' flips=' + s.flips.length };
  });

  t(slug, 'ADVERSARIAL: weights not summing to 1 rejected', function () {
    var criteria = [];
    criteria = E.addCriterion(criteria, { name: 'A', weight: 0.4 }).criteria;
    criteria = E.addCriterion(criteria, { name: 'B', weight: 0.4 }).criteria;
    var options = [];
    options = E.addOption(options, { name: 'X', scores: { A: 5, B: 5 } }).options;
    options = E.addOption(options, { name: 'Y', scores: { A: 6, B: 4 } }).options;
    var s = E.scoreOptions(criteria, options);
    return { pass: !s.ok && /sum to 1/i.test(s.error), detail: s.ok ? 'accepted!' : s.error };
  });

  t(slug, 'ADVERSARIAL: score outside 1-10 rejected', function () {
    var m = model();
    m.options[0].scores.Cost = 11;
    var s = E.scoreOptions(m.criteria, m.options);
    return { pass: !s.ok && /1–10/.test(s.error), detail: s.ok ? 'accepted!' : s.error };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team K (10 pricing/profit/decision) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
