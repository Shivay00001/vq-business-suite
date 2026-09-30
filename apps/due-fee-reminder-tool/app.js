/* ============================================================
   VisionQuantech Business Suite — Due Fee Reminder Tool
   apps/due-fee-reminder-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Pick overdue students, generate WhatsApp / SMS reminder texts
   (Hindi + English templates with placeholders), mark reminded.
   The tool generates copy-paste text only — it never sends messages.
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEXT = 120;
  var MAX_LIST = 25;

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

  var TEMPLATES = {
    whatsapp: {
      en: 'Hello {parent}, this is {institute}. Fee of {amount} for {student} (Class {cls}) was due on {dueDate} and is still pending. Kindly pay at the earliest. Reply STOP to opt out.',
      hi: 'नमस्ते {parent}, {institute} से संदेश है। {student} (कक्षा {cls}) की फीस {amount} दिनांक {dueDate} को देय थी, जो अभी बकाया है। कृपया जल्द भुगतान करें।'
    },
    sms: {
      en: '{institute}: Fee of {amount} for {student} due on {dueDate} is pending. Please pay soon. - {institute}',
      hi: '{institute}: {student} की फीस {amount} (देय तिथि {dueDate}) बकाया है। कृपया जल्द भुगतान करें।'
    }
  };

  function validStudent(st) {
    if (!st || typeof st !== 'object') return { ok: false, error: 'Invalid student.' };
    var name = String(st.name || '').trim().slice(0, MAX_TEXT);
    if (!name) return { ok: false, error: 'Student name is required.' };
    var due = Number(st.due);
    if (!isFinite(due) || due <= 0) return { ok: false, error: 'Due amount must be greater than zero.' };
    return { ok: true };
  }

  /**
   * st: {name, parent, cls, due, dueDate}
   * opts: {channel:'whatsapp'|'sms', lang:'en'|'hi', institute}
   */
  function buildReminder(st, opts) {
    var v = validStudent(st);
    if (!v.ok) return v;
    opts = opts || {};
    var channel = opts.channel === 'sms' ? 'sms' : 'whatsapp';
    var lang = opts.lang === 'hi' ? 'hi' : 'en';
    var inst = String(opts.institute || 'Your Institute').trim().slice(0, MAX_TEXT) || 'Your Institute';
    var tpl = TEMPLATES[channel][lang];
    var text = tpl
      .replace(/\{parent\}/g, String(st.parent || 'Parent').trim().slice(0, MAX_TEXT) || 'Parent')
      .replace(/\{institute\}/g, inst)
      .replace(/\{student\}/g, String(st.name).trim())
      .replace(/\{cls\}/g, String(st.cls || '').trim().slice(0, MAX_TEXT) || '-')
      .replace(/\{amount\}/g, fmtINR(st.due))
      .replace(/\{dueDate\}/g, String(st.dueDate || '').slice(0, 10) || '-');
    if (channel === 'sms' && text.length > 160) {
      return { ok: true, text: text.slice(0, 157) + '…', truncated: true, channel: channel, lang: lang };
    }
    return { ok: true, text: text, truncated: false, channel: channel, lang: lang };
  }

  /** Students with due>0 and dueDate passed as of `asOf`. */
  function overdueStudents(list, asOf) {
    if (!Array.isArray(list)) return { ok: false, error: 'Invalid list.' };
    var today = String(asOf || new Date().toISOString().slice(0, 10));
    var out = list.filter(function (st) {
      return Number(st.due) > 0 && String(st.dueDate || '') < today;
    }).slice(0, MAX_LIST);
    return { ok: true, students: out };
  }

  /** Mark students reminded: returns updated map {id: {remindedAt, channel}}. */
  function markReminded(remindedMap, ids, channel) {
    var map = Object.assign({}, remindedMap || {});
    var now = new Date().toISOString();
    (ids || []).forEach(function (id) {
      map[String(id)] = { remindedAt: now, channel: channel === 'sms' ? 'sms' : 'whatsapp' };
    });
    return { ok: true, map: map };
  }

  var API = {
    esc: esc, fmtINR: fmtINR, TEMPLATES: TEMPLATES,
    buildReminder: buildReminder, overdueStudents: overdueStudents, markReminded: markReminded
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'due-fee-reminder-tool', FREE_LIMIT = 20;
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('r-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var students = [];
  var reminded = {};

  function renderList() {
    var today = new Date().toISOString().slice(0, 10);
    var od = overdueStudents(students, today).students;
    if (!od.length) {
      $('r-list').innerHTML = '<p class="vq-hint">No overdue students. Add students with past due dates to build the reminder list.</p>';
      return;
    }
    var lang = $('r-lang').value, channel = $('r-channel').value, inst = $('r-inst').value;
    var html = od.map(function (st) {
      var built = buildReminder(st, { channel: channel, lang: lang, institute: inst });
      var rm = reminded[st.id];
      return '<div class="rem-card" data-id="' + esc(st.id) + '">' +
        '<label class="check-row"><input type="checkbox" class="r-pick" value="' + esc(st.id) + '" checked> ' +
        '<strong>' + esc(st.name) + '</strong> — ' + esc(st.cls || '') + ' · due ' + fmtINR(st.due) + ' (since ' + esc(st.dueDate) + ')' +
        (rm ? ' <span class="pill ok">Reminded ' + esc(rm.channel) + '</span>' : '') + '</label>' +
        '<pre class="r-text">' + esc(built.ok ? built.text : built.error) + '</pre>' +
        (built.truncated ? '<p class="vq-hint">SMS truncated to 160 chars.</p>' : '') +
        '</div>';
    }).join('');
    $('r-list').innerHTML = html;
  }

  function init() {
    Ads.render($('ad-top'), 'due-fee-reminder-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'due-fee-reminder-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I send fee reminders on WhatsApp?', a: 'Select overdue students, pick WhatsApp and a language, then copy the generated text and paste it into WhatsApp yourself. The tool never sends messages automatically.' },
      { q: 'क्या हिंदी में भी रिमाइंडर मैसेज बनता है?', a: 'हाँ — भाषा चुनने पर हिंदी या अंग्रेज़ी में WhatsApp/SMS टेम्पलेट तैयार होता है, जिसमें छात्र का नाम, कक्षा, बकाया राशि और देय तिथि अपने आप भर जाती है।' },
      { q: 'How do I know whom I already reminded?', a: 'Tick the checkbox and press "Mark selected as reminded" — a badge appears next to the student with the channel and time.' },
      { q: 'Does this tool spam parents?', a: 'No. It only drafts text for you to copy. Follow your institute policy and messaging-app rules; stop on any opt-out.' }
    ]);

    $('f-add-st').addEventListener('click', function () {
      if (students.length >= MAX_LIST) { msg('List full (max 25).', false); return; }
      var name = $('r-name').value.trim(), cls = $('r-cls').value.trim();
      var due = Number($('r-due').value), dueDate = $('r-duedate').value;
      if (!name) { msg('Enter the student name.', false); return; }
      if (!isFinite(due) || due <= 0) { msg('Due amount must be greater than zero.', false); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { msg('Enter a valid due date.', false); return; }
      students.push({ id: 'st' + Date.now() + Math.random().toString(36).slice(2, 6), name: name, cls: cls, due: Math.round(due * 100) / 100, dueDate: dueDate });
      $('r-name').value = ''; $('r-due').value = '';
      renderList(); msg('Student added.', true);
    });

    ['r-lang', 'r-channel', 'r-inst'].forEach(function (id) {
      $(id).addEventListener('input', renderList);
    });

    $('f-mark').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); return; }
      var picks = [];
      var boxes = document.querySelectorAll('.r-pick');
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) picks.push(boxes[i].value);
      if (!picks.length) { msg('Select at least one student.', false); return; }
      reminded = markReminded(reminded, picks, $('r-channel').value).map;
      renderList(); msg(picks.length + ' student(s) marked as reminded.', true);
    });

    $('f-clear').addEventListener('click', function () {
      students = []; reminded = {}; renderList(); msg('List cleared.', true);
    });
    renderList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
