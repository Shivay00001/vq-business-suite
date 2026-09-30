/* ============================================================
   Pricing Calculator — pure computation layer.
   GST 2.0 slabs (w.e.f. 22 Sept 2025): 0%, 5%, 18%, 40%.
   (12% and 28% slabs abolished.)

   unitCost = material + labor + overhead + packaging + delivery
   margin-mode: price = unitCost / (1 − marginPct/100)
   target-mode: marginPct = (price − unitCost) / price * 100
   exclusive: incl = price × (1 + r/100)
   inclusive: base = price / (1 + r/100); gstAmt = price − base
   10% discount: newPrice = price × 0.9; margin recomputed
   break-even units = fixedMonthly / (price − variablePerUnit)
   variablePerUnit = material + labor + packaging + delivery
   DOM-free; unit-testable in node.
   ============================================================ */

var GST_SLABS = [0, 5, 18, 40];

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** Total unit cost from cost parts. */
function unitCost(c) {
  return round2(num(c.material) + num(c.labor) + num(c.overhead) +
    num(c.packaging) + num(c.delivery));
}

/** Variable cost per unit (everything except overhead). */
function variableCost(c) {
  return round2(num(c.material) + num(c.labor) + num(c.packaging) + num(c.delivery));
}

/**
 * Main calculation. opts: {costs, mode:'margin'|'target', marginPct, targetPrice,
 *                          gstRate, gstMode:'exclusive'|'inclusive', fixedMonthly}
 * Returns result object.
 */
