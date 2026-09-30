/* ============================================================
   GST Invoice Generator — pure computation layer.
   - Intra-state: CGST + SGST split equally; inter-state: IGST.
   - Tax is computed on the discounted taxable value per line.
   - GST rate options reflect GST 2.0 (56th Council, effective
     22-Sep-2025): main slabs 5% & 18%, 40% demerit rate; 12% and
     28% kept as legacy options for pre-reform periods.
   - Amount-in-words uses the Indian numbering system
     (thousand / lakh / crore).
   DOM-free; unit-testable in node.
   ============================================================ */

/** GST rate options: [value, label]. */
var GST_RATES = [
  [0, '0% (exempt / nil-rated)'],
  [5, '5%'],
  [12, '12% (legacy, pre GST 2.0)'],
  [18, '18%'],
  [28, '28% (legacy, pre GST 2.0)'],
  [40, '40% (demerit / luxury)']
];

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

/**
 * One line item.
 * Returns {taxable, cgst, sgst, igst, taxTotal, total}.
 */
function calcLineItem(qty, rate, gstRate, discountPct, intraState) {
  qty = Number(qty) || 0; rate = Number(rate) || 0;
  gstRate = Number(gstRate) || 0; discountPct = Number(discountPct) || 0;
  var gross = qty * rate;
  var taxable = gross * (1 - Math.min(Math.max(discountPct, 0), 100) / 100);
  var tax = taxable * gstRate / 100;
  var cgst = 0, sgst = 0, igst = 0;
  if (intraState) { cgst = tax / 2; sgst = tax / 2; }
  else { igst = tax; }
  return {
    taxable: round2(taxable), cgst: round2(cgst), sgst: round2(sgst),
    igst: round2(igst), taxTotal: round2(tax), total: round2(taxable + tax)
  };
}

/**
 * Whole invoice. items: [{qty, rate, gstRate, discountPct}].
 * invDiscountPct: extra discount % on subtotal (after line discounts).
 * Returns totals + per-line breakdown.
 */
function calcInvoice(items, invDiscountPct, intraState, doRoundOff) {
  items = items || [];
  invDiscountPct = Math.min(Math.max(Number(invDiscountPct) || 0, 0), 100);
  var lines = items.map(function (it) {
    return calcLineItem(it.qty, it.rate, it.gstRate, it.discountPct, intraState);
  });
  var subtotal = round2(lines.reduce(function (s, l) { return s + l.taxable; }, 0));
  var invDisc = round2(subtotal * invDiscountPct / 100);
  var taxableAfterDisc = round2(subtotal - invDisc);

  // Recompute tax on discounted taxable, pro-rata per line.
  var cgst = 0, sgst = 0, igst = 0, taxTotal = 0;
  lines.forEach(function (l, i) {
    var share = subtotal > 0 ? (items[i].qty * items[i].rate *
      (1 - Math.min(Math.max(Number(items[i].discountPct) || 0, 0), 100) / 100)) / subtotal : 0;
    var lineTaxable = round2(taxableAfterDisc * share);
    var lineTax = round2(lineTaxable * (Number(items[i].gstRate) || 0) / 100);
    l.taxable = lineTaxable; l.taxTotal = lineTax;
    if (intraState) { l.cgst = round2(lineTax / 2); l.sgst = round2(lineTax / 2); l.igst = 0; }
    else { l.igst = lineTax; l.cgst = 0; l.sgst = 0; }
    l.total = round2(lineTaxable + lineTax);
    cgst += l.cgst; sgst += l.sgst; igst += l.igst; taxTotal += lineTax;
  });
  cgst = round2(cgst); sgst = round2(sgst); igst = round2(igst); taxTotal = round2(taxTotal);
  var grand = round2(taxableAfterDisc + taxTotal);
  var rounded = doRoundOff ? Math.round(grand) : grand;
  return {
    lines: lines, subtotal: subtotal, invDiscountPct: invDiscountPct,
    invDiscount: invDisc, taxable: taxableAfterDisc,
    cgst: cgst, sgst: sgst, igst: igst, taxTotal: taxTotal,
    grandTotal: grand, roundOff: round2(rounded - grand), roundedTotal: rounded
  };
}

