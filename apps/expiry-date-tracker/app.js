/* ============================================================
   Expiry Date Tracker — pure computation layer.
   batches: {id, item, batchNo, mfgDate, expiryDate, qty, rate}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateBatch(b) {
  if (!b || !String(b.item || '').trim()) return 'Item name is required.';
  if (String(b.item).length > 200) return 'Item name too long (max 200 characters).';
  if (!String(b.batchNo || '').trim()) return 'Batch no is required.';
  if (String(b.batchNo).length > 60) return 'Batch no too long (max 60 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.expiryDate || ''))) return 'Expiry date is required.';
  if (b.mfgDate && b.expiryDate < b.mfgDate) return 'Expiry date cannot be before mfg date.';
  if (!(Number(b.qty) > 0 && Number(b.qty) < 1e9)) return 'Quantity must be between 0 and 1,00,00,00,000.';
  if (b.rate !== '' && b.rate != null && !(Number(b.rate) >= 0 && Number(b.rate) < 1e12))
    return 'Unit cost must be 0 or more (and realistic).';
  return '';
}

function daysLeft(expiryDate, todayStr) {
  var e = Date.UTC(+expiryDate.slice(0, 4), +expiryDate.slice(5, 7) - 1, +expiryDate.slice(8, 10));
  var t = Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, +todayStr.slice(8, 10));
  return Math.round((e - t) / 86400000);
}

function bucketOf(dl) {
  if (dl < 0) return 'expired';
  if (dl <= 30) return 'exp30';
  if (dl <= 90) return 'exp90';
  return 'safe';
}

/**
 * Bucket summary: {expired:[], exp30:[], exp90:[], safe:[],
 *   valueAtRisk, counts:{...}}
 * valueAtRisk = sum qty*rate of expired + exp30 batches
 */
function bucketReport(batches, todayStr) {
  var rep = { expired: [], exp30: [], exp90: [], safe: [], valueAtRisk: 0 };
  (batches || []).forEach(function (b) {
    var dl = daysLeft(b.expiryDate, todayStr);
    var val = round2((Number(b.qty) || 0) * (Number(b.rate) || 0));
    var row = { batch: b, daysLeft: dl, value: val, bucket: bucketOf(dl) };
    rep[row.bucket].push(row);
    if (row.bucket === 'expired' || row.bucket === 'exp30') {
      rep.valueAtRisk = round2(rep.valueAtRisk + val);
    }
  });
  ['expired', 'exp30', 'exp90', 'safe'].forEach(function (k) {
    rep[k].sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  });
  return rep;
}

