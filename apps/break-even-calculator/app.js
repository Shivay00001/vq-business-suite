/* ============================================================
   Break-Even Calculator — pure computation layer.
     Break-even units   = Fixed costs / (Price - Variable cost)
     Break-even revenue = Break-even units x Price
     Margin of safety   = (Current sales - BE units) / Current sales
   Requires price > variable cost per unit (else contribution is
   zero/negative and break-even never happens).
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

/**
 * Validate inputs. Returns '' if OK, else an error message.
 */
function validateBE(fixed, price, vc) {
  fixed = Number(fixed); price = Number(price); vc = Number(vc);
  if (!(fixed >= 0)) return 'Fixed costs must be 0 or more.';
  if (!(price > 0)) return 'Selling price must be greater than 0.';
  if (!(vc >= 0)) return 'Variable cost must be 0 or more.';
  if (!(price > vc)) return 'Selling price must be greater than variable cost per unit — otherwise every sale loses money and break-even is impossible.';
  return '';
}

/**
 * Full break-even analysis.
 * currentUnits: current sales volume (optional, for margin of safety).
 * Returns null when inputs are invalid (check validateBE first).
 */
function breakEven(fixed, price, vc, currentUnits) {
  fixed = Number(fixed); price = Number(price); vc = Number(vc);
  var err = validateBE(fixed, price, vc);
  if (err) return null;
  var contrib = price - vc;
  var beUnits = fixed / contrib;
  var beRevenue = beUnits * price;
  var contribRatio = contrib / price * 100;
  var cur = Number(currentUnits);
  var mos = null;
  if (cur > 0) mos = (cur - beUnits) / cur * 100;
  return {
    fixed: fixed, price: price, vc: vc,
    contribution: round2(contrib),
    contributionRatio: round2(contribRatio),
    beUnits: round2(beUnits),
    beUnitsCeil: Math.ceil(beUnits - 1e-9),
    beRevenue: round2(beRevenue),
    marginOfSafety: mos == null ? null : round2(mos),
    currentUnits: cur > 0 ? cur : null
  };
}

/**
 * What-if: how break-even units change if price moves by pct%
 * (e.g. +10). Returns {newPrice, newBE, changePct} or null.
 */
function whatIfPrice(fixed, price, vc, pct) {
  var newPrice = price * (1 + pct / 100);
  if (!(newPrice > vc)) return null;
  var oldBE = fixed / (price - vc);
  var newBE = fixed / (newPrice - vc);
  return {
    newPrice: round2(newPrice),
    newBE: round2(newBE),
    changePct: oldBE > 0 ? round2((newBE - oldBE) / oldBE * 100) : 0
  };
}

/**
 * Pure-SVG chart: total-cost line vs revenue line with the
 * break-even point marked. Returns an SVG string.
 */
