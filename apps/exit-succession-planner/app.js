/* ============================================================
   VisionQuantech Business Suite — Exit & Succession Planner
   apps/exit-succession-planner/app.js

   Pure functions first (no DOM) — tested under node.
   Succession readiness checklist (weighted), a valuation
   snapshot for the handover conversation, and a role-based
   handover task list. Checklist persists in Vault (max 25 items
   enforced by checklist design — items list is fixed at 15).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var CHECKLIST = [
    { id: 'docs-fin', cat: 'Finance & legal', label: '3 years of clean books, tax filings and statutory registers', weight: 3 },
    { id: 'docs-contracts', cat: 'Finance & legal', label: 'Key customer/supplier contracts assigned or assignable', weight: 3 },
    { id: 'docs-ip', cat: 'Finance & legal', label: 'IP, licences and brand ownership documented', weight: 2 },
    { id: 'people-2ic', cat: 'People', label: 'A named second-in-command who can run daily operations', weight: 3 },
    { id: 'people-backup', cat: 'People', label: 'Backup for every critical role (no single-person dependencies)', weight: 2 },
    { id: 'people-esop', cat: 'People', label: 'Retention plan for key staff through the transition', weight: 2 },
    { id: 'cust-diversify', cat: 'Customers', label: 'No single customer above 25% of revenue', weight: 3 },
    { id: 'cust-crm', cat: 'Customers', label: 'Customer data and relationships in a shared CRM, not heads', weight: 2 },
    { id: 'ops-sop', cat: 'Operations', label: 'Top 10 processes documented as SOPs', weight: 3 },
    { id: 'ops-systems', cat: 'Operations', label: 'Accounts, inventory and payroll run on systems, not memory', weight: 2 },
    { id: 'owner-time', cat: 'Owner dependence', label: 'Business runs 30 days without the owner stepping in', weight: 3 },
    { id: 'owner-brand', cat: 'Owner dependence', label: 'Brand and key relationships are transferable, not personal', weight: 2 },
    { id: 'val-multiple', cat: 'Deal readiness', label: 'Realistic valuation range agreed with CA/advisor', weight: 2 },
    { id: 'val-dd', cat: 'Deal readiness', label: 'Due-diligence folder ready (a ready buyer checks this first)', weight: 2 },
    { id: 'val-tax', cat: 'Deal readiness', label: 'Tax and structuring advice taken for the exit (share vs asset sale)', weight: 2 }
  ];

  function validateMoney(v, label) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid ' + label + '.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (n > 100000000000) return { ok: false, error: label + ' looks too large.' };
    return { ok: true, value: n };
  }

  function validateMultiple(v) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid profit multiple.' };
    if (n < 1 || n > 10) return { ok: false, error: 'Profit multiple must be between 1 and 10.' };
    return { ok: true, value: n };
  }

  /** Readiness % from checked item ids (weighted). */
  function readinessScore(checkedIds) {
    var set = {};
    (Array.isArray(checkedIds) ? checkedIds : []).forEach(function (id) { set[id] = true; });
    var totalW = 0, gotW = 0;
    var byCat = {};
    CHECKLIST.forEach(function (c) {
      totalW += c.weight;
      if (set[c.id]) gotW += c.weight;
      if (!byCat[c.cat]) byCat[c.cat] = { total: 0, got: 0 };
      byCat[c.cat].total += c.weight;
      if (set[c.id]) byCat[c.cat].got += c.weight;
    });
    var pct = Math.round((gotW / totalW) * 100);
    var cats = Object.keys(byCat).map(function (k) {
      return { cat: k, pct: Math.round((byCat[k].got / byCat[k].total) * 100) };
    });
    var band = pct >= 80 ? { label: 'Exit-ready', color: '#1d7a3f' }
      : pct >= 55 ? { label: 'Getting there', color: '#9a6b00' }
      : pct >= 30 ? { label: 'Not yet — owner-dependent', color: '#b3541e' }
      : { label: 'High risk — business = you', color: '#b3261e' };
    var missing = CHECKLIST.filter(function (c) { return !set[c.id]; });
    return { ok: true, pct: pct, band: band.label, color: band.color, byCat: cats, missing: missing };
  }

  /** Valuation snapshot: PAT x multiple, with low/high band. */
  function valuationSnapshot(pat, multiple) {
    var p = validateMoney(pat, 'annual PAT'); if (!p.ok) return p;
    var m = validateMultiple(multiple); if (!m.ok) return m;
    var mid = p.value * m.value;
    return { ok: true, mid: mid, low: Math.round(mid * 0.8), high: Math.round(mid * 1.2),
      note: 'Snapshot only — PAT × ' + m.value + 'x, ±20%. Not a valuation; a registered valuer is needed for a deal.',
      label: 'ESTIMATE' };
  }

  /** Handover task list keyed by area. */
  function handoverTasks() {
    return [
      { area: 'Finance', tasks: ['Hand over bank/portal access with dual control', 'Share CA contact + last 3 years filings', 'List all loans, guarantees and personal sureties'] },
      { area: 'Customers', tasks: ['Introduce successor to top 10 customers in person', 'Transfer CRM ownership and open-deal notes', 'Share pricing history and margin notes per key account'] },
      { area: 'Team', tasks: ['Announce the transition with a retention message', 'Hand over HR files, payroll and pending appraisals', 'Confirm second-in-command authority in writing'] },
      { area: 'Operations', tasks: ['Walk through SOPs on the shop floor / in the system', 'Transfer supplier contracts and credit terms', 'Hand over keys, assets, licences and insurance papers'] },
      { area: 'Legal', tasks: ['Get lawyer review of share/asset transfer documents', 'Update signatories at bank and registrar', 'Close or transfer statutory registrations as advised'] }
    ];
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    CHECKLIST: CHECKLIST,
    readinessScore: readinessScore, valuationSnapshot: valuationSnapshot,
    handoverTasks: handoverTasks, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'exit-succession-planner';
  var FREE_LIMIT = 20;
  var CHECK_KEY = 'succession-checklist';

  var checked = {};

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('x-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  async function loadCheck() {
    try {
      var d = await Vault.load(SLUG, CHECK_KEY);
      if (d && Array.isArray(d.checked)) d.checked.forEach(function (id) { checked[id] = true; });
    } catch (e) {}
  }
  async function saveCheck() {
    try { await Vault.save(SLUG, CHECK_KEY, { checked: Object.keys(checked).filter(function (k) { return checked[k]; }) }); }
    catch (e) {}
  }

  function buildChecklist() {
    var cats = {};
    CHECKLIST.forEach(function (c) { (cats[c.cat] = cats[c.cat] || []).push(c); });
    $('x-list').innerHTML = Object.keys(cats).map(function (cat) {
      return '<h3>' + esc(cat) + '</h3>' + cats[cat].map(function (c) {
        return '<div class="check-row"><input type="checkbox" id="x-' + c.id + '"' + (checked[c.id] ? ' checked' : '') + '>' +
          '<label for="x-' + c.id + '" style="margin:0">' + esc(c.label) + '</label></div>';
      }).join('');
    }).join('');
    CHECKLIST.forEach(function (c) {
      $('x-' + c.id).addEventListener('change', function (e) {
        checked[c.id] = e.target.checked;
        saveCheck();
      });
    });
  }

  function renderResult(r, snap) {
    var card = $('x-result-card');
    card.hidden = false;
    var cats = r.byCat.map(function (c) {
      return '<tr><td>' + esc(c.cat) + '</td><td><strong>' + c.pct + '%</strong></td></tr>';
    }).join('');
    var miss = r.missing.slice(0, 5).map(function (m) { return '<li>' + esc(m.label) + '</li>'; }).join('');
    var hand = handoverTasks().map(function (h) {
      return '<li><strong>' + esc(h.area) + ':</strong> ' + esc(h.tasks.join('; ')) + '</li>';
    }).join('');
    var snapHtml = snap && snap.ok
      ? '<p class="est-tag">⚠ ESTIMATE — NOT FINANCIAL ADVICE</p><p>Valuation snapshot (PAT × multiple ±20%): <span class="big">' + fmtINR(snap.low) + ' – ' + fmtINR(snap.high) + '</span></p><p class="vq-hint">' + esc(snap.note) + '</p>'
      : '';
    $('x-result').innerHTML =
      '<p>Succession readiness: <span class="big" style="color:' + r.color + '">' + r.pct + '%</span> — <strong>' + esc(r.band) + '</strong></p>' +
      '<table class="vq-table"><tbody>' + cats + '</tbody></table>' +
      (miss ? '<h3>Top gaps to close</h3><ul class="assump">' + miss + '</ul>' : '<p class="msg-ok">No gaps — checklist complete.</p>') +
      snapHtml +
      '<h3>Handover task list</h3><ul class="assump">' + hand + '</ul>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'exit-succession-planner-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'exit-succession-planner-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is succession planning for a small business?', a: 'Making the business transferable: documented processes, a second-in-command, diversified customers, clean books and deal-ready paperwork. This tool scores your readiness across 15 checkpoints.' },
      { q: 'सक्सेशन प्लानिंग क्या है?', a: 'बिज़नेस को हस्तांतरणीय बनाना — दस्तावेज़ी प्रक्रियाएं, सेकंड-इन-कमांड, विविध ग्राहक, साफ़ खाते। यह टूल 15 बिंदुओं पर आपकी तैयारी स्कोर करता है।' },
      { q: 'What hurts a business valuation most at exit?', a: 'Owner dependence — if the business stops when you step away for 30 days, buyers discount heavily. That is the single biggest readiness factor.' },
      { q: 'Should I sell shares or assets?', a: 'Tax and liability outcomes differ sharply. Take structuring advice from your CA and lawyer before signing anything.' },
      { q: 'Is the valuation snapshot financial advice?', a: 'No — it is a rough PAT × multiple range for the handover conversation. A registered valuer is needed for any deal.' }
    ]);
    loadCheck().then(buildChecklist);
    $('x-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('x-gate'), SLUG, FREE_LIMIT); $('x-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var ids = CHECKLIST.filter(function (c) { return checked[c.id]; }).map(function (c) { return c.id; });
      var r = readinessScore(ids);
      var snap = valuationSnapshot($('x-pat').value, $('x-mult').value);
      if (snap && !snap.ok && $('x-pat').value !== '' ) { msg(snap.error, false); $('x-result-card').hidden = true; return; }
      msg('', null);
      renderResult(r, $('x-pat').value === '' ? null : snap);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
