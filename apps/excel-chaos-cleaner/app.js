/* ============================================================
   VisionQuantech Business Suite — Excel Chaos Cleaner
   apps/excel-chaos-cleaner/app.js

   Paste messy CSV: trims whitespace, drops empty/duplicate rows,
   normalizes headers to snake_case, repairs Indian-format dates
   and numbers (₹, commas) into ISO/decimal form, then downloads
   a clean CSV. On-device only.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var MAX_CHARS = 500000; // ~0.5 MB paste guard

  /** Minimal RFC-4180-ish CSV parser: quotes, escaped quotes, CRLF. */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', inQ = false, i = 0;
    text = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    while (i < text.length) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ',') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    row.push(cell); rows.push(row);
    // drop trailing all-empty row
    while (rows.length && rows[rows.length - 1].every(function (c) { return String(c).trim() === ''; })) rows.pop();
    return rows;
  }

  function normalizeHeader(h, used) {
    var base = String(h == null ? '' : h).trim().toLowerCase()
      .replace(/[₹$€£]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'col';
    var name = base, n = 2;
    while (used[name]) { name = base + '_' + n; n++; }
    used[name] = true;
    return name;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Repair a date-ish string to ISO YYYY-MM-DD, or null if unfixable.
   * Indian default: ambiguous D/M vs M/D is read as D/M (documented).
   * Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, with
   * optional time portion (ignored). Two-digit years → 20xx/19xx pivot 50.
   */
  function fixDate(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    var datePart = s.split(/[T ]/)[0];
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      var p = datePart.split(/[\/\-.]/);
      if (p.length !== 3) return null;
      var a = +p[0], b = +p[1], c = +p[2];
      if (!isFinite(a) || !isFinite(b) || !isFinite(c)) return null;
      if (p[0].length === 4) { y = a; mo = b; d = c; }            // YYYY first
      else if (p[2].length === 4 || p[2].length === 2) {
        y = c;
        if (a > 12 && b <= 12) { d = a; mo = b; }                 // DD/MM
        else if (b > 12 && a <= 12) { d = b; mo = a; }            // MM/DD
        else { d = a; mo = b; }                                   // ambiguous → Indian DD/MM
      } else return null;
      if (p[2].length === 2) y = y < 50 ? 2000 + y : 1900 + y;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  /** Repair an Indian-format number: strips ₹/commas/spaces; null if not numeric. */
  function fixNumber(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s); // (1,234) accounting negative
    s = s.replace(/[₹$€£,\s]/g, '').replace(/[()]/g, '');
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  function isDateCol(header) {
    return /(^|_)date($|_)|_dt$|dob|birth|expiry|renewal|invoice_date|bill_date/.test(header);
  }
  function isNumCol(header) {
    return /(^|_)(amount|amt|price|rate|qty|quantity|total|balance|tax|discount|cost|value|number|no|_num)$/.test(header) ||
      header === 'amount' || header === 'price' || header === 'total';
  }

  /** Full clean pipeline. Returns {headers, rows, stats, csv}. */
  function cleanCSV(text) {
    text = String(text == null ? '' : text);
    if (!text.trim()) return { ok: false, error: 'Paste some CSV text first.' };
    if (text.length > MAX_CHARS) return { ok: false, error: 'Paste is too large (max ~0.5 MB). Split it and clean in parts.' };
    var raw = parseCSV(text);
    if (raw.length < 2) return { ok: false, error: 'Need a header row plus at least one data row.' };

    var stats = { rowsIn: raw.length - 1, trimmed: 0, emptyDropped: 0, deduped: 0, datesFixed: 0, numbersFixed: 0, headersRenamed: 0 };
    var used = {};
    var headers = raw[0].map(function (h) {
      var n = normalizeHeader(h, used);
      if (n !== String(h == null ? '' : h)) stats.headersRenamed++;
      return n;
    });

    var seen = {}, rows = [];
    for (var i = 1; i < raw.length; i++) {
      var cells = raw[i].map(function (c) { return String(c); });
      // trim every cell
      for (var j = 0; j < cells.length; j++) {
        var t = cells[j].trim();
        if (t !== cells[j]) stats.trimmed++;
        cells[j] = t;
      }
      // pad/trim to header width
      while (cells.length < headers.length) cells.push('');
      cells = cells.slice(0, headers.length);
      // drop fully-empty rows
      if (cells.every(function (c) { return c === ''; })) { stats.emptyDropped++; continue; }
      // dedupe on trimmed raw cells (before value fixing)
      var key = JSON.stringify(cells);
      if (seen[key]) { stats.deduped++; continue; }
      seen[key] = true;
      // fix dates & numbers by header sniffing
      for (var k = 0; k < headers.length; k++) {
        if (isDateCol(headers[k])) {
          var fd = fixDate(cells[k]);
          if (fd && fd !== cells[k]) { cells[k] = fd; stats.datesFixed++; }
        } else if (isNumCol(headers[k])) {
          var fn = fixNumber(cells[k]);
          if (fn != null && String(fn) !== cells[k]) { cells[k] = String(fn); stats.numbersFixed++; }
        }
      }
      rows.push(cells);
    }
    stats.rowsOut = rows.length;
    var csv = toCSV(headers, rows);
    return { ok: true, headers: headers, rows: rows, stats: stats, csv: csv };
  }

  function csvCell(c) {
    c = String(c);
    return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  }
  function toCSV(headers, rows) {
    var out = [headers.map(csvCell).join(',')];
    rows.forEach(function (r) { out.push(r.map(csvCell).join(',')); });
    return out.join('\n');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_CHARS: MAX_CHARS,
    parseCSV: parseCSV, normalizeHeader: normalizeHeader,
    fixDate: fixDate, fixNumber: fixNumber,
    cleanCSV: cleanCSV, toCSV: toCSV, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'excel-chaos-cleaner';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('x-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }

  var lastCSV = '';

  function init() {
    Ads.render($('ad-top'), 'excel-chaos-cleaner-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'excel-chaos-cleaner-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What does the chaos cleaner fix?', a: 'It trims whitespace, drops empty and exact-duplicate rows, renames headers to snake_case, repairs Indian-format dates (DD/MM/YYYY \u2192 YYYY-MM-DD), and strips \u20B9/commas from number columns.' },
      { q: 'गंदा CSV कैसे साफ़ करें?', a: 'CSV टेक्स्ट पेस्ट करें और Clean दबाएं — खाली जगह हटेगी, डुप्लिकेट पंक्तियां हटेंगी, तारीखें और नंबर ठीक होंगे, फिर साफ़ CSV डाउनलोड करें।' },
      { q: 'How are ambiguous dates like 05/06/2026 read?', a: 'Indian default: DD/MM/YYYY. So 05/06/2026 becomes 2026-06-05. Use YYYY-MM-DD in your source data to avoid ambiguity.' },
      { q: 'Is my data uploaded anywhere?', a: 'No. Cleaning runs entirely in your browser; nothing leaves your device.' },
      { q: 'Is there a size limit?', a: 'Yes — about 0.5 MB per paste. Split bigger exports and clean them in parts.' }
    ]);

    $('x-clean').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('x-gate'), SLUG, FREE_LIMIT); $('x-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = cleanCSV($('x-in').value);
      if (!r.ok) { msg(r.error, false); $('x-result').hidden = true; return; }
      lastCSV = r.csv;
      var st = r.stats;
      var html = '<p class="big">' + st.rowsOut + ' <span class="vq-hint">clean rows</span></p>' +
        '<p class="vq-hint">In: ' + st.rowsIn + ' rows · trimmed ' + st.trimmed + ' cells · dropped ' + st.emptyDropped +
        ' empty & ' + st.deduped + ' duplicate rows · fixed ' + st.datesFixed + ' dates & ' + st.numbersFixed +
        ' numbers · renamed ' + st.headersRenamed + ' headers.</p>' +
        '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
        r.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      r.rows.slice(0, 50).forEach(function (row) {
        html += '<tr>' + row.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
      });
      html += '</tbody></table></div>' +
        (r.rows.length > 50 ? '<p class="vq-hint">Preview shows first 50 of ' + r.rows.length + ' rows — the download has all rows.</p>' : '');
      $('x-preview').innerHTML = html;
      $('x-result').hidden = false;
      msg('Cleaned ' + st.rowsOut + ' rows. Review the preview, then download.', true);
      $('x-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('x-dl').addEventListener('click', function () {
      if (!lastCSV) { msg('Clean a CSV first.', false); return; }
      var blob = new Blob([lastCSV], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cleaned.csv';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
