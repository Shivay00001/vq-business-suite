/* ============================================================
   VisionQuantech Business Suite — Daily Cash Closing Tool
   apps/daily-cash-closing-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Denomination-wise cash count, tally against the expected closing
   balance, shortage/excess verdict, and a dated shortage/excess log
   (max 25, Vault-saved, reads unmetered).
   Denominations: Indian notes & coins incl. ₹2000 (legal tender).
   Stateless math; the log is device-persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  var MAX_COUNT = 100000;
  var MAX_AMOUNT = 10000000000;
  var MAX_LOG = 25;

  function trim(s) { return String(s == null ? '' : s).trim(); }

  /** Strict YYYY-MM-DD calendar parse. */
  function strictDate(s) {
    s = trim(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return { ok: false, error: 'Invalid calendar date.' };
    if (y < 2000 || y > 2100) return { ok: false, error: 'Year out of range.' };
    return { ok: true, value: s };
  }

  function validateCount(v) {
    if (trim(v) === '') return { ok: true, value: 0 };
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Counts must be whole numbers.' };
    if (n < 0) return { ok: false, error: 'Counts cannot be negative.' };
    if (n > MAX_COUNT) return { ok: false, error: 'Count too large (max ' + MAX_COUNT + ').' };
    return { ok: true, value: n };
  }

  function validateCounts(raw) {
    raw = raw || {};
    var counts = {};
    for (var i = 0; i < DENOMS.length; i++) {
      var v = validateCount(raw[DENOMS[i]]);
      if (!v.ok) return { ok: false, error: '₹' + DENOMS[i] + ': ' + v.error };
      counts[DENOMS[i]] = v.value;
    }
    return { ok: true, counts: counts };
  }

  function validateAmount(v, name) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid amount.' };
    if (n < 0) return { ok: false, error: name + ': amount cannot be negative.' };
    if (n > MAX_AMOUNT) return { ok: false, error: name + ': amount looks too large.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  /** Denomination total. Returns {ok, total, lines:[{denom,count,value}]}. */
  function denomTotal(rawCounts) {
    var v = validateCounts(rawCounts);
    if (!v.ok) return v;
    var lines = [], total = 0;
    for (var i = 0; i < DENOMS.length; i++) {
      var d = DENOMS[i], c = v.counts[d];
      if (c > 0) {
        var val = d * c;
        lines.push({ denom: d, count: c, value: val });
        total += val;
      }
    }
    return { ok: true, total: total, lines: lines, counts: v.counts };
  }

  /**
   * Tally counted cash vs expected closing balance.
   * diff = counted - expected. status: 'ok' | 'shortage' | 'excess'.
   */
  function closingTally(expected, counted) {
    var e = validateAmount(expected, 'Expected balance');
    if (!e.ok) return e;
    var c = validateAmount(counted, 'Counted cash');
    if (!c.ok) return c;
    var diff = Math.round((c.value - e.value) * 100) / 100;
    var status = diff === 0 ? 'ok' : (diff < 0 ? 'shortage' : 'excess');
    return { ok: true, expected: e.value, counted: c.value, diff: diff, absDiff: Math.abs(diff), status: status };
  }

  function validateLogEntry(date, expected, counted, note) {
    var dp = strictDate(date);
    if (!dp.ok) return dp;
    var t = closingTally(expected, counted);
    if (!t.ok) return t;
    var n = trim(note).slice(0, 200);
    return { ok: true, entry: { date: dp.value, expected: t.expected, counted: t.counted, diff: t.diff, status: t.status, note: n } };
  }

  function logAdd(log, date, expected, counted, note) {
    var v = validateLogEntry(date, expected, counted, note);
    if (!v.ok) return v;
    var arr = Array.isArray(log) ? log.slice() : [];
    if (arr.length >= MAX_LOG)
      return { ok: false, error: 'Log is full (max ' + MAX_LOG + ') — remove old entries first.' };
    arr.push(v.entry);
    arr.sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    return { ok: true, log: arr };
  }

  function logSummary(log) {
    var arr = Array.isArray(log) ? log : [];
    var shortage = 0, excess = 0, okDays = 0, totShort = 0, totExcess = 0;
    arr.forEach(function (e) {
      if (e.status === 'shortage') { shortage++; totShort += Math.abs(e.diff); }
      else if (e.status === 'excess') { excess++; totExcess += e.diff; }
      else okDays++;
    });
    return {
      days: arr.length, okDays: okDays, shortage: shortage, excess: excess,
      totShort: Math.round(totShort * 100) / 100, totExcess: Math.round(totExcess * 100) / 100
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
    DENOMS: DENOMS, MAX_LOG: MAX_LOG,
    strictDate: strictDate, validateCount: validateCount,
    denomTotal: denomTotal, closingTally: closingTally,
    validateLogEntry: validateLogEntry, logAdd: logAdd, logSummary: logSummary,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'daily-cash-closing-tool';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'log';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('h-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  async function loadLog() {
    try { var l = await Vault.load(SLUG, VAULT_KEY); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  async function saveLog(log) { await Vault.save(SLUG, VAULT_KEY, log); }

  function readCounts() {
    var raw = {};
    DENOMS.forEach(function (d) { raw[d] = $('h-d' + d).value; });
    return raw;
  }

  function renderResult(t, countedTotal) {
    var card = $('h-result-card');
    card.hidden = false;
    var badge = t.status === 'ok' ? '<span class="tag tag-ok">TALLY OK</span>'
      : t.status === 'shortage' ? '<span class="tag tag-bad">SHORTAGE</span>'
      : '<span class="tag tag-warn">EXCESS</span>';
    var h = '<p>Counted total: <span class="big">' + fmtINR(countedTotal) + '</span> ' + badge + '</p>' +
      '<p class="vq-hint">Expected: ' + fmtINR(t.expected) + ' · Difference: <strong>' +
      fmtINR(t.diff) + '</strong> (' + (t.status === 'ok' ? 'perfect tally' : t.status) + ')</p>';
    if (t.status !== 'ok')
      h += '<p class="vq-hint">Investigate before closing the day: re-count, check unrecorded payouts/petty cash, then log the entry below with a note.</p>';
    $('h-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function renderLog() {
    var log = await loadLog();
    var s = logSummary(log);
    var h = '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n">' + s.days + '</div><div class="kpi-l">days logged</div></div>' +
      '<div class="kpi"><div class="kpi-n txt-ok">' + s.okDays + '</div><div class="kpi-l">perfect tallies</div></div>' +
      '<div class="kpi"><div class="kpi-n' + (s.shortage ? ' txt-bad' : '') + '">' + s.shortage + '</div><div class="kpi-l">shortages (' + fmtINR(s.totShort) + ')</div></div>' +
      '<div class="kpi"><div class="kpi-n' + (s.excess ? ' txt-warn' : '') + '">' + s.excess + '</div><div class="kpi-l">excesses (' + fmtINR(s.totExcess) + ')</div></div>' +
      '</div>';
    if (log.length) {
      h += '<div class="tbl-wrap"><table class="tbl"><tr><th>Date</th><th>Expected</th><th>Counted</th><th>Diff</th><th>Note</th></tr>';
      log.forEach(function (e) {
        var badge = e.status === 'ok' ? '<span class="tag tag-ok">ok</span>'
          : e.status === 'shortage' ? '<span class="tag tag-bad">' + fmtINR(e.diff) + '</span>'
          : '<span class="tag tag-warn">+' + fmtINR(e.diff) + '</span>';
        h += '<tr><td>' + esc(e.date) + '</td><td class="num">' + fmtINR(e.expected) + '</td>' +
          '<td class="num">' + fmtINR(e.counted) + '</td><td>' + badge + '</td><td>' + esc(e.note) + '</td></tr>';
      });
      h += '</table></div>';
    } else h += '<p class="vq-hint">No closing entries logged yet.</p>';
    $('h-log').innerHTML = h;
  }

  function init() {
    Ads.render($('ad-top'), 'daily-cash-closing-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'daily-cash-closing-tool-bottom', 'leaderboard');
    var grid = $('h-denoms');
    DENOMS.forEach(function (d) {
      var div = document.createElement('div');
      div.className = 'vq-field';
      div.innerHTML = '<label for="h-d' + d + '">₹' + d + ' × count</label>' +
        '<input id="h-d' + d + '" type="number" min="0" max="100000" step="1" value="" inputmode="numeric" placeholder="0">';
      grid.appendChild(div);
    });
    SEO.faq([
      { q: 'How does the daily cash closing work?', a: 'Enter the count of each note and coin denomination. The tool totals the counted cash and compares it with the expected closing balance (opening + cash sales − cash payouts) to flag shortage or excess.' },
      { q: 'रोज़ का कैश क्लोज़िंग कैसे करें?', a: 'हर नोट/सिक्के की गिनती दर्ज करें। टूल कुल नकदी निकालकर अपेक्षित बैलेंस से मिलान करता है — कमी (shortage) या अधिकता (excess) तुरंत दिखती है।' },
      { q: 'What should I do if there is a shortage?', a: 'Re-count first, then check for unrecorded payouts, petty-cash slips and data-entry errors. Log the difference with a note so the pattern is visible over days.' },
      { q: 'Are ₹2000 notes included?', a: 'Yes — the ₹2000 note remains legal tender, so it is part of the count.' },
      { q: 'Where is the closing log stored?', a: 'On your own device (up to 25 entries). Nothing is uploaded anywhere.' },
      { q: 'Does tallying replace my cashbook?', a: 'No — it is a daily control check. Keep your cashbook entries; this tool verifies the physical cash matches them.' }
    ]);

    $('h-tally').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('h-gate'), SLUG, FREE_LIMIT); $('h-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var dt = denomTotal(readCounts());
      if (!dt.ok) { msg(dt.error, false); return; }
      var t = closingTally($('h-expected').value, dt.total);
      if (!t.ok) { msg(t.error, false); $('h-result-card').hidden = true; return; }
      msg('', null);
      renderResult(t, dt.total);
    });

    $('h-logbtn').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('h-gate'), SLUG, FREE_LIMIT); $('h-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var dt = denomTotal(readCounts());
      if (!dt.ok) { msg(dt.error, false); return; }
      var r = logAdd(await loadLog(), $('h-date').value || todayLocal(), $('h-expected').value, dt.total, $('h-note').value);
      if (!r.ok) { msg(r.error, false); return; }
      await saveLog(r.log); // Vault save awaited, max 25
      msg('Closing entry logged.', true);
      $('h-note').value = '';
      renderLog();
    });

    function todayLocal() {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    $('h-date').value = todayLocal();
    renderLog(); // reads are unmetered
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
