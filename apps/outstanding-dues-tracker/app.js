/* ============================================================
   Outstanding Dues Tracker — pure computation layer.
   invoices: {id, customer, invoiceNo, date, dueDate, amount, received, phone}
   outstanding = amount − received
   daysOverdue = floor((today − dueDate) / day)
   priority score = daysOverdue × outstanding (higher = collect first)
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

function validateInvoice(inv) {
  if (!inv || !String(inv.customer || '').trim()) return 'Customer name is required.';
  if (!String(inv.invoiceNo || '').trim()) return 'Invoice number is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inv.date || ''))) return 'Invoice date is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inv.dueDate || ''))) return 'Due date is required.';
  if (!(Number(inv.amount) > 0)) return 'Amount must be greater than 0.';
  if (Number(inv.received) > Number(inv.amount)) return 'Received cannot exceed the invoice amount.';
  return '';
}

function outstanding(inv) {
  return round2(Math.max(0, round2(Number(inv.amount) || 0) - round2(Number(inv.received) || 0)));
}

function daysOverdue(inv, asOfISO) {
  return daysBetween(inv.dueDate, asOfISO);
}

/**
 * Open invoices sorted by collection priority (desc).
 * Each item: {...inv, outstanding, daysOverdue, priority}
 */
function priorityList(invoices, asOfISO) {
  return (invoices || [])
    .map(function (inv) {
      var o = outstanding(inv);
      var d = daysOverdue(inv, asOfISO);
      return {
        id: inv.id, customer: inv.customer, invoiceNo: inv.invoiceNo,
        date: inv.date, dueDate: inv.dueDate, phone: inv.phone || '',
        amount: round2(Number(inv.amount) || 0), received: round2(Number(inv.received) || 0),
        outstanding: o, daysOverdue: d,
        priority: d > 0 ? d * o : 0
      };
    })
    .filter(function (x) { return x.outstanding > 0; })
    .sort(function (a, b) { return b.priority - a.priority || b.daysOverdue - a.daysOverdue; });
}

function duesSummary(invoices, asOfISO) {
  var list = priorityList(invoices, asOfISO);
  var total = 0, overdue = 0;
  list.forEach(function (x) {
    total = round2(total + x.outstanding);
    if (x.daysOverdue > 0) overdue = round2(overdue + x.outstanding);
  });
  return { total: total, overdue: overdue, count: list.length };
}

