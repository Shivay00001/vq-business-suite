/* ============================================================
   VisionQuantech Business Suite — Tender Cost Estimator
   apps/tender-cost-estimator/app.js

   Pure functions first (no DOM) — tested under node.
   Bid cost buildup: direct cost heads + indirect % + contingency %
   -> total cost -> margin % -> bid price. Tender fee and EMD are
   tracked as separate upfront cash needs (EMD is refundable).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_HEADS = 25;
  var MAX_AMOUNT = 100000000000;
  var MAX_PCT = 100;

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' is too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function pct(v, name) {
    var n = Number(v === '' || v == null ? 0 : v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (n > MAX_PCT) return { ok: false, error: name + ' cannot exceed ' + MAX_PCT + '%.' };
    return { ok: true, value: n };
  }

  function optText(v, max) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > max) return { ok: false, error: 'A cost head name exceeds ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function parseDirects(raw) {
    // "name: amount" per line, e.g. "Materials: 850000"
    var lines = String(raw == null ? '' : raw).split(/\r?\n/);
    var heads = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = line.match(/^(.+?)\s*:\s*([0-9][0-9,]*\.?[0-9]*)\s*$/);
      if (!m) return { ok: false, error: 'Line ' + (i + 1) + ' must be "name: amount" — e.g. "Materials: 850000".' };
      var nm = optText(m[1], 60);
      if (!nm.ok) return nm;
      if (!nm.value) return { ok: false, error: 'Line ' + (i + 1) + ' needs a name before the colon.' };
      var amt = num(m[2].replace(/,/g, ''), 'Amount on line ' + (i + 1), 0, MAX_AMOUNT);
      if (!amt.ok) return amt;
      heads.push({ name: nm.value, amount: Math.round(amt.value * 100) / 100 });
    }
    if (heads.length > MAX_HEADS) return { ok: false, error: 'Too many cost heads (max ' + MAX_HEADS + ').' };
    if (!heads.length) return { ok: false, error: 'Enter at least one direct cost head ("name: amount" per line).' };
    return { ok: true, value: heads };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function buildup(inp) {
    inp = inp || {};
    var heads = inp.directs;
    if (typeof heads === 'string') { var ph = parseDirects(heads); if (!ph.ok) return ph; heads = ph.value; }
    if (!Array.isArray(heads) || !heads.length) return { ok: false, error: 'Direct cost heads are required.' };
    var validated = [];
    var directTotal = 0;
    for (var i = 0; i < heads.length; i++) {
      var nm = optText(heads[i].name, 60);
      if (!nm.ok) return nm;
      var amt = num(heads[i].amount, 'Direct cost "' + nm.value + '"', 0, MAX_AMOUNT);
      if (!amt.ok) return amt;
      validated.push({ name: nm.value, amount: round2(amt.value) });
      directTotal += amt.value;
    }
    directTotal = round2(directTotal);
    var ind = pct(inp.indirectPct, 'Indirect %'); if (!ind.ok) return ind;
    var con = pct(inp.contingencyPct, 'Contingency %'); if (!con.ok) return con;
    var mar = pct(inp.marginPct, 'Margin %'); if (!mar.ok) return mar;
    var fee = num(inp.tenderFee == null || inp.tenderFee === '' ? 0 : inp.tenderFee, 'Tender fee', 0, MAX_AMOUNT);
    if (!fee.ok) return fee;
    var emd = num(inp.emdAmount == null || inp.emdAmount === '' ? 0 : inp.emdAmount, 'EMD amount', 0, MAX_AMOUNT);
    if (!emd.ok) return emd;

    var indirect = round2(directTotal * ind.value / 100);
    var contingency = round2(directTotal * con.value / 100);
    var totalCost = round2(directTotal + indirect + contingency);
    var margin = round2(totalCost * mar.value / 100);
    var bidPrice = round2(totalCost + margin);
    var upfrontCash = round2(totalCost + fee.value + emd.value); // EMD refundable — tracked separately below
    var perHead = validated.map(function (h) {
      return { name: h.name, amount: h.amount, share: directTotal ? round2(h.amount / directTotal * 100) : 0 };
    });

    return {
      ok: true,
      heads: perHead,
      directTotal: directTotal,
      indirectPct: ind.value, indirect: indirect,
      contingencyPct: con.value, contingency: contingency,
      totalCost: totalCost,
      marginPct: mar.value, margin: margin,
      bidPrice: bidPrice,
      tenderFee: round2(fee.value),
      emdAmount: round2(emd.value),
      emdNote: 'EMD is refundable (no interest) — not part of the bid price; included only in upfront cash need.',
      upfrontCash: upfrontCash
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
    buildup: buildup, parseDirects: parseDirects, pct: pct,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'tender-cost-estimator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('c-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r) {
    var card = $('c-result-card');
    card.hidden = false;
    var html = '<table class="vq-table"><thead><tr><th>Buildup</th><th>Amount</th></tr></thead><tbody>';
    r.heads.forEach(function (h) {
      html += '<tr><td>' + esc(h.name) + '</td><td>' + fmtINR(h.amount) + ' <span class="vq-hint">(' + h.share + '%)</span></td></tr>';
    });
    html += '<tr><td><strong>Direct cost total</strong></td><td><strong>' + fmtINR(r.directTotal) + '</strong></td></tr>';
    html += '<tr><td>Indirect @ ' + r.indirectPct + '%</td><td>' + fmtINR(r.indirect) + '</td></tr>';
    html += '<tr><td>Contingency @ ' + r.contingencyPct + '%</td><td>' + fmtINR(r.contingency) + '</td></tr>';
    html += '<tr><td><strong>Total cost</strong></td><td><strong>' + fmtINR(r.totalCost) + '</strong></td></tr>';
    html += '<tr><td>Margin @ ' + r.marginPct + '%</td><td>' + fmtINR(r.margin) + '</td></tr>';
    html += '</tbody></table>';
    html += '<p>Recommended bid price: <span class="big">' + fmtINR(r.bidPrice) + '</span></p>';
    html += '<p class="vq-hint">Tender fee: ' + fmtINR(r.tenderFee) + ' (non-refundable) · EMD: ' + fmtINR(r.emdAmount) +
      ' (refundable, no interest). Upfront cash need ≈ <strong>' + fmtINR(r.upfrontCash) + '</strong>.</p>';
    html += '<p class="vq-hint">Estimate only — verify rates and taxes with your estimator/CA before bidding.</p>';
    $('c-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'tender-cost-estimator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'tender-cost-estimator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I estimate my bid cost for a tender?', a: 'List every direct cost head (materials, labour, transport, equipment, subcontractors), add indirect overheads as a % of direct cost, a contingency % for surprises, then your margin % on total cost. That gives the bid price.' },
      { q: 'टेंडर लागत अनुमान कैसे लगाएँ?', a: 'सभी प्रत्यक्ष लागत (सामग्री, मज़दूरी, परिवहन) लिखें, फिर अप्रत्यक्ष खर्च % और आकस्मिकता % जोड़ें — कुल लागत पर मार्जिन जोड़कर बोली मूल्य निकालें।' },
      { q: 'Is EMD part of the bid price?', a: 'No. EMD is a refundable security deposit (no interest), typically 1–2% of estimated value — track it as upfront cash, not as cost. The tender document fee is non-refundable and can be treated as a bidding expense.' },
      { q: 'कंटिंजेंसी कितनी रखें?', a: 'आमतौर पर 3–10% — जोखिम भरे या दूर-दराज़ के कार्यों में ज़्यादा। यह काम पूरा होने के बाद न बची तो मार्जिन में जुड़ जाती है।' },
      { q: 'Is this an official costing?', a: 'No — a planning estimate. Verify quantities, rates and GST with your estimator and CA before submitting the financial bid.' }
    ]);

    $('c-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('c-gate'), SLUG, FREE_LIMIT); $('c-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = buildup({
        directs: $('c-directs').value,
        indirectPct: $('c-indirect').value, contingencyPct: $('c-contingency').value,
        marginPct: $('c-margin').value, tenderFee: $('c-fee').value, emdAmount: $('c-emd').value
      });
      if (!r.ok) { msg(r.error, false); $('c-result-card').hidden = true; return; }
      msg('Estimated. ' + gate.remaining + ' free use(s) left today.', true);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
