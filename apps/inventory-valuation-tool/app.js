/* ============================================================
   Inventory Valuation Tool — pure computation layer.
   lots:  {id, item, date, qty, rate}
   sales: {id, item, date, qty}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateLot(l) {
  if (!l || !String(l.item || '').trim()) return 'Item name is required.';
  if (String(l.item).length > 200) return 'Item name too long (max 200 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.date || ''))) return 'Date is required.';
  if (!(Number(l.qty) > 0 && Number(l.qty) < 1e9)) return 'Quantity must be between 0 and 1,00,00,00,000.';
  if (!(Number(l.rate) >= 0 && Number(l.rate) < 1e12)) return 'Rate must be 0 or more (and realistic).';
  return '';
}

function validateSale(s) {
  if (!s || !String(s.item || '').trim()) return 'Item name is required.';
  if (String(s.item).length > 200) return 'Item name too long (max 200 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date || ''))) return 'Date is required.';
  if (!(Number(s.qty) > 0 && Number(s.qty) < 1e9)) return 'Quantity must be between 0 and 1,00,00,00,000.';
  return '';
}

function itemLots(lots, item) {
  return (lots || []).filter(function (l) { return l.item === item; })
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
}
function itemSalesQty(sales, item) {
  return round2((sales || []).filter(function (s) { return s.item === item; })
    .reduce(function (sum, s) { return sum + (Number(s.qty) || 0); }, 0));
}

/**
 * FIFO valuation for one item.
 * Returns {soldQty, cogs, closingQty, closingValue, layers:[{lot, qtyLeft, rate, value}]}
 * soldQty capped at total purchased qty.
 */
function fifoValuation(lots, sales, item) {
  var L = itemLots(lots, item).map(function (l) {
    return { lot: l, qtyLeft: Number(l.qty) || 0, rate: Number(l.rate) || 0 };
  });
  var totalQty = round2(L.reduce(function (s, x) { return s + x.qtyLeft; }, 0));
  var sold = Math.min(itemSalesQty(sales, item), totalQty);
  var remaining = sold, cogs = 0;
  L.forEach(function (x) {
    if (remaining <= 0) return;
    var take = Math.min(x.qtyLeft, remaining);
    cogs = round2(cogs + take * x.rate);
    x.qtyLeft = round2(x.qtyLeft - take);
    remaining = round2(remaining - take);
  });
  var closingValue = round2(L.reduce(function (s, x) { return s + x.qtyLeft * x.rate; }, 0));
  return {
    soldQty: sold, cogs: round2(cogs),
    closingQty: round2(totalQty - sold), closingValue: closingValue,
    layers: L.map(function (x) {
      return { lot: x.lot, qtyLeft: x.qtyLeft, rate: x.rate, value: round2(x.qtyLeft * x.rate) };
    })
  };
}

/**
 * Weighted-average valuation for one item.
 * Returns {soldQty, avgRate, cogs, closingQty, closingValue, totalCost, totalQty}
 */
function wavgValuation(lots, sales, item) {
  var L = itemLots(lots, item);
  var totalQty = round2(L.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0));
  var totalCost = round2(L.reduce(function (s, l) {
    return s + (Number(l.qty) || 0) * (Number(l.rate) || 0);
  }, 0));
  var avgRate = totalQty > 0 ? round2(totalCost / totalQty) : 0;
  var sold = Math.min(itemSalesQty(sales, item), totalQty);
  var cogs = round2(sold * avgRate);
  var closingQty = round2(totalQty - sold);
  return {
    soldQty: sold, avgRate: avgRate, cogs: cogs,
    closingQty: closingQty, closingValue: round2(closingQty * avgRate),
    totalCost: totalCost, totalQty: totalQty
  };
}

