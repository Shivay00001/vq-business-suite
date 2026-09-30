/* ============================================================
   VisionQuantech Business Suite — Exam Management Tool
   apps/exam-management-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Exam planner: datesheet builder (per class, no same-class overlap),
   seating/hall allocation counts, admit-card data list.
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEXT = 120;
  var MAX_PAPERS = 200;

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
  function validText(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: field + ' is required.' };
    if (s.length > MAX_TEXT) return { ok: false, error: field + ' is too long.' };
    return { ok: true, value: s };
  }
  function validDate(v) {
    var s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return { ok: false, error: 'Invalid date.' };
    return { ok: true, value: s };
  }
  function sameDayOverlap(a, b) {
    return a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
  }

  /** papers: [{id, cls, subject, date, start, end, room}] */
  function addPaper(papers, p) {
    if (papers.length >= MAX_PAPERS) return { ok: false, error: 'Too many papers (max ' + MAX_PAPERS + ').' };
    var c = validText(p.cls, 'Class'); if (!c.ok) return c;
    var sj = validText(p.subject, 'Subject'); if (!sj.ok) return sj;
    var d = validDate(p.date); if (!d.ok) return d;
    var st = toMin(p.start), en = toMin(p.end);
    if (st === null || en === null) return { ok: false, error: 'Times must be HH:MM (24h).' };
    if (st >= en) return { ok: false, error: 'End time must be after start time.' };
    var room = validText(p.room, 'Room/Hall'); if (!room.ok) return room;
    var paper = { id: uid('xp'), cls: c.value, subject: sj.value, date: d.value, start: p.start, end: p.end, room: room.value };
    var clash = papers.filter(function (x) {
      return x.cls.toLowerCase() === paper.cls.toLowerCase() && sameDayOverlap(x, paper);
    })[0];
    if (clash) return { ok: false, error: 'Class ' + paper.cls + ' already has ' + clash.subject + ' on ' + paper.date + ' (' + clash.start + '–' + clash.end + ').' };
    return { ok: true, papers: papers.concat([paper]), paper: paper };
  }

  function removePaper(papers, id) {
    return { ok: true, papers: papers.filter(function (x) { return x.id !== id; }) };
  }

  /** Sorted datesheet for one class. */
  function dateSheet(papers, cls) {
    var c = String(cls || '').trim().toLowerCase();
    var rows = papers.filter(function (x) { return x.cls.toLowerCase() === c; });
    rows.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : toMin(a.start) - toMin(b.start);
    });
    return { ok: true, rows: rows };
  }

  /**
   * Allocate students across rooms by capacity.
   * rooms: [{name, capacity}] — capacities must be positive integers.
   */
  function seatPlan(totalStudents, rooms) {
    var n = Number(totalStudents);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Student count must be a whole number.' };
    if (n < 1) return { ok: false, error: 'Student count must be at least 1.' };
    if (n > 10000) return { ok: false, error: 'Student count looks too large.' };
    if (!Array.isArray(rooms) || !rooms.length) return { ok: false, error: 'Add at least one hall/room.' };
    var clean = [];
    for (var i = 0; i < rooms.length; i++) {
      var name = String(rooms[i].name || '').trim().slice(0, MAX_TEXT);
      var cap = Number(rooms[i].capacity);
      if (!name) return { ok: false, error: 'Room ' + (i + 1) + ' needs a name.' };
      if (!isFinite(cap) || Math.floor(cap) !== cap || cap < 1) return { ok: false, error: 'Room "' + name + '" capacity must be a positive whole number.' };
      clean.push({ name: name, capacity: cap });
    }
    var alloc = [], left = n;
    clean.forEach(function (r) {
      var seats = Math.min(r.capacity, left);
      alloc.push({ name: r.name, capacity: r.capacity, seats: seats });
      left -= seats;
    });
    return { ok: true, allocation: alloc, seated: n - left, unseated: left, halls: clean.length };
  }

  /** Admit-card data: one row per student × all papers of their class. */
  function admitCards(papers, students, cls) {
    var c = String(cls || '').trim().toLowerCase();
    if (!c) return { ok: false, error: 'Class is required.' };
    var rows = dateSheet(papers, c).rows;
    if (!rows.length) return { ok: false, error: 'No papers scheduled for this class.' };
    var cards = (students || []).map(function (s, i) {
      return {
        roll: String(s.roll || (i + 1)).trim().slice(0, MAX_TEXT),
        name: String(s.name || '').trim().slice(0, MAX_TEXT),
        cls: c.toUpperCase(),
        papers: rows.map(function (p) { return p.subject + ' — ' + p.date + ' ' + p.start + ' (' + p.room + ')'; })
      };
    });
    return { ok: true, cards: cards };
  }

  var API = {
    esc: esc, toMin: toMin, addPaper: addPaper, removePaper: removePaper,
    dateSheet: dateSheet, seatPlan: seatPlan, admitCards: admitCards
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'exam-management-tool', FREE_LIMIT = 20, VAULT_KEY = 'exams';
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('x-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var papers = [];

  async function persist() { try { await Vault.save(SLUG, VAULT_KEY, papers); } catch (e) {} }
  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.data)) papers = rec.data;
    } catch (e) {}
  }

  function renderSheet() {
    var cls = $('x-view-cls').value.trim();
    if (!cls) { $('x-sheet-body').innerHTML = '<tr><td colspan="5" class="vq-hint">Enter a class to view its datesheet.</td></tr>'; return; }
    var rows = dateSheet(papers, cls).rows;
    $('x-sheet-body').innerHTML = rows.map(function (p) {
      return '<tr><td>' + esc(p.date) + '</td><td>' + esc(p.start) + '–' + esc(p.end) + '</td><td>' + esc(p.subject) + '</td><td>' + esc(p.room) + '</td>' +
        '<td><button type="button" class="vq-btn small warn x-del" data-id="' + esc(p.id) + '">×</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="vq-hint">No papers for this class.</td></tr>';
    var dels = document.querySelectorAll('.x-del');
    for (var i = 0; i < dels.length; i++) {
      dels[i].addEventListener('click', function () {
        papers = removePaper(papers, this.getAttribute('data-id')).papers;
        persist(); renderSheet();
      });
    }
  }

  function renderSeatPlan() {
    var rooms = [];
    var rows = document.querySelectorAll('.x-room-row');
    for (var i = 0; i < rows.length; i++) {
      rooms.push({ name: rows[i].querySelector('.x-room-name').value, capacity: rows[i].querySelector('.x-room-cap').value });
    }
    var r = seatPlan($('x-students').value, rooms);
    if (!r.ok) { $('x-seats').innerHTML = '<p class="msg-err">' + esc(r.error) + '</p>'; return; }
    var html = '<table class="vq-table"><thead><tr><th>Hall/Room</th><th>Capacity</th><th>Students seated</th></tr></thead><tbody>' +
      r.allocation.map(function (a) {
        return '<tr><td>' + esc(a.name) + '</td><td class="num">' + a.capacity + '</td><td class="num">' + a.seats + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>Seated: <strong>' + r.seated + '</strong> / ' + $('x-students').value +
      (r.unseated ? ' · <span class="msg-err">Short by ' + r.unseated + ' seats — add another hall.</span>' : ' · <span class="msg-ok">All seated.</span>') + '</p>';
    $('x-seats').innerHTML = html;
  }

  function init() {
    Ads.render($('ad-top'), 'exam-management-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'exam-management-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I build a datesheet?', a: 'Add one paper at a time: class, subject, date, start/end time and hall. The tool blocks two papers for the same class at overlapping times.' },
      { q: 'डेटशीट में एक ही कक्षा के दो पेपर एक साथ आ गए तो?', a: 'टूल ऐसी एंट्री रोक देता है — एक ही कक्षा के दो पेपर एक ही दिन एक ही समय पर नहीं रखे जा सकते।' },
      { q: 'How does hall allocation work?', a: 'Enter total students and each hall/room capacity. Students fill rooms in order; the tool tells you how many are seated and whether you are short of seats.' },
      { q: 'What is in the admit-card list?', a: 'Enter roll numbers and names per class, and the tool generates the admit-card data: roll, name, class and the full paper schedule.' },
      { q: 'Is this an official board datesheet?', a: 'No — it is a planning tool for your institute. Board exams follow the board\'s own datesheet.' }
    ]);
    restore().then(renderSheet);

    $('f-add-paper').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('x-gate'), SLUG, FREE_LIMIT); return; }
      var r = addPaper(papers, {
        cls: $('x-cls').value, subject: $('x-subject').value, date: $('x-date').value,
        start: $('x-start').value, end: $('x-end').value, room: $('x-room').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      papers = r.papers; persist(); renderSheet(); msg('Paper added.', true);
    });
    $('f-view-sheet').addEventListener('click', renderSheet);

    $('f-add-room').addEventListener('click', function () {
      var div = document.createElement('div');
      div.className = 'x-room-row';
      div.innerHTML = '<input class="x-room-name" type="text" maxlength="60" placeholder="Hall name" aria-label="Hall name">' +
        '<input class="x-room-cap" type="number" min="1" placeholder="Capacity" aria-label="Capacity" inputmode="numeric">';
      $('x-rooms').appendChild(div);
    });
    $('f-seat-plan').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('x-gate'), SLUG, FREE_LIMIT); return; }
      renderSeatPlan();
    });

    $('f-admit').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('x-gate'), SLUG, FREE_LIMIT); return; }
      var lines = $('x-rolllist').value.split('\n');
      var students = lines.map(function (ln) {
        var parts = ln.trim().split(/\s+/, 2);
        return { roll: parts[0] || '', name: (parts[1] || '').trim() };
      }).filter(function (s) { return s.roll && s.name; });
      var r = admitCards(papers, students, $('x-admit-cls').value);
      if (!r.ok) { msg(r.error, false); return; }
      $('x-admit').innerHTML = '<h3 class="vq-section-title">Admit-card data (' + r.cards.length + ')</h3>' +
        r.cards.map(function (c) {
          return '<div class="admit"><strong>Roll ' + esc(c.roll) + '</strong> — ' + esc(c.name) + ' (Class ' + esc(c.cls) + ')<ol>' +
            c.papers.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></div>';
        }).join('');
      msg(r.cards.length + ' admit-card rows generated.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
