/* ============================================================
   VisionQuantech Business Suite — Attendance Register
   apps/attendance-register/app.js

   Pure functions first (no DOM) — tested under node.
   Browser UI below: employee CRUD + daily marking + month
   grid + monthly summary. Vault writes are ENCRYPTED ONLY:
   saving is blocked until a passphrase is set, and if
   setPassphrase() rejects, saves stay disabled — the app
   never writes employee data unencrypted.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var STATUSES = ['P', 'A', 'HD', 'PL'];
  var MAX_EMPLOYEES = 25;
  var MAX_NAME = 120;
  var MAX_CODE = 30;

  function pad(n) { return String(n).padStart(2, '0'); }

  function isValidDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function isValidMonthStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false;
    var m = +s.split('-')[1];
    return m >= 1 && m <= 12;
  }

  /** Validate/sanitize an employee name. Rejects empty, oversized, non-string. */
  function sanitizeName(name) {
    if (typeof name !== 'string') return { ok: false, error: 'Enter a valid name.' };
    var t = name.trim().replace(/\s+/g, ' ');
    if (!t) return { ok: false, error: 'Employee name cannot be empty.' };
    if (t.length > MAX_NAME) return { ok: false, error: 'Name too long (max ' + MAX_NAME + ' characters).' };
    return { ok: true, value: t };
  }

  /** Validate/sanitize an employee code (optional). */
  function sanitizeCode(code) {
    if (code == null || code === '') return { ok: true, value: '' };
    if (typeof code !== 'string') return { ok: false, error: 'Enter a valid code.' };
    var t = code.trim();
    if (t.length > MAX_CODE) return { ok: false, error: 'Code too long (max ' + MAX_CODE + ' characters).' };
    return { ok: true, value: t };
  }

  function addEmployee(list, name, code) {
    var n = sanitizeName(name);
    if (!n.ok) return { ok: false, error: n.error };
    var c = sanitizeCode(code);
    if (!c.ok) return { ok: false, error: c.error };
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_EMPLOYEES) {
      return { ok: false, error: 'Employee limit reached (' + MAX_EMPLOYEES + '). Remove someone first.' };
    }
    var dup = list.some(function (e) {
      return e.name.toLowerCase() === n.value.toLowerCase() &&
             (e.code || '').toLowerCase() === c.value.toLowerCase();
    });
    if (dup) return { ok: false, error: 'This employee is already in the list.' };
    return { ok: true, employee: { id: 'emp-' + Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1e6).toString(36), name: n.value, code: c.value } };
  }

  function isStatus(s) { return STATUSES.indexOf(s) >= 0; }

  /**
   * Merge a day's marks into the attendance store.
   * store: {"YYYY-MM-DD": {empId: "P"|"A"|"HD"|"PL"}}
   */
  function setDayMarks(store, dateStr, marks) {
    if (!isValidDateStr(dateStr)) return { ok: false, error: 'Invalid date.' };
    store = (store && typeof store === 'object') ? store : {};
    marks = (marks && typeof marks === 'object') ? marks : {};
    var day = {};
    Object.keys(marks).forEach(function (id) {
      if (isStatus(marks[id])) day[String(id)] = marks[id];
    });
    store[dateStr] = day;
    return { ok: true, store: store };
  }

  function daysInMonth(ym) {
    var p = ym.split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }

  /** Per-employee monthly summary. ym = "YYYY-MM". */
  function monthlySummary(store, employees, ym) {
    if (!isValidMonthStr(ym)) return { ok: false, error: 'Invalid month.' };
    store = (store && typeof store === 'object') ? store : {};
    var dim = daysInMonth(ym);
    var rows = (Array.isArray(employees) ? employees : []).map(function (e) {
      var p = 0, a = 0, hd = 0, pl = 0, marked = 0;
      for (var d = 1; d <= dim; d++) {
        var st = store[ym + '-' + pad(d)];
        st = st && st[e.id];
        if (isStatus(st)) {
          marked++;
          if (st === 'P') p++;
          else if (st === 'A') a++;
          else if (st === 'HD') hd++;
          else pl++;
        }
      }
      var equiv = p + hd * 0.5;
      return {
        id: e.id, name: e.name, code: e.code || '',
        present: p, absent: a, halfday: hd, paidLeave: pl,
        marked: marked, presentEquiv: equiv,
        pct: marked ? Math.round(equiv / marked * 1000) / 10 : 0
      };
    });
    return { ok: true, rows: rows, daysInMonth: dim };
  }

  /* ---------------- formatting helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    STATUSES: STATUSES, MAX_EMPLOYEES: MAX_EMPLOYEES,
    isValidDateStr: isValidDateStr, isValidMonthStr: isValidMonthStr,
    sanitizeName: sanitizeName, sanitizeCode: sanitizeCode,
    addEmployee: addEmployee, isStatus: isStatus,
    setDayMarks: setDayMarks, monthlySummary: monthlySummary,
    daysInMonth: daysInMonth, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'attendance-register';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function monthStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function msg(text, ok) {
    var el = $('ar-msg');
    el.textContent = text;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }

  var employees = [];
  var store = {};
  var marks = {}; // working marks for the selected date

  function vaultReady() {
    if (Vault.hasPassphrase()) return true;
    msg('Set a passphrase above first — employee data is never saved unencrypted.', false);
    return false;
  }

  async function persistEmployees() {
    await Vault.save(SLUG, 'employees', employees);
  }
  async function persistDay(dateStr) {
    await Vault.save(SLUG, 'att:' + dateStr, store[dateStr] || {});
  }
  async function loadDay(dateStr) {
    var rec = await Vault.load(SLUG, 'att:' + dateStr);
    store[dateStr] = rec || {};
  }

  function renderEmployees() {
    var wrap = $('ar-emp-list');
    if (!employees.length) {
      wrap.innerHTML = '<p class="vq-hint">No employees yet. Add your first employee above.</p>';
      return;
    }
    wrap.innerHTML = employees.map(function (e) {
      return '<div class="att-row"><span><strong>' + esc(e.name) + '</strong>' +
        (e.code ? ' <span class="vq-hint">' + esc(e.code) + '</span>' : '') + '</span>' +
        '<button type="button" class="vq-btn" data-del="' + esc(e.id) + '" style="padding:.4rem .8rem">Remove</button></div>';
    }).join('');
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!vaultReady()) return;
        var id = b.getAttribute('data-del');
        employees = employees.filter(function (e) { return e.id !== id; });
        delete marks[id];
        try { await persistEmployees(); renderEmployees(); renderMarkGrid(); renderMonth(); msg('Employee removed.', true); }
        catch (err) { msg('Could not save: ' + err.message, false); }
      });
    });
  }

  var STATUS_LABEL = { P: 'Present', A: 'Absent', HD: 'Half-day', PL: 'Paid leave' };
  var STATUS_CLASS = { P: 'on-p', A: 'on-a', HD: 'on-hd', PL: 'on-pl' };

  function renderMarkGrid() {
    var wrap = $('ar-grid');
    if (!employees.length) {
      wrap.innerHTML = '<p class="vq-hint">Add employees first.</p>';
      return;
    }
    wrap.innerHTML = employees.map(function (e) {
      var cur = marks[e.id] || '';
      var btns = STATUSES.map(function (s) {
        return '<button type="button" data-emp="' + esc(e.id) + '" data-st="' + s + '"' +
          (cur === s ? ' class="' + STATUS_CLASS[s] + '"' : '') + ' aria-pressed="' + (cur === s) + '">' + s + '</button>';
      }).join('');
      return '<div class="att-row"><span><strong>' + esc(e.name) + '</strong>' +
        (e.code ? ' <span class="vq-hint">' + esc(e.code) + '</span>' : '') +
        (cur ? ' <span class="vq-hint">' + STATUS_LABEL[cur] + '</span>' : '') + '</span>' +
        '<span class="mark-btns">' + btns + '</span></div>';
    }).join('');
    wrap.querySelectorAll('.mark-btns button').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-emp'), st = b.getAttribute('data-st');
        marks[id] = (marks[id] === st) ? '' : st; // tap again to clear
        renderMarkGrid();
      });
    });
  }

  function cellClass(st) {
    return st === 'P' ? 'cell-p' : st === 'A' ? 'cell-a' : st === 'HD' ? 'cell-hd' : st === 'PL' ? 'cell-pl' : 'cell-x';
  }

  async function renderMonth() {
    var ym = $('ar-month').value;
    if (!isValidMonthStr(ym)) return;
    // ensure this month's days are loaded from the vault
    var dim = daysInMonth(ym);
    for (var d = 1; d <= dim; d++) {
      var key = ym + '-' + pad(d);
      if (!(key in store)) { var rec = await Vault.load(SLUG, 'att:' + key); store[key] = rec || {}; }
    }
    var grid = $('ar-month-grid');
    var head = '<thead><tr><th>Employee</th>';
    for (var i = 1; i <= dim; i++) head += '<th>' + i + '</th>';
    head += '</tr></thead>';
    var body = '<tbody>' + employees.map(function (e) {
      var tds = '';
      for (var k = 1; k <= dim; k++) {
        var st = (store[ym + '-' + pad(k)] || {})[e.id] || '·';
        tds += '<td class="' + cellClass(st) + '">' + st + '</td>';
      }
      return '<tr><th style="text-align:left">' + esc(e.name) + '</th>' + tds + '</tr>';
    }).join('') + '</tbody>';
    grid.innerHTML = head + body;

    var s = monthlySummary(store, employees, ym);
    var sum = $('ar-summary');
    sum.innerHTML = '<thead><tr><th>Employee</th><th>Present</th><th>Absent</th><th>Half-day</th><th>Paid leave</th><th>Present-equiv.</th><th>Marked</th><th>Attend. %</th></tr></thead>' +
      '<tbody>' + s.rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + r.present + '</td><td>' + r.absent + '</td><td>' +
          r.halfday + '</td><td>' + r.paidLeave + '</td><td><strong>' + r.presentEquiv + '</strong></td><td>' +
          r.marked + '/' + s.daysInMonth + '</td><td>' + r.pct + '%</td></tr>';
      }).join('') + '</tbody>';
  }

  async function init() {
    Ads.render($('ad-top'), 'attendance-register-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'attendance-register-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I mark attendance for my staff?', a: 'Add each employee once, pick a date, tap P (present), A (absent), HD (half-day) or PL (paid leave) for each person, then tap "Save day\'s attendance".' },
      { q: 'अटेंडेंस रजिस्टर में हाज़िरी कैसे लगाएँ?', a: 'कर्मचारी जोड़ें, तारीख़ चुनें, हर व्यक्ति के लिए P, A, HD या PL दबाएँ और "Save day\'s attendance" दबाएँ।' },
      { q: 'How is the monthly summary calculated?', a: 'Present-equivalent days = full present days + 0.5 × half-days; attendance % = present-equivalent ÷ marked days × 100.' },
      { q: 'Is my employee data private?', a: 'Yes — nothing leaves your device. Saving stays locked until you set a passphrase; data is then stored encrypted (AES-256-GCM) in this browser only.' }
    ]);

    $('ar-date').value = todayStr();
    $('ar-month').value = monthStr();

    // Passphrase (encrypted-only writes)
    $('pp-set').addEventListener('click', async function () {
      var pw = $('pp-input').value;
      var st = $('pp-status');
      try {
        await Vault.setPassphrase(pw);
        $('pp-input').value = '';
        st.textContent = 'Encryption ON — employee data is stored encrypted (AES-256-GCM) on this device only. The key lives in memory and is wiped when the tab closes.';
        st.className = 'vq-hint pp-on';
        await refreshAll();
      } catch (err) {
        st.textContent = 'Could not enable encryption: ' + err.message + ' Saving stays disabled — this app never writes employee data unencrypted.';
        st.className = 'vq-hint msg-err';
      }
    });

    $('ar-add').addEventListener('click', async function () {
      if (!vaultReady()) return;
      var r = addEmployee(employees, $('ar-name').value, $('ar-code').value);
      if (!r.ok) { msg(r.error, false); return; }
      employees.push(r.employee);
      $('ar-name').value = ''; $('ar-code').value = '';
      try { await persistEmployees(); renderEmployees(); renderMarkGrid(); renderMonth(); msg('Employee added.', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    $('ar-date').addEventListener('change', async function () {
      var ds = $('ar-date').value;
      if (!isValidDateStr(ds)) { msg('Pick a valid date.', false); return; }
      marks = {};
      if (Vault.hasPassphrase()) { await loadDay(ds); marks = Object.assign({}, store[ds]); }
      renderMarkGrid();
    });

    $('ar-mark-all').addEventListener('click', function () {
      employees.forEach(function (e) { marks[e.id] = 'P'; });
      renderMarkGrid();
    });

    $('ar-save-day').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('ar-gate'), SLUG, FREE_LIMIT); $('ar-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      if (!vaultReady()) return;
      var ds = $('ar-date').value;
      var r = setDayMarks(store, ds, marks);
      if (!r.ok) { msg(r.error, false); return; }
      try { await persistDay(ds); renderMonth(); msg('Attendance saved for ' + ds + ' (' + FREE_LIMIT + ' free saves/day).', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    $('ar-month').addEventListener('change', renderMonth);
    await refreshAll();
  }

  async function refreshAll() {
    try {
      var rec = await Vault.load(SLUG, 'employees');
      employees = Array.isArray(rec) ? rec : [];
    } catch (err) { employees = []; }
    renderEmployees();
    var ds = $('ar-date').value || todayStr();
    if (Vault.hasPassphrase()) { await loadDay(ds); marks = Object.assign({}, store[ds]); }
    renderMarkGrid();
    await renderMonth();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
