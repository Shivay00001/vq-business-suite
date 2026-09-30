/* ============================================================
   VisionQuantech Business Suite — Fee Collection Tracker
   apps/fee-collection-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   Per-student fee ledger: total fee, paid, due, overdue status;
   class-wise summary; payment recording with overpayment guard.
   Max 25 students (freemium vault cap) enforced in addStudent.
   State shape: { students: [{id,name,cls,total,dueDate}], payments: [{id,studentId,amount,date}] }
   ============================================================ */
(function () {
  'use strict';

  var MAX_STUDENTS = 25;
  var MAX_AMOUNT = 100000000;
  var MAX_TEXT = 120;

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
  function round2(n) { return Math.round(n * 100) / 100; }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long (max ' + MAX_TEXT + ').' };
    return { ok: true, value: s };
  }
  function validAmount(v, field) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: (field || 'Amount') + ' must be a number.' };
    if (n <= 0) return { ok: false, error: (field || 'Amount') + ' must be greater than zero.' };
    if (n > MAX_AMOUNT) return { ok: false, error: (field || 'Amount') + ' looks too large.' };
    return { ok: true, value: round2(n) };
  }
  function validDate(v) {
    var s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date.' };
    return { ok: true, value: s };
  }

  function emptyState() { return { students: [], payments: [] }; }

  function addStudent(state, name, cls, total, dueDate) {
    if (state.students.length >= MAX_STUDENTS) return { ok: false, error: 'Student limit reached (max 25). Remove a student to add another.' };
    var n = validText(name, 'Student name'); if (!n.ok) return n;
    var c = validText(cls, 'Class/Batch'); if (!c.ok) return c;
    var t = validAmount(total, 'Total fee'); if (!t.ok) return t;
    var d = validDate(dueDate); if (!d.ok) return d;
    var s = { id: uid('st'), name: n.value, cls: c.value, total: t.value, dueDate: d.value };
    return { ok: true, state: { students: state.students.concat([s]), payments: state.payments }, student: s };
  }

  function removeStudent(state, id) {
    return { ok: true, state: {
      students: state.students.filter(function (s) { return s.id !== id; }),
      payments: state.payments.filter(function (p) { return p.studentId !== id; })
    } };
  }

  function paidFor(state, studentId) {
    return round2(state.payments.filter(function (p) { return p.studentId === studentId; })
      .reduce(function (s, p) { return s + p.amount; }, 0));
  }

  function dueFor(state, studentId) {
    var s = state.students.filter(function (x) { return x.id === studentId; })[0];
    if (!s) return null;
    return round2(s.total - paidFor(state, studentId));
  }

  function recordPayment(state, studentId, amount, date) {
    var s = state.students.filter(function (x) { return x.id === studentId; })[0];
    if (!s) return { ok: false, error: 'Student not found.' };
    var a = validAmount(amount, 'Payment amount'); if (!a.ok) return a;
    var d = validDate(date); if (!d.ok) return d;
    var due = dueFor(state, studentId);
    if (a.value > due + 0.001) return { ok: false, error: 'Payment exceeds the due amount (' + fmtINR(due) + ' remaining). Record an advance separately.' };
    var p = { id: uid('pay'), studentId: studentId, amount: a.value, date: d.value };
    return { ok: true, state: { students: state.students, payments: state.payments.concat([p]) }, payment: p };
  }

  /** days between dueDate and asOf (positive = overdue). */
  function daysOverdue(dueDate, asOf) {
    var a = new Date(dueDate + 'T00:00:00'), b = new Date((asOf || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.floor((b - a) / 86400000);
  }

  function ledger(state, asOf) {
    var rows = state.students.map(function (s) {
      var paid = paidFor(state, s.id);
      var due = round2(s.total - paid);
      var od = due > 0 ? daysOverdue(s.dueDate, asOf) : 0;
      return {
        id: s.id, name: s.name, cls: s.cls, total: s.total,
        paid: paid, due: due, dueDate: s.dueDate,
        daysOverdue: od, status: due <= 0 ? 'paid' : (od > 0 ? 'overdue' : 'pending')
      };
    });
    return { ok: true, rows: rows };
  }

  function summary(state, asOf) {
    var l = ledger(state, asOf).rows;
    var t = { totalFee: 0, collected: 0, due: 0, overdue: 0, paidCount: 0, overdueCount: 0, pendingCount: 0 };
    l.forEach(function (r) {
      t.totalFee = round2(t.totalFee + r.total);
      t.collected = round2(t.collected + r.paid);
      t.due = round2(t.due + r.due);
      if (r.status === 'overdue') { t.overdue = round2(t.overdue + r.due); t.overdueCount++; }
      else if (r.status === 'paid') t.paidCount++;
      else t.pendingCount++;
    });
    t.collectionRate = t.totalFee ? round2(t.collected / t.totalFee * 100) : 0;
    return { ok: true, summary: t };
  }

  function classSummary(state, asOf) {
    var l = ledger(state, asOf).rows;
    var map = {};
    l.forEach(function (r) {
      var m = map[r.cls] || { cls: r.cls, students: 0, totalFee: 0, collected: 0, due: 0, overdue: 0 };
      m.students++;
      m.totalFee = round2(m.totalFee + r.total);
      m.collected = round2(m.collected + r.paid);
      m.due = round2(m.due + r.due);
      if (r.status === 'overdue') m.overdue = round2(m.overdue + r.due);
      map[r.cls] = m;
    });
    var rows = Object.keys(map).sort().map(function (k) {
      var m = map[k];
      m.collectionRate = m.totalFee ? round2(m.collected / m.totalFee * 100) : 0;
      return m;
    });
    return { ok: true, rows: rows };
  }

  var API = {
    MAX_STUDENTS: MAX_STUDENTS, esc: esc, fmtINR: fmtINR, round2: round2,
    emptyState: emptyState, addStudent: addStudent, removeStudent: removeStudent,
    recordPayment: recordPayment, paidFor: paidFor, dueFor: dueFor,
    daysOverdue: daysOverdue, ledger: ledger, summary: summary, classSummary: classSummary
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'fee-collection-tracker', FREE_LIMIT = 20, VAULT_KEY = 'ledger';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('c-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var state = emptyState();

  function statusPill(st) {
    var cls = st === 'paid' ? 'pill ok' : st === 'overdue' ? 'pill bad' : 'pill warn';
    var label = st === 'paid' ? 'Paid' : st === 'overdue' ? 'Overdue' : 'Pending';
    return '<span class="' + cls + '">' + label + '</span>';
  }

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, state); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && rec.data && Array.isArray(rec.data.students)) state = rec.data;
    } catch (e) {}
  }

  function refreshStudentSelect() {
    var sel = $('c-pay-student');
    sel.innerHTML = state.students.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + ' — ' + esc(s.cls) + ' (due ' + fmtINR(dueFor(state, s.id)) + ')</option>';
    }).join('') || '<option value="">No students yet</option>';
  }

  function render() {
    var today = new Date().toISOString().slice(0, 10);
    var L = ledger(state, today);
    var S = summary(state, today);
    var rows = L.rows.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.cls) + '</td>' +
        '<td class="num">' + fmtINR(r.total) + '</td><td class="num">' + fmtINR(r.paid) + '</td>' +
        '<td class="num">' + fmtINR(r.due) + '</td>' +
        '<td>' + (r.daysOverdue > 0 ? r.daysOverdue + ' days' : '—') + '</td>' +
        '<td>' + statusPill(r.status) + '</td>' +
        '<td><button type="button" class="vq-btn small warn c-del" data-id="' + esc(r.id) + '">Remove</button></td></tr>';
    }).join('');
    $('c-ledger-body').innerHTML = rows || '<tr><td colspan="8" class="vq-hint">No students yet — add one above.</td></tr>';
    $('c-summary').innerHTML =
      '<div class="stat"><span>Total fee</span><strong>' + fmtINR(S.summary.totalFee) + '</strong></div>' +
      '<div class="stat"><span>Collected</span><strong>' + fmtINR(S.summary.collected) + '</strong></div>' +
      '<div class="stat"><span>Due</span><strong>' + fmtINR(S.summary.due) + '</strong></div>' +
      '<div class="stat"><span>Overdue</span><strong class="bad">' + fmtINR(S.summary.overdue) + '</strong></div>' +
      '<div class="stat"><span>Collection rate</span><strong>' + S.summary.collectionRate + '%</strong></div>' +
      '<div class="stat"><span>Overdue students</span><strong>' + S.summary.overdueCount + '</strong></div>';
    var cls = classSummary(state, today).rows.map(function (m) {
      return '<tr><td>' + esc(m.cls) + '</td><td class="num">' + m.students + '</td>' +
        '<td class="num">' + fmtINR(m.totalFee) + '</td><td class="num">' + fmtINR(m.collected) + '</td>' +
        '<td class="num">' + fmtINR(m.due) + '</td><td class="num">' + m.collectionRate + '%</td></tr>';
    }).join('');
    $('c-class-body').innerHTML = cls || '<tr><td colspan="6" class="vq-hint">No data.</td></tr>';
    refreshStudentSelect();
    var dels = document.querySelectorAll('.c-del');
    for (var i = 0; i < dels.length; i++) {
      dels[i].addEventListener('click', function () {
        state = removeStudent(state, this.getAttribute('data-id')).state;
        persist(); render(); msg('Student removed.', true);
      });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'fee-collection-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'fee-collection-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I track fee collection per student?', a: 'Add each student with their total fee and due date, then record payments as they come in. The ledger shows paid, due, and overdue amounts per student with a class-wise summary.' },
      { q: 'क्या बकाया फीस (overdue) अपने आप दिखेगी?', a: 'हाँ — आज की तारीख के हिसाब से जिस छात्र की due date निकल चुकी है और बकाया बचा है, वह Overdue के रूप में लाल रंग में दिखेगा, साथ में कितने दिन overdue है।' },
      { q: 'Can I record a payment bigger than the due amount?', a: 'No — the tool blocks overpayments so the ledger never goes negative. Record advance payments as a separate arrangement.' },
      { q: 'Where is the data saved?', a: 'Only in your browser via the local vault (max 25 students). Nothing leaves your device.' },
      { q: 'Does this replace my accounting software?', a: 'No — it is a simple collection ledger. For GST and statutory books, use proper accounting records and confirm with your CA.' }
    ]);
    $('c-pay-date').value = new Date().toISOString().slice(0, 10);
    restore().then(render);

    $('f-add-student').addEventListener('click', function () {
      var r = addStudent(state, $('c-name').value, $('c-class').value, $('c-total').value, $('c-duedate').value);
      if (!r.ok) { msg(r.error, false); return; }
      state = r.state;
      persist(); render();
      $('c-name').value = ''; $('c-total').value = '';
      msg('Student added.', true);
    });

    $('f-record-pay').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('c-gate'), SLUG, FREE_LIMIT); return; }
      var r = recordPayment(state, $('c-pay-student').value, $('c-pay-amount').value, $('c-pay-date').value);
      if (!r.ok) { msg(r.error, false); return; }
      state = r.state;
      persist(); render();
      $('c-pay-amount').value = '';
      msg('Payment of ' + fmtINR(r.payment.amount) + ' recorded.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
