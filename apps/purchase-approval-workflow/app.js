/* ============================================================
   VisionQuantech Business Suite — Purchase Approval Workflow
   apps/purchase-approval-workflow/app.js

   Pure functions first (no DOM) — tested under node.
   Multi-level approval matrix: a purchase amount maps to an
   ordered chain of approver roles (slabs editable in the UI).
   Requests move through the chain in order; every approve /
   reject is recorded in an audit trail with timestamp and note.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var DEFAULT_MATRIX = [
    { upTo: 25000, roles: ['HOD'] },
    { upTo: 100000, roles: ['HOD', 'Finance'] },
    { upTo: 500000, roles: ['HOD', 'Finance', 'Director'] },
    { upTo: Infinity, roles: ['HOD', 'Finance', 'Director', 'MD'] }
  ];
  var MAX_REQUESTS = 25;

  function validateMatrix(m) {
    if (!Array.isArray(m) || m.length === 0) return { ok: false, error: 'Matrix needs at least one slab.' };
    if (m.length > 6) return { ok: false, error: 'Max 6 slabs.' };
    var prev = 0;
    for (var i = 0; i < m.length; i++) {
      var s = m[i];
      if (!s || typeof s !== 'object') return { ok: false, error: 'Slab ' + (i + 1) + ' is invalid.' };
      var upTo = s.upTo === null || s.upTo === undefined || s.upTo === '' ? Infinity : Number(s.upTo);
      if (!isFinite(upTo) && upTo !== Infinity) return { ok: false, error: 'Slab ' + (i + 1) + ': bad limit.' };
      if (upTo !== Infinity && (upTo <= 0 || upTo <= prev)) return { ok: false, error: 'Slab ' + (i + 1) + ': limits must rise.' };
      if (!Array.isArray(s.roles) || s.roles.length === 0) return { ok: false, error: 'Slab ' + (i + 1) + ': add at least one role.' };
      for (var j = 0; j < s.roles.length; j++) {
        var r = String(s.roles[j]).trim();
        if (!r || r.length > 40) return { ok: false, error: 'Slab ' + (i + 1) + ': role names 1–40 chars.' };
      }
      prev = upTo;
      s.upTo = upTo;
    }
    return { ok: true, value: m };
  }

  /** Ordered approver roles for an amount under the given matrix. */
  function approvalChain(amount, matrix) {
    var n = Number(amount);
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    var m = validateMatrix(matrix || DEFAULT_MATRIX);
    if (!m.ok) return m;
    for (var i = 0; i < m.value.length; i++) {
      if (n <= m.value[i].upTo) return { ok: true, value: m.value[i].roles.slice() };
    }
    return { ok: true, value: m.value[m.value.length - 1].roles.slice() };
  }

  function validateRequest(r) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'Request data is required.' };
    if (!String(r.title || '').trim()) return { ok: false, error: 'Purchase title is required.' };
    if (String(r.title).length > 140) return { ok: false, error: 'Title too long (max 140).' };
    if (!String(r.vendor || '').trim()) return { ok: false, error: 'Vendor is required.' };
    if (!String(r.requestedBy || '').trim()) return { ok: false, error: 'Requester name is required.' };
    var n = Number(r.amount);
    if (!isFinite(n) || n <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (n > 1e10) return { ok: false, error: 'Amount looks too large.' };
    return { ok: true };
  }

  function newRequest(data, matrix, now) {
    var v = validateRequest(data);
    if (!v.ok) return v;
    var chain = approvalChain(data.amount, matrix);
    if (!chain.ok) return chain;
    return {
      ok: true,
      value: {
        id: 'REQ-' + (now || Date.now()),
        title: String(data.title).trim(), vendor: String(data.vendor).trim(),
        amount: Number(data.amount), requestedBy: String(data.requestedBy).trim(),
        createdAt: new Date(now || Date.now()).toISOString(),
        chain: chain.value, pendingIndex: 0,
        trail: [{ at: new Date(now || Date.now()).toISOString(), actor: String(data.requestedBy).trim(), action: 'created', note: '' }]
      }
    };
  }

  /** Current status: pending (with whom), approved, rejected. */
  function status(req) {
    if (!req || !Array.isArray(req.chain)) return { ok: false, error: 'Bad request object.' };
    var rejected = req.trail.filter(function (t) { return t.action === 'reject'; });
    if (rejected.length) return { ok: true, status: 'rejected', pendingWith: null, rejectedBy: rejected[0].actor };
    if (req.pendingIndex >= req.chain.length) return { ok: true, status: 'approved', pendingWith: null };
    return { ok: true, status: 'pending', pendingWith: req.chain[req.pendingIndex], step: req.pendingIndex + 1, of: req.chain.length };
  }

  /**
   * Apply an approve/reject by the role that is currently pending.
   * action: 'approve' | 'reject'. Enforces chain order.
   */
  function applyAction(req, role, action, note, now) {
    if (!req || typeof req !== 'object') return { ok: false, error: 'Bad request object.' };
    var st = status(req);
    if (!st.ok) return st;
    if (st.status !== 'pending') return { ok: false, error: 'Request is already ' + st.status + '.' };
    if (String(role).trim() !== st.pendingWith) return { ok: false, error: 'Only ' + st.pendingWith + ' can act now.' };
    if (action !== 'approve' && action !== 'reject') return { ok: false, error: 'Action must be approve or reject.' };
    var next = JSON.parse(JSON.stringify(req));
    next.trail.push({
      at: new Date(now || Date.now()).toISOString(),
      actor: String(role).trim(), action: action,
      note: String(note == null ? '' : note).slice(0, 300)
    });
    if (action === 'approve') next.pendingIndex = req.pendingIndex + 1;
    return { ok: true, value: next, status: status(next).status };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    DEFAULT_MATRIX: DEFAULT_MATRIX, MAX_REQUESTS: MAX_REQUESTS,
    validateMatrix: validateMatrix, approvalChain: approvalChain,
    validateRequest: validateRequest, newRequest: newRequest,
    status: status, applyAction: applyAction,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'purchase-approval-workflow';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('a-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function matrixFromForm() {
    return [
      { upTo: 25000, roles: ['HOD'] },
      { upTo: 100000, roles: ['HOD', 'Finance'] },
      { upTo: 500000, roles: ['HOD', 'Finance', 'Director'] },
      { upTo: Infinity, roles: ['HOD', 'Finance', 'Director', 'MD'] }
    ].map(function (s, i) {
      var raw = $('mx-' + i).value.trim();
      return { upTo: s.upTo, roles: raw ? raw.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [] };
    });
  }

  function matrixToForm(matrix) {
    matrix.forEach(function (s, i) { $('mx-' + i).value = s.roles.join(', '); });
  }

  async function loadMatrix() {
    try { var m = await Vault.load(SLUG, 'matrix'); return m || DEFAULT_MATRIX.map(function (s) { return { upTo: s.upTo, roles: s.roles.slice() }; }); }
    catch (e) { return DEFAULT_MATRIX.map(function (s) { return { upTo: s.upTo, roles: s.roles.slice() }; }); }
  }

  async function saveMatrix(m) {
    var v = validateMatrix(m);
    if (!v.ok) { msg(v.error, false); return false; }
    await Vault.save(SLUG, 'matrix', v.value);
    msg('Approval matrix saved on this device.', true);
    renderMatrixView(v.value);
    return true;
  }

  function renderMatrixView(matrix) {
    var rows = matrix.map(function (s) {
      var lim = s.upTo === Infinity ? 'above' : 'up to ' + fmtINR(s.upTo);
      return '<li>' + esc(lim) + ': <strong>' + esc(s.roles.join(' → ')) + '</strong></li>';
    }).join('');
    $('a-matrix-view').innerHTML = '<ul class="vq-list">' + rows + '</ul>';
  }

  async function listRequests() {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('req:') === 0; }).sort().reverse();
      var reqs = [];
      for (var i = 0; i < keys.length; i++) { var r = await Vault.load(SLUG, keys[i]); if (r) reqs.push(r); }
      return reqs;
    } catch (e) { return []; }
  }

  async function persistRequest(req) {
    try {
      var list = await Vault.list(SLUG);
      var keys = list.filter(function (k) { return k.indexOf('req:') === 0; }).sort();
      while (keys.length >= MAX_REQUESTS) { await Vault.remove(SLUG, keys.shift()); }
      await Vault.save(SLUG, 'req:' + req.id, req);
      return true;
    } catch (e) { return false; }
  }

  function badge(st) {
    if (st.status === 'approved') return '<span class="a-badge a-ok">Approved</span>';
    if (st.status === 'rejected') return '<span class="a-badge a-bad">Rejected</span>';
    return '<span class="a-badge a-wait">Pending: ' + esc(st.pendingWith) + ' (' + st.step + '/' + st.of + ')</span>';
  }

  async function renderRequests() {
    var reqs = await listRequests();
    if (!reqs.length) { $('a-requests').innerHTML = '<p class="vq-hint">No requests yet.</p>'; return; }
    var html = reqs.map(function (req) {
      var st = status(req);
      var trail = req.trail.map(function (t) {
        var act = t.action === 'approve' ? 'approved' : t.action === 'reject' ? 'rejected' : 'created';
        return '<li>' + esc(new Date(t.at).toLocaleString('en-IN')) + ' — <strong>' + esc(t.actor) + '</strong> ' + act +
          (t.note ? ': <em>' + esc(t.note) + '</em>' : '') + '</li>';
      }).join('');
      var actionBox = '';
      if (st.ok && st.status === 'pending') {
        actionBox = '<div class="a-action"><input class="vq-input a-role" data-id="' + esc(req.id) + '" placeholder="Approver name (must be ' + esc(st.pendingWith) + ')" maxlength="40">' +
          '<input class="vq-input a-note" data-id="' + esc(req.id) + '" placeholder="Note (optional)" maxlength="300">' +
          '<button class="vq-btn a-ok-btn" data-id="' + esc(req.id) + '" data-role="' + esc(st.pendingWith) + '" type="button">Approve</button> ' +
          '<button class="vq-btn vq-btn-ghost a-no-btn" data-id="' + esc(req.id) + '" data-role="' + esc(st.pendingWith) + '" type="button">Reject</button></div>';
      }
      return '<div class="a-req"><div class="a-req-head"><strong>' + esc(req.title) + '</strong> ' + badge(st.ok ? st : { status: 'pending' }) + '</div>' +
        '<p class="vq-hint">' + esc(req.id) + ' · ' + esc(req.vendor) + ' · <strong>' + fmtINR(req.amount) + '</strong> · requested by ' + esc(req.requestedBy) + '</p>' +
        '<p class="vq-hint">Chain: ' + esc(req.chain.join(' → ')) + '</p>' + actionBox +
        '<details><summary>Audit trail (' + req.trail.length + ')</summary><ul class="vq-list">' + trail + '</ul></details></div>';
    }).join('');
    $('a-requests').innerHTML = html;

    function val(sel, id) { var el = document.querySelector(sel + '[data-id="' + id + '"]'); return el ? el.value : ''; }
    Array.prototype.forEach.call(document.querySelectorAll('.a-ok-btn'), function (b) {
      b.addEventListener('click', function () { doAction(b.getAttribute('data-id'), b.getAttribute('data-role'), 'approve', val('.a-note', b.getAttribute('data-id'))); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.a-no-btn'), function (b) {
      b.addEventListener('click', function () { doAction(b.getAttribute('data-id'), b.getAttribute('data-role'), 'reject', val('.a-note', b.getAttribute('data-id'))); });
    });
  }

  async function doAction(id, role, action, note) {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('a-gate'), SLUG, FREE_LIMIT); $('a-gate').scrollIntoView({ behavior: 'smooth' }); return; }
    var reqs = await listRequests();
    var req = null;
    for (var i = 0; i < reqs.length; i++) if (reqs[i].id === id) req = reqs[i];
    if (!req) { msg('Request not found.', false); return; }
    var r = applyAction(req, role, action, note);
    if (!r.ok) { msg(r.error, false); return; }
    await persistRequest(r.value);
    msg('Recorded: ' + role + ' ' + action + 'd ' + id + '.', true);
    renderRequests();
  }

  function init() {
    Ads.render($('ad-top'), 'purchase-approval-workflow-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'purchase-approval-workflow-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does the purchase approval workflow work?', a: 'You define an approval matrix by amount slab (e.g. up to ₹25,000: HOD; up to ₹1,00,000: HOD then Finance). Each purchase request flows through its chain in order; approvals and rejections are recorded in a timestamped audit trail.' },
      { q: 'परचेज़ अप्रूवल वर्कफ़्लो कैसे काम करता है?', a: 'राशि के स्लैब के हिसाब से अप्रूवल मैट्रिक्स सेट करें। हर खरीद अनुरोध क्रम से अपने चेन से गुज़रता है; हर अप्रूवल/रिजेक्शन टाइमस्टैम्प के साथ ऑडिट ट्रेल में दर्ज होता है।' },
      { q: 'Can someone approve out of turn?', a: 'No. The tool enforces chain order — only the role that is currently pending can approve or reject. The attempt is rejected with an explanation.' },
      { q: 'क्या कोई क्रम से बाहर अप्रूव कर सकता है?', a: 'नहीं। टूल चेन के क्रम को लागू करता है — केवल वही रोल एक्शन ले सकता है जो उस समय पेंडिंग हो।' },
      { q: 'Can I change the approval slabs?', a: 'Yes — edit the comma-separated role lists per slab and save. The default is up to ₹25k: HOD; ₹1L: HOD, Finance; ₹5L: +Director; above: +MD. Changing the matrix does not rewrite old requests.' },
      { q: 'Where are requests stored?', a: 'In your browser vault on this device — up to 25 requests. Nothing is sent anywhere.' }
    ]);

    loadMatrix().then(function (m) { matrixToForm(m); renderMatrixView(m); });
    renderRequests();

    $('a-save-matrix').addEventListener('click', function () { saveMatrix(matrixFromForm()); });

    $('a-create').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('a-gate'), SLUG, FREE_LIMIT); $('a-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var matrix = await loadMatrix();
      var r = newRequest({
        title: $('a-title').value, vendor: $('a-vendor').value,
        amount: $('a-amount').value, requestedBy: $('a-by').value
      }, matrix);
      if (!r.ok) { msg(r.error, false); return; }
      await persistRequest(r.value);
      msg('Created ' + r.value.id + ' — chain: ' + r.value.chain.join(' → '), true);
      $('a-title').value = ''; $('a-vendor').value = ''; $('a-amount').value = '';
      renderRequests();
    });

    $('a-preview').addEventListener('click', async function () {
      var matrix = await loadMatrix();
      var r = approvalChain($('a-amount').value, matrix);
      $('a-preview-out').textContent = r.ok ? 'Chain: ' + r.value.join(' → ') : r.error;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
