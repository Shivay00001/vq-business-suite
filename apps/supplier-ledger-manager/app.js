/* ============================================================
   Supplier Ledger Manager — pure computation layer.
   Vouchers: {id, supplierId, type:'purchase'|'payment', date, amount, dueDate, mode, note}
   Balance = total purchases − total payments (payable to supplier).
   FIFO: payments settle oldest open purchases first.
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

function validateSupplier(s) {
  if (!s || !String(s.name || '').trim()) return 'Supplier name is required.';
  return '';
}

function validateVoucher(v) {
  if (!v || !v.supplierId) return 'Please select a supplier.';
  if (v.type !== 'purchase' && v.type !== 'payment') return 'Voucher type must be purchase or payment.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.date || ''))) return 'Date is required.';
  if (!(Number(v.amount) > 0)) return 'Amount must be greater than 0.';
  if (v.type === 'purchase' && v.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(v.dueDate))) {
    return 'Due date format is invalid.';
  }
  return '';
}

/** {purchases, payments, balance} for one supplier. */
function supplierTotals(vouchers, supplierId) {
  var purchases = 0, payments = 0;
  (vouchers || []).forEach(function (v) {
    if (v.supplierId !== supplierId) return;
    var a = round2(Number(v.amount) || 0);
    if (v.type === 'purchase') purchases = round2(purchases + a);
    else if (v.type === 'payment') payments = round2(payments + a);
  });
  return { purchases: purchases, payments: payments, balance: round2(purchases - payments) };
}

/**
 * Open (unpaid) purchases after FIFO payment allocation.
 * Returns [{id, date, dueDate, amount, open}] with open > 0, oldest first.
 */
function openPurchases(vouchers, supplierId) {
  var buys = (vouchers || [])
    .filter(function (v) { return v.supplierId === supplierId && v.type === 'purchase'; })
    .slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  var paidTotal = supplierTotals(vouchers, supplierId).payments;
  var out = [];
  buys.forEach(function (p) {
    var applied = Math.min(paidTotal, round2(Number(p.amount) || 0));
    paidTotal = round2(paidTotal - applied);
    var open = round2(Number(p.amount) - applied);
    if (open > 0) out.push({ id: p.id, date: p.date, dueDate: p.dueDate || '',
      amount: round2(Number(p.amount)), open: open });
  });
  return out;
}

function aging(vouchers, supplierId, asOfISO) {
  var r = { b0_30: 0, b31_60: 0, b61_90: 0, b91p: 0, total: 0 };
  openPurchases(vouchers, supplierId).forEach(function (p) {
    var age = Math.max(0, daysBetween(p.date, asOfISO));
    if (age <= 30) r.b0_30 = round2(r.b0_30 + p.open);
    else if (age <= 60) r.b31_60 = round2(r.b31_60 + p.open);
    else if (age <= 90) r.b61_90 = round2(r.b61_90 + p.open);
    else r.b91p = round2(r.b91p + p.open);
    r.total = round2(r.total + p.open);
  });
  return r;
}

/**
 * Due-date reminders across all suppliers.
 * open purchases with a dueDate, sorted: overdue first (most days first),
 * then upcoming (soonest first). Returns [{supplierId, id, date, dueDate, open, daysLeft}]
 * where daysLeft = asOf − dueDate... negative = days remaining.
 */
function dueReminders(vouchers, supplierIdOf, asOfISO) {
  var list = [];
  (vouchers || []).forEach(function (v) {
    if (v.type !== 'purchase') return;
    var opens = openPurchases(vouchers, v.supplierId);
    var o = opens.filter(function (x) { return x.id === v.id; })[0];
    if (o && o.dueDate) {
      list.push({ supplierId: v.supplierId, id: v.id, date: v.date,
        dueDate: o.dueDate, open: o.open, daysOverdue: daysBetween(o.dueDate, asOfISO) });
    }
  });
  list.sort(function (a, b) { return b.daysOverdue - a.daysOverdue; });
  return list;
}

