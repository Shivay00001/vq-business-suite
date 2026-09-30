/* ============================================================
   HSN / SAC Code Finder — curated dataset + search.
   Rates follow GST 2.0 (56th GST Council, effective 22-Sep-2025):
   two main slabs 5% and 18%, 40% demerit on luxury/sin goods,
   3% special on gold/jewellery, nil on essentials.
   The dataset is CURATED (~100 common SME entries), not the full
   CBIC tariff — the page and README say this plainly.
   Search logic is DOM-free so it can be unit-tested in node.
   ============================================================ */

/* rateKey: 'nil' | '3' | '5' | '18' | '40' | 'out' */
var HSN_DATA = [
  /* ---- food & agro ---- */
  { code: '0201', kind: 'HSN', name: 'Meat of bovine animals, fresh or chilled', rate: 'nil', label: 'Nil', note: 'Fresh/unprocessed meat nil; processed/frozen meat products may differ.' },
  { code: '0306', kind: 'HSN', name: 'Fish, fresh or chilled (not frozen)', rate: 'nil', label: 'Nil', note: 'Fresh fish nil; frozen/processed fish 5%.' },
  { code: '0401', kind: 'HSN', name: 'Milk and cream, fresh (not concentrated)', rate: 'nil', label: 'Nil', note: 'Fresh milk nil; UHT milk also nil since GST 2.0.' },
  { code: '0403', kind: 'HSN', name: 'Curd, lassi, buttermilk (pre-packaged & labelled)', rate: '5', label: '5%', note: 'Loose/fresh curd nil; pre-packaged & labelled 5%.' },
  { code: '0405', kind: 'HSN', name: 'Butter, ghee and other milk fats', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%).' },
  { code: '0406', kind: 'HSN', name: 'Cheese; fresh paneer', rate: '5', label: '5%', note: 'Fresh paneer nil; processed/packaged cheese 5%.' },
  { code: '0407', kind: 'HSN', name: 'Birds eggs, in shell, fresh', rate: 'nil', label: 'Nil', note: 'Fresh eggs nil.' },
  { code: '0713', kind: 'HSN', name: 'Dried leguminous vegetables (pulses/dals)', rate: 'nil', label: 'Nil', note: 'Loose dals nil; pre-packaged & labelled 5%.' },
  { code: '0801', kind: 'HSN', name: 'Coconuts, cashew nuts, Brazil nuts', rate: '5', label: '5%', note: 'Most edible nuts 5% under GST 2.0.' },
  { code: '0901', kind: 'HSN', name: 'Coffee (roasted or not)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%).' },
  { code: '0902', kind: 'HSN', name: 'Tea', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%).' },
  { code: '0904', kind: 'HSN', name: 'Pepper and other spices', rate: '5', label: '5%', note: 'Most spices 5%; check exact sub-heading for branded mixes.' },
  { code: '1001', kind: 'HSN', name: 'Wheat and meslin', rate: 'nil', label: 'Nil', note: 'Loose wheat nil; pre-packaged & labelled 5%.' },
  { code: '1006', kind: 'HSN', name: 'Rice', rate: 'nil', label: 'Nil', note: 'Loose rice nil; pre-packaged & labelled 5%.' },
  { code: '1101', kind: 'HSN', name: 'Wheat flour (atta)', rate: 'nil', label: 'Nil', note: 'Loose atta nil; branded/packaged 5%.' },
  { code: '1201', kind: 'HSN', name: 'Soya beans', rate: '5', label: '5%', note: 'Oilseeds generally 5%.' },
  { code: '1512', kind: 'HSN', name: 'Sunflower/safflower/cotton-seed oil (edible)', rate: '5', label: '5%', note: 'Edible vegetable oils 5%.' },
  { code: '1701', kind: 'HSN', name: 'Cane or beet sugar', rate: '5', label: '5%', note: 'Sugar 5%.' },
  { code: '1704', kind: 'HSN', name: 'Sugar confectionery (toffee, candy)', rate: '18', label: '18%', note: 'Confectionery 18%.' },
  { code: '1806', kind: 'HSN', name: 'Chocolate and cocoa preparations', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '1902', kind: 'HSN', name: 'Pasta, noodles, macaroni', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (instant noodles included).' },
  { code: '1905', kind: 'HSN', name: 'Bread, pastry, cakes, biscuits', rate: '18', label: '18%', note: 'Plain bread, pizza bread, chapati, khakhra, paratha: nil.' },
  { code: '2009', kind: 'HSN', name: 'Fruit/vegetable juices', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%). Aerated drinks stay 40%.' },
  { code: '2103', kind: 'HSN', name: 'Sauces, ketchup, mustard, mayonnaise', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%/18%).' },
  { code: '2106', kind: 'HSN', name: 'Namkeens, bhujia, food preparations n.e.s.', rate: '5', label: '5%', note: 'Namkeens/mixtures cut to 5% under GST 2.0 (was 12%). Pan masala under this heading: 40% demerit.' },
  { code: '2201', kind: 'HSN', name: 'Packaged drinking water', rate: '18', label: '18%', note: 'Packaged drinking water 18%.' },
  { code: '2202', kind: 'HSN', name: 'Aerated waters, soft drinks', rate: '40', label: '40%', note: 'DEMERIT rate — aerated/caffeinated beverages 40% under GST 2.0.' },
  { code: '2208', kind: 'HSN', name: 'Alcohol for human consumption (liquor)', rate: 'out', label: 'Outside GST', note: 'Liquor for human consumption is outside GST — state excise/VAT applies.' },
  { code: '2309', kind: 'HSN', name: 'Animal feed (pellets, concentrates)', rate: '5', label: '5%', note: 'Animal feed 5%.' },
  { code: '2402', kind: 'HSN', name: 'Tobacco, cigarettes, gutka, pan masala', rate: '40', label: '40%', note: 'DEMERIT rate 40% under GST 2.0 (cess continues on tobacco).' },
  { code: '2501', kind: 'HSN', name: 'Salt (common salt)', rate: 'nil', label: 'Nil', note: 'Common salt nil.' },
  { code: '2515', kind: 'HSN', name: 'Marble, travertine (unworked)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%).' },
  { code: '2523', kind: 'HSN', name: 'Cement (all types)', rate: '18', label: '18%', note: 'Cut to 18% under GST 2.0 (was 28%).' },
  { code: '2710', kind: 'HSN', name: 'Petrol, diesel, ATF (petroleum oils)', rate: 'out', label: 'Outside GST', note: 'Petrol/diesel/ATF not under GST — central excise + state VAT apply.' },
  { code: '2711', kind: 'HSN', name: 'LPG (domestic supply)', rate: '5', label: '5%', note: 'Domestic LPG 5%. Natural gas/piped gas is outside GST — verify.' },
  { code: '2716', kind: 'HSN', name: 'Electrical energy', rate: 'out', label: 'Outside GST', note: 'Electricity is outside GST — state electricity duty applies.' },
  /* ---- pharma & personal care ---- */
  { code: '3004', kind: 'HSN', name: 'Medicaments (medicines, tablets, syrups)', rate: '5', label: '5%', note: 'Most medicines 5%; 33 lifesaving drugs fully exempt.' },
  { code: '3005', kind: 'HSN', name: 'Bandages, gauze, wadding (medical)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0.' },
  { code: '3304', kind: 'HSN', name: 'Beauty/cosmetic preparations, makeup', rate: '18', label: '18%', note: 'Cosmetics 18%.' },
  { code: '3305', kind: 'HSN', name: 'Hair oil, shampoo, hair preparations', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '3306', kind: 'HSN', name: 'Toothpaste, tooth powder', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '3307', kind: 'HSN', name: 'Shaving cream, deodorants', rate: '18', label: '18%', note: 'Deodorants/shaving prep 18%.' },
  { code: '3401', kind: 'HSN', name: 'Soap (bars, toilet soap)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '3402', kind: 'HSN', name: 'Detergents, washing preparations', rate: '18', label: '18%', note: 'Detergent powder/liquid 18%.' },
  /* ---- plastics, paper, packaging ---- */
  { code: '3923', kind: 'HSN', name: 'Plastic packing articles (boxes, bottles)', rate: '18', label: '18%', note: 'Plastic packaging 18%.' },
  { code: '3926', kind: 'HSN', name: 'Other plastic articles (household)', rate: '18', label: '18%', note: 'Plastic household goods 18%.' },
  { code: '4011', kind: 'HSN', name: 'Rubber tyres (new)', rate: '18', label: '18%', note: 'Tyres 18%.' },
  { code: '4202', kind: 'HSN', name: 'Handbags, luggage, wallets', rate: '18', label: '18%', note: 'Bags/luggage 18%.' },
  { code: '4412', kind: 'HSN', name: 'Plywood, veneered panels', rate: '18', label: '18%', note: 'Plywood 18%.' },
  { code: '4802', kind: 'HSN', name: 'Paper and paperboard (uncoated)', rate: '18', label: '18%', note: 'Uncoated paper 18% (was 12% before GST 2.0). Paper used for exercise books/notebooks: nil.' },
  { code: '4818', kind: 'HSN', name: 'Toilet paper, tissues, napkins', rate: '18', label: '18%', note: 'Tissue products 18%.' },
  { code: '4901', kind: 'HSN', name: 'Printed books, brochures', rate: 'nil', label: 'Nil', note: 'Printed books nil.' },
  /* ---- textiles & apparel ---- */
  { code: '5208', kind: 'HSN', name: 'Woven cotton fabrics', rate: '5', label: '5%', note: 'Cotton fabrics 5%.' },
  { code: '5407', kind: 'HSN', name: 'Synthetic filament fabrics', rate: '5', label: '5%', note: 'Manmade fibre fabrics cut to 5% under GST 2.0 (was 12%).' },
  { code: '5509', kind: 'HSN', name: 'Synthetic staple-fibre yarn', rate: '5', label: '5%', note: 'Yarn cut to 5% under GST 2.0 (was 12%).' },
  { code: '6109', kind: 'HSN', name: 'T-shirts, knitted shirts', rate: '5', label: '5%', note: 'Readymade garments 5%; garments above Rs 2,500/piece: 18%.' },
  { code: '6204', kind: 'HSN', name: 'Womens suits, dresses (woven)', rate: '5', label: '5%', note: 'Above Rs 2,500/piece: 18%.' },
  { code: '6403', kind: 'HSN', name: 'Leather footwear', rate: '5', label: '5%', note: 'Footwear up to Rs 1,000/pair: 5%; above: 18%.' },
  /* ---- building materials, metals ---- */
  { code: '6802', kind: 'HSN', name: 'Worked marble/granite (slabs)', rate: '18', label: '18%', note: 'Worked stone 18%.' },
  { code: '6907', kind: 'HSN', name: 'Ceramic tiles', rate: '18', label: '18%', note: 'Ceramic tiles 18%.' },
  { code: '7013', kind: 'HSN', name: 'Glassware (table, kitchen)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '7108', kind: 'HSN', name: 'Gold (unwrought/semi-manufactured)', rate: '3', label: '3%', note: 'Special 3% rate on gold continues under GST 2.0.' },
  { code: '7113', kind: 'HSN', name: 'Jewellery of precious metal', rate: '3', label: '3%', note: 'Special 3% rate continues under GST 2.0.' },
  { code: '7210', kind: 'HSN', name: 'Flat-rolled steel (coated/galvanised)', rate: '18', label: '18%', note: 'Steel products 18%.' },
  { code: '7308', kind: 'HSN', name: 'Iron/steel structures (sheds, frames)', rate: '18', label: '18%', note: 'Structural steel 18%.' },
  { code: '7606', kind: 'HSN', name: 'Aluminium plates, sheets, strip', rate: '18', label: '18%', note: 'Aluminium products 18%.' },
  { code: '8201', kind: 'HSN', name: 'Hand tools (spades, axes, saws)', rate: '18', label: '18%', note: 'Hand tools 18%.' },
  { code: '8302', kind: 'HSN', name: 'Locks, hinges, mountings (base metal)', rate: '18', label: '18%', note: 'Locks & builders hardware 18%.' },
  /* ---- appliances & electronics ---- */
  { code: '8414', kind: 'HSN', name: 'Fans (ceiling, table, exhaust)', rate: '18', label: '18%', note: 'Electric fans 18%.' },
  { code: '8415', kind: 'HSN', name: 'Air conditioners', rate: '18', label: '18%', note: 'Cut to 18% under GST 2.0 (was 28%).' },
  { code: '8428', kind: 'HSN', name: 'Lifts, escalators', rate: '18', label: '18%', note: 'Lifts/escalators 18%.' },
  { code: '8443', kind: 'HSN', name: 'Printers, photocopiers', rate: '18', label: '18%', note: 'Printers 18%.' },
  { code: '8471', kind: 'HSN', name: 'Computers, laptops', rate: '18', label: '18%', note: 'Computers 18%.' },
  { code: '8504', kind: 'HSN', name: 'Transformers, UPS, inverters', rate: '18', label: '18%', note: 'UPS/inverters 18%.' },
  { code: '8507', kind: 'HSN', name: 'Electric accumulators (batteries)', rate: '18', label: '18%', note: 'General batteries 18%; EV batteries 5%.' },
  { code: '8508', kind: 'HSN', name: 'Vacuum cleaners', rate: '18', label: '18%', note: 'Vacuum cleaners 18%.' },
  { code: '8516', kind: 'HSN', name: 'Electric geysers, heaters, ovens', rate: '18', label: '18%', note: 'Electric heaters/geysers 18%.' },
  { code: '8517', kind: 'HSN', name: 'Mobile phones, smartphones', rate: '18', label: '18%', note: 'Mobile phones raised to 18% under GST 2.0 (was 12%).' },
  { code: '8528', kind: 'HSN', name: 'TVs, monitors (display units)', rate: '18', label: '18%', note: 'Cut to 18% under GST 2.0 (was 28%).' },
  { code: '8536', kind: 'HSN', name: 'Electrical switches, sockets, plugs', rate: '18', label: '18%', note: 'Switches/sockets 18%.' },
  { code: '8544', kind: 'HSN', name: 'Electric wires and cables', rate: '18', label: '18%', note: 'Wires & cables 18%.' },
  /* ---- vehicles ---- */
  { code: '8701', kind: 'HSN', name: 'Tractors (agricultural)', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%). Road tractors for semi-trailers above 1800cc excluded.' },
  { code: '8702', kind: 'HSN', name: 'Buses (public transport vehicles)', rate: '18', label: '18%', note: 'Buses 18%.' },
  { code: '8703', kind: 'HSN', name: 'Motor cars', rate: '18', label: '18% / 40%', note: 'Small cars (petrol up to 1200cc, diesel up to 1500cc): 18%. Luxury/large cars: 40% demerit.' },
  { code: '8704', kind: 'HSN', name: 'Goods vehicles (trucks, pickups)', rate: '18', label: '18%', note: 'Commercial goods vehicles 18%.' },
  { code: '8708', kind: 'HSN', name: 'Auto parts and accessories', rate: '18', label: '18%', note: 'Auto parts cut to 18% under GST 2.0 (was 28%).' },
  { code: '8711', kind: 'HSN', name: 'Motorcycles, scooters', rate: '18', label: '18% / 40%', note: 'Up to 350cc: 18%. Above 350cc: 40% demerit.' },
  { code: '8712', kind: 'HSN', name: 'Bicycles', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 12%).' },
  { code: '8716', kind: 'HSN', name: 'Trailers, semi-trailers', rate: '18', label: '18%', note: 'Trailers 18%.' },
  /* ---- furniture & misc ---- */
  { code: '9401', kind: 'HSN', name: 'Chairs, seats', rate: '18', label: '18%', note: 'Furniture 18%.' },
  { code: '9403', kind: 'HSN', name: 'Wooden/metal furniture', rate: '18', label: '18%', note: 'Furniture 18%.' },
  { code: '9404', kind: 'HSN', name: 'Mattresses, quilts', rate: '18', label: '18%', note: 'Mattresses 18%.' },
  { code: '9603', kind: 'HSN', name: 'Toothbrushes, brooms, brushes', rate: '5', label: '5%', note: 'Toothbrushes cut to 5% under GST 2.0 (was 18%).' },
  { code: '9619', kind: 'HSN', name: 'Sanitary towels, napkins, diapers', rate: 'nil', label: 'Nil', note: 'Sanitary napkins nil.' },
  /* ---- services (SAC) ---- */
  { code: '9954', kind: 'SAC', name: 'Construction services (works contract)', rate: '18', label: '18%', note: 'General works contract 18%; specified government/affordable-housing contracts 12%.' },
  { code: '9961', kind: 'SAC', name: 'Restaurant services (food & beverage)', rate: '5', label: '5%', note: 'Restaurant service 5% without ITC.' },
  { code: '9963', kind: 'SAC', name: 'Hotel accommodation', rate: '5', label: '5% / 18%', note: 'Room tariff up to Rs 7,500/day: 5% (no ITC); above Rs 7,500: 18% with ITC. Eff. 22 Sep 2025.' },
  { code: '9964', kind: 'SAC', name: 'Passenger transport services (road)', rate: '5', label: '5% / Nil', note: 'Non-AC contract/stage carriage: nil; AC contract carriage: 5% with ITC.' },
  { code: '9965', kind: 'SAC', name: 'Goods transport agency (GTA) services', rate: '5', label: '5% / 12%', note: '5% without ITC, or 12% with ITC (GTA option).' },
  { code: '9966', kind: 'SAC', name: 'Rental of transport vehicles (with operator)', rate: '18', label: '18%', note: 'Vehicle rental with fuel/operator 18%.' },
  { code: '9971', kind: 'SAC', name: 'Financial services (bank charges, processing fees)', rate: '18', label: '18%', note: 'Financial services 18%; life & health insurance policies: nil since GST 2.0.' },
  { code: '9982', kind: 'SAC', name: 'Legal services', rate: '18', label: '18%', note: 'Legal/advocate services 18% (often under reverse charge for business clients).' },
  { code: '9983', kind: 'SAC', name: 'Professional, technical & business services (consulting, CA)', rate: '18', label: '18%', note: 'Consulting/CA/CS/agency services 18%.' },
  { code: '9984', kind: 'SAC', name: 'Telecom, internet & broadcasting services', rate: '18', label: '18%', note: 'Telecom/broadband/DTH 18%.' },
  { code: '9985', kind: 'SAC', name: 'Support services (BPO, security, housekeeping)', rate: '18', label: '18%', note: 'Manpower/security/BPO support 18%.' },
  { code: '9987', kind: 'SAC', name: 'Maintenance, repair & installation services', rate: '18', label: '18%', note: 'AMC/repair/installation 18%.' },
  { code: '9992', kind: 'SAC', name: 'Education services (recognised institutions)', rate: 'nil', label: 'Nil', note: 'Education by recognised boards/universities nil; commercial coaching 18%.' },
  { code: '9993', kind: 'SAC', name: 'Human health services (hospitals, clinics)', rate: 'nil', label: 'Nil', note: 'Healthcare services nil (room rent above Rs 5,000/day taxable — verify).' },
  { code: '9995', kind: 'SAC', name: 'Personal care services — gyms, salons, yoga', rate: '5', label: '5%', note: 'Cut to 5% under GST 2.0 (was 18%).' },
  { code: '9996', kind: 'SAC', name: 'Betting, gambling, lottery, casinos, horse racing', rate: '40', label: '40%', note: 'DEMERIT rate 40% under GST 2.0 (includes online gaming/betting).' },
  { code: '9997', kind: 'SAC', name: 'Other services (membership, events)', rate: '18', label: '18%', note: 'Residual services 18%.' }
];

/**
 * Search the dataset. q matches code prefix or keyword in name (case-insensitive).
 * Returns up to `max` entries. DOM-free.
 */
function searchHSN(data, q, kind, rateKey, max) {
  max = max || 200;
  q = String(q || '').trim().toLowerCase();
  var tokens = q.split(/\s+/).filter(Boolean);
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var e = data[i];
    if (kind && e.kind !== kind) continue;
    if (rateKey && e.rate !== rateKey) continue;
    if (tokens.length) {
      var hay = (e.code + ' ' + e.name + ' ' + e.note).toLowerCase();
      var ok = true;
      for (var t = 0; t < tokens.length; t++) {
        if (hay.indexOf(tokens[t]) < 0) { ok = false; break; }
      }
      if (!ok) continue;
    }
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

function rateClass(rateKey) {
  return { nil: 'r-nil', '3': 'r-3', '5': 'r-5', '18': 'r-18', '40': 'r-40', out: 'r-out' }[rateKey] || 'r-out';
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function hsnInit() {
  var SLUG = 'hsn-sac-finder';
  var FREE_LIMIT = 20; // searches per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  var faqs = [
    { q: 'HSN code kya hota hai aur invoice me kyun chahiye? (What is an HSN code and why is it needed on invoices?)',
      a: 'HSN (Harmonized System of Nomenclature) is the international classification system for goods. GST invoices must carry the HSN code (4 or 6 digits depending on turnover) because the GST rate follows the classification. A wrong HSN can mean a wrong rate.' },
    { q: 'SAC code kya hai? (What is an SAC code?)',
      a: 'SAC (Services Accounting Code) classifies services the way HSN classifies goods. Service invoices carry a 6-digit SAC code, e.g. 9983 for professional/consulting services, 9954 for construction services.' },
    { q: 'GST 2.0 me kaunse slabs hain? (What are the GST 2.0 rate slabs?)',
      a: 'After the 56th GST Council meeting, India has two main GST slabs — 5% and 18% — plus a 40% demerit rate on luxury and sin goods (tobacco, pan masala, aerated drinks, large cars), effective 22 September 2025. The older 12% and 28% slabs were largely merged into 5% and 18%. Gold and jewellery continue at the special 3% rate.' },
    { q: 'Kya is finder me poora HSN tariff hai? (Does this finder contain the full HSN tariff?)',
      a: 'No. This is a curated dataset of about 100 of the most common entries Indian SMEs deal with. It is not the full official tariff. For exact classification — especially where the rate depends on branding, pack size or end use — check the official schedule on cbic-gst.gov.in or confirm with your CA.' },
    { q: 'Rate "5% / 18%" do rate kyun dikh rahe hain? (Why do some entries show two rates?)',
      a: 'Because the rate depends on a condition shown in the chapter note — e.g. garments up to Rs 2,500 per piece are 5%, above that 18%; branded pre-packaged rice is 5%, loose rice is nil. Read the note before applying a rate.' }
  ];
  SEO.faq(faqs);
  SEO.softwareApp({
    name: 'HSN Code Finder & SAC Code Finder — एचएसएन/एसएसी कोड खोजें',
    description: 'Free HSN/SAC code finder for Indian SMEs: ~100 common HSN chapters and SAC services with GST 2.0 rates (5%/18%/40% from 22-Sep-2025).',
    keywords: ['HSN code finder', 'SAC code finder', 'एचएसएन कोड लिस्ट', 'GST rate list', 'HSN code list with GST rate', 'GST 2.0 rate list', 'SAC code for services']
  });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderResults(list, query) {
    var box = el('results');
    el('countLine').textContent = list.length
      ? list.length + ' result' + (list.length === 1 ? '' : 's') + (query ? ' for "' + query + '"' : '')
      : (query ? 'No matches for "' + query + '". Try a simpler keyword (e.g. "phone" instead of "smartphone").' : '');
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      html += '<div class="code-card">' +
        '<div class="top"><span class="code-no">' + esc(e.code) + '</span>' +
        '<span class="kind">' + esc(e.kind) + '</span>' +
        '<span class="rate ' + rateClass(e.rate) + '">' + esc(e.label) + '</span></div>' +
        '<div class="code-desc">' + esc(e.name) + '</div>' +
        '<div class="code-note">' + esc(e.note) + '</div>' +
        '<div class="code-src">Rate basis: GST 2.0 (56th GST Council, 22-Sep-2025) · curated entry, not the full tariff</div>' +
        '</div>';
    }
    box.innerHTML = html;
  }

  function doSearch() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('hsn-upsell'), SLUG, FREE_LIMIT);
      return;
    }
    el('hsn-upsell').innerHTML = '';
    el('hsn-error').textContent = '';
    var q = el('hsnInput').value;
    var kind = el('kindFilter').value;
    var rate = el('rateFilter').value;
    renderResults(searchHSN(HSN_DATA, q, kind, rate), q.trim());
  }

  el('searchBtn').addEventListener('click', doSearch);
  el('hsnInput').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); doSearch(); }
  });
  el('clearBtn').addEventListener('click', function () {
    el('hsnInput').value = '';
    el('kindFilter').value = '';
    el('rateFilter').value = '';
    el('hsn-error').textContent = '';
    el('hsn-upsell').innerHTML = '';
    renderResults(HSN_DATA.slice(0, 24), '');
    el('countLine').textContent = 'Showing first 24 of ' + HSN_DATA.length + ' curated entries — search to find more.';
  });
  el('kindFilter').addEventListener('change', doSearch);
  el('rateFilter').addEventListener('change', doSearch);

  // initial view: first 24 entries (not metered — reading)
  renderResults(HSN_DATA.slice(0, 24), '');
  el('countLine').textContent = 'Showing first 24 of ' + HSN_DATA.length + ' curated entries — search to find more.';
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hsnInit);
  } else { hsnInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HSN_DATA: HSN_DATA, searchHSN: searchHSN };
}
