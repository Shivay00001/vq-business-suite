/* ============================================================
   VisionQuantech Business Suite — Vendor Rate Analyzer
   apps/vendor-rate-analyzer/app.js

   Pure functions first (no DOM) — tested under node.
   Accepts rate history (item, vendor, rate, date) pasted or
   uploaded as CSV, detects price hikes vs the previous quote
   and vs the item's lowest-ever rate, and names the best
   (cheapest latest) vendor per item. Saves snapshots (max 25)
   in the on-device vault.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_QUOTES = 2000;
  var MAX_SNAPSHOTS = 25;

  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }

  function validateQuote(q) {
    if (!q || typeof q !== 'object') return { ok: false, error: 'Quote must be an object.' };
    var item = String(q.item || '').trim();
    if (!item) return { ok: false, error: 'Item name is required.' };
    if (item.length > 120) return { ok: false, error: 'Item name too long (max 120).' };
    var vendor = String(q.vendor || '').trim();
    if (!vendor) return { ok: false, error: 'Vendor name is required.' };
    if (vendor.length > 120) return { ok: false, error: 'Vendor name too long (max 120).' };
    var rate = Number(q.rate);
    if (!isFinite(rate) || rate <= 0) return { ok: false, error: 'Rate must be greater than zero.' };
    if (rate > 1e9) return { ok: false, error: 'Rate looks too large.' };
    if (!isDateStr(q.date)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    return { ok: true, value: { item: item, vendor: vendor, rate: rate, date: q.date } };
  }

  /** Parse CSV text: header item,vendor,rate,date (order-insensitive, case-insensitive). */
  function parseCSV(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Paste or upload CSV data first.' };
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { ok: false, error: 'CSV needs a header row plus at least one data row.' };
    if (lines.length - 1 > MAX_QUOTES) return { ok: false, error: 'Too many rows (max ' + MAX_QUOTES + ' quotes).' };
    var head = splitRow(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var need = ['item', 'vendor', 'rate', 'date'];
    var idx = {};
    for (var i = 0; i < need.length; i++) {
      var p = head.indexOf(need[i]);
      if (p === -1) return { ok: false, error: 'Header must contain: item, vendor, rate, date.' };
      idx[need[i]] = p;
    }
    var quotes = [], errors = [];
    for (var r = 1; r < lines.length; r++) {
      if (!lines[r].trim()) continue;
      var cols = splitRow(lines[r]);
      var q = validateQuote({
        item: cols[idx.item], vendor: cols[idx.vendor], rate: cols[idx.rate], date: cols[idx.date]
      });
      if (q.ok) quotes.push(q.value);
      else errors.push('Row ' + (r + 1) + ': ' + q.error);
    }
    if (!quotes.length) return { ok: false, error: 'No valid quotes. ' + errors.slice(0, 3).join(' ') };
    quotes.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { ok: true, quotes: quotes, skipped: errors.length, sampleErrors: errors.slice(0, 5) };
  }

  function splitRow(line) {
    // simple CSV: handles quoted fields with commas
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (c) { return c.trim(); });
  }

  function hikePct(newRate, oldRate) {
    var nr = Number(newRate), or = Number(oldRate);
    if (!isFinite(nr) || !isFinite(or) || or <= 0) return null;
    return Math.round(((nr - or) / or) * 10000) / 100;
  }

  /** Group quotes by item: latest quote per vendor + item summary. */
  function groupByItem(quotes) {
    var map = {};
    quotes.forEach(function (q) {
      (map[q.item] = map[q.item] || []).push(q);
    });
    var items = Object.keys(map).sort().map(function (item) {
      var qs = map[item].slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var latestByVendor = {};
      qs.forEach(function (q) { latestByVendor[q.vendor] = q; });
      var latest = Object.keys(latestByVendor).map(function (v) { return latestByVendor[v]; });
      latest.sort(function (a, b) { return a.rate - b.rate; });
      var minRate = Math.min.apply(null, qs.map(function (q) { return q.rate; }));
      return { item: item, quotes: qs, latestByVendor: latest, minRate: minRate };
    });
    return items;
  }

  /** Best (cheapest latest-quote) vendor per item. */
  function bestVendorPerItem(quotes) {
    if (!Array.isArray(quotes) || !quotes.length) return { ok: false, error: 'No quotes to analyse.' };
    var items = groupByItem(quotes);
    return {
      ok: true,
      value: items.map(function (it) {
        var b = it.latestByVendor[0];
        var minAll = Math.min.apply(null, it.latestByVendor.map(function (q) { return q.rate; }));
        return {
          item: it.item, vendor: b.vendor, rate: b.rate, date: b.date,
          vendors: it.latestByVendor.length,
          vsLowest: hikePct(b.rate, minAll) // 0 for the best itself
        };
      })
    };
  }

  /**
   * Hike detection per item: compares each vendor's latest rate vs its
   * previous quote from the same vendor, and vs the item's lowest-ever rate.
   * thresholdPct: flag when hike >= threshold.
   */
  function detectHikes(quotes, thresholdPct) {
    var thr = Number(thresholdPct);
    if (!isFinite(thr) || thr < 0 || thr > 1000) return { ok: false, error: 'Threshold % must be 0–1000.' };
    if (!Array.isArray(quotes) || !quotes.length) return { ok: false, error: 'No quotes to analyse.' };
    var items = groupByItem(quotes);
    var hikes = [];
    items.forEach(function (it) {
      it.latestByVendor.forEach(function (lq) {
        var own = it.quotes.filter(function (q) { return q.vendor === lq.vendor && q.date < lq.date; });
        var prev = own.length ? own[own.length - 1] : null;
        var hikeVsPrev = prev ? hikePct(lq.rate, prev.rate) : null;
        var hikeVsLow = hikePct(lq.rate, it.minRate);
        var flag = (hikeVsPrev != null && hikeVsPrev >= thr) || (hikeVsLow >= thr);
        if (flag) {
          hikes.push({
            item: it.item, vendor: lq.vendor, rate: lq.rate, date: lq.date,
            prevRate: prev ? prev.rate : null, prevDate: prev ? prev.date : null,
            hikeVsPrev: hikeVsPrev, hikeVsLowest: hikeVsLow
          });
        }
      });
    });
    hikes.sort(function (a, b) { return (b.hikeVsLowest || 0) - (a.hikeVsLowest || 0); });
    return { ok: true, hikes: hikes, items: items.length, quotes: quotes.length };
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
    MAX_QUOTES: MAX_QUOTES, MAX_SNAPSHOTS: MAX_SNAPSHOTS,
    isDateStr: isDateStr, validateQuote: validateQuote,
    parseCSV: parseCSV, splitRow: splitRow, hikePct: hikePct,
    groupByItem: groupByItem, bestVendorPerItem: bestVendorPerItem,
    detectHikes: detectHikes, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-rate-analyzer';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('r-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var SAMPLE = 'item,vendor,rate,date\nA4 paper 75gsm,Gupta Enterprises,240,2026-06-02\nA4 paper 75gsm,Gupta Enterprises,265,2026-09-10\nA4 paper 75gsm,Sharma Paper Co,252,2026-09-12\nToner cartridge 88A,Gupta Enterprises,1150,2026-07-01\nToner cartridge 88A,Khan Suppliers,1090,2026-09-15';

  function renderAnalysis(quotes, thr) {
    var best = bestVendorPerItem(quotes);
    var hikes = detectHikes(quotes, thr);
    var bestRows = best.ok ? best.value.map(function (b) {
      return '<tr><td><strong>' + esc(b.item) + '</strong><br><span class="vq-hint">' + b.vendors + ' vendor(s)</span></td>' +
        '<td>' + esc(b.vendor) + '<br><span class="vq-hint">' + esc(b.date) + '</span></td>' +
        '<td class="num"><strong>' + fmtINR(b.rate) + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="3">' + esc(best.error) + '</td></tr>';

    var hikeRows = hikes.ok && hikes.hikes.length ? hikes.hikes.map(function (h) {
      return '<tr class="r-flag"><td><strong>' + esc(h.item) + '</strong></td><td>' + esc(h.vendor) + '</td>' +
        '<td class="num">' + fmtINR(h.rate) + '</td><td class="num">' + (h.hikeVsPrev == null ? '—' : (h.hikeVsPrev > 0 ? '+' : '') + h.hikeVsPrev + '%') + '</td>' +
        '<td class="num">+' + h.hikeVsLowest + '%</td></tr>';
    }).join('') : '<tr><td colspan="5"><span class="msg-ok">No hikes at or above ' + esc(thr) + '% — rates look stable.</span></td></tr>';

    $('r-result').innerHTML =
      '<p class="vq-hint">' + quotes.length + ' quotes across ' + (best.ok ? best.value.length : 0) + ' item(s). Latest quote per vendor is used for "best vendor".</p>' +
      '<h4>Best vendor per item (cheapest latest quote)</h4>' +
      '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Item</th><th>Vendor</th><th class="num">Rate</th></tr></thead><tbody>' + bestRows + '</tbody></table></div>' +
      '<h4>Rate hikes ≥ ' + esc(thr) + '%</h4>' +
      '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Item</th><th>Vendor</th><th class="num">Latest rate</th><th class="num">vs prev (same vendor)</th><th class="num">vs lowest ever</th></tr></thead><tbody>' + hikeRows + '</tbody></table></div>' +
      '<p><button id="r-save" class="vq-btn vq-btn-ghost" type="button">Save snapshot</button> <span id="r-save-msg" class="vq-hint"></span></p>';
    $('r-result-card').hidden = false;
    $('r-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('r-save').addEventListener('click', function () {
      saveSnapshot(quotes, thr).then(function (ok) {
        $('r-save-msg').textContent = ok ? 'Saved on this device.' : 'Save failed.';
      });
    });
  }

  async function saveSnapshot(quotes, thr) {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('snap:') === 0; }).sort();
      while (keys.length >= MAX_SNAPSHOTS) { await Vault.remove(SLUG, keys.shift()); }
      await Vault.save(SLUG, 'snap:' + Date.now(), { at: new Date().toISOString(), quotes: quotes, threshold: thr });
      return true;
    } catch (e) { return false; }
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-rate-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-rate-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I analyse vendor rate hikes?', a: 'Paste or upload a CSV with columns item, vendor, rate, date. The tool flags each vendor\u2019s latest rate when it is up by your threshold versus its previous quote from the same vendor or versus the item\u2019s lowest-ever rate, and names the cheapest latest vendor per item.' },
      { q: 'वेंडर रेट बढ़ोतरी का विश्लेषण कैसे करें?', a: 'item, vendor, rate, date कॉलम वाला CSV पेस्ट या अपलोड करें। टूल हर आइटम के लिए सबसे सस्ता विक्रेता बताएगा और तय सीमा से ज़्यादा बढ़ोतरी को फ़्लैग करेगा।' },
      { q: 'What CSV format is accepted?', a: 'A header row containing item, vendor, rate, date (any order), then one quote per row. Quoted fields with commas are supported. A sample is pre-filled so you can try it instantly.' },
      { q: 'CSV फॉर्मेट क्या होना चाहिए?', a: 'हेडर में item, vendor, rate, date (किसी भी क्रम में), फिर हर पंक्ति में एक कोटेशन। नमूना पहले से भरा है।' },
      { q: 'What does "best vendor" mean here?', a: 'For each item, the vendor with the cheapest most-recent quote. It does not account for quality, lead time or credit terms — use the Vendor Comparison Tool for a weighted choice.' },
      { q: 'Is my rate data stored online?', a: 'No. Up to 25 analysis snapshots are saved in your browser vault on this device only.' }
    ]);

    $('r-csv').value = SAMPLE;

    $('r-file').addEventListener('change', function () {
      var f = $('r-file').files[0];
      if (!f) return;
      var MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB cap: parsed client-side, larger files freeze the tab
      if (f.size > MAX_CSV_BYTES) { msg('File too large (' + Math.round(f.size / 1024) + ' KB) — cap is 2 MB. Split the CSV and retry.', false); $('r-file').value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () { $('r-csv').value = String(reader.result || ''); msg('File loaded: ' + f.name, true); };
      reader.readAsText(f);
    });

    $('r-analyze').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); $('r-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var p = parseCSV($('r-csv').value);
      if (!p.ok) { msg(p.error, false); $('r-result-card').hidden = true; return; }
      var thr = Number($('r-thr').value);
      if (!isFinite(thr) || thr < 0 || thr > 1000) { msg('Threshold % must be 0–1000.', false); return; }
      msg(p.quotes.length + ' quotes loaded' + (p.skipped ? ' (' + p.skipped + ' rows skipped)' : '') + '.', true);
      renderAnalysis(p.quotes, thr);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
