/* ============================================================
   Customer Database Manager — pure computation layer.
   Customer: {id, name, phone, address, gstin, tags:[], createdAt}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9][Zz][A-Z0-9]$/i;

function validateCustomer(c) {
  if (!c || !String(c.name || '').trim()) return 'Customer name is required.';
  var g = String(c.gstin || '').trim();
  if (g && !GSTIN_RE.test(g)) return 'GSTIN invalid hai — 15 character ka sahi format likhein.';
  return '';
}

/** "retail, vip" -> ["retail","vip"] (lowercased, deduped). */
function normTags(str) {
  var seen = {}, out = [];
  String(str || '').split(',').forEach(function (t) {
    var v = t.trim().toLowerCase();
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  });
  return out;
}

/** All distinct tags across customers, sorted. */
function allTags(list) {
  var seen = {};
  (list || []).forEach(function (c) {
    (c.tags || []).forEach(function (t) { seen[t] = 1; });
  });
  return Object.keys(seen).sort();
}

/** Case-insensitive search over name/phone/address; optional tag filter. */
function filterCustomers(list, q, tag) {
  q = String(q || '').trim().toLowerCase();
  return (list || []).filter(function (c) {
    if (tag && (c.tags || []).indexOf(tag) < 0) return false;
    if (!q) return true;
    var hay = [c.name, c.phone, c.address, c.gstin].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  });
}

