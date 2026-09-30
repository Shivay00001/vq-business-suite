/* ============================================================
   Item Price History — pure computation layer.
   entries: {id, item, date, rate, supplier}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validatePriceEntry(e) {
  if (!e || !String(e.item || '').trim()) return 'Item name is required.';
  if (String(e.item).length > 200) return 'Item name too long (max 200 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'Date is required.';
  if (!(Number(e.rate) >= 0 && Number(e.rate) < 1e12)) return 'Rate must be 0 or more (and realistic).';
  if (String(e.supplier || '').length > 200) return 'Supplier name too long (max 200 characters).';
  return '';
}

function itemEntries(entries, item) {
  return (entries || []).filter(function (e) { return e.item === item; })
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
}

function distinctItems(entries) {
  var set = {};
  (entries || []).forEach(function (e) { set[e.item] = 1; });
  return Object.keys(set).sort();
}

/**
 * Price stats for one item.
 * Returns {count, min, max, avg, latest, latestDate, vsAvgPct} or null when empty.
 */
function priceStats(entries, item) {
  var E = itemEntries(entries, item);
  if (!E.length) return null;
  var rates = E.map(function (e) { return Number(e.rate) || 0; });
  var min = Math.min.apply(null, rates);
  var max = Math.max.apply(null, rates);
  var avg = round2(rates.reduce(function (s, r) { return s + r; }, 0) / rates.length);
  var latest = rates[rates.length - 1];
  var vsAvgPct = avg > 0 ? round2((latest - avg) / avg * 100) : 0;
  return {
    count: E.length, min: round2(min), max: round2(max), avg: avg,
    latest: round2(latest), latestDate: E[E.length - 1].date, vsAvgPct: vsAvgPct,
    points: E
  };
}

/**
 * Supplier-wise comparison for one item.
 * Returns [{supplier, count, latest, avg, min, cheapest}]
 */
function supplierComparison(entries, item) {
  var E = itemEntries(entries, item);
  var by = {};
  E.forEach(function (e) {
    var s = String(e.supplier || '').trim() || '(no supplier)';
    if (!by[s]) by[s] = [];
    by[s].push(Number(e.rate) || 0);
  });
  var rows = Object.keys(by).map(function (s) {
    var rs = by[s];
    return {
      supplier: s, count: rs.length,
      latest: round2(rs[rs.length - 1]),
      avg: round2(rs.reduce(function (a, b) { return a + b; }, 0) / rs.length),
      min: round2(Math.min.apply(null, rs)),
      cheapest: false
    };
  });
  rows.sort(function (a, b) { return a.avg - b.avg; });
  if (rows.length) rows[0].cheapest = true;
  return rows;
}

