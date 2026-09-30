/* ============================================================
   VisionQuantech Business Suite — Bulk Purchase Optimizer
   apps/bulk-purchase-optimizer/app.js

   Pure functions first (no DOM) — tested under node.
   EOQ = sqrt(2·D·S / H) minimises ordering + holding cost for
   constant demand. With quantity discounts, the tool evaluates
   total annual cost (purchase + ordering + holding) at EOQ and
   at every discount break quantity, and recommends the cheapest
   option. Break-even: the discount qty wins only if its total
   cost < EOQ's total cost.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  function validateInputs(inp) {
    if (!inp || typeof inp !== 'object') return { ok: false, error: 'Inputs are required.' };
    var D = Number(inp.demand), S = Number(inp.orderCost), H = Number(inp.holdCost), P = Number(inp.unitPrice);
    if (!isFinite(D) || D <= 0) return { ok: false, error: 'Annual demand must be greater than zero.' };
    if (D > 1e9) return { ok: false, error: 'Annual demand looks too large.' };
    if (!isFinite(S) || S < 0) return { ok: false, error: 'Ordering cost per order cannot be negative.' };
    if (!isFinite(H) || H <= 0) return { ok: false, error: 'Holding cost per unit per year must be greater than zero.' };
    if (!isFinite(P) || P < 0) return { ok: false, error: 'Unit price cannot be negative.' };
    var tiers = [];
    if (Array.isArray(inp.tiers)) {
      for (var i = 0; i < inp.tiers.length; i++) {
        var t = inp.tiers[i];
        var q = Number(t.qty), d = Number(t.discount);
        if (!isFinite(q) || Math.floor(q) !== q || q <= 0) return { ok: false, error: 'Discount tier ' + (i + 1) + ': quantity must be a positive whole number.' };
        if (!isFinite(d) || d < 0 || d >= 100) return { ok: false, error: 'Discount tier ' + (i + 1) + ': discount must be 0–99%.' };
        tiers.push({ qty: q, discount: d });
      }
      tiers.sort(function (a, b) { return a.qty - b.qty; });
      for (var j = 1; j < tiers.length; j++) {
        if (tiers[j].qty === tiers[j - 1].qty) return { ok: false, error: 'Duplicate discount quantity: ' + tiers[j].qty + '.' };
      }
    }
    return { ok: true, value: { demand: D, orderCost: S, holdCost: H, unitPrice: P, tiers: tiers } };
  }

  /** Economic order quantity. */
  function eoq(D, S, H) {
    var d = Number(D), s = Number(S), h = Number(H);
    if (!isFinite(d) || d <= 0 || !isFinite(s) || s < 0 || !isFinite(h) || h <= 0) return { ok: false, error: 'Bad EOQ inputs.' };
    return { ok: true, value: Math.sqrt((2 * d * s) / h) };
  }

  /** Total annual cost at order quantity q: purchase + ordering + holding. */
  function totalCost(q, D, S, H, price) {
    var nq = Number(q);
    if (!isFinite(nq) || nq <= 0) return { ok: false, error: 'Order quantity must be positive.' };
    var tc = D * price + (D / nq) * S + (nq / 2) * H;
    return { ok: true, value: Math.round(tc * 100) / 100 };
  }

  /** Price after applying discount tiers: the best tier whose qty <= q. */
  function priceFor(q, basePrice, tiers) {
    var p = Number(basePrice), disc = 0;
    (tiers || []).forEach(function (t) { if (q >= t.qty && t.discount > disc) disc = t.discount; });
    return Math.round(p * (1 - disc / 100) * 10000) / 10000;
  }

  /**
   * Compare EOQ against each discount break quantity; return the
   * cheapest option and per-option cost breakdowns.
   */
  function bestOption(inp) {
    var v = validateInputs(inp);
    if (!v.ok) return v;
    var D = v.value.demand, S = v.value.orderCost, H = v.value.holdCost, P = v.value.unitPrice, tiers = v.value.tiers;
    var e = eoq(D, S, H);
    if (!e.ok) return e;
    var eoqQ = Math.max(1, Math.round(e.value));
    var options = [];
    var baseP = priceFor(eoqQ, P, tiers);
    var tc = totalCost(eoqQ, D, S, H, baseP);
    options.push({ label: 'EOQ', qty: eoqQ, unitPrice: baseP, discount: Math.round((1 - baseP / P) * 1000) / 10, total: tc.value, ordersPerYear: D / eoqQ });
    tiers.forEach(function (t) {
      var p = priceFor(t.qty, P, tiers);
      var c = totalCost(t.qty, D, S, H, p);
      options.push({ label: 'Discount tier', qty: t.qty, unitPrice: p, discount: t.discount, total: c.value, ordersPerYear: D / t.qty });
    });
    options.sort(function (a, b) { return a.total - b.total; });
    var winner = options[0];
    var saving = options.length > 1 ? Math.round((options[1].total - winner.total) * 100) / 100 : 0;
    return {
      ok: true, eoq: Math.round(e.value * 100) / 100,
      options: options, winner: winner, savingVsNext: saving
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
    validateInputs: validateInputs, eoq: eoq, totalCost: totalCost,
    priceFor: priceFor, bestOption: bestOption,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'bulk-purchase-optimizer';
  var FREE_LIMIT = 20;
  var MAX_SAVED = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('b-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function addTierRow(t) {
    t = t || {};
    var tbody = $('b-tiers');
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input class="vq-input b-qty" type="number" min="1" step="1" placeholder="e.g. 500" value="' + esc(t.qty == null ? '' : t.qty) + '"></td>' +
      '<td><input class="vq-input b-disc" type="number" min="0" max="99" step="0.5" placeholder="e.g. 8" value="' + esc(t.discount == null ? '' : t.discount) + '"></td>' +
      '<td><button type="button" class="vq-btn vq-btn-ghost b-del" title="Remove tier">&times;</button></td>';
    tr.querySelector('.b-del').addEventListener('click', function () { tbody.removeChild(tr); });
    tbody.appendChild(tr);
  }

  function readTiers() {
    var tiers = [], rows = $('b-tiers').rows;
    for (var i = 0; i < rows.length; i++) {
      var q = rows[i].querySelector('.b-qty').value, d = rows[i].querySelector('.b-disc').value;
      if (q === '' && d === '') continue;
      tiers.push({ qty: q, discount: d });
    }
    return tiers;
  }

  function renderResult(r) {
    var rows = r.options.map(function (o, i) {
      return '<tr' + (i === 0 ? ' class="c-winner"' : '') + '><td>' + esc(o.label) + (i === 0 ? ' ✓' : '') + '</td>' +
        '<td class="num">' + o.qty + '</td><td class="num">' + fmtINR(o.unitPrice) + '</td>' +
        '<td class="num">' + o.discount + '%</td><td class="num">' + o.ordersPerYear.toFixed(1) + '</td>' +
        '<td class="num"><strong>' + fmtINR(o.total) + '</strong></td></tr>';
    }).join('');
    $('b-result').innerHTML =
      '<p class="vq-hint">EOQ (no-discount optimum): <strong>' + r.eoq + ' units</strong> per order.</p>' +
      '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Option</th><th class="num">Order qty</th><th class="num">Unit price</th><th class="num">Discount</th><th class="num">Orders/yr</th><th class="num">Total annual cost</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<p>Recommended: order <span class="big">' + r.winner.qty + ' units</span> (' + esc(r.winner.label) + ')' +
      (r.savingVsNext > 0 ? ' — saves <strong>' + fmtINR(r.savingVsNext) + '/yr</strong> vs the next-best option' : '') + '.</p>' +
      '<p><button id="b-save" class="vq-btn vq-btn-ghost" type="button">Save this analysis</button> <span id="b-save-msg" class="vq-hint"></span></p>';
    $('b-result-card').hidden = false;
    $('b-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('b-save').addEventListener('click', function () {
      saveAnalysis(r).then(function (ok) {
        $('b-save-msg').textContent = ok ? 'Saved on this device.' : 'Save failed.';
      });
    });
  }

  async function saveAnalysis(r) {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('an:') === 0; }).sort();
      while (keys.length >= MAX_SAVED) { await Vault.remove(SLUG, keys.shift()); }
      await Vault.save(SLUG, 'an:' + Date.now(), {
        at: new Date().toISOString(),
        inputs: { demand: $('b-demand').value, orderCost: $('b-ordercost').value, holdCost: $('b-holdcost').value, unitPrice: $('b-price').value },
        eoq: r.eoq, winner: r.winner
      });
      return true;
    } catch (e) { return false; }
  }

  function init() {
    Ads.render($('ad-top'), 'bulk-purchase-optimizer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'bulk-purchase-optimizer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I calculate the economic order quantity (EOQ)?', a: 'Enter annual demand, ordering cost per order and holding cost per unit per year. EOQ = √(2 × demand × ordering cost ÷ holding cost). The tool also compares EOQ against your quantity-discount tiers and recommends the cheapest total annual cost.' },
      { q: 'EOQ कैसे निकालें?', a: 'वार्षिक मांग, प्रति ऑर्डर लागत और प्रति इकाई वार्षिक होल्डिंग लागत डालें। EOQ = √(2 × मांग × ऑर्डर लागत ÷ होल्डिंग लागत)। डिस्काउंट स्लैब के साथ तुलना करके सबसे सस्ता विकल्प सुझाया जाता है।' },
      { q: 'What is the discount break-even in bulk purchase?', a: 'A quantity-discount tier wins only when its total annual cost (purchase + ordering + holding at the discounted price) is lower than EOQ\u2019s total. Bigger discounts can lose if holding cost on the extra stock outweighs them.' },
      { q: 'बल्क डिस्काउंट ब्रेक-ईवन क्या है?', a: 'डिस्काउंट स्लैब तभी जीतता है जब उसकी कुल वार्षिक लागत (छूट वाले प्राइस पर खरीद + ऑर्डर + होल्डिंग) EOQ की कुल लागत से कम हो।' },
      { q: 'What assumptions does EOQ make?', a: 'Constant demand, fixed ordering cost, holding cost proportional to stock, no stockouts, and instant replenishment. It is a planning guide, not a guarantee — confirm with your inventory reality.' },
      { q: 'Is my data stored online?', a: 'No. Up to 25 analyses are saved in your browser vault on this device only.' }
    ]);

    addTierRow({ qty: 500, discount: 5 });
    addTierRow({ qty: 1000, discount: 10 });

    $('b-add-tier').addEventListener('click', function () { addTierRow(); });

    $('b-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); $('b-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = bestOption({
        demand: $('b-demand').value, orderCost: $('b-ordercost').value,
        holdCost: $('b-holdcost').value, unitPrice: $('b-price').value, tiers: readTiers()
      });
      if (!r.ok) { msg(r.error, false); $('b-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
