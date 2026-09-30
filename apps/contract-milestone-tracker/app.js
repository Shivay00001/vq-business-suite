/* ============================================================
   VisionQuantech Business Suite — Contract Milestone Tracker
   apps/contract-milestone-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   Tracks contract milestones with due dates, % complete, weight,
   linked payments and delay flags. Progress is the weighted
   average % complete (weights normalized; equal weights if all 0).
   A milestone is delayed when its due date has passed and it is
   not 100% complete.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_ITEMS = 25;
  var MAX_NAME = 120;
  var MAX_AMOUNT = 100000000000;

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function text(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: name + ' is required.' };
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function parseDate(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: (field || 'Date') + ' must be in YYYY-MM-DD format.' };
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) {
      return { ok: false, error: (field || 'Date') + ' is not a real calendar date.' };
    }
    return { ok: true, value: s };
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayNum(iso) {
    var p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function uid() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function addMilestone(list, m) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_ITEMS) return { ok: false, error: 'Milestone list is full (max ' + MAX_ITEMS + '). Remove one first.' };
    m = m || {};
    var name = text(m.name, 'Milestone name', MAX_NAME);
    if (!name.ok) return name;
    var due = parseDate(m.due, 'Due date');
    if (!due.ok) return due;
    var wt = num(m.weight == null || m.weight === '' ? 0 : m.weight, 'Weight %', 0, 100);
    if (!wt.ok) return wt;
    var pct = num(m.pctComplete == null || m.pctComplete === '' ? 0 : m.pctComplete, '% complete', 0, 100);
    if (!pct.ok) return pct;
    var pay = num(m.payment == null || m.payment === '' ? 0 : m.payment, 'Linked payment', 0, MAX_AMOUNT);
    if (!pay.ok) return pay;
    var rec = {
      id: uid(), name: name.value, due: due.value,
      weight: round2(wt.value), pctComplete: round2(pct.value),
      payment: round2(pay.value)
    };
    return { ok: true, milestone: rec, list: list.concat([rec]) };
  }

  function removeMilestone(list, id) {
    list = Array.isArray(list) ? list : [];
    var nl = list.filter(function (m) { return m.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Milestone not found.' };
    return { ok: true, list: nl };
  }

  function updatePct(list, id, pctComplete) {
    list = Array.isArray(list) ? list : [];
    var pct = num(pctComplete, '% complete', 0, 100);
    if (!pct.ok) return pct;
    var found = false;
    var nl = list.map(function (m) {
      if (m.id !== id) return m;
      found = true;
      return Object.assign({}, m, { pctComplete: round2(pct.value) });
    });
    if (!found) return { ok: false, error: 'Milestone not found.' };
    return { ok: true, list: nl };
  }

  /** Status of one milestone vs today (or `now`). */
  function milestoneStatus(m, now) {
    var n = now || todayStr();
    if (m.pctComplete >= 100) return { ok: true, status: 'complete', delayDays: 0 };
    var dd = dayNum(n) - dayNum(m.due);
    if (dd > 0) return { ok: true, status: 'delayed', delayDays: dd };
    if (dd >= -7) return { ok: true, status: 'due-soon', delayDays: 0 };
    return { ok: true, status: 'on-track', delayDays: 0 };
  }

  function progress(list) {
    list = Array.isArray(list) ? list : [];
    if (!list.length) return { ok: true, pct: 0 };
    var wsum = 0;
    list.forEach(function (m) { wsum += m.weight; });
    var total = 0;
    if (wsum > 0) {
      list.forEach(function (m) { total += m.pctComplete * m.weight / wsum; });
    } else {
      list.forEach(function (m) { total += m.pctComplete / list.length; });
    }
    return { ok: true, pct: round2(total) };
  }

  function paymentSummary(list) {
    list = Array.isArray(list) ? list : [];
    var s = { total: 0, released: 0, pending: 0, delayed: 0 };
    list.forEach(function (m) {
      s.total = round2(s.total + m.payment);
      if (m.pctComplete >= 100) s.released = round2(s.released + m.payment);
      else {
        s.pending = round2(s.pending + m.payment);
        if (milestoneStatus(m).status === 'delayed') s.delayed = round2(s.delayed + m.payment);
      }
    });
    return { ok: true, summary: s };
  }

  function dashboard(list, now) {
    list = Array.isArray(list) ? list : [];
    var d = { total: list.length, complete: 0, delayed: 0, dueSoon: 0, onTrack: 0, maxDelay: 0 };
    list.forEach(function (m) {
      var s = milestoneStatus(m, now).status;
      if (s === 'complete') d.complete++;
      else if (s === 'delayed') { d.delayed++; var dd = dayNum(now || todayStr()) - dayNum(m.due); if (dd > d.maxDelay) d.maxDelay = dd; }
      else if (s === 'due-soon') d.dueSoon++;
      else d.onTrack++;
    });
    d.progress = progress(list).pct;
    d.payments = paymentSummary(list).summary;
    return { ok: true, dashboard: d };
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
    MAX_ITEMS: MAX_ITEMS,
    addMilestone: addMilestone, removeMilestone: removeMilestone,
    updatePct: updatePct, milestoneStatus: milestoneStatus,
    progress: progress, paymentSummary: paymentSummary,
    dashboard: dashboard, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'contract-milestone-tracker';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'milestones';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('m-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { milestones: [] };

  function statusBadge(s) {
    return s === 'complete' ? '<span class="badge b-ok">Complete</span>'
      : s === 'delayed' ? '<span class="badge b-bad">Delayed</span>'
      : s === 'due-soon' ? '<span class="badge b-warn">Due soon</span>'
      : '<span class="badge b-info">On track</span>';
  }

  function renderList() {
    var box = $('m-list');
    var d = dashboard(state.milestones).dashboard;
    $('m-summary').innerHTML =
      '<div class="sum-strip">' +
      '<span>Overall progress: <strong>' + d.progress + '%</strong></span>' +
      '<span class="b-ok-t">Complete: <strong>' + d.complete + '</strong></span>' +
      '<span class="b-bad-t">Delayed: <strong>' + d.delayed + '</strong>' + (d.delayed ? ' (max ' + d.maxDelay + 'd)' : '') + '</span>' +
      '<span class="b-warn-t">Due soon: <strong>' + d.dueSoon + '</strong></span>' +
      '<span>Payments — released: <strong>' + fmtINR(d.payments.released) + '</strong> · pending: <strong>' + fmtINR(d.payments.pending) + '</strong>' +
      (d.payments.delayed ? ' · <span class="b-bad-t">delayed-linked: <strong>' + fmtINR(d.payments.delayed) + '</strong></span>' : '') + '</span>' +
      '</div>';
    if (!state.milestones.length) {
      box.innerHTML = '<p class="vq-hint">No milestones yet — add your first one above.</p>';
      return;
    }
    var sorted = state.milestones.slice().sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    var html = '';
    sorted.forEach(function (m) {
      var st = milestoneStatus(m);
      html += '<div class="ms-card st-' + st.status + '">' +
        '<div class="t-head"><strong>' + esc(m.name) + '</strong>' + statusBadge(st.status) + '</div>' +
        '<p class="vq-hint">Due: <strong>' + esc(m.due) + '</strong>' +
        (st.status === 'delayed' ? ' · <strong>' + st.delayDays + ' day(s) overdue</strong>' : '') +
        ' · Weight: ' + m.weight + '% · Linked payment: ' + fmtINR(m.payment) + '</p>' +
        '<div class="bar"><div class="bar-fill" style="width:' + Math.min(100, m.pctComplete) + '%"></div></div>' +
        '<div class="ms-row"><label class="vq-hint">% complete: ' +
        '<input type="number" min="0" max="100" step="1" value="' + m.pctComplete + '" data-pct="' + esc(m.id) + '" style="width:5rem"></label>' +
        '<button type="button" class="vq-btn vq-btn-ghost" data-remove="' + esc(m.id) + '">Remove</button></div>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), milestones: state.milestones.slice(0, MAX_ITEMS) });
      msg('Saved on this device (' + state.milestones.length + ' milestone(s)).', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.milestones)) { state.milestones = rec.milestones.slice(0, MAX_ITEMS); renderList(); }
    } catch (e) { /* nothing saved yet */ }
  }

  function init() {
    Ads.render($('ad-top'), 'contract-milestone-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'contract-milestone-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I track contract milestones?', a: 'Add each milestone with its contractual due date, weightage %, and linked payment. Update % complete as work progresses — delayed milestones (past due, not 100%) are flagged automatically.' },
      { q: 'माइलस्टोन कैसे ट्रैक करें?', a: 'हर माइलस्टोन की नियत तिथि, वेटेज % और जुड़ा भुगतान दर्ज करें। कार्य प्रगति के साथ % complete अपडेट करें — अतिदेय माइलस्टोन अपने आप चिह्नित होंगे।' },
      { q: 'How is overall project progress calculated?', a: 'Weighted average of % complete (weights normalized). If you leave all weights at 0, a simple average is used instead.' },
      { q: 'माइलस्टोन में देरी से भुगतान पर क्या असर पड़ता है?', a: 'जुड़ा भुगतान तभी जारी माना जाता है जब माइलस्टोन 100% पूरा हो। देरी से जुड़े भुगतानों का योग अलग दिखाया जाता है ताकि नकदी प्रवाह योजना बन सके।' },
      { q: 'Is this a legal project record?', a: 'No — a planning aid. Contractual claims need certified measurements and notices; confirm with your consultant/CA.' }
    ]);

    $('m-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('m-gate'), SLUG, FREE_LIMIT); $('m-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addMilestone(state.milestones, {
        name: $('m-name').value, due: $('m-due').value,
        weight: $('m-weight').value, pctComplete: $('m-pct').value, payment: $('m-pay').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      state.milestones = r.list;
      msg('Milestone added. ' + gate.remaining + ' free use(s) left today.', true);
      $('m-name').value = ''; $('m-due').value = ''; $('m-weight').value = ''; $('m-pct').value = ''; $('m-pay').value = '';
      renderList();
    });

    $('m-list').addEventListener('change', function (e) {
      var inp = e.target;
      if (inp && inp.dataset && inp.dataset.pct) {
        var r = updatePct(state.milestones, inp.dataset.pct, inp.value);
        if (r.ok) { state.milestones = r.list; renderList(); }
        else msg(r.error, false);
      }
    });
    $('m-list').addEventListener('click', function (e) {
      var b = e.target;
      if (b && b.dataset && b.dataset.remove) {
        var r = removeMilestone(state.milestones, b.dataset.remove);
        if (r.ok) { state.milestones = r.list; renderList(); }
      }
    });

    $('m-save').addEventListener('click', persist);
    renderList();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
