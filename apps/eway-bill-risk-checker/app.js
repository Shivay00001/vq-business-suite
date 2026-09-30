/* ============================================================
   E-Way Bill Risk Checker.
   Statutory basis (verified Sep 2026):
   - Sec 68 CGST Act + Rule 138 CGST Rules: e-way bill mandatory
     before movement of goods with consignment value > Rs 50,000
     (inter-state; intra-state thresholds vary by state).
   - Rule 138(10) as amended by Notification 94/2020-CT
     (w.e.f. 1-Jan-2021): validity = 1 day per 200 km (regular
     cargo; part thereof counts as a full day), 1 day per 20 km
     for over-dimensional cargo / multimodal with a ship leg.
     The validity clock starts when Part B is filled.
   - Extension: within 8 hours before/after expiry; total validity
     including extensions capped at 360 days.
   - From 1-Jan-2025: e-way bills only for documents dated within
     180 days of generation.
   - Penalty: Rs 10,000 or tax sought to be evaded, whichever is
     higher (Sec 129 CGST Act).
   Core logic is DOM-free so it can be unit-tested in node.
   ============================================================ */

var THRESHOLD_INTERSTATE = 50000;
var KM_PER_DAY_REGULAR = 200;
var KM_PER_DAY_ODC = 20;
var DOC_AGE_LIMIT_DAYS = 180;

/** Validity days for a distance (min 1 day). */
function validityDays(km, odc) {
  km = Number(km) || 0;
  var per = odc ? KM_PER_DAY_ODC : KM_PER_DAY_REGULAR;
  return Math.max(1, Math.ceil(km / per));
}

/**
 * Assess requirement.
 * opts: {value, distance, cargo:'regular'|'odc', movement:'inter'|'intra',
 *        goodsType:'normal'|'exempt14'|'seztport', docDateISO, todayISO}
 * Returns {verdict:'required'|'not-required'|'exempt', reasons:[], days, docAgeDays}
 */
function assessEwayBill(opts) {
  opts = opts || {};
  var value = Number(opts.value) || 0;
  var km = Number(opts.distance) || 0;
  var odc = opts.cargo === 'odc';
  var reasons = [];
  var verdict = 'required';

  if (opts.goodsType === 'exempt14') {
    verdict = 'exempt';
    reasons.push('Goods fall in an exempted category under Rule 138(14) — no e-way bill needed, but keep verifying the exemption list for your goods.');
  } else if (opts.goodsType === 'seztport') {
    verdict = 'exempt';
    reasons.push('Movement from a customs port/airport to an ICD/CFS under customs bond is outside the e-way bill requirement.');
  } else if (value <= THRESHOLD_INTERSTATE && opts.movement === 'inter') {
    verdict = 'not-required';
    reasons.push('Consignment value Rs ' + value.toLocaleString('en-IN') + ' is at or below the Rs 50,000 inter-state threshold.');
  } else if (value <= THRESHOLD_INTERSTATE && opts.movement === 'intra') {
    verdict = 'not-required';
    reasons.push('Consignment value Rs ' + value.toLocaleString('en-IN') + ' is at or below Rs 50,000 — but note several states notify higher intra-state thresholds; this tool uses the standard threshold.');
  } else {
    reasons.push('Consignment value Rs ' + value.toLocaleString('en-IN') + ' exceeds the Rs 50,000 threshold — e-way bill is mandatory before movement begins (Sec 68, Rule 138).');
  }

  var days = validityDays(km, odc);
  reasons.push('Validity for ' + km + ' km (' + (odc ? 'over-dimensional' : 'regular') + ' cargo): ' +
    days + ' day' + (days === 1 ? '' : 's') + ' from Part B generation (1 day per ' +
    (odc ? 20 : 200) + ' km or part thereof).');

  var docAgeDays = null;
  if (opts.docDateISO) {
    var doc = new Date(String(opts.docDateISO).slice(0, 10) + 'T00:00:00');
    var today = opts.todayISO
      ? new Date(String(opts.todayISO).slice(0, 10) + 'T00:00:00')
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
    if (!isNaN(doc.getTime())) {
      docAgeDays = Math.floor((today - doc) / 86400000);
      if (docAgeDays > DOC_AGE_LIMIT_DAYS) {
        reasons.push('WARNING: document is ' + docAgeDays + ' days old — e-way bills can only cover documents dated within 180 days (rule since 1-Jan-2025).');
        if (verdict === 'required') verdict = 'required';
      }
    }
  }

  return { verdict: verdict, reasons: reasons, days: days, docAgeDays: docAgeDays };
}

/* Rejection/detention risks derived from the Part A/B checklist. */
var RISK_TEXTS = {
  partA: 'Part A incomplete — the bill can be rejected at generation; fill GSTINs, invoice no./date, HSN, value and reason for transport.',
  partB: 'Part B missing — validity clock never starts and the vehicle cannot legally move; fill vehicle no. / transporter ID before dispatch.',
  vehMatch: 'Vehicle number mismatch — if the number on the bill differs from the actual vehicle, officers can detain the consignment.',
  valMatch: 'Value mismatch with invoice — under-declared value is treated as an attempt to evade tax (Sec 129 penalty).',
  hsn: 'HSN missing/wrong — wrong classification can change the applicable tax rate and trigger notices.',
  dist: 'Under-declared distance — validity is computed on the distance you enter; too few days means the bill expires mid-journey.'
};

