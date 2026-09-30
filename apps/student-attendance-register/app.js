/* ============================================================
   VisionQuantech Business Suite — Student Attendance Register
   apps/student-attendance-register/app.js

   Pure functions first (no DOM) — tested under node.
   Daily present/absent/leave marking per student, monthly % report,
   defaulter list below a threshold. Max 25 students per register.
   ============================================================ */
(function () {
  'use strict';

  var MAX_STUDENTS = 25;
  var MAX_TEXT = 120;
  var STATUS = { P: 'Present', A: 'Absent', L: 'Leave' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function validDate(v) {
    var s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date.' };
    return { ok: true, value: s };
  }
  function validMonth(v) {
    var s = String(v || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return { ok: false, error: 'Month must be YYYY-MM.' };
    return { ok: true, value: s };
  }
  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long.' };
    return { ok: true, value: s };
  }

  /** state: { students: [{id,name,batch}], days: {dateISO: {studentId: 'P'|'A'|'L'}} } */
  function emptyState() { return { students: [], days: {} }; }

  function addStudent(state, name, batch) {
    if (state.students.length >= MAX_STUDENTS) return { ok: false, error: 'Register full (max 25 students).' };
    var n = validText(name, 'Student name'); if (!n.ok) return n;
    var b = validText(batch, 'Batch'); if (!b.ok) return b;
    var s = { id: uid('sa'), name: n.value, batch: b.value };
    return { ok: true, state: { students: state.students.concat([s]), days: state.days }, student: s };
  }

  function removeStudent(state, id) {
    var days = {};
    Object.keys(state.days).forEach(function (d) {
      var m = Object.assign({}, state.days[d]);
      delete m[id];
      days[d] = m;
    });
    return { ok: true, state: { students: state.students.filter(function (s) { return s.id !== id; }), days: days } };
  }

  /** marks: {studentId: status} — unknown students / invalid statuses are dropped. */
  function markDay(state, date, marks) {
    var d = validDate(date); if (!d.ok) return d;
    var known = {};
    state.students.forEach(function (s) { known[s.id] = true; });
    var clean = {};
    Object.keys(marks || {}).forEach(function (id) {
      if (known[id] && STATUS[marks[id]]) clean[id] = marks[id];
    });
    var days = Object.assign({}, state.days);
    days[d.value] = Object.assign({}, days[d.value] || {}, clean);
    return { ok: true, state: { students: state.students, days: days }, marked: Object.keys(clean).length };
  }

  function monthlyReport(state, month) {
    var m = validMonth(month); if (!m.ok) return m;
    var prefix = m.value + '-';
    var dates = Object.keys(state.days).filter(function (d) { return d.indexOf(prefix) === 0; });
    var rows = state.students.map(function (s) {
      var p = 0, a = 0, l = 0;
      dates.forEach(function (d) {
        var st = state.days[d][s.id];
        if (st === 'P') p++;
        else if (st === 'A') a++;
        else if (st === 'L') l++;
      });
      var total = p + a + l;
      var pct = total ? Math.round(p / total * 1000) / 10 : 0;
      return { id: s.id, name: s.name, batch: s.batch, present: p, absent: a, leave: l, total: total, percent: pct };
    });
    return { ok: true, rows: rows, workingDays: dates.length };
  }

  function defaulters(report, threshold) {
    var t = Number(threshold);
    if (!isFinite(t) || t < 0 || t > 100) return { ok: false, error: 'Threshold must be 0–100.' };
    var rows = report.rows.filter(function (r) { return r.total > 0 && r.percent < t; });
    rows.sort(function (x, y) { return x.percent - y.percent; });
    return { ok: true, rows: rows, threshold: t };
  }

  var API = {
    MAX_STUDENTS: MAX_STUDENTS, STATUS: STATUS, esc: esc,
    emptyState: emptyState, addStudent: addStudent, removeStudent: removeStudent,
    markDay: markDay, monthlyReport: monthlyReport, defaulters: defaulters
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'student-attendance-register', FREE_LIMIT = 20, VAULT_KEY = 'attendance';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('a-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var state = emptyState();

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, state); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && rec.data && Array.isArray(rec.data.students)) state = rec.data;
    } catch (e) {}
  }

  function renderMarkGrid() {
    var date = $('a-date').value;
    var marks = (date && state.days[date]) || {};
    var html = state.students.map(function (s) {
      var cur = marks[s.id] || '';
      function btn(st, label) {
        return '<button type="button" class="vq-btn small a-mark' + (cur === st ? ' active' : '') + '" data-id="' + esc(s.id) + '" data-st="' + st + '">' + label + '</button>';
      }
      return '<div class="a-row"><span><strong>' + esc(s.name) + '</strong> <span class="vq-hint">' + esc(s.batch) + '</span></span>' +
        '<span class="a-btns">' + btn('P', 'Present') + btn('A', 'Absent') + btn('L', 'Leave') + '</span></div>';
    }).join('');
    $('a-grid').innerHTML = html || '<p class="vq-hint">Add students first.</p>';
    var bs = document.querySelectorAll('.a-mark');
    for (var i = 0; i < bs.length; i++) {
      bs[i].addEventListener('click', function () {
        var m = {}; m[this.getAttribute('data-id')] = this.getAttribute('data-st');
        var r = markDay(state, $('a-date').value, m);
        if (!r.ok) { msg(r.error, false); return; }
        state = r.state; persist(); renderMarkGrid();
      });
    }
  }

  function renderReport() {
    var month = $('a-month').value;
    if (!month) { $('a-report-body').innerHTML = '<tr><td colspan="6" class="vq-hint">Pick a month.</td></tr>'; return; }
    var rep = monthlyReport(state, month);
    if (!rep.ok) { msg(rep.error, false); return; }
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('a-gate'), SLUG, FREE_LIMIT); return; }
    $('a-report-body').innerHTML = rep.rows.map(function (r) {
      var cls = r.total && r.percent < 75 ? 'bad' : '';
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.batch) + '</td>' +
        '<td class="num">' + r.present + '</td><td class="num">' + r.absent + '</td>' +
        '<td class="num">' + r.leave + '</td><td class="num ' + cls + '">' + r.percent + '%</td></tr>';
    }).join('') || '<tr><td colspan="6" class="vq-hint">No data.</td></tr>';
    var th = Number($('a-threshold').value) || 75;
    var d = defaulters(rep, th);
    $('a-defaulter').innerHTML = d.rows.length
      ? '<p class="msg-err">Defaulters (below ' + th + '%): ' + d.rows.map(function (r) { return esc(r.name) + ' (' + r.percent + '%)'; }).join(', ') + '</p>'
      : '<p class="msg-ok">No defaulters below ' + th + '%.</p>';
  }

  function init() {
    Ads.render($('ad-top'), 'student-attendance-register-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'student-attendance-register-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I mark daily attendance?', a: 'Pick a date and tap Present/Absent/Leave for each student. Marks save automatically in your browser.' },
      { q: 'मासिक उपस्थिति प्रतिशत कैसे निकालें?', a: 'महीना चुनें और रिपोर्ट बनाएँ — हर छात्र की present/absent/leave संख्या और प्रतिशत अपने आप निकलेगा। 75% से कम वालों की डिफॉल्टर सूची भी मिलेगी।' },
      { q: 'Who counts as a defaulter?', a: 'Any student with attendance below your threshold (default 75%) for the selected month, provided they have at least one marked day.' },
      { q: 'Is attendance data stored online?', a: 'No — everything stays in your browser vault (max 25 students). Nothing is uploaded.' }
    ]);
    $('a-date').value = new Date().toISOString().slice(0, 10);
    $('a-month').value = new Date().toISOString().slice(0, 7);
    restore().then(function () { renderMarkGrid(); });

    $('f-add-sa').addEventListener('click', function () {
      var r = addStudent(state, $('a-name').value, $('a-batch').value);
      if (!r.ok) { msg(r.error, false); return; }
      state = r.state; persist(); renderMarkGrid();
      $('a-name').value = ''; msg('Student added.', true);
    });
    $('a-date').addEventListener('change', renderMarkGrid);
    $('f-report').addEventListener('click', renderReport);
    $('a-threshold').addEventListener('input', renderReport);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
