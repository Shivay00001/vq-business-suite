/* ============================================================
   VisionQuantech Business Suite — Marks Entry Tool
   apps/marks-entry-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Enter marks per subject/exam, auto percentage + grade, class rank.
   entries: [{studentId, student, exam, subject, marks, maxMarks}]
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEXT = 120;
  var MAX_MARKS = 1000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long.' };
    return { ok: true, value: s };
  }

  function addEntry(entries, e) {
    var sn = validText(e.student, 'Student name'); if (!sn.ok) return sn;
    var ex = validText(e.exam, 'Exam name'); if (!ex.ok) return ex;
    var sj = validText(e.subject, 'Subject'); if (!sj.ok) return sj;
    var mm = Number(e.maxMarks);
    if (!isFinite(mm) || mm <= 0) return { ok: false, error: 'Max marks must be greater than zero.' };
    if (mm > MAX_MARKS) return { ok: false, error: 'Max marks looks too large.' };
    var mk = Number(e.marks);
    if (!isFinite(mk)) return { ok: false, error: 'Marks must be a number.' };
    if (mk < 0) return { ok: false, error: 'Marks cannot be negative.' };
    if (mk > mm) return { ok: false, error: 'Marks (' + mk + ') cannot exceed max marks (' + mm + ').' };
    if (entries.length >= 2500) return { ok: false, error: 'Too many entries (max 2500).' };
    // replace duplicate (same student+exam+subject)
    var entry = {
      studentId: String(e.studentId || sn.value).trim(),
      student: sn.value, exam: ex.value, subject: sj.value,
      marks: round2(mk), maxMarks: round2(mm)
    };
    var rest = entries.filter(function (x) {
      return !(x.studentId === entry.studentId && x.exam === entry.exam && x.subject === entry.subject);
    });
    return { ok: true, entries: rest.concat([entry]) };
  }

  function gradeFromPercent(p) {
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B';
    if (p >= 60) return 'C';
    if (p >= 50) return 'D';
    if (p >= 40) return 'E';
    return 'F';
  }

  /** Per-student exam result: totals, percentage, grade, per-subject rows. */
  function examResult(entries, studentId, exam) {
    var rows = entries.filter(function (x) { return x.studentId === studentId && x.exam === exam; });
    if (!rows.length) return { ok: false, error: 'No entries for this student and exam.' };
    var tot = 0, max = 0;
    rows.forEach(function (x) { tot += x.marks; max += x.maxMarks; });
    var pct = max ? round2(tot / max * 100) : 0;
    return {
      ok: true, student: rows[0].student, exam: exam,
      subjects: rows.map(function (x) {
        return { subject: x.subject, marks: x.marks, maxMarks: x.maxMarks, percent: round2(x.marks / x.maxMarks * 100) };
      }),
      total: round2(tot), maxTotal: round2(max), percent: pct, grade: gradeFromPercent(pct)
    };
  }

  /** Rank all students for an exam (ties share rank — dense ranking). */
  function classRank(entries, exam) {
    var ids = {};
    entries.forEach(function (x) { if (x.exam === exam) ids[x.studentId] = x.student; });
    var keys = Object.keys(ids);
    if (!keys.length) return { ok: false, error: 'No entries for this exam.' };
    var rows = keys.map(function (id) {
      var r = examResult(entries, id, exam);
      return { studentId: id, student: r.student, total: r.total, percent: r.percent, grade: r.grade };
    });
    rows.sort(function (a, b) { return b.total - a.total; });
    var rank = 0, prev = null;
    rows.forEach(function (r) {
      if (prev === null || r.total < prev) rank++;
      prev = r.total;
      r.rank = rank;
    });
    return { ok: true, exam: exam, rows: rows };
  }

  function examList(entries) {
    var map = {};
    entries.forEach(function (x) { map[x.exam] = true; });
    return Object.keys(map).sort();
  }

  var API = {
    esc: esc, round2: round2, addEntry: addEntry, gradeFromPercent: gradeFromPercent,
    examResult: examResult, classRank: classRank, examList: examList
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'marks-entry-tool', FREE_LIMIT = 20, VAULT_KEY = 'marks';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('m-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var entries = [];

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, entries); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.data)) entries = rec.data;
    } catch (e) {}
  }

  function refreshExams() {
    var sel = $('m-exam-view');
    var cur = sel.value;
    sel.innerHTML = examList(entries).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') ||
      '<option value="">— no exams —</option>';
    if (cur) sel.value = cur;
  }

  function renderRank() {
    var exam = $('m-exam-view').value;
    if (!exam) { $('m-rank-body').innerHTML = '<tr><td colspan="5" class="vq-hint">No exams yet.</td></tr>'; return; }
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('m-gate'), SLUG, FREE_LIMIT); return; }
    var r = classRank(entries, exam);
    if (!r.ok) { $('m-rank-body').innerHTML = '<tr><td colspan="5" class="vq-hint">' + esc(r.error) + '</td></tr>'; return; }
    $('m-rank-body').innerHTML = r.rows.map(function (x) {
      var medal = x.rank === 1 ? '🥇 ' : x.rank === 2 ? '🥈 ' : x.rank === 3 ? '🥉 ' : '';
      return '<tr><td class="num">' + x.rank + '</td><td>' + medal + esc(x.student) + '</td>' +
        '<td class="num">' + x.total + '</td><td class="num">' + x.percent + '%</td><td>' + x.grade + '</td></tr>';
    }).join('');
  }

  function init() {
    Ads.render($('ad-top'), 'marks-entry-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'marks-entry-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I enter marks?', a: 'Fill student name, exam, subject, marks and max marks, then press Add. The tool rejects marks above the maximum and computes percentage, grade and rank automatically.' },
      { q: 'ग्रेड कैसे तय होता है?', a: '90%+ = A+, 80%+ = A, 70%+ = B, 60%+ = C, 50%+ = D, 40%+ = E, उससे कम = F। आप अपने बोर्ड के ग्रेड स्केल से मिलान कर लें।' },
      { q: 'How are ties handled in rank?', a: 'Students with the same total share the same rank (dense ranking), so you may see two Rank 2s followed by Rank 3.' },
      { q: 'Can I correct a wrong entry?', a: 'Yes — re-enter the same student + exam + subject and the old entry is replaced.' },
      { q: 'Where is marks data stored?', a: 'Only in your browser vault. Nothing is uploaded anywhere.' }
    ]);
    restore().then(function () { refreshExams(); });

    $('f-add-mark').addEventListener('click', function () {
      var r = addEntry(entries, {
        student: $('m-student').value, exam: $('m-exam').value, subject: $('m-subject').value,
        marks: $('m-marks').value, maxMarks: $('m-max').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      entries = r.entries; persist(); refreshExams();
      $('m-marks').value = '';
      msg('Marks saved.', true);
    });

    $('f-rank').addEventListener('click', renderRank);
    $('f-clear').addEventListener('click', function () {
      entries = []; persist(); refreshExams(); renderRank(); msg('All entries cleared.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