/** Polite WhatsApp reminder draft (Hinglish). Never auto-sent. */
function reminderText(x) {
  var amt = '₹' + Number(x.outstanding).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  var line2 = x.daysOverdue > 0
    ? 'Ye ' + x.daysOverdue + ' din se overdue hai.'
    : 'Iski due date ' + x.dueDate + ' hai (' + (-x.daysOverdue) + ' din baaki).';
  return 'Namaste ' + x.customer + ' ji,\n' +
    'Aapka invoice ' + x.invoiceNo + ' (dated ' + x.date + ') ka ' + amt + ' abhi baki hai. ' + line2 + '\n' +
    'Kripya jald se jald payment kar dein. Koi dikkat ho to batayein.\nDhanyavaad!';
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
function duesInit() {
  var SLUG = 'outstanding-dues-tracker';
  var SAVE_LIMIT = 25; // report snapshots per day
  var invoices = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Collection priority ranking kya hai?',
      a: 'Priority = days overdue × outstanding amount. Jo invoice zyada din se baki hai aur jiski rakam badi hai, wo list me upar aata hai — taaki vasuli ki koshish sabse pehle wahin ho.' },
    { q: 'Kya app WhatsApp par reminder bhej deta hai?',
      a: 'Nahi. App sirf ek polite reminder text taiyaar karta hai. Aap use copy karke apne WhatsApp se khud bhejte hain — koi auto-send nahi hota.' },
    { q: 'Days overdue kaise nikala jata hai?',
      a: 'Aaj ki date − due date. Due date beet gayi to din gin kar dikhate hain; abhi due nahi hui to "X days left".' },
    { q: 'बकाया वसूली में ये ऐप कैसे मदद करता है?',
      a: 'Har invoice ka baki paisa, kitne din se overdue hai, aur kisse pehle vasool karna hai — sab ek list me, saath me taiyaar WhatsApp reminder text.' }
  ]);
  SEO.softwareApp({
    name: 'Outstanding Dues Tracker — बकाया वसूली',
    description: 'Free dues tracker for Indian SMEs: invoice-wise outstanding, days-overdue, collection priority ranking, copy-ready WhatsApp reminder drafts.',
    keywords: ['outstanding dues tracker', 'बकाया वसूली', 'payment collection app', 'overdue invoice tracker', 'collection priority', 'payment reminder whatsapp']
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
    return Vault.save(SLUG, 'invoices', invoices).catch(function () {});
  }

  function addInvoice() {
    var err = el('i-error'); err.textContent = '';
    var inv = {
      id: uid('i'), customer: el('i-cust').value.trim(), invoiceNo: el('i-no').value.trim(),
      date: el('i-date').value, dueDate: el('i-due').value,
      amount: parseFloat(el('i-amount').value) || 0,
      received: parseFloat(el('i-received').value) || 0,
      phone: el('i-phone').value.trim()
    };
    var verr = validateInvoice(inv);
    if (verr) { err.textContent = verr; return; }
    invoices.push(inv);
    el('i-cust').value = ''; el('i-no').value = ''; el('i-amount').value = '';
    el('i-received').value = ''; el('i-phone').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var asOf = today();
    var list = priorityList(invoices, asOf);
    var sum = duesSummary(invoices, asOf);
    el('kpiTotal').textContent = inr(sum.total);
    el('kpiOverdue').textContent = inr(sum.overdue);
    el('kpiCount').textContent = sum.count;

    if (!list.length) {
      el('duesBody').innerHTML = '<tr><td colspan="7" class="vq-hint">Koi open invoice nahi hai — invoice add karein.</td></tr>';
      return;
    }
    el('duesBody').innerHTML = list.map(function (x, i) {
      var status = x.daysOverdue > 0
        ? '<span class="pill p-out">' + x.daysOverdue + ' days overdue</span>'
        : '<span class="pill p-in">' + (-x.daysOverdue) + ' days left</span>';
      return '<tr' + (x.daysOverdue > 0 ? ' class="overdue"' : '') + '><td>' + (i + 1) + '</td>' +
        '<td>' + esc(x.customer) + '</td><td>' + esc(x.invoiceNo) + '</td>' +
        '<td>' + esc(x.dueDate) + '</td><td class="r"><strong>' + inr(x.outstanding) + '</strong></td>' +
        '<td>' + status + '</td>' +
        '<td class="no-print"><button class="vq-btn secondary mini rem" data-id="' + x.id + '">Reminder</button> ' +
        '<button class="vq-btn ghost mini del" data-id="' + x.id + '">✕</button></td></tr>';
    }).join('');

    el('duesBody').querySelectorAll('.rem').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var x = list.filter(function (y) { return y.id === id; })[0];
        if (!x) return;
        el('remCust').textContent = x.customer + ' — ' + x.invoiceNo;
        el('waDraft').textContent = reminderText(x);
        el('copyMsg').textContent = '';
        el('reminderCard').style.display = 'block';
        el('reminderCard').scrollIntoView({ behavior: 'smooth' });
      });
    });
    el('duesBody').querySelectorAll('.del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this invoice?')) return;
        invoices = invoices.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  el('copyBtn').addEventListener('click', function () {
    var txt = el('waDraft').textContent;
    function done() { el('copyMsg').textContent = '✓ Copied — ab WhatsApp me paste karke khud bhejein.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { el('copyMsg').textContent = 'Copy nahi hua — text ko manually select karke copy karein.'; }
      ta.remove();
    }
  });

  async function saveReport() {
    el('dues-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('dues-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + today() + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        asOf: today(), summary: duesSummary(invoices, today()),
        list: priorityList(invoices, today()),
        savedAt: new Date().toISOString()
      });
      el('dues-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('i-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addBtn').addEventListener('click', addInvoice);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('i-date').value = today();
  el('i-due').value = today();
  Vault.load(SLUG, 'invoices').then(function (d) {
    if (Array.isArray(d)) invoices = d;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', duesInit);
  } else { duesInit(); }
}
