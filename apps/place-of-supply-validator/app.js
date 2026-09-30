/* ============================================================
   Place of Supply Validator — decision tree over the IGST Act.
   Statutory basis (verified Sep 2026), IGST Act 2017:
   - Sec 10(1)(a): goods with movement -> location where movement
     terminates for delivery to the recipient.
   - Sec 10(1)(b): goods delivered on direction of a third person
     (bill-to/ship-to) -> deemed received by the third person;
     PoS = third person's principal place of business.
   - Sec 10(1)(c): goods with no movement -> location of goods at
     delivery to the recipient.
   - Sec 10(1)(e): goods taken on board a conveyance -> location
     where goods are taken on board.
   - Sec 11: imports -> location of the importer; exports ->
     outside India (zero-rated under Sec 16).
   - Sec 12(2): services, both parties in India -> B2B: location of
     recipient; B2C: location of recipient where address is on
     record, else location of supplier.
   - Sec 12(3): services on immovable property -> where the
     property is located.
   - Sec 12(4): restaurant/catering -> where the service is
     performed.
   - Sec 12(8): transportation of goods -> B2B: location of
     recipient; B2C: where goods are handed over for transport
     (destination, if outside India).
   - Sec 12(9): passenger transportation -> B2B: location of
     recipient; B2C: place of embarkation for a continuous journey.
   - Sec 12(10): services on board a conveyance -> first scheduled
     point of departure.
   - Sec 13(2): general rule when supplier/recipient is outside
     India -> location of the recipient.
   - Sec 7/8: inter-state vs intra-state supply classification.
   Decision logic is DOM-free so it can be unit-tested in node.
   ============================================================ */

var STATES = [
  ['AN', 'Andaman & Nicobar Islands'], ['AP', 'Andhra Pradesh'],
  ['AR', 'Arunachal Pradesh'], ['AS', 'Assam'], ['BR', 'Bihar'],
  ['CH', 'Chandigarh'], ['CT', 'Chhattisgarh'], ['DL', 'Delhi'],
  ['DN', 'Dadra & Nagar Haveli and Daman & Diu'], ['GA', 'Goa'],
  ['GJ', 'Gujarat'], ['HP', 'Himachal Pradesh'], ['HR', 'Haryana'],
  ['JH', 'Jharkhand'], ['JK', 'Jammu & Kashmir'], ['KA', 'Karnataka'],
  ['KL', 'Kerala'], ['LA', 'Ladakh'], ['LD', 'Lakshadweep'],
  ['MH', 'Maharashtra'], ['ML', 'Meghalaya'], ['MN', 'Manipur'],
  ['MP', 'Madhya Pradesh'], ['MZ', 'Mizoram'], ['NL', 'Nagaland'],
  ['OD', 'Odisha'], ['PB', 'Punjab'], ['PY', 'Puducherry'],
  ['RJ', 'Rajasthan'], ['SK', 'Sikkim'], ['TG', 'Telangana'],
  ['TN', 'Tamil Nadu'], ['TR', 'Tripura'], ['UK', 'Uttarakhand'],
  ['UP', 'Uttar Pradesh'], ['WB', 'West Bengal'], ['XX', 'Outside India']
];

function stateName(code) {
  for (var i = 0; i < STATES.length; i++) {
    if (STATES[i][0] === code) return STATES[i][1];
  }
  return code;
}

/**
 * Determine place of supply.
 * opts: {sup, rec, recType:'registered'|'unregistered', nature:'goods'|'services',
 *        goodsScen, svcScen, third, prop}
 * Returns {pos, taxType:'intra'|'inter'|'export'|'import', rule, plain}
 */