/** FEFO issue order: all batches sorted by expiry date ascending. */
function fifoOrder(batches, todayStr) {
  var t = todayStr;
  return (batches || []).slice().sort(function (a, b) {
    return a.expiryDate < b.expiryDate ? -1 : (a.expiryDate > b.expiryDate ? 1 : 0);
  }).map(function (b, i) {
    return { rank: i + 1, batch: b, daysLeft: daysLeft(b.expiryDate, t) };
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function edtInit() {
  var SLUG = 'expiry-date-tracker';
  var SAVE_LIMIT = 25;
  var batches = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Expiry date tracker kaise kaam karta hai?',
      a: 'Har batch ka item, batch number, mfg/expiry date aur quantity darj karein. App batches ko expired, ≤30 din aur ≤90 din buckets me baant deta hai aur risk value nikaalta hai.' },
    { q: 'FIFO issue suggestion kya hai?',
      a: 'Sale ke time sabse pehle expire hone wala batch pehle nikalo — ise FEFO (First Expired, First Out) kehte hain. Isse expiry loss kam hota hai.' },
    { q: 'Value at risk ka matlab kya hai?',
      a: 'Expired aur 30 din me expire hone wale batches ka kul cost value — ye woh paisa hai jo turant action na lene par doob sakta hai.' },
    { q: 'एक्सपायरी ट्रैकिंग क्यों ज़रूरी है?',
      a: 'Dawa, food aur cosmetics me expired maal bechna kanooni jurm bhi hai aur nuksaan bhi — batch-wise tracking se wastage aur risk dono kam hote hain.' }
  ]);
  SEO.softwareApp({
    name: 'Expiry Date Tracker — एक्सपायरी डेट ट्रैकर',
    description: 'Free expiry date tracker for Indian SMEs: batch-wise expiry buckets, value at risk, FEFO/FIFO issue suggestion.',
    keywords: ['expiry date tracker', 'एक्सपायरी डेट ट्रैकर', 'batch expiry tracker', 'expired stock alert', 'shelf life management', 'FEFO', 'food expiry tracking India']
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
    return Vault.save(SLUG, 'data', { batches: batches }).catch(function () {});
  }

  function addBatch() {
    var err = el('b-error'); err.textContent = '';
    var b = {
      id: uid('b'), item: el('b-item').value.trim(), batchNo: el('b-batch').value.trim(),
      mfgDate: el('b-mfg').value, expiryDate: el('b-exp').value,
      qty: parseFloat(el('b-qty').value) || 0,
      rate: el('b-rate').value === '' ? null : parseFloat(el('b-rate').value)
    };
    var verr = validateBatch(b);
    if (verr) { err.textContent = verr; return; }
    batches.push(b);
    el('b-item').value = ''; el('b-batch').value = ''; el('b-mfg').value = '';
    el('b-exp').value = ''; el('b-qty').value = ''; el('b-rate').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var t = today();
    var rep = bucketReport(batches, t);
    el('kExpired').textContent = rep.expired.length;
    el('k30').textContent = rep.exp30.length;
    el('k90').textContent = rep.exp90.length;
    el('kRisk').textContent = inr(rep.valueAtRisk);

    var all = rep.expired.concat(rep.exp30, rep.exp90, rep.safe);
    el('batchBody').innerHTML = all.length ? all.map(function (r) {
      var b = r.batch, pill, cls;
      if (r.bucket === 'expired') { pill = '<span class="pill p-out">🚨 Expired</span>'; cls = 'exp'; }
      else if (r.bucket === 'exp30') { pill = '<span class="pill p-warn">⚠ ≤30d</span>'; cls = 'w30'; }
      else if (r.bucket === 'exp90') { pill = '<span class="pill p-warn2">31–90d</span>'; cls = 'w90'; }
      else { pill = '<span class="pill p-in">Safe</span>'; cls = ''; }
      return '<tr class="' + cls + '"><td>' + esc(b.item) + '</td><td>' + esc(b.batchNo) + '</td>' +
        '<td>' + esc(b.expiryDate) + '</td><td class="r">' + (r.daysLeft < 0 ? r.daysLeft : r.daysLeft) + '</td>' +
        '<td class="r">' + b.qty + '</td><td class="r">' + inr(r.value) + '</td><td>' + pill + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-b" data-id="' + b.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="vq-hint">Abhi koi batch nahi hai — pehle batch add karein.</td></tr>';

    el('batchBody').querySelectorAll('.del-b').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.confirm('Delete this batch?')) return;
        batches = batches.filter(function (x) { return x.id !== btn.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });

    var fifo = fifoOrder(batches, t);
    el('fifoBody').innerHTML = fifo.length ? fifo.map(function (r) {
      var b = r.batch;
      return '<tr><td>' + r.rank + '</td><td>' + esc(b.item) + '</td><td>' + esc(b.batchNo) + '</td>' +
        '<td>' + esc(b.expiryDate) + '</td><td class="r">' + r.daysLeft + '</td>' +
        '<td class="r"><strong>' + b.qty + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="6" class="vq-hint">Koi batch nahi hai.</td></tr>';
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(),
        report: bucketReport(batches, today())
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('b-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addBatchBtn').addEventListener('click', addBatch);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.batches)) batches = d.batches;
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
    document.addEventListener('DOMContentLoaded', edtInit);
  } else { edtInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validateBatch: validateBatch,
    daysLeft: daysLeft, bucketOf: bucketOf, bucketReport: bucketReport, fifoOrder: fifoOrder };
}