/** Amount in words, Indian numbering system. Paise ignored (rounded). */
function inrWords(num) {
  num = Math.round(Math.abs(Number(num) || 0));
  if (num === 0) return 'Zero';
  var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
              'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
              'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty',
              'Seventy', 'Eighty', 'Ninety'];
  function two(n) {
    return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  }
  function three(n) {
    var h = Math.floor(n / 100), r = n % 100, s = '';
    if (h) s += ones[h] + ' Hundred' + (r ? ' ' : '');
    if (r) s += two(r);
    return s;
  }
  var parts = [];
  var cr = Math.floor(num / 1e7); num %= 1e7;
  var lk = Math.floor(num / 1e5); num %= 1e5;
  var th = Math.floor(num / 1e3); num %= 1e3;
  if (cr) parts.push(three(cr) + ' Crore');
  if (lk) parts.push(two(lk) + ' Lakh');
  if (th) parts.push(two(th) + ' Thousand');
  if (num) parts.push(three(num));
  return parts.join(' ');
}

/** Indian financial year label for a date: '2026-27'. */
function fyLabel(dateISO) {
  var d = new Date((dateISO || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) d = new Date();
  var y = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 4 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2);
}

/** Next invoice number, e.g. 'INV-2026-27-0007'. */
function nextInvoiceNumber(seq, dateISO) {
  return 'INV-' + fyLabel(dateISO) + '-' + String(seq).padStart(4, '0');
}

