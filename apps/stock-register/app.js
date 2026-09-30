/* ============================================================
   Stock Register — pure computation layer.
   items:   {id, name, sku, unit, purchasePrice, salePrice, reorderLevel}
   entries: {id, itemId, date, type: 'in'|'out', qty, rate, note}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateItem(it, existing) {
  if (!it || !String(it.name || '').trim()) return 'Item name is required.';
  if (String(it.name).length > 200) return 'Item name too long (max 200 characters).';
  var sku = String(it.sku || '').trim();
  if (sku.length > 60) return 'SKU too long (max 60 characters).';
  if (String(it.unit || '').length > 20) return 'Unit too long (max 20 characters).';
  if (sku && (existing || []).some(function (x) {
    return String(x.sku || '').trim().toLowerCase() === sku.toLowerCase() && x.id !== it.id;
  })) return 'SKU already exists — use a unique SKU.';
  if (!(Number(it.purchasePrice) >= 0 && Number(it.purchasePrice) < 1e12))
    return 'Purchase price must be 0 or more (and realistic).';
  if (it.salePrice !== '' && it.salePrice != null && !(Number(it.salePrice) >= 0 && Number(it.salePrice) < 1e12))
    return 'Sale price must be 0 or more (and realistic).';
  if (it.reorderLevel !== '' && it.reorderLevel != null && !(Number(it.reorderLevel) >= 0 && Number(it.reorderLevel) < 1e9))
    return 'Reorder level must be 0 or more (and realistic).';
  return '';
}

function validateEntry(e) {
  if (!e || !e.itemId) return 'Please pick an item.';
  if (e.type !== 'in' && e.type !== 'out') return 'Entry type must be Inward or Outward.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'Date is required.';
  if (!(Number(e.qty) > 0 && Number(e.qty) < 1e9)) return 'Quantity must be between 0 and 1,00,00,00,000.';
  if (String(e.note || '').length > 300) return 'Note too long (max 300 characters).';
  if (e.rate !== '' && e.rate != null && !(Number(e.rate) >= 0 && Number(e.rate) < 1e12))
    return 'Rate must be 0 or more (and realistic).';
  return '';
}

/** qty balance for one item */
function balanceOf(entries, itemId) {
  var bal = 0;
  (entries || []).forEach(function (e) {
    if (e.itemId !== itemId) return;
    var q = Number(e.qty) || 0;
    bal += (e.type === 'in' ? q : -q);
  });
  return round2(bal);
}

/** Per-item stock rows: [{item, inQty, outQty, balance, value, flag}] */
function stockReport(items, entries) {
  return (items || []).map(function (it) {
    var inQ = 0, outQ = 0;
    (entries || []).forEach(function (e) {
      if (e.itemId !== it.id) return;
      var q = Number(e.qty) || 0;
      if (e.type === 'in') inQ += q; else outQ += q;
    });
    inQ = round2(inQ); outQ = round2(outQ);
    var bal = round2(inQ - outQ);
    var value = round2(bal * (Number(it.purchasePrice) || 0));
    var rl = Number(it.reorderLevel);
    var flag = 'ok';
    if (bal < 0) flag = 'negative';
    else if (it.reorderLevel !== '' && it.reorderLevel != null && rl >= 0 && bal <= rl) flag = 'low';
    return { item: it, inQty: inQ, outQty: outQ, balance: bal, value: value, flag: flag };
  });
}

