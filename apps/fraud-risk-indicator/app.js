/* ============================================================
   VisionQuantech Business Suite — Fraud Risk Indicator
   apps/fraud-risk-indicator/app.js

   Self-assessment tool: tick the red flags you observe in your
   business (fake invoices, split purchases, ghost employees…),
   get a fraud-risk score, and see the preventive controls that
   address each flag.

   Tone: diagnostic, never accusatory. A flag is a control gap to
   close, not proof of wrongdoing. Estimate — confirm with your
   auditor/CA.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var FRAUD_FLAGS = [
    { id: 'fake-invoices', label: 'Invoices from vendors you cannot verify (no GSTIN, no address, no website)', weight: 3,
      control: 'Verify every new vendor: GSTIN on gst.gov.in, physical address, and a phone call before the first payment.' },
    { id: 'split-purchases', label: 'Purchases split into smaller bills just below an approval limit', weight: 3,
      control: 'Set approval limits on aggregate monthly spend per vendor, not per bill; review bills just under limits monthly.' },
    { id: 'ghost-employees', label: 'Salary paid to people you have never met or cannot place on the roster', weight: 3,
      control: 'Quarterly payroll-to-attendance reconciliation and a surprise headcount by someone outside HR.' },
    { id: 'no-segregation', label: 'One person handles cash AND records it in the books', weight: 3,
      control: 'Segregate duties: the person who handles cash/bank must not be the one who records it.' },
    { id: 'duplicate-invoices', label: 'Same invoice number or amount paid twice (or nearly twice)', weight: 2,
      control: 'Block duplicate invoice numbers in your accounting software; run a monthly duplicate-amount scan.' },
    { id: 'unreconciled-bank', label: 'Bank statements not reconciled for 2+ months', weight: 2,
      control: 'Monthly bank reconciliation by someone who does not operate the account.' },
    { id: 'round-cash', label: 'Frequent round-amount cash payments (₹10,000 / ₹50,000) with thin documentation', weight: 2,
      control: 'Cap cash payments, require a voucher with purpose and approver for every cash outflow.' },
    { id: 'manual-journals', label: 'Frequent manual journal entries, especially near period-end', weight: 2,
      control: 'Require maker-checker approval on manual journals; review all period-end journals.' },
    { id: 'vendor-master', label: 'Vendor bank details changed without a callback verification', weight: 2,
      control: 'Verify bank-detail changes with a call to a known number — never the number on the change request.' },
    { id: 'missing-stock', label: 'Physical stock does not match books and no one can explain the gap', weight: 2,
      control: 'Quarterly blind stock counts by staff who do not manage the store.' },
    { id: 'bypass-pressure', label: 'Staff or partners pressured to skip approvals "just this once"', weight: 1,
      control: 'Written policy: no bypass without two sign-offs; protect staff who report pressure.' },
    { id: 'related-vendors', label: 'Vendors owned by relatives of staff who approve purchases', weight: 1,
      control: 'Conflict-of-interest declaration for all purchase approvers; competitive quotes for related-party buys.' }
  ];

  function flagIds() { return FRAUD_FLAGS.map(function (f) { return f.id; }); }

  function scoreFlags(checkedIds) {
    if (!Array.isArray(checkedIds)) return { ok: false, error: 'Internal error: checklist must be an array.' };
    var seen = {}, unknown = [];
    checkedIds.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (flagIds().indexOf(id) === -1) unknown.push(id);
    });
    if (unknown.length) return { ok: false, error: 'Unknown red-flag id(s): ' + unknown.join(', ') };
    var total = 0, maxTotal = 0, triggered = [];
    FRAUD_FLAGS.forEach(function (f) {
      maxTotal += f.weight;
      if (seen[f.id]) { total += f.weight; triggered.push(f); }
    });
    var pct = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    var band = pct < 30 ? 'Low' : pct < 60 ? 'Moderate' : 'High';
    return {
      ok: true, score: total, maxScore: maxTotal, percent: pct, band: band,
      triggeredCount: triggered.length, triggered: triggered
    };
  }

  function controlsFor(result) {
    if (!result || !result.ok) return [];
    return result.triggered.map(function (f) { return { flag: f.label, control: f.control }; });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { FRAUD_FLAGS: FRAUD_FLAGS, flagIds: flagIds, scoreFlags: scoreFlags, controlsFor: controlsFor, esc: esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'fraud-risk-indicator';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('fri-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function bandClass(b) { return b === 'High' ? 'b-high' : b === 'Moderate' ? 'b-med' : 'b-low'; }

  function renderChecklist() {
    var html = '';
    FRAUD_FLAGS.forEach(function (f) {
      html += '<div class="check-row"><input type="checkbox" id="fri-' + f.id + '" value="' + f.id + '">' +
        '<label for="fri-' + f.id + '" style="margin:0">' + esc(f.label) + '</label></div>';
    });
    $('fri-list').innerHTML = html;
  }

  function renderResult(r) {
    var html = '<p>Fraud-risk score: <span class="big">' + r.percent + '%</span> ' +
      '<span class="chip ' + bandClass(r.band) + '">' + r.band + ' risk</span></p>' +
      '<p class="vq-hint">' + r.triggeredCount + ' of ' + FRAUD_FLAGS.length + ' red flags observed (' +
      r.score + '/' + r.maxScore + ' weighted points).</p>';
    if (r.triggered.length) {
      html += '<h3 class="vq-section-title">Controls to close these gaps</h3><ul class="ctrl">';
      controlsFor(r).forEach(function (c) {
        html += '<li><strong>' + esc(c.flag) + '</strong><br>' + esc(c.control) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">No red flags ticked. Keep the basics anyway: monthly bank reconciliation and segregation of cash duties.</p>';
    }
    html += '<p class="vq-hint">A ticked flag is a <strong>control gap to close</strong>, not proof of wrongdoing. This is an estimate — confirm with your auditor.</p>';
    $('fri-result').innerHTML = html;
    $('fri-result-card').hidden = false;
    $('fri-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'fraud-risk-indicator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'fraud-risk-indicator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a fraud risk indicator?', a: 'A self-assessment checklist of common fraud red flags (fake invoices, split purchases, ghost employees). Each ticked flag adds weighted points; the total gives a fraud-risk score and the controls that close each gap.' },
      { q: 'धोखाधड़ी जोखिम संकेतक क्या है?', a: 'यह एक आत्म-मूल्यांकन सूची है — नकली चालान, बंटी हुई खरीद, फर्जी कर्मचारी जैसे संकेतों को चिह्नित करें और जोखिम स्कोर व नियंत्रण उपाय पाएं।' },
      { q: 'Does a high score mean fraud is happening?', a: 'No. A ticked flag means a control gap exists, not that fraud occurred. Treat the score as "where to strengthen controls first".' },
      { q: 'What is the single most effective anti-fraud control?', a: 'Segregation of duties: the person who handles cash or bank must not be the one who records it. Monthly bank reconciliation by an independent person comes second.' },
      { q: 'Is this legal advice or an audit?', a: 'Neither. This is a self-assessment estimate. Confirm findings with your auditor or CA before taking action against anyone.' }
    ]);

    renderChecklist();

    $('fri-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('fri-gate'), SLUG, FREE_LIMIT); $('fri-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var checked = [];
      FRAUD_FLAGS.forEach(function (f) {
        if ($('fri-' + f.id).checked) checked.push(f.id);
      });
      var r = scoreFlags(checked);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._friLast = r;
    });

    $('fri-save').addEventListener('click', async function () {
      var r = window._friLast;
      if (!r) { msg('Run the assessment first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('fri-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'assess-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(),
          percent: r.percent, band: r.band, score: r.score, maxScore: r.maxScore,
          triggered: r.triggered.map(function (f) { return f.id; })
        });
        msg('Assessment saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
