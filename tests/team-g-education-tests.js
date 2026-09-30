#!/usr/bin/env node
/*
 * VisionQuantech Business Suite — Week 4, Team G (10 education & coaching tools)
 * Node test harness for the pure (DOM-free) calculation APIs.
 * Each app: >=2 tests, >=1 adversarial case.
 * Run: node tests/team-g-education-tests.js
 */
'use strict';

var path = require('path');
var APPS = path.join(__dirname, '..', 'apps');

function req(slug) { return require(path.join(APPS, slug, 'app.js')); }

var results = [];
function t(app, name, fn) {
  try {
    var r = fn(); // returns true, or {pass, detail}
    var pass = r === true || (r && r.pass);
    var detail = (r && r.detail) || '';
    results.push({ app: app, name: name, pass: !!pass, detail: detail });
  } catch (err) {
    results.push({ app: app, name: name, pass: false, detail: 'THREW: ' + err.message });
  }
}
function eq(a, b) { return Math.abs(a - b) < 0.011; }

/* ============ 1. fee-receipt-generator ============ */
(function () {
  var F = req('fee-receipt-generator');
  var slug = 'fee-receipt-generator';

  t(slug, 'basic receipt: 1000 + 500 items, no GST -> total 1500, correct words', function () {
    var r = F.buildReceipt({
      institute: 'Sharma Coaching', student: 'Aarav Patel', cls: '10',
      items: [{ label: 'Tuition fee', amount: 1000 }, { label: 'Admission fee', amount: 500 }],
      discount: 0, gstOn: false, receiptNo: 'FEE-2026-001', date: '2026-09-26',
      paymentMode: 'UPI', remarks: ''
    });
    return { pass: r.ok && r.receipt.subtotal === 1500 && r.receipt.total === 1500 &&
      r.receipt.words === 'One Thousand Five Hundred Rupees',
      detail: 'total=' + (r.ok && r.receipt.total) + ' words=' + (r.ok && r.receipt.words) };
  });

  t(slug, 'GST 18% on 1000: gst=180, cgst=sgst=90, total=1180', function () {
    var r = F.buildReceipt({
      institute: 'I', student: 'S', items: [{ label: 'Tuition', amount: 1000 }],
      gstOn: true, gstRate: 18, receiptNo: 'FEE-2026-002', date: '2026-09-26'
    });
    var rc = r.receipt;
    return { pass: r.ok && eq(rc.gst, 180) && eq(rc.cgst, 90) && eq(rc.sgst, 90) && eq(rc.total, 1180),
      detail: 'gst=' + (r.ok && rc.gst) + ' total=' + (r.ok && rc.total) };
  });

  t(slug, 'amountInWords Indian system: 123456', function () {
    var w = F.amountInWords(123456);
    return { pass: w === 'One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees', detail: w };
  });

  t(slug, 'nextReceiptNo increments: FEE-2026-007 -> FEE-2026-008', function () {
    var n = F.nextReceiptNo('FEE-2026-007', 'FEE');
    var yr = new Date().getFullYear();
    return { pass: n === 'FEE-' + yr + '-008', detail: n };
  });

  t(slug, 'ADVERSARIAL: negative item amount rejected', function () {
    var r = F.buildReceipt({ institute: 'I', student: 'S', items: [{ label: 'Fee', amount: -500 }],
      receiptNo: 'X', date: '2026-09-26' });
    return { pass: !r.ok && /negative/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: discount larger than subtotal rejected', function () {
    var r = F.buildReceipt({ institute: 'I', student: 'S', items: [{ label: 'Fee', amount: 1000 }],
      discount: 2000, receiptNo: 'X', date: '2026-09-26' });
    return { pass: !r.ok && /exceed/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: XSS in institute name is escaped by esc()', function () {
    var out = F.esc('<script>alert(1)</script>');
    return { pass: out.indexOf('<script>') < 0 && out.indexOf('&lt;script&gt;') === 0, detail: out };
  });
})();

/* ============ 2. fee-collection-tracker ============ */
(function () {
  var C = req('fee-collection-tracker');
  var slug = 'fee-collection-tracker';

  t(slug, 'add student + payment: due=6000, summary rate=40%', function () {
    var st = C.emptyState();
    var a = C.addStudent(st, 'Aarav Patel', 'Class 10', 10000, '2026-10-31');
    if (!a.ok) return { pass: false, detail: a.error };
    var p = C.recordPayment(a.state, a.student.id, 4000, '2026-09-26');
    if (!p.ok) return { pass: false, detail: p.error };
    var s = C.summary(p.state, '2026-09-26').summary;
    return { pass: eq(C.dueFor(p.state, a.student.id), 6000) && eq(s.collectionRate, 40) && s.collected === 4000,
      detail: 'due=' + C.dueFor(p.state, a.student.id) + ' rate=' + s.collectionRate };
  });

  t(slug, 'past dueDate with balance -> overdue status + days', function () {
    var st = C.emptyState();
    var a = C.addStudent(st, 'Diya Nair', 'Class 9', 5000, '2026-09-01');
    if (!a.ok) return { pass: false, detail: a.error };
    var L = C.ledger(a.state, '2026-09-26').rows[0];
    return { pass: L.status === 'overdue' && L.daysOverdue === 25, detail: 'status=' + L.status + ' days=' + L.daysOverdue };
  });

  t(slug, 'ADVERSARIAL: overpayment beyond due rejected', function () {
    var st = C.emptyState();
    var a = C.addStudent(st, 'A', 'C1', 10000, '2026-10-31');
    var p = C.recordPayment(a.state, a.student.id, 11000, '2026-09-26');
    return { pass: !p.ok && /exceeds/i.test(p.error), detail: p.ok ? 'accepted!' : p.error };
  });

  t(slug, 'ADVERSARIAL: 26th student rejected (max 25)', function () {
    var st = C.emptyState();
    for (var i = 0; i < 25; i++) {
      var r = C.addStudent(st, 'S' + i, 'C1', 1000, '2026-10-31');
      st = r.state;
    }
    var last = C.addStudent(st, 'Extra', 'C1', 1000, '2026-10-31');
    return { pass: !last.ok && /limit/i.test(last.error), detail: last.ok ? 'accepted!' : last.error };
  });

  t(slug, 'ADVERSARIAL: negative payment rejected', function () {
    var st = C.emptyState();
    var a = C.addStudent(st, 'A', 'C1', 1000, '2026-10-31');
    var p = C.recordPayment(a.state, a.student.id, -100, '2026-09-26');
    return { pass: !p.ok && /greater than zero/i.test(p.error), detail: p.ok ? 'accepted!' : p.error };
  });
})();

/* ============ 3. due-fee-reminder-tool ============ */
(function () {
  var R = req('due-fee-reminder-tool');
  var slug = 'due-fee-reminder-tool';
  var st = { id: 's1', name: 'Aarav Patel', parent: 'Rohit Patel', cls: '10', due: 2500, dueDate: '2026-09-01' };

  t(slug, 'whatsapp EN template fills all placeholders', function () {
    var r = R.buildReminder(st, { channel: 'whatsapp', lang: 'en', institute: 'Sharma Coaching' });
    return { pass: r.ok && r.text.indexOf('Aarav Patel') >= 0 && r.text.indexOf('Sharma Coaching') >= 0 &&
      r.text.indexOf('\u20B92,500') >= 0 && r.text.indexOf('2026-09-01') >= 0 && r.text.indexOf('{') < 0,
      detail: r.ok ? r.text.slice(0, 60) + '...' : r.error };
  });

  t(slug, 'hindi SMS template generated', function () {
    var r = R.buildReminder(st, { channel: 'sms', lang: 'hi', institute: 'XYZ' });
    return { pass: r.ok && r.lang === 'hi' && /बकाया/.test(r.text), detail: r.ok ? r.text.slice(0, 40) + '...' : r.error };
  });

  t(slug, 'overdueStudents filters out non-overdue (future dueDate, zero due)', function () {
    var list = [
      { id: 'a', name: 'A', due: 100, dueDate: '2026-09-01' },
      { id: 'b', name: 'B', due: 100, dueDate: '2026-12-01' },
      { id: 'c', name: 'C', due: 0, dueDate: '2026-09-01' }
    ];
    var r = R.overdueStudents(list, '2026-09-26');
    return { pass: r.ok && r.students.length === 1 && r.students[0].id === 'a', detail: 'count=' + r.students.length };
  });

  t(slug, 'markReminded records channel + timestamp', function () {
    var r = R.markReminded({}, ['a', 'b'], 'sms');
    return { pass: r.ok && r.map.a.channel === 'sms' && r.map.b.remindedAt, detail: JSON.stringify(r.map.a) };
  });

  t(slug, 'ADVERSARIAL: zero/negative due rejected', function () {
    var r = R.buildReminder({ name: 'A', due: 0, dueDate: '2026-09-01' }, {});
    return { pass: !r.ok && /greater than zero/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: XSS in student name escaped by esc()', function () {
    var out = R.esc('<img src=x onerror=alert(1)>');
    return { pass: out.indexOf('<img') < 0 && out.indexOf('&lt;img') === 0, detail: out };
  });
})();

/* ============ 4. student-attendance-register ============ */
(function () {
  var A = req('student-attendance-register');
  var slug = 'student-attendance-register';

  t(slug, 'mark P/A/L across 3 days -> present=1, absent=1, leave=1, percent=33.3', function () {
    var st = A.emptyState();
    var a = A.addStudent(st, 'Aarav', 'B1'); st = a.state;
    var id = a.student.id;
    function mk(s, d, m) { var r = A.markDay(s, d, m); return r.state; }
    var m1 = {}; m1[id] = 'P'; st = mk(st, '2026-09-01', m1);
    var m2 = {}; m2[id] = 'A'; st = mk(st, '2026-09-02', m2);
    var m3 = {}; m3[id] = 'L'; st = mk(st, '2026-09-03', m3);
    var rep = A.monthlyReport(st, '2026-09');
    var row = rep.rows[0];
    return { pass: rep.ok && row.present === 1 && row.absent === 1 && row.leave === 1 && eq(row.percent, 33.3),
      detail: 'percent=' + row.percent };
  });

  t(slug, 'defaulter below 75% flagged and sorted worst-first', function () {
    var st = A.emptyState();
    var a = A.addStudent(st, 'Low', 'B1'); st = a.state;
    var b = A.addStudent(st, 'Lower', 'B1'); st = b.state;
    function mk(s, d, id, v) { var m = {}; m[id] = v; return A.markDay(s, d, m).state; }
    st = mk(st, '2026-09-01', a.student.id, 'P'); st = mk(st, '2026-09-02', a.student.id, 'A');
    st = mk(st, '2026-09-01', b.student.id, 'A'); st = mk(st, '2026-09-02', b.student.id, 'A');
    var rep = A.monthlyReport(st, '2026-09');
    var d = A.defaulters(rep, 75);
    return { pass: d.ok && d.rows.length === 2 && d.rows[0].name === 'Lower' && d.rows[0].percent === 0,
      detail: d.rows.map(function (r) { return r.name + ':' + r.percent; }).join(',') };
  });

  t(slug, 'ADVERSARIAL: invalid statuses and unknown ids silently dropped', function () {
    var st = A.emptyState();
    var a = A.addStudent(st, 'X', 'B1'); st = a.state;
    var r = A.markDay(st, '2026-09-01', { bogus: 'P', [a.student.id]: '<script>P</script>' });
    return { pass: r.ok && r.marked === 0, detail: 'marked=' + r.marked };
  });

  t(slug, 'ADVERSARIAL: invalid date rejected; 26th student rejected', function () {
    var bad = A.markDay(A.emptyState(), '2026-13-40', {});
    var st = A.emptyState();
    for (var i = 0; i < 25; i++) st = A.addStudent(st, 'S' + i, 'B').state;
    var last = A.addStudent(st, 'Extra', 'B');
    return { pass: !bad.ok && !last.ok, detail: bad.error + ' / ' + last.error };
  });
})();

/* ============ 5. marks-entry-tool ============ */
(function () {
  var M = req('marks-entry-tool');
  var slug = 'marks-entry-tool';

  function seed() {
    var e = [];
    var data = [
      ['s1', 'Aarav', 'Maths', 80], ['s1', 'Aarav', 'Sci', 70],
      ['s2', 'Diya', 'Maths', 90], ['s2', 'Diya', 'Sci', 90],
      ['s3', 'Kabir', 'Maths', 90], ['s3', 'Kabir', 'Sci', 90]
    ];
    data.forEach(function (d) {
      var r = M.addEntry(e, { studentId: d[0], student: d[1], exam: 'UT1', subject: d[2], marks: d[3], maxMarks: 100 });
      e = r.entries;
    });
    return e;
  }

  t(slug, 'examResult: Aarav 150/200 = 75% grade B', function () {
    var r = M.examResult(seed(), 's1', 'UT1');
    return { pass: r.ok && eq(r.percent, 75) && r.grade === 'B' && r.total === 150,
      detail: 'percent=' + r.percent + ' grade=' + r.grade };
  });

  t(slug, 'classRank: dense ties — Diya & Kabir share rank 1, Aarav rank 2', function () {
    var r = M.classRank(seed(), 'UT1');
    var byId = {};
    r.rows.forEach(function (x) { byId[x.studentId] = x.rank; });
    return { pass: r.ok && byId.s2 === 1 && byId.s3 === 1 && byId.s1 === 2,
      detail: JSON.stringify(byId) };
  });

  t(slug, 'gradeFromPercent boundaries: 90->A+, 89.99->A, 39.99->F, 40->E', function () {
    return { pass: M.gradeFromPercent(90) === 'A+' && M.gradeFromPercent(89.99) === 'A' &&
      M.gradeFromPercent(39.99) === 'F' && M.gradeFromPercent(40) === 'E', detail: 'ok' };
  });

  t(slug, 'ADVERSARIAL: marks above max rejected', function () {
    var r = M.addEntry([], { student: 'A', exam: 'UT1', subject: 'Maths', marks: 120, maxMarks: 100 });
    return { pass: !r.ok && /exceed/i.test(r.error), detail: r.ok ? 'accepted!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative marks rejected; re-entry replaces duplicate', function () {
    var neg = M.addEntry([], { student: 'A', exam: 'UT1', subject: 'Maths', marks: -5, maxMarks: 100 });
    var e1 = M.addEntry([], { studentId: 's1', student: 'A', exam: 'UT1', subject: 'Maths', marks: 50, maxMarks: 100 });
    var e2 = M.addEntry(e1.entries, { studentId: 's1', student: 'A', exam: 'UT1', subject: 'Maths', marks: 60, maxMarks: 100 });
    return { pass: !neg.ok && e2.entries.length === 1 && e2.entries[0].marks === 60,
      detail: (neg.ok ? 'neg accepted!' : 'neg rejected') + ', len=' + e2.entries.length };
  });
})();

/* ============ 6. student-performance-analyzer ============ */
(function () {
  var P = req('student-performance-analyzer');
  var slug = 'student-performance-analyzer';

  function seed() {
    return [
      { studentId: 's1', student: 'Aarav', exam: 'UT1', subject: 'Maths', marks: 60, maxMarks: 100 },
      { studentId: 's1', student: 'Aarav', exam: 'UT2', subject: 'Maths', marks: 80, maxMarks: 100 },
      { studentId: 's1', student: 'Aarav', exam: 'UT1', subject: 'Sci', marks: 90, maxMarks: 100 },
      { studentId: 's1', student: 'Aarav', exam: 'UT2', subject: 'Sci', marks: 50, maxMarks: 100 },
      { studentId: 's2', student: 'Diya', exam: 'UT1', subject: 'Maths', marks: 70, maxMarks: 100 },
      { studentId: 's2', student: 'Diya', exam: 'UT2', subject: 'Maths', marks: 75, maxMarks: 100 }
    ];
  }

  t(slug, 'trend: Aarav 75% -> 65% = declining, change -10', function () {
    var r = P.trend(seed(), 's1');
    return { pass: r.ok && r.direction === 'declining' && eq(r.change, -10), detail: r.direction + ' ' + r.change };
  });

  t(slug, 'subjectAnalysis: strength=Sci 70%? weakness=Maths 70% -> strength Maths? check numbers', function () {
    var r = P.subjectAnalysis(seed(), 's1');
    // Maths avg = (60+80)/2 = 70; Sci avg = (90+50)/2 = 70 -> tie, both 70
    return { pass: r.ok && eq(r.strength.percent, 70) && eq(r.weakness.percent, 70) && eq(r.average, 70),
      detail: 'strength=' + r.strength.subject + ' ' + r.strength.percent + ', weakness=' + r.weakness.subject };
  });

  t(slug, 'topperList: Diya avg 72.5 tops Aarav avg 70', function () {
    var r = P.topperList(seed(), 5);
    return { pass: r.ok && r.rows[0].student === 'Diya' && eq(r.rows[0].average, 72.5) &&
      eq(r.rows[1].average, 70), detail: r.rows.map(function (x) { return x.student + ':' + x.average; }).join(',') };
  });

  t(slug, 'ADVERSARIAL: trend with a single exam -> error, not a fake direction', function () {
    var r = P.trend([{ studentId: 's1', student: 'A', exam: 'UT1', subject: 'M', marks: 50, maxMarks: 100 }], 's1');
    return { pass: !r.ok && /at least 2/i.test(r.error), detail: r.ok ? 'faked!' : r.error };
  });

  t(slug, 'ADVERSARIAL: empty entries -> topperList error, no crash', function () {
    var r = P.topperList([], 5);
    return { pass: !r.ok, detail: r.ok ? 'returned rows!' : r.error };
  });
})();

/* ============ 7. batch-management-tool ============ */
(function () {
  var B = req('batch-management-tool');
  var slug = 'batch-management-tool';

  function mkBatch(cap) {
    var r = B.addBatch([], { name: 'B1', capacity: cap, days: 'Mon', timing: '4-6', fee: 2000 });
    return r;
  }

  t(slug, 'enroll to capacity 2 -> summary fill=100%, FULL warning, revenue=4000', function () {
    var r = mkBatch(2);
    var en = [];
    var e1 = B.enroll(r.batches, en, r.batch.id, 'Aarav'); en = e1.enrollments;
    var e2 = B.enroll(r.batches, en, r.batch.id, 'Diya'); en = e2.enrollments;
    var s = B.batchSummary(r.batches, en);
    var row = s.rows[0];
    return { pass: e1.ok && e2.ok && row.fill === 100 && /FULL/.test(row.warning) && row.expectedRevenue === 4000,
      detail: 'fill=' + row.fill + ' rev=' + row.expectedRevenue };
  });

  t(slug, 'ADVERSARIAL: over-capacity enrollment blocked', function () {
    var r = mkBatch(1);
    var e1 = B.enroll(r.batches, [], r.batch.id, 'Aarav');
    var e2 = B.enroll(r.batches, e1.enrollments, r.batch.id, 'Diya');
    return { pass: e1.ok && !e2.ok && /full/i.test(e2.error), detail: e2.ok ? 'over-enrolled!' : e2.error };
  });

  t(slug, 'ADVERSARIAL: zero/negative capacity rejected; duplicate student rejected', function () {
    var z = B.addBatch([], { name: 'X', capacity: 0, fee: 100 });
    var r = mkBatch(5);
    var e1 = B.enroll(r.batches, [], r.batch.id, 'Aarav');
    var e2 = B.enroll(r.batches, e1.enrollments, r.batch.id, 'aarav'); // case-insensitive dup
    return { pass: !z.ok && !e2.ok, detail: z.error + ' / ' + (e2.ok ? 'dup accepted!' : e2.error) };
  });

  t(slug, 'nearly-full warning at 80% fill', function () {
    var r = mkBatch(5);
    var en = [];
    for (var i = 0; i < 4; i++) { var e = B.enroll(r.batches, en, r.batch.id, 'S' + i); en = e.enrollments; }
    var row = B.batchSummary(r.batches, en).rows[0];
    return { pass: /Nearly full/.test(row.warning) && row.seatsLeft === 1, detail: row.warning };
  });
})();

/* ============ 8. class-scheduling-tool ============ */
(function () {
  var S = req('class-scheduling-tool');
  var slug = 'class-scheduling-tool';
  function slot(over) {
    var base = { day: 'Mon', start: '09:00', end: '10:00', subject: 'Maths', teacher: 'Meera', room: 'R1', batch: 'B1' };
    Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
    return base;
  }

  t(slug, 'addSlot ok; weeklyGrid groups and sorts by start', function () {
    var r1 = S.addSlot([], slot({}));
    var r2 = S.addSlot(r1.slots, slot({ start: '11:00', end: '12:00', subject: 'Sci', teacher: 'Ravi', room: 'R2', batch: 'B2' }));
    var g = S.weeklyGrid(r2.slots).grid;
    return { pass: r1.ok && r2.ok && g.Mon.length === 2 && g.Mon[0].start === '09:00' && g.Tue.length === 0,
      detail: 'Mon slots=' + g.Mon.length };
  });

  t(slug, 'back-to-back classes (10:00 end / 10:00 start) do NOT conflict', function () {
    var r1 = S.addSlot([], slot({}));
    var r2 = S.addSlot(r1.slots, slot({ start: '10:00', end: '11:00', subject: 'Sci' }));
    return { pass: r1.ok && r2.ok, detail: r2.ok ? 'accepted' : r2.error };
  });

  t(slug, 'ADVERSARIAL: teacher double-booking blocked with message', function () {
    var r1 = S.addSlot([], slot({}));
    var r2 = S.addSlot(r1.slots, slot({ start: '09:30', end: '10:30', subject: 'Sci', room: 'R2', batch: 'B2' }));
    return { pass: !r2.ok && /teacher/i.test(r2.error), detail: r2.ok ? 'clash missed!' : r2.error };
  });

  t(slug, 'ADVERSARIAL: room clash blocked; end<=start rejected; bad day rejected', function () {
    var r1 = S.addSlot([], slot({}));
    var room = S.addSlot(r1.slots, slot({ start: '09:30', end: '10:30', teacher: 'Other', batch: 'B2', subject: 'Sci' }));
    var badT = S.addSlot([], slot({ start: '10:00', end: '10:00' }));
    var badD = S.addSlot([], slot({ day: 'Funday' }));
    return { pass: !room.ok && !badT.ok && !badD.ok, detail: (room.ok ? 'room missed!' : 'room blocked') };
  });

  t(slug, 'auditSlots finds pairwise teacher clash in a bulk list', function () {
    var a = slot({}); var b = slot({ start: '09:30', end: '10:30', subject: 'Sci' });
    var r = S.auditSlots([a, b]);
    return { pass: r.ok && r.conflicts.length >= 1 && r.conflicts[0].type === 'teacher',
      detail: 'conflicts=' + r.conflicts.length };
  });
})();

/* ============ 9. exam-management-tool ============ */
(function () {
  var X = req('exam-management-tool');
  var slug = 'exam-management-tool';
  function paper(over) {
    var base = { cls: 'Class 10', subject: 'Maths', date: '2026-10-05', start: '10:00', end: '13:00', room: 'Hall A' };
    Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
    return base;
  }

  t(slug, 'addPaper ok; dateSheet sorted by date then time', function () {
    var r1 = X.addPaper([], paper({ date: '2026-10-07', subject: 'Sci' }));
    var r2 = X.addPaper(r1.papers, paper({ date: '2026-10-05', subject: 'Maths' }));
    var ds = X.dateSheet(r2.papers, 'class 10'); // case-insensitive class match
    return { pass: r1.ok && r2.ok && ds.rows.length === 2 && ds.rows[0].subject === 'Maths',
      detail: ds.rows.map(function (p) { return p.subject; }).join(',') };
  });

  t(slug, 'seatPlan: 100 students in 60+50 -> all seated; 120 -> 10 unseated', function () {
    var rooms = [{ name: 'Hall A', capacity: 60 }, { name: 'Hall B', capacity: 50 }];
    var a = X.seatPlan(100, rooms);
    var b = X.seatPlan(120, rooms);
    return { pass: a.ok && a.unseated === 0 && a.allocation[0].seats === 60 && a.allocation[1].seats === 40 &&
      b.ok && b.unseated === 10, detail: 'a.unseated=' + a.unseated + ' b.unseated=' + b.unseated };
  });

  t(slug, 'admitCards: 2 students x 1 paper -> rows with schedule', function () {
    var r = X.addPaper([], paper({}));
    var ac = X.admitCards(r.papers, [{ roll: '1', name: 'Aarav' }, { roll: '2', name: 'Diya' }], 'Class 10');
    return { pass: ac.ok && ac.cards.length === 2 && ac.cards[0].papers.length === 1 &&
      /Maths/.test(ac.cards[0].papers[0]), detail: 'cards=' + ac.cards.length };
  });

  t(slug, 'ADVERSARIAL: same-class overlapping paper blocked', function () {
    var r1 = X.addPaper([], paper({}));
    var r2 = X.addPaper(r1.papers, paper({ subject: 'Sci', start: '11:00', end: '14:00' }));
    return { pass: r1.ok && !r2.ok && /already has/i.test(r2.error), detail: r2.ok ? 'overlap missed!' : r2.error };
  });

  t(slug, 'ADVERSARIAL: zero-capacity room rejected; negative students rejected', function () {
    var a = X.seatPlan(50, [{ name: 'H', capacity: 0 }]);
    var b = X.seatPlan(-5, [{ name: 'H', capacity: 50 }]);
    return { pass: !a.ok && !b.ok, detail: a.error + ' / ' + b.error };
  });
})();

/* ============ 10. fee-recovery-assistant ============ */
(function () {
  var V = req('fee-recovery-assistant');
  var slug = 'fee-recovery-assistant';

  t(slug, 'agingBucket boundaries: 30->b30, 31->b60, 61->b90, 91->b90p, future->current', function () {
    var asOf = '2026-09-26';
    function d(n) { var t = new Date('2026-09-26T00:00:00'); t.setDate(t.getDate() - n); return t.toISOString().slice(0, 10); }
    var r = [
      V.agingBucket(d(30), asOf).bucket, V.agingBucket(d(31), asOf).bucket,
      V.agingBucket(d(61), asOf).bucket, V.agingBucket(d(91), asOf).bucket,
      V.agingBucket(d(-5), asOf).bucket
    ];
    return { pass: r[0] === 'b30' && r[1] === 'b60' && r[2] === 'b90' && r[3] === 'b90p' && r[4] === 'current',
      detail: r.join(',') };
  });

  t(slug, 'priorityScore: 120+ days + big amount -> critical ~100', function () {
    var r = V.priorityScore(50000, 120);
    var low = V.priorityScore(600, 5);
    return { pass: r.ok && r.band === 'critical' && r.score >= 95 && low.ok && low.band === 'normal',
      detail: 'high=' + r.score + '/' + r.band + ' low=' + low.score + '/' + low.band };
  });

  t(slug, 'followUpScript: hindi b90 text with placeholders filled', function () {
    var r = V.followUpScript({ student: 'Aarav', cls: '10', due: 8000, dueDate: '2026-07-01', asOf: '2026-09-26',
      institute: 'XYZ', payBy: '2026-10-05' }, 'hi');
    return { pass: r.ok && r.bucket === 'b90' && /अत्यावश्यक/.test(r.text) && r.text.indexOf('{') < 0,
      detail: r.ok ? r.text.slice(0, 40) + '...' : r.error };
  });

  t(slug, 'agingReport: buckets summed correctly', function () {
    var list = [
      { student: 'A', due: 1000, dueDate: '2026-09-10' },  // b30
      { student: 'B', due: 2000, dueDate: '2026-08-01' },  // b60
      { student: 'C', due: 0, dueDate: '2026-08-01' },     // ignored
      { student: 'D', due: 500, dueDate: '2026-10-01' }    // current
    ];
    var r = V.agingReport(list, '2026-09-26');
    return { pass: r.ok && r.buckets.b30 === 1000 && r.buckets.b60 === 2000 &&
      r.totalOverdue === 3000 && r.counts.current === 1, detail: 'total=' + r.totalOverdue };
  });

  t(slug, 'ADVERSARIAL: not-overdue entry -> no recovery script', function () {
    var r = V.followUpScript({ student: 'A', due: 1000, dueDate: '2026-10-30', asOf: '2026-09-26' }, 'en');
    return { pass: !r.ok && /Not overdue/i.test(r.error), detail: r.ok ? 'script given!' : r.error };
  });

  t(slug, 'ADVERSARIAL: negative due amount rejected in score + script', function () {
    var a = V.priorityScore(-500, 40);
    var b = V.followUpScript({ student: 'A', due: -500, dueDate: '2026-08-01', asOf: '2026-09-26' }, 'en');
    return { pass: !a.ok && !b.ok, detail: a.error + ' / ' + b.error };
  });

  t(slug, 'ADVERSARIAL: XSS in student name escaped by esc()', function () {
    var out = V.esc('"><script>alert(1)</script>');
    return { pass: out.indexOf('<script>') < 0, detail: out };
  });
})();

/* ============ report ============ */
var passed = results.filter(function (r) { return r.pass; }).length;
var failed = results.length - passed;
console.log('Team G (10 education & coaching) pure-API tests: ' + passed + '/' + results.length + ' passed');
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + '  [' + r.app + '] ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
process.exit(failed ? 1 : 0);
