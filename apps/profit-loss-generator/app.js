/* ============================================================
   Profit & Loss Generator — pure computation layer.
   Statement structure:
     Revenue (all income)
     - COGS                      = Gross profit (gross margin %)
     - Operating expenses (all other expenses)
                                 = Net profit (net margin %)
   DOM-free; unit-testable in node.
   ============================================================ */

var INCOME_CATS = ['Sales / revenue', 'Service income', 'Other income'];
var EXPENSE_CATS = ['COGS (cost of goods sold)', 'Salaries & wages', 'Rent',
  'Utilities', 'Marketing & ads', 'Transport & logistics',
  'Repairs & maintenance', 'Professional fees', 'Other operating expenses'];

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

/** Indian FY label for a date: '2026-27'. */
function fyOf(dateISO) {
  var d = new Date((dateISO || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) d = new Date();
  var y = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 4 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2);
}

/** Last `n` FY labels ending with the current one. */
function fyList(n) {
  n = n || 5;
  var cur = fyOf(new Date().toISOString().slice(0, 10));
  var start = parseInt(cur.slice(0, 4), 10) - (n - 1);
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push(start + i + '-' + String(start + i + 1).slice(2));
  }
  return out;
}

/** Validate an entry; returns error string or ''. */
function validateEntry(e) {
  if (!e || (e.type !== 'income' && e.type !== 'expense')) return 'Type must be income or expense.';
  if (!(Number(e.amount) > 0)) return 'Amount must be greater than 0.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'Date is required.';
  return '';
}

/**
 * Summarise entries for one FY.
 * entries: [{type, category, desc, amount, date}]
 * Returns statement object with margins (0 when revenue is 0).
 */
function summarize(entries, fy) {
  var s = {
    fy: fy, revenue: 0, otherIncome: 0, cogs: 0, opex: 0,
    grossProfit: 0, netProfit: 0, grossMargin: 0, netMargin: 0,
    byCategory: {}, monthly: []
  };
  for (var m = 0; m < 12; m++) s.monthly.push({ income: 0, expense: 0 });

  (entries || []).forEach(function (e) {
    if (fyOf(e.date) !== fy) return;
    var amt = round2(Number(e.amount) || 0);
    if (!(amt > 0)) return;
    var mi = monthIndexOf(e.date);
    if (e.type === 'income') {
      s.revenue = round2(s.revenue + amt);
      if (mi >= 0) s.monthly[mi].income = round2(s.monthly[mi].income + amt);
    } else {
      if (mi >= 0) s.monthly[mi].expense = round2(s.monthly[mi].expense + amt);
      if (String(e.category).indexOf('COGS') === 0) s.cogs = round2(s.cogs + amt);
      else s.opex = round2(s.opex + amt);
    }
    var key = e.type + '|' + (e.category || 'Other');
    s.byCategory[key] = round2((s.byCategory[key] || 0) + amt);
  });

  s.grossProfit = round2(s.revenue - s.cogs);
  s.netProfit = round2(s.revenue - s.cogs - s.opex);
  if (s.revenue > 0) {
    s.grossMargin = round2(s.grossProfit / s.revenue * 100);
    s.netMargin = round2(s.netProfit / s.revenue * 100);
  }
  return s;
}