function checklistRisks(checks) {
  // checks: {partA, partB, vehMatch, valMatch, hsn, dist} true = OK
  var risks = [];
  Object.keys(RISK_TEXTS).forEach(function (k) {
    if (!checks[k]) risks.push(RISK_TEXTS[k]);
  });
  return risks;
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function ewayInit() {
  var SLUG = 'eway-bill-risk-checker';
  var FREE_LIMIT = 20; // checks per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'E-way bill kab mandatory hai? (When is an e-way bill mandatory?)',
      a: 'When the consignment value exceeds Rs 50,000 (inter-state; intra-state thresholds vary by state) — the e-way bill must be generated before movement begins (Section 68, Rule 138).' },
    { q: 'E-way bill ki validity kitni hoti hai? (What is the e-way bill validity period?)',
      a: 'Regular cargo: 1 day for every 200 km or part thereof; over-dimensional cargo: 1 day for every 20 km (Notification 94/2020, effective 1-Jan-2021). The validity clock starts when Part B is filled.' },
    { q: 'E-way bill expire ho jaye to kya karein? (What if the e-way bill expires?)',
      a: 'Validity can be extended on the portal within 8 hours before or after expiry, with a reason. If that window is missed, a fresh e-way bill must be generated.' },
    { q: 'Bina e-way bill ke maal pakda gaya to penalty kitni hai? (Penalty for moving goods without an e-way bill?)',
      a: 'Under Section 129: Rs 10,000 or the tax sought to be evaded, whichever is higher — plus possible detention of goods and vehicle.' },
    { q: 'Kya ye tool e-way bill generate karta hai? (Does this tool generate e-way bills?)',
      a: 'No — it only checks the requirement, computes validity days, and flags rejection risks. Actual e-way bills are generated on ewaybillgst.gov.in.' }
  ]);
  SEO.softwareApp({
    name: 'E-Way Bill Risk Checker — ई-वे बिल चेकर',
    description: 'Free e-way bill risk checker: is an e-way bill required, validity days (1 day per 200 km, ODC 20 km), Part A/B checklist and common rejection reasons.',
    keywords: ['e-way bill checker', 'ई-वे बिल', 'eway bill required or not', 'e-way bill validity calculator', 'eway bill validity 200 km', 'e-way bill rejection reasons', 'eway bill part A part B']
  });

  // default doc date = today
  el('docDate').value = new Date().toISOString().slice(0, 10);

  el('ewayCheckBtn').addEventListener('click', function () {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('eway-upsell'), SLUG, FREE_LIMIT);
      el('eway-result').style.display = 'none';
      return;
    }
    el('eway-upsell').innerHTML = '';
    var err = el('eway-error');
    err.textContent = '';

    var value = parseFloat(el('consValue').value);
    var km = parseFloat(el('distance').value);
    if (!(value >= 0)) { err.textContent = 'Please enter the consignment value (₹).'; return; }
    if (!(km >= 0)) { err.textContent = 'Please enter the distance (km).'; return; }

    var res = assessEwayBill({
      value: value,
      distance: km,
      cargo: el('cargoType').value,
      movement: el('movementType').value,
      goodsType: el('goodsType').value,
      docDateISO: el('docDate').value
    });

    var risks = checklistRisks({
      partA: el('ckPartA').checked, partB: el('ckPartB').checked,
      vehMatch: el('ckVehMatch').checked, valMatch: el('ckValMatch').checked,
      hsn: el('ckHsn').checked, dist: el('ckDist').checked
    });

    var v = el('ewayVerdict');
    if (res.verdict === 'required') {
      v.className = 'verdict req';
      v.innerHTML = '<h2>⚠ E-Way Bill REQUIRED</h2><p>Generate the e-way bill on <strong>ewaybillgst.gov.in</strong> <strong>before</strong> the goods start moving.</p>';
    } else if (res.verdict === 'not-required') {
      v.className = 'verdict notreq';
      v.innerHTML = '<h2>✓ E-Way Bill NOT required</h2><p>Value is within the standard threshold — but keep the invoice/delivery challan with the vehicle anyway.</p>';
    } else {
      v.className = 'verdict exempt';
      v.innerHTML = '<h2>ℹ Exempt category</h2><p>No e-way bill needed for this category — carry proof of the exemption with the consignment.</p>';
    }
    var rh = '';
    res.reasons.forEach(function (r) { rh += '<p class="reason">• ' + r.replace(/</g, '&lt;') + '</p>'; });
    v.innerHTML += rh;

    var now = new Date();
    var expiry = new Date(now.getTime() + res.days * 86400000);
    function dstr(d) {
      return String(d.getDate()).padStart(2, '0') + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    }
    el('ewayGrid').innerHTML =
      '<div class="res-cell"><div class="k">Validity period</div><div class="v">' + res.days + ' day' + (res.days === 1 ? '' : 's') + '</div></div>' +
      '<div class="res-cell"><div class="k">If Part B filled today, valid till (approx)</div><div class="v">' + dstr(expiry) + ' (midnight)</div></div>' +
      '<div class="res-cell"><div class="k">Consignment value</div><div class="v">' + inr(value) + '</div></div>' +
      '<div class="res-cell"><div class="k">Distance</div><div class="v">' + km + ' km</div></div>';

    var rl = el('riskList');
    if (!risks.length) {
      rl.innerHTML = '<li><strong>All checklist items ticked</strong> — no rejection risks flagged from your inputs. Still re-verify the details on the portal before dispatch.</li>';
    } else {
      rl.innerHTML = risks.map(function (r) {
        return '<li>⚠ ' + r.replace(/</g, '&lt;') + '</li>';
      }).join('');
    }

    el('eway-result').style.display = 'block';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ewayInit);
  } else { ewayInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validityDays: validityDays, assessEwayBill: assessEwayBill,
    checklistRisks: checklistRisks, THRESHOLD_INTERSTATE: THRESHOLD_INTERSTATE };
}