/** SVG line chart of price points (date → rate). */
function lineSVG(points) {
  var W = 620, H = 260, padL = 56, padR = 14, padT = 14, padB = 34;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Price trend chart" style="width:100%;height:auto">';
  if (!points || points.length < 1) {
    s += '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="13" fill="#94a3b8">No data</text></svg>';
    return s;
  }
  var rates = points.map(function (p) { return Number(p.rate) || 0; });
  var lo = Math.min.apply(null, rates), hi = Math.max.apply(null, rates);
  if (hi === lo) { hi = lo + 1; lo = lo - 1; }
  var innerW = W - padL - padR, innerH = H - padT - padB;
  function X(i) { return padL + (points.length === 1 ? innerW / 2 : i / (points.length - 1) * innerW); }
  function Y(r) { return padT + innerH - (r - lo) / (hi - lo) * innerH; }
  for (var g = 0; g <= 4; g++) {
    var gv = lo + (hi - lo) * g / 4, gy = Y(gv).toFixed(1);
    s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#e5e7eb"/>' +
      '<text x="' + (padL - 6) + '" y="' + (+gy + 4) + '" font-size="10" text-anchor="end" fill="#6b7280">' + inrPlain(round2(gv)) + '</text>';
  }
  if (points.length > 1) {
    var d = points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ',' + Y(Number(p.rate) || 0).toFixed(1);
    }).join(' ');
    s += '<path d="' + d + '" fill="none" stroke="#2563eb" stroke-width="2.5"/>';
  }
  points.forEach(function (p, i) {
    var cx = X(i).toFixed(1), cy = Y(Number(p.rate) || 0).toFixed(1);
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#2563eb" stroke="#fff" stroke-width="2">' +
      '<title>' + esc(p.date) + ': ' + inrPlain(Number(p.rate) || 0) + (p.supplier ? ' (' + esc(p.supplier) + ')' : '') + '</title></circle>';
    if (points.length <= 12) {
      s += '<text x="' + cx + '" y="' + (H - 16) + '" font-size="9" text-anchor="middle" fill="#6b7280">' +
        esc(p.date.slice(5)) + '</text>';
    }
  });
  s += '</svg>';
  return s;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function iphInit() {
  var SLUG = 'item-price-history';
  var SAVE_LIMIT = 25;
  var entries = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Price history track karne se kya fayda?',
      a: 'Rate kab badha/ghata, kaun sa supplier sasta padta hai, aur bargaining ke liye proof — ye sab price history se milta hai.' },
    { q: 'Latest vs average % ka matlab kya hai?',
      a: 'Ye batata hai ki aaj ka rate ausat rate se kitna % upar/neeche hai — positive % matlab abhi rate mehenga chal raha hai.' },
    { q: 'Supplier comparison kaise use karein?',
      a: 'Har supplier ka avg aur latest rate compare karein — consistently saste supplier se zyada order dein, mehange se bargain karein.' },
    { q: 'प्राइस हिस्ट्री क्यों ज़रूरी है?',
      a: 'Raw material ke bhav roz badalte hain — bina history ke pata nahi chalta kab sasta khareedein aur supplier rate sahi de raha hai ya nahi.' }
  ]);
  SEO.softwareApp({
    name: 'Item Price History — आइटम प्राइस हिस्ट्री',
    description: 'Free item price history for Indian SMEs: price trend chart, min/max/avg, latest-vs-average %, supplier-wise comparison.',
    keywords: ['price history', 'प्राइस हिस्ट्री', 'purchase price trend', 'supplier price comparison', 'rate trend chart', 'raw material price tracking India', 'price fluctuation analysis']
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
    return Vault.save(SLUG, 'data', { entries: entries }).catch(function () {});
  }

  function addPrice() {
    var err = el('p-error'); err.textContent = '';
    var e = { id: uid('p'), item: el('p-item').value.trim(), date: el('p-date').value,
      rate: parseFloat(el('p-rate').value), supplier: el('p-sup').value.trim() };
    var verr = validatePriceEntry(e);
    if (verr) { err.textContent = verr; return; }
    entries.push(e);
    el('p-rate').value = ''; el('p-sup').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var items = distinctItems(entries);
    var sel = el('itemSel');
    var cur = sel.value;
    sel.innerHTML = items.map(function (i) {
      return '<option value="' + esc(i) + '">' + esc(i) + '</option>';
    }).join('') || '<option value="">— pehle price entry add karein —</option>';
    if (items.indexOf(cur) >= 0) sel.value = cur;
    var item = sel.value;

    if (!item) {
      ['kLatest','kMin','kMax','kAvg','kVs'].forEach(function (id) { el(id).textContent = '—'; });
      el('trendItem').textContent = ''; el('cmpItem').textContent = '';
      el('trendChart').innerHTML = '';
      el('priceBody').innerHTML = '<tr><td colspan="4" class="vq-hint">Koi data nahi.</td></tr>';
      el('supBody').innerHTML = '<tr><td colspan="6" class="vq-hint">Koi data nahi.</td></tr>';
      return;
    }

    el('trendItem').textContent = item;
    el('cmpItem').textContent = item;
    var st = priceStats(entries, item);
    el('kLatest').textContent = inr(st.latest) + ' (' + st.latestDate.slice(5) + ')';
    el('kMin').textContent = inr(st.min);
    el('kMax').textContent = inr(st.max);
    el('kAvg').textContent = inr(st.avg);
    var pct = st.vsAvgPct;
    var pill = pct > 0.5 ? 'p-up' : (pct < -0.5 ? 'p-dn' : 'p-flat');
    var arrow = pct > 0.5 ? '▲' : (pct < -0.5 ? '▼' : '●');
    el('kVs').innerHTML = '<span class="pill ' + pill + '">' + arrow + ' ' + (pct > 0 ? '+' : '') + pct + '%</span>';

    el('trendChart').innerHTML = lineSVG(st.points);

    el('priceBody').innerHTML = st.points.slice().reverse().map(function (p) {
      return '<tr><td>' + esc(p.date) + '</td><td class="r">' + inr(p.rate) + '</td>' +
        '<td>' + esc(p.supplier || '—') + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-p" data-id="' + p.id + '">✕</button></td></tr>';
    }).join('');
    el('priceBody').querySelectorAll('.del-p').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this price entry?')) return;
        entries = entries.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });

    var sups = supplierComparison(entries, item);
    el('supBody').innerHTML = sups.length ? sups.map(function (r) {
      return '<tr><td>' + esc(r.supplier) + '</td><td class="r">' + r.count + '</td>' +
        '<td class="r">' + inr(r.latest) + '</td><td class="r">' + inr(r.avg) + '</td>' +
        '<td class="r">' + inr(r.min) + '</td>' +
        '<td>' + (r.cheapest ? '<span class="pill p-dn">✓ Cheapest on average</span>' : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="vq-hint">Koi supplier data nahi.</td></tr>';
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var item = el('itemSel').value;
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), item: item,
        stats: priceStats(entries, item),
        supplierComparison: supplierComparison(entries, item)
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('p-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addPriceBtn').addEventListener('click', addPrice);
  el('itemSel').addEventListener('change', renderAll);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('p-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.entries)) entries = d.entries;
    renderAll();
  }).catch(renderAll);
}

function inrPlain(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function inr(n) { return inrPlain(n); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iphInit);
  } else { iphInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validatePriceEntry: validatePriceEntry,
    itemEntries: itemEntries, distinctItems: distinctItems,
    priceStats: priceStats, supplierComparison: supplierComparison, lineSVG: lineSVG };
}