function beChartSVG(fixed, price, vc, maxQ) {
  var W = 560, H = 300, padL = 52, padB = 34, padT = 16;
  var be = fixed / (price - vc);
  maxQ = Math.max(Number(maxQ) || 0, Math.ceil(be * 2), 10);
  var maxY = Math.max(fixed + vc * maxQ, price * maxQ, 1);
  var innerW = W - padL - 10, innerH = H - padT - padB;
  function X(q) { return padL + (q / maxQ) * innerW; }
  function Y(v) { return padT + innerH - (v / maxY) * innerH; }

  function shortNum(v) {
    if (v >= 1e7) return (v / 1e7).toFixed(1) + 'cr';
    if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.round(v));
  }

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="Break-even chart: cost vs revenue" style="width:100%;height:auto">';
  for (var g = 0; g <= 4; g++) {
    var gv = maxY * g / 4, gy = Y(gv);
    s += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + W +
      '" y2="' + gy.toFixed(1) + '" stroke="#e5e7eb"/>';
    s += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) +
      '" font-size="10" text-anchor="end" fill="#6b7280">' + shortNum(gv) + '</text>';
  }
  // total cost line: (0, fixed) -> (maxQ, fixed + vc*maxQ)
  s += '<line x1="' + X(0).toFixed(1) + '" y1="' + Y(fixed).toFixed(1) +
    '" x2="' + X(maxQ).toFixed(1) + '" y2="' + Y(fixed + vc * maxQ).toFixed(1) +
    '" stroke="#dc2626" stroke-width="2.5"/>';
  // revenue line: (0,0) -> (maxQ, price*maxQ)
  s += '<line x1="' + X(0).toFixed(1) + '" y1="' + Y(0).toFixed(1) +
    '" x2="' + X(maxQ).toFixed(1) + '" y2="' + Y(price * maxQ).toFixed(1) +
    '" stroke="#2563eb" stroke-width="2.5"/>';
  // break-even point
  var beY = price * be;
  s += '<line x1="' + X(be).toFixed(1) + '" y1="' + Y(beY).toFixed(1) +
    '" x2="' + X(be).toFixed(1) + '" y2="' + Y(0).toFixed(1) +
    '" stroke="#6b7280" stroke-dasharray="5,4"/>';
  s += '<circle cx="' + X(be).toFixed(1) + '" cy="' + Y(beY).toFixed(1) +
    '" r="6" fill="#16a34a" stroke="#fff" stroke-width="2"/>';
  s += '<text x="' + (X(be) + 10).toFixed(1) + '" y="' + (Y(beY) - 10).toFixed(1) +
    '" font-size="12" font-weight="700" fill="#16a34a">Break-even: ' +
    Math.ceil(be - 1e-9) + ' units</text>';
  // axis labels
  s += '<text x="' + (padL + innerW / 2) + '" y="' + (H - 8) +
    '" font-size="11" text-anchor="middle" fill="#6b7280">Units sold</text>';
  // legend
  s += '<rect x="' + (padL + 4) + '" y="4" width="10" height="10" fill="#2563eb"/>' +
    '<text x="' + (padL + 18) + '" y="13" font-size="11" fill="#374151">Revenue</text>' +
    '<rect x="' + (padL + 92) + '" y="4" width="10" height="10" fill="#dc2626"/>' +
    '<text x="' + (padL + 106) + '" y="13" font-size="11" fill="#374151">Total cost</text>';
  s += '</svg>';
  return s;
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
function beInit() {
  var SLUG = 'break-even-calculator';
  var FREE_LIMIT = 20; // calculations per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Break-even point kaise nikale? (How to calculate break-even point?)',
      a: 'Break-even units = Fixed costs ÷ (Selling price − Variable cost per unit). Break-even revenue = Break-even units × Selling price. Upar values dalein — chart ke saath turant result milega.' },
    { q: 'Margin of safety kya hota hai? (What is margin of safety?)',
      a: 'Aapki current sales break-even se kitni upar hai: (Current sales − Break-even units) ÷ Current sales × 100. Zyada margin = zyada suraksha.' },
    { q: 'Agar selling price variable cost se kam ho to? (Price below variable cost?)',
      a: 'Toh har sale par nuksaan hoga aur break-even kabhi nahi aayega — calculator aapko rok kar pehle price theek karne ko kahega.' },
    { q: 'What-if analysis kya batata hai?',
      a: 'Agar aap price 10% badhayein ya ghatayein to break-even kitna badlega — taaki pricing decisions soch-samajh kar lein.' }
  ]);
  SEO.softwareApp({
    name: 'Break-Even Calculator — ब्रेक-ईवन कैलकुलेटर',
    description: 'Free break-even calculator for Indian SMEs: break-even units & revenue, margin of safety, contribution margin, cost-vs-revenue chart, price what-if analysis.',
    keywords: ['break even calculator', 'ब्रेक ईवन कैलकुलेटर', 'break even point kaise nikale', 'margin of safety calculator', 'cost volume profit analysis']
  });

  function calculate() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('be-upsell'), SLUG, FREE_LIMIT);
      el('be-result').style.display = 'none';
      return;
    }
    el('be-upsell').innerHTML = '';

    var fixed = parseFloat(el('fixed').value);
    var price = parseFloat(el('price').value);
    var vc = parseFloat(el('vc').value);
    var cur = parseFloat(el('current').value);

    var err = el('be-error');
    err.textContent = '';
    var verr = validateBE(fixed, price, vc);
    if (verr) { err.textContent = verr; el('be-result').style.display = 'none'; return; }

    var r = breakEven(fixed, price, vc, cur);
    el('r-beunits').textContent = r.beUnits.toLocaleString('en-IN') +
      ' (≈ ' + r.beUnitsCeil.toLocaleString('en-IN') + ' poori units)';
    el('r-berev').textContent = inr(r.beRevenue);
    el('r-contrib').textContent = inr(r.contribution) + ' / unit (' + r.contributionRatio + '%)';
    el('r-mos').textContent = r.marginOfSafety == null
      ? '— (current sales dalein)'
      : r.marginOfSafety + '%';

    var up = whatIfPrice(fixed, price, vc, 10);
    var dn = whatIfPrice(fixed, price, vc, -10);
    var note = 'Har unit bechne par <strong>' + inr(r.contribution) +
      '</strong> fixed cost ki taraf jata hai (contribution margin). ';
    if (r.marginOfSafety != null) {
      note += r.marginOfSafety >= 0
        ? 'Aapki sales break-even se <strong>' + r.marginOfSafety + '% upar</strong> hain — itna cushion hai.'
        : 'Dhyaan dein: aapki sales abhi break-even se <strong>' + Math.abs(r.marginOfSafety) + '% neeche</strong> hain.';
    }
    if (up) note += '<br>What-if: price <strong>10% badhane</strong> par (' + inr(up.newPrice) +
      ') break-even <strong>' + Math.abs(up.changePct) + '% ' + (up.changePct < 0 ? 'ghatega' : 'badhega') + '</strong>. ';
    if (dn) note += 'Price <strong>10% ghatane</strong> par (' + inr(dn.newPrice) +
      ') break-even <strong>' + Math.abs(dn.changePct) + '% ' + (dn.changePct < 0 ? 'ghatega' : 'badhega') + '</strong>.';
    else note += '<br>Price 10% ghatane par variable cost se neeche chala jayega — break-even impossible.';
    el('r-note').innerHTML = note;

    el('be-chart').innerHTML = beChartSVG(fixed, price, vc, cur > 0 ? cur * 1.4 : 0);
    el('be-result').style.display = 'block';
  }

  el('calcBtn').addEventListener('click', calculate);
  ['fixed', 'price', 'vc', 'current'].forEach(function (id) {
    el(id).addEventListener('input', function () { el('be-error').textContent = ''; });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', beInit);
  } else { beInit(); }
}
