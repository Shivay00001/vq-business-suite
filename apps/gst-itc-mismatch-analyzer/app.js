/* ============================================================
   ITC Mismatch Analyzer — compare purchase register rows against
   GSTR-2B-style rows and flag mismatches.
   Statutory basis (verified Sep 2026):
   - Sec 16(2)(c) CGST Act: ITC admissible only if tax on the supply
     has been paid by the supplier and reported in his GSTR-1.
   - Rule 36(4) CGST Rules: ITC in 3B cannot exceed 2B available ITC
     (the old 5%/10% provisional-credit window is gone — 2B is the
     hard ceiling now).
   Matching is DOM-free so it can be unit-tested in node.
   ============================================================ */

var ITC_TOLERANCE = 1; // Rs 1 tolerance on value comparisons

function normGstin(g) { return String(g || '').trim().toUpperCase(); }
function normInv(i) { return String(i || '').trim().toUpperCase(); }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/** Match key: GSTIN + invoice number. */
function rowKey(gstin, inv) { return normGstin(gstin) + '|' + normInv(inv); }

/**
 * Parse pasted CSV: supplier_gstin, invoice_no, taxable_value, itc
 * Returns {rows:[{gstin,inv,taxable,itc}], errors:[line numbers]}.
 */
function parseCsv(text) {
  var rows = [], errors = [];
  var MAX_CSV_ROWS = 2000; // paste guard: larger books should be split by month
  var lines = String(text || '').split(/\r?\n/);
  if (lines.length > MAX_CSV_ROWS + 1) return { rows: [], errors: [], capped: true, cap: MAX_CSV_ROWS };
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var parts = line.split(',').map(function (p) { return p.trim(); });
    if (parts.length < 4 || !parts[0] || !parts[1]) { errors.push(i + 1); continue; }
    rows.push({
      gstin: normGstin(parts[0]),
      inv: normInv(parts[1]),
      taxable: num(parts[2]),
      itc: num(parts[3])
    });
  }
  return { rows: rows, errors: errors };
}

/**
 * Analyze PR rows vs 2B rows.
 * Returns {flags:[...], summary:{...}}.
 * flag: 'missing' | 'diff' | 'gstin' | 'unclaimed' | 'ok'
 */