function compareMethods(fifo, wavg) {
  var d = round2(fifo.closingValue - wavg.closingValue);
  if (d === 0) return 'Dono methods se closing value same hai — rates stable rahe hain.';
  if (d > 0) return 'FIFO closing value ' + inrPlain(d) + ' zyada hai — iska matlab recent lots ke rates badhe hain (rising prices). FIFO me latest rates closing stock me rehte hain.';
  return 'Weighted average closing value ' + inrPlain(-d) + ' zyada hai — iska matlab recent lots ke rates gire hain (falling prices), ya purane mehange lots ka asar average me hai.';
}

function distinctItems(lots, sales) {
  var set = {};
  (lots || []).forEach(function (l) { set[l.item] = 1; });
  (sales || []).forEach(function (s) { set[s.item] = 1; });
  return Object.keys(set).sort();
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function ivInit() {
  var SLUG = 'inventory-valuation-tool';
  var SAVE_LIMIT = 25;
  var lots = [];
  var sales = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'FIFO aur weighted average me kya farak hai?',
      a: 'FIFO me sabse purana lot pehle becha maana jaata hai (closing stock latest rates par), jabki weighted average me sabhi lots ka ausat rate lagta hai. Dono Companies Act / Income Tax me accepted methods hain.' },
    { q: 'COGS kya hota hai?',
      a: 'COGS (Cost of Goods Sold) = beche gaye maal ki khareed laagat. Profit = Sales − COGS.' },
    { q: 'Kaun sa method chunna chahiye?',
      a: 'Rising prices me FIFO closing stock zyada dikhata hai; weighted average price fluctuations ko smooth karta hai. Ek baar chuna method har saal consistent rakhein.' },
    { q: 'इन्वेंटरी वैल्यूएशन क्यों ज़रूरी है?',
      a: 'Balance sheet me stock ki sahi value aur profit ki sahi ganana ke liye valuation method zaroori hai — galat method se tax aur audit dono me dikkat hoti hai.' }
  ]);
  SEO.softwareApp({
    name: 'Inventory Valuation Tool — FIFO & Weighted Average',
    description: 'Free inventory valuation tool for Indian SMEs: closing stock by FIFO and weighted-average side-by-side, COGS both ways, method comparison.',
    keywords: ['inventory valuation', 'इन्वेंटरी वैल्यूएशन', 'FIFO valuation', 'weighted average cost', 'FIFO method India', 'COGS calculator', 'closing stock valuation', 'स्टॉक मूल्यांकन']
  });

  el('passSetBtn').addEventListener('click', async function () {
    var msg = el('passMsg');
    try {
      await Vault.setPassphrase(el('passInput').value);
      msg.textContent = '✓ Vault encrypted for this session. Naye saves encrypted honge.';
      el('passInput').value = '';
    } catch (e) {
      msg.textContent = 'Encryption unavailable (' + e.message + ') — data unencrypted save hoga.';
    }
  });
  el('passClearBtn').addEventListener('click', function () {
    Vault.clearPassphrase();
    el('passMsg').textContent = 'Vault locked. Encrypted records padhne ke liye passphrase dobara set karein.';
  });

  function persist() {
    return Vault.save(SLUG, 'data', { lots: lots, sales: sales }).catch(function () {});
  }

  function addLot() {
    var err = el('l-error'); err.textContent = '';
    var l = { id: uid('l'), item: el('l-item').value.trim(), date: el('l-date').value,
      qty: parseFloat(el('l-qty').value) || 0, rate: parseFloat(el('l-rate').value) };
    var verr = validateLot(l);
    if (verr) { err.textContent = verr; return; }
    lots.push(l);
    el('l-qty').value = ''; el('l-rate').value = '';
    persist().then(renderAll);
  }

  function addSale() {
    var err = el('s-error'); err.textContent = '';
    var s = { id: uid('s'), item: el('s-item').value.trim(), date: el('s-date').value,
      qty: parseFloat(el('s-qty').value) || 0 };
    var verr = validateSale(s);
    if (verr) { err.textContent = verr; return; }
    var bought = round2(itemLots(lots, s.item).reduce(function (t, l) { return t + (Number(l.qty) || 0); }, 0));
    var soldAlready = itemSalesQty(sales, s.item);
    if (s.qty + soldAlready > bought + 1e-9) {
      err.textContent = 'Sale qty (' + s.qty + ') purchased qty (' + bought + ') se zyada hai.';
      return;
    }
    sales.push(s);
    el('s-qty').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var items = distinctItems(lots, sales);
    var sel = el('itemSel');
    var cur = sel.value;
    sel.innerHTML = items.map(function (i) {
      return '<option value="' + esc(i) + '">' + esc(i) + '</option>';
    }).join('') || '<option value="">— pehle lot add karein —</option>';
    if (items.indexOf(cur) >= 0) sel.value = cur;
    var item = sel.value;

    if (!item) {
      ['fifoSold','fifoCogs','fifoClose','fifoVal','wavgSold','wavgCogs','wavgRate','wavgClose','wavgVal']
        .forEach(function (id) { el(id).textContent = '—'; });
      el('valItem').textContent = '';
      el('fifoBody').innerHTML = '<tr><td colspan="4" class="vq-hint">Koi data nahi.</td></tr>';
      el('wavgBody').innerHTML = '<tr><td colspan="4" class="vq-hint">Koi data nahi.</td></tr>';
      el('cmpNote').textContent = '—';
      return;
    }

    el('valItem').textContent = item;
    var f = fifoValuation(lots, sales, item);
    var w = wavgValuation(lots, sales, item);

    el('fifoSold').textContent = f.soldQty;
    el('fifoCogs').textContent = inr(f.cogs);
    el('fifoClose').textContent = f.closingQty;
    el('fifoVal').textContent = inr(f.closingValue);
    el('fifoBody').innerHTML = f.layers.length ? f.layers.map(function (x) {
      return '<tr><td>' + esc(x.lot.date) + ' @' + inr(x.rate) + '</td>' +
        '<td class="r">' + x.qtyLeft + '</td><td class="r">' + inr(x.rate) + '</td>' +
        '<td class="r">' + inr(x.value) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="vq-hint">Koi lot nahi.</td></tr>';

    el('wavgSold').textContent = w.soldQty;
    el('wavgCogs').textContent = inr(w.cogs);
    el('wavgRate').textContent = inr(w.avgRate);
    el('wavgClose').textContent = w.closingQty;
    el('wavgVal').textContent = inr(w.closingValue);
    el('wavgBody').innerHTML = w.totalQty ? itemLots(lots, item).map(function (l) {
      var c = round2((Number(l.qty) || 0) * (Number(l.rate) || 0));
      return '<tr><td>' + esc(l.date) + '</td><td class="r">' + l.qty + '</td>' +
        '<td class="r">' + inr(l.rate) + '</td><td class="r">' + inr(c) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="vq-hint">Koi lot nahi.</td></tr>';

    el('cmpNote').textContent = compareMethods(f, w);
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var item = el('itemSel').value;
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), item: item,
        fifo: fifoValuation(lots, sales, item), wavg: wavgValuation(lots, sales, item)
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('l-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addLotBtn').addEventListener('click', addLot);
  el('addSaleBtn').addEventListener('click', addSale);
  el('itemSel').addEventListener('change', renderAll);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('l-date').value = today();
  el('s-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.lots)) lots = d.lots;
    if (d && Array.isArray(d.sales)) sales = d.sales;
    renderAll();
  }).catch(renderAll);
}

function inrPlain(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function inr(n) { return inrPlain(n); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ivInit);
  } else { ivInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validateLot: validateLot,
    validateSale: validateSale, itemLots: itemLots, itemSalesQty: itemSalesQty,
    fifoValuation: fifoValuation, wavgValuation: wavgValuation,
    compareMethods: compareMethods, distinctItems: distinctItems };
}
