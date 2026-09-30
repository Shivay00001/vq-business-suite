/* ============================================================
   Composition Scheme Eligibility Checker.
   Statutory basis (verified Sep 2026):
   - Sec 10(1) CGST Act + Notification 14/2019-CT (7-Mar-2019):
     turnover limit Rs 1.5 crore (preceding FY aggregate turnover);
     Rs 75 lakh for eligible persons registered in Arunachal
     Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim,
     Tripura, Uttarakhand.
   - Notification 2/2019-CT(Rate): service providers under
     Sec 10(2A) may pay 6% on first supplies up to Rs 50 lakh
     aggregate turnover in the FY.
   - Rates (Rule 7 CGST Rules): traders/manufacturers 1%
     (0.5+0.5), restaurants (no alcohol) 5% (2.5+2.5), services 6%
     (3+3). No ITC; Bill of Supply only; no inter-state outward
     supply; no e-commerce TCS supplies; no ice-cream/pan-masala/
     tobacco manufacture; no casual/NR taxable persons.
   - CMP-08 due 18th of month after quarter; GSTR-4 annual by 30 Jun (from FY 2024-25, Notification 12/2024).
   Eligibility logic is DOM-free so it can be unit-tested in node.
   ============================================================ */

var LIMIT_GOODS_GENERAL = 15000000;  // Rs 1.5 cr
var LIMIT_GOODS_SPECIAL = 7500000;   // Rs 75 lakh (8 states)
var LIMIT_SERVICES = 5000000;        // Rs 50 lakh (Sec 10(2A))

var SPECIAL_STATES = ['Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Sikkim', 'Tripura', 'Uttarakhand'];

var RATES = {
  trader:       { pct: 1, label: 'Trader of goods — 1% (0.5% CGST + 0.5% SGST)' },
  manufacturer: { pct: 1, label: 'Manufacturer of goods — 1% (0.5% CGST + 0.5% SGST)' },
  restaurant:   { pct: 5, label: 'Restaurant (no alcohol) — 5% (2.5% CGST + 2.5% SGST)' },
  service:      { pct: 6, label: 'Service provider (Sec 10(2A)) — 6% (3% CGST + 3% SGST)' }
};

/**
 * Check eligibility.
 * opts: {turnover, bizType, specialState, dq:{interstate,ecom,nonTaxable,mfg,casual}}
 * Returns {eligible, reasons:[{ok, text}], limit, ratePct, rateLabel, estimate}
 */
