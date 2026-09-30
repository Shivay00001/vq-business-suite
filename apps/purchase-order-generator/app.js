/* ============================================================
   VisionQuantech Business Suite — Purchase Order Generator
   apps/purchase-order-generator/app.js

   Pure functions first (no DOM) — tested under node.
   Generates a GST-compliant purchase order: line items, GST
   breakup (intra-state CGST+SGST / inter-state IGST), totals,
   printable output, and FY-based PO numbering (Apr–Mar).
   GST is taken as entered per line — verify the slab on the
   invoice against your CA's current rate chart.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_QTY = 1000000;
  var MAX_RATE = 100000000;
  var GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }

  function validateItem(it) {
    if (!it || typeof it !== 'object') return { ok: false, error: 'Line item must be an object.' };
    var desc = String(it.desc || '').trim();
    if (!desc) return { ok: false, error: 'Item description is required.' };
    if (desc.length > 200) return { ok: false, error: 'Item description is too long (max 200 chars).' };
    var qty = Number(it.qty);
    if (!isFinite(qty) || qty <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
    if (qty > MAX_QTY) return { ok: false, error: 'Quantity looks too large (max ' + MAX_QTY + ').' };
    var rate = Number(it.rate);
    if (!isFinite(rate) || rate < 0) return { ok: false, error: 'Rate cannot be negative.' };
    if (rate > MAX_RATE) return { ok: false, error: 'Rate looks too large.' };
    var gst = Number(it.gst);
    if (GST_RATES.indexOf(gst) === -1) return { ok: false, error: 'GST% must be one of: ' + GST_RATES.join(', ') + '.' };
    return { ok: true, value: { desc: desc, hsn: String(it.hsn || '').trim().slice(0, 12), qty: qty, rate: rate, gst: gst } };
  }

  function validatePO(po) {
    if (!po || typeof po !== 'object') return { ok: false, error: 'PO data is required.' };
    if (!String(po.vendor || '').trim()) return { ok: false, error: 'Vendor name is required.' };
    if (!isDateStr(po.date)) return { ok: false, error: 'PO date must be YYYY-MM-DD.' };
    if (po.deliveryDate && !isDateStr(po.deliveryDate)) return { ok: false, error: 'Delivery date must be YYYY-MM-DD.' };
    if (!Array.isArray(po.items) || po.items.length === 0) return { ok: false, error: 'Add at least one line item.' };
    if (po.items.length > 50) return { ok: false, error: 'Too many line items (max 50).' };
    for (var i = 0; i < po.items.length; i++) {
      var v = validateItem(po.items[i]);
      if (!v.ok) return { ok: false, error: 'Line ' + (i + 1) + ': ' + v.error };
    }
    return { ok: true };
  }

  /** GST split for a taxable amount. intra=true -> CGST+SGST, else IGST. */
  function gstFor(taxable, rate, intra) {
    var t = Math.max(0, Number(taxable) || 0);
    var r = Number(rate) || 0;
    var tax = Math.round(t * r) / 100;
    if (intra) {
      return { cgst: Math.round(tax * 50) / 100, sgst: Math.round(tax * 50) / 100, igst: 0, total: tax };
    }
    return { cgst: 0, sgst: 0, igst: tax, total: tax };
  }

  function poTotals(items, intra) {
    var lines = [], sub = 0, cgst = 0, sgst = 0, igst = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var taxable = Math.round(it.qty * it.rate * 100) / 100;
      var g = gstFor(taxable, it.gst, intra);
      lines.push({ desc: it.desc, hsn: it.hsn, qty: it.qty, rate: it.rate, gst: it.gst,
        taxable: taxable, cgst: g.cgst, sgst: g.sgst, igst: g.igst, lineTotal: Math.round((taxable + g.total) * 100) / 100 });
      sub += taxable; cgst += g.cgst; sgst += g.sgst; igst += g.igst;
    }
    var round2 = function (n) { return Math.round(n * 100) / 100; };
    var grand = round2(sub + cgst + sgst + igst);
    return { ok: true, lines: lines, subtotal: round2(sub), cgst: round2(cgst), sgst: round2(sgst),
      igst: round2(igst), taxTotal: round2(cgst + sgst + igst), grand: grand };
  }

  /** Financial year for a YYYY-MM-DD date: Apr 2026–Mar 2027 => "26-27". */
  function fyOf(dateStr) {
    var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateStr || '');
    if (!m) return 'NA';
    var y = Number(m[1]), mo = Number(m[2]);
    var start = mo >= 4 ? y : y - 1;
    var s2 = String(start).slice(2), e2 = String(start + 1).slice(2);
    return s2 + '-' + e2;
  }

  function poNumber(prefix, seq, dateStr) {
    var n = Math.floor(Number(seq));
    if (!isFinite(n) || n < 1) n = 1;
    var p = String(prefix || 'VQ').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'VQ';
    return p + '/' + fyOf(dateStr) + '/' + String(n).padStart(4, '0');
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
    MAX_QTY: MAX_QTY, GST_RATES: GST_RATES,
    isDateStr: isDateStr, validateItem: validateItem, validatePO: validatePO,
    gstFor: gstFor, poTotals: poTotals, fyOf: fyOf, poNumber: poNumber,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'purchase-order-generator';
  var FREE_LIMIT = 20;
  var MAX_SAVED = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('p-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function gstOptions(sel) {
    return GST_RATES.map(function (r) {
      return '<option value="' + r + '"' + (r === sel ? ' selected' : '') + '>' + r + '%</option>';
    }).join('');
  }

  function addItemRow(it) {
    it = it || {};
    var tbody = $('p-items');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="vq-input p-desc" placeholder="Item description" value="' + esc(it.desc || '') + '"></td>' +
      '<td><input class="vq-input p-hsn" placeholder="HSN" maxlength="12" value="' + esc(it.hsn || '') + '"></td>' +
      '<td><input class="vq-input p-qty" type="number" min="0" step="0.01" value="' + esc(it.qty == null ? '' : it.qty) + '"></td>' +
      '<td><input class="vq-input p-rate" type="number" min="0" step="0.01" value="' + esc(it.rate == null ? '' : it.rate) + '"></td>' +
      '<td><select class="vq-input p-gst">' + gstOptions(Number(it.gst) || 18) + '</select></td>' +
      '<td><button type="button" class="vq-btn vq-btn-ghost p-del" title="Remove line">&times;</button></td>';
    tr.querySelector('.p-del').addEventListener('click', function () {
      if (tbody.rows.length > 1) tbody.removeChild(tr);
    });
    tbody.appendChild(tr);
  }

  function readItems() {
    var items = [];
    var rows = $('p-items').rows;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var desc = r.querySelector('.p-desc').value.trim();
      if (!desc && !r.querySelector('.p-qty').value && !r.querySelector('.p-rate').value) continue; // skip blank row
      items.push({
        desc: desc, hsn: r.querySelector('.p-hsn').value,
        qty: r.querySelector('.p-qty').value, rate: r.querySelector('.p-rate').value,
        gst: r.querySelector('.p-gst').value
      });
    }
    return items;
  }

  function renderPO(po, totals, number) {
    var intra = $('p-intra').checked;
    var buyer = $('p-buyer').value.trim();
    var rows = totals.lines.map(function (l, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.desc) + (l.hsn ? '<br><span class="vq-hint">HSN: ' + esc(l.hsn) + '</span>' : '') + '</td>' +
        '<td class="num">' + esc(l.qty) + '</td><td class="num">' + fmtINR(l.rate) + '</td>' +
        '<td class="num">' + fmtINR(l.taxable) + '</td><td class="num">' + esc(l.gst) + '%</td>' +
        '<td class="num">' + fmtINR(l.cgst + l.sgst + l.igst) + '</td><td class="num">' + fmtINR(l.lineTotal) + '</td></tr>';
    }).join('');
    var taxLabel = intra ? 'CGST+SGST' : 'IGST';
    $('p-result').innerHTML =
      '<div class="po-doc">' +
      '<div class="po-head"><div><h3 style="margin:0">PURCHASE ORDER</h3><p class="vq-hint">' + esc(number) + ' · Dated ' + esc(po.date) + '</p></div>' +
      '<div class="vq-hint" style="text-align:right">' + (buyer ? esc(buyer) : 'Your business') + '</div></div>' +
      '<p><strong>To:</strong> ' + esc(po.vendor) +
      ($('p-gstin').value.trim() ? ' <span class="vq-hint">GSTIN: ' + esc($('p-gstin').value.trim()) + '</span>' : '') + '</p>' +
      (po.deliveryDate ? '<p class="vq-hint">Delivery by: ' + esc(po.deliveryDate) + '</p>' : '') +
      '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">Tax</th><th class="num">Total</th></tr></thead><tbody>' +
      rows + '</tbody><tfoot>' +
      '<tr><td colspan="7"><strong>Subtotal</strong></td><td class="num"><strong>' + fmtINR(totals.subtotal) + '</strong></td></tr>' +
      (intra
        ? '<tr><td colspan="7">CGST</td><td class="num">' + fmtINR(totals.cgst) + '</td></tr><tr><td colspan="7">SGST</td><td class="num">' + fmtINR(totals.sgst) + '</td></tr>'
        : '<tr><td colspan="7">IGST</td><td class="num">' + fmtINR(totals.igst) + '</td></tr>') +
      '<tr><td colspan="7">Tax total (' + taxLabel + ')</td><td class="num">' + fmtINR(totals.taxTotal) + '</td></tr>' +
      '<tr><td colspan="7"><strong>Grand total</strong></td><td class="num"><span class="big">' + fmtINR(totals.grand) + '</span></td></tr>' +
      '</tfoot></table></div>' +
      ($('p-terms').value.trim() ? '<h4>Terms &amp; conditions</h4><p style="white-space:pre-wrap">' + esc($('p-terms').value.trim()) + '</p>' : '') +
      '<p class="vq-hint">GST breakup: ' + taxLabel + '. ' + ($('p-intra').checked ? 'Intra-state supply.' : 'Inter-state supply.') + ' Verify slab rates on the invoice with your CA.</p>' +
      '<div class="po-actions"><button id="p-print" class="vq-btn" type="button">Print / PDF</button> ' +
      '<button id="p-save" class="vq-btn vq-btn-ghost" type="button">Save PO</button> ' +
      '<span id="p-save-msg" class="vq-hint"></span></div></div>';
    $('p-result-card').hidden = false;
    $('p-print').addEventListener('click', function () { window.print(); });
    $('p-save').addEventListener('click', function () {
      savePO(number, po, totals).then(function (ok) {
        $('p-save-msg').textContent = ok ? 'Saved on this device.' : 'Save failed.';
      });
    });
    $('p-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function savePO(number, po, totals) {
    try {
      var list = await Vault.list(SLUG);
      var pos = list.filter(function (k) { return k.indexOf('po:') === 0; });
      if (pos.length >= MAX_SAVED) {
        // drop oldest by suffix order (keys store FY+seq; sort lexicographically)
        pos.sort();
        await Vault.remove(SLUG, pos[0]);
      }
      await Vault.save(SLUG, 'po:' + number.replace(/\//g, '-'), { number: number, po: po, totals: totals, savedAt: new Date().toISOString() });
      renderSaved();
      return true;
    } catch (e) { return false; }
  }

  async function renderSaved() {
    try {
      var list = await Vault.list(SLUG);
      var pos = list.filter(function (k) { return k.indexOf('po:') === 0; }).sort().reverse();
      var html = pos.length ? '<ul class="vq-list">' + pos.slice(0, 10).map(function (k) {
        var label = k.slice(3).replace(/-/g, '/');
        return '<li><button class="vq-link p-load" data-k="' + esc(k) + '">' + esc(label) + '</button></li>';
      }).join('') + '</ul><p class="vq-hint">Max ' + MAX_SAVED + ' saved POs — oldest is dropped.</p>'
        : '<p class="vq-hint">No saved POs yet.</p>';
      $('p-saved').innerHTML = html;
      Array.prototype.forEach.call($('p-saved').querySelectorAll('.p-load'), function (b) {
        b.addEventListener('click', async function () {
          var rec = await Vault.load(SLUG, b.getAttribute('data-k'));
          if (rec) { renderPO(rec.po, rec.totals, rec.number); }
        });
      });
    } catch (e) { /* vault unavailable */ }
  }

  async function nextSeq() {
    try {
      var list = await Vault.list(SLUG);
      var nums = list.filter(function (k) { return k.indexOf('po:') === 0; }).map(function (k) {
        var m = /(\d{4})$/.exec(k);
        return m ? Number(m[1]) : 0;
      });
      return (nums.length ? Math.max.apply(null, nums) : 0) + 1;
    } catch (e) { return 1; }
  }

  function init() {
    Ads.render($('ad-top'), 'purchase-order-generator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'purchase-order-generator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I generate a GST purchase order?', a: 'Enter your vendor, add line items with quantity, rate and GST%, choose intra-state (CGST+SGST) or inter-state (IGST), and the tool totals everything into a printable PO with terms.' },
      { q: 'परचेज़ ऑर्डर कैसे बनाएं?', a: 'विक्रेता का नाम लिखें, हर आइटम की मात्रा, रेट और GST% डालें, इंट्रा-स्टेट (CGST+SGST) या इंटर-स्टेट (IGST) चुनें — प्रिंट करने योग्य PO तैयार हो जाएगा।' },
      { q: 'How does PO numbering work here?', a: 'Numbers follow your business prefix + financial year + sequence, e.g. VQ/26-27/0001. The sequence increments from your saved POs on this device.' },
      { q: 'PO नंबरिंग कैसे होती है?', a: 'नंबर आपके बिज़नेस प्रीफ़िक्स + वित्तीय वर्ष + क्रम संख्या के रूप में बनता है, जैसे VQ/26-27/0001।' },
      { q: 'When do I use IGST instead of CGST+SGST?', a: 'Use CGST+SGST for intra-state supplies (vendor in your state) and IGST for inter-state supplies (vendor in another state). Confirm the place-of-supply with your CA for services.' },
      { q: 'Is my PO data stored online?', a: 'No. Up to 25 POs are saved in your browser vault on this device only. Nothing is sent anywhere.' }
    ]);

    var today = new Date().toISOString().slice(0, 10);
    $('p-date').value = today;
    addItemRow();
    renderSaved();

    $('p-add').addEventListener('click', function () { addItemRow(); });

    $('p-gen').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); $('p-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var po = {
        buyer: $('p-buyer').value, vendor: $('p-vendor').value, gstin: $('p-gstin').value,
        date: $('p-date').value, deliveryDate: $('p-delivery').value, terms: $('p-terms').value,
        intra: $('p-intra').checked, items: readItems()
      };
      var v = validatePO(po);
      if (!v.ok) { msg(v.error, false); $('p-result-card').hidden = true; return; }
      msg('', null);
      var totals = poTotals(po.items.map(function (it) { return validateItem(it).value; }), po.intra);
      var seq = await nextSeq();
      var number = poNumber('VQ', seq, po.date);
      renderPO(po, totals, number);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
