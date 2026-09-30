/* ============================================================
   VisionQuantech Business Suite — Employee Misuse Risk Tool
   apps/employee-misuse-risk-tool/app.js

   Self-assessment tool: map who has access to cash, bank, stock,
   purchases, payroll and bookkeeping against their role. The tool
   flags segregation-of-duties conflicts (e.g. handles cash AND
   records it) and ranks staff by misuse-risk.

   Tone: this checks role design, not people. A conflict means the
   ROLE needs redesigning, not that the person is dishonest.
   Estimate — confirm with your auditor/HR.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_PEOPLE = 25;
  var MAX_NAME = 80;

  var ACCESS_TYPES = ['cash', 'bank', 'stock', 'purchases', 'payroll', 'bookkeeping'];

  var ACCESS_LABELS = {
    cash: 'Cash handling', bank: 'Bank / payments', stock: 'Stock / store',
    purchases: 'Purchasing', payroll: 'Payroll', bookkeeping: 'Bookkeeping / accounts'
  };

  /* Conflicting access pairs: one person should not hold both. */
  var CONFLICTS = [
    { a: 'cash', b: 'bookkeeping', why: 'Handles cash AND records it — shortages can be hidden.' },
    { a: 'bank', b: 'bookkeeping', why: 'Moves money AND records it — transfers can be hidden.' },
    { a: 'purchases', b: 'stock', why: 'Orders stock AND controls receipts — fake deliveries possible.' },
    { a: 'payroll', b: 'bank', why: 'Runs payroll AND controls bank payments — ghost salaries possible.' },
    { a: 'cash', b: 'bank', why: 'Controls both cash and bank — the two money trails in one hand.' },
    { a: 'purchases', b: 'bookkeeping', why: 'Approves purchases AND records them — inflated bills can pass.' }
  ];

  function accessIds() { return ACCESS_TYPES.slice(); }

  function validatePerson(name, role, accesses) {
    var n = String(name == null ? '' : name).trim();
    if (!n) return { ok: false, error: 'Enter the person\'s name or staff code.' };
    if (n.length > MAX_NAME) return { ok: false, error: 'Name must be under ' + MAX_NAME + ' characters.' };
    var r = String(role == null ? '' : role).trim().slice(0, MAX_NAME);
    if (!Array.isArray(accesses)) return { ok: false, error: 'Internal error: accesses must be an array.' };
    var seen = {}, unknown = [];
    accesses.forEach(function (a) {
      if (seen[a]) return;
      seen[a] = true;
      if (ACCESS_TYPES.indexOf(a) === -1) unknown.push(a);
    });
    if (unknown.length) return { ok: false, error: 'Unknown access type(s): ' + unknown.join(', ') };
    var list = Object.keys(seen);
    if (!list.length) return { ok: false, error: 'Tick at least one access the person actually has.' };
    return { ok: true, name: n, role: r, accesses: list };
  }

  /** SoD conflicts for one person's access set. */
  function violations(accesses) {
    var has = {};
    (accesses || []).forEach(function (a) { has[a] = true; });
    return CONFLICTS.filter(function (c) { return has[c.a] && has[c.b]; });
  }

  function riskLevel(person) {
    var v = violations(person.accesses).length;
    var broad = person.accesses.length >= 4;
    if (v >= 2) return 'High';
    if (v === 1) return 'Medium';
    return broad ? 'Review' : 'Low';
  }

  function addPerson(list, name, role, accesses) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: list is not an array.' };
    if (list.length >= MAX_PEOPLE)
      return { ok: false, error: 'Staff list is full (max ' + MAX_PEOPLE + '). Remove someone or save a snapshot first.' };
    var v = validatePerson(name, role, accesses);
    if (!v.ok) return v;
    var person = {
      id: 'emp-' + (list.length + 1) + '-' + Date.now().toString(36),
      name: v.name, role: v.role, accesses: v.accesses
    };
    person.conflicts = violations(person.accesses);
    person.risk = riskLevel(person);
    return { ok: true, person: person, list: list.concat([person]) };
  }

  function removePerson(list, id) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: list is not an array.' };
    var nl = list.filter(function (p) { return p && p.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Person not found.' };
    return { ok: true, list: nl };
  }

  /** Ranked: High first, then Medium, Review, Low. */
  function rankPeople(list) {
    if (!Array.isArray(list)) return [];
    var rank = { High: 0, Medium: 1, Review: 2, Low: 3 };
    return list.slice().sort(function (a, b) {
      if (rank[a.risk] !== rank[b.risk]) return rank[a.risk] - rank[b.risk];
      if (b.conflicts.length !== a.conflicts.length) return b.conflicts.length - a.conflicts.length;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_PEOPLE: MAX_PEOPLE, ACCESS_TYPES: ACCESS_TYPES, ACCESS_LABELS: ACCESS_LABELS,
    CONFLICTS: CONFLICTS, accessIds: accessIds, validatePerson: validatePerson,
    violations: violations, riskLevel: riskLevel,
    addPerson: addPerson, removePerson: removePerson, rankPeople: rankPeople, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'employee-misuse-risk-tool';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('emr-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var people = [];

  var RISK_CLASS = { High: 'b-crit', Medium: 'b-high', Review: 'b-med', Low: 'b-low' };

  function renderAccessBoxes() {
    var html = '';
    ACCESS_TYPES.forEach(function (a) {
      html += '<label class="acc"><input type="checkbox" id="emr-acc-' + a + '" value="' + a + '"> ' + ACCESS_LABELS[a] + '</label>';
    });
    $('emr-access').innerHTML = html;
  }

  function render() {
    var ranked = rankPeople(people);
    if (!ranked.length) {
      $('emr-list').innerHTML = '<p class="vq-hint">No staff mapped yet — add the first person above.</p>';
      return;
    }
    var html = '';
    ranked.forEach(function (p) {
      html += '<div class="person"><div class="p-head"><strong>' + esc(p.name) + '</strong>' +
        (p.role ? ' <span class="vq-hint">(' + esc(p.role) + ')</span>' : '') +
        ' <span class="chip ' + RISK_CLASS[p.risk] + '">' + p.risk + '</span>' +
        '<button class="vq-btn ghost sm" type="button" data-del="' + esc(p.id) + '" style="float:right">Remove</button></div>' +
        '<div class="vq-hint">Access: ' + p.accesses.map(function (a) { return esc(ACCESS_LABELS[a]); }).join(', ') + '</div>';
      if (p.conflicts.length) {
        html += '<ul class="conf">';
        p.conflicts.forEach(function (c) {
          html += '<li><strong>Conflict:</strong> ' + esc(ACCESS_LABELS[c.a]) + ' + ' + esc(ACCESS_LABELS[c.b]) + ' — ' + esc(c.why) + '</li>';
        });
        html += '</ul>';
      } else if (p.risk === 'Review') {
        html += '<p class="vq-hint">No direct conflict, but 4+ access areas is broad — review whether the role needs all of them.</p>';
      }
      html += '</div>';
    });
    html += '<p class="vq-hint">A conflict means the <strong>role</strong> needs redesigning — split the duties between two people. It is not a judgement on the person.</p>';
    $('emr-list').innerHTML = html;
    $('emr-list').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = removePerson(people, b.getAttribute('data-del'));
        if (r.ok) { people = r.list; render(); }
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'employee-misuse-risk-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'employee-misuse-risk-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is segregation of duties?', a: 'Splitting sensitive tasks so no one person controls a whole money trail — e.g. the person who handles cash must not also record it. This tool maps each person\'s access and flags conflicting pairs.' },
      { q: 'कर्तव्यों का पृथक्करण क्या है?', a: 'संवेदनशील कार्यों को बांटना ताकि कोई एक व्यक्ति पूरे धन-प्रवाह को नियंत्रित न करे — जैसे नकद संभालने वाला व्यक्ति उसे दर्ज न करे।' },
      { q: 'Does a flagged conflict mean the employee is dishonest?', a: 'No. It means the role design is risky. Redesign the role — split the duties — rather than suspecting the person.' },
      { q: 'What is the most dangerous access combination?', a: 'Handling money (cash/bank) while also recording it (bookkeeping), or running payroll while controlling bank payments. Two or more conflicts on one person is High risk.' },
      { q: 'Is this an HR investigation tool?', a: 'No. It is a role-design self-assessment. Confirm changes with your auditor or HR consultant.' }
    ]);

    renderAccessBoxes();
    render();

    $('emr-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('emr-gate'), SLUG, FREE_LIMIT); $('emr-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var acc = [];
      ACCESS_TYPES.forEach(function (a) { if ($('emr-acc-' + a).checked) acc.push(a); });
      var r = addPerson(people, $('emr-name').value, $('emr-role').value, acc);
      if (!r.ok) { msg(r.error, false); return; }
      people = r.list;
      $('emr-name').value = '';
      ACCESS_TYPES.forEach(function (a) { $('emr-acc-' + a).checked = false; });
      msg('Added: ' + r.person.name + ' — ' + r.person.conflicts.length + ' conflict(s), risk ' + r.person.risk + '.', true);
      render();
    });

    $('emr-save').addEventListener('click', async function () {
      if (!people.length) { msg('Nothing to save yet.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('emr-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'snapshot-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), ranked: rankPeople(people)
        });
        msg('Snapshot saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
