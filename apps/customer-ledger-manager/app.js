/* ============================================================
   Customer Ledger Manager — pure computation layer.
   Vouchers: {id, customerId, type:'sale'|'receipt', date, amount, mode, note}
   Balance = total sales − total receipts (per customer).
   Aging uses FIFO: receipts settle the oldest open sales first.
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function daysBetween(aISO, bISO) {
  var a = new Date(String(aISO).slice(0, 10) + 'T00:00:00');
  var b = new Date(String(bISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.floor((b - a) / 86400000);
}

function validateCustomer(c) {
  if (!c || !String(c.name || '').trim()) return 'Customer name is required.';
  return '';
}

function validateVoucher(v) {
  if (!v || !v.customerId) return 'Please select a customer.';
  if (v.type !== 'sale' && v.type !== 'receipt') return 'Voucher type must be sale or receipt.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.date || ''))) return 'Date is required.';
  if (!(Number(v.amount) > 0)) return 'Amount must be greater than 0.';
  return '';
}

/** {sales, receipts, balance} for one customer. */
function customerTotals(vouchers, customerId) {
  var sales = 0, receipts = 0;
  (vouchers || []).forEach(function (v) {
    if (v.customerId !== customerId) return;
    var a = round2(Number(v.amount) || 0);
    if (v.type === 'sale') sales = round2(sales + a);
    else if (v.type === 'receipt') receipts = round2(receipts + a);
  });
  return { sales: sales, receipts: receipts, balance: round2(sales - receipts) };
}

/**
 * Open (unpaid) sales for a customer after FIFO receipt allocation.
 * Returns [{id, date, amount, open}] with open > 0, oldest first.
 */
function openSales(vouchers, customerId) {
  var sales = (vouchers || [])
    .filter(function (v) { return v.customerId === customerId && v.type === 'sale'; })
    .slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  var receiptTotal = customerTotals(vouchers, customerId).receipts;
  var out = [];
  sales.forEach(function (s) {
    var applied = Math.min(receiptTotal, round2(Number(s.amount) || 0));
    receiptTotal = round2(receiptTotal - applied);
    var open = round2(Number(s.amount) - applied);
    if (open > 0) out.push({ id: s.id, date: s.date, amount: round2(Number(s.amount)), open: open });
  });
  return out;
}

/**
 * Aging buckets of outstanding amounts as of `asOfISO`.
 * Returns {b0_30, b31_60, b61_90, b91p, total}.
 */
