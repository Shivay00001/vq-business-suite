/* ============================================================
   VisionQuantech Business Suite — Cost Buildup Calculator
   apps/cost-buildup-calculator/app.js

   Landed (per-unit) cost buildup for Indian manufacturers/traders:
     total pre-GST cost = material + labour + overhead + freight
     GST on inputs: if ITC is claimable it is NOT a cost;
                    if not (composition/exempt/composite supply) it is.
     landed total   = pre-GST cost (+ input GST if ITC not claimable)
     per-unit cost  = landed total / units
     suggested MRP  = per-unit cost / (1 - target margin)

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMT = 10000000000;
  var MAX_UNITS = 1000000000;
  var MAX_SAVE = 25;

  function num(v, name, opts) {
    opts = opts || {};
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    var min = opts.allowZero === false ? 0 : 0;
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (opts.allowZero === false && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > (opts.max || MAX_AMT)) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * Landed cost breakup.
   * opts: {material, labour, overhead, freight, units, gstRate, itc ('yes'|'no'), targetMargin}
   */
  function landedCost(opts) {
    opts = opts || {};
    var fields = [
      ['material', 'Material cost'], ['labour', 'Labour cost'],
      ['overhead', 'Overhead cost'], ['freight', 'Freight/inward cost']
    ];
    var vals = {};
    for (var i = 0; i < fields.length; i++) {
      var r = num(opts[fields[i][0]], fields[i][1]);
      if (!r.ok) return r;
      vals[fields[i][0]] = r.value;
    }
    var u = num(opts.units, 'Units', { allowZero: false, max: MAX_UNITS });
    if (!u.ok) return u;
    var g = num(opts.gstRate, 'GST rate on inputs', { max: 100 });
    if (!g.ok) return g;
    var tm = opts.targetMargin === '' || opts.targetMargin == null
      ? { ok: true, value: 0 }
      : num(opts.targetMargin, 'Target margin %', { max: 99.99 });
    if (!tm.ok) return tm;

    var preGst = vals.material + vals.labour + vals.overhead + vals.freight;
    var inputGst = r2(preGst * g.value / 100);
    var itc = opts.itc === 'yes';
    var landed = r2(preGst + (itc ? 0 : inputGst));
    var perUnit = r2(landed / u.value);
    var suggested = tm.value > 0 ? r2(perUnit / (1 - tm.value / 100)) : 0;

    var breakup = [
      { label: 'Material', amount: r2(vals.material), share: preGst ? r2(vals.material / preGst * 100) : 0 },
      { label: 'Labour', amount: r2(vals.labour), share: preGst ? r2(vals.labour / preGst * 100) : 0 },
      { label: 'Overhead', amount: r2(vals.overhead), share: preGst ? r2(vals.overhead / preGst * 100) : 0 },
      { label: 'Freight / inward', amount: r2(vals.freight), share: preGst ? r2(vals.freight / preGst * 100) : 0 }
    ];

    return {
      ok: true,
      preGst: r2(preGst), inputGst: inputGst, itcClaimable: itc,
      landed: landed, units: u.value, perUnit: perUnit,
      targetMargin: tm.value, suggestedPrice: suggested,
      breakup: breakup
    };
  }

  /** Saved-calculation store helper: max 25 records, newest first. */
  function addRecord(records, rec) {
    records = Array.isArray(records) ? records : [];
    if (records.length >= MAX_SAVE) {
      return { ok: false, error: 'Saved list is full (max 25). Delete an old record first.' };
    }
    var label = String(rec && rec.label != null ? rec.label : '').slice(0, 60);
    if (!label) return { ok: false, error: 'Give the record a short label (e.g. "Widget batch Aug").' };
    return { ok: true, records: [{ label: label, at: new Date().toISOString(), data: rec.data || null }].concat(records) };
  }

  function fmtINR(n) {
    var v = r2(+n || 0);
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_SAVE: MAX_SAVE, landedCost: landedCost,
    addRecord: addRecord, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cost-buildup-calculator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('cb-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function val(id) { return $(id).value; }

  function renderResult(r) {
    var card = $('cb-result-card');
    card.hidden = false;
    var html;
    if (!r.ok) { html = '<p class="msg-err">' + esc(r.error) + '</p>'; }
    else {
      html = '<table class="vq-table"><thead><tr><th>Cost head</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th></tr></thead><tbody>' +
        r.breakup.map(function (b) {
          return '<tr><td>' + esc(b.label) + '</td><td style="text-align:right">' + fmtINR(b.amount) + '</td><td style="text-align:right">' + b.share.toFixed(1) + '%</td></tr>';
        }).join('') +
        '<tr><td><strong>Pre-GST cost</strong></td><td style="text-align:right"><strong>' + fmtINR(r.preGst) + '</strong></td><td style="text-align:right">100%</td></tr>' +
        '<tr><td>Input GST @ rate ' + (r.itcClaimable ? '(ITC claimable — not a cost)' : '(ITC NOT claimable — added to cost)') + '</td><td style="text-align:right">' + fmtINR(r.inputGst) + '</td><td></td></tr>' +
        '<tr><td><strong>Landed cost (' + r.units.toLocaleString('en-IN') + ' units)</strong></td><td style="text-align:right"><strong>' + fmtINR(r.landed) + '</strong></td><td></td></tr>' +
        '</tbody></table>' +
        '<p>Landed cost per unit: <span class="big">' + fmtINR(r.perUnit) + '</span></p>' +
        (r.targetMargin > 0
          ? '<p class="vq-hint">Suggested price at ' + r.targetMargin + '% margin on price: <strong>' + fmtINR(r.suggestedPrice) + '</strong> <span lang="hi">(लागत + मार्जिन मूल्य)</span></p>'
          : '<p class="vq-hint">Add a target margin % to get a suggested selling price.</p>') +
        '<div class="vq-field" style="margin-top:1rem"><label for="cb-label">Save this buildup as</label>' +
        '<input id="cb-label" maxlength="60" placeholder="e.g. Diwali batch costing"></div>' +
        '<button id="cb-save" class="vq-btn vq-btn-secondary" type="button">Save buildup</button>' +
        '<p id="cb-save-msg" class="vq-hint" aria-live="polite"></p>' +
        '<div id="cb-saved"></div>';
    }
    $('cb-result').innerHTML = html;
    var sv = $('cb-save');
    if (sv) sv.addEventListener('click', function () { saveCurrent(r); });
    loadSaved();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveCurrent(r) {
    var label = $('cb-label').value;
    Vault.list(SLUG).then(function (idx) {
      var recs = (idx || []).map(function (k) { return { label: k }; });
      var ar = addRecord(recs.map(function (x) { return x.label ? x : x; }), { label: label, data: r });
      if (!ar.ok) { $('cb-save-msg').textContent = ar.error; return; }
      Vault.save(SLUG, 'buildup:' + Date.now(), { label: label, data: r }).then(function () {
        $('cb-save-msg').textContent = 'Saved on this device.';
        loadSaved();
      });
    });
  }

  function loadSaved() {
    var wrap = $('cb-saved');
    if (!wrap) return;
    Vault.list(SLUG).then(function (idx) {
      if (!idx || !idx.length) { wrap.innerHTML = '<p class="vq-hint">No saved buildups yet.</p>'; return; }
      wrap.innerHTML = '<p class="vq-hint"><strong>Saved buildups (' + idx.length + '/25):</strong></p>' +
        '<ul class="vq-list">' + idx.slice(0, 25).map(function (k) {
          return '<li>' + esc(String(k).replace(/^buildup:\d+$/, 'saved buildup')) +
            ' <button type="button" class="vq-link" data-del="' + esc(k) + '">delete</button></li>';
        }).join('') + '</ul>';
      wrap.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          Vault.remove(SLUG, b.getAttribute('data-del')).then(loadSaved);
        });
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'cost-buildup-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cost-buildup-calculator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I calculate landed cost per unit?', a: 'Add material + labour + overhead + freight to get total pre-GST cost. If input tax credit (ITC) is claimable, GST on inputs is not a cost; if not claimable, add it. Divide the landed total by the number of units.' },
      { q: 'लैंडेड कॉस्ट प्रति यूनिट कैसे निकालें?', a: 'मैटेरियल + लेबर + ओवरहेड + फ्रेट जोड़ें = प्री-GST लागत। ITC मिलता है तो GST लागत नहीं, नहीं मिलता तो जोड़ें। कुल को यूनिट्स से भाग दें।' },
      { q: 'Is GST on inputs part of product cost?', a: 'Only when you cannot claim input tax credit — e.g. composition dealers, exempt supplies, or personal-use inputs. Regular GST-registered businesses claim ITC, so GST is not a cost.' },
      { q: 'How do I set a selling price from landed cost?', a: 'Price = landed cost per unit ÷ (1 − target margin). For a 30% margin on price with ₹73.16 landed cost: 73.16 ÷ 0.70 = ₹104.51.' },
      { q: 'What is usually missed in cost buildup?', a: 'Inward freight, packaging, wastage, payment-gateway or marketplace commissions, and the GST-ITC treatment are the most commonly missed cost heads.' }
    ]);

    $('cb-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('cb-gate'), SLUG, FREE_LIMIT); $('cb-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = landedCost({
        material: val('cb-material'), labour: val('cb-labour'), overhead: val('cb-overhead'),
        freight: val('cb-freight'), units: val('cb-units'), gstRate: val('cb-gst'),
        itc: $('cb-itc').checked ? 'yes' : 'no', targetMargin: val('cb-margin')
      });
      if (!r.ok) { msg(r.error, false); $('cb-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