function analyzeITC(prRows, b2Rows) {
  var b2ByKey = {}, b2InvToGstins = {};
  for (var i = 0; i < b2Rows.length; i++) {
    var b = b2Rows[i];
    var k = rowKey(b.gstin, b.inv);
    if (!b2ByKey[k]) b2ByKey[k] = [];
    b2ByKey[k].push(b);
    var inv = normInv(b.inv);
    if (!b2InvToGstins[inv]) b2InvToGstins[inv] = {};
    b2InvToGstins[inv][normGstin(b.gstin)] = true;
  }

  var flags = [];
  var prKeysSeen = {};
  var s = { prRows: prRows.length, b2Rows: b2Rows.length,
            prItc: 0, b2Itc: 0, missing: 0, diff: 0, gstin: 0,
            unclaimed: 0, ok: 0, atRisk: 0 };

  for (var j = 0; j < prRows.length; j++) {
    var p = prRows[j];
    s.prItc += p.itc;
    var k2 = rowKey(p.gstin, p.inv);
    prKeysSeen[k2] = true;
    var matches = b2ByKey[k2];
    if (!matches || !matches.length) {
      // same invoice no under a different GSTIN? -> wrong GSTIN
      var invGstins = b2InvToGstins[normInv(p.inv)] || {};
      var otherGstins = Object.keys(invGstins).filter(function (g) {
        return g !== normGstin(p.gstin);
      });
      if (otherGstins.length) {
        s.gstin++;
        flags.push({ flag: 'gstin', pr: p, b2: null, atRisk: p.itc,
          note: 'Invoice found in 2B under GSTIN ' + otherGstins.join(', ') + ' — supplier GSTIN may be wrong in your books.' });
        s.atRisk += p.itc;
      } else {
        s.missing++;
        flags.push({ flag: 'missing', pr: p, b2: null, atRisk: p.itc,
          note: 'Invoice not found in GSTR-2B — supplier may not have filed GSTR-1 yet. Full claimed ITC is at risk.' });
        s.atRisk += p.itc;
      }
      continue;
    }
    var b2 = matches[0];
    var gap = p.itc - b2.itc;
    if (gap > ITC_TOLERANCE) {
      s.diff++;
      flags.push({ flag: 'diff', pr: p, b2: b2, atRisk: gap,
        note: 'Claimed ITC exceeds 2B-available ITC by Rs ' + gap.toFixed(2) + '. Reduce claim or chase the supplier.' });
      s.atRisk += gap;
    } else {
      s.ok++;
      flags.push({ flag: 'ok', pr: p, b2: b2, atRisk: 0, note: 'Matches 2B within tolerance.' });
    }
  }

  for (var m = 0; m < b2Rows.length; m++) {
    var b3 = b2Rows[m];
    s.b2Itc += b3.itc;
    if (!prKeysSeen[rowKey(b3.gstin, b3.inv)]) {
      s.unclaimed++;
      flags.push({ flag: 'unclaimed', pr: null, b2: b3, atRisk: 0,
        note: 'ITC available in 2B but not claimed in your books — potential saving if the purchase is genuine.' });
    }
  }

  s.atRisk = Math.round(s.atRisk * 100) / 100;
  return { flags: flags, summary: s };
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function csvEsc(v) {
  var s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function flagsToCsv(flags) {
  var lines = ['flag,supplier_gstin,invoice_no,pr_taxable,pr_itc_claimed,b2_taxable,b2_itc_available,at_risk_itc,note'];
  for (var i = 0; i < flags.length; i++) {
    var f = flags[i];
    lines.push([
      f.flag,
      csvEsc(f.pr ? f.pr.gstin : (f.b2 ? f.b2.gstin : '')),
      csvEsc(f.pr ? f.pr.inv : (f.b2 ? f.b2.inv : '')),
      f.pr ? f.pr.taxable.toFixed(2) : '',
      f.pr ? f.pr.itc.toFixed(2) : '',
      f.b2 ? f.b2.taxable.toFixed(2) : '',
      f.b2 ? f.b2.itc.toFixed(2) : '',
      f.atRisk.toFixed(2),
      csvEsc(f.note)
    ].join(','));
  }
  return lines.join('\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function itcInit() {
  var SLUG = 'gst-itc-mismatch-analyzer';
  var FREE_LIMIT = 20;   // analyses per day
  var SAVE_CAP = 25;     // vault saves
  var VAULT_KEY_PREFIX = 'report-';

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'ITC mismatch kya hota hai? (What is an ITC mismatch?)',
      a: 'When the ITC you claimed in your purchase register differs from what appears in GSTR-2B — an invoice is missing, values differ, or the GSTIN is wrong. Under Section 16(2)(c) and Rule 36(4), ITC not reflected in 2B is at risk of reversal with interest.' },
    { q: 'Supplier ne invoice file nahi kiya to kya hoga? (What if the supplier has not filed GSTR-1?)',
      a: 'Then the invoice will not appear in your GSTR-2B and the ITC you claimed on it is at risk. Follow up with the supplier to file GSTR-1, or reverse the ITC yourself to avoid interest.' },
    { q: 'Kya ye tool GST portal se 2B download karta hai? (Does this tool fetch 2B from the GST portal?)',
      a: 'No — it is 100% offline. You download GSTR-2B from the portal and paste it here. Your data never leaves this device.' },
    { q: 'At-risk ITC kaise calculate hota hai? (How is at-risk ITC calculated?)',
      a: 'Full claimed ITC on invoices missing from 2B, plus the positive gap (claimed minus available) on value-difference rows. A Rs 1 tolerance is ignored.' },
    { q: 'Meri report ka data kahan save hota hai? (Where is my report data stored?)',
      a: 'Only in this browser\'s local vault (optionally passphrase-encrypted). Up to 25 reports are kept.' }
  ]);
  SEO.softwareApp({
    name: 'ITC Mismatch Analyzer — GSTR-2B Reconciliation',
    description: 'Free ITC mismatch analyzer: compare purchase register with GSTR-2B, flag missing invoices, value differences and wrong GSTINs, total at-risk ITC. 100% on-device.',
    keywords: ['ITC mismatch analyzer', 'आईटीसी मिसमैच', 'GSTR-2B reconciliation', 'purchase register vs 2B', 'ITC at risk calculator', 'GSTR-2B mismatch report']
  });

  var lastResult = null;

  function collectRows(csvEl, rowInputs) {
    var parsed = parseCsv(csvEl.value);
    var rows = parsed.rows.slice();
    return { rows: rows, csvErrors: parsed.errors, capped: parsed.capped, cap: parsed.cap };
  }

  function addRow(csvEl, gstinEl, invEl, taxEl, itcEl) {
    var g = gstinEl.value.trim(), inv = invEl.value.trim();
    var tax = parseFloat(taxEl.value), itc = parseFloat(itcEl.value);
    if (!g || !inv) { el('itc-error').textContent = 'Supplier GSTIN and invoice no. are required to add a row.'; return; }
    if (!(tax >= 0) || !(itc >= 0)) { el('itc-error').textContent = 'Enter valid taxable value and ITC amounts.'; return; }
    el('itc-error').textContent = '';
    var line = [g.toUpperCase(), inv, tax, itc].join(', ');
    csvEl.value = csvEl.value.trim() ? csvEl.value.trim() + '\n' + line : line;
    gstinEl.value = ''; invEl.value = ''; taxEl.value = ''; itcEl.value = '';
  }

  el('prAdd').addEventListener('click', function () {
    addRow(el('prCsv'), el('prGstin'), el('prInv'), el('prTax'), el('prItc'));
  });
  el('b2Add').addEventListener('click', function () {
    addRow(el('b2Csv'), el('b2Gstin'), el('b2Inv'), el('b2Tax'), el('b2Itc'));
  });

  el('loadSampleBtn').addEventListener('click', function () {
    el('prCsv').value =
      '27ABCDE1234F1Z5, INV-101, 100000, 18000\n' +
      '27ABCDE1234F1Z5, INV-102, 50000, 9000\n' +
      '29ABCDE1234F1Z5, INV-201, 20000, 3600\n' +
      '07ABCDE1234F1Z5, INV-301, 75000, 13500';
    el('b2Csv').value =
      '27ABCDE1234F1Z5, INV-101, 100000, 18000\n' +
      '27ABCDE1234F1Z5, INV-102, 50000, 7500\n' +
      '29XYZAB1234C1Z5, INV-201, 20000, 3600\n' +
      '07ABCDE1234F1Z5, INV-401, 30000, 5400';
    el('itc-error').textContent = '';
  });

  el('clearBtn').addEventListener('click', function () {
    el('prCsv').value = ''; el('b2Csv').value = '';
    el('itc-result').style.display = 'none';
    el('itc-error').textContent = ''; el('itc-upsell').innerHTML = '';
    lastResult = null;
  });

  var FLAG_LABEL = { missing: 'Missing in 2B', diff: 'Value difference', gstin: 'Wrong GSTIN', unclaimed: 'Unclaimed ITC', ok: 'OK' };

  function renderSummary(s) {
    var cells = [
      ['PR rows', s.prRows, ''], ['2B rows', s.b2Rows, ''],
      ['PR ITC claimed', inr(s.prItc), ''], ['2B ITC available', inr(s.b2Itc), ''],
      ['Missing in 2B', s.missing, s.missing ? 'risk' : ''],
      ['Value differences', s.diff, s.diff ? 'risk' : ''],
      ['Wrong GSTIN', s.gstin, s.gstin ? 'risk' : ''],
      ['Unclaimed (opportunity)', s.unclaimed, ''],
      ['AT-RISK ITC', inr(s.atRisk), 'risk']
    ];
    var html = '';
    for (var i = 0; i < cells.length; i++) {
      html += '<div class="sum-cell ' + cells[i][2] + '"><div class="k">' + cells[i][0] +
        '</div><div class="v">' + cells[i][1] + '</div></div>';
    }
    el('sumGrid').innerHTML = html;
  }

  function renderFlags(flags) {
    var order = { missing: 0, gstin: 1, diff: 2, unclaimed: 3, ok: 4 };
    var sorted = flags.slice().sort(function (a, b) { return order[a.flag] - order[b.flag]; });
    var html = '';
    for (var i = 0; i < sorted.length; i++) {
      var f = sorted[i];
      var pr = f.pr || {}, b2 = f.b2 || {};
      html += '<tr><td><span class="flag ' + f.flag + '">' + FLAG_LABEL[f.flag] + '</span><br>' +
        '<small>' + f.note.replace(/</g, '&lt;') + '</small></td>' +
        '<td>' + (pr.gstin || b2.gstin || '—') + '</td>' +
        '<td>' + (pr.inv || b2.inv || '—') + '</td>' +
        '<td>' + (f.pr ? inr(pr.taxable) : '—') + '</td>' +
        '<td>' + (f.pr ? inr(pr.itc) : '—') + '</td>' +
        '<td>' + (f.b2 ? inr(b2.itc) : '—') + '</td>' +
        '<td><strong>' + (f.atRisk > 0 ? inr(f.atRisk) : '—') + '</strong></td></tr>';
    }
    el('flagBody').innerHTML = html || '<tr><td colspan="7">No rows to compare.</td></tr>';
  }

  el('analyzeBtn').addEventListener('click', function () {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('itc-upsell'), SLUG, FREE_LIMIT);
      el('itc-result').style.display = 'none';
      return;
    }
    el('itc-upsell').innerHTML = '';
    el('itc-error').textContent = ''; el('itc-saved').textContent = '';

    var pr = collectRows(el('prCsv'));
    var b2 = collectRows(el('b2Csv'));
    if (pr.capped || b2.capped) {
      el('itc-error').textContent = 'Paste too large — max ' + (pr.cap || b2.cap) + ' rows per side. Split by month and analyze in parts.';
      return;
    }
    if (pr.csvErrors.length || b2.csvErrors.length) {
      el('itc-error').textContent = 'Some CSV lines could not be parsed (need 4 columns: gstin, invoice, taxable, itc). PR lines: ' +
        (pr.csvErrors.join(', ') || 'ok') + '; 2B lines: ' + (b2.csvErrors.join(', ') || 'ok') + '.';
    }
    if (!pr.rows.length && !b2.rows.length) {
      el('itc-error').textContent = 'Paste or add at least one row on either side first.';
      return;
    }
    lastResult = analyzeITC(pr.rows, b2.rows);
    renderSummary(lastResult.summary);
    renderFlags(lastResult.flags);
    el('itc-result').style.display = 'block';
  });

  el('exportBtn').addEventListener('click', function () {
    if (!lastResult) return;
    var blob = new Blob([flagsToCsv(lastResult.flags)], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'itc-mismatch-report.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  el('saveBtn').addEventListener('click', async function () {
    if (!lastResult) return;
    try {
      var list = await Vault.list(SLUG);
      if (list.length >= SAVE_CAP) {
        Freemium.renderUpsell(el('itc-upsell'), SLUG, SAVE_CAP);
        el('itc-saved').textContent = '';
        return;
      }
      var d = new Date();
      var key = VAULT_KEY_PREFIX + d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
      await Vault.save(SLUG, key, {
        savedAt: d.toISOString(), summary: lastResult.summary, flags: lastResult.flags
      });
      el('itc-saved').textContent = 'Report saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').';
      renderSaved();
    } catch (e) {
      el('itc-error').textContent = 'Could not save: ' + e.message;
    }
  });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function renderSaved() {
    var box = el('savedList');
    try {
      var list = await Vault.list(SLUG);
      if (!list.length) { box.innerHTML = '<p class="vq-hint">No saved reports yet.</p>'; return; }
      var html = '';
      list.slice().reverse().forEach(function (e) {
        html += '<div class="saved-item"><span><strong>' + esc(e.key.replace('report-', '')) + '</strong>' +
          '<br><small>Saved ' + esc(String(e.updatedAt).slice(0, 10)) + (e.encrypted ? ' · encrypted' : '') + '</small></span>' +
          '<span class="acts"><button class="vq-btn ghost" data-load="' + esc(e.key) + '" type="button">View</button>' +
          '<button class="vq-btn ghost" data-del="' + esc(e.key) + '" type="button">Delete</button></span></div>';
      });
      box.innerHTML = html;
      box.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var data = await Vault.load(SLUG, b.getAttribute('data-load'));
          if (data) {
            lastResult = { flags: data.flags, summary: data.summary };
            renderSummary(data.summary); renderFlags(data.flags);
            el('itc-result').style.display = 'block';
            window.scrollTo({ top: el('itc-result').offsetTop - 20, behavior: 'smooth' });
          }
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', async function () {
          await Vault.remove(SLUG, b.getAttribute('data-del'));
          renderSaved();
        });
      });
    } catch (e) {
      box.innerHTML = '<p class="vq-hint">Could not read saved reports.</p>';
    }
  }

  renderSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', itcInit);
  } else { itcInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseCsv: parseCsv, analyzeITC: analyzeITC, flagsToCsv: flagsToCsv, rowKey: rowKey };
}
