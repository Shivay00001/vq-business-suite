/* ============================================================
   Dead Stock Analyzer — pure computation layer.
   items: {id, name, lastMove (YYYY-MM-DD), qty, unitValue}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateDeadItem(it) {
  if (!it || !String(it.name || '').trim()) return 'Item name is required.';
  if (String(it.name).length > 200) return 'Item name too long (max 200 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(it.lastMove || ''))) return 'Last movement date is required.';
  if (it.lastMove > new Date().toISOString().slice(0, 10)) return 'Last movement date cannot be in the future.';
  if (!(Number(it.qty) >= 0 && Number(it.qty) < 1e9)) return 'Quantity must be 0 or more (and realistic).';
  if (!(Number(it.unitValue) >= 0 && Number(it.unitValue) < 1e12)) return 'Unit value must be 0 or more (and realistic).';
  return '';
}

function daysIdle(lastMove, todayStr) {
  var e = Date.UTC(+lastMove.slice(0, 4), +lastMove.slice(5, 7) - 1, +lastMove.slice(8, 10));
  var t = Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, +todayStr.slice(8, 10));
  return Math.round((t - e) / 86400000);
}

/**
 * Dead-stock analysis.
 * Returns {dead:[], active:[], deadCount, deadValue, totalValue, deadPct}
 * row: {item, daysIdle, value, dead}
 */
function deadStockReport(items, thresholdDays, todayStr) {
  var th = Number(thresholdDays) || 90;
  var dead = [], active = [], deadValue = 0, totalValue = 0;
  (items || []).forEach(function (it) {
    var di = daysIdle(it.lastMove, todayStr);
    var val = round2((Number(it.qty) || 0) * (Number(it.unitValue) || 0));
    totalValue = round2(totalValue + val);
    var row = { item: it, daysIdle: di, value: val, dead: di >= th };
    if (row.dead) { dead.push(row); deadValue = round2(deadValue + val); }
    else active.push(row);
  });
  dead.sort(function (a, b) { return b.daysIdle - a.daysIdle; });
  active.sort(function (a, b) { return b.daysIdle - a.daysIdle; });
  return {
    dead: dead, active: active,
    deadCount: dead.length,
    deadValue: deadValue, totalValue: totalValue,
    deadPct: totalValue > 0 ? round2(deadValue / totalValue * 100) : 0
  };
}

