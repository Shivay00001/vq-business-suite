/* ============================================================
   VisionQuantech Business Suite — Tender Submission Checklist
   apps/tender-submission-checklist/app.js

   Pure functions first (no DOM) — tested under node.
   Two-bid system (technical bid + financial bid) document
   checklist with per-section and overall completion %, ready-
   to-submit flag, and add/remove custom documents.
   The default list is a common-documents starting point for
   Indian government tenders — the NIT is authoritative.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_DOCS = 40; // per section
  var MAX_NAME = 120;

  var TECH_DOCS = [
    'EMD (demand draft / bank guarantee) or Bid Securing Declaration (MSE/Startup)',
    'Tender document fee receipt',
    'GST registration certificate',
    'PAN card (firm / company)',
    'Certificate of incorporation / partnership deed / proprietorship proof',
    'Udyam / NSIC / MSME registration (if claiming exemption/benefits)',
    'Audited financial statements — last 3 years',
    'Annual turnover certificate from CA',
    'Income tax returns — last 3 years',
    'Similar work experience certificates / completion certificates',
    'Ongoing works list with values',
    'Affidavit — not blacklisted / debarred',
    'Power of attorney / authorization letter for signatory',
    'Bidder profile & declaration forms (as per NIT annexures)',
    'Digital Signature Certificate (DSC) — bid signatory',
    'Solvency / bank credit certificate (if required)'
  ];

  var FIN_DOCS = [
    'BOQ / price schedule — rates in figures AND words',
    'Price bid declaration / summary sheet',
    'GST treatment as per NIT (inclusive / exclusive)',
    'No-condition / unconditional offer declaration',
    'Validity period declaration (as per NIT, often 90–180 days)',
    'Financial bid sealed as per two-bid instructions'
  ];

  function text(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: name + ' is required.' };
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function uid() {
    return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultChecklist() {
    function mk(list) { return list.map(function (n) { return { id: uid(), name: n, done: false, custom: false }; }); }
    return { technical: mk(TECH_DOCS), financial: mk(FIN_DOCS) };
  }

  function validSection(s) {
    return s === 'technical' || s === 'financial';
  }

  function addDoc(cl, section, name) {
    if (!validSection(section)) return { ok: false, error: 'Section must be "technical" or "financial".' };
    var nm = text(name, 'Document name', MAX_NAME);
    if (!nm.ok) return nm;
    var list = (cl && Array.isArray(cl[section])) ? cl[section].slice() : [];
    if (list.length >= MAX_DOCS) return { ok: false, error: 'This section is full (max ' + MAX_DOCS + ' documents).' };
    var dup = list.some(function (d) { return d.name.toLowerCase() === nm.value.toLowerCase(); });
    if (dup) return { ok: false, error: 'This document is already on the checklist.' };
    list.push({ id: uid(), name: nm.value, done: false, custom: true });
    var out = { technical: (cl && cl.technical) || [], financial: (cl && cl.financial) || [] };
    out[section] = list;
    return { ok: true, checklist: out };
  }

  function removeDoc(cl, section, id) {
    if (!validSection(section)) return { ok: false, error: 'Section must be "technical" or "financial".' };
    var list = (cl && Array.isArray(cl[section])) ? cl[section] : [];
    var nl = list.filter(function (d) { return d.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Document not found.' };
    var out = { technical: (cl && cl.technical) || [], financial: (cl && cl.financial) || [] };
    out[section] = nl;
    return { ok: true, checklist: out };
  }

  function toggleDoc(cl, section, id) {
    if (!validSection(section)) return { ok: false, error: 'Section must be "technical" or "financial".' };
    var list = (cl && Array.isArray(cl[section])) ? cl[section] : [];
    var found = false;
    var nl = list.map(function (d) {
      if (d.id !== id) return d;
      found = true;
      return { id: d.id, name: d.name, done: !d.done, custom: !!d.custom };
    });
    if (!found) return { ok: false, error: 'Document not found.' };
    var out = { technical: (cl && cl.technical) || [], financial: (cl && cl.financial) || [] };
    out[section] = nl;
    return { ok: true, checklist: out };
  }

  function sectionPct(docs) {
    var total = docs.length;
    var done = docs.filter(function (d) { return d.done; }).length;
    return { done: done, total: total, pct: total === 0 ? 100 : Math.round(done / total * 1000) / 10 };
  }

  function completion(cl) {
    cl = cl || { technical: [], financial: [] };
    var t = sectionPct(cl.technical || []);
    var f = sectionPct(cl.financial || []);
    var done = t.done + f.done, total = t.total + f.total;
    var overall = total === 0 ? 100 : Math.round(done / total * 1000) / 10;
    return {
      ok: true,
      technical: t, financial: f,
      done: done, total: total, overall: overall,
      ready: total > 0 && overall === 100
    };
  }

  function pendingList(cl) {
    cl = cl || { technical: [], financial: [] };
    function pend(list, section) {
      return (list || []).filter(function (d) { return !d.done; }).map(function (d) { return { section: section, name: d.name }; });
    }
    return { ok: true, pending: pend(cl.technical, 'technical').concat(pend(cl.financial, 'financial')) };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    TECH_DOCS: TECH_DOCS, FIN_DOCS: FIN_DOCS,
    defaultChecklist: defaultChecklist, addDoc: addDoc,
    removeDoc: removeDoc, toggleDoc: toggleDoc,
    completion: completion, pendingList: pendingList, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'tender-submission-checklist';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'submission-checklist';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { checklist: defaultChecklist() };

  function renderChecklist() {
    var c = completion(state.checklist);
    $('s-progress').innerHTML =
      '<div class="sum-strip">' +
      '<span>Technical bid: <strong>' + c.technical.done + '/' + c.technical.total + '</strong> (' + c.technical.pct + '%)</span>' +
      '<span>Financial bid: <strong>' + c.financial.done + '/' + c.financial.total + '</strong> (' + c.financial.pct + '%)</span>' +
      '<span>Overall: <strong>' + c.overall + '%</strong></span>' +
      (c.ready ? '<span class="b-ok-t"><strong>Ready to submit ✓</strong></span>' : '<span class="b-warn-t">Pending: <strong>' + (c.total - c.done) + '</strong> document(s)</span>') +
      '</div>' +
      '<div class="bar"><div class="bar-fill" style="width:' + c.overall + '%"></div></div>';
    [['technical', 'Technical bid (Envelope 1)'], ['financial', 'Financial bid (Envelope 2)']].forEach(function (pair) {
      var sec = pair[0], title = pair[1];
      var box = $(sec === 'technical' ? 's-tech' : 's-fin');
      var html = '<h3>' + title + '</h3><div class="doc-list">';
      state.checklist[sec].forEach(function (d) {
        html += '<div class="doc-item' + (d.done ? ' done' : '') + '">' +
          '<label><input type="checkbox" data-sec="' + sec + '" data-id="' + esc(d.id) + '"' + (d.done ? ' checked' : '') + '> ' + esc(d.name) + '</label>' +
          (d.custom ? ' <button type="button" class="vq-btn vq-btn-ghost mini" data-rmsec="' + sec + '" data-rmid="' + esc(d.id) + '">×</button>' : '') +
          '</div>';
      });
      html += '</div>';
      box.innerHTML = html;
    });
    var pend = pendingList(state.checklist).pending;
    $('s-pending').innerHTML = pend.length
      ? '<h3>Still pending</h3><ul class="assump">' + pend.map(function (p) {
          return '<li><strong>[' + p.section + ']</strong> ' + esc(p.name) + '</li>';
        }).join('') + '</ul>'
      : '<p class="msg-ok">All documents ready — submit before the deadline!</p>';
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), checklist: state.checklist });
      msg('Checklist saved on this device.', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && rec.checklist && Array.isArray(rec.checklist.technical)) {
        state.checklist = rec.checklist;
        renderChecklist();
      }
    } catch (e) { /* nothing saved yet */ }
  }

  function init() {
    Ads.render($('ad-top'), 'tender-submission-checklist-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'tender-submission-checklist-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the two-bid system in Indian tenders?', a: 'Bids are submitted in two sealed envelopes: the technical bid (eligibility, experience, EMD, documents) is opened first; only technically qualified bidders\u2019 financial bids (BOQ/price) are opened next. Failing one technical document can disqualify the whole bid.' },
      { q: 'टू-बिड सिस्टम क्या है?', a: 'बोली दो लिफाफों में जाती है — पहले तकनीकी बोली (योग्यता, अनुभव, EMD, दस्तावेज़) खुलती है; तकनीकी रूप से योग्य बोलीदाताओं की ही वित्तीय बोली (BOQ/मूल्य) खुलती है। एक दस्तावेज़ की कमी पूरी बोली रद्द करा सकती है।' },
      { q: 'Which documents are mandatory in the technical bid?', a: 'Commonly: EMD or Bid Securing Declaration, tender fee receipt, GST/PAN, incorporation proof, Udyam/NSIC (if applicable), 3-year audited financials and ITRs, experience certificates, non-blacklisting affidavit, and DSC. The NIT annexures are authoritative — this list is a starting point.' },
      { q: 'वित्तीय बोली में क्या रखें?', a: 'BOQ/मूल्य अनुसूची (अंकों और शब्दों दोनों में दरें), GST ट्रीटमेंट NIT अनुसार, बिना शर्त प्रस्ताव घोषणा, और वैधता अवधि घोषणा।' },
      { q: 'Is this checklist legally complete?', a: 'No — it is a common-documents starting point. The NIT and its corrigenda define the mandatory set for each tender. Confirm with your consultant/CA.' }
    ]);

    document.querySelectorAll('#s-tech, #s-fin').forEach(function (box) {
      box.addEventListener('change', function (e) {
        var cb = e.target;
        if (cb && cb.dataset && cb.dataset.sec && cb.dataset.id) {
          var r = toggleDoc(state.checklist, cb.dataset.sec, cb.dataset.id);
          if (r.ok) { state.checklist = r.checklist; renderChecklist(); }
        }
      });
      box.addEventListener('click', function (e) {
        var b = e.target;
        if (b && b.dataset && b.dataset.rmsec) {
          var r = removeDoc(state.checklist, b.dataset.rmsec, b.dataset.rmid);
          if (r.ok) { state.checklist = r.checklist; renderChecklist(); }
        }
      });
    });

    $('s-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); $('s-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addDoc(state.checklist, $('s-section').value, $('s-docname').value);
      if (!r.ok) { msg(r.error, false); return; }
      state.checklist = r.checklist;
      $('s-docname').value = '';
      msg('Document added. ' + gate.remaining + ' free use(s) left today.', true);
      renderChecklist();
    });

    $('s-reset').addEventListener('click', function () {
      if (window.confirm('Reset to the default document list? Your ticks will be lost (saved snapshot stays in the vault).')) {
        state.checklist = defaultChecklist();
        renderChecklist();
      }
    });

    $('s-save').addEventListener('click', persist);
    renderChecklist();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
