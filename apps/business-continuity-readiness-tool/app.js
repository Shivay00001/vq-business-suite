/* ============================================================
   VisionQuantech Business Suite — Business Continuity
   Readiness Tool
   apps/business-continuity-readiness-tool/app.js

   Self-assessment tool: tick the BCP items you actually have
   (backups, tested restores, alternate site, key-person cover,
   insurance…) -> readiness % and tier, plus the gaps to close.

   Pure functions first (no DOM) — tested under node.
   Estimate — confirm with your auditor/insurer.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var BCP_ITEMS = [
    { id: 'backup', label: 'Data is backed up automatically (not "when someone remembers")', weight: 2 },
    { id: 'restore-tested', label: 'A backup restore was actually tested in the last 6 months', weight: 2 },
    { id: 'offsite', label: 'At least one backup copy lives offsite / in the cloud', weight: 2 },
    { id: 'key-person', label: 'Every key role has a named backup person who can cover for 2 weeks', weight: 2 },
    { id: 'passwords', label: 'Critical passwords/credentials are stored where the backup person can reach them', weight: 1 },
    { id: 'alternate-site', label: 'A plan exists for where work continues if the premises are unusable', weight: 2 },
    { id: 'power', label: 'Power/internet backup (inverter, generator, or mobile hotspot plan)', weight: 1 },
    { id: 'insurance', label: 'Business insurance is current (fire, stock, liability as applicable)', weight: 2 },
    { id: 'suppliers', label: 'Alternate suppliers identified for the top 3 critical inputs', weight: 1 },
    { id: 'cash-reserve', label: 'Cash reserve or credit line covering at least 1 month of fixed costs', weight: 2 },
    { id: 'contacts', label: 'Emergency contact list (staff, key customers, insurer, CA) is written and accessible', weight: 1 },
    { id: 'sops', label: 'Core processes are written down so a newcomer can follow them', weight: 2 }
  ];

  function itemIds() { return BCP_ITEMS.map(function (i) { return i.id; }); }

  function readiness(checkedIds) {
    if (!Array.isArray(checkedIds)) return { ok: false, error: 'Internal error: checklist must be an array.' };
    var seen = {}, unknown = [];
    checkedIds.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = true;
      if (itemIds().indexOf(id) === -1) unknown.push(id);
    });
    if (unknown.length) return { ok: false, error: 'Unknown BCP item id(s): ' + unknown.join(', ') };
    var earned = 0, total = 0, gaps = [];
    BCP_ITEMS.forEach(function (it) {
      total += it.weight;
      if (seen[it.id]) earned += it.weight;
      else gaps.push({ label: it.label, weight: it.weight });
    });
    var pct = total ? Math.round((earned / total) * 100) : 0;
    var tier = pct >= 80 ? 'Resilient' : pct >= 50 ? 'Developing' : 'Exposed';
    gaps.sort(function (a, b) { return b.weight - a.weight; });
    return { ok: true, percent: pct, tier: tier, checked: Object.keys(seen).length, total: BCP_ITEMS.length, gaps: gaps };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { BCP_ITEMS: BCP_ITEMS, itemIds: itemIds, readiness: readiness, esc: esc };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'business-continuity-readiness-tool';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('bcr-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function renderChecklist() {
    var html = '';
    BCP_ITEMS.forEach(function (it) {
      html += '<div class="check-row"><input type="checkbox" id="bcr-' + it.id + '" value="' + it.id + '">' +
        '<label for="bcr-' + it.id + '" style="margin:0">' + esc(it.label) + '</label></div>';
    });
    $('bcr-list').innerHTML = html;
  }

  function tierClass(t) { return t === 'Resilient' ? 'b-low' : t === 'Developing' ? 'b-med' : 'b-crit'; }

  function renderResult(r) {
    var html = '<p>Continuity readiness: <span class="big">' + r.percent + '%</span> ' +
      '<span class="chip ' + tierClass(r.tier) + '">' + r.tier + '</span></p>' +
      '<p class="vq-hint">' + r.checked + ' of ' + r.total + ' readiness items in place.</p>';
    if (r.gaps.length) {
      html += '<h3 class="vq-section-title">Gaps to close — heaviest first</h3><ul class="gaps">';
      r.gaps.forEach(function (g) {
        html += '<li>' + esc(g.label) + '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="msg-ok">All 12 items in place — re-test your restore and review the plan yearly.</p>';
    }
    html += '<p class="vq-hint">Self-assessment estimate — confirm your plan with your auditor/insurer.</p>';
    $('bcr-result').innerHTML = html;
    $('bcr-result-card').hidden = false;
    $('bcr-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'business-continuity-readiness-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'business-continuity-readiness-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is business continuity readiness?', a: 'How quickly your business could keep running after a disruption — fire, flood, server failure, or a key person falling ill. This tool scores 12 readiness items (backups, tested restores, alternate site, key-person cover, insurance) into a readiness %.' },
      { q: 'व्यवसाय निरंतरता तत्परता क्या है?', a: 'आग, बाढ़, सर्वर खराबी या किसी प्रमुख व्यक्ति के बीमार पड़ने के बाद आपका व्यवसाय कितनी जल्दी चलता रह सकता है — इसका आत्म-मूल्यांकन।' },
      { q: 'What is the most neglected BCP item?', a: 'Tested restores. Most businesses back up but never verify the backup actually works — then discover it is corrupt on the day they need it.' },
      { q: 'Do small businesses need a continuity plan?', a: 'Yes — a one-page version. Write down: where work continues, who covers key roles, how to reach the insurer and CA, and where the backups are. That covers 80% of it.' },
      { q: 'Is this a certified BCP audit?', a: 'No. It is a self-assessment estimate. Confirm your continuity plan with your auditor or insurer.' }
    ]);

    renderChecklist();

    $('bcr-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('bcr-gate'), SLUG, FREE_LIMIT); $('bcr-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var checked = [];
      BCP_ITEMS.forEach(function (it) { if ($('bcr-' + it.id).checked) checked.push(it.id); });
      var r = readiness(checked);
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._bcrLast = r;
    });

    $('bcr-save').addEventListener('click', async function () {
      var r = window._bcrLast;
      if (!r) { msg('Run the assessment first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('bcr-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'assess-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), percent: r.percent, tier: r.tier,
          checked: r.checked, total: r.total, gaps: r.gaps
        });
        msg('Assessment saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
