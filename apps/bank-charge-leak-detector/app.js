/* ============================================================
   VisionQuantech Business Suite — Bank Charge Leak Detector
   apps/bank-charge-leak-detector/app.js

   Pure functions first (no DOM) — tested under node.
   Enter bank charges by type and month; the tool benchmarks each
   type against typical monthly ranges for an Indian SME current
   account, flags anomalies, and totals the annual leak.
   Benchmarks are broad ranges drawn from public bank fee
   schedules (Sep 2026) — actuals vary by bank; verify against
   your bank's Schedule of Charges. Stated on screen.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  // Typical MONTHLY range (INR) for a small Indian business current account.
  var BENCHMARKS = [
    { id: 'sms',          label: 'SMS alert charges',              low: 15,  high: 30 },
    { id: 'cash-handling',label: 'Cash deposit / handling charges', low: 0,  high: 500 },
    { id: 'cheque-dd',    label: 'Cheque book / DD issuance',      low: 0,   high: 300 },
    { id: 'digital-txn',  label: 'NEFT / RTGS / IMPS charges',     low: 0,   high: 200 },
    { id: 'balance-penalty', label: 'Min-balance non-maintenance penalty', low: 0, high: 0 },
    { id: 'card-amc',     label: 'Debit card AMC (monthly share)', low: 0,   high: 30 },
    { id: 'pos-rental',   label: 'POS / EDC machine rental',       low: 0,   high: 400 },
    { id: 'statements',   label: 'Statement / physical copy charges', low: 0, high: 100 },
    { id: 'bounce',       label: 'ECS / NACH / cheque bounce charges', low: 0, high: 0 },
    { id: 'forex',        label: 'Forex markup / remittance charges', low: 0, high: 0 },
    { id: 'others',       label: 'Other / miscellaneous charges',  low: 0,   high: 1000 }
  ];

  var MAX_AMOUNT = 100000000;
  var MAX_ENTRIES = 240; // 10 types x 24 months

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function benchById(id) {
    for (var i = 0; i < BENCHMARKS.length; i++) if (BENCHMARKS[i].id === id) return BENCHMARKS[i];
    return null;
  }

  function validateMonth(s) {
    s = trim(s);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { ok: false, error: 'Month must be YYYY-MM.' };
    var y = +s.slice(0, 4);
    if (y < 2000 || y > 2100) return { ok: false, error: 'Year out of range.' };
    return { ok: true, value: s };
  }

  function validateEntry(e) {
    e = e || {};
    var b = benchById(e.type);
    if (!b) return { ok: false, error: 'Unknown charge type.' };
    var mp = validateMonth(e.month);
    if (!mp.ok) return mp;
    var amt = Number(e.amount);
    if (!isFinite(amt)) return { ok: false, error: 'Enter a valid amount.' };
    if (amt < 0) return { ok: false, error: 'Charge amount cannot be negative.' };
    if (amt > MAX_AMOUNT) return { ok: false, error: 'Amount looks too large.' };
    return { ok: true, entry: { type: b.id, month: mp.value, amount: Math.round(amt * 100) / 100 } };
  }

  /**
   * Analyze entries [{type, month, amount}].
   * Returns {ok, perType:[{id,label,months,total,avg,low,high,verdict}],
   *          monthsCovered, grandTotal, annualized, flags:[...]}.
   * verdict: 'ok' (within range), 'watch' (above high but < 2x high),
   *          'flag' (>= 2x high, or any charge on a zero-benchmark type).
   */
  function analyze(entries) {
    if (!Array.isArray(entries)) return { ok: false, error: 'Internal error: entries must be an array.' };
    if (!entries.length) return { ok: false, error: 'Add at least one charge entry.' };
    if (entries.length > MAX_ENTRIES) return { ok: false, error: 'Too many entries (max ' + MAX_ENTRIES + ').' };
    var seen = {}, months = {};
    var byType = {};
    for (var i = 0; i < entries.length; i++) {
      var v = validateEntry(entries[i]);
      if (!v.ok) return { ok: false, error: 'Entry ' + (i + 1) + ': ' + v.error };
      var e = v.entry;
      var key = e.type + '|' + e.month;
      if (seen[key]) return { ok: false, error: 'Entry ' + (i + 1) + ': duplicate type+month — merge into one amount.' };
      seen[key] = true;
      months[e.month] = true;
      if (!byType[e.type]) byType[e.type] = { total: 0, count: 0 };
      byType[e.type].total = Math.round((byType[e.type].total + e.amount) * 100) / 100;
      byType[e.type].count++;
    }
    var perType = [], flags = [], grandTotal = 0;
    for (var t = 0; t < BENCHMARKS.length; t++) {
      var b = BENCHMARKS[t];
      var agg = byType[b.id];
      if (!agg) continue;
      var avg = Math.round((agg.total / agg.count) * 100) / 100;
      var verdict = 'ok', note = '';
      if (avg > b.high) {
        if (b.high === 0) { verdict = 'flag'; note = 'Typical SME pays nothing here — every rupee is avoidable.'; }
        else if (avg >= 2 * b.high) { verdict = 'flag'; note = 'Over 2× the typical ceiling.'; }
        else { verdict = 'watch'; note = 'Above the typical range.'; }
      }
      grandTotal = Math.round((grandTotal + agg.total) * 100) / 100;
      perType.push({
        id: b.id, label: b.label, months: agg.count, total: agg.total,
        avg: avg, low: b.low, high: b.high, verdict: verdict, note: note
      });
      if (verdict !== 'ok')
        flags.push({ type: b.label, avg: avg, high: b.high, verdict: verdict, note: note });
    }
    var monthsCovered = Object.keys(months).length;
    var annualized = monthsCovered ? Math.round((grandTotal / monthsCovered) * 12 * 100) / 100 : 0;
    flags.sort(function (a, c) { return (a.verdict === 'flag' ? 0 : 1) - (c.verdict === 'flag' ? 0 : 1); });
    return {
      ok: true, perType: perType, monthsCovered: monthsCovered,
      grandTotal: grandTotal, annualized: annualized, flags: flags
    };
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
    BENCHMARKS: BENCHMARKS, MAX_ENTRIES: MAX_ENTRIES,
    validateMonth: validateMonth, validateEntry: validateEntry,
    analyze: analyze, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'bank-charge-leak-detector';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('d-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var entries = []; // in-memory working list (stateless)

  function renderEntries() {
    var h;
    if (!entries.length) {
      h = '<p class="vq-hint">No entries yet — add one above.</p>';
    } else {
      h = '<div class="tbl-wrap"><table class="tbl"><tr><th>Type</th><th>Month</th><th>Amount</th><th></th></tr>';
      entries.forEach(function (e, i) {
        var b = null;
        for (var k = 0; k < BENCHMARKS.length; k++) if (BENCHMARKS[k].id === e.type) b = BENCHMARKS[k];
        h += '<tr><td>' + esc(b ? b.label : e.type) + '</td><td>' + esc(e.month) + '</td>' +
          '<td class="num">' + fmtINR(e.amount) + '</td>' +
          '<td><button type="button" class="vq-btn vq-btn-sm" data-i="' + i + '">✕</button></td></tr>';
      });
      h += '</table></div>';
    }
    $('d-entries').innerHTML = h;
    var btns = $('d-entries').querySelectorAll('[data-i]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        entries.splice(+this.getAttribute('data-i'), 1);
        renderEntries();
      });
    }
  }

  function renderResult(r) {
    var card = $('d-result-card');
    card.hidden = false;
    var h = '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n">' + fmtINR(r.grandTotal) + '</div><div class="kpi-l">leak over ' + r.monthsCovered + ' month(s)</div></div>' +
      '<div class="kpi"><div class="kpi-n txt-bad">' + fmtINR(r.annualized) + '</div><div class="kpi-l">projected annual leak</div></div>' +
      '<div class="kpi"><div class="kpi-n' + (r.flags.length ? ' txt-warn' : ' txt-ok') + '">' + r.flags.length + '</div><div class="kpi-l">anomaly flags</div></div>' +
      '</div>';
    h += '<div class="tbl-wrap"><table class="tbl"><tr><th>Charge type</th><th>Months</th><th>Total</th><th>Avg/month</th><th>Typical range</th><th>Verdict</th></tr>';
    r.perType.forEach(function (p) {
      var badge = p.verdict === 'ok' ? '<span class="tag tag-ok">OK</span>'
        : p.verdict === 'watch' ? '<span class="tag tag-warn">WATCH</span>'
        : '<span class="tag tag-bad">LEAK</span>';
      h += '<tr><td>' + esc(p.label) + '</td><td>' + p.months + '</td><td class="num">' + fmtINR(p.total) + '</td>' +
        '<td class="num">' + fmtINR(p.avg) + '</td><td class="num">₹' + p.low + '–₹' + p.high + '</td><td>' + badge + '</td></tr>';
    });
    h += '</table></div>';
    if (r.flags.length) {
      h += '<h3>What to fix first</h3><ul class="assump">';
      r.flags.forEach(function (f) {
        h += '<li><strong>' + esc(f.type) + ':</strong> avg ' + fmtINR(f.avg) + '/month vs typical ≤ ₹' + f.high + '. ' + esc(f.note) + '</li>';
      });
      h += '</ul>';
    } else {
      h += '<p class="msg-ok">No anomalies — your charges sit inside typical SME ranges.</p>';
    }
    h += '<p class="vq-hint">Benchmarks are broad ranges from public bank fee schedules (Sep 2026); your bank\u2019s Schedule of Charges is the final word. Estimate only — confirm with your CA.</p>';
    $('d-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'bank-charge-leak-detector-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'bank-charge-leak-detector-bottom', 'leaderboard');
    var sel = $('d-type');
    BENCHMARKS.forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.label + ' (typical ₹' + b.low + '–₹' + b.high + '/mo)';
      sel.appendChild(o);
    });
    SEO.faq([
      { q: 'What is a bank charge leak?', a: 'Recurring, avoidable bank charges — SMS fees, balance penalties, bounce charges, POS rent — that quietly add up. This tool benchmarks your charges against typical SME ranges and totals the annual leak.' },
      { q: 'बैंक चार्ज लीक क्या है?', a: 'छोटे-छोटे बैंक शुल्क (SMS, मिनिमम बैलेंस पेनल्टी, बाउंस चार्ज) जो हर महीने कटते रहते हैं। यह टूल इन्हें सामान्य सीमा से तुलना करके सालाना नुकसान बताता है।' },
      { q: 'What are typical bank charges for a small business?', a: 'Broadly: SMS alerts ₹15–30/month, NEFT/RTGS/IMPS ₹0–200/month, cheque issuance ₹0–300/month. Balance penalties, bounce and forex charges should ideally be zero. Actuals vary by bank — check your Schedule of Charges.' },
      { q: 'How do I reduce bank charges?', a: 'Keep the minimum balance, switch SMS alerts off if you use netbanking, use IMPS/NEFT instead of DDs, maintain ECS balances, and ask your RM to waive AMC — banks often do for good customers.' },
      { q: 'Is my charge data uploaded anywhere?', a: 'No — everything runs in your browser. Nothing leaves your device.' }
    ]);

    $('d-add').addEventListener('click', function () {
      if (entries.length >= MAX_ENTRIES) { msg('Entry limit reached (' + MAX_ENTRIES + ').', false); return; }
      var v = validateEntry({ type: $('d-type').value, month: $('d-month').value, amount: $('d-amount').value });
      if (!v.ok) { msg(v.error, false); return; }
      var dup = entries.some(function (e) { return e.type === v.entry.type && e.month === v.entry.month; });
      if (dup) { msg('That type+month is already added — remove it first.', false); return; }
      entries.push(v.entry);
      $('d-amount').value = '';
      msg('', null);
      renderEntries();
    });

    $('d-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = analyze(entries);
      if (!r.ok) { msg(r.error, false); $('d-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });

    renderEntries();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