/** Plain-language suggestions based on the report. */
function clearanceSuggestions(rep) {
  var tips = [];
  if (!rep.dead.length) {
    tips.push('🎉 Koi dead stock nahi hai — saara maal threshold ke andar move ho raha hai.');
    return tips;
  }
  tips.push('Total ' + rep.deadCount + ' dead items me ' + inrPlain(rep.deadValue) +
    ' fasa hai — ye kul inventory value ka ' + rep.deadPct + '% hai.');
  var oldest = rep.dead[0];
  tips.push('Sabse purana dead item: "' + oldest.item.name + '" (' + oldest.daysIdle +
    ' din idle, ' + inrPlain(oldest.value) + ') — isi se clearance shuru karein.');
  if (rep.deadPct >= 30) {
    tips.push('Dead % 30% se zyada hai — turant action lein: discount sale ya bundle offer lagayein, supplier se return/exchange baat karein.');
  } else if (rep.deadPct >= 10) {
    tips.push('Dead % 10–30% hai — slow items par chhota discount ya combo offer try karein, aur aage inki khareed kam karein.');
  } else {
    tips.push('Dead % 10% se kam hai — control me hai; bas in items ki nayi khareed rok dein aur purana stock nikalein.');
  }
  tips.push('Aage se dead stock rokne ke liye: har item ka reorder level set karein (Low Stock Alerts app) aur slow items ka order size chhota rakhein.');
  return tips;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function dsaInit() {
  var SLUG = 'dead-stock-analyzer';
  var SAVE_LIMIT = 25;
  var items = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Dead stock kya hota hai?',
      a: 'Woh maal jo lambe samay (90/180/365 din) se na bika ho, na khareeda gaya ho, na issue hua ho — usme fasa paisa "locked value" kehlata hai.' },
    { q: 'Threshold 90, 180 ya 365 me se kaun sa chunein?',
      a: 'Fast-moving goods (kirana, pharma) ke liye 90 din, general trading ke liye 180, aur machinery/slow items ke liye 365 din theek rehta hai.' },
    { q: 'Dead stock se kaise chhutkara payein?',
      a: 'Discount sale, bundle offer, supplier ko return, staff purchase scheme, ya scrap/liquidation — item ki condition ke hisaab se sabse kam nuksaan wala option chunein.' },
    { q: 'डेड स्टॉक से क्या नुकसान है?',
      a: 'Paisa fasta hai, godown ki jagah ghirti hai, aur kuch items (expiry wale) ki value zero ho jaati hai — isliye dead stock ko jaldi pehchanna zaroori hai.' }
  ]);
  SEO.softwareApp({
    name: 'Dead Stock Analyzer — डेड स्टॉक एनालाइज़र',
    description: 'Free dead stock analyzer for Indian SMEs: aging report, locked value, % of inventory value, clearance suggestions.',
    keywords: ['dead stock', 'डेड स्टॉक', 'dead stock analysis', 'slow moving inventory', 'non moving stock', 'dead stock clearance', 'stock aging report', 'inventory aging India']
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

  function addItem() {
    var err = el('d-error'); err.textContent = '';
    var it = { id: uid('d'), name: el('d-name').value.trim(), lastMove: el('d-move').value,
      qty: parseFloat(el('d-qty').value), unitValue: parseFloat(el('d-val').value) };
    var verr = validateDeadItem(it);
    if (verr) { err.textContent = verr; return; }
    items.push(it);
    el('d-name').value = ''; el('d-move').value = ''; el('d-qty').value = ''; el('d-val').value = '';
    persist().then(renderAll);
  }

  function renderAll() {
    var th = parseInt(el('threshSel').value, 10) || 90;
    var t = today();
    var rep = deadStockReport(items, th, t);

    el('kDead').textContent = rep.deadCount;
    el('kLocked').textContent = inr(rep.deadValue);
    el('kPct').textContent = rep.deadPct + '%';

    el('deadBody').innerHTML = rep.dead.length ? rep.dead.map(function (r) {
      return '<tr class="dead"><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.lastMove) + '</td>' +
        '<td class="r"><strong>' + r.daysIdle + '</strong></td><td class="r">' + r.item.qty + '</td>' +
        '<td class="r">' + inr(r.value) + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del-d" data-id="' + r.item.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="vq-hint">🎉 Threshold ke hisaab se koi dead stock nahi hai.</td></tr>';
    el('deadTotal').textContent = inr(rep.deadValue);

    el('activeBody').innerHTML = rep.active.length ? rep.active.map(function (r) {
      return '<tr><td>' + esc(r.item.name) + '</td><td>' + esc(r.item.lastMove) + '</td>' +
        '<td class="r">' + r.daysIdle + '</td><td class="r">' + inr(r.value) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="vq-hint">Koi active item nahi hai.</td></tr>';

    el('suggestions').innerHTML = clearanceSuggestions(rep).map(function (s) {
      return '<div class="tip">' + esc(s) + '</div>';
    }).join('');

    el('deadBody').querySelectorAll('.del-d').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this item?')) return;
        items = items.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var th = parseInt(el('threshSel').value, 10) || 90;
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), thresholdDays: th,
        report: deadStockReport(items, th, today())
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('d-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addItemBtn').addEventListener('click', addItem);
  el('threshSel').addEventListener('change', renderAll);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.items)) items = d.items;
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
    document.addEventListener('DOMContentLoaded', dsaInit);
  } else { dsaInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, validateDeadItem: validateDeadItem,
    daysIdle: daysIdle, deadStockReport: deadStockReport,
    clearanceSuggestions: clearanceSuggestions };
}
