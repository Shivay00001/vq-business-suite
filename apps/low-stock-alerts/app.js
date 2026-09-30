/* ============================================================
   Low Stock Alerts — pure computation layer.
   Item rows: {key, name, unit, stock, reorderLevel}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

/**
 * Build alert rows from item list.
 * bufferPct: extra % of reorder level added to every suggested order.
 * Returns {outOfStock:[], belowReorder:[], ok:[], noLevel:[]}
 * each alert row: {key,name,unit,stock,reorderLevel,shortfall,suggested}
 */
function alertReport(itemRows, bufferPct) {
  var buf = Math.max(0, Number(bufferPct) || 0);
  var out = { outOfStock: [], belowReorder: [], ok: [], noLevel: [] };
  (itemRows || []).forEach(function (r) {
    var stock = Number(r.stock) || 0;
    var rl = (r.reorderLevel === null || r.reorderLevel === undefined || r.reorderLevel === '')
      ? null : Number(r.reorderLevel);
    if (rl === null || !(rl >= 0)) { out.noLevel.push(r); return; }
    if (stock <= 0) {
      out.outOfStock.push(withSuggest(r, stock, rl, buf));
    } else if (stock < rl) {
      out.belowReorder.push(withSuggest(r, stock, rl, buf));
    } else {
      out.ok.push(r);
    }
  });
  return out;
}

function withSuggest(r, stock, rl, buf) {
  var buffer = Math.ceil(rl * buf / 100);
  var suggested = Math.max(0, round2((rl - stock) + buffer));
  return {
    key: r.key, name: r.name, unit: r.unit, stock: round2(stock),
    reorderLevel: rl, shortfall: round2(Math.max(0, rl - stock)),
    suggested: suggested
  };
}

/** Merge sibling stock-register data → item rows. entries balance computed per item. */
function rowsFromStockRegister(srData, levelOverrides) {
  if (!srData || !Array.isArray(srData.items) || !srData.items.length) return null;
  var levels = levelOverrides || {};
  return srData.items.map(function (it) {
    var bal = 0;
    (srData.entries || []).forEach(function (e) {
      if (e.itemId !== it.id) return;
      var q = Number(e.qty) || 0;
      bal += (e.type === 'in' ? q : -q);
    });
    var rl = (levels[it.id] !== undefined) ? levels[it.id] : it.reorderLevel;
    return { key: 'sr:' + it.id, name: it.name, unit: it.unit, stock: round2(bal), reorderLevel: rl };
  });
}

