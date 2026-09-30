/* ============================================================
   VisionQuantech Business Suite — Internal Control Checklist
   apps/internal-control-checklist/app.js

   Self-assessment tool: a controls library across purchase, sales,
   cash & bank, inventory, and HR & payroll. Tick the controls you
   actually have; get overall + per-process compliance % and a gap
   list to fix.

   Pure functions first (no DOM) — tested under node.
   Estimate — confirm with your auditor/CA.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CONTROLS = [
    // purchase
    { id: 'p-quotes', process: 'Purchase', text: '3 written quotations for purchases above your threshold' },
    { id: 'p-approval', process: 'Purchase', text: 'Purchase orders approved before ordering (not after)' },
    { id: 'p-grn', process: 'Purchase', text: 'Goods receipt note matched to PO before the bill is paid' },
    { id: 'p-master', process: 'Purchase', text: 'Vendor master changes need a second-person approval' },
    // sales
    { id: 's-credit', process: 'Sales', text: 'Credit limits set and reviewed for every credit customer' },
    { id: 's-dispatch', process: 'Sales', text: 'Dispatches matched to invoices (nothing leaves unbilled)' },
    { id: 's-receipts', process: 'Sales', text: 'Customer receipts reconciled to the ledger monthly' },
    // cash & bank
    { id: 'c-segregation', process: 'Cash & Bank', text: 'Cash/bank handler is different from the bookkeeper' },
    { id: 'c-recon', process: 'Cash & Bank', text: 'Bank reconciliation done every month' },
    { id: 'c-petty', process: 'Cash & Bank', text: 'Petty cash counted and vouched weekly' },
    { id: 'c-cheque', process: 'Cash & Bank', text: 'Cheque books / payment credentials locked away' },
    // inventory
    { id: 'i-count', process: 'Inventory', text: 'Physical stock count at least quarterly' },
    { id: 'i-issue', process: 'Inventory', text: 'Every stock issue/receipt recorded with a slip' },
    { id: 'i-access', process: 'Inventory', text: 'Store access limited to authorised staff' },
    // hr & payroll
    { id: 'h-attendance', process: 'HR & Payroll', text: 'Payroll matched to attendance every month' },
    { id: 'h-leave', process: 'HR & Payroll', text: 'Leave and overtime approved in writing before payroll' },
    { id: 'h-exit', process: 'HR & Payroll', text: 'Exit checklist: ID, assets and system access revoked on last day' }
  ];

  function controlIds() { return CONTROLS.map(function (c) { return c.id; }); }

  function processes() {
    var seen = [], out = [];
    CONTROLS.forEach(function (c) { if (seen.indexOf(c.process) === -1) { seen.push(c.process); out.push(c.process); } });
    return out;
  }

  function evaluate(checkedIds) {
    if (!Array.isArray(checkedIds)) return { ok: false, error: 'Internal error: checklist must be an array.' };
    var seen = {}, unknown = [];
    checkedIds.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (controlIds().indexOf(id) === -1) unknown.push(id);
    });
    if (unknown.length) return { ok: false, error: 'Unknown control id(s): ' + unknown.join(', ') };
    var byProcess = {}, overall = { checked: 0, total: CONTROLS.length }, gaps = [];
    processes().forEach(function (p) { byProcess[p] = { checked: 0, total: 0 }; });
    CONTROLS.forEach(function (c) {
      var bp = byProcess[c.process];
      bp.total++;
      if (seen[c.id]) { bp.checked++; overall.checked++; }
      else gaps.push({ process: c.process, text: c.text });
    });
    Object.keys(byProcess).forEach(function (p) {
      byProcess[p].percent = Math.round((byProcess[p].checked / byProcess[p].total) * 100);
    });
    var pct = Math.round((overall.checked / overall.total) * 100);
    var band = pct >= 80 ? 'Strong' : pct >= 60 ? 'Adequate' : pct >= 40 ? 'Weak' : 'Critical gaps';
    return {
      ok: true, percent: pct, band: band,
      checked: overall.checked, total: overall.total,
      byProcess: byProcess, gaps: gaps
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { CONTROLS: CONTROLS, controlIds: controlIds, processes: processes, evaluate: evaluate, esc: esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'internal-control-checklist';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('icc-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderChecklist() {
    var html = '';
    processes().forEach(function (p) {
      html += '<h3 class="vq-section-title">' + esc(p) + '</h3>';
      CONTROLS.filter(function (c) { return c.process === p; }).forEach(function (c) {
        html += '<div class="check-row"><input type="checkbox" id="icc-' + c.id + '" value="' + c.id + '">' +
          '<label for="icc-' + c.id + '" style="margin:0">' + esc(c.text) + '</label></div>';
      });
    });
    $('icc-list').innerHTML = html;
  }

  function bandClass(b) {
    return b === 'Strong' ? 'b-low' : b === 'Adequate' ? 'b-med' : b === 'Weak' ? 'b-high' : 'b-crit';
  }

  function renderResult(r) {
    var html = '<p>Control compliance: <span class="big">' + r.percent + '%</span> ' +
      '<span class="chip ' + bandClass(r.band) + '">' + r.band + '</span></p>' +
      '<p class="vq-hint">' + r.checked + ' of ' + r.total + ' controls in place.</p>' +
      '<h3 class="vq-section-title">By process</h3><table class="proc"><tbody>';
    Object.keys(r.byProcess).forEach(function (p) {
      var b = r.byProcess[p];
      html += '<tr><td>' + esc(p) + '</td><td><div class="bar"><div class="fill" style="width:' + b.percent + '%"></div></div></td>' +
        '<td class="pct">' + b.percent + '%</td></tr>';
    });
    html += '</tbody></table>';
    if (r.gaps.length) {
      html += '<h3 class="vq-section-title">Gap list — fix these</h3><ul class="gaps">';
      r.gaps.forEach(function (g) {
        html += '<li><strong>' + esc(g.process) + ':</strong> ' + esc(g.text) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">All ' + r.total + ' controls ticked — keep reviewing them quarterly.</p>';
    }
    html += '<p class="vq-hint">Self-assessment estimate — confirm with your auditor.</p>';
    $('icc-result').innerHTML = html;
    $('icc-result-card').hidden = false;
    $('icc-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'internal-control-checklist-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'internal-control-checklist-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is an internal control checklist?', a: 'A list of preventive controls across purchase, sales, cash & bank, inventory, and HR & payroll. You tick the ones you actually follow; the tool reports compliance % per process and a gap list.' },
      { q: 'आंतरिक नियंत्रण चेकलिस्ट क्या है?', a: 'खरीद, बिक्री, नकद-बैंक, स्टॉक और HR-वेतन में नियंत्रणों की सूची। जो नियंत्रण आप सच में अपनाते हैं उन्हें चिह्नित करें — प्रक्रिया-वार अनुपालन % और कमी की सूची पाएं।' },
      { q: 'What is a good internal control compliance score?', a: '80%+ is strong, 60–79% adequate, 40–59% weak, below 40% means critical gaps. Aim to fix cash & bank and purchase gaps first — that is where losses hurt most.' },
      { q: 'Is this an internal audit?', a: 'No — it is a self-assessment to prioritise control fixes. A real internal audit also tests whether controls actually work, not just whether they exist on paper.' },
      { q: 'How often should I redo this checklist?', a: 'Quarterly, or whenever staff roles change. Controls decay silently — the person who was independent last year may now do both jobs.' }
    ]);

    renderChecklist();

    $('icc-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('icc-gate'), SLUG, FREE_LIMIT); $('icc-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var checked = [];
      CONTROLS.forEach(function (c) { if ($('icc-' + c.id).checked) checked.push(c.id); });
      var r = evaluate(checked);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._iccLast = r;
    });

    $('icc-save').addEventListener('click', async function () {
      var r = window._iccLast;
      if (!r) { msg('Run the checklist first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('icc-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'assess-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), percent: r.percent, band: r.band,
          checked: r.checked, total: r.total, gaps: r.gaps
        });
        msg('Assessment saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
