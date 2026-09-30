/* ============================================================
   VisionQuantech Business Suite — Year-End Closure Assistant
   apps/year-end-closure-assistant/app.js

   Financial-year closing checklist for India (FY ends 31 March):
   stock count, debtor/creditor confirmations, provisions,
   depreciation blocks, reconciliations. Tracks progress and
   flags mandatory items still open.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var ITEMS = [
    { id: 'stock-count', label: 'Physical stock count completed and matched with books', phase: 'Books', mandatory: true },
    { id: 'debtor-confirm', label: 'Debtor balances confirmed in writing (top debtors at minimum)', phase: 'Reconcile', mandatory: true },
    { id: 'creditor-confirm', label: 'Creditor balances confirmed; mismatches investigated', phase: 'Reconcile', mandatory: true },
    { id: 'bank-reco', label: 'All bank accounts reconciled up to 31 March', phase: 'Reconcile', mandatory: true },
    { id: 'cash-count', label: 'Physical cash counted and matched with cash book on 31 March', phase: 'Books', mandatory: true },
    { id: 'provisions', label: 'Provisions made: audit fees, bonus, doubtful debts, expenses payable', phase: 'Provisions', mandatory: true },
    { id: 'depreciation', label: 'Depreciation charged per applicable block/rate (Companies Act / IT Act)', phase: 'Provisions', mandatory: true },
    { id: 'prepaid-outstanding', label: 'Prepaid expenses and outstanding expenses recorded', phase: 'Provisions', mandatory: true },
    { id: 'tds-reco', label: 'TDS deducted vs 26AS/AIS reconciled; Q4 return filed', phase: 'Reconcile', mandatory: true },
    { id: 'gst-books', label: 'GST books vs GSTR-1/GSTR-3B reconciled; ITC matched with GSTR-2B', phase: 'Reconcile', mandatory: true },
    { id: 'drawings-capital', label: 'Proprietor/partner drawings separated from business expenses', phase: 'Books', mandatory: false },
    { id: 'fixed-assets', label: 'Fixed-asset register updated with additions/deletions of the year', phase: 'Books', mandatory: false },
    { id: 'related-party', label: 'Related-party and loan balances documented', phase: 'Books', mandatory: false },
    { id: 'signoff', label: 'Draft financials reviewed and signed off by owner/directors', phase: 'Sign-off', mandatory: true }
  ];

  var PHASE_ORDER = ['Books', 'Reconcile', 'Provisions', 'Sign-off'];

  /** India FY label for a date: FY starts 1 April. Returns "FY 2025-26" style. */
  function fyLabel(dateISO) {
    var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateISO || ''));
    var y, mo;
    if (m) { y = +m[1]; mo = +m[2]; }
    else { var d = new Date(); y = d.getFullYear(); mo = d.getMonth() + 1; }
    var start = mo >= 4 ? y : y - 1;
    return 'FY ' + start + '-' + String((start + 1) % 100).padStart(2, '0');
  }

  /** FY-end date (31 March) of the FY containing dateISO → "YYYY-03-31". */
  function fyEnd(dateISO) {
    var m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(dateISO || ''));
    var y, mo;
    if (m) { y = +m[1]; mo = +m[2]; }
    else { var d = new Date(); y = d.getFullYear(); mo = d.getMonth() + 1; }
    return (mo >= 4 ? y + 1 : y) + '-03-31';
  }

  /** checks: {itemId: true}. Returns progress summary. */
  function progress(checks) {
    checks = checks || {};
    var done = 0, mDone = 0, mTotal = 0;
    var blocking = [];
    ITEMS.forEach(function (it) {
      if (it.mandatory) mTotal++;
      if (checks[it.id]) { done++; if (it.mandatory) mDone++; }
      else if (it.mandatory) blocking.push(it.id);
    });
    var pct = Math.round((done / ITEMS.length) * 100);
    return {
      ok: true, done: done, total: ITEMS.length, pct: pct,
      mandatoryDone: mDone, mandatoryTotal: mTotal,
      blocking: blocking, complete: blocking.length === 0
    };
  }

  /** Mandatory-but-unchecked items, in phase order. */
  function blockingItems(checks) {
    checks = checks || {};
    var out = [];
    ITEMS.forEach(function (it) {
      if (it.mandatory && !checks[it.id]) out.push(it);
    });
    out.sort(function (a, b) { return PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase); });
    return out;
  }

  function itemsByPhase() {
    var groups = [];
    PHASE_ORDER.forEach(function (ph) {
      groups.push({ phase: ph, items: ITEMS.filter(function (it) { return it.phase === ph; }) });
    });
    return groups;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { ITEMS: ITEMS, PHASE_ORDER: PHASE_ORDER, fyLabel: fyLabel, fyEnd: fyEnd, progress: progress, blockingItems: blockingItems, itemsByPhase: itemsByPhase, esc: esc };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'year-end-closure-assistant';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }

  function init() {
    Ads.render($('ad-top'), 'year-end-closure-assistant-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'year-end-closure-assistant-bottom', 'leaderboard');
    SEO.faq([
      { q: 'When does the financial year end in India?', a: '31 March. This checklist covers the standard close: stock count, debtor/creditor confirmations, bank reconciliation, provisions, depreciation, TDS and GST reconciliation, and owner sign-off.' },
      { q: 'वित्त वर्ष कब समाप्त होता है?', a: 'भारत में वित्तीय वर्ष 31 मार्च को समाप्त होता है। यह चेकलिस्ट स्टॉक गिनती, देनदार/लेनदार पुष्टि, बैंक समाधान, प्रावधान, मूल्यह्रास और TDS/GST समाधान कवर करती है।' },
      { q: 'Which items are mandatory?', a: 'Items marked mandatory (starred) must all be done before the books can be considered closed: stock count, confirmations, bank reco, cash count, provisions, depreciation, TDS and GST reco, and sign-off.' },
      { q: 'Is this tax advice?', a: 'No \u2014 it is a planning checklist. Final treatment of provisions, depreciation blocks and disclosures should be confirmed with your CA.' }
    ]);

    var fy = fyLabel(); $('y-fy').textContent = fy + ' (ends ' + fyEnd() + ')';

    $('y-checks').innerHTML = itemsByPhase().map(function (g) {
      return '<h3 class="vq-section-sub">' + esc(g.phase) + '</h3>' +
        g.items.map(function (it) {
          return '<div class="check-row"><input type="checkbox" id="y-' + it.id + '">' +
            '<label for="y-' + it.id + '" style="margin:0">' + esc(it.label) +
            (it.mandatory ? ' <span class="mand" title="Mandatory">*</span>' : ' <span class="vq-hint">(optional)</span>') + '</label></div>';
        }).join('');
    }).join('');

    $('y-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('y-gate'), SLUG, FREE_LIMIT); $('y-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var checks = {};
      ITEMS.forEach(function (it) { checks[it.id] = $('y-' + it.id).checked; });
      var p = progress(checks);
      var blocked = blockingItems(checks);
      var html = '<p>Closure progress: <span class="big">' + p.pct + '%</span> <span class="vq-hint">' + p.done + ' of ' + p.total + ' done</span></p>' +
        '<div class="bar"><div class="bar-fill" style="width:' + p.pct + '%"></div></div>' +
        '<p class="vq-hint">Mandatory items: ' + p.mandatoryDone + ' of ' + p.mandatoryTotal + ' done.</p>';
      if (blocked.length) {
        html += '<h3 class="vq-section-sub">Still blocking closure (' + blocked.length + ')</h3><ul class="blocking">';
        blocked.forEach(function (it) { html += '<li><span class="mand">*</span> ' + esc(it.label) + ' <span class="vq-hint">— ' + esc(it.phase) + '</span></li>'; });
        html += '</ul>';
      } else {
        html += '<p class="msg-ok">All mandatory items are done — the books are ready for your CA to finalize.</p>';
      }
      $('y-result').innerHTML = html;
      $('y-result-card').hidden = false;
      $('y-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