function rowsFromManual(manualItems) {
  return (manualItems || []).map(function (m) {
    return { key: 'm:' + m.id, name: m.name, unit: m.unit, stock: Number(m.stock) || 0, reorderLevel: m.reorderLevel };
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function lsaInit() {
  var SLUG = 'low-stock-alerts';
  var SAVE_LIMIT = 25;
  var manualItems = [];
  var levelOverrides = {};   // 'sr:<id>' or 'm:<id>' -> reorder level
  var srRows = null;         // rows from stock-register, null when absent
  var mode = 'auto';

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Reorder level kya hota hai?',
      a: 'Reorder level woh minimum stock hai jiske neeche jaate hi order kar dena chahiye — taaki maal kabhi poori tarah khatm na ho.' },
    { q: 'Suggested order quantity kaise nikalti hai?',
      a: 'Suggested order = (Reorder level − Current stock) + Buffer, jahan Buffer = Reorder level × Buffer%. Buffer supplier delay ya achanak demand ke liye safety hai.' },
    { q: 'Kya Stock Register ka data automatic aayega?',
      a: 'Haan — agar aapne Stock Register app me items aur entries daali hain to wahi items aur unka live balance yahan dikhega. Data na ho to manual items add kar sakte hain.' },
    { q: 'लो स्टॉक अलर्ट से क्या फायदा है?',
      a: 'Stock khatm hone se pehle alert milta hai, to sale rukti nahi aur customer khaali haath nahi jaata — aur zaroorat se zyada stock rakhne ka paisa bhi nahi fasta.' }
  ]);
  SEO.softwareApp({
    name: 'Low Stock Alerts — लो स्टॉक अलर्ट',
    description: 'Free low stock alert dashboard for Indian SMEs: reorder levels, below-reorder & out-of-stock lists, suggested order quantity with buffer.',
    keywords: ['low stock alert', 'लो स्टॉक अलर्ट', 'reorder level', 'reorder point', 'out of stock alert', 'stock alert app India', 'minimum stock level']
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
    return Vault.save(SLUG, 'data', {
      manualItems: manualItems, levelOverrides: levelOverrides,
      bufferPct: parseFloat(el('bufPct').value) || 0
    }).catch(function () {});
  }

  function currentRows() {
    if (mode === 'manual') return rowsFromManual(manualItems);
    if (srRows) return srRows.map(function (r) {
      var o = levelOverrides[r.key];
      return o !== undefined ? { key: r.key, name: r.name, unit: r.unit, stock: r.stock, reorderLevel: o } : r;
    });
    return rowsFromManual(manualItems);
  }

  function renderAll() {
    mode = el('dataSrc').value;
    var bufPct = Math.max(0, parseFloat(el('bufPct').value) || 0);
    el('manualCard').style.display = mode === 'manual' ? 'block' : 'none';
    el('rlCard').style.display = 'block';

    var rows = currentRows();
    if (mode === 'auto' && !srRows) {
      el('srcMsg').textContent = '⚠ Stock Register me koi data nahi mila — manual items use ho rahe hain. Stock Register app me items add karein ya yahan manual items daalein.';
    } else if (mode === 'auto') {
      el('srcMsg').textContent = '✓ Stock Register se ' + srRows.length + ' items ka live balance use ho raha hai.';
    } else {
      el('srcMsg').textContent = 'Manual mode: neeche items add karein.';
    }

    var sel = el('rl-item');
    sel.innerHTML = rows.map(function (r) {
      return '<option value="' + esc(r.key) + '">' + esc(r.name) + '</option>';
    }).join('') || '<option value="">— koi item nahi —</option>';

    var rep = alertReport(rows, bufPct);
    var noLvlNote = rep.noLevel.length
      ? '<tr><td colspan="3" class="vq-hint">' + rep.noLevel.length + ' item(s) ka reorder level set nahi hai — "Reorder levels" me set karein.</td></tr>' : '';

    el('oosBody').innerHTML = rep.outOfStock.length ? rep.outOfStock.map(function (r) {
      return '<tr class="crit"><td>' + esc(r.name) + unitHint(r) + '</td><td class="r"><strong>' + r.stock + '</strong></td>' +
        '<td class="r">' + r.reorderLevel + '</td><td class="r"><strong>' + r.suggested + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="4" class="vq-hint">Koi item out of stock nahi hai. 🎉</td></tr>';

    el('lowBody').innerHTML = rep.belowReorder.length ? rep.belowReorder.map(function (r) {
      return '<tr class="low"><td>' + esc(r.name) + unitHint(r) + '</td><td class="r">' + r.stock + '</td>' +
        '<td class="r">' + r.reorderLevel + '</td><td class="r">' + r.shortfall + '</td>' +
        '<td class="r"><strong>' + r.suggested + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="5" class="vq-hint">Koi item reorder level se neeche nahi hai.</td></tr>';

    el('okBody').innerHTML = (rep.ok.length || noLvlNote) ? rep.ok.map(function (r) {
      return '<tr><td>' + esc(r.name) + unitHint(r) + '</td><td class="r">' + r.stock + '</td>' +
        '<td class="r">' + r.reorderLevel + '</td></tr>';
    }).join('') + noLvlNote : '<tr><td colspan="3" class="vq-hint">Koi item nahi hai.</td></tr>';
  }

  function unitHint(r) {
    return r.unit ? '<div class="vq-hint">' + esc(r.unit) + '</div>' : '';
  }

  function addManual() {
    var err = el('m-error'); err.textContent = '';
    var name = el('m-name').value.trim();
    var stock = parseFloat(el('m-stock').value);
    var rl = el('m-reorder').value === '' ? null : parseFloat(el('m-reorder').value);
    if (!name) { err.textContent = 'Item name is required.'; return; }
    if (name.length > 200) { err.textContent = 'Item name too long (max 200 characters).'; return; }
    if (!(stock >= 0 && stock < 1e9)) { err.textContent = 'Current stock must be 0 or more (and realistic).'; return; }
    if (rl !== null && !(rl >= 0 && rl < 1e9)) { err.textContent = 'Reorder level must be 0 or more (and realistic).'; return; }
    var it = { id: uid('m'), name: name, stock: stock, reorderLevel: rl, unit: el('m-unit').value.trim() };
    manualItems.push(it);
    el('m-name').value = ''; el('m-stock').value = ''; el('m-reorder').value = ''; el('m-unit').value = '';
    persist().then(renderAll);
  }

  function saveRl() {
    var key = el('rl-item').value;
    var v = parseFloat(el('rl-val').value);
    if (!key) return;
    if (!(v >= 0)) { el('rl-saved').textContent = 'Reorder level 0 ya zyada hona chahiye.'; return; }
    levelOverrides[key] = v;
    // also push back into stock-register so both apps stay in sync
    Vault.load('stock-register', 'data').then(function (d) {
      if (d && Array.isArray(d.items) && key.indexOf('sr:') === 0) {
        var id = key.slice(3);
        d.items.forEach(function (it) { if (it.id === id) it.reorderLevel = v; });
        return Vault.save('stock-register', 'data', d).catch(function () {});
      }
    }).catch(function () {});
    el('rl-saved').textContent = '✓ Reorder level saved (' + v + ')';
    persist().then(renderAll);
  }

  async function loadSibling() {
    try {
      var d = await Vault.load('stock-register', 'data');
      srRows = rowsFromStockRegister(d, levelOverrides);
    } catch (e) { srRows = null; }
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var bufPct = Math.max(0, parseFloat(el('bufPct').value) || 0);
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), bufferPct: bufPct,
        report: alertReport(currentRows(), bufPct)
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('m-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addManualBtn').addEventListener('click', addManual);
  el('saveRlBtn').addEventListener('click', saveRl);
  el('dataSrc').addEventListener('change', renderAll);
  el('bufPct').addEventListener('change', function () { persist().then(renderAll); });
  el('reloadBtn').addEventListener('click', function () { loadSibling().then(renderAll); });
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d) {
      if (Array.isArray(d.manualItems)) manualItems = d.manualItems;
      if (d.levelOverrides) levelOverrides = d.levelOverrides;
      if (d.bufferPct != null) el('bufPct').value = d.bufferPct;
    }
    return loadSibling();
  }).catch(function () { return loadSibling(); })
    .then(renderAll).catch(renderAll);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lsaInit);
  } else { lsaInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, uid: uid, alertReport: alertReport,
    rowsFromStockRegister: rowsFromStockRegister, rowsFromManual: rowsFromManual };
}
