/* ============================================================
   VisionQuantech Business Suite — Business Restart Toolkit
   apps/business-restart-toolkit/app.js

   After a crash, shutdown or long pause: step-by-step reopening
   checklist in three phases (Day 1 / Week 1 / Month 1) covering
   licenses, staff, vendors, cash and relaunch. Two tracks:
   'temporary' (paused) and 'closed' (fully shut, needs
   re-registration steps).

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var PHASES = [
    { id: 'day1', label: 'Day 1 — stabilize' },
    { id: 'week1', label: 'Week 1 — restart operations' },
    { id: 'month1', label: 'Month 1 — rebuild momentum' }
  ];

  var BASE_STEPS = [
    { id: 'cash', label: 'Count cash in hand and list all bank balances — know your runway', phase: 'day1' },
    { id: 'dues', label: 'List all payables (rent, salaries, suppliers) and receivables', phase: 'day1' },
    { id: 'premises', label: 'Confirm shop/office access: rent paid, keys, utilities (power, water, internet)', phase: 'day1' },
    { id: 'licenses-check', label: 'Check which licenses/registrations are still valid (GST, trade license, Shops & Establishments)', phase: 'week1' },
    { id: 'staff', label: 'Call back key staff; confirm who returns and on what terms', phase: 'week1' },
    { id: 'vendors', label: 'Contact top vendors: renegotiate credit terms and restart supply', phase: 'week1' },
    { id: 'stock', label: 'Physical stock count; reorder fast-moving items only', phase: 'week1' },
    { id: 'systems', label: 'Power up systems: billing software, printers, CCTV, card machines', phase: 'week1' },
    { id: 'debtors', label: 'Start collecting old receivables — call every overdue debtor', phase: 'week1' },
    { id: 'marketing', label: 'Announce reopening: WhatsApp broadcast, Google Business update, banner', phase: 'month1' },
    { id: 'offers', label: 'Run a reopening offer to pull footfall in the first 30 days', phase: 'month1' },
    { id: 'books', label: 'Restart daily books from day one — cashbook, sales, expenses', phase: 'month1' },
    { id: 'compliance', label: 'Catch up on pending filings (GST returns, TDS) — penalties compound', phase: 'month1' },
    { id: 'review', label: '30-day review: revenue vs plan, cut what is not working', phase: 'month1' }
  ];

  var CLOSED_EXTRA = [
    { id: 'reregister', label: 'Re-apply for cancelled/surrendered registrations (GST, trade license)', phase: 'week1' },
    { id: 'bank-reactivate', label: 'Reactivate dormant current account or open a fresh one', phase: 'week1' },
    { id: 'fresh-hiring', label: 'Fresh hiring round — old team may not return', phase: 'month1' }
  ];

  function stepsFor(closureType) {
    var list = BASE_STEPS.slice();
    if (closureType === 'closed') list = list.concat(CLOSED_EXTRA);
    return list;
  }

  function phasesFor(closureType) {
    var steps = stepsFor(closureType);
    return PHASES.map(function (p) {
      return { id: p.id, label: p.label, steps: steps.filter(function (s) { return s.phase === p.id; }) };
    });
  }

  /** checks: {stepId: true}. Returns per-phase + overall progress. */
  function progress(checks, closureType) {
    checks = checks || {};
    var steps = stepsFor(closureType);
    var byPhase = {}, overall = { done: 0, total: steps.length };
    PHASES.forEach(function (p) { byPhase[p.id] = { done: 0, total: 0 }; });
    steps.forEach(function (s) {
      byPhase[s.phase].total++;
      if (checks[s.id]) { byPhase[s.phase].done++; overall.done++; }
    });
    overall.pct = overall.total ? Math.round((overall.done / overall.total) * 100) : 0;
    PHASES.forEach(function (p) {
      var b = byPhase[p.id];
      b.pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
      b.label = p.label;
    });
    return { ok: true, overall: overall, phases: byPhase };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { PHASES: PHASES, stepsFor: stepsFor, phasesFor: phasesFor, progress: progress, esc: esc };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'business-restart-toolkit';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }

  function currentType() { return $('k-type').value; }

  function renderChecks() {
    $('k-checks').innerHTML = phasesFor(currentType()).map(function (g) {
      return '<h3 class="vq-section-sub">' + esc(g.label) + '</h3>' +
        g.steps.map(function (s) {
          return '<div class="check-row"><input type="checkbox" id="k-' + s.id + '">' +
            '<label for="k-' + s.id + '" style="margin:0">' + esc(s.label) + '</label></div>';
        }).join('');
    }).join('');
  }

  function init() {
    Ads.render($('ad-top'), 'business-restart-toolkit-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'business-restart-toolkit-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the first thing to do when reopening a business?', a: 'Day 1 is about stabilizing: count cash and bank balances, list payables and receivables, and confirm premises access and utilities before anything else.' },
      { q: 'बंद दुकान दोबारा कैसे खोलें?', a: 'पहले दिन नकद और बैंक बैलेंस गिनें, देनदारी-संपत्ति की सूची बनाएं, दुकान/बिजली/पानी कन्फर्म करें। फिर लाइसेंस, स्टाफ, वेंडर और अंत में दोबारा लॉन्च की घोषणा।' },
      { q: 'Temporary pause vs full shutdown \u2014 what changes?', a: 'A full shutdown adds re-registration of cancelled licenses, reactivating the bank account, and a fresh hiring round. Pick the right track at the top of the page.' },
      { q: 'When should pending tax filings be handled?', a: 'In Month 1 at the latest \u2014 pending GST/TDS filings accrue penalties, so catch up early while revenue restarts.' }
    ]);

    renderChecks();
    $('k-type').addEventListener('change', renderChecks);

    $('k-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('k-gate'), SLUG, FREE_LIMIT); $('k-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var type = currentType();
      var checks = {};
      stepsFor(type).forEach(function (s) { var el = $('k-' + s.id); checks[s.id] = el && el.checked; });
      var p = progress(checks, type);
      var html = '<p>Restart progress: <span class="big">' + p.overall.pct + '%</span> <span class="vq-hint">' + p.overall.done + ' of ' + p.overall.total + ' steps</span></p>';
      PHASES.forEach(function (ph) {
        var b = p.phases[ph.id];
        html += '<p><strong>' + esc(b.label) + '</strong> — ' + b.done + '/' + b.total +
          '<div class="bar"><div class="bar-fill" style="width:' + b.pct + '%"></div></div></p>';
      });
      if (p.overall.pct === 100) html += '<p class="msg-ok">Reopening complete — now it is about steady execution. Good luck.</p>';
      else if (p.phases.day1.pct < 100) html += '<p class="vq-hint">Finish <strong>Day 1</strong> first — cash, dues and premises — before spending on relaunch.</p>';
      $('k-result').innerHTML = html;
      $('k-result-card').hidden = false;
      $('k-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
