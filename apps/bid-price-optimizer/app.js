/* ============================================================
   VisionQuantech Business Suite — Bid Price Optimizer
   apps/bid-price-optimizer/app.js

   Pure functions first (no DOM) — tested under node.
   Given your estimated cost and a win-probability curve
   (probability of winning at your lowest price and at your
   highest price, linearly interpolated), scans candidate bid
   prices and recommends the one maximizing expected value:

     EV(price) = (price - cost) x P(win at price)

   You can also score explicit bid points. Lower bids win more
   often but earn less margin; higher bids earn more but win less.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMOUNT = 100000000000;

  function num(v, name, min, max, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (allowZero && n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  function prob(v, name) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number between 0 and 1.' };
    if (n < 0 || n > 1) return { ok: false, error: name + ' must be between 0 and 1 (e.g. 0.6 = 60% win chance).' };
    return { ok: true, value: n };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Linear win probability between floor and ceiling. */
  function winProb(price, floor, ceiling, pFloor, pCeiling) {
    if (!(price >= 0) || !isFinite(price)) return { ok: false, error: 'Price must be a number.' };
    if (price <= floor) return { ok: true, value: pFloor };
    if (price >= ceiling) return { ok: true, value: pCeiling };
    var p = pFloor + (pCeiling - pFloor) * (price - floor) / (ceiling - floor);
    return { ok: true, value: Math.min(1, Math.max(0, round2(p * 10000) / 10000)) };
  }

  function expectedValue(price, cost, floor, ceiling, pFloor, pCeiling) {
    var w = winProb(price, floor, ceiling, pFloor, pCeiling);
    if (!w.ok) return w;
    return { ok: true, prob: w.value, margin: round2(price - cost), ev: round2((price - cost) * w.value) };
  }

  function validateCurve(inp) {
    inp = inp || {};
    var cost = num(inp.cost, 'Estimated cost', 0, MAX_AMOUNT); if (!cost.ok) return cost;
    var floor = num(inp.floor, 'Lowest bid price', 0, MAX_AMOUNT); if (!floor.ok) return floor;
    var ceiling = num(inp.ceiling, 'Highest bid price', 0, MAX_AMOUNT); if (!ceiling.ok) return ceiling;
    if (floor.value > ceiling.value) return { ok: false, error: 'Lowest bid price cannot exceed the highest bid price.' };
    if (floor.value < cost.value) return { ok: false, error: 'Lowest bid price is below your estimated cost — you would lose money even if you win.' };
    var pF = prob(inp.pFloor, 'Win probability at lowest price'); if (!pF.ok) return pF;
    var pC = prob(inp.pCeiling, 'Win probability at highest price'); if (!pC.ok) return pC;
    if (pF.value < pC.value) return { ok: false, error: 'Win probability should fall (or stay flat) as price rises — probability at the lowest price must be ≥ probability at the highest price.' };
    var steps = num(inp.steps == null || inp.steps === '' ? 100 : inp.steps, 'Scan steps', 0, 1000);
    if (!steps.ok) return steps;
    if (steps.value < 10) return { ok: false, error: 'Scan steps must be at least 10.' };
    return { ok: true, cost: cost.value, floor: floor.value, ceiling: ceiling.value, pFloor: pF.value, pCeiling: pC.value, steps: Math.floor(steps.value) };
  }

  /** Scan the price band; return best EV plus the sampled curve. */
  function optimize(inp) {
    var v = validateCurve(inp);
    if (!v.ok) return v;
    var span = v.ceiling - v.floor;
    var best = null;
    var curve = [];
    var sampleEvery = Math.max(1, Math.floor(v.steps / 20));
    for (var i = 0; i <= v.steps; i++) {
      var price = span === 0 ? v.floor : round2(v.floor + span * i / v.steps);
      var e = expectedValue(price, v.cost, v.floor, v.ceiling, v.pFloor, v.pCeiling);
      if (!e.ok) return e;
      if (i % sampleEvery === 0 || i === v.steps) curve.push({ price: price, prob: e.prob, margin: e.margin, ev: e.ev });
      if (!best || e.ev > best.ev) best = { price: price, prob: e.prob, margin: e.margin, ev: e.ev };
    }
    var floorE = expectedValue(v.floor, v.cost, v.floor, v.ceiling, v.pFloor, v.pCeiling);
    var ceilE = expectedValue(v.ceiling, v.cost, v.floor, v.ceiling, v.pFloor, v.pCeiling);
    return {
      ok: true, best: best, curve: curve,
      floorPoint: { price: v.floor, prob: floorE.prob, margin: floorE.margin, ev: floorE.ev },
      ceilingPoint: { price: v.ceiling, prob: ceilE.prob, margin: ceilE.margin, ev: ceilE.ev },
      cost: v.cost
    };
  }

  /** Score an explicit list of bid points [{price, prob}]. */
  function evaluateBids(cost, points) {
    var c = num(cost, 'Estimated cost', 0, MAX_AMOUNT);
    if (!c.ok) return c;
    if (!Array.isArray(points) || !points.length) return { ok: false, error: 'Provide at least one bid point.' };
    if (points.length > 25) return { ok: false, error: 'Too many bid points (max 25).' };
    var rows = [];
    for (var i = 0; i < points.length; i++) {
      var pr = num(points[i].price, 'Bid price #' + (i + 1), 0, MAX_AMOUNT);
      if (!pr.ok) return pr;
      var pb = prob(points[i].prob, 'Win probability #' + (i + 1));
      if (!pb.ok) return pb;
      rows.push({ price: pr.value, prob: pb.value, margin: round2(pr.value - c.value), ev: round2((pr.value - c.value) * pb.value) });
    }
    rows.sort(function (a, b) { return b.ev - a.ev; });
    return { ok: true, rows: rows, best: rows[0], cost: c.value };
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
    winProb: winProb, expectedValue: expectedValue,
    optimize: optimize, evaluateBids: evaluateBids,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'bid-price-optimizer';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('b-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function pointRow(p, best) {
    return '<tr' + (best ? ' class="best-row"' : '') + '><td>' + fmtINR(p.price) + '</td>' +
      '<td>' + Math.round(p.prob * 1000) / 10 + '%</td><td>' + fmtINR(p.margin) + '</td>' +
      '<td><strong>' + fmtINR(p.ev) + '</strong></td></tr>';
  }

  function renderResult(r) {
    var card = $('b-result-card');
    card.hidden = false;
    var b = r.best;
    var html = '<p>Recommended bid: <span class="big">' + fmtINR(b.price) + '</span></p>' +
      '<p class="vq-hint">Win probability ≈ <strong>' + Math.round(b.prob * 1000) / 10 + '%</strong> · ' +
      'Margin if won: <strong>' + fmtINR(b.margin) + '</strong> · ' +
      'Expected value: <strong>' + fmtINR(b.ev) + '</strong></p>';
    html += '<table class="vq-table"><thead><tr><th>Bid price</th><th>Win prob.</th><th>Margin</th><th>Expected value</th></tr></thead><tbody>';
    html += pointRow(r.floorPoint, r.floorPoint.price === b.price);
    var seen = {};
    r.curve.forEach(function (p) {
      if (p.price === r.floorPoint.price || p.price === r.ceilingPoint.price || seen[p.price]) return;
      seen[p.price] = 1;
      html += pointRow(p, p.price === b.price);
    });
    html += pointRow(r.ceilingPoint, r.ceilingPoint.price === b.price);
    html += '</tbody></table>';
    html += '<p class="vq-hint">Expected value = (bid − cost) × win probability. It balances margin against win chances — the "optimal" price is only as good as your probability estimates. Confirm strategy with your consultant.</p>';
    $('b-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'bid-price-optimizer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'bid-price-optimizer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What bid price maximizes my expected value?', a: 'Expected value = (bid price − your cost) × probability of winning at that price. Enter your cost, your lowest and highest plausible bid prices, and your honest win probability at each end; the tool scans the band and recommends the price with the highest expected value.' },
      { q: 'बोली मूल्य कैसे चुनें?', a: 'अपेक्षित मूल्य = (बोली − लागत) × जीतने की संभावना। अपनी लागत, न्यूनतम और अधिकतम बोली, और दोनों सिरों पर ईमानदार जीत-संभावना डालें — टूल सबसे अच्छा अपेक्षित मूल्य वाला दाम सुझाएगा।' },
      { q: 'Should I always bid the lowest to win?', a: 'Not necessarily. The lowest price wins most often but leaves the thinnest margin. Expected value balances both — sometimes a mid-band price earns more on average than the cheapest winning bid.' },
      { q: 'जीत की संभावना कैसे अनुमान लगाएँ?', a: 'पिछले टेंडरों का रिकॉर्ड देखें — कितनी बार किस मूल्य-स्तर पर जीते। प्रतिस्पर्धियों की संख्या और L1 प्रवृत्ति भी मायने रखती है। ईमानदार अनुमान ही उपयोगी है।' },
      { q: 'Is the recommended price a guarantee?', a: 'No. It is a decision aid built on your own probability estimates. Tender outcomes depend on competitors and evaluation. Confirm strategy with your consultant.' }
    ]);

    $('b-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); $('b-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = optimize({
        cost: $('b-cost').value, floor: $('b-floor').value, ceiling: $('b-ceiling').value,
        pFloor: $('b-pfloor').value, pCeiling: $('b-pceiling').value, steps: 100
      });
      if (!r.ok) { msg(r.error, false); $('b-result-card').hidden = true; return; }
      msg('Optimized. ' + gate.remaining + ' free use(s) left today.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
