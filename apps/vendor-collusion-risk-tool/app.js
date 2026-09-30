/* ============================================================
   VisionQuantech Business Suite — Vendor Collusion Risk Tool
   apps/vendor-collusion-risk-tool/app.js

   Self-assessment tool: tick the vendor-side indicators you observe
   (same-address vendors, round-amount invoices, single-bidder
   patterns, split orders…) -> collusion-risk score plus the checks
   that would confirm or rule out each indicator.

   Tone: diagnostic, never accusatory. An indicator is a pattern to
   investigate, not proof of collusion. Estimate — confirm with your
   auditor.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var SIGNS = [
    { id: 'same-address', label: 'Two or more vendors share an address, phone number or bank account', weight: 3,
      check: 'Pull the vendor master and sort by address/phone/bank — shared details across "different" vendors is the strongest single signal.' },
    { id: 'round-amounts', label: 'Many invoices for exactly round amounts (₹50,000 / ₹1,00,000)', weight: 2,
      check: 'Scan invoice amounts: genuine bills rarely land on round thousands repeatedly. Ask for the underlying measurement/work records.' },
    { id: 'single-bidder', label: 'The same vendor keeps winning, or tenders get only one bidder', weight: 3,
      check: 'Review the last 10 awards: who bid, who won, and why others dropped out. Rotate the bid-invitation list.' },
    { id: 'sequential-invoices', label: 'Invoices from "competing" vendors have sequential or near-sequential numbers', weight: 3,
      check: 'Lay the invoices side by side — sequential numbering across supposed competitors suggests one source.' },
    { id: 'split-orders', label: 'Orders split into smaller ones just under the approval limit', weight: 2,
      check: 'Aggregate spend per vendor per month; flag clusters of orders just below approval thresholds.' },
    { id: 'new-vendor-wins', label: 'A newly added vendor quickly wins large orders', weight: 2,
      check: 'Check who added the vendor, who approved it, and whether due diligence (GSTIN, address, references) was done first.' },
    { id: 'identical-bids', label: 'Competing bids use identical wording, formats or typos', weight: 3,
      check: 'Compare bid documents line by line — identical phrasing or the same typo across bidders is a classic tell.' },
    { id: 'losing-pattern', label: 'The same vendors always lose by a small margin (cover bidding)', weight: 2,
      check: 'Track win/loss margins: consistent narrow losses by the same bidders suggest the winner was pre-decided.' },
    { id: 'rush-awards', label: 'Awards rushed through as "urgent" to skip competitive quotes', weight: 2,
      check: 'Count "urgent" awards per quarter and who requested them; genuine urgency is rare and documented.' },
    { id: 'no-market-check', label: 'Prices never benchmarked against the market for 12+ months', weight: 1,
      check: 'Get fresh market quotes for your top 5 spend categories this quarter.' }
  ];

  function signIds() { return SIGNS.map(function (s) { return s.id; }); }

  function scoreSigns(checkedIds) {
    if (!Array.isArray(checkedIds)) return { ok: false, error: 'Internal error: checklist must be an array.' };
    var seen = {}, unknown = [];
    checkedIds.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (signIds().indexOf(id) === -1) unknown.push(id);
    });
    if (unknown.length) return { ok: false, error: 'Unknown indicator id(s): ' + unknown.join(', ') };
    var total = 0, maxTotal = 0, triggered = [];
    SIGNS.forEach(function (s) {
      maxTotal += s.weight;
      if (seen[s.id]) { total += s.weight; triggered.push(s); }
    });
    var pct = maxTotal ? Math.round((total / maxTotal) * 100) : 0;
    var band = pct < 30 ? 'Low' : pct < 60 ? 'Moderate' : 'High';
    return {
      ok: true, score: total, maxScore: maxTotal, percent: pct, band: band,
      triggeredCount: triggered.length, triggered: triggered
    };
  }

  function checksFor(result) {
    if (!result || !result.ok) return [];
    return result.triggered.map(function (s) { return { sign: s.label, check: s.check }; });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { SIGNS: SIGNS, signIds: signIds, scoreSigns: scoreSigns, checksFor: checksFor, esc: esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-collusion-risk-tool';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('vcr-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function bandClass(b) { return b === 'High' ? 'b-high' : b === 'Moderate' ? 'b-med' : 'b-low'; }

  function renderChecklist() {
    var html = '';
    SIGNS.forEach(function (s) {
      html += '<div class="check-row"><input type="checkbox" id="vcr-' + s.id + '" value="' + s.id + '">' +
        '<label for="vcr-' + s.id + '" style="margin:0">' + esc(s.label) + '</label></div>';
    });
    $('vcr-list').innerHTML = html;
  }

  function renderResult(r) {
    var html = '<p>Collusion-risk score: <span class="big">' + r.percent + '%</span> ' +
      '<span class="chip ' + bandClass(r.band) + '">' + r.band + ' risk</span></p>' +
      '<p class="vq-hint">' + r.triggeredCount + ' of ' + SIGNS.length + ' indicators observed (' +
      r.score + '/' + r.maxScore + ' weighted points).</p>';
    if (r.triggered.length) {
      html += '<h3 class="vq-section-title">Checks that confirm or rule out each pattern</h3><ul class="chk">';
      checksFor(r).forEach(function (c) {
        html += '<li><strong>' + esc(c.sign) + '</strong><br>' + esc(c.check) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">No indicators ticked. Keep rotating bid lists and benchmarking prices yearly anyway.</p>';
    }
    html += '<p class="vq-hint">An indicator is a <strong>pattern to investigate</strong>, never proof of collusion. This is an estimate — confirm with your auditor.</p>';
    $('vcr-result').innerHTML = html;
    $('vcr-result-card').hidden = false;
    $('vcr-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-collusion-risk-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-collusion-risk-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is vendor collusion risk?', a: 'The risk that vendors secretly coordinate — rigging bids, splitting orders, or channelling work to related firms. This tool scores 10 observable indicators (same-address vendors, sequential invoices, single-bidder patterns) and tells you how to check each one.' },
      { q: 'विक्रेता मिलीभगत जोखिम क्या है?', a: 'विक्रेताओं द्वारा गुप्त रूप से मिलकर बोली तय करने या काम बांटने का जोखिम। यह टूल 10 observable संकेतों का स्कोर देता है।' },
      { q: 'Does a high score prove collusion?', a: 'No. It means patterns worth investigating exist. Run the suggested checks first — many patterns have innocent explanations.' },
      { q: 'What is the strongest single indicator?', a: 'Different vendors sharing an address, phone or bank account — and sequential invoice numbers across supposed competitors. Both are cheap to check from your own records.' },
      { q: 'Is this legal advice?', a: 'No — it is a self-assessment estimate. Confirm findings with your auditor before taking action against any vendor.' }
    ]);

    renderChecklist();

    $('vcr-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('vcr-gate'), SLUG, FREE_LIMIT); $('vcr-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var checked = [];
      SIGNS.forEach(function (s) { if ($('vcr-' + s.id).checked) checked.push(s.id); });
      var r = scoreSigns(checked);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._vcrLast = r;
    });

    $('vcr-save').addEventListener('click', async function () {
      var r = window._vcrLast;
      if (!r) { msg('Run the assessment first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('vcr-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'assess-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(),
          percent: r.percent, band: r.band, score: r.score, maxScore: r.maxScore,
          triggered: r.triggered.map(function (s) { return s.id; })
        });
        msg('Assessment saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