/** 0-based index of month within its FY (Apr=0 .. Mar=11). */
function monthIndexOf(dateISO) {
  var d = new Date(String(dateISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return -1;
  return (d.getMonth() + 9) % 12;
}

var FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

/**
 * Pure-SVG grouped bar chart: monthly income vs expense.
 * Returns an SVG string (no DOM needed).
 */
function plChartSVG(monthly, opts) {
  opts = opts || {};
  var W = 560, H = 260, padL = 46, padB = 30, padT = 14;
  var maxV = 1;
  monthly.forEach(function (r) {
    maxV = Math.max(maxV, r.income, r.expense);
  });
  var innerW = W - padL - 8, innerH = H - padT - padB;
  var gw = innerW / 12, bw = Math.min(16, (gw - 8) / 2);
  function y(v) { return padT + innerH - (v / maxV) * innerH; }

  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="Monthly income vs expense bar chart" style="width:100%;height:auto">';
  // gridlines + y labels
  for (var g = 0; g <= 4; g++) {
    var gv = maxV * g / 4, gy = y(gv);
    s += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + W + '" y2="' + gy.toFixed(1) +
      '" stroke="#e5e7eb"/>';
    s += '<text x="' + (padL - 5) + '" y="' + (gy + 4).toFixed(1) +
      '" font-size="10" text-anchor="end" fill="#6b7280">' + shortNum(gv) + '</text>';
  }
  monthly.forEach(function (r, i) {
    var x = padL + i * gw + (gw - bw * 2 - 4) / 2;
    var ih = (r.income / maxV) * innerH, eh = (r.expense / maxV) * innerH;
    s += '<rect x="' + x.toFixed(1) + '" y="' + (padT + innerH - ih).toFixed(1) +
      '" width="' + bw + '" height="' + ih.toFixed(1) + '" fill="#2563eb" rx="2">' +
      '<title>' + FY_MONTHS[i] + ' income ' + inrPlain(r.income) + '</title></rect>';
    s += '<rect x="' + (x + bw + 4).toFixed(1) + '" y="' + (padT + innerH - eh).toFixed(1) +
      '" width="' + bw + '" height="' + eh.toFixed(1) + '" fill="#dc2626" rx="2">' +
      '<title>' + FY_MONTHS[i] + ' expense ' + inrPlain(r.expense) + '</title></rect>';
    s += '<text x="' + (padL + i * gw + gw / 2).toFixed(1) + '" y="' + (H - 10) +
      '" font-size="10" text-anchor="middle" fill="#6b7280">' + FY_MONTHS[i] + '</text>';
  });
  s += '<rect x="' + (padL + 4) + '" y="2" width="10" height="10" fill="#2563eb"/>' +
    '<text x="' + (padL + 18) + '" y="11" font-size="11" fill="#374151">Income</text>' +
    '<rect x="' + (padL + 78) + '" y="2" width="10" height="10" fill="#dc2626"/>' +
    '<text x="' + (padL + 92) + '" y="11" font-size="11" fill="#374151">Expense</text>';
  s += '</svg>';
  return s;
}

function shortNum(v) {
  if (v >= 1e7) return (v / 1e7).toFixed(1) + 'cr';
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(Math.round(v));
}
function inrPlain(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function plInit() {
  var SLUG = 'profit-loss-generator';
  var SAVE_LIMIT = 25; // report snapshots per day
  var entries = [];
  var editingId = null;

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Profit and loss statement kaise banaye? (How to make a P&L statement?)',
      a: 'Apni income aur expense entries add karein (category + date ke saath), financial year chunein — app automatic P&L statement banata hai: gross profit, operating expenses, net profit aur margins ke saath. Report save karke print/PDF bhi le sakte hain.' },
    { q: 'Gross profit aur net profit me kya farak hai?',
      a: 'Gross profit = Revenue − COGS (maal ki seedhi lagat). Net profit = Gross profit − saare operating expenses (rent, salary, marketing aadi). Dono ke margins revenue ke % me dikhaye jate hain.' },
    { q: 'Kya purani entries edit/delete ho sakti hain?',
      a: 'Haan — har row ke saath Edit aur Delete button hai. Saari entries aapke browser me save rehti hain.' },
    { q: 'Kya mera financial data safe hai?',
      a: 'Haan — saara data sirf aapke device ke browser me store hota hai, kahin upload nahi hota. Vault passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Profit & Loss Statement Generator — प्रॉफिट लॉस स्टेटमेंट',
    description: 'Free P&L generator for Indian SMEs: income/expense entries with categories, automatic profit & loss statement, margins, monthly chart, print/PDF.',
    keywords: ['profit and loss statement', 'प्रॉफिट लॉस स्टेटमेंट', 'P&L generator India', 'income expense tracker', 'vyapar hisab kitab', 'small business accounting free']
  });

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function currentFY() { return el('fySel').value; }

  function refreshCats() {
    var type = document.querySelector('input[name="etype"]:checked').value;
    var cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    el('eCat').innerHTML = cats.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
  }

  function persist() {
    return Vault.save(SLUG, 'entries', entries).catch(function () {});
  }

  function addOrUpdate() {
    var err = el('pl-error'); err.textContent = '';
    var e = {
      id: editingId || uid(),
      type: document.querySelector('input[name="etype"]:checked').value,
      category: el('eCat').value,
      desc: el('eDesc').value.trim(),
      amount: parseFloat(el('eAmt').value) || 0,
      date: el('eDate').value
    };
    var verr = validateEntry(e);
    if (verr) { err.textContent = verr; return; }
    if (editingId) {
      entries = entries.map(function (x) { return x.id === editingId ? e : x; });
      editingId = null;
      el('addBtn').textContent = 'Add entry';
    } else {
      entries.push(e);
    }
    el('eDesc').value = ''; el('eAmt').value = '';
    persist().then(renderAll);
  }

  function renderEntries() {
    var fy = currentFY();
    var rows = entries
      .filter(function (e) { return fyOf(e.date) === fy; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!rows.length) {
      el('entriesBody').innerHTML = '<tr><td colspan="6" class="vq-hint">No entries for this FY yet — add your first income/expense above.</td></tr>';
      return;
    }
    el('entriesBody').innerHTML = rows.map(function (e) {
      return '<tr><td>' + esc(e.date) + '</td>' +
        '<td><span class="pill ' + (e.type === 'income' ? 'p-in' : 'p-out') + '">' +
        (e.type === 'income' ? 'Income' : 'Expense') + '</span></td>' +
        '<td>' + esc(e.category) + '</td><td>' + esc(e.desc || '—') + '</td>' +
        '<td class="r">' + inrPlain(e.amount) + '</td>' +
        '<td><button class="vq-btn ghost mini e-edit" data-id="' + e.id + '">Edit</button> ' +
        '<button class="vq-btn ghost mini e-del" data-id="' + e.id + '">Delete</button></td></tr>';
    }).join('');
    el('entriesBody').querySelectorAll('.e-edit').forEach(function (b) {
      b.addEventListener('click', function () {
        var e = entries.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        if (!e) return;
        editingId = e.id;
        document.querySelector('input[name="etype"][value="' + e.type + '"]').checked = true;
        refreshCats();
        el('eCat').value = e.category;
        el('eDesc').value = e.desc || '';
        el('eAmt').value = e.amount;
        el('eDate').value = e.date;
        el('addBtn').textContent = 'Update entry';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    el('entriesBody').querySelectorAll('.e-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this entry?')) return;
        entries = entries.filter(function (x) { return x.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  function renderStatement() {
    var fy = currentFY();
    var s = summarize(entries, fy);
    el('plFY').textContent = 'FY ' + fy;
    function row(label, val, bold, pct) {
      return '<tr' + (bold ? ' class="grand"' : '') + '><td>' + label +
        (pct != null ? ' <span class="pct">(' + pct + '%)</span>' : '') +
        '</td><td class="r">' + inrPlain(val) + '</td></tr>';
    }
    el('plBody').innerHTML =
      row('Total revenue', s.revenue, true) +
      row('Less: COGS', s.cogs) +
      row('Gross profit', s.grossProfit, true, s.grossMargin) +
      row('Less: Operating expenses', s.opex) +
      row('Net profit', s.netProfit, true, s.netMargin);
    el('plChart').innerHTML = plChartSVG(s.monthly);
    el('plNote').textContent = s.revenue > 0
      ? 'FY ' + fy + ': har ₹100 revenue par ₹' + s.netMargin + ' net profit bachta hai.'
      : 'Is FY me abhi koi income entry nahi hai.';
  }

  function renderAll() { renderEntries(); renderStatement(); }

  async function saveReport() {
    var err = el('pl-error'); err.textContent = '';
    el('pl-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('pl-upsell'), SLUG, SAVE_LIMIT);
      return;
    }
    var fy = currentFY();
    var s = summarize(entries, fy);
    var key = 'report-' + fy + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, { fy: fy, summary: s, savedAt: new Date().toISOString() });
      el('pl-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { err.textContent = 'Save failed: ' + e.message; }
  }

  // events
  el('addBtn').addEventListener('click', addOrUpdate);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });
  el('fySel').addEventListener('change', renderAll);
  document.querySelectorAll('input[name="etype"]').forEach(function (r) {
    r.addEventListener('change', refreshCats);
  });

  // init
  el('fySel').innerHTML = fyList(5).map(function (f) {
    return '<option' + (f === fyOf(new Date().toISOString().slice(0, 10)) ? ' selected' : '') +
      '>' + f + '</option>';
  }).join('');
  el('eDate').value = new Date().toISOString().slice(0, 10);
  refreshCats();
  Vault.load(SLUG, 'entries').then(function (d) {
    if (Array.isArray(d)) entries = d;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', plInit);
  } else { plInit(); }
}
