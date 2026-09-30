/* ============================================================
   VisionQuantech Business Suite — Bank Reconciliation Tool
   apps/bank-reconciliation-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Matches bank-statement rows against book (cash-book) rows by
   amount (within a rupee tolerance) and date (within a day
   tolerance). Both inputs must use the same sign convention:
   receipts/credits POSITIVE, payments/debits NEGATIVE.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure helpers ---------------- */

  var MAX_ROWS = 500;
  var MAX_AMOUNT = 10000000000; // 1,000 crore per row — sanity cap
  var MAX_TOL_AMT = 100000;
  var MAX_TOL_DAYS = 90;

  function trim(s) { return String(s == null ? '' : s).trim(); }

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }

  /** Strict calendar-date parse. Accepts YYYY-MM-DD, YYYY/MM/DD,
      DD-MM-YYYY, DD/MM/YYYY. Returns {ok, value:'YYYY-MM-DD'} or {ok:false,error}. */
  function parseDate(s) {
    s = trim(s);
    var m, y, mo, d;
    m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(s);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(s);
      if (!m) return { ok: false, error: 'Bad date "' + s.slice(0, 20) + '" — use DD-MM-YYYY or YYYY-MM-DD.' };
      d = +m[1]; mo = +m[2]; y = +m[3];
    }
    if (y < 1900 || y > 2100) return { ok: false, error: 'Year out of range in "' + s.slice(0, 20) + '".' };
    var dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1])
      return { ok: false, error: 'Invalid calendar date "' + s.slice(0, 20) + '".' };
    var iso = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    return { ok: true, value: iso };
  }

  function dayDiff(aISO, bISO) {
    var a = new Date(aISO + 'T00:00:00Z').getTime();
    var b = new Date(bISO + 'T00:00:00Z').getTime();
    return Math.round((a - b) / 86400000);
  }

  /** Split one CSV line, honouring double quotes. */
  function splitCSVLine(line) {
    var fields = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  }

  function parseAmount(s) {
    s = trim(s).replace(/[₹,\s]/g, '');
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
    var n = Number(s);
    if (!isFinite(n) || Math.abs(n) > MAX_AMOUNT) return null;
    return Math.round(n * 100) / 100;
  }

  /**
   * Parse CSV-ish text into rows {date:'YYYY-MM-DD', desc, amount, line}.
   * Expected columns: date, description, amount (extra columns ignored).
   * hasHeader: skip first non-blank line.
   */
  function parseStatement(text, hasHeader) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var rows = [];
    var skipped = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!trim(lines[i])) continue;
      if (hasHeader && skipped === 0) { skipped++; continue; }
      skipped++;
      var f = splitCSVLine(lines[i]);
      if (f.length < 3)
        return { ok: false, error: 'Line ' + (i + 1) + ': need at least 3 columns (date, description, amount).' };
      var dp = parseDate(f[0]);
      if (!dp.ok) return { ok: false, error: 'Line ' + (i + 1) + ': ' + dp.error };
      var amt = parseAmount(f[2]);
      if (amt === null)
        return { ok: false, error: 'Line ' + (i + 1) + ': bad amount "' + trim(f[2]).slice(0, 20) + '".' };
      if (amt === 0)
        return { ok: false, error: 'Line ' + (i + 1) + ': amount cannot be zero.' };
      rows.push({ date: dp.value, desc: trim(f[1]).slice(0, 120), amount: amt, line: i + 1 });
      if (rows.length > MAX_ROWS)
        return { ok: false, error: 'Too many rows (max ' + MAX_ROWS + ' per file). Split the file and run again.' };
    }
    if (!rows.length) return { ok: false, error: 'No data rows found — paste at least one row.' };
    return { ok: true, rows: rows };
  }

  function validateTolerance(v, name, max) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return { ok: false, error: name + ' must be zero or more.' };
    if (n > max) return { ok: false, error: name + ' is too large (max ' + max + ').' };
    return { ok: true, value: n };
  }

  /**
   * Greedy match: each bank row takes the first unmatched book row with the
   * same sign, |amount diff| <= amountTol and |date diff| <= dateTolDays.
   * Returns {ok, matched, unmatchedBank, unmatchedBook, summary}.
   */
  function reconcile(bankRows, bookRows, amountTol, dateTolDays) {
    var at = validateTolerance(amountTol, 'Amount tolerance', MAX_TOL_AMT);
    if (!at.ok) return at;
    var dt = validateTolerance(dateTolDays, 'Date tolerance', MAX_TOL_DAYS);
    if (!dt.ok) return dt;
    if (!Array.isArray(bankRows) || !Array.isArray(bookRows))
      return { ok: false, error: 'Internal error: rows must be arrays.' };
    var used = {};
    var matched = [], unmatchedBank = [];
    for (var i = 0; i < bankRows.length; i++) {
      var b = bankRows[i], hit = -1;
      for (var j = 0; j < bookRows.length; j++) {
        if (used[j]) continue;
        var k = bookRows[j];
        if (Math.sign(b.amount) !== Math.sign(k.amount)) continue;
        if (Math.abs(Math.abs(b.amount) - Math.abs(k.amount)) > at.value) continue;
        if (Math.abs(dayDiff(b.date, k.date)) > dt.value) continue;
        hit = j; break;
      }
      if (hit >= 0) {
        used[hit] = true;
        matched.push({ bank: b, book: bookRows[hit] });
      } else unmatchedBank.push(b);
    }
    var unmatchedBook = [];
    for (var j2 = 0; j2 < bookRows.length; j2++) if (!used[j2]) unmatchedBook.push(bookRows[j2]);
    var sumAbs = function (rows) {
      return Math.round(rows.reduce(function (s, r) { return s + Math.abs(r.amount); }, 0) * 100) / 100;
    };
    return {
      ok: true,
      matched: matched,
      unmatchedBank: unmatchedBank,
      unmatchedBook: unmatchedBook,
      summary: {
        bank: bankRows.length, book: bookRows.length,
        matched: matched.length,
        unmatchedBank: unmatchedBank.length, unmatchedBook: unmatchedBook.length,
        unmatchedBankTotal: sumAbs(unmatchedBank),
        unmatchedBookTotal: sumAbs(unmatchedBook)
      }
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
    MAX_ROWS: MAX_ROWS,
    parseDate: parseDate, parseStatement: parseStatement,
    reconcile: reconcile, validateTolerance: validateTolerance,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'bank-reconciliation-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('b-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var SAMPLE =
    'date,description,amount\n' +
    '01-09-2026,NEFT-Rent received,45000\n' +
    '03-09-2026,UPI-Supplier payment,-12500\n' +
    '05-09-2026,Cheque 10231 cleared,-8200.50';

  function rowHTML(r, other) {
    return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.desc) + '</td>' +
      '<td class="num">' + fmtINR(r.amount) + '</td>' +
      (other ? '<td>' + esc(other.date) + '</td><td class="num">' + fmtINR(other.amount) + '</td>' : '') + '</tr>';
  }

  function renderResult(res) {
    var card = $('b-result-card');
    card.hidden = false;
    var s = res.summary;
    var h = '<p class="vq-hint">Bank rows: <strong>' + s.bank + '</strong> · Book rows: <strong>' + s.book +
      '</strong> · Matched: <strong class="msg-ok">' + s.matched + '</strong> · ' +
      'Unmatched bank: <strong class="msg-err">' + s.unmatchedBank + '</strong> (' + fmtINR(s.unmatchedBankTotal) + ') · ' +
      'Unmatched book: <strong class="msg-err">' + s.unmatchedBook + '</strong> (' + fmtINR(s.unmatchedBookTotal) + ')</p>';
    if (res.matched.length) {
      h += '<h3>Matched (' + res.matched.length + ')</h3><div class="tbl-wrap"><table class="tbl">' +
        '<tr><th>Bank date</th><th>Bank narration</th><th>Bank amt</th><th>Book date</th><th>Book amt</th></tr>';
      res.matched.forEach(function (m) { h += rowHTML(m.bank, m.book); });
      h += '</table></div>';
    }
    if (res.unmatchedBank.length) {
      h += '<h3>Unmatched in bank statement (' + res.unmatchedBank.length + ')</h3><div class="tbl-wrap"><table class="tbl">' +
        '<tr><th>Date</th><th>Narration</th><th>Amount</th></tr>';
      res.unmatchedBank.forEach(function (r) { h += rowHTML(r, null); });
      h += '</table></div>';
    }
    if (res.unmatchedBook.length) {
      h += '<h3>Unmatched in books (' + res.unmatchedBook.length + ')</h3><div class="tbl-wrap"><table class="tbl">' +
        '<tr><th>Date</th><th>Narration</th><th>Amount</th></tr>';
      res.unmatchedBook.forEach(function (r) { h += rowHTML(r, null); });
      h += '</table></div>';
    }
    h += '<p class="vq-hint">Unmatched bank rows are usually bank charges, interest or direct deposits missing from your books. Unmatched book rows are usually unpresented cheques or entries not yet in the statement.</p>';
    $('b-result').innerHTML = h;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'bank-reconciliation-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'bank-reconciliation-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does this bank reconciliation tool match entries?', a: 'Paste your bank statement and your book (cash-book) entries as date, description, amount rows. The tool matches rows with the same sign whose amounts agree within your rupee tolerance and whose dates agree within your day tolerance.' },
      { q: 'बैंक रिकंसिलिएशन कैसे करें?', a: 'बैंक स्टेटमेंट और अपनी किताब की एंट्रियों को date, description, amount के रूप में पेस्ट करें। टूल राशि और तारीख की सहनशीलता (tolerance) के अंदर मिलान करता है और बेमेल एंट्रियाँ अलग सूची में दिखाता है।' },
      { q: 'What sign convention should the amounts use?', a: 'Use the same convention in both files: receipts/credits positive, payments/debits negative. Mixed conventions will not match.' },
      { q: 'What do unmatched entries usually mean?', a: 'Unmatched bank rows are typically bank charges, interest, or direct credits missing from your books. Unmatched book rows are typically unpresented cheques or entries the bank has not processed yet.' },
      { q: 'Is my statement data uploaded anywhere?', a: 'No — everything runs in your browser on your device. Nothing is sent to any server.' }
    ]);

    $('b-fill-sample').addEventListener('click', function () {
      $('b-bank').value = SAMPLE;
      $('b-book').value = 'date,description,amount\n01-09-2026,Rent - Sharma Traders,45000\n03-09-2026,Raw material - ABC,12500\n05-09-2026,Cheque 10231,8200.50';
    });

    $('b-run').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); $('b-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var pb = parseStatement($('b-bank').value, $('b-hdr-bank').checked);
      if (!pb.ok) { msg('Bank statement: ' + pb.error, false); return; }
      var pk = parseStatement($('b-book').value, $('b-hdr-book').checked);
      if (!pk.ok) { msg('Book entries: ' + pk.error, false); return; }
      var r = reconcile(pb.rows, pk.rows, $('b-amtol').value, $('b-daytol').value);
      if (!r.ok) { msg(r.error, false); $('b-result-card').hidden = true; return; }
      msg('Reconciled ' + pb.rows.length + ' bank rows against ' + pk.rows.length + ' book rows.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