function totalStockValue(items, entries) {
  var rows = stockReport(items, entries), s = 0;
  rows.forEach(function (r) { s = round2(s + r.value); });
  return s;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function srInit() {
  var SLUG = 'stock-register';
  var SAVE_LIMIT = 25;
  var items = [];
  var entries = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Stock register me kya-kya record hota hai?',
      a: 'Item master (name, SKU, unit, purchase/sale price) aur har inward/outward entry date ke saath. App har item ka running stock, stock value aur low/negative stock flags automatic nikaalta hai.' },
    { q: 'Stock value kaise calculate hoti hai?',
      a: 'Stock value = Balance quantity × Purchase price. FIFO/WAV jaise lot-wise valuation ke liye Inventory Valuation Tool use karein.' },
    { q: 'Negative stock flag ka matlab kya hai?',
      a: 'Iska matlab us item ki outward entries inward se zyada ho gayi hain — ya to entry miss hui hai ya data galat hai. Turant check karein.' },
    { q: 'Reorder level kis kaam ka hai?',
      a: 'Reorder level set karne par balance usse kam hote hi "Low stock" flag lagta hai — Low Stock Alerts app isi data se order suggestions banata hai.' },
    { q: 'स्टॉक रजिस्टर क्यों ज़रूरी है?',
      a: 'Stock register se pata chalta hai kaun sa maal kitna pada hai, kitne ka hai, aur kab order karna hai — bina iske overstocking ya stockout dono ka nuksaan hota hai.' }
  ]);
  SEO.softwareApp({
    name: 'Stock Register — स्टॉक रजिस्टर',
    description: 'Free stock register for Indian SMEs: item master, inward/outward entries, running stock, stock value, low & negative stock flags.',
    keywords: ['stock register', 'स्टॉक रजिस्टर', 'stock register app India', 'item master', 'inward outward register', 'stock ledger', 'inventory register']
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
    return Vault.save(SLUG, 'data', { items: items, entries: entries }).catch(function () {});
  }

  function addItem() {
    var err = el('i-error'); err.textContent = '';
    var it = {
      id: uid('it'), name: el('i-name').value.trim(), sku: el('i-sku').value.trim(),
      unit: el('i-unit').value.trim() || 'pcs',
      purchasePrice: parseFloat(el('i-pprice').value),
      salePrice: el('i-sprice').value === '' ? null : parseFloat(el('i-sprice').value),
      reorderLevel: el('i-reorder').value === '' ? null : parseFloat(el('i-reorder').value)
    };
    var verr = validateItem(it, items);
    if (verr) { err.textContent = verr; return; }
    items.push(it);
    el('i-name').value = ''; el('i-sku').value = ''; el('i-pprice').value = '';
    el('i-sprice').value = ''; el('i-reorder').value = '';
    persist().then(renderAll);
  }

  function addEntry() {
    var err = el('e-error'); err.textContent = '';
    var e = {
      id: uid('e'), itemId: el('e-item').value, type: el('e-type').value,
      date: el('e-date').value, qty: parseFloat(el('e-qty').value) || 0,
      rate: el('e-rate').value === '' ? null : parseFloat(el('e-rate').value),
      note: el('e-note').value.trim()
    };
    var verr = validateEntry(e);
    if (verr) { err.textContent = verr; return; }
    entries.push(e);
    el('e-qty').value = ''; el('e-rate').value = ''; el('e-note').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var sel = el('e-item');
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + it.id + '">' + esc(it.name) + (it.sku ? ' (' + esc(it.sku) + ')' : '') + '</option>';
    }).join('') || '<option value="">— pehle item add karein —</option>';

    var rows = stockReport(items, entries);
    el('stockBody').innerHTML = rows.length ? rows.map(function (r) {
      var it = r.item, flag;
      if (r.flag === 'negative') flag = '<span class="pill p-out">🚨 Negative</span>';
      else if (r.flag === 'low') flag = '<span class="pill p-warn">⚠ Low</span>';
      else flag = '<span class="pill p-in">OK</span>';
      return '<tr class="' + (r.flag === 'ok' ? '' : r.flag) + '"><td>' + esc(it.name) +
        '<div class="vq-hint">' + esc(it.unit || '') + ' · PP ' + inr(it.purchasePrice) +
        (it.reorderLevel != null ? ' · RL ' + it.reorderLevel : '') + '</div></td>' +
        '<td>' + esc(it.sku || '—') + '</td>' +
        '<td class="r">' + r.inQty + '</td><td class="r">' + r.outQty + '</td>' +
        '<td class="r"><strong>' + r.balance + '</strong></td>' +
        '<td class="r">' + inr(r.value) + '</td><td>' + flag + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-item" data-id="' + it.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="vq-hint">Abhi koi item nahi hai — pehle item add karein.</td></tr>';
    el('totalValue').textContent = inr(totalStockValue(items, entries));

    var sorted = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    el('entryBody').innerHTML = sorted.length ? sorted.map(function (e) {
      var it = items.filter(function (x) { return x.id === e.itemId; })[0];
      var pill = e.type === 'in'
        ? '<span class="pill p-in">IN</span>' : '<span class="pill p-info">OUT</span>';
      return '<tr><td>' + esc(e.date) + '</td><td>' + esc(it ? it.name : '(deleted)') + '</td>' +
        '<td>' + pill + '</td><td class="r">' + e.qty + '</td>' +
        '<td class="r">' + (e.rate != null ? inr(e.rate) : '—') + '</td>' +
        '<td>' + esc(e.note || '—') + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-e" data-id="' + e.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="vq-hint">Abhi koi entry nahi hai.</td></tr>';

    el('stockBody').querySelectorAll('.del-item').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete item and its entries?')) return;
        var id = b.getAttribute('data-id');
        items = items.filter(function (x) { return x.id !== id; });
        entries = entries.filter(function (x) { return x.itemId !== id; });
        persist().then(renderAll);
      });
    });
    el('entryBody').querySelectorAll('.del-e').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this entry?')) return;
        entries = entries.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(),
        report: stockReport(items, entries),
        totalValue: totalStockValue(items, entries)
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('i-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addItemBtn').addEventListener('click', addItem);
  el('addEntryBtn').addEventListener('click', addEntry);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('e-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.items)) items = d.items;
    if (d && Array.isArray(d.entries)) entries = d.entries;
    renderAll();
  }).catch(renderAll);
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', srInit);
  } else { srInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validateItem: validateItem,
    validateEntry: validateEntry, balanceOf: balanceOf, stockReport: stockReport,
    totalStockValue: totalStockValue };
}