/** CSV export of the full customer master. */
function customersCSV(list) {
  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  var rows = ['Name,Phone,Address,GSTIN,Tags'];
  (list || []).forEach(function (c) {
    rows.push([q(c.name), q(c.phone), q(c.address), q(c.gstin), q((c.tags || []).join('; '))].join(','));
  });
  return rows.join('\r\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function cdbInit() {
  var SLUG = 'customer-database-manager';
  var EXPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var customers = [];
  var editingId = null;

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Customer database me kya-kya record karna chahiye?',
      a: 'Har customer ke liye name, phone, address, GSTIN aur tags/segments record karein. GSTIN business customers ke liye zaroori hai; tags se segment-wise targeting aasaan hoti hai.' },
    { q: 'Tags ya segments ka fayda kya hai?',
      a: 'Tags se customers ko groups me baant sakte hain — jaise vip, dealer, retail. Filter se turant us segment ke saare customers nikaal sakte hain.' },
    { q: 'Kya customer list export ho sakti hai?',
      a: 'Haan — Export CSV se poori customer list download hoti hai (Excel/Google Sheets compatible). Free me 20 exports/day.' },
    { q: 'ग्राहक डेटाबेस क्या होता है?',
      a: 'Graahak database me saare customers ka master record rehta hai — naam, phone, pata, GSTIN aur tags. Ek jagah organised data se billing, follow-up aur marketing aasaan ho jaata hai.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase set karke encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Customer Database Manager — ग्राहक डेटाबेस',
    description: 'Free customer database for Indian SMEs: customer master with name, phone, address, GSTIN, tags & segments; search + filter, add/edit/delete, CSV export.',
    keywords: ['customer database', 'ग्राहक डेटाबेस', 'customer master India', 'customer database software free', 'ग्राहक सूची', 'customer segmentation tags', 'GSTIN customer record']
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
    return Vault.save(SLUG, 'data', { customers: customers }).catch(function () {});
  }

  function clearForm() {
    el('c-editId').value = ''; editingId = null;
    el('c-name').value = ''; el('c-phone').value = '';
    el('c-address').value = ''; el('c-gstin').value = ''; el('c-tags').value = '';
    el('formTitle').textContent = 'Add customer / ग्राहक जोड़ें';
    el('addCustomerBtn').textContent = 'Add customer';
    el('cancelEditBtn').style.display = 'none';
  }

  function saveCustomer() {
    var err = el('c-error'); err.textContent = '';
    var c = {
      id: editingId || uid('c'),
      name: el('c-name').value.trim(),
      phone: el('c-phone').value.trim(),
      address: el('c-address').value.trim(),
      gstin: el('c-gstin').value.trim().toUpperCase(),
      tags: normTags(el('c-tags').value),
      createdAt: editingId ? undefined : new Date().toISOString()
    };
    var verr = validateCustomer(c);
    if (verr) { err.textContent = verr; return; }
    if (editingId) {
      var old = customers.filter(function (x) { return x.id === editingId; })[0];
      if (old) c.createdAt = old.createdAt;
      customers = customers.map(function (x) { return x.id === editingId ? c : x; });
    } else {
      customers.push(c);
    }
    clearForm();
    persist().then(render);
  }

  function startEdit(id) {
    var c = customers.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    editingId = id; el('c-editId').value = id;
    el('c-name').value = c.name; el('c-phone').value = c.phone || '';
    el('c-address').value = c.address || ''; el('c-gstin').value = c.gstin || '';
    el('c-tags').value = (c.tags || []).join(', ');
    el('formTitle').textContent = 'Edit customer / ग्राहक सुधारें';
    el('addCustomerBtn').textContent = 'Save changes';
    el('cancelEditBtn').style.display = '';
    window.scrollTo(0, 0);
  }

  function delCustomer(id) {
    if (!window.confirm('Delete this customer? Ye action undo nahi hoga.')) return;
    customers = customers.filter(function (x) { return x.id !== id; });
    if (editingId === id) clearForm();
    persist().then(render);
  }

  function renderTagFilter() {
    var cur = el('cust-tagfilter').value;
    var opts = '<option value="">— All tags —</option>' + allTags(customers).map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
    el('cust-tagfilter').innerHTML = opts;
  }

  function render() {
    renderTagFilter();
    var list = filterCustomers(customers, el('cust-search').value, el('cust-tagfilter').value);
    el('custCount').textContent = list.length + ' customer(s) dikh rahe hain (' + customers.length + ' total)';
    if (!list.length) {
      el('custBody').innerHTML = '<tr><td colspan="6" class="vq-hint">Koi customer nahi mila — upar form se add karein.</td></tr>';
      return;
    }
    el('custBody').innerHTML = list.map(function (c) {
      return '<tr>' +
        '<td><strong>' + esc(c.name) + '</strong></td>' +
        '<td>' + esc(c.phone || '—') + '</td>' +
        '<td>' + esc(c.address || '—') + '</td>' +
        '<td>' + esc(c.gstin || '—') + '</td>' +
        '<td>' + ((c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join(' ') || '—') + '</td>' +
        '<td class="row-actions no-print">' +
        '<button class="vq-btn ghost mini" data-edit="' + c.id + '" type="button">Edit</button> ' +
        '<button class="vq-btn ghost mini" data-del="' + c.id + '" type="button">Delete</button></td></tr>';
    }).join('');
    el('custBody').querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { startEdit(b.getAttribute('data-edit')); });
    });
    el('custBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delCustomer(b.getAttribute('data-del')); });
    });
  }

  function downloadCSV() {
    el('cdb-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, EXPORT_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cdb-upsell'), SLUG, EXPORT_LIMIT); return; }
    if (!customers.length) { el('c-error').textContent = 'Export ke liye pehle customer add karein.'; return; }
    var blob = new Blob([customersCSV(customers)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'customer-database-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
    el('cdb-saved').textContent = 'CSV exported ✓ (' + Freemium.remaining(SLUG, EXPORT_LIMIT) + ' free exports left today)';
  }

  async function saveSnapshot() {
    el('cdb-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cdb-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, { savedAt: new Date().toISOString(), count: customers.length, customers: customers });
      el('cdb-saved').textContent = 'Snapshot saved ✓ (' + customers.length + ' customers, ' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('c-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addCustomerBtn').addEventListener('click', saveCustomer);
  el('cancelEditBtn').addEventListener('click', clearForm);
  el('cust-search').addEventListener('input', render);
  el('cust-tagfilter').addEventListener('change', render);
  el('exportBtn').addEventListener('click', downloadCSV);
  el('saveBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.customers)) customers = d.customers;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cdbInit);
  } else { cdbInit(); }
}
