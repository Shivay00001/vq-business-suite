/* ============================================================
   Customer Feedback Manager — pure computation layer.
   Feedback: {id, customer, rating 1-5, category, text, date,
              status:'open'|'in-progress'|'resolved',
              resolutionNote, resolvedDate, createdAt}
   Open-complaint aging = days since `date` for open/in-progress items.
   Security: lengths capped, rating range-checked, dates validated.
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var STATUSES = ['open', 'in-progress', 'resolved'];
var STATUS_LABEL = { open: 'Open', 'in-progress': 'In-progress', resolved: 'Resolved' };
var CATS = ['Product', 'Service', 'Delivery', 'Billing', 'Staff behaviour', 'Other'];

function daysBetween(aISO, bISO) {
  var a = new Date(String(aISO).slice(0, 10) + 'T00:00:00');
  var b = new Date(String(bISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.floor((b - a) / 86400000);
}

function validateFeedback(f) {
  if (!f) return 'Feedback data missing hai.';
  if (!String(f.customer || '').trim()) return 'Customer name is required.';
  if (String(f.customer).length > 120) return 'Customer name 120 characters se zyada nahi ho sakta.';
  var r = Number(f.rating);
  if (!isFinite(r) || r < 1 || r > 5 || Math.floor(r) !== r) return 'Rating 1–5 ke beech poora number hona chahiye.';
  if (CATS.indexOf(f.category) < 0) return 'Category invalid hai.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ''))) return 'Date is required.';
  if (!String(f.text || '').trim()) return 'Feedback text is required.';
  if (String(f.text).length > 2000) return 'Feedback text 2000 characters se zyada nahi ho sakta.';
  if (STATUSES.indexOf(f.status) < 0) return 'Status invalid hai.';
  if (String(f.resolutionNote || '').length > 2000) return 'Resolution notes 2000 characters se zyada nahi ho sakte.';
  return '';
}

/** true if the item is still pending resolution. */
function isOpenItem(f) {
  return f && (f.status === 'open' || f.status === 'in-progress');
}

/** Aging in days for a pending item as of asOfISO. */
function agingDays(f, asOfISO) {
  if (!isOpenItem(f)) return 0;
  return Math.max(0, daysBetween(f.date, asOfISO));
}

/** {open, inProgress, resolved, avgRating} summary. */
function fbSummary(items) {
  var s = { open: 0, inProgress: 0, resolved: 0, avgRating: 0 };
  var sum = 0, n = 0;
  (items || []).forEach(function (f) {
    if (f.status === 'open') s.open++;
    else if (f.status === 'in-progress') s.inProgress++;
    else if (f.status === 'resolved') s.resolved++;
    var r = Number(f.rating);
    if (isFinite(r) && r >= 1 && r <= 5) { sum += r; n++; }
  });
  s.avgRating = n ? round2(sum / n) : 0;
  return s;
}

/** Filter by status and/or category. */
function filterFeedback(items, status, cat) {
  return (items || []).filter(function (f) {
    if (status && f.status !== status) return false;
    if (cat && f.category !== cat) return false;
    return true;
  });
}

/** Rating as star characters (sanitized to 1..5). */
function stars(r) {
  r = Math.max(1, Math.min(5, Math.floor(Number(r) || 1)));
  var s = '';
  for (var i = 0; i < 5; i++) s += i < r ? '★' : '☆';
  return s;
}

