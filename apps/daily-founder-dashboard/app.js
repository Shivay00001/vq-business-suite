/* ============================================================
   VisionQuantech Business Suite — Daily Founder Dashboard
   apps/daily-founder-dashboard/app.js

   Pure functions first (no DOM) — tested under node.
   Morning numbers on one screen: cash, dues in/out, tasks,
   derived alerts. Tasks persist in Vault (max 25, awaited).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_TASKS = 25;
  var MAX_MONEY = 10000000000;

  function validateMoney(v, label) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid ' + label + '.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (n > MAX_MONEY) return { ok: false, error: label + ' looks too large.' };
    return { ok: true, value: n };
  }

  function validateTask(title) {
    var s = String(title == null ? '' : title).trim();
    if (!s) return { ok: false, error: 'Task title is required.' };
    if (s.length > 200) return { ok: false, error: 'Task title is too long (max 200 characters).' };
    return { ok: true, value: s };
  }

  function addTask(tasks, title) {
    var t = validateTask(title);
    if (!t.ok) return t;
    var list = Array.isArray(tasks) ? tasks.slice() : [];
    if (list.length >= MAX_TASKS) return { ok: false, error: 'Task list is full (max ' + MAX_TASKS + ' tasks). Complete or delete some first.' };
    var task = { id: 't' + Date.now() + '-' + list.length, title: t.value, done: false };
    list.push(task);
    return { ok: true, tasks: list, task: task };
  }

  function toggleTask(tasks, id) {
    var list = (Array.isArray(tasks) ? tasks : []).map(function (x) {
      return x.id === id ? { id: x.id, title: x.title, done: !x.done } : x;
    });
    return { ok: true, tasks: list };
  }

  function deleteTask(tasks, id) {
    var list = (Array.isArray(tasks) ? tasks : []).filter(function (x) { return x.id !== id; });
    return { ok: true, tasks: list };
  }

  /** Derive alerts from morning numbers. */
  function computeAlerts(cash, duesIn, duesOut) {
    var alerts = [];
    if (duesOut > cash) alerts.push({ level: 'critical', text: 'Payables (' + fmtINR(duesOut) + ') exceed cash in hand (' + fmtINR(cash) + ') — prioritise payments today.' });
    else if (duesOut > cash * 0.7) alerts.push({ level: 'warn', text: 'Payables are over 70% of cash in hand — review before approving new spends.' });
    if (duesIn > cash * 3 && duesIn > 0) alerts.push({ level: 'warn', text: 'Receivables (' + fmtINR(duesIn) + ') are 3x+ your cash — collections are your #1 job today.' });
    if (cash === 0 && (duesIn > 0 || duesOut > 0)) alerts.push({ level: 'critical', text: 'Zero cash in hand with dues moving — chase at least one receipt before noon.' });
    if (!alerts.length) alerts.push({ level: 'ok', text: 'Numbers look balanced. Focus the day on revenue, not firefighting.' });
    return alerts;
  }

  /** Full morning summary: {cash, duesIn, duesOut, net, openTasks, doneTasks, alerts}. */
  function computeSummary(cash, duesIn, duesOut, tasks) {
    var c = validateMoney(cash, 'cash in hand'); if (!c.ok) return c;
    var di = validateMoney(duesIn, 'dues receivable'); if (!di.ok) return di;
    var dOut = validateMoney(duesOut, 'dues payable'); if (!dOut.ok) return dOut;
    var list = Array.isArray(tasks) ? tasks : [];
    var open = list.filter(function (x) { return !x.done; }).length;
    return {
      ok: true,
      cash: c.value, duesIn: di.value, duesOut: dOut.value,
      net: c.value + di.value - dOut.value,
      totalTasks: list.length, openTasks: open, doneTasks: list.length - open,
      alerts: computeAlerts(c.value, di.value, dOut.value)
    };
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    return '\u20B9' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_TASKS: MAX_TASKS,
    validateMoney: validateMoney, validateTask: validateTask,
    addTask: addTask, toggleTask: toggleTask, deleteTask: deleteTask,
    computeAlerts: computeAlerts, computeSummary: computeSummary,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'daily-founder-dashboard';
  var FREE_LIMIT = 20;
  var TASKS_KEY = 'morning-tasks';

  var state = { cash: 0, duesIn: 0, duesOut: 0, tasks: [] };

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('m-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  async function loadTasks() {
    try {
      var d = await Vault.load(SLUG, TASKS_KEY);
      if (d && Array.isArray(d.tasks)) state.tasks = d.tasks.slice(0, MAX_TASKS);
    } catch (e) { /* offline/private mode */ }
  }

  async function saveTasks() {
    try { await Vault.save(SLUG, TASKS_KEY, { tasks: state.tasks.slice(0, MAX_TASKS) }); }
    catch (e) { /* ignore */ }
  }

  function renderTasks() {
    var host = $('m-tasks');
    if (!state.tasks.length) { host.innerHTML = '<p class="vq-hint">No tasks yet — add your top 3 for today.</p>'; return; }
    host.innerHTML = state.tasks.map(function (x) {
      return '<div class="task' + (x.done ? ' done' : '') + '">' +
        '<input type="checkbox" data-id="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + ' aria-label="mark done">' +
        '<span>' + esc(x.title) + '</span>' +
        '<button class="vq-btn-ghost del" data-id="' + esc(x.id) + '" type="button" aria-label="delete">✕</button></div>';
    }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('input[type=checkbox]'), function (cb) {
      cb.addEventListener('change', async function () {
        state.tasks = toggleTask(state.tasks, cb.getAttribute('data-id')).tasks;
        await saveTasks(); renderTasks(); refreshSummary();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.del'), function (btn) {
      btn.addEventListener('click', async function () {
        state.tasks = deleteTask(state.tasks, btn.getAttribute('data-id')).tasks;
        await saveTasks(); renderTasks(); refreshSummary();
      });
    });
  }

  function refreshSummary() {
    var s = computeSummary(state.cash, state.duesIn, state.duesOut, state.tasks);
    if (!s.ok) { msg(s.error, false); return; }
    msg('', null);
    var alerts = s.alerts.map(function (a) {
      return '<li class="al-' + a.level + '">' + esc(a.text) + '</li>';
    }).join('');
    $('m-result').innerHTML =
      '<div class="kpis">' +
      '<div class="kpi"><span>Cash in hand</span><strong>' + fmtINR(s.cash) + '</strong></div>' +
      '<div class="kpi"><span>Dues receivable</span><strong class="g">' + fmtINR(s.duesIn) + '</strong></div>' +
      '<div class="kpi"><span>Dues payable</span><strong class="r">' + fmtINR(s.duesOut) + '</strong></div>' +
      '<div class="kpi"><span>Net position</span><strong>' + fmtINR(s.net) + '</strong></div>' +
      '<div class="kpi"><span>Tasks open</span><strong>' + s.openTasks + '/' + s.totalTasks + '</strong></div>' +
      '</div>' +
      '<h3>Alerts</h3><ul class="assump" style="list-style:none;padding-left:0">' + alerts + '</ul>';
    $('m-result-card').hidden = false;
  }

  function init() {
    Ads.render($('ad-top'), 'daily-founder-dashboard-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'daily-founder-dashboard-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What should a founder check every morning?', a: 'Five numbers: cash in hand, dues receivable, dues payable, net position, and open tasks. This dashboard computes them plus alerts on one screen.' },
      { q: 'फाउंडर को रोज़ सुबह क्या देखना चाहिए?', a: 'कैश, वसूलने योग्य बकाया, देय बकाया, नेट पोज़िशन और खुले टास्क — एक ही स्क्रीन पर अलर्ट के साथ।' },
      { q: 'Are my dashboard numbers stored anywhere?', a: 'No — cash and dues numbers are computed in your browser and never leave it. Only your task list is saved on-device (max 25 tasks).' },
      { q: 'What does a critical alert mean?', a: 'Payables exceed cash in hand, or zero cash with dues moving. Treat those days as collection days first.' },
      { q: 'Is this financial advice?', a: 'No — a morning visibility tool. Big money decisions still go through your CA.' }
    ]);
    loadTasks().then(renderTasks);

    $('m-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('m-gate'), SLUG, FREE_LIMIT); $('m-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      state.cash = $('m-cash').value; state.duesIn = $('m-duesin').value; state.duesOut = $('m-duesout').value;
      refreshSummary();
    });
    $('m-add').addEventListener('click', async function () {
      var r = addTask(state.tasks, $('m-newtask').value);
      if (!r.ok) { msg(r.error, false); return; }
      state.tasks = r.tasks;
      $('m-newtask').value = '';
      await saveTasks(); renderTasks(); refreshSummary();
      msg('Task added.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