function determinePoS(opts) {
  opts = opts || {};
  var sup = opts.sup || 'MH', rec = opts.rec || 'MH';
  var b2b = (opts.recType || 'registered') === 'registered';
  var rule = '', plain = '', pos = rec, taxType = 'inter';

  if (opts.nature === 'goods') {
    switch (opts.goodsScen || 'movement') {
      case 'movement':
        pos = rec;
        rule = 'Section 10(1)(a), IGST Act';
        plain = 'Goods that move: place of supply is the location where the movement of goods terminates for delivery to the recipient.';
        break;
      case 'billtoshipto':
        pos = opts.third || rec;
        rule = 'Section 10(1)(b), IGST Act';
        plain = 'Goods delivered on the direction of a third person (bill-to/ship-to): the third person is deemed to have received the goods, so the place of supply is the third person\'s principal place of business.';
        break;
      case 'nomovement':
        pos = sup;
        rule = 'Section 10(1)(c), IGST Act';
        plain = 'Goods with no movement (over-the-counter / ex-factory): place of supply is the location of the goods at the time of delivery to the recipient.';
        break;
      case 'onboard':
        pos = sup;
        rule = 'Section 10(1)(e), IGST Act';
        plain = 'Goods taken on board a conveyance (vessel, aircraft, train, motor vehicle): place of supply is the location at which the goods are taken on board.';
        break;
    }
    // cross-border goods
    if (sup === 'XX' && rec !== 'XX') {
      pos = rec; rule = 'Section 11(a), IGST Act';
      plain = 'Import of goods: place of supply is the location of the importer in India.';
    } else if (sup !== 'XX' && rec === 'XX') {
      pos = 'XX'; rule = 'Section 11(b) + Section 16, IGST Act';
      plain = 'Export of goods: place of supply is outside India — zero-rated supply (no GST charged).';
    }
  } else {
    // services
    if (sup === 'XX' || rec === 'XX') {
      // cross-border services: general rule
      pos = (sup === 'XX' && rec !== 'XX') ? rec : (rec === 'XX' ? 'XX' : rec);
      rule = 'Section 13(2), IGST Act (general rule)';
      plain = 'Supplier or recipient outside India: the general rule places the supply at the location of the recipient. Special sub-sections (banking, transport, OIDAR, etc.) can override this — confirm with your CA.';
    } else {
      switch (opts.svcScen || 'general') {
        case 'general':
          if (b2b) {
            pos = rec; rule = 'Section 12(2), IGST Act';
            plain = 'B2B service (registered recipient): place of supply is the location of the recipient.';
          } else {
            pos = rec; rule = 'Section 12(2) proviso, IGST Act';
            plain = 'B2C service: place of supply is the recipient\'s location where the address is on record; if the address is unknown, the supplier\'s location applies. (This tool assumes the address is on record.)';
          }
          break;
        case 'immovable':
          pos = opts.prop || sup; rule = 'Section 12(3), IGST Act';
          plain = 'Service directly in relation to immovable property (rent, construction, brokerage of land): place of supply is where the property is located.';
          break;
        case 'restaurant':
          pos = sup; rule = 'Section 12(4), IGST Act';
          plain = 'Restaurant / catering service: place of supply is where the service is actually performed.';
          break;
        case 'goodstransport':
          if (b2b) { pos = rec; rule = 'Section 12(8), IGST Act'; plain = 'Transportation of goods to a registered person: place of supply is the location of the recipient.'; }
          else { pos = sup; rule = 'Section 12(8) proviso, IGST Act'; plain = 'Transportation of goods to an unregistered person: place of supply is where the goods are handed over for transport (assumed supplier state here; if destined outside India, the destination applies).'; }
          break;
        case 'passtransport':
          if (b2b) { pos = rec; rule = 'Section 12(9), IGST Act'; plain = 'Passenger transportation for a registered person: place of supply is the location of the recipient.'; }
          else { pos = sup; rule = 'Section 12(9), IGST Act'; plain = 'Passenger transportation for an unregistered person: place of supply is where the passenger embarks on the conveyance for a continuous journey (assumed supplier state here).'; }
          break;
        case 'onboard':
          pos = sup; rule = 'Section 12(10), IGST Act';
          plain = 'Service supplied on board a conveyance: place of supply is the location of the first scheduled point of departure (assumed supplier state here).';
          break;
      }
    }
  }

  if (pos === 'XX') taxType = 'export';
  else if (sup === 'XX' && rec !== 'XX') taxType = 'import';
  else taxType = (pos === sup) ? 'intra' : 'inter';

  return { pos: pos, taxType: taxType, rule: rule, plain: plain };
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function posInit() {
  var SLUG = 'place-of-supply-validator';
  var FREE_LIMIT = 20; // checks per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Place of supply ka matlab kya hai? (What is place of supply?)',
      a: 'GST is a destination-based tax — the tax goes to the State where the supply is consumed. Place of supply is that destination, and it decides whether CGST+SGST or IGST applies.' },
    { q: 'IGST kab lagta hai aur CGST+SGST kab? (When is IGST charged vs CGST+SGST?)',
      a: 'If the supplier\'s State and the place of supply are the same → CGST + SGST (the rate is split half-half). If they are in different States → full IGST. This is Sections 7 (inter-state) and 8 (intra-state) of the IGST Act.' },
    { q: 'Services me B2B aur B2C me kya farak hai? (B2B vs B2C place of supply for services?)',
      a: 'Under the general rule (Section 12(2)): B2B — place of supply is the recipient\'s location; B2C — the recipient\'s location where the address is on record, otherwise the supplier\'s location.' },
    { q: 'Bill-to / ship-to case me place of supply kya hoga? (Bill-to/ship-to place of supply?)',
      a: 'Section 10(1)(b): when goods are delivered on a third person\'s direction, the third person is deemed to have received them — so the place of supply is the third person\'s principal place of business.' },
    { q: 'Kya ye tool har case cover karta hai? (Does this tool cover every case?)',
      a: 'No — it covers common domestic goods/services scenarios. SEZ supplies, imports, OIDAR and e-commerce have special rules; confirm unusual cases with your CA.' }
  ]);
  SEO.softwareApp({
    name: 'Place of Supply Checker — प्लेस ऑफ सप्लाई चेकर',
    description: 'Free place of supply checker for Indian GST: supplier and recipient states plus supply type → CGST+SGST vs IGST verdict with IGST Act sections 10/12/13 in plain words.',
    keywords: ['place of supply checker', 'प्लेस ऑफ सप्लाई', 'CGST SGST vs IGST', 'IGST Act section 10 12 13', 'place of supply of goods', 'inter state vs intra state GST']
  });

  function fillSelect(sel, includeOutside) {
    var html = '';
    for (var i = 0; i < STATES.length; i++) {
      if (STATES[i][0] === 'XX' && !includeOutside) continue;
      html += '<option value="' + STATES[i][0] + '">' + STATES[i][1] + '</option>';
    }
    sel.innerHTML = html;
  }
  fillSelect(el('supState'), true);
  fillSelect(el('recState'), true);
  fillSelect(el('thirdState'), false);
  fillSelect(el('propState'), false);
  el('supState').value = 'MH'; el('recState').value = 'GJ';

  function syncVisibility() {
    var nature = el('nature').value;
    var isGoods = nature === 'goods';
    el('goodsScenWrap').classList.toggle('hidden', !isGoods);
    el('svcScenWrap').classList.toggle('hidden', isGoods);
    el('thirdWrap').classList.toggle('hidden', !(isGoods && el('goodsScen').value === 'billtoshipto'));
    el('propWrap').classList.toggle('hidden', !(!isGoods && el('svcScen').value === 'immovable'));
  }
  ['nature', 'goodsScen', 'svcScen'].forEach(function (id) {
    el(id).addEventListener('change', syncVisibility);
  });
  syncVisibility();

  el('posCheckBtn').addEventListener('click', function () {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('pos-upsell'), SLUG, FREE_LIMIT);
      el('pos-result').style.display = 'none';
      return;
    }
    el('pos-upsell').innerHTML = '';
    el('pos-error').textContent = '';

    var r = determinePoS({
      sup: el('supState').value,
      rec: el('recState').value,
      recType: el('recType').value,
      nature: el('nature').value,
      goodsScen: el('goodsScen').value,
      svcScen: el('svcScen').value,
      third: el('thirdState').value,
      prop: el('propState').value
    });

    var v = el('posVerdict');
    var taxLine, cls;
    if (r.taxType === 'intra') {
      cls = 'intra';
      taxLine = '<h2>CGST + SGST</h2><p>Intra-state supply (Sec 8, IGST Act) — place of supply is in the <strong>same state</strong> as the supplier. Charge half the GST rate as CGST and half as SGST.</p>';
    } else if (r.taxType === 'inter') {
      cls = 'inter';
      taxLine = '<h2>IGST</h2><p>Inter-state supply (Sec 7, IGST Act) — place of supply is in a <strong>different state</strong> from the supplier. Charge the full GST rate as IGST.</p>';
    } else if (r.taxType === 'export') {
      cls = 'export';
      taxLine = '<h2>Zero-rated (export)</h2><p>Place of supply is <strong>outside India</strong> — this is a zero-rated supply under Sec 16, IGST Act. No GST charged; claim refund of unutilised ITC / pay under bond/LUT.</p>';
    } else {
      cls = 'inter';
      taxLine = '<h2>IGST on import</h2><p>Import: IGST is levied on the import (Sec 5(1) proviso, IGST Act) — place of supply is the <strong>importer\'s location</strong>.</p>';
    }
    v.className = 'verdict ' + cls;
    v.innerHTML = taxLine +
      '<p><strong>Place of supply:</strong> ' + stateName(r.pos) +
      ' &nbsp;·&nbsp; <strong>Supplier:</strong> ' + stateName(el('supState').value) + '</p>';

    el('posRule').innerHTML = '<strong>Rule cited: ' + r.rule.replace(/</g, '&lt;') + '</strong>' +
      r.plain.replace(/</g, '&lt;');

    el('pos-result').style.display = 'block';
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', posInit);
  } else { posInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { determinePoS: determinePoS, STATES: STATES, stateName: stateName };
}