function aging(vouchers, customerId, asOfISO) {
  var r = { b0_30: 0, b31_60: 0, b61_90: 0, b91p: 0, total: 0 };
  openSales(vouchers, customerId).forEach(function (s) {
    var age = Math.max(0, daysBetween(s.date, asOfISO));
    if (age <= 30) r.b0_30 = round2(r.b0_30 + s.open);
    else if (age <= 60) r.b31_60 = round2(r.b31_60 + s.open);
    else if (age <= 90) r.b61_90 = round2(r.b61_90 + s.open);
    else r.b91p = round2(r.b91p + s.open);
    r.total = round2(r.total + s.open);
  });
  return r;
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
function clInit() {
  var SLUG = 'customer-ledger-manager';
  var SAVE_LIMIT = 25; // statement snapshots per day
  var customers = [];
  var vouchers = [];
  var selectedId = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Customer ledger kaise banaye? (How to make a customer ledger?)',
      a: 'Customer add karein, phir har udhar bikri par Sale voucher aur payment milne par Receipt voucher record karein. App automatic running balance aur aging (kitne din se baki) nikalta hai.' },
    { q: 'Aging 0-30 / 30-60 / 60-90 / 90+ ka matlab kya hai?',
      a: 'Ye batata hai ki baki rakam kitne din purani hai. Receipts ko FIFO se adjust kiya jata hai — pehle purani sales clear hoti hain. 90+ din wala bucket sabse risk bhara hota hai.' },
    { q: 'Khata bahi ka statement print ho sakta hai?',
      a: 'Haan — customer select karke Print / PDF dabayein. Statement me saari vouchers date-wise running balance ke saath aate hain.' },
    { q: 'ग्राहक खाता बही क्या होती है?',
      a: 'Graahak khata bahi me har customer ke saath hue len-den ka hisaab rehta hai — kitni udhar bikri hui, kitna paisa vasool hua, aur kitna baki hai.' }
  ]);
  SEO.softwareApp({
    name: 'Customer Ledger Manager — ग्राहक खाता बही',
    description: 'Free customer ledger for Indian SMEs: customers, sale & receipt vouchers, running balance, outstanding aging, printable statements.',
    keywords: ['customer ledger', 'ग्राहक खाता बही', 'ledger kaise banaye', 'khata bahi app', 'customer outstanding aging', 'statement of account']
  });

  /* ---- vault passphrase ---- */
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
    return Vault.save(SLUG, 'ledger', { customers: customers, vouchers: vouchers })
      .catch(function () {});
  }

  function custName(id) {
    var c = customers.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '(deleted)';
  }

  function refreshCustSelects() {
    var opts = customers.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
    el('v-cust').innerHTML = opts || '<option value="">— Add a customer first —</option>';
    el('sel-cust').innerHTML = opts || '<option value="">—</option>';
    if (selectedId && customers.some(function (c) { return c.id === selectedId; })) {
      el('sel-cust').value = selectedId;
    } else {
      selectedId = customers.length ? customers[0].id : null;
      if (selectedId) el('sel-cust').value = selectedId;
    }
  }

  function addCustomer() {
    var err = el('c-error'); err.textContent = '';
    var c = { id: uid('c'), name: el('c-name').value.trim(),
              phone: el('c-phone').value.trim(), note: el('c-note').value.trim() };
    var verr = validateCustomer(c);
    if (verr) { err.textContent = verr; return; }
    customers.push(c);
    el('c-name').value = ''; el('c-phone').value = ''; el('c-note').value = '';
    selectedId = c.id;
    persist().then(renderAll);
  }

  function addVoucher() {
    var err = el('v-error'); err.textContent = '';
    var v = {
      id: uid('v'),
      customerId: el('v-cust').value,
      type: document.querySelector('input[name="vtype"]:checked').value,
      date: el('v-date').value,
      amount: parseFloat(el('v-amount').value) || 0,
      mode: el('v-mode').value,
      note: el('v-note').value.trim()
    };
    var verr = validateVoucher(v);
    if (verr) { err.textContent = verr; return; }
    vouchers.push(v);
    el('v-amount').value = ''; el('v-note').value = '';
    selectedId = v.customerId;
    persist().then(renderAll);
  }

  function balancePill(b) {
    var cls = b > 0 ? 'p-out' : (b < 0 ? 'p-in' : 'p-zero');
    var lbl = b > 0 ? ' receivable' : (b < 0 ? ' advance' : '');
    return '<span class="pill ' + cls + '">' + inr(b) + lbl + '</span>';
  }

  function renderStatement() {
    var c = customers.filter(function (x) { return x.id === selectedId; })[0];
    if (!c) {
      el('stmtName').textContent = '—';
      el('stmtMeta').textContent = '';
      el('vouchersBody').innerHTML = '<tr><td colspan="7" class="vq-hint">Koi customer nahi hai — pehle customer add karein.</td></tr>';
      el('agingBody').innerHTML = '';
      return;
    }
    el('stmtName').textContent = c.name + (c.phone ? ' (' + c.phone + ')' : '');
    var prof = null;
    try { prof = UID.active(); } catch (e) {}
    el('stmtMeta').textContent = (prof && prof.business ? prof.business + ' · ' : '') +
      'Statement as of ' + today() + ' · Balance = sales − receipts';

    var rows = vouchers
      .filter(function (v) { return v.customerId === selectedId; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var run = 0, html = '';
    rows.forEach(function (v) {
      var a = round2(Number(v.amount) || 0);
      if (v.type === 'sale') run = round2(run + a); else run = round2(run - a);
      html += '<tr><td>' + esc(v.date) + '</td>' +
        '<td><span class="pill ' + (v.type === 'sale' ? 'p-out' : 'p-in') + '">' +
        (v.type === 'sale' ? 'Sale' : 'Receipt') + '</span></td>' +
        '<td>' + esc(v.mode || '—') + '</td><td>' + esc(v.note || '—') + '</td>' +
        '<td class="r">' + (v.type === 'sale' ? inr(a) : '—') + '</td>' +
        '<td class="r">' + (v.type === 'receipt' ? inr(a) : '—') + '</td>' +
        '<td class="r"><strong>' + inr(run) + '</strong></td></tr>';
    });
    if (!rows.length) html = '<tr><td colspan="7" class="vq-hint">No vouchers for this customer yet.</td></tr>';
    el('vouchersBody').innerHTML = html;

    var ag = aging(vouchers, selectedId, el('agingAsOf').value || today());
    function cell(lbl, amt, warn) {
      return '<div class="aging-cell"><div class="lbl">' + lbl + '</div>' +
        '<div class="amt" style="' + (warn && amt > 0 ? 'color:#b42318' : '') + '">' + inr(amt) + '</div></div>';
    }
    el('agingBody').innerHTML =
      cell('0–30 days', ag.b0_30) + cell('31–60 days', ag.b31_60) +
      cell('61–90 days', ag.b61_90) + cell('90+ days', ag.b91p, true);
  }

  function renderSummary() {
    var asOf = el('agingAsOf').value || today();
    if (!customers.length) {
      el('custListBody').innerHTML = '<tr><td colspan="5" class="vq-hint">No customers yet.</td></tr>';
      return;
    }
    el('custListBody').innerHTML = customers.map(function (c) {
      var t = customerTotals(vouchers, c.id);
      var ag = aging(vouchers, c.id, asOf);
      return '<tr><td>' + esc(c.name) + '</td><td class="r">' + inr(t.sales) + '</td>' +
        '<td class="r">' + inr(t.receipts) + '</td><td class="r">' + balancePill(t.balance) + '</td>' +
        '<td class="r"' + (ag.b91p > 0 ? ' style="color:#b42318;font-weight:700"' : '') + '>' +
        inr(ag.b91p) + '</td></tr>';
    }).join('');
  }

  function renderAll() { refreshCustSelects(); renderStatement(); renderSummary(); }

  async function saveSnapshot() {
    var err = el('c-error'); err.textContent = '';
    el('cl-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cl-upsell'), SLUG, SAVE_LIMIT); return; }
    if (!selectedId) { err.textContent = 'Select a customer first.'; return; }
    var key = 'stmt-' + selectedId + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        customerId: selectedId, customerName: custName(selectedId),
        totals: customerTotals(vouchers, selectedId),
        aging: aging(vouchers, selectedId, el('agingAsOf').value || today()),
        savedAt: new Date().toISOString()
      });
      el('stmt-saved').textContent = 'Statement snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { err.textContent = 'Save failed: ' + e.message; }
  }

  /* ---- events ---- */
  el('addCustomerBtn').addEventListener('click', addCustomer);
  el('addVoucherBtn').addEventListener('click', addVoucher);
  el('sel-cust').addEventListener('change', function () { selectedId = el('sel-cust').value; renderAll(); });
  el('agingAsOf').addEventListener('change', renderAll);
  el('saveStmtBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  /* ---- init ---- */
  el('v-date').value = today();
  el('agingAsOf').value = today();
  Vault.load(SLUG, 'ledger').then(function (d) {
    if (d && Array.isArray(d.customers)) customers = d.customers;
    if (d && Array.isArray(d.vouchers)) vouchers = d.vouchers;
    if (customers.length) selectedId = customers[0].id;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clInit);
  } else { clInit(); }
}
