/* ============================================================
   Expense Tracker — pure computation layer.
   expenses: {id, date, category, amount, note}
   budgets: {category: amount} (monthly, applies to every month)
   DOM-free; unit-testable in node.
   ============================================================ */

var CATS = ['Rent', 'Salaries', 'Utilities', 'Travel', 'Other'];
var CAT_COLORS = {
  'Rent': '#2563eb', 'Salaries': '#16a34a', 'Utilities': '#f59e0b',
  'Travel': '#8b5cf6', 'Other': '#64748b'
};

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateExpense(e) {
  if (!e || CATS.indexOf(e.category) < 0) return 'Please pick a valid category.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'Date is required.';
  if (!(Number(e.amount) > 0)) return 'Amount must be greater than 0.';
  return '';
}

/** {category: total} for month 'YYYY-MM'. */
function categoryTotals(expenses, ym) {
  var t = {};
  CATS.forEach(function (c) { t[c] = 0; });
  (expenses || []).forEach(function (e) {
    if (String(e.date).slice(0, 7) !== ym) return;
    if (CATS.indexOf(e.category) < 0) return;
    t[e.category] = round2(t[e.category] + round2(Number(e.amount) || 0));
  });
  return t;
}

function monthTotal(expenses, ym) {
  var t = categoryTotals(expenses, ym), s = 0;
  CATS.forEach(function (c) { s = round2(s + t[c]); });
  return s;
}

/** Budget-vs-actual rows: [{category, budget, actual, remaining, overspent, pct}] */
function budgetVsActual(expenses, budgets, ym) {
  var t = categoryTotals(expenses, ym);
  return CATS.map(function (c) {
    var budget = round2(Number((budgets || {})[c]) || 0);
    var actual = t[c];
    return {
      category: c, budget: budget, actual: actual,
      remaining: round2(budget - actual),
      overspent: budget > 0 && actual > budget,
      pct: budget > 0 ? round2(actual / budget * 100) : null
    };
  });
}

/* ---- pure-SVG charts ---- */

function pieSVG(totals) {
  var items = CATS.map(function (c) { return { label: c, value: totals[c] || 0, color: CAT_COLORS[c] }; })
    .filter(function (i) { return i.value > 0; });
  var total = items.reduce(function (s, i) { return s + i.value; }, 0);
  var cx = 110, cy = 110, r = 90;
  var s = '<svg viewBox="0 0 220 220" role="img" aria-label="Expense share by category" style="width:100%;max-width:260px;height:auto">';
  if (!total) {
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#f1f5f9"/>' +
      '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="12" fill="#94a3b8">No data</text></svg>';
    return s;
  }
  var a0 = -Math.PI / 2;
  items.forEach(function (it) {
    var a1 = a0 + (it.value / total) * Math.PI * 2;
    var big = (a1 - a0) > Math.PI ? 1 : 0;
    var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    s += '<path d="M' + cx + ',' + cy + ' L' + x0.toFixed(1) + ',' + y0.toFixed(1) +
      ' A' + r + ',' + r + ' 0 ' + big + ' 1 ' + x1.toFixed(1) + ',' + y1.toFixed(1) +
      ' Z" fill="' + it.color + '" stroke="#fff" stroke-width="2">' +
      '<title>' + it.label + ': ' + inrPlain(it.value) + '</title></path>';
    a0 = a1;
  });
  s += '</svg>';
  return s;
}

