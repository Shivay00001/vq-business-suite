/* ============================================================
   VisionQuantech Business Suite — Class Scheduling Tool
   apps/class-scheduling-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Weekly timetable grid with teacher + room conflict detection.
   Slots: {id, day, start, end, subject, teacher, room, batch}
   Times are "HH:MM" 24h. Overlaps are strict (touching = OK).
   ============================================================ */
(function () {
  'use strict';

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MAX_TEXT = 120;
  var MAX_SLOTS = 200;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function toMin(t) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t || '').trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  function toHM(min) {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }
  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long.' };
    return { ok: true, value: s };
  }

  function overlap(a, b) {
    if (a.day !== b.day) return false;
    return toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
  }

  function validateSlot(s) {
    if (DAYS.indexOf(s.day) < 0) return { ok: false, error: 'Day must be Mon–Sun.' };
    var st = toMin(s.start), en = toMin(s.end);
    if (st === null || en === null) return { ok: false, error: 'Times must be HH:MM (24h).' };
    if (st >= en) return { ok: false, error: 'End time must be after start time.' };
    var sj = validText(s.subject, 'Subject'); if (!sj.ok) return sj;
    var t = validText(s.teacher, 'Teacher'); if (!t.ok) return t;
    var r = validText(s.room, 'Room'); if (!r.ok) return r;
    var b = validText(s.batch, 'Batch'); if (!b.ok) return b;
    return { ok: true, slot: {
      day: s.day, start: toHM(st), end: toHM(en),
      subject: sj.value, teacher: t.value, room: r.value, batch: b.value
    } };
  }

  /** Find conflicts of `slot` within `slots` (excludes slot.id). */
  function findConflicts(slots, slot) {
    var out = [];
    slots.forEach(function (x) {
      if (slot.id && x.id === slot.id) return;
      if (!overlap(x, slot)) return;
      if (x.teacher.toLowerCase() === slot.teacher.toLowerCase())
        out.push({ type: 'teacher', with: x, message: 'Teacher conflict: ' + slot.teacher + ' is already teaching ' + x.batch + ' (' + x.start + '–' + x.end + ') in ' + x.room + ' on ' + x.day + '.' });
      if (x.room.toLowerCase() === slot.room.toLowerCase())
        out.push({ type: 'room', with: x, message: 'Room ' + slot.room + ' is already booked by ' + x.teacher + ' (' + x.batch + ', ' + x.start + '–' + x.end + ') on ' + x.day + '.' });
      if (x.batch.toLowerCase() === slot.batch.toLowerCase())
        out.push({ type: 'batch', with: x, message: 'Batch ' + slot.batch + ' already has ' + x.subject + ' (' + x.start + '–' + x.end + ') on ' + x.day + '.' });
    });
    return out;
  }

  function addSlot(slots, s) {
    if (slots.length >= MAX_SLOTS) return { ok: false, error: 'Too many slots (max ' + MAX_SLOTS + ').' };
    var v = validateSlot(s); if (!v.ok) return v;
    var slot = v.slot; slot.id = uid('sl');
    var conflicts = findConflicts(slots, slot);
    if (conflicts.length) return { ok: false, error: conflicts[0].message, conflicts: conflicts };
    return { ok: true, slots: slots.concat([slot]), slot: slot };
  }

  function removeSlot(slots, id) {
    return { ok: true, slots: slots.filter(function (x) { return x.id !== id; }) };
  }

  /** Weekly grid: {day: [slots sorted by start]}. */
  function weeklyGrid(slots) {
    var g = {};
    DAYS.forEach(function (d) { g[d] = []; });
    slots.forEach(function (s) { if (g[s.day]) g[s.day].push(s); });
    DAYS.forEach(function (d) { g[d].sort(function (a, b) { return toMin(a.start) - toMin(b.start); }); });
    return { ok: true, grid: g };
  }

  /** Audit an existing list (e.g. imported): returns all pairwise conflicts. */
  function auditSlots(slots) {
    var out = [];
    for (var i = 0; i < slots.length; i++) {
      for (var j = i + 1; j < slots.length; j++) {
        var a = slots[i], b = slots[j];
        if (!overlap(a, b)) continue;
        if (a.teacher.toLowerCase() === b.teacher.toLowerCase())
          out.push({ type: 'teacher', slots: [a.id, b.id], message: 'Teacher clash: ' + a.teacher + ' on ' + a.day + ' ' + a.start + '–' + a.end + ' vs ' + b.start + '–' + b.end + '.' });
        if (a.room.toLowerCase() === b.room.toLowerCase())
          out.push({ type: 'room', slots: [a.id, b.id], message: 'Room clash: ' + a.room + ' on ' + a.day + ' ' + a.start + '–' + a.end + ' vs ' + b.start + '–' + b.end + '.' });
      }
    }
    return { ok: true, conflicts: out };
  }

  var API = {
    DAYS: DAYS, esc: esc, toMin: toMin, toHM: toHM,
    validateSlot: validateSlot, findConflicts: findConflicts,
    addSlot: addSlot, removeSlot: removeSlot, weeklyGrid: weeklyGrid, auditSlots: auditSlots
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'class-scheduling-tool', FREE_LIMIT = 20, VAULT_KEY = 'timetable';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var slots = [];

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, slots); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.data)) slots = rec.data;
    } catch (e) {}
  }

  function render() {
    var g = weeklyGrid(slots).grid;
    var html = DAYS.map(function (d) {
      var cells = g[d].map(function (s) {
        return '<div class="slot"><strong>' + esc(s.start) + '–' + esc(s.end) + '</strong> ' + esc(s.subject) +
          '<br><span class="vq-hint">' + esc(s.batch) + ' · ' + esc(s.teacher) + ' · ' + esc(s.room) + '</span> ' +
          '<button type="button" class="vq-btn small warn s-del" data-id="' + esc(s.id) + '">×</button></div>';
      }).join('');
      return '<div class="day-col"><h3>' + d + '</h3>' + (cells || '<p class="vq-hint">—</p>') + '</div>';
    }).join('');
    $('s-grid').innerHTML = html;
    var dels = document.querySelectorAll('.s-del');
    for (var i = 0; i < dels.length; i++) {
      dels[i].addEventListener('click', function () {
        slots = removeSlot(slots, this.getAttribute('data-id')).slots;
        persist(); render();
      });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'class-scheduling-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'class-scheduling-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How does conflict detection work?', a: 'When you add a class, the tool checks for overlapping times on the same day: a teacher double-booked, a room double-booked, or a batch given two classes at once are all blocked.' },
      { q: 'क्या एक शिक्षक के दो बैच एक साथ लग सकते हैं?', a: 'नहीं — एक ही समय पर एक ही शिक्षक दो बैच नहीं पढ़ा सकता। टूल ऐसी एंट्री को teacher conflict बताकर रोक देता है।' },
      { q: 'Do back-to-back classes conflict?', a: 'No — a class ending at 10:00 and another starting at 10:00 do not overlap. Only true time overlaps are flagged.' },
      { q: 'Where is the timetable stored?', a: 'Only in your browser vault. Nothing is uploaded.' }
    ]);
    $('s-day').innerHTML = DAYS.map(function (d) { return '<option>' + d + '</option>'; }).join('');
    restore().then(render);

    $('f-add-slot').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); return; }
      var r = addSlot(slots, {
        day: $('s-day').value, start: $('s-start').value, end: $('s-end').value,
        subject: $('s-subject').value, teacher: $('s-teacher').value,
        room: $('s-room').value, batch: $('s-batch').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      slots = r.slots; persist(); render(); msg('Class added.', true);
    });

    $('f-clear').addEventListener('click', function () {
      slots = []; persist(); render(); msg('Timetable cleared.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
