/* ============================================================
   VisionQuantech Business Suite — Student Performance Analyzer
   apps/student-performance-analyzer/app.js

   Pure functions first (no DOM) — tested under node.
   Works on marks-entry-tool data shape:
   entries: [{studentId, student, exam, subject, marks, maxMarks}]
   Analyses: per-student exam trend, subject-wise strength/weakness,
   class topper list by average percentage.
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEXT = 120;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function examsOf(entries) {
    var map = {};
    entries.forEach(function (x) { map[x.exam] = true; });
    return Object.keys(map).sort();
  }

  function examPercent(entries, studentId, exam) {
    var tot = 0, max = 0;
    entries.forEach(function (x) {
      if (x.studentId === studentId && x.exam === exam) { tot += x.marks; max += x.maxMarks; }
    });
    return max ? round2(tot / max * 100) : null;
  }

  /** Trend across exams for one student: direction + point change. */
  function trend(entries, studentId) {
    var exams = examsOf(entries).filter(function (e) { return examPercent(entries, studentId, e) !== null; });
    if (exams.length < 2) return { ok: false, error: 'Need at least 2 exams for a trend.' };
    var series = exams.map(function (e) { return { exam: e, percent: examPercent(entries, studentId, e) }; });
    var first = series[0].percent, last = series[series.length - 1].percent;
    var diff = round2(last - first);
    var dir = diff > 2 ? 'improving' : diff < -2 ? 'declining' : 'stable';
    return { ok: true, series: series, direction: dir, change: diff, exams: exams.length };
  }

  /** Subject-wise average for one student -> strongest & weakest subject. */
  function subjectAnalysis(entries, studentId) {
    var map = {};
    entries.forEach(function (x) {
      if (x.studentId !== studentId) return;
      var m = map[x.subject] || { subject: x.subject, tot: 0, max: 0, n: 0 };
      m.tot += x.marks; m.max += x.maxMarks; m.n++;
      map[x.subject] = m;
    });
    var rows = Object.keys(map).map(function (k) {
      var m = map[k];
      return { subject: m.subject, exams: m.n, percent: m.max ? round2(m.tot / m.max * 100) : 0 };
    });
    if (!rows.length) return { ok: false, error: 'No marks for this student.' };
    rows.sort(function (a, b) { return b.percent - a.percent; });
    return {
      ok: true, rows: rows,
      strength: rows[0], weakness: rows[rows.length - 1],
      average: round2(rows.reduce(function (s, r) { return s + r.percent; }, 0) / rows.length)
    };
  }

  /** Class topper list: average % across all exams, descending. */
  function topperList(entries, topN) {
    var ids = {};
    entries.forEach(function (x) { ids[x.studentId] = x.student; });
    var keys = Object.keys(ids);
    if (!keys.length) return { ok: false, error: 'No marks data.' };
    var rows = keys.map(function (id) {
      var exams = examsOf(entries).filter(function (e) { return examPercent(entries, id, e) !== null; });
      var sum = 0;
      exams.forEach(function (e) { sum += examPercent(entries, id, e); });
      return { studentId: id, student: ids[id], exams: exams.length, average: exams.length ? round2(sum / exams.length) : 0 };
    });
    rows.sort(function (a, b) { return b.average - a.average; });
    var n = Math.max(1, Math.min(25, parseInt(topN, 10) || 5));
    return { ok: true, rows: rows.slice(0, n), total: rows.length };
  }

  /** Compare all students in one subject (latest exam only). */
  function subjectLeaderboard(entries, subject) {
    var sj = String(subject || '').trim().slice(0, MAX_TEXT);
    if (!sj) return { ok: false, error: 'Subject is required.' };
    var exams = examsOf(entries);
    if (!exams.length) return { ok: false, error: 'No marks data.' };
    var latest = exams[exams.length - 1];
    var rows = [];
    entries.forEach(function (x) {
      if (x.exam === latest && x.subject === sj) {
        rows.push({ studentId: x.studentId, student: x.student, percent: round2(x.marks / x.maxMarks * 100) });
      }
    });
    if (!rows.length) return { ok: false, error: 'No ' + sj + ' marks in ' + latest + '.' };
    rows.sort(function (a, b) { return b.percent - a.percent; });
    return { ok: true, exam: latest, subject: sj, rows: rows };
  }

  var API = {
    esc: esc, round2: round2, examsOf: examsOf, examPercent: examPercent,
    trend: trend, subjectAnalysis: subjectAnalysis, topperList: topperList,
    subjectLeaderboard: subjectLeaderboard
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'student-performance-analyzer', FREE_LIMIT = 20, VAULT_KEY = 'marks';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('p-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var entries = [];

  async function restore() {
    try {
      var rec = await Vault.load('marks-entry-tool', VAULT_KEY); // shared shape with marks-entry-tool
      if (rec && Array.isArray(rec.data)) entries = rec.data;
    } catch (e) {}
  }

  function studentIds() {
    var map = {};
    entries.forEach(function (x) { map[x.studentId] = x.student; });
    return Object.keys(map).map(function (id) { return { id: id, name: map[id] }; });
  }

  function refreshStudents() {
    var sel = $('p-student');
    sel.innerHTML = studentIds().map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>';
    }).join('') || '<option value="">— no data —</option>';
  }

  function renderAnalysis() {
    var id = $('p-student').value;
    if (!id) { msg('Add marks in the Marks Entry Tool first (data is shared).', false); return; }
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('p-gate'), SLUG, FREE_LIMIT); return; }
    var tr = trend(entries, id);
    var sa = subjectAnalysis(entries, id);
    var html = '';
    if (tr.ok) {
      var arrow = tr.direction === 'improving' ? '↗' : tr.direction === 'declining' ? '↘' : '→';
      var cls = tr.direction === 'improving' ? 'msg-ok' : tr.direction === 'declining' ? 'msg-err' : '';
      html += '<h3 class="vq-section-title">Trend across ' + tr.exams + ' exams</h3>' +
        '<p class="' + cls + '"><strong>' + arrow + ' ' + tr.direction.toUpperCase() + '</strong> (' +
        (tr.change >= 0 ? '+' : '') + tr.change + ' points)</p>' +
        '<p class="vq-hint">' + tr.series.map(function (s) { return esc(s.exam) + ': ' + s.percent + '%'; }).join(' · ') + '</p>';
    } else {
      html += '<p class="vq-hint">' + esc(tr.error) + '</p>';
    }
    if (sa.ok) {
      html += '<h3 class="vq-section-title">Subject-wise analysis</h3>' +
        '<p>Strongest: <strong class="msg-ok">' + esc(sa.strength.subject) + ' (' + sa.strength.percent + '%)</strong> · ' +
        'Weakest: <strong class="msg-err">' + esc(sa.weakness.subject) + ' (' + sa.weakness.percent + '%)</strong> · ' +
        'Overall avg: <strong>' + sa.average + '%</strong></p>' +
        '<table class="vq-table"><thead><tr><th>Subject</th><th>Exams</th><th>Avg %</th></tr></thead><tbody>' +
        sa.rows.map(function (r) {
          return '<tr><td>' + esc(r.subject) + '</td><td class="num">' + r.exams + '</td><td class="num">' + r.percent + '%</td></tr>';
        }).join('') + '</tbody></table>';
    }
    $('p-analysis').innerHTML = html;
    var top = topperList(entries, $('p-topn').value);
    $('p-topper-body').innerHTML = top.ok
      ? top.rows.map(function (r, i) {
          var medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
          return '<tr><td class="num">' + (i + 1) + '</td><td>' + medal + esc(r.student) + '</td><td class="num">' + r.exams + '</td><td class="num">' + r.average + '%</td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="vq-hint">' + esc(top.error) + '</td></tr>';
  }

  function init() {
    Ads.render($('ad-top'), 'student-performance-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'student-performance-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does the trend analysis work?', a: 'With marks from 2+ exams it compares the first and latest exam percentages: a rise over 2 points is improving, a fall over 2 points is declining, otherwise stable.' },
      { q: 'मज़बूत और कमज़ोर विषय कैसे पता चलता है?', a: 'हर विषय का सभी परीक्षाओं का औसत प्रतिशत निकाला जाता है — सबसे ऊँचा औसत मज़बूत विषय, सबसे नीचा कमज़ोर विषय। उसी के हिसाब से पढ़ाई की प्राथमिकता तय करें।' },
      { q: 'Where does it get marks data from?', a: 'It reads the same browser vault used by the Marks Entry Tool, so no double entry. Data never leaves your device.' },
      { q: 'Is the topper list official?', a: 'No — it is an average of entered marks, not a board result. Verify before publishing any merit list.' }
    ]);
    restore().then(function () { refreshStudents(); });
    $('f-analyze').addEventListener('click', renderAnalysis);
    $('p-topn').addEventListener('input', renderAnalysis);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