function barSVG(totals) {
  var W = 560, H = 240, padL = 46, padB = 26, padT = 10;
  var maxV = 1;
  CATS.forEach(function (c) { maxV = Math.max(maxV, totals[c] || 0); });
  var innerW = W - padL - 10, innerH = H - padT - padB;
  var bw = Math.min(52, innerW / CATS.length - 24);
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Expense totals by category" style="width:100%;height:auto">';
  for (var g = 0; g <= 4; g++) {
    var gv = maxV * g / 4, gy = (padT + innerH - (gv / maxV) * innerH).toFixed(1);
    s += '<line x1="' + padL + '" y1="' + gy + '" x2="' + W + '" y2="' + gy + '" stroke="#e5e7eb"/>' +
      '<text x="' + (padL - 5) + '" y="' + (+gy + 4) + '" font-size="10" text-anchor="end" fill="#6b7280">' + shortNum(gv) + '</text>';
  }
  CATS.forEach(function (c, i) {
    var v = totals[c] || 0, h = (v / maxV) * innerH;
    var x = (padL + i * (innerW / CATS.length) + (innerW / CATS.length - bw) / 2).toFixed(1);
    s += '<rect x="' + x + '" y="' + (padT + innerH - h).toFixed(1) + '" width="' + bw +
      '" height="' + h.toFixed(1) + '" fill="' + CAT_COLORS[c] + '" rx="3">' +
      '<title>' + c + ': ' + inrPlain(v) + '</title></rect>' +
      '<text x="' + (+x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#6b7280">' + c + '</text>';
  });
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
function inr(n) { return inrPlain(n); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function exInit() {
  var SLUG = 'expense-tracker';
  var SAVE_LIMIT = 25; // report snapshots per day
  var expenses = [];
  var budgets = {};

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function thisMonth() { return today().slice(0, 7); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Expense tracker kaise use karein?',
      a: 'Har kharcha category (rent, salaries, utilities, travel, other) ke saath darj karein. App monthly totals, pie/bar charts aur budget-vs-actual report automatic banata hai.' },
    { q: 'Overspend alert kya hai?',
      a: 'Agar kisi category ka kharcha uske monthly budget se zyada ho jaye to alert lagta hai — taaki samay par kharchon par lagam lag sake.' },
    { q: 'Budget kaise set karein?',
      a: '"Set monthly budgets" me category chunein aur monthly budget amount darj karein. Budget har mahine same rehta hai jab tak badlein nahi.' },
    { q: 'खर्च ट्रैकर क्या होता है?',
      a: 'Expense tracker me business ke saare kharchon ka category-wise hisaab rehta hai — isse pata chalta hai paisa kahan ja raha hai aur budget se zyada to nahi kharch ho raha.' }
  ]);
  SEO.softwareApp({
    name: 'Expense Tracker — खर्च ट्रैकर बजट अलर्ट',
    description: 'Free expense tracker for Indian SMEs: categorized expenses, monthly totals, pie & bar charts, budget-vs-actual with overspend alerts.',
    keywords: ['expense tracker', 'खर्च ट्रैकर', 'business expense tracker India', 'budget vs actual', 'overspend alert', 'monthly expense report']
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
    return Vault.save(SLUG, 'expenses', { expenses: expenses, budgets: budgets })
      .catch(function () {});
  }

  function addExpense() {
    var err = el('e-error'); err.textContent = '';
    var e = {
      id: uid('e'), category: el('e-cat').value, date: el('e-date').value,
      amount: parseFloat(el('e-amount').value) || 0, note: el('e-note').value.trim()
    };
    var verr = validateExpense(e);
    if (verr) { err.textContent = verr; return; }
    expenses.push(e);
    el('e-amount').value = ''; el('e-note').value = '';
    persist().then(renderAll);
  }

  function saveBudget() {
    var cat = el('b-cat').value, amt = parseFloat(el('b-amount').value);
    if (!(amt >= 0)) { el('b-saved').textContent = ''; el('e-error').textContent = 'Budget 0 ya zyada hona chahiye.'; return; }
    budgets[cat] = round2(amt);
    el('b-saved').textContent = cat + ' budget ' + inr(amt) + '/month set ✓';
    persist().then(renderAll);
  }

  function renderAll() {
    var ym = el('monthSel').value || thisMonth();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var p = ym.split('-');
    el('exMonth').textContent = months[parseInt(p[1], 10) - 1] + ' ' + p[0];

    var totals = categoryTotals(expenses, ym);
    el('exTotal').textContent = inr(monthTotal(expenses, ym));
    el('pieChart').innerHTML = pieSVG(totals);
    el('pieLegend').innerHTML = CATS.map(function (c) {
      return '<span><span class="sw" style="background:' + CAT_COLORS[c] + '"></span>' +
        c + ' — ' + inr(totals[c]) + '</span>';
    }).join('');
    el('barChart').innerHTML = barSVG(totals);

    var rows = budgetVsActual(expenses, budgets, ym);
    el('budgetBody').innerHTML = rows.map(function (r) {
      var status;
      if (r.budget <= 0) status = '<span class="vq-hint">No budget set</span>';
      else if (r.overspent) status = '<span class="pill p-out">⚠ Overspent ' + r.pct + '%</span>';
      else if (r.pct >= 80) status = '<span class="pill p-warn">' + r.pct + '% used</span>';
      else status = '<span class="pill p-in">' + r.pct + '% used</span>';
      return '<tr' + (r.overspent ? ' class="over"' : '') + '><td>' + r.category + '</td>' +
        '<td class="r">' + (r.budget > 0 ? inr(r.budget) : '—') + '</td>' +
        '<td class="r">' + inr(r.actual) + '</td>' +
        '<td class="r">' + (r.budget > 0 ? inr(r.remaining) : '—') + '</td>' +
        '<td>' + status + '</td></tr>';
    }).join('');

    var rows2 = expenses
      .filter(function (e) { return String(e.date).slice(0, 7) === ym; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    el('entriesBody').innerHTML = rows2.length ? rows2.map(function (e) {
      return '<tr><td>' + esc(e.date) + '</td><td>' + esc(e.category) + '</td>' +
        '<td>' + esc(e.note || '—') + '</td><td class="r">' + inr(e.amount) + '</td>' +
        '<td class="no-print"><button class="vq-btn ghost mini del" data-id="' + e.id + '">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="vq-hint">Is mahine me koi expense nahi hai.</td></tr>';
    el('entriesBody').querySelectorAll('.del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this expense?')) return;
        expenses = expenses.filter(function (e) { return e.id !== b.getAttribute('data-id'); });
        persist().then(renderAll);
      });
    });
  }

  async function saveReport() {
    el('ex-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('ex-upsell'), SLUG, SAVE_LIMIT); return; }
    var ym = el('monthSel').value || thisMonth();
    var key = 'report-' + ym + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        month: ym, totals: categoryTotals(expenses, ym),
        total: monthTotal(expenses, ym),
        budgetVsActual: budgetVsActual(expenses, budgets, ym),
        savedAt: new Date().toISOString()
      });
      el('ex-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('e-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addBtn').addEventListener('click', addExpense);
  el('saveBudgetBtn').addEventListener('click', saveBudget);
  el('monthSel').addEventListener('change', renderAll);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('e-date').value = today();
  el('monthSel').value = thisMonth();
  Vault.load(SLUG, 'expenses').then(function (d) {
    if (d && Array.isArray(d.expenses)) expenses = d.expenses;
    if (d && d.budgets) budgets = d.budgets;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', exInit);
  } else { exInit(); }
}