function priceCalc(opts) {
  var costs = opts.costs || {};
  var cost = unitCost(costs);
  var r = { unitCost: cost, errors: [] };
  var gstRate = num(opts.gstRate);
  if (GST_SLABS.indexOf(gstRate) < 0) r.errors.push('GST slab must be one of 0, 5, 18, 40%.');

  var priceEx, marginPct;
  if (opts.mode === 'target') {
    priceEx = num(opts.targetPrice);
    if (!(priceEx > 0)) r.errors.push('Target price must be greater than 0.');
    if (priceEx <= cost) r.errors.push('Target price is below unit cost — margin would be negative.');
    marginPct = priceEx > 0 ? round2((priceEx - cost) / priceEx * 100) : 0;
  } else {
    marginPct = num(opts.marginPct);
    if (!(marginPct >= 0 && marginPct < 100)) r.errors.push('Margin % must be between 0 and 99.');
    priceEx = marginPct >= 100 ? 0 : round2(cost / (1 - marginPct / 100));
  }
  r.priceEx = priceEx;
  r.marginPct = marginPct;
  r.marginRs = round2(priceEx - cost);

  // GST treatment (margin is computed on GST-exclusive base)
  if (opts.gstMode === 'inclusive') {
    r.priceIncl = priceEx; // user-entered price already includes GST
    r.gstAmt = round2(priceEx * gstRate / (100 + gstRate));
    r.basePrice = round2(priceEx - r.gstAmt);
    r.marginRs = round2(r.basePrice - cost);
    r.marginPct = r.basePrice > 0 ? round2(r.marginRs / r.basePrice * 100) : 0;
    r.priceEx = r.basePrice; // display base as exclusive
  } else {
    r.gstAmt = round2(priceEx * gstRate / 100);
    r.priceIncl = round2(priceEx + r.gstAmt);
    r.basePrice = priceEx;
  }

  // 10% discount impact (on exclusive base price)
  var dPrice = round2(r.basePrice * 0.9);
  var dMarginRs = round2(dPrice - cost);
  r.discount = {
    pct: 10, newPrice: dPrice,
    newMarginRs: dMarginRs,
    newMarginPct: dPrice > 0 ? round2(dMarginRs / dPrice * 100) : 0,
    marginLost: round2(r.marginRs - dMarginRs)
  };

  // Break-even
  var fixed = num(opts.fixedMonthly);
  var vc = variableCost(costs);
  r.variableCost = vc;
  r.contribution = round2(r.basePrice - vc);
  if (fixed > 0) {
    if (r.contribution > 0) {
      r.breakEvenUnits = Math.ceil(fixed / r.contribution);
    } else {
      r.breakEvenUnits = null; // never
      r.errors.push('Price does not cover variable cost — break-even impossible at this price.');
    }
  } else {
    r.breakEvenUnits = null;
  }
  r.fixedMonthly = round2(fixed);
  return r;
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function pcInit() {
  var SLUG = 'pricing-calculator';
  var FREE_LIMIT = 20; // calculations per day
  var SAVE_LIMIT = 25; // report snapshots per day
  var lastResult = null;

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Product ka selling price kaise nikalein?',
      a: 'Total unit cost (material + labor + overhead + packaging + delivery) nikalein, phir Price = Cost ÷ (1 − margin%) lagayein. 30% margin par ₹200 cost ka price = ₹285.71.' },
    { q: 'GST 2.0 me kaun se slabs hain?',
      a: 'GST 2.0 (22 Sept 2025 se) me 4 slabs: 0%, 5%, 18% aur 40%. Purane 12% aur 28% slabs khatm. 40% sirf luxury/sin goods par.' },
    { q: 'GST inclusive aur exclusive me kya farak hai?',
      a: 'Exclusive: price par GST alag se judta hai. Inclusive: price me GST pehle se shamil hai — tax = Price × Rate ÷ (100 + Rate).' },
    { q: 'Break-even units kya hote hain?',
      a: 'Fixed cost ÷ (Price − Variable cost per unit). Isse kam becha to nuksaan, zyada becha to munafa.' }
  ]);
  SEO.softwareApp({
    name: 'Pricing Calculator — प्रोडक्ट प्राइस कैलकुलेटर GST 2.0',
    description: 'Free pricing calculator for Indian SMEs: cost + margin → price, GST 2.0 slabs (0/5/18/40%), inclusive/exclusive toggle, discount impact, break-even units.',
    keywords: ['pricing calculator', 'प्राइस कैलकुलेटर', 'product pricing India', 'margin calculator', 'GST inclusive exclusive', 'break even units', 'selling price formula']
  });

  function cell(label, value, sub) {
    return '<div class="res-cell"><div class="l">' + label + '</div><div class="v">' + value + '</div>' +
      (sub ? '<div class="l">' + sub + '</div>' : '') + '</div>';
  }

  function calculate() {
    var err = el('p-error'); err.textContent = '';
    el('p-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    el('p-meter').textContent = 'Free calculations left today: ' + gate.remaining + '/' + FREE_LIMIT;
    if (!gate.allowed) {
      Freemium.renderUpsell(el('p-upsell'), SLUG, FREE_LIMIT);
      el('resultWrap').style.display = 'none';
      return;
    }
    var mode = document.querySelector('input[name="pmode"]:checked').value;
    var costs = {
      material: el('c-material').value, labor: el('c-labor').value,
      overhead: el('c-overhead').value, packaging: el('c-packaging').value,
      delivery: el('c-delivery').value
    };
    var r = priceCalc({
      costs: costs, mode: mode,
      marginPct: el('c-margin').value, targetPrice: el('c-target').value,
      gstRate: el('c-gst').value, gstMode: el('c-gstmode').value,
      fixedMonthly: el('c-fixed').value
    });
    if (r.errors.length) { err.textContent = r.errors.join(' '); el('resultWrap').style.display = 'none'; return; }
    lastResult = r;

    el('resGrid').innerHTML =
      cell('Unit cost', inr(r.unitCost)) +
      cell('Selling price (ex-GST)', inr(r.priceEx)) +
      cell('Selling price (incl. ' + el('c-gst').value + '% GST)', inr(r.priceIncl)) +
      cell('Margin', inr(r.marginRs), r.marginPct + '% of price') +
      cell('GST amount', inr(r.gstAmt)) +
      cell('Contribution / unit', inr(r.contribution), 'price − variable cost');
    el('formulaLine').textContent = mode === 'margin'
      ? 'Formula: Price = Cost ÷ (1 − margin%) = ' + inr(r.unitCost) + ' ÷ ' + (1 - num(el('c-margin').value) / 100).toFixed(3)
      : 'Formula: margin% = (Price − Cost) ÷ Price × 100';

    var d = r.discount;
    var discCls = d.newMarginPct < 0 ? 'color:#b42318' : '';
    el('discGrid').innerHTML =
      cell('Price after 10% off', inr(d.newPrice)) +
      cell('New margin', '<span style="' + discCls + '">' + inr(d.newMarginRs) + '</span>', d.newMarginPct + '% of price') +
      cell('Margin lost / unit', inr(d.marginLost));
    el('discNote').textContent = d.newMarginPct < 0
      ? '⚠ 10% discount par aapko har unit par nuksaan hoga — discount kam karein ya cost ghataein.'
      : '10% discount ke baad bhi ' + d.newMarginPct + '% margin bachta hai.';

    el('beGrid').innerHTML =
      cell('Fixed cost / month', inr(r.fixedMonthly)) +
      cell('Variable cost / unit', inr(r.variableCost)) +
      cell('Break-even units', r.breakEvenUnits != null ? r.breakEvenUnits + ' units' : '—',
        r.breakEvenUnits != null ? 'Formula: fixed ÷ contribution' : 'Fixed cost bharein');

    el('resultWrap').style.display = 'block';
    el('p-saved').textContent = '';
  }

  async function saveReport() {
    el('p-upsell').innerHTML = '';
    if (!lastResult) { el('p-error').textContent = 'Pehle calculate karein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('p-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, { result: lastResult, savedAt: new Date().toISOString() });
      el('p-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('p-error').textContent = 'Save failed: ' + e.message; }
  }

  el('calcBtn').addEventListener('click', calculate);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('p-meter').textContent = 'Free calculations left today: ' + Freemium.remaining(SLUG, FREE_LIMIT) + '/' + FREE_LIMIT;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pcInit);
  } else { pcInit(); }
}
