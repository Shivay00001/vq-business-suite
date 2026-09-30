/* ============================================================
   VisionQuantech Business Suite — Batch Management Tool
   apps/batch-management-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Batches with capacity, schedule, fee plan; enrollment counts;
   over-capacity warnings. Max 25 batches, 25 students per batch.
   ============================================================ */
(function () {
  'use strict';

  var MAX_BATCHES = 25;
  var MAX_STUDENTS = 25;
  var MAX_TEXT = 120;
  var MAX_AMOUNT = 100000000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long.' };
    return { ok: true, value: s };
  }

  function addBatch(batches, b) {
    if (batches.length >= MAX_BATCHES) return { ok: false, error: 'Batch limit reached (max 25).' };
    var n = validText(b.name, 'Batch name'); if (!n.ok) return n;
    var cap = Number(b.capacity);
    if (!isFinite(cap) || Math.floor(cap) !== cap) return { ok: false, error: 'Capacity must be a whole number.' };
    if (cap < 1 || cap > MAX_STUDENTS) return { ok: false, error: 'Capacity must be between 1 and ' + MAX_STUDENTS + '.' };
    var fee = Number(b.fee);
    if (!isFinite(fee) || fee < 0) return { ok: false, error: 'Fee must be zero or more.' };
    if (fee > MAX_AMOUNT) return { ok: false, error: 'Fee looks too large.' };
    var batch = {
      id: uid('ba'), name: n.value, capacity: cap,
      days: String(b.days || '').trim().slice(0, MAX_TEXT),
      timing: String(b.timing || '').trim().slice(0, MAX_TEXT),
      fee: Math.round(fee * 100) / 100
    };
    return { ok: true, batches: batches.concat([batch]), batch: batch };
  }

  function removeBatch(batches, enrollments, id) {
    return { ok: true,
      batches: batches.filter(function (x) { return x.id !== id; }),
      enrollments: (enrollments || []).filter(function (e) { return e.batchId !== id; }) };
  }

  /** enrollments: [{batchId, studentId, student}] */
  function enroll(batches, enrollments, batchId, student) {
    var b = batches.filter(function (x) { return x.id === batchId; })[0];
    if (!b) return { ok: false, error: 'Batch not found.' };
    var n = validText(student, 'Student name'); if (!n.ok) return n;
    var count = enrollments.filter(function (e) { return e.batchId === batchId; }).length;
    if (count >= b.capacity) return { ok: false, error: 'Batch "' + b.name + '" is full (' + b.capacity + '/' + b.capacity + '). Cannot over-enroll.' };
    var dup = enrollments.filter(function (e) {
      return e.batchId === batchId && e.student.toLowerCase() === n.value.toLowerCase();
    })[0];
    if (dup) return { ok: false, error: 'Student is already enrolled in this batch.' };
    var e = { id: uid('en'), batchId: batchId, studentId: uid('bs'), student: n.value };
    return { ok: true, enrollments: enrollments.concat([e]), enrollment: e };
  }

  function unenroll(enrollments, enrollmentId) {
    return { ok: true, enrollments: enrollments.filter(function (e) { return e.id !== enrollmentId; }) };
  }

  /** Summary rows with fill % and over-capacity warnings. */
  function batchSummary(batches, enrollments) {
    var rows = batches.map(function (b) {
      var enrolled = enrollments.filter(function (e) { return e.batchId === b.id; }).length;
      var fill = Math.round(enrolled / b.capacity * 1000) / 10;
      return {
        id: b.id, name: b.name, capacity: b.capacity, enrolled: enrolled,
        seatsLeft: b.capacity - enrolled, fill: fill,
        days: b.days, timing: b.timing, fee: b.fee,
        expectedRevenue: Math.round(enrolled * b.fee * 100) / 100,
        warning: enrolled >= b.capacity ? 'FULL — no seats left' :
                 fill >= 80 ? 'Nearly full (' + fill + '%)' : ''
      };
    });
    var over = rows.filter(function (r) { return r.warning.indexOf('FULL') === 0; });
    return { ok: true, rows: rows, fullBatches: over.length, totalBatches: rows.length };
  }

  var API = {
    MAX_BATCHES: MAX_BATCHES, esc: esc, fmtINR: fmtINR,
    addBatch: addBatch, removeBatch: removeBatch, enroll: enroll,
    unenroll: unenroll, batchSummary: batchSummary
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'batch-management-tool', FREE_LIMIT = 20, VAULT_KEY = 'batches';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('b-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var batches = [], enrollments = [];

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, { batches: batches, enrollments: enrollments }); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && rec.data && Array.isArray(rec.data.batches)) { batches = rec.data.batches; enrollments = rec.data.enrollments || []; }
    } catch (e) {}
  }

  function refreshBatchSelects() {
    var opts = batches.map(function (b) {
      return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>';
    }).join('') || '<option value="">— no batches —</option>';
    $('b-enroll-batch').innerHTML = opts;
  }

  function render() {
    refreshBatchSelects();
    var S = batchSummary(batches, enrollments);
    var html = S.rows.map(function (r) {
      var list = enrollments.filter(function (e) { return e.batchId === r.id; });
      var warn = r.warning ? '<span class="pill bad">' + esc(r.warning) + '</span>' : '<span class="pill ok">' + r.seatsLeft + ' seats left</span>';
      var members = list.map(function (e) {
        return '<li>' + esc(e.student) + ' <button type="button" class="vq-btn small warn b-unen" data-id="' + esc(e.id) + '">×</button></li>';
      }).join('');
      return '<div class="batch-card"><h3>' + esc(r.name) + ' ' + warn + '</h3>' +
        '<p class="vq-hint">' + esc(r.days) + (r.days && r.timing ? ' · ' : '') + esc(r.timing) +
        ' · Fee ' + fmtINR(r.fee) + ' · Enrolled ' + r.enrolled + '/' + r.capacity + ' (' + r.fill + '%) · Expected revenue ' + fmtINR(r.expectedRevenue) + '</p>' +
        (members ? '<ul>' + members + '</ul>' : '<p class="vq-hint">No students enrolled.</p>') +
        '<button type="button" class="vq-btn small warn b-del" data-id="' + esc(r.id) + '">Delete batch</button></div>';
    }).join('');
    $('b-list').innerHTML = html || '<p class="vq-hint">No batches yet — create one above.</p>';
    if (S.fullBatches) msg(S.fullBatches + ' batch(es) are FULL.', false);
    var unens = document.querySelectorAll('.b-unen');
    for (var i = 0; i < unens.length; i++) {
      unens[i].addEventListener('click', function () {
        enrollments = unenroll(enrollments, this.getAttribute('data-id')).enrollments;
        persist(); render();
      });
    }
    var dels = document.querySelectorAll('.b-del');
    for (var j = 0; j < dels.length; j++) {
      dels[j].addEventListener('click', function () {
        var r = removeBatch(batches, enrollments, this.getAttribute('data-id'));
        batches = r.batches; enrollments = r.enrollments;
        persist(); render(); msg('Batch deleted.', true);
      });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'batch-management-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'batch-management-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I create a batch?', a: 'Enter the batch name, capacity, schedule days, timing and fee plan, then press Add. Each batch tracks its own enrollments.' },
      { q: 'बैच फुल होने पर क्या होता है?', a: 'क्षमता से ज़्यादा नामांकन ब्लॉक हो जाता है और FULL चेतावनी दिखती है। 80% भरने पर "nearly full" अलर्ट मिलता है ताकि आप नया बैच खोल सकें।' },
      { q: 'How is expected revenue calculated?', a: 'Enrolled students × batch fee. It is a planning estimate, not collected cash.' },
      { q: 'Where is batch data stored?', a: 'Only in your browser vault (max 25 batches). Nothing is uploaded.' }
    ]);
    restore().then(render);

    $('f-add-batch').addEventListener('click', function () {
      var r = addBatch(batches, {
        name: $('b-name').value, capacity: $('b-cap').value, days: $('b-days').value,
        timing: $('b-timing').value, fee: $('b-fee').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      batches = r.batches; persist(); render();
      $('b-name').value = ''; $('b-cap').value = '';
      msg('Batch created.', true);
    });

    $('f-enroll').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); return; }
      var r = enroll(batches, enrollments, $('b-enroll-batch').value, $('b-enroll-name').value);
      if (!r.ok) { msg(r.error, false); return; }
      enrollments = r.enrollments; persist(); render();
      $('b-enroll-name').value = '';
      msg('Enrolled.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
