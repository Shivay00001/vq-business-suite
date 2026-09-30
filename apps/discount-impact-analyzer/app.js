/* ============================================================
   VisionQuantech Business Suite — Discount Impact Analyzer
   apps/discount-impact-analyzer/app.js

   Breakeven uplift after a discount, derived from margin math:
     Old profit/unit = p - c = m·p   (m = margin on price)
     New profit/unit = p(1-d) - c    (d = discount on price)
                   = p·(m - d)
     Keep total profit flat: q·p·m = q'·p·(m-d)
       => q'/q = m / (m - d)
       => required sales uplift = d / (m - d)

   So a 10% discount at 40% margin needs 0.10/(0.40-0.10) = 33.33%
   more units just to earn the same rupees. If d >= m the discount
   wipes out per-unit profit and no volume can fix it.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SAVE = 25;

  function pct(v, name, opts) {
    opts = opts || {};
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid percentage.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    var max = opts.max == null ? 100 : opts.max;
    if (n > max) return { ok: false, error: name + ' cannot exceed ' + max + '%.' };
    return { ok: true, value: n };
  }

  function num(v, name, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    return { ok: true, value: n };
  }

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  /**
   * Required volume uplift to keep profit flat after a discount.
   * marginPct, discountPct as percentages (e.g. 40, 10).
   * Returns {ok, feasible, upliftPct, ratio} — feasible:false when d >= m.
   */
  function requiredUplift(marginPct, discountPct) {
    var m = pct(marginPct, 'Current margin %');
    if (!m.ok) return m;
    var d = pct(discountPct, 'Discount %');
    if (!d.ok) return d;
    if (m.value <= 0) return { ok: false, error: 'Margin must be above zero — with zero margin any discount is a loss.' };
    if (d.value <= 0) return { ok: false, error: 'Discount must be above zero.' };
    var mf = m.value / 100, df = d.value / 100;
    if (df >= mf) {
      return {
        ok: true, feasible: false,
        upliftPct: Infinity, ratio: Infinity,
        reason: 'Discount (' + d.value + '%) is at/above your margin (' + m.value + '%). Every discounted unit loses money — no sales volume can recover the profit.'
      };
    }
    var uplift = df / (mf - df);
    return {
      ok: true, feasible: true,
      upliftPct: r1(uplift * 100), ratio: r2(1 + uplift),
      exactUpliftPct: uplift * 100, exactRatio: 1 + uplift,
      reason: 'You need ' + r1(uplift * 100) + '% more units (×' + r2(1 + uplift) + ' volume) to earn the same total profit.'
    };
  }

  /**
   * Rupee comparison at current volume + the required volume.
   * opts: {price, unitCost, volume, discountPct}
   */
  function profitComparison(opts) {
    opts = opts || {};
    var p = num(opts.price, 'Selling price'); if (!p.ok) return p;
    var c = num(opts.unitCost, 'Unit cost', true); if (!c.ok) return c;
    var v = num(opts.volume, 'Monthly volume'); if (!v.ok) return v;
    var d = pct(opts.discountPct, 'Discount %'); if (!d.ok) return d;
    if (c.value >= p.value) return { ok: false, error: 'Unit cost must be below selling price (margin must be positive).' };

    var marginPct = r2((p.value - c.value) / p.value * 100);
    var up = requiredUplift(marginPct, d.value);
    if (!up.ok) return up;
    var oldProfit = r2((p.value - c.value) * v.value);
    var newPrice = r2(p.value * (1 - d.value / 100));
    var newUnitProfit = r2(newPrice - c.value);
    var newProfitSameVol = r2(newUnitProfit * v.value);
    var reqVol = up.feasible ? Math.ceil(v.value * up.exactRatio) : 0;
    var profitAtReqVol = up.feasible ? r2(newUnitProfit * reqVol) : 0;
    return {
      ok: true,
      price: p.value, newPrice: newPrice, unitCost: c.value,
      marginPct: marginPct, discountPct: d.value, volume: v.value,
      oldProfit: oldProfit, newUnitProfit: newUnitProfit,
      newProfitSameVol: newProfitSameVol,
      profitLostSameVol: r2(oldProfit - newProfitSameVol),
      feasible: up.feasible, requiredUpliftPct: up.feasible ? up.upliftPct : null,
      requiredVolume: reqVol, profitAtRequiredVolume: profitAtReqVol,
      reason: up.feasible ? up.reason : up.reason
    };
  }

  /** Uplift table for a given margin across standard discount steps. */
  function upliftTable(marginPct) {
    var m = pct(marginPct, 'Current margin %');
    if (!m.ok) return m;
    if (m.value <= 0) return { ok: false, error: 'Margin must be above zero.' };
    var steps = [5, 10, 15, 20, 25, 30, 40, 50];
    var rows = steps.map(function (d) {
      var u = requiredUplift(m.value, d);
      return {
        discountPct: d,
        feasible: u.feasible,
        upliftPct: u.feasible ? u.upliftPct : null,
        note: u.feasible ? '' : 'loss-making'
      };
    });
    return { ok: true, marginPct: m.value, rows: rows };
  }

  /** Saved-analysis store helper: max 25 records, newest first. */
  function addRecord(records, rec) {
    records = Array.isArray(records) ? records : [];
    if (records.length >= MAX_SAVE) {
      return { ok: false, error: 'Saved list is full (max 25). Delete an old record first.' };
    }
    var label = String(rec && rec.label != null ? rec.label : '').slice(0, 60);
    if (!label) return { ok: false, error: 'Give the record a short label (e.g. "Diwali 15% off").' };
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
    MAX_SAVE: MAX_SAVE, requiredUplift: requiredUplift,
    profitComparison: profitComparison, upliftTable: upliftTable,
    addRecord: addRecord, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'discount-impact-analyzer';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('di-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function val(id) { return $(id).value; }

  function renderUpliftTable(margin) {
    var t = upliftTable(margin);
    if (!t.ok) return '';
    return '<h3 class="vq-section-title">Uplift needed at ' + t.marginPct + '% margin</h3>' +
      '<table class="vq-table"><thead><tr><th>Discount</th><th style="text-align:right">Sales uplift needed</th><th>Verdict</th></tr></thead><tbody>' +
      t.rows.map(function (r) {
        return '<tr><td>' + r.discountPct + '%</td>' +
          '<td style="text-align:right">' + (r.feasible ? '<strong>' + r.upliftPct + '%</strong>' : '—') + '</td>' +
          '<td>' + (r.feasible ? 'Recoverable' : '<span class="msg-err">Loss-making</span>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderResult(r) {
    var card = $('di-result-card');
    card.hidden = false;
    var html;
    if (!r.ok) { html = '<p class="msg-err">' + esc(r.error) + '</p>'; }
    else {
      html =
        '<p class="vq-hint">Current margin: <strong>' + r.marginPct + '%</strong> · Discount: <strong>' + r.discountPct + '%</strong></p>' +
        '<table class="vq-table"><tbody>' +
        '<tr><td>Price after discount</td><td style="text-align:right">' + fmtINR(r.newPrice) + ' <span class="vq-hint">(was ' + fmtINR(r.price) + ')</span></td></tr>' +
        '<tr><td>Profit / unit after discount</td><td style="text-align:right">' + fmtINR(r.newUnitProfit) + '</td></tr>' +
        '<tr><td>Monthly profit today (' + r.volume.toLocaleString('en-IN') + ' units)</td><td style="text-align:right"><strong>' + fmtINR(r.oldProfit) + '</strong></td></tr>' +
        '<tr><td>Monthly profit after discount, same volume</td><td style="text-align:right"><strong>' + fmtINR(r.newProfitSameVol) + '</strong></td></tr>' +
        '<tr><td>Profit lost at same volume</td><td style="text-align:right"><span class="msg-err">' + fmtINR(r.profitLostSameVol) + '</span></td></tr>' +
        '</tbody></table>' +
        (r.feasible
          ? '<p>To earn the same profit you need <span class="big">' + r.requiredUpliftPct + '%</span> more units — ' +
            '<strong>' + r.requiredVolume.toLocaleString('en-IN') + '</strong> units/month <span lang="hi">(छूट के बाद इतनी बिक्री चाहिए)</span>.</p>' +
            '<p class="vq-hint">Formula: required uplift = d ÷ (m − d) = ' + r.discountPct + ' ÷ (' + r.marginPct + ' − ' + r.discountPct + ').</p>'
          : '<p class="msg-err">' + esc(r.reason) + '</p>') +
        renderUpliftTable(r.marginPct);
    }
    $('di-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'discount-impact-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'discount-impact-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How much extra sales do I need after giving a discount?', a: 'Required uplift = discount ÷ (margin − discount). A 10% discount at 40% margin needs 10 ÷ (40 − 10) = 33.3% more units to earn the same total profit.' },
      { q: 'छूट देने के बाद कितनी ज़्यादा बिक्री चाहिए?', a: 'ज़रूरी बढ़ोतरी = छूट ÷ (मार्जिन − छूट)। 40% मार्जिन पर 10% छूट के लिए 33.3% ज़्यादा यूनिट बेचनी होंगी ताकि कुल मुनाफ़ा बराबर रहे।' },
      { q: 'When does a discount become unrecoverable?', a: 'When the discount % equals or exceeds your margin %. Then every discounted unit loses money and no volume can fix it — the only options are a smaller discount or a lower cost.' },
      { q: 'Does this account for fixed costs?', a: 'The formula uses contribution margin per unit, so it holds as long as fixed costs do not change with the discount. If the discount needs extra staff or ad spend, add that to your unit cost first.' },
      { q: 'Is this margin on price or on cost?', a: 'Margin on selling price: (price − cost) ÷ price. The d ÷ (m − d) formula requires margin measured on price, which is the standard retail definition.' }
    ]);

    $('di-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('di-gate'), SLUG, FREE_LIMIT); $('di-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = profitComparison({
        price: val('di-price'), unitCost: val('di-cost'),
        volume: val('di-volume'), discountPct: val('di-discount')
      });
      if (!r.ok) { msg(r.error, false); $('di-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