function checkComposition(opts) {
  opts = opts || {};
  var turnover = Number(opts.turnover) || 0;
  var bizType = opts.bizType || 'trader';
  var special = !!opts.specialState;
  var dq = opts.dq || {};
  var rate = RATES[bizType] || RATES.trader;

  var limit = (bizType === 'service') ? LIMIT_SERVICES
            : (special ? LIMIT_GOODS_SPECIAL : LIMIT_GOODS_GENERAL);

  var reasons = [];
  function add(ok, text) { reasons.push({ ok: !!ok, text: text }); }

  add(turnover <= limit,
    'Turnover check: Rs ' + turnover.toLocaleString('en-IN') +
    ' vs limit Rs ' + limit.toLocaleString('en-IN') +
    (bizType === 'service' ? ' (services, Sec 10(2A))'
      : special ? ' (goods, special-category state)' : ' (goods)') +
    ' — ' + (turnover <= limit ? 'within limit' : 'EXCEEDS limit'));

  var dqLabels = {
    interstate: 'Inter-state outward supplies of goods are not allowed under composition (stock transfers to your own branch in another state also count).',
    ecom: 'Supplies through e-commerce operators who collect TCS (Sec 52) are not allowed.',
    nonTaxable: 'Suppliers of goods not taxable under GST cannot opt for the scheme.',
    mfg: 'Manufacturers of ice cream, pan masala or tobacco products are specifically excluded.',
    casual: 'Casual taxable persons and non-resident taxable persons cannot opt in.'
  };
  var dqHit = [];
  Object.keys(dqLabels).forEach(function (k) {
    if (dq[k]) dqHit.push(k);
  });
  if (dqHit.length) {
    dqHit.forEach(function (k) { add(false, 'BLOCKED: ' + dqLabels[k]); });
  } else {
    add(true, 'No disqualifying condition ticked (inter-state sales, e-commerce TCS, non-taxable goods, excluded manufacture, casual/NR status).');
  }

  if (bizType === 'restaurant') {
    add(true, 'Restaurants serving alcohol are excluded — you selected a no-alcohol restaurant.');
  }

  var eligible = (turnover <= limit) && dqHit.length === 0;
  var estimate = eligible ? Math.round(turnover * rate.pct) / 100 : 0;

  return {
    eligible: eligible,
    reasons: reasons,
    limit: limit,
    ratePct: rate.pct,
    rateLabel: rate.label,
    estimate: Math.round(estimate * 100) / 100,
    quarterly: Math.round(estimate / 4 * 100) / 100,
    specialStates: SPECIAL_STATES.slice()
  };
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function cmpInit() {
  var SLUG = 'gst-composition-checker';
  var FREE_LIMIT = 20; // checks per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Composition scheme me turnover limit kitni hai? (What is the turnover limit for the composition scheme?)',
      a: 'For goods (traders, manufacturers, restaurants): Rs 1.5 crore of aggregate turnover in the preceding financial year — Rs 75 lakh in Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura and Uttarakhand (Notification 14/2019-CT). For service providers under Section 10(2A): Rs 50 lakh across India.' },
    { q: 'Composition scheme me tax rate kitna hai? (What are the composition tax rates?)',
      a: 'Traders and manufacturers pay 1% of turnover (0.5% CGST + 0.5% SGST), restaurants not serving alcohol pay 5% (2.5% + 2.5%), and eligible service providers pay 6% (3% + 3%). The rate applies to total turnover, not profit — and no ITC is available.' },
    { q: 'Kya composition dealer ITC claim kar sakta hai? (Can a composition dealer claim ITC?)',
      a: 'No. Composition dealers cannot claim Input Tax Credit and cannot issue tax invoices — they issue a Bill of Supply, so their B2B customers cannot claim ITC on those purchases either.' },
    { q: 'Composition me kaunsi returns file hoti hain? (Which returns do composition dealers file?)',
      a: 'CMP-08 — a quarterly payment statement due by the 18th of the month after each quarter — and GSTR-4, an annual return due by 30 June (from FY 2024-25 onwards).' },
    { q: 'Kya ye verdict final hai? (Is this verdict final?)',
      a: 'No — it is an indicative eligibility check based on the conditions you ticked, not tax advice. Always confirm with your CA before opting in or out of the scheme.' }
  ]);
  SEO.softwareApp({
    name: 'Composition Scheme Checker — जीएसटी कंपोज़िशन स्कीम',
    description: 'Free GST composition scheme eligibility checker: turnover limits (Rs 1.5 cr / Rs 75L / Rs 50L), 1%/5%/6% tax estimate, quarterly CMP-08 dues.',
    keywords: ['composition scheme checker', 'जीएसटी composition scheme', 'GST composition scheme eligibility', 'composition scheme turnover limit', 'CMP-08', 'composition scheme tax rate 1% 5% 6%']
  });

  el('checkBtn').addEventListener('click', function () {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('cmp-upsell'), SLUG, FREE_LIMIT);
      el('cmp-result').style.display = 'none';
      return;
    }
    el('cmp-upsell').innerHTML = '';
    var err = el('cmp-error');
    err.textContent = '';

    var turnover = parseFloat(el('turnover').value);
    if (!(turnover >= 0)) { err.textContent = 'Please enter your preceding-FY aggregate turnover (₹).'; return; }

    var res = checkComposition({
      turnover: turnover,
      bizType: el('bizType').value,
      specialState: el('stateSel').value === 'special',
      dq: {
        interstate: el('dqInterstate').checked,
        ecom: el('dqEcom').checked,
        nonTaxable: el('dqNonTaxable').checked,
        mfg: el('dqMfg').checked,
        casual: el('dqCasual').checked
      }
    });

    var vb = el('verdictBox');
    vb.className = 'verdict ' + (res.eligible ? 'yes' : 'no');
    var html = '<h2>' + (res.eligible ? '✓ Likely ELIGIBLE for composition' : '✗ NOT eligible for composition') + '</h2>';
    res.reasons.forEach(function (r) {
      html += '<p class="reason ' + (r.ok ? 'pass' : 'block') + '">' +
        (r.ok ? '✓ ' : '✗ ') + r.text.replace(/</g, '&lt;') + '</p>';
    });
    vb.innerHTML = html;

    var eg = el('estGrid');
    if (res.eligible) {
      eg.innerHTML =
        '<div class="res-cell"><div class="k">Applicable rate</div><div class="v">' + res.ratePct + '%</div></div>' +
        '<div class="res-cell"><div class="k">Annual tax on turnover</div><div class="v">' + inr(res.estimate) + '</div></div>' +
        '<div class="res-cell"><div class="k">Per quarter (CMP-08)</div><div class="v">' + inr(res.quarterly) + '</div></div>' +
        '<div class="res-cell"><div class="k">Turnover limit</div><div class="v">' + inr(res.limit) + '</div></div>' +
        '<div class="res-cell total"><div class="k">Compliance</div><div class="v" style="font-size:1rem;font-weight:600">CMP-08 quarterly (by 18th) · GSTR-4 annual (by 30 Jun) · Bill of Supply only · no ITC · no inter-state sales</div></div>';
    } else {
      eg.innerHTML = '<div class="res-cell total"><div class="k">What now?</div><div class="v" style="font-size:1rem;font-weight:600">You must operate under the regular GST scheme (monthly GSTR-1 + GSTR-3B, full ITC available, tax invoices allowed). Re-check if any disqualifying condition was ticked by mistake, then confirm with your CA.</div></div>';
    }

    el('cmp-result').style.display = 'block';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cmpInit);
  } else { cmpInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkComposition: checkComposition, SPECIAL_STATES: SPECIAL_STATES,
    LIMIT_GOODS_GENERAL: LIMIT_GOODS_GENERAL, LIMIT_GOODS_SPECIAL: LIMIT_GOODS_SPECIAL,
    LIMIT_SERVICES: LIMIT_SERVICES };
}