/** CSV export of the feedback log. */
function feedbackCSV(items) {
  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  var rows = ['Date,Customer,Category,Rating,Status,Feedback,ResolutionNotes,ResolvedDate'];
  (items || []).forEach(function (f) {
    rows.push([q(f.date), q(f.customer), q(f.category), q(f.rating), q(f.status),
               q(f.text), q(f.resolutionNote), q(f.resolvedDate)].join(','));
  });
  return rows.join('\r\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function fmInit() {
  var SLUG = 'customer-feedback-manager';
  var EXPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var items = [];
  var resolvingId = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Open-complaint aging kya hoti hai?',
      a: 'Aging batati hai ki ek khuli (open ya in-progress) complaint kitne din se pending hai. 7+ din purani complaints red me highlight hoti hain taaki turant action liya ja sake.' },
    { q: 'Status kaise update karein?',
      a: 'Log me Update dabayein, naya status chunein (open / in-progress / resolved) aur resolution notes likhein — kya action liya gaya. Resolved par resolved date bhi daalein.' },
    { q: 'Rating se kya pata chalta hai?',
      a: '1–5 star rating se average rating nikalti hai — ye aapki service quality ka seedha measure hai. Low rating wali categories par focus karke sudhaar kiya ja sakta hai.' },
    { q: 'ग्राहक शिकायत प्रबंधन क्यों ज़रूरी है?',
      a: 'Shikayat ko time par solve karne se customer wapas aata hai; ignore karne se negative reviews milte hain. Log me har complaint ka status aur aging saaf dikhta hai.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Customer Feedback Manager — ग्राहक फीडबैक',
    description: 'Free customer feedback & complaint manager for Indian SMEs: feedback log with 1-5 star rating, category, status (open/in-progress/resolved), resolution notes, open-complaint aging.',
    keywords: ['customer feedback', 'ग्राहक फीडबैक', 'complaint management India', 'customer complaint tracker', 'feedback log', 'customer rating tracker', 'शिकायत प्रबंधन', 'service feedback tool']
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
    return Vault.save(SLUG, 'data', { items: items }).catch(function () {});
  }

  function addFeedback() {
    var err = el('f-error'); err.textContent = '';
    var f = {
      id: uid('f'),
      customer: el('f-customer').value.trim().slice(0, 120),
      rating: parseInt(el('f-rating').value, 10),
      category: el('f-cat').value,
      text: el('f-text').value.trim().slice(0, 2000),
      date: el('f-date').value,
      status: 'open',
      resolutionNote: '',
      resolvedDate: '',
      createdAt: new Date().toISOString()
    };
    var verr = validateFeedback(f);
    if (verr) { err.textContent = verr; return; }
    items.push(f);
    el('f-customer').value = ''; el('f-text').value = '';
    persist().then(render);
  }

  function openResolve(id) {
    var f = items.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    resolvingId = id;
    el('resolveFor').textContent = f.customer;
    el('r-status').value = f.status;
    el('r-date').value = f.resolvedDate || today();
    el('r-note').value = f.resolutionNote || '';
    el('r-error').textContent = '';
    el('resolveCard').style.display = '';
    el('resolveCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveResolve() {
    var err = el('r-error'); err.textContent = '';
    var f = items.filter(function (x) { return x.id === resolvingId; })[0];
    if (!f) { resolvingId = null; el('resolveCard').style.display = 'none'; return; }
    var note = el('r-note').value.trim().slice(0, 2000);
    var st = el('r-status').value;
    if (STATUSES.indexOf(st) < 0) { err.textContent = 'Status invalid hai.'; return; }
    f.status = st;
    f.resolutionNote = note;
    if (st === 'resolved') {
      var rd = el('r-date').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rd || '')) { err.textContent = 'Resolved date daalein.'; return; }
      f.resolvedDate = rd;
    } else {
      f.resolvedDate = '';
    }
    resolvingId = null;
    el('resolveCard').style.display = 'none';
    persist().then(render);
  }

  function delItem(id) {
    if (!window.confirm('Delete this feedback entry?')) return;
    items = items.filter(function (x) { return x.id !== id; });
    persist().then(render);
  }

  function statusPill(s) {
    var cls = s === 'open' ? 'fs-open' : (s === 'in-progress' ? 'fs-progress' : 'fs-resolved');
    return '<span class="pill ' + cls + '">' + STATUS_LABEL[s] + '</span>';
  }

  function render() {
    var s = fbSummary(items);
    el('kpiOpen').textContent = s.open;
    el('kpiProgress').textContent = s.inProgress;
    el('kpiResolved').textContent = s.resolved;
    el('kpiAvg').textContent = s.avgRating ? s.avgRating + ' ★' : '—';

    var asOf = today();
    var list = filterFeedback(items, el('flt-status').value, el('flt-cat').value);
    if (!list.length) {
      el('fbBody').innerHTML = '<tr><td colspan="8" class="vq-hint">Koi feedback nahi mila — upar form se add karein.</td></tr>';
      return;
    }
    el('fbBody').innerHTML = list.map(function (f) {
      var age = agingDays(f, asOf);
      var stale = isOpenItem(f) && age >= 7;
      var txt = esc(f.text);
      if (txt.length > 120) txt = txt.slice(0, 120) + '…';
      var res = f.resolutionNote ? '<br><span class="vq-hint">↳ ' + esc(f.resolutionNote.slice(0, 120)) + '</span>' : '';
      return '<tr class="' + (stale ? 'stale' : '') + '">' +
        '<td>' + esc(f.date) + '</td>' +
        '<td><strong>' + esc(f.customer) + '</strong></td>' +
        '<td>' + esc(f.category) + '</td>' +
        '<td><span class="stars">' + stars(f.rating) + '</span></td>' +
        '<td>' + txt + res + '</td>' +
        '<td>' + statusPill(f.status) + '</td>' +
        '<td class="r"' + (stale ? ' style="color:#b42318;font-weight:700"' : '') + '>' +
        (isOpenItem(f) ? age + (stale ? ' ⚠️' : '') : '—') + '</td>' +
        '<td class="row-actions no-print">' +
        '<button class="vq-btn ghost mini" data-upd="' + f.id + '" type="button">Update</button> ' +
        '<button class="vq-btn ghost mini" data-del="' + f.id + '" type="button">Delete</button></td></tr>';
    }).join('');
    el('fbBody').querySelectorAll('[data-upd]').forEach(function (b) {
      b.addEventListener('click', function () { openResolve(b.getAttribute('data-upd')); });
    });
    el('fbBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delItem(b.getAttribute('data-del')); });
    });
  }

  function downloadCSV() {
    el('fm-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, EXPORT_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('fm-upsell'), SLUG, EXPORT_LIMIT); return; }
    if (!items.length) { el('f-error').textContent = 'Export ke liye pehle feedback add karein.'; return; }
    var blob = new Blob([feedbackCSV(items)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'feedback-log-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
    el('fm-saved').textContent = 'CSV exported ✓ (' + Freemium.remaining(SLUG, EXPORT_LIMIT) + ' free exports left today)';
  }

  async function saveSnapshot() {
    el('fm-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('fm-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), summary: fbSummary(items), items: items
      });
      el('fm-saved').textContent = 'Snapshot saved ✓ (' + Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('f-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addFbBtn').addEventListener('click', addFeedback);
  el('saveResolveBtn').addEventListener('click', saveResolve);
  el('cancelResolveBtn').addEventListener('click', function () {
    resolvingId = null; el('resolveCard').style.display = 'none';
  });
  el('flt-status').addEventListener('change', render);
  el('flt-cat').addEventListener('change', render);
  el('exportBtn').addEventListener('click', downloadCSV);
  el('saveBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('f-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.items)) items = d.items;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fmInit);
  } else { fmInit(); }
}