/** Validate invoice data; returns array of error strings. */
function validateInvoice(inv) {
  var errs = [];
  if (!inv.seller || !String(inv.seller.name || '').trim()) errs.push('Seller name is required.');
  if (!inv.items || !inv.items.length) errs.push('Add at least one line item.');
  (inv.items || []).forEach(function (it, i) {
    if (!(Number(it.qty) > 0)) errs.push('Item ' + (i + 1) + ': quantity must be > 0.');
    if (!(Number(it.rate) >= 0)) errs.push('Item ' + (i + 1) + ': rate must be >= 0.');
    if (!String(it.desc || '').trim()) errs.push('Item ' + (i + 1) + ': description is required.');
  });
  return errs;
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function invInit() {
  var SLUG = 'invoice-generator';
  var MONTH_LIMIT = 10; // invoices per calendar month (free)

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Free GST invoice kaise banaye? (How to make a free GST invoice online?)',
      a: 'Seller aur buyer details bharein, items add karein (HSN/SAC, qty, rate, GST%), intra-state (CGST+SGST) ya inter-state (IGST) chunein, phir Save karke Print/PDF lein. 10 invoices/month free hain; saara data aapke browser me rehta hai.' },
    { q: 'CGST/SGST aur IGST me kya farak hai? (CGST/SGST vs IGST?)',
      a: 'Same state me sale par CGST + SGST (aadha-aadha) lagta hai; doosre state me sale par IGST lagta hai. Toggle se chunein — calculation automatic hai.' },
    { q: 'GST 2.0 ke baad kaunse GST rates hain? (GST rates after GST 2.0?)',
      a: '56th GST Council (Sept 2025) ke baad mukhya slabs 5% aur 18% hain, luxury/sin goods par 40% demerit rate — 22 Sept 2025 se effective. Purane 12%/28% legacy option me rakhe gaye hain.' },
    { q: 'Invoice number automatic kaise banta hai? (Auto invoice numbering?)',
      a: 'Har naye invoice par number auto-generate hota hai (INV-FY-0001 format), aur counter aapke device par save rehta hai.' },
    { q: 'Kya mera data safe hai? (Is my invoice data safe?)',
      a: 'Haan — invoices sirf aapke browser ke local storage me save hote hain, kahin upload nahi hote. Chahein to Vault passphrase se encrypt kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'GST Invoice Generator — फ्री जीएसटी इनवॉइस बनाएं',
    description: 'Free GST invoice maker for Indian SMEs: CGST/SGST/IGST auto-calc, HSN/SAC, amount in words, auto numbering, print/PDF. 10 invoices/month free.',
    keywords: ['GST invoice generator', 'फ्री जीएसटी इनवॉइस', 'invoice kaise banaye', 'tax invoice format India', 'CGST SGST IGST calculator', 'free invoice maker India']
  });

  // UID profile switcher -> prefill seller name/business
  UID.renderSwitcher(el('profileBox'));

  function currentItems() {
    var rows = el('itemsBody').querySelectorAll('tr');
    var items = [];
    rows.forEach(function (tr) {
      items.push({
        desc: tr.querySelector('.i-desc').value,
        hsn: tr.querySelector('.i-hsn').value,
        qty: parseFloat(tr.querySelector('.i-qty').value) || 0,
        rate: parseFloat(tr.querySelector('.i-rate').value) || 0,
        gstRate: parseFloat(tr.querySelector('.i-gst').value) || 0,
        discountPct: parseFloat(tr.querySelector('.i-disc').value) || 0
      });
    });
    return items;
  }

  function addRow(preset) {
    preset = preset || {};
    var tr = document.createElement('tr');
    var opts = GST_RATES.map(function (r) {
      return '<option value="' + r[0] + '"' +
        (Number(preset.gstRate) === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>';
    }).join('');
    tr.innerHTML =
      '<td><input class="i-desc" type="text" placeholder="Item description" value="' + esc(preset.desc || '') + '"></td>' +
      '<td><input class="i-hsn" type="text" placeholder="HSN/SAC" value="' + esc(preset.hsn || '') + '"></td>' +
      '<td><input class="i-qty" type="number" min="0" step="any" value="' + (preset.qty != null ? preset.qty : 1) + '"></td>' +
      '<td><input class="i-rate" type="number" min="0" step="any" value="' + (preset.rate != null ? preset.rate : '') + '" placeholder="0"></td>' +
      '<td><select class="i-gst">' + opts + '</select></td>' +
      '<td><input class="i-disc" type="number" min="0" max="100" step="any" value="' + (preset.discountPct || 0) + '"></td>' +
      '<td class="i-total">₹0.00</td>' +
      '<td><button type="button" class="vq-btn ghost i-del" aria-label="Remove item">✕</button></td>';
    el('itemsBody').appendChild(tr);
    tr.querySelectorAll('input,select').forEach(function (inp) {
      inp.addEventListener('input', recalc);
      inp.addEventListener('change', recalc);
    });
    tr.querySelector('.i-del').addEventListener('click', function () {
      tr.remove(); recalc();
    });
    recalc();
  }

  function gather() {
    return {
      date: el('invDate').value || new Date().toISOString().slice(0, 10),
      intraState: document.querySelector('input[name="supply"]:checked').value === 'intra',
      invDiscountPct: parseFloat(el('invDisc').value) || 0,
      roundOff: el('roundOff').checked,
      seller: {
        name: el('sName').value.trim(), gstin: el('sGstin').value.trim().toUpperCase(),
        addr: el('sAddr').value.trim(), phone: el('sPhone').value.trim()
      },
      buyer: {
        name: el('bName').value.trim(), gstin: el('bGstin').value.trim().toUpperCase(),
        addr: el('bAddr').value.trim(), phone: el('bPhone').value.trim()
      },
      items: currentItems()
    };
  }

  function recalc() {
    var d = gather();
    var t = calcInvoice(d.items, d.invDiscountPct, d.intraState, d.roundOff);
    var rows = el('itemsBody').querySelectorAll('tr');
    rows.forEach(function (tr, i) {
      tr.querySelector('.i-total').textContent = inr(t.lines[i] ? t.lines[i].total : 0);
    });
    var taxRow = d.intraState
      ? '<tr><td>CGST</td><td class="r">' + inr(t.cgst) + '</td></tr>' +
        '<tr><td>SGST</td><td class="r">' + inr(t.sgst) + '</td></tr>'
      : '<tr><td>IGST</td><td class="r">' + inr(t.igst) + '</td></tr>';
    el('totalsBody').innerHTML =
      '<tr><td>Taxable value</td><td class="r">' + inr(t.taxable) + '</td></tr>' +
      (t.invDiscount > 0 ? '<tr><td>Invoice discount (' + t.invDiscountPct + '%)</td><td class="r">− ' + inr(t.invDiscount) + '</td></tr>' : '') +
      taxRow +
      '<tr><td>Total GST</td><td class="r">' + inr(t.taxTotal) + '</td></tr>' +
      (t.roundOff !== 0 ? '<tr><td>Round off</td><td class="r">' + inr(t.roundOff) + '</td></tr>' : '') +
      '<tr class="grand"><td>Grand total</td><td class="r">' + inr(t.roundedTotal) + '</td></tr>' +
      '<tr><td colspan="2" class="words">In words: ' + esc(inrWords(t.roundedTotal)) + ' Rupees Only</td></tr>';
    return { data: d, totals: t };
  }

  function monthPrefix() {
    var d = new Date();
    return 'inv-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-';
  }

  async function monthCount() {
    try {
      var list = await Vault.list(SLUG);
      var pre = monthPrefix();
      return list.filter(function (e) { return e.key.indexOf(pre) === 0; }).length;
    } catch (e) { return 0; }
  }

  async function nextSeq() {
    var meta = null;
    try { meta = await Vault.load(SLUG, '_meta'); } catch (e) {}
    var seq = (meta && meta.seq) ? meta.seq + 1 : 1;
    return seq;
  }

  async function saveInvoice() {
    var err = el('inv-error'); err.textContent = '';
    el('inv-upsell').innerHTML = '';
    var r = recalc();
    var verrs = validateInvoice(r.data);
    if (verrs.length) { err.textContent = verrs[0]; return; }

    // Monthly free limit: 10 invoices/month
    var used = await monthCount();
    if (used >= MONTH_LIMIT) {
      Freemium.renderUpsell(el('inv-upsell'), SLUG, MONTH_LIMIT);
      err.textContent = 'Is mahine ke 10 free invoices istemal ho gaye hain.';
      return;
    }
    var gate = Freemium.check(SLUG, MONTH_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('inv-upsell'), SLUG, MONTH_LIMIT);
      return;
    }

    var seq = await nextSeq();
    var no = nextInvoiceNumber(seq, r.data.date);
    r.data.number = no;
    r.data.totals = r.totals;
    r.data.savedAt = new Date().toISOString();
    try {
      await Vault.save(SLUG, monthPrefix() + no, r.data);
      await Vault.save(SLUG, '_meta', { seq: seq });
      await Vault.save(SLUG, 'seller-profile', r.data.seller);
      el('inv-saved').textContent = 'Invoice ' + no + ' saved ✓ (' +
        (MONTH_LIMIT - used - 1) + ' free left this month)';
      renderSaved();
    } catch (e) { err.textContent = 'Save failed: ' + e.message; }
  }

  function renderPreview(d, t) {
    var intra = d.intraState;
    var rows = d.items.map(function (it, i) {
      var l = t.lines[i];
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.desc) +
        (it.hsn ? '<br><small>HSN/SAC: ' + esc(it.hsn) + '</small>' : '') + '</td>' +
        '<td>' + it.qty + '</td><td>' + inr(it.rate) + '</td><td>' + it.gstRate + '%</td>' +
        '<td>' + inr(l.taxable) + '</td><td>' + inr(l.taxTotal) + '</td><td>' + inr(l.total) + '</td></tr>';
    }).join('');
    el('invoicePreview').innerHTML =
      '<div class="inv-doc">' +
      '<div class="inv-head"><div><h2>' + esc(d.seller.name) + '</h2>' +
      '<p>' + esc(d.seller.addr) + (d.seller.gstin ? '<br>GSTIN: ' + esc(d.seller.gstin) : '') +
      (d.seller.phone ? '<br>Phone: ' + esc(d.seller.phone) : '') + '</p></div>' +
      '<div class="inv-meta"><h3>TAX INVOICE</h3>' +
      '<p><strong>No:</strong> ' + esc(d.number || '(unsaved draft)') + '<br>' +
      '<strong>Date:</strong> ' + esc(d.date) + '<br>' +
      '<strong>Supply:</strong> ' + (intra ? 'Intra-state (CGST+SGST)' : 'Inter-state (IGST)') + '</p></div></div>' +
      '<div class="inv-party"><strong>Bill to:</strong> ' + esc(d.buyer.name || '—') +
      (d.buyer.gstin ? ' · GSTIN: ' + esc(d.buyer.gstin) : '') +
      (d.buyer.addr ? '<br>' + esc(d.buyer.addr) : '') +
      (d.buyer.phone ? '<br>Phone: ' + esc(d.buyer.phone) : '') + '</div>' +
      '<table class="vq-table"><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th>' +
      '<th>GST%</th><th>Taxable</th><th>Tax</th><th>Amount</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<table class="inv-totals">' +
      '<tr><td>Taxable value</td><td>' + inr(t.taxable) + '</td></tr>' +
      (intra ? '<tr><td>CGST</td><td>' + inr(t.cgst) + '</td></tr><tr><td>SGST</td><td>' + inr(t.sgst) + '</td></tr>'
             : '<tr><td>IGST</td><td>' + inr(t.igst) + '</td></tr>') +
      (t.roundOff !== 0 ? '<tr><td>Round off</td><td>' + inr(t.roundOff) + '</td></tr>' : '') +
      '<tr class="grand"><td>Grand total</td><td>' + inr(t.roundedTotal) + '</td></tr></table>' +
      '<p><strong>Amount in words:</strong> ' + esc(inrWords(t.roundedTotal)) + ' Rupees Only</p>' +
      '<p class="inv-sign">For ' + esc(d.seller.name) + '<br><br><br>Authorised Signatory</p>' +
      '</div>';
  }

  async function renderSaved() {
    var list = [];
    try { list = await Vault.list(SLUG); } catch (e) {}
    var invs = list.filter(function (e) { return e.key.indexOf('inv-') === 0; })
      .sort(function (a, b) { return a.key < b.key ? 1 : -1; }).slice(0, 20);
    if (!invs.length) { el('savedList').innerHTML = '<p class="vq-hint">No saved invoices yet.</p>'; return; }
    var html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
      '<th>Invoice</th><th>Date</th><th>Buyer</th><th>Total</th><th></th></tr></thead><tbody>';
    invs.forEach(function (e) {
      html += '<tr><td>' + esc(e.key.replace(/^inv-\d{4}-\d{2}-/, '')) + '</td>' +
        '<td class="sv-date" data-key="' + esc(e.key) + '">…</td>' +
        '<td class="sv-buyer" data-key="' + esc(e.key) + '">…</td>' +
        '<td class="sv-total" data-key="' + esc(e.key) + '">…</td>' +
        '<td><button class="vq-btn ghost sv-view" data-key="' + esc(e.key) + '">View/Print</button> ' +
        '<button class="vq-btn ghost sv-del" data-key="' + esc(e.key) + '">Delete</button></td></tr>';
    });
    html += '</tbody></table></div>';
    el('savedList').innerHTML = html;
    invs.forEach(function (e) {
      Vault.load(SLUG, e.key).then(function (d) {
        if (!d) return;
        document.querySelectorAll('.sv-date[data-key="' + e.key + '"]').forEach(function (c) { c.textContent = d.date || ''; });
        document.querySelectorAll('.sv-buyer[data-key="' + e.key + '"]').forEach(function (c) { c.textContent = (d.buyer && d.buyer.name) || '—'; });
        document.querySelectorAll('.sv-total[data-key="' + e.key + '"]').forEach(function (c) { c.textContent = inr(d.totals ? d.totals.roundedTotal : 0); });
      }).catch(function () {});
    });
    el('savedList').querySelectorAll('.sv-view').forEach(function (b) {
      b.addEventListener('click', async function () {
        var d = await Vault.load(SLUG, b.getAttribute('data-key'));
        if (!d) return;
        renderPreview(d, d.totals);
        el('invoicePreview').scrollIntoView({ behavior: 'smooth' });
      });
    });
    el('savedList').querySelectorAll('.sv-del').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!window.confirm('Delete this invoice?')) return;
        await Vault.remove(SLUG, b.getAttribute('data-key'));
        renderSaved();
      });
    });
  }

  // events
  el('addItemBtn').addEventListener('click', function () { addRow(); });
  el('saveBtn').addEventListener('click', saveInvoice);
  el('printBtn').addEventListener('click', function () {
    var r = recalc();
    var verrs = validateInvoice(r.data);
    if (verrs.length) { el('inv-error').textContent = verrs[0]; return; }
    renderPreview(r.data, r.totals);
    window.print();
  });
  el('previewBtn').addEventListener('click', function () {
    var r = recalc();
    renderPreview(r.data, r.totals);
    el('invoicePreview').scrollIntoView({ behavior: 'smooth' });
  });
  el('newBtn').addEventListener('click', function () {
    el('itemsBody').innerHTML = '';
    addRow();
    el('inv-saved').textContent = '';
  });
  document.querySelectorAll('input[name="supply"]').forEach(function (r) {
    r.addEventListener('change', recalc);
  });
  ['invDisc', 'roundOff'].forEach(function (id) {
    el(id).addEventListener('change', recalc);
    el(id).addEventListener('input', recalc);
  });

  // init
  el('invDate').value = new Date().toISOString().slice(0, 10);
  addRow();
  // prefill seller from saved profile / UID
  Vault.load(SLUG, 'seller-profile').then(function (s) {
    if (s) {
      el('sName').value = s.name || ''; el('sGstin').value = s.gstin || '';
      el('sAddr').value = s.addr || ''; el('sPhone').value = s.phone || '';
    } else {
      var p = UID.active();
      if (p) { el('sName').value = p.business || p.name || ''; }
    }
  }).catch(function () {});
  window.addEventListener('vqs:profilechange', function (e) {
    var p = e.detail && e.detail.profile;
    if (p && !el('sName').value) el('sName').value = p.business || p.name || '';
  });
  renderSaved();
  recalc();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', invInit);
  } else { invInit(); }
}
