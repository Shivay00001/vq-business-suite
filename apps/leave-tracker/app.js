/* ============================================================
   VisionQuantech Business Suite — Leave Tracker
   apps/leave-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   CL/SL/EL quotas (editable) + apply -> approve/reject flow +
   per-employee balance ledger + negative-balance guard.
   Vault writes are ENCRYPTED ONLY: saving is blocked until a
   passphrase is set; if setPassphrase() rejects, saves stay
   disabled — never written unencrypted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var TYPES = ['CL', 'SL', 'EL'];
  var MAX_EMPLOYEES = 25;
  var MAX_NAME = 120;
  var MAX_LEDGER = 500;

  function defaultQuotas() { return { CL: 12, SL: 12, EL: 15 }; }

  function isValidDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function sanitizeName(name) {
    if (typeof name !== 'string') return { ok: false, error: 'Enter a valid name.' };
    var t = name.trim().replace(/\s+/g, ' ');
    if (!t) return { ok: false, error: 'Employee name cannot be empty.' };
    if (t.length > MAX_NAME) return { ok: false, error: 'Name too long (max ' + MAX_NAME + ' characters).' };
    return { ok: true, value: t };
  }

  /** Validate a yearly quota: integer 0..365. */
  function validateQuota(v) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Quota must be a whole number.' };
    if (n < 0 || n > 365) return { ok: false, error: 'Quota must be between 0 and 365 days.' };
    return { ok: true, value: n };
  }

  function validateQuotas(q) {
    q = q || {};
    var out = {};
    for (var i = 0; i < TYPES.length; i++) {
      var r = validateQuota(q[TYPES[i]]);
      if (!r.ok) return { ok: false, error: TYPES[i] + ': ' + r.error };
      out[TYPES[i]] = r.value;
    }
    return { ok: true, value: out };
  }

  /** Inclusive calendar-day count between two dates. */
  function leaveDays(from, to) {
    if (!isValidDateStr(from) || !isValidDateStr(to)) return { ok: false, error: 'Pick valid from/to dates.' };
    var a = new Date(from + 'T00:00:00'), b = new Date(to + 'T00:00:00');
    if (b < a) return { ok: false, error: '"To" date cannot be before "From" date.' };
    var days = Math.round((b - a) / 86400000) + 1;
    if (days > 365) return { ok: false, error: 'A single application cannot exceed 365 days.' };
    return { ok: true, value: days };
  }

  /**
   * Balance ledger for one employee across a year.
   * state: {quotas:{CL,SL,EL}, ledger:[{empId,type,days,status}]}
   */
  function balances(state, empId, year) {
    var q = (state && state.quotas) || defaultQuotas();
    var rows = (state && Array.isArray(state.ledger) ? state.ledger : [])
      .filter(function (e) { return e.empId === empId && String(e.from).slice(0, 4) === String(year); });
    var out = {};
    TYPES.forEach(function (t) {
      var availed = 0, pending = 0;
      rows.forEach(function (e) {
        if (e.type !== t) return;
        if (e.status === 'approved') availed += e.days;
        else if (e.status === 'pending') pending += e.days;
      });
      var quota = q[t] || 0;
      out[t] = { quota: quota, availed: availed, pending: pending, balance: quota - availed };
    });
    return out;
  }

  /**
   * Apply for leave. Negative-balance guard: requested days must
   * not exceed the current balance (quota - approved).
   */
  function applyLeave(state, empId, type, from, to, reason) {
    if (TYPES.indexOf(type) < 0) return { ok: false, error: 'Unknown leave type.' };
    if (!empId) return { ok: false, error: 'Select an employee.' };
    var d = leaveDays(from, to);
    if (!d.ok) return { ok: false, error: d.error };
    var r = (reason == null ? '' : String(reason)).trim();
    if (r.length > 200) return { ok: false, error: 'Reason too long (max 200 characters).' };
    state = state || {};
    state.ledger = Array.isArray(state.ledger) ? state.ledger : [];
    if (state.ledger.length >= MAX_LEDGER) return { ok: false, error: 'Leave history is full (' + MAX_LEDGER + ' records). Export and clear old records.' };
    var year = String(from).slice(0, 4);
    var bal = balances(state, empId, year)[type].balance;
    if (d.value > bal) {
      return { ok: false, error: 'Not enough ' + type + ' balance: ' + d.value + ' day(s) requested, only ' + bal + ' available.' };
    }
    var entry = {
      id: 'lv-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      empId: empId, type: type, from: from, to: to, days: d.value,
      reason: r, status: 'pending', createdAt: new Date().toISOString()
    };
    state.ledger.push(entry);
    return { ok: true, entry: entry, state: state };
  }

  function findEntry(state, id) {
    var list = (state && Array.isArray(state.ledger)) ? state.ledger : [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** Approve: deducts days. Guard re-checked at approval time. */
  function approveLeave(state, id) {
    var e = findEntry(state, id);
    if (!e) return { ok: false, error: 'Leave request not found.' };
    if (e.status !== 'pending') return { ok: false, error: 'Only pending requests can be approved.' };
    var year = String(e.from).slice(0, 4);
    var bal = balances(state, e.empId, year)[e.type].balance;
    if (e.days > bal) {
      return { ok: false, error: 'Cannot approve: only ' + bal + ' ' + e.type + ' day(s) left. Reject or ask the employee to revise.' };
    }
    e.status = 'approved';
    e.decidedAt = new Date().toISOString();
    return { ok: true, entry: e };
  }

  function rejectLeave(state, id) {
    var e = findEntry(state, id);
    if (!e) return { ok: false, error: 'Leave request not found.' };
    if (e.status !== 'pending') return { ok: false, error: 'Only pending requests can be rejected.' };
    e.status = 'rejected';
    e.decidedAt = new Date().toISOString();
    return { ok: true, entry: e };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    TYPES: TYPES, MAX_EMPLOYEES: MAX_EMPLOYEES,
    defaultQuotas: defaultQuotas, validateQuota: validateQuota,
    validateQuotas: validateQuotas, leaveDays: leaveDays,
    balances: balances, applyLeave: applyLeave,
    approveLeave: approveLeave, rejectLeave: rejectLeave,
    sanitizeName: sanitizeName, isValidDateStr: isValidDateStr, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'leave-tracker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('lt-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }

  var employees = [];
  var state = { quotas: defaultQuotas(), ledger: [] };

  function vaultReady() {
    if (Vault.hasPassphrase()) return true;
    msg('Set a passphrase above first — leave records are never saved unencrypted.', false);
    return false;
  }
  async function persist() {
    await Vault.save(SLUG, 'leave-state', state);
    await Vault.save(SLUG, 'employees', employees);
  }
  function empName(id) {
    for (var i = 0; i < employees.length; i++) if (employees[i].id === id) return employees[i].name;
    return '—';
  }
  function empOptions(sel, list) {
    sel.innerHTML = list.length
      ? list.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>'; }).join('')
      : '<option value="">— add employees first —</option>';
  }
  function fmtDate(s) {
    var p = String(s).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function yearOf(s) { return String(s).slice(0, 4) || String(new Date().getFullYear()); }

  function renderEmployees() {
    var w = $('lt-emp-list');
    w.innerHTML = employees.length ? employees.map(function (e) {
      return '<div class="row"><span><strong>' + esc(e.name) + '</strong>' +
        (e.doj ? ' <span class="vq-hint">joined ' + esc(fmtDate(e.doj)) + '</span>' : '') + '</span>' +
        '<button type="button" class="vq-btn btn-sm" data-del="' + esc(e.id) + '">Remove</button></div>';
    }).join('') : '<p class="vq-hint">No employees yet.</p>';
    w.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!vaultReady()) return;
        employees = employees.filter(function (e) { return e.id !== b.getAttribute('data-del'); });
        try { await persist(); refresh(); msg('Employee removed.', true); }
        catch (err) { msg('Could not save: ' + err.message, false); }
      });
    });
    empOptions($('lt-emp'), employees);
    empOptions($('lt-ledger-emp'), employees);
  }

  function renderQuotas() {
    $('lt-q-cl').value = state.quotas.CL;
    $('lt-q-sl').value = state.quotas.SL;
    $('lt-q-el').value = state.quotas.EL;
  }

  function renderPending() {
    var w = $('lt-pending');
    var pend = state.ledger.filter(function (e) { return e.status === 'pending'; });
    w.innerHTML = pend.length ? pend.map(function (e) {
      return '<div class="row"><span><strong>' + esc(empName(e.empId)) + '</strong> · ' + e.type +
        ' · ' + e.days + ' day(s) · ' + esc(fmtDate(e.from)) + ' → ' + esc(fmtDate(e.to)) +
        (e.reason ? '<br><span class="vq-hint">' + esc(e.reason) + '</span>' : '') +
        ' <span class="badge b-pending">PENDING</span></span>' +
        '<span><button type="button" class="vq-btn btn-sm" data-ap="' + esc(e.id) + '">Approve</button> ' +
        '<button type="button" class="vq-btn btn-sm" data-rj="' + esc(e.id) + '">Reject</button></span></div>';
    }).join('') : '<p class="vq-hint">No pending requests.</p>';
    w.querySelectorAll('[data-ap]').forEach(function (b) {
      b.addEventListener('click', function () { decide(b.getAttribute('data-ap'), 'approve'); });
    });
    w.querySelectorAll('[data-rj]').forEach(function (b) {
      b.addEventListener('click', function () { decide(b.getAttribute('data-rj'), 'reject'); });
    });
  }

  async function decide(id, how) {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('lt-gate'), SLUG, FREE_LIMIT); $('lt-gate').scrollIntoView({ behavior: 'smooth' }); return; }
    if (!vaultReady()) return;
    var r = how === 'approve' ? approveLeave(state, id) : rejectLeave(state, id);
    if (!r.ok) { msg(r.error, false); return; }
    try { await persist(); refresh(); msg('Request ' + (how === 'approve' ? 'approved — balance deducted.' : 'rejected.'), true); }
    catch (err) { msg('Could not save: ' + err.message, false); }
  }

  function renderLedger() {
    var id = $('lt-ledger-emp').value;
    var t = $('lt-ledger'), h = $('lt-history');
    if (!id) { t.innerHTML = ''; h.innerHTML = '<p class="vq-hint">Select an employee.</p>'; return; }
    var yr = yearOf($('lt-from').value) || String(new Date().getFullYear());
    var b = balances(state, id, yr);
    t.innerHTML = '<thead><tr><th>Type</th><th>Yearly quota</th><th>Availed</th><th>Pending</th><th>Balance</th></tr></thead><tbody>' +
      TYPES.map(function (x) {
        var v = b[x];
        return '<tr><td><strong>' + x + '</strong></td><td>' + v.quota + '</td><td>' + v.availed +
          '</td><td>' + v.pending + '</td><td class="' + (v.balance <= 0 ? 'bal-low' : '') + '"><strong>' + v.balance + '</strong></td></tr>';
      }).join('') + '</tbody>';
    var hist = state.ledger.filter(function (e) { return e.empId === id; })
      .sort(function (a, b2) { return String(b2.createdAt).localeCompare(String(a.createdAt)); });
    h.innerHTML = hist.length ? hist.slice(0, 50).map(function (e) {
      var cls = e.status === 'approved' ? 'b-approved' : e.status === 'rejected' ? 'b-rejected' : 'b-pending';
      return '<div class="row"><span>' + e.type + ' · ' + e.days + ' day(s) · ' + esc(fmtDate(e.from)) +
        ' → ' + esc(fmtDate(e.to)) + (e.reason ? ' · <span class="vq-hint">' + esc(e.reason) + '</span>' : '') + '</span>' +
        '<span class="badge ' + cls + '">' + e.status.toUpperCase() + '</span></div>';
    }).join('') : '<p class="vq-hint">No leave history for this employee.</p>';
  }

  function updateDaysHint() {
    var d = leaveDays($('lt-from').value, $('lt-to').value);
    $('lt-days-hint').textContent = d.ok ? d.value + ' day(s) requested.' : '';
  }

  function refresh() { renderEmployees(); renderQuotas(); renderPending(); renderLedger(); }

  async function init() {
    Ads.render($('ad-top'), 'leave-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'leave-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does the apply → approve flow work?', a: 'Apply creates a pending request. Approving deducts the days from that leave type\'s balance; rejecting leaves the balance untouched. Pending requests never reduce the balance.' },
      { q: 'छुट्टी का आवेदन और अनुमोदन कैसे काम करता है?', a: 'आवेदन पर अनुरोध pending रहता है। Approve पर बैलेंस से कटौती होती है; Reject पर बैलेंस नहीं घटता।' },
      { q: 'What is the negative-balance guard?', a: 'Neither applying nor approving can push a leave balance below zero — the app blocks the action and shows the available days.' },
      { q: 'Are the CL/SL/EL quotas fixed by law?', a: 'No. Quotas depend on your state\'s Shops & Establishments Act and company policy. The defaults (CL 12 / SL 12 / EL 15) are typical SME practice — edit them to match your policy.' },
      { q: 'Is my data private?', a: 'Yes — nothing leaves your device. Saving is locked until you set a passphrase; records are then stored encrypted (AES-256-GCM) in this browser only.' }
    ]);

    $('pp-set').addEventListener('click', async function () {
      var st = $('pp-status');
      try {
        await Vault.setPassphrase($('pp-input').value);
        $('pp-input').value = '';
        st.textContent = 'Encryption ON — leave records are stored encrypted on this device only.';
        st.className = 'vq-hint pp-on';
        await loadAll();
      } catch (err) {
        st.textContent = 'Could not enable encryption: ' + err.message + ' Saving stays disabled — records are never written unencrypted.';
        st.className = 'vq-hint msg-err';
      }
    });

    $('lt-add').addEventListener('click', async function () {
      if (!vaultReady()) return;
      var n = sanitizeName($('lt-name').value);
      if (!n.ok) { msg(n.error, false); return; }
      if (employees.length >= MAX_EMPLOYEES) { msg('Employee limit reached (' + MAX_EMPLOYEES + ').', false); return; }
      var doj = $('lt-doj').value;
      if (doj && !isValidDateStr(doj)) { msg('Pick a valid joining date.', false); return; }
      employees.push({ id: 'emp-' + Date.now().toString(36), name: n.value, doj: doj || '' });
      $('lt-name').value = ''; $('lt-doj').value = '';
      try { await persist(); refresh(); msg('Employee added.', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    $('lt-q-save').addEventListener('click', async function () {
      if (!vaultReady()) return;
      var r = validateQuotas({ CL: $('lt-q-cl').value, SL: $('lt-q-sl').value, EL: $('lt-q-el').value });
      if (!r.ok) { msg(r.error, false); return; }
      state.quotas = r.value;
      try { await persist(); refresh(); msg('Quotas saved.', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    ['lt-from', 'lt-to'].forEach(function (id) { $(id).addEventListener('change', updateDaysHint); });

    $('lt-apply').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('lt-gate'), SLUG, FREE_LIMIT); $('lt-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      if (!vaultReady()) return;
      var r = applyLeave(state, $('lt-emp').value, $('lt-type').value, $('lt-from').value, $('lt-to').value, $('lt-reason').value);
      if (!r.ok) { msg(r.error, false); return; }
      $('lt-reason').value = '';
      try { await persist(); refresh(); msg('Leave application submitted (pending approval).', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    $('lt-ledger-emp').addEventListener('change', renderLedger);
    await loadAll();
  }

  async function loadAll() {
    try {
      var s = await Vault.load(SLUG, 'leave-state');
      if (s && s.quotas) state = s;
      var e = await Vault.load(SLUG, 'employees');
      employees = Array.isArray(e) ? e : [];
    } catch (err) { /* first run */ }
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
