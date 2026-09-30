/* ============================================================
   VisionQuantech Business Suite — Purchase Budget Control Tool
   apps/purchase-budget-control-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Budgets are set per category per month (YYYY-MM); actual
   spends are logged against them. The monthly report shows
   budget vs actual, variance and spend %, with statuses:
   ok (<80%), watch (80–100%), overrun (>100%). Budgets and
   actuals persist in the on-device vault (max 25 records).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_RECORDS = 25;
  var WATCH_PCT = 80;

  function isMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }

  function validateBudget(b) {
    if (!b || typeof b !== 'object') return { ok: false, error: 'Budget data is required.' };
    if (!isMonth(b.month)) return { ok: false, error: 'Month must be YYYY-MM.' };
    if (!String(b.category || '').trim()) return { ok: false, error: 'Category is required.' };
    if (String(b.category).length > 80) return { ok: false, error: 'Category too long (max 80).' };
    var amt = Number(b.amount);
    if (!isFinite(amt) || amt <= 0) return { ok: false, error: 'Budget amount must be greater than zero.' };
    if (amt > 1e10) return { ok: false, error: 'Budget amount looks too large.' };
    return { ok: true, value: { month: b.month, category: String(b.category).trim(), amount: amt } };
  }

  function validateActual(a) {
    if (!a || typeof a !== 'object') return { ok: false, error: 'Spend data is required.' };
    if (!isDateStr(a.date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    if (!String(a.category || '').trim()) return { ok: false, error: 'Category is required.' };
    if (String(a.category).length > 80) return { ok: false, error: 'Category too long (max 80).' };
    var amt = Number(a.amount);
    if (!isFinite(amt) || amt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (amt > 1e10) return { ok: false, error: 'Amount looks too large.' };
    return {
      ok: true,
      value: {
        date: a.date, month: a.date.slice(0, 7), category: String(a.category).trim(),
        amount: amt, note: String(a.note || '').slice(0, 140)
      }
    };
  }

  /** Merge a budget into a budgets array (replace same month+category). */
  function setBudget(budgets, b) {
    var v = validateBudget(b);
    if (!v.ok) return v;
    var list = (budgets || []).filter(function (x) {
      return !(x.month === v.value.month && x.category.toLowerCase() === v.value.category.toLowerCase());
    });
    list.push(v.value);
    if (list.length > MAX_RECORDS) return { ok: false, error: 'Budget list is full (max ' + MAX_RECORDS + ').' };
    return { ok: true, value: list };
  }

  function addActual(actuals, a) {
    var v = validateActual(a);
    if (!v.ok) return v;
    var list = (actuals || []).slice();
    list.push(v.value);
    if (list.length > MAX_RECORDS) return { ok: false, error: 'Spend list is full (max ' + MAX_RECORDS + ').' };
    return { ok: true, value: list };
  }

  function statusFor(pct) {
    if (pct > 100) return 'overrun';
    if (pct >= WATCH_PCT) return 'watch';
    return 'ok';
  }

  /** Monthly budget-vs-actual report. Categories with spend but no budget appear as "no budget". */
  function monthReport(budgets, actuals, month) {
    if (!isMonth(month)) return { ok: false, error: 'Month must be YYYY-MM.' };
    var cats = {};
    (budgets || []).forEach(function (b) {
      if (b.month === month) cats[b.category] = { category: b.category, budget: Number(b.amount), actual: 0 };
    });
    (actuals || []).forEach(function (a) {
      if (a.month === month) {
        var key = Object.keys(cats).filter(function (k) { return k.toLowerCase() === a.category.toLowerCase(); })[0];
        if (!key) { key = a.category; cats[key] = { category: a.category, budget: 0, actual: 0 }; }
        cats[key].actual += Number(a.amount);
      }
    });
    var rows = Object.keys(cats).sort().map(function (k) {
      var c = cats[k];
      var variance = Math.round((c.budget - c.actual) * 100) / 100;
      var pct = c.budget > 0 ? Math.round((c.actual / c.budget) * 1000) / 10 : (c.actual > 0 ? Infinity : 0);
      return {
        category: c.category, budget: c.budget, actual: Math.round(c.actual * 100) / 100,
        variance: variance, pct: pct, status: c.budget > 0 ? statusFor(pct) : 'no-budget'
      };
    });
    var tb = rows.reduce(function (s, r) { return s + r.budget; }, 0);
    var ta = rows.reduce(function (s, r) { return s + r.actual; }, 0);
    var overruns = rows.filter(function (r) { return r.status === 'overrun' || r.status === 'no-budget'; }).length;
    var watches = rows.filter(function (r) { return r.status === 'watch'; }).length;
    return {
      ok: true, month: month, rows: rows,
      totalBudget: Math.round(tb * 100) / 100, totalActual: Math.round(ta * 100) / 100,
      totalVariance: Math.round((tb - ta) * 100) / 100,
      overruns: overruns, watches: watches
    };
  }

  function monthsWithData(budgets, actuals) {
    var set = {};
    (budgets || []).forEach(function (b) { set[b.month] = 1; });
    (actuals || []).forEach(function (a) { set[a.month] = 1; });
    return Object.keys(set).sort().reverse();
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_RECORDS: MAX_RECORDS, WATCH_PCT: WATCH_PCT,
    isMonth: isMonth, isDateStr: isDateStr,
    validateBudget: validateBudget, validateActual: validateActual,
    setBudget: setBudget, addActual: addActual,
    statusFor: statusFor, monthReport: monthReport,
    monthsWithData: monthsWithData, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'purchase-budget-control-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('d-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function thisMonth() { return new Date().toISOString().slice(0, 7); }

  async function loadData() {
    try {
      return {
        budgets: (await Vault.load(SLUG, 'budgets')) || [],
        actuals: (await Vault.load(SLUG, 'actuals')) || []
      };
    } catch (e) { return { budgets: [], actuals: [] }; }
  }

  function statusBadge(st) {
    var map = {
      'ok': '<span class="a-badge a-ok">On track</span>',
      'watch': '<span class="a-badge a-wait">Watch ≥80%</span>',
      'overrun': '<span class="a-badge a-bad">Overrun</span>',
      'no-budget': '<span class="a-badge a-bad">No budget</span>'
    };
    return map[st] || '';
  }

  async function renderReport() {
    var data = await loadData();
    var months = monthsWithData(data.budgets, data.actuals);
    var sel = $('d-month');
    var cur = sel.value || thisMonth();
    sel.innerHTML = months.length
      ? months.map(function (m) { return '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + m + '</option>'; }).join('')
      : '<option value="' + thisMonth() + '">' + thisMonth() + '</option>';
    var month = sel.value;
    var r = monthReport(data.budgets, data.actuals, month);
    if (!r.ok) { $('d-report').innerHTML = '<p class="msg-err">' + esc(r.error) + '</p>'; return; }
    var rows = r.rows.map(function (row) {
      var bar = row.budget > 0 ? '<div class="s-bar"><div class="s-fill' + (row.status === 'overrun' ? ' s-over' : '') + '" style="width:' + Math.min(100, row.pct) + '%"></div></div>' : '';
      return '<tr><td><strong>' + esc(row.category) + '</strong></td><td class="num">' + fmtINR(row.budget) + '</td>' +
        '<td class="num">' + fmtINR(row.actual) + '</td><td class="num">' + fmtINR(row.variance) + '</td>' +
        '<td>' + bar + '<span class="vq-hint">' + (row.pct === Infinity ? '∞' : row.pct + '%') + '</span></td>' +
        '<td>' + statusBadge(row.status) + '</td></tr>';
    }).join('');
    $('d-report').innerHTML =
      '<div class="t-cards">' +
      '<div class="t-card"><span class="vq-hint">Total budget</span><strong>' + fmtINR(r.totalBudget) + '</strong></div>' +
      '<div class="t-card"><span class="vq-hint">Total actual</span><strong>' + fmtINR(r.totalActual) + '</strong></div>' +
      '<div class="t-card"><span class="vq-hint">Variance</span><strong>' + fmtINR(r.totalVariance) + '</strong></div>' +
      '<div class="t-card t-warn"><span class="vq-hint">Alerts</span><strong>' + r.overruns + ' overrun · ' + r.watches + ' watch</strong></div>' +
      '</div>' +
      (r.rows.length
        ? '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Category</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">Variance</th><th>Spend</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="vq-hint">No budgets or spends for ' + esc(month) + ' yet.</p>');
  }

  function init() {
    Ads.render($('ad-top'), 'purchase-budget-control-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'purchase-budget-control-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I control purchase budgets by category?', a: 'Set a monthly budget per category (e.g. Raw material — 2026-10 — ₹2,00,000), then log each spend against its category. The report shows budget vs actual, variance and spend %, with watch (≥80%) and overrun (>100%) alerts.' },
      { q: 'खरीद बजट कैसे कंट्रोल करें?', a: 'हर कैटेगरी के लिए मासिक बजट सेट करें, फिर हर खर्च उसी कैटेगरी में दर्ज करें — रिपोर्ट बजट बनाम वास्तविक, अंतर और खर्च % दिखाएगी, 80% पर वॉच और 100% से ऊपर ओवररन अलर्ट के साथ।' },
      { q: 'What do the watch and overrun alerts mean?', a: 'Watch means the category has spent 80–100% of its budget — a heads-up before it tips over. Overrun means actual spend exceeded the budget. Spend with no budget set is also flagged.' },
      { q: 'वॉच और ओवररन अलर्ट का क्या मतलब है?', a: 'वॉच = बजट का 80–100% खर्च हो गया। ओवररन = खर्च बजट से ज़्यादा हो गया। बिना बजट वाला खर्च भी फ़्लैग होता है।' },
      { q: 'Can a category have spends in a month with no budget?', a: 'Yes — it appears in the report as "No budget" with its total, so unbudgeted spending is visible instead of hidden.' },
      { q: 'Is my budget data stored online?', a: 'No. Up to 25 budgets and 25 spends are saved in your browser vault on this device only.' }
    ]);

    $('d-bmonth').value = thisMonth();
    $('d-adate').value = new Date().toISOString().slice(0, 10);
    renderReport();

    $('d-month').addEventListener('change', renderReport);

    $('d-set').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var data = await loadData();
      var r = setBudget(data.budgets, { month: $('d-bmonth').value, category: $('d-bcat').value, amount: $('d-bamt').value });
      if (!r.ok) { msg(r.error, false); return; }
      await Vault.save(SLUG, 'budgets', r.value);
      msg('Budget saved.', true);
      $('d-bcat').value = ''; $('d-bamt').value = '';
      renderReport();
    });

    $('d-log').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var data = await loadData();
      var r = addActual(data.actuals, { date: $('d-adate').value, category: $('d-acat').value, amount: $('d-aamt').value, note: $('d-anote').value });
      if (!r.ok) { msg(r.error, false); return; }
      await Vault.save(SLUG, 'actuals', r.value);
      msg('Spend logged.', true);
      $('d-acat').value = ''; $('d-aamt').value = ''; $('d-anote').value = '';
      renderReport();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
