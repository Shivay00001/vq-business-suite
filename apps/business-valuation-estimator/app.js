/* ============================================================
   VisionQuantech Business Suite — Business Valuation Estimator
   apps/business-valuation-estimator/app.js

   Pure functions first (no DOM) — tested under node.
   Three methods (revenue multiple, profit multiple, DCF-lite)
   produce a value RANGE. Every output is labelled ESTIMATE —
   this is a negotiation input, not financial advice.
   Stateless: nothing is persisted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  function validateMoney(v, label) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid ' + label + '.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (n > 100000000000) return { ok: false, error: label + ' looks too large.' };
    return { ok: true, value: n };
  }

  function validatePct(v, label, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid ' + label + '.' };
    if (n < min || n > max) return { ok: false, error: label + ' must be between ' + min + ' and ' + max + '.' };
    return { ok: true, value: n };
  }

  /** Revenue multiple: 0.75x - 1.5x typical SME; growth nudges multiple. */
  function revenueMethod(revenue, growthPct) {
    var r = validateMoney(revenue, 'annual revenue');
    if (!r.ok) return r;
    var g = validatePct(growthPct, 'revenue growth %', -50, 200);
    if (!g.ok) return g;
    var mult = g.value >= 20 ? [1.0, 2.0] : g.value >= 5 ? [0.75, 1.5] : [0.5, 1.0];
    return { ok: true, method: 'Revenue multiple',
             low: r.value * mult[0], high: r.value * mult[1],
             note: 'Applied ' + mult[0] + 'x–' + mult[1] + 'x multiple (growth ' + g.value + '%). Typical for Indian SMEs; high-growth or asset-light businesses can differ.' };
  }

  /** Profit multiple: 3x - 6x PAT. */
  function profitMethod(pat) {
    var p = validateMoney(pat, 'annual PAT (profit after tax)');
    if (!p.ok) return p;
    if (p.value === 0) return { ok: true, method: 'Profit multiple', low: 0, high: 0,
      note: 'Zero profit — buyers would value on revenue or assets instead.' };
    return { ok: true, method: 'Profit multiple',
             low: p.value * 3, high: p.value * 6,
             note: 'Applied 3x–6x PAT multiple, standard SME range in India.' };
  }

  /** DCF-lite: project FCF for n years at growth, discount at rate. Range from growth ±2%. */
  function dcfMethod(fcf, growthPct, discountPct, years) {
    var f = validateMoney(fcf, 'annual free cash flow');
    if (!f.ok) return f;
    var g = validatePct(growthPct, 'growth %', -50, 200);
    if (!g.ok) return g;
    var d = validatePct(discountPct, 'discount rate %', 5, 40);
    if (!d.ok) return d;
    var yrs = Number(years);
    if (!isFinite(yrs) || Math.floor(yrs) !== yrs || yrs < 1 || yrs > 15)
      return { ok: false, error: 'Projection years must be a whole number from 1 to 15.' };
    function pv(glow, ghigh) {
      var gL = Math.min(glow, ghigh) / 100, gH = Math.max(glow, ghigh) / 100, r = d.value / 100;
      var sL = 0, sH = 0, cfL = f.value, cfH = f.value;
      for (var t = 1; t <= yrs; t++) {
        cfL *= (1 + gL); cfH *= (1 + gH);
        sL += cfL / Math.pow(1 + r, t);
        sH += cfH / Math.pow(1 + r, t);
      }
      return [sL, sH];
    }
    var v = pv(g.value - 2, g.value + 2);
    return { ok: true, method: 'DCF-lite',
             low: v[0], high: v[1],
             note: yrs + '-year FCF projection at growth ' + (g.value - 2) + '%–' + (g.value + 2) + '%, discounted at ' + d.value + '%. Terminal value excluded — conservative.' };
  }

  /** Full estimate across all three methods. */
  function estimate(revenue, pat, growthPct, fcf, discountPct, years) {
    var rev = revenueMethod(revenue, growthPct);
    if (!rev.ok) return rev;
    var pro = profitMethod(pat);
    if (!pro.ok) return pro;
    var dcf = dcfMethod(fcf, growthPct, discountPct, years);
    if (!dcf.ok) return dcf;
    var low = Math.min(rev.low, pro.low, dcf.low);
    var high = Math.max(rev.high, pro.high, dcf.high);
    return {
      ok: true, label: 'ESTIMATE',
      methods: [rev, pro, dcf],
      range: { low: low, high: high },
      disclaimer: 'ESTIMATE only — a negotiation starting point, not financial advice. A real valuation needs a registered valuer and due diligence.'
    };
  }

  function fmtINR(n) {
    if (!isFinite(n)) return '—';
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    validateMoney: validateMoney, validatePct: validatePct,
    revenueMethod: revenueMethod, profitMethod: profitMethod,
    dcfMethod: dcfMethod, estimate: estimate,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'business-valuation-estimator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('v-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderResult(r) {
    var card = $('v-result-card');
    card.hidden = false;
    var rows = r.methods.map(function (m) {
      return '<tr><td><strong>' + esc(m.method) + '</strong><div class="vq-hint">' + esc(m.note) + '</div></td>' +
        '<td style="white-space:nowrap">' + fmtINR(m.low) + ' – ' + fmtINR(m.high) + '</td></tr>';
    }).join('');
    $('v-result').innerHTML =
      '<p class="est-tag">⚠ ESTIMATE — NOT FINANCIAL ADVICE</p>' +
      '<table class="vq-table"><thead><tr><th>Method</th><th>Range</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p>Overall estimated value range: <span class="big">' + fmtINR(r.range.low) + ' – ' + fmtINR(r.range.high) + '</span></p>' +
      '<p class="vq-hint">' + esc(r.disclaimer) + '</p>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'business-valuation-estimator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'business-valuation-estimator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How is a small business valued in India?', a: 'Common methods: revenue multiple (0.5–2x annual revenue), profit multiple (3–6x PAT), and discounted cash flow. This tool gives a range across all three — labelled an ESTIMATE.' },
      { q: 'बिज़नेस की वैल्यूएशन कैसे निकालें?', a: 'तीन तरीकों से — रेवेन्यू मल्टिपल, प्रॉफिट मल्टिपल और DCF — रेंज के रूप में। यह केवल अनुमान (ESTIMATE) है, फाइनेंशियल एडवाइस नहीं।' },
      { q: 'What multiple should I use for revenue?', a: 'Indian SMEs typically trade at 0.5–2x annual revenue depending on growth, margins and assets. This tool adjusts the multiple band by your growth rate.' },
      { q: 'What is DCF-lite?', a: 'A simplified discounted cash flow: your free cash flow projected for up to 15 years and discounted to today. Terminal value is excluded, so it is conservative.' },
      { q: 'Is this official financial advice?', a: 'No — a negotiation starting point. Selling or raising money needs a registered valuer and due diligence.' }
    ]);
    $('v-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('v-gate'), SLUG, FREE_LIMIT); $('v-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = estimate(
        $('v-revenue').value, $('v-pat').value, $('v-growth').value,
        $('v-fcf').value, $('v-discount').value, $('v-years').value
      );
      if (!r.ok) { msg(r.error, false); $('v-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
