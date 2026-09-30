/* ============================================================
   VisionQuantech Business Suite — Fee Receipt Generator
   apps/fee-receipt-generator/app.js

   Pure functions first (no DOM) — tested under node.
   Generates printable fee receipts: institute header, line items,
   optional discount, optional GST (split CGST/SGST), auto receipt
   numbering, amount-in-words (Indian system), Hindi+English fields.
   Stateless: receipt data is kept only in the browser; vault saves
   (max 25) are handled in the UI layer via pure cap helpers.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure helpers ---------------- */

  var MAX_AMOUNT = 100000000;
  var MAX_SAVED = 25;
  var MAX_TEXT = 200;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function validateText(v, field, maxLen) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > (maxLen || MAX_TEXT)) return { ok: false, error: field + ' is too long (max ' + (maxLen || MAX_TEXT) + ' characters).' };
    return { ok: true, value: s };
  }
  function validateAmount(v, field) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: (field || 'Amount') + ' must be a number.' };
    if (n < 0) return { ok: false, error: (field || 'Amount') + ' cannot be negative.' };
    if (n > MAX_AMOUNT) return { ok: false, error: (field || 'Amount') + ' looks too large.' };
    return { ok: true, value: round2(n) };
  }
  function validateGstRate(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'GST rate must be a number.' };
    if (n < 0 || n > 40) return { ok: false, error: 'GST rate must be between 0 and 40%.' };
    return { ok: true, value: n };
  }

  /**
   * items: [{label, amount}]
   * opts: {discount, gstOn(bool), gstRate, receiptNo, date, institute, student, cls, paymentMode, remarks}
   */
  function buildReceipt(opts) {
    var inst = validateText(opts.institute, 'Institute name');
    if (!inst.ok) return inst;
    var stud = validateText(opts.student, 'Student name');
    if (!stud.ok) return stud;
    var items = opts.items;
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'Add at least one fee item.' };
    if (items.length > 50) return { ok: false, error: 'Too many fee items (max 50).' };
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var l = validateText(items[i].label, 'Item label ' + (i + 1));
      if (!l.ok) return l;
      var a = validateAmount(items[i].amount, 'Amount for "' + l.value + '"');
      if (!a.ok) return a;
      lines.push({ label: l.value, amount: a.value });
    }
    var d = validateAmount(opts.discount || 0, 'Discount');
    if (!d.ok) return d;
    var gstOn = !!opts.gstOn;
    var rate = { ok: true, value: 0 };
    if (gstOn) { rate = validateGstRate(opts.gstRate == null ? 18 : opts.gstRate); if (!rate.ok) return rate; }
    var subtotal = round2(lines.reduce(function (s, x) { return s + x.amount; }, 0));
    if (d.value > subtotal) return { ok: false, error: 'Discount cannot exceed the subtotal.' };
    var taxable = round2(subtotal - d.value);
    var gst = round2(taxable * rate.value / 100);
    var total = round2(taxable + gst);
    var receiptNo = validateText(opts.receiptNo || 'AUTO', 'Receipt no.');
    if (!receiptNo.ok) return receiptNo;
    return {
      ok: true,
      receipt: {
        institute: inst.value, student: stud.value,
        cls: String(opts.cls || '').trim().slice(0, MAX_TEXT),
        receiptNo: receiptNo.value, date: String(opts.date || '').slice(0, 10),
        paymentMode: String(opts.paymentMode || 'Cash').slice(0, MAX_TEXT),
        remarks: String(opts.remarks || '').slice(0, MAX_TEXT),
        lines: lines, subtotal: subtotal, discount: d.value, taxable: taxable,
        gstOn: gstOn, gstRate: rate.value, gst: gst,
        cgst: round2(gst / 2), sgst: round2(gst - round2(gst / 2)),
        total: total, words: amountInWords(total)
      }
    };
  }

  /** Next receipt number: prefix + yyyy + zero-padded sequence. */
  function nextReceiptNo(lastNo, prefix) {
    prefix = String(prefix || 'FEE').trim() || 'FEE';
    var year = new Date().getFullYear();
    var seq = 1;
    if (typeof lastNo === 'string') {
      var m = lastNo.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    if (!isFinite(seq) || seq < 1) seq = 1;
    return prefix + '-' + year + '-' + String(seq).padStart(3, '0');
  }

  /** Amount in words, Indian numbering (crore / lakh / thousand). */
  function amountInWords(n) {
    var r = Math.round(+n || 0);
    if (r === 0) return 'Zero Rupees';
    var neg = r < 0;
    r = Math.abs(r);
    var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'];
    var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function two(d) {
      if (d < 20) return ones[d];
      return tens[Math.floor(d / 10)] + (d % 10 ? ' ' + ones[d % 10] : '');
    }
    function three(d) {
      var h = Math.floor(d / 100), rest = d % 100;
      var s = h ? ones[h] + ' Hundred' : '';
      if (rest) s += (s ? ' ' : '') + two(rest);
      return s;
    }
    var parts = [];
    var crore = Math.floor(r / 10000000); r %= 10000000;
    var lakh = Math.floor(r / 100000); r %= 100000;
    var thou = Math.floor(r / 1000); r %= 1000;
    if (crore) parts.push(two(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thou) parts.push(two(thou) + ' Thousand');
    if (r) parts.push(three(r));
    return (neg ? 'Minus ' : '') + parts.join(' ') + ' Rupees';
  }

  /** Vault index cap helper: keep at most MAX_SAVED receipts. */
  function capSaved(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_SAVED);
  }

  var API = {
    MAX_SAVED: MAX_SAVED, esc: esc, fmtINR: fmtINR, round2: round2,
    validateText: validateText, validateAmount: validateAmount,
    validateGstRate: validateGstRate, buildReceipt: buildReceipt,
    nextReceiptNo: nextReceiptNo, amountInWords: amountInWords, capSaved: capSaved
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'fee-receipt-generator', FREE_LIMIT = 20;
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('f-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }

  function addItemRow(label, amount) {
    var div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML =
      '<input class="f-label" type="text" maxlength="80" placeholder="Item (e.g. Tuition fee)" value="' + esc(label || '') + '" aria-label="Item label">' +
      '<input class="f-amt" type="number" min="0" step="0.01" placeholder="Amount ₹" value="' + esc(amount || '') + '" aria-label="Item amount" inputmode="decimal">' +
      '<button type="button" class="vq-btn small f-del" aria-label="Remove item">×</button>';
    div.querySelector('.f-del').addEventListener('click', function () { div.remove(); });
    $('f-items').appendChild(div);
  }

  function collectItems() {
    var rows = $('f-items').querySelectorAll('.item-row'), items = [];
    for (var i = 0; i < rows.length; i++) {
      items.push({
        label: rows[i].querySelector('.f-label').value,
        amount: rows[i].querySelector('.f-amt').value
      });
    }
    return items;
  }

  function renderReceipt(r) {
    var card = $('f-result-card');
    card.hidden = false;
    var rows = r.lines.map(function (l) {
      return '<tr><td>' + esc(l.label) + '</td><td class="num">' + fmtINR(l.amount) + '</td></tr>';
    }).join('');
    var gstRows = r.gstOn
      ? '<tr><td>GST @ ' + esc(String(r.gstRate)) + '%</td><td class="num">' + fmtINR(r.gst) + '</td></tr>' +
        '<tr class="vq-hint"><td>&nbsp;&nbsp;CGST</td><td class="num">' + fmtINR(r.cgst) + '</td></tr>' +
        '<tr class="vq-hint"><td>&nbsp;&nbsp;SGST</td><td class="num">' + fmtINR(r.sgst) + '</td></tr>'
      : '';
    $('f-result').innerHTML =
      '<div class="receipt" id="f-print">' +
      '<h3 style="text-align:center;margin:.2rem 0">' + esc(r.institute) + '</h3>' +
      '<p style="text-align:center" class="vq-hint">FEE RECEIPT / शुल्क रसीद</p>' +
      '<table class="meta"><tr><td>Receipt No: <strong>' + esc(r.receiptNo) + '</strong></td><td>Date: <strong>' + esc(r.date) + '</strong></td></tr>' +
      '<tr><td>Student: <strong>' + esc(r.student) + '</strong></td><td>Class: <strong>' + esc(r.cls || '—') + '</strong></td></tr>' +
      '<tr><td colspan="2">Mode: <strong>' + esc(r.paymentMode) + '</strong></td></tr></table>' +
      '<table class="items"><thead><tr><th>Particulars / विवरण</th><th class="num">Amount</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<table class="totals"><tr><td>Subtotal</td><td class="num">' + fmtINR(r.subtotal) + '</td></tr>' +
      (r.discount ? '<tr><td>Discount / छूट</td><td class="num">−' + fmtINR(r.discount) + '</td></tr>' : '') +
      gstRows +
      '<tr class="grand"><td>Total / कुल</td><td class="num">' + fmtINR(r.total) + '</td></tr></table>' +
      '<p><em>' + esc(r.words) + ' Only</em></p>' +
      (r.remarks ? '<p class="vq-hint">Remarks: ' + esc(r.remarks) + '</p>' : '') +
      '<p class="sig">Authorised signatory / अधिकृत हस्ताक्षर</p></div>';
  }

  async function loadSaved() {
    try {
      var rec = await Vault.load(SLUG, 'receipts');
      return (rec && rec.data) || [];
    } catch (e) { return []; }
  }

  function init() {
    Ads.render($('ad-top'), 'fee-receipt-generator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'fee-receipt-generator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I make a fee receipt for my coaching institute?', a: 'Enter the institute and student names, add fee items (tuition, admission, materials), optionally apply a discount and GST, then generate. You can print the receipt directly from the browser.' },
      { q: 'क्या कोचिंग की फीस रसीद पर GST लगाना ज़रूरी है?', a: 'शैक्षणिक संस्थानों की कुछ सेवाओं पर GST छूट है; कोचिंग/ट्रेनिंग सेवाओं पर आमतौर पर 18% GST लागू होता है। रसीद पर CGST/SGST बराबर-बराबर बँटता है। सटीक नियम के लिए अपने CA से पुष्टि करें।' },
      { q: 'Can I number my receipts automatically?', a: 'Yes — the tool suggests the next receipt number (e.g. FEE-2026-001) based on your last saved receipt. You can edit it before generating.' },
      { q: 'Where is my receipt data stored?', a: 'Only in your browser (localStorage), up to 25 saved receipts. Nothing is sent to any server.' },
      { q: 'Is this an official tax document?', a: 'It is a fee receipt printout. For GST-compliant tax invoices, follow the GST invoicing rules and confirm with your CA.' }
    ]);
    $('f-date').value = new Date().toISOString().slice(0, 10);
    addItemRow('Tuition fee', '');
    addItemRow('Admission fee', '');

    $('f-add-item').addEventListener('click', function () { addItemRow('', ''); });

    $('f-gst-on').addEventListener('change', function () {
      $('f-gst-rate-row').hidden = !this.checked;
    });

    $('f-make').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('f-gate'), SLUG, FREE_LIMIT); $('f-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = buildReceipt({
        institute: $('f-inst').value, student: $('f-student').value, cls: $('f-class').value,
        items: collectItems(), discount: $('f-discount').value,
        gstOn: $('f-gst-on').checked, gstRate: $('f-gst-rate').value,
        receiptNo: $('f-no').value || 'AUTO', date: $('f-date').value,
        paymentMode: $('f-mode').value, remarks: $('f-remarks').value
      });
      if (!r.ok) { msg(r.error, false); $('f-result-card').hidden = true; return; }
      msg('', null);
      renderReceipt(r.receipt);
    });

    $('f-print').addEventListener('click', function () {
      if ($('f-result-card').hidden) { msg('Generate a receipt first.', false); return; }
      window.print();
    });

    $('f-save').addEventListener('click', async function () {
      if ($('f-result-card').hidden) { msg('Generate a receipt first.', false); return; }
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('f-gate'), SLUG, FREE_LIMIT); return; }
      var r = buildReceipt({
        institute: $('f-inst').value, student: $('f-student').value, cls: $('f-class').value,
        items: collectItems(), discount: $('f-discount').value,
        gstOn: $('f-gst-on').checked, gstRate: $('f-gst-rate').value,
        receiptNo: $('f-no').value || 'AUTO', date: $('f-date').value,
        paymentMode: $('f-mode').value, remarks: $('f-remarks').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      var saved = await loadSaved();
      saved.unshift(r.receipt);
      saved = capSaved(saved);
      await Vault.save(SLUG, 'receipts', saved);
      $('f-no').value = nextReceiptNo(r.receipt.receiptNo, 'FEE');
      msg('Receipt saved (' + saved.length + '/25). Next number ready.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