/** Total overdue amount (dueDate < asOf) for one supplier. */
function overdueTotal(vouchers, supplierId, asOfISO) {
  return round2(dueReminders(vouchers, null, asOfISO)
    .filter(function (r) { return r.supplierId === supplierId && r.daysOverdue > 0; })
    .reduce(function (s, r) { return s + r.open; }, 0));
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
function slInit() {
  var SLUG = 'supplier-ledger-manager';
  var SAVE_LIMIT = 25; // statement snapshots per day
  var suppliers = [];
  var vouchers = [];
  var selectedId = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Supplier ledger kaise banaye?',
      a: 'Supplier add karein, har kharid par Purchase voucher (due date ke saath) aur payment par Payment voucher record karein. App payable balance, aging aur due-date reminders automatic banata hai.' },
    { q: 'Due-date reminders kaise kaam karte hain?',
      a: 'Har purchase par due date darj karein. Payments FIFO se purani purchases me adjust hote hain. Reminders list me overdue purchases sabse upar aati hain.' },
    { q: 'Customer ledger se kya farak hai?',
      a: 'Customer ledger me aapko paisa milna hai (receivable), supplier ledger me aapko paisa dena hai (payable). Dono ka hisaab alag rakhna zaroori hai.' },
    { q: 'सप्लायर खाता बही क्या होती है?',
      a: 'Supplier khata bahi me aapke suppliers ko dene wale paiso ka hisaab rehta hai — kitni kharid hui, kitna pay kiya, kitna baki hai, aur kab tak dena hai.' }
  ]);
  SEO.softwareApp({
    name: 'Supplier Ledger Manager — सप्लायर खाता बही',
    description: 'Free supplier ledger for Indian SMEs: purchase & payment vouchers with due dates, payable balance, aging, due-date reminders, printable statements.',
    keywords: ['supplier ledger', 'सप्लायर खाता बही', 'purchase ledger', 'accounts payable tracker', 'due date reminder', 'supplier payment reminder']
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
    return Vault.save(SLUG, 'ledger', { suppliers: suppliers, vouchers: vouchers })
      .catch(function () {});
  }

  function suppName(id) {
    var s = suppliers.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : '(deleted)';
  }

  function refreshSuppSelects() {
    var opts = suppliers.map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
    }).join('');
    el('v-supp').innerHTML = opts || '<option value="">— Add a supplier first —</option>';
    el('sel-supp').innerHTML = opts || '<option value="">—</option>';
    if (selectedId && suppliers.some(function (s) { return s.id === selectedId; })) {
      el('sel-supp').value = selectedId;
    } else {
      selectedId = suppliers.length ? suppliers[0].id : null;
      if (selectedId) el('sel-supp').value = selectedId;
    }
  }

  function addSupplier() {
    var err = el('s-error'); err.textContent = '';
    var s = { id: uid('s'), name: el('s-name').value.trim(), phone: el('s-phone').value.trim() };
    var verr = validateSupplier(s);
    if (verr) { err.textContent = verr; return; }
    suppliers.push(s);
    el('s-name').value = ''; el('s-phone').value = '';
    selectedId = s.id;
    persist().then(renderAll);
  }

  function addVoucher() {
    var err = el('v-error'); err.textContent = '';
    var v = {
      id: uid('v'),
      supplierId: el('v-supp').value,
      type: document.querySelector('input[name="vtype"]:checked').value,
      date: el('v-date').value,
      amount: parseFloat(el('v-amount').value) || 0,
      dueDate: el('v-duedate').value,
      mode: el('v-mode').value,
      note: el('v-note').value.trim()
    };
    var verr = validateVoucher(v);
    if (verr) { err.textContent = verr; return; }
    vouchers.push(v);
    el('v-amount').value = ''; el('v-duedate').value = ''; el('v-note').value = '';
    selectedId = v.supplierId;
    persist().then(renderAll);
  }

  function balancePill(b) {
    var cls = b > 0 ? 'p-out' : (b < 0 ? 'p-in' : 'p-zero');
    var lbl = b > 0 ? ' payable' : (b < 0 ? ' advance paid' : '');
    return '<span class="pill ' + cls + '">' + inr(b) + lbl + '</span>';
  }

  function renderReminders() {
    var asOf = el('agingAsOf').value || today();
    var rows = dueReminders(vouchers, null, asOf);
    if (!rows.length) {
      el('remindersBody').innerHTML = '<tr><td colspan="5" class="vq-hint">No pending dues with due dates. Purchases par due date darj karein.</td></tr>';
      return;
    }
    el('remindersBody').innerHTML = rows.map(function (r) {
      var status, cls = '';
      if (r.daysOverdue > 0) {
        status = '<span class="pill p-out">' + r.daysOverdue + ' days overdue</span>';
        cls = ' class="overdue"';
      } else if (r.daysOverdue === 0) {
        status = '<span class="pill p-warn">Due today</span>';
      } else {
        status = '<span class="pill p-in">' + (-r.daysOverdue) + ' days left</span>';
      }
      return '<tr' + cls + '><td>' + esc(suppName(r.supplierId)) + '</td>' +
        '<td>' + esc(r.date) + '</td><td>' + esc(r.dueDate) + '</td>' +
        '<td class="r">' + inr(r.open) + '</td><td>' + status + '</td></tr>';
    }).join('');
  }

  function renderStatement() {
    var s = suppliers.filter(function (x) { return x.id === selectedId; })[0];
    if (!s) {
      el('stmtName').textContent = '—';
      el('stmtMeta').textContent = '';
      el('vouchersBody').innerHTML = '<tr><td colspan="8" class="vq-hint">Koi supplier nahi hai — pehle supplier add karein.</td></tr>';
      el('agingBody').innerHTML = '';
      return;
    }
    el('stmtName').textContent = s.name + (s.phone ? ' (' + s.phone + ')' : '');
    var prof = null;
    try { prof = UID.active(); } catch (e) {}
    el('stmtMeta').textContent = (prof && prof.business ? prof.business + ' · ' : '') +
      'Statement as of ' + today() + ' · Balance = purchases − payments';

    var rows = vouchers
      .filter(function (v) { return v.supplierId === selectedId; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var run = 0, html = '';
    rows.forEach(function (v) {
      var a = round2(Number(v.amount) || 0);
      if (v.type === 'purchase') run = round2(run + a); else run = round2(run - a);
      html += '<tr><td>' + esc(v.date) + '</td>' +
        '<td><span class="pill ' + (v.type === 'purchase' ? 'p-out' : 'p-in') + '">' +
        (v.type === 'purchase' ? 'Purchase' : 'Payment') + '</span></td>' +
        '<td>' + esc(v.mode || '—') + '</td>' +
        '<td>' + esc(v.dueDate || '—') + '</td><td>' + esc(v.note || '—') + '</td>' +
        '<td class="r">' + (v.type === 'purchase' ? inr(a) : '—') + '</td>' +
        '<td class="r">' + (v.type === 'payment' ? inr(a) : '—') + '</td>' +
        '<td class="r"><strong>' + inr(run) + '</strong></td></tr>';
    });
    if (!rows.length) html = '<tr><td colspan="8" class="vq-hint">No vouchers for this supplier yet.</td></tr>';
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
    if (!suppliers.length) {
      el('suppListBody').innerHTML = '<tr><td colspan="5" class="vq-hint">No suppliers yet.</td></tr>';
      return;
    }
    el('suppListBody').innerHTML = suppliers.map(function (s) {
      var t = supplierTotals(vouchers, s.id);
      var od = overdueTotal(vouchers, s.id, asOf);
      return '<tr><td>' + esc(s.name) + '</td><td class="r">' + inr(t.purchases) + '</td>' +
        '<td class="r">' + inr(t.payments) + '</td><td class="r">' + balancePill(t.balance) + '</td>' +
        '<td class="r"' + (od > 0 ? ' style="color:#b42318;font-weight:700"' : '') + '>' +
        inr(od) + '</td></tr>';
    }).join('');
  }

  function renderAll() { refreshSuppSelects(); renderStatement(); renderSummary(); renderReminders(); }

  async function saveSnapshot() {
    var err = el('s-error'); err.textContent = '';
    el('sl-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('sl-upsell'), SLUG, SAVE_LIMIT); return; }
    if (!selectedId) { err.textContent = 'Select a supplier first.'; return; }
    var key = 'stmt-' + selectedId + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        supplierId: selectedId, supplierName: suppName(selectedId),
        totals: supplierTotals(vouchers, selectedId),
        aging: aging(vouchers, selectedId, el('agingAsOf').value || today()),
        savedAt: new Date().toISOString()
      });
      el('stmt-saved').textContent = 'Statement snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { err.textContent = 'Save failed: ' + e.message; }
  }

  el('addSupplierBtn').addEventListener('click', addSupplier);
  el('addVoucherBtn').addEventListener('click', addVoucher);
  el('sel-supp').addEventListener('change', function () { selectedId = el('sel-supp').value; renderAll(); });
  el('agingAsOf').addEventListener('change', renderAll);
  el('saveStmtBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('v-date').value = today();
  el('agingAsOf').value = today();
  Vault.load(SLUG, 'ledger').then(function (d) {
    if (d && Array.isArray(d.suppliers)) suppliers = d.suppliers;
    if (d && Array.isArray(d.vouchers)) vouchers = d.vouchers;
    if (suppliers.length) selectedId = suppliers[0].id;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', slInit);
  } else { slInit(); }
}
