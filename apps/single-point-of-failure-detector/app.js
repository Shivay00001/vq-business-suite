/* ============================================================
   VisionQuantech Business Suite — Single Point of Failure
   Detector
   apps/single-point-of-failure-detector/app.js

   Self-assessment tool: list key roles, vendors and systems with a
   dependency rating (1-5) and backup coverage (none/partial/full).
   The tool scores each (dependency x coverage-gap) and ranks the
   single points of failure — the places where one absence or one
   outage stops the business.

   Pure functions first (no DOM) — tested under node.
   Estimate — confirm with your auditor/operations head.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_ENTRIES = 25;
  var MAX_LABEL = 120;
  var KINDS = ['role', 'vendor', 'system'];
  var BACKUPS = ['none', 'partial', 'full'];
  var BACKUP_FACTOR = { none: 3, partial: 2, full: 1 };

  function kindLabel(k) {
    return k === 'role' ? 'Key role' : k === 'vendor' ? 'Vendor' : 'System';
  }

  function validateEntry(label, kind, dependency, backup) {
    var t = String(label == null ? '' : label).trim();
    if (!t) return { ok: false, error: 'Enter a label (e.g. "Tally operator", "Packaging supplier", "Billing server").' };
    if (t.length > MAX_LABEL) return { ok: false, error: 'Label must be under ' + MAX_LABEL + ' characters.' };
    if (KINDS.indexOf(kind) === -1) return { ok: false, error: 'Kind must be one of: role, vendor, system.' };
    var d = Number(dependency);
    if (!isFinite(d) || Math.floor(d) !== d || d < 1 || d > 5)
      return { ok: false, error: 'Dependency must be a whole number 1 (nice-to-have) to 5 (business stops without it).' };
    if (BACKUPS.indexOf(backup) === -1) return { ok: false, error: 'Backup coverage must be one of: none, partial, full.' };
    return { ok: true, label: t, kind: kind, dependency: d, backup: backup };
  }

  /** SPOF score: dependency x coverage-gap factor (none=3, partial=2, full=1). Max 15. */
  function spofScore(entry) {
    return entry.dependency * BACKUP_FACTOR[entry.backup];
  }

  function severity(entry) {
    var s = spofScore(entry);
    if (entry.backup === 'none' && entry.dependency >= 4) return 'Critical';
    if (s >= 10) return 'Critical';
    if (s >= 6) return 'Watch';
    return 'Covered';
  }

  function addEntry(list, label, kind, dependency, backup) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: list is not an array.' };
    if (list.length >= MAX_ENTRIES)
      return { ok: false, error: 'List is full (max ' + MAX_ENTRIES + '). Remove an entry or save a snapshot first.' };
    var v = validateEntry(label, kind, dependency, backup);
    if (!v.ok) return v;
    var entry = {
      id: 'spof-' + (list.length + 1) + '-' + Date.now().toString(36),
      label: v.label, kind: v.kind, dependency: v.dependency, backup: v.backup,
      score: 0, severity: ''
    };
    entry.score = spofScore(entry);
    entry.severity = severity(entry);
    return { ok: true, entry: entry, list: list.concat([entry]) };
  }

  function removeEntry(list, id) {
    if (!Array.isArray(list)) return { ok: false, error: 'Internal error: list is not an array.' };
    var nl = list.filter(function (e) { return e && e.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Entry not found.' };
    return { ok: true, list: nl };
  }

  /** Ranked worst-first; Critical SPOFs float above equal scores. */
  function rankSPOFs(list) {
    if (!Array.isArray(list)) return [];
    var rank = { Critical: 0, Watch: 1, Covered: 2 };
    return list.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
      return String(a.label).localeCompare(String(b.label));
    });
  }

  function stats(list) {
    var s = { total: 0, Critical: 0, Watch: 0, Covered: 0 };
    (Array.isArray(list) ? list : []).forEach(function (e) {
      s.total++;
      if (s[e.severity] != null) s[e.severity]++;
    });
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_ENTRIES: MAX_ENTRIES, KINDS: KINDS, BACKUPS: BACKUPS,
    kindLabel: kindLabel, validateEntry: validateEntry,
    spofScore: spofScore, severity: severity,
    addEntry: addEntry, removeEntry: removeEntry,
    rankSPOFs: rankSPOFs, stats: stats, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'single-point-of-failure-detector';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('spof-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var entries = [];

  var SEV_CLASS = { Critical: 'b-crit', Watch: 'b-high', Covered: 'b-low' };

  function render() {
    var ranked = rankSPOFs(entries);
    var st = stats(entries);
    $('spof-stats').innerHTML =
      '<p class="vq-hint">Tracked: <strong>' + st.total + '</strong> · ' +
      '<span class="chip b-crit">Critical SPOFs ' + st.Critical + '</span> ' +
      '<span class="chip b-high">Watch ' + st.Watch + '</span> ' +
      '<span class="chip b-low">Covered ' + st.Covered + '</span></p>';
    if (!ranked.length) {
      $('spof-list').innerHTML = '<p class="vq-hint">Nothing tracked yet — add a key role, vendor or system above.</p>';
      return;
    }
    var html = '<table class="spof"><thead><tr><th>Dependency</th><th>Backup</th><th>Score</th><th></th></tr></thead><tbody>';
    ranked.forEach(function (e) {
      html += '<tr><td><strong>' + esc(e.label) + '</strong><br><span class="vq-hint">' + kindLabel(e.kind) +
        ' · depends ' + e.dependency + '/5 · backup: ' + e.backup + '</span></td>' +
        '<td class="num">' + e.backup + '</td>' +
        '<td><span class="chip ' + SEV_CLASS[e.severity] + '">' + e.severity + ' · ' + e.score + '</span></td>' +
        '<td><button class="vq-btn ghost sm" type="button" data-del="' + esc(e.id) + '">Remove</button></td></tr>';
    });
    html += '</tbody></table><p class="vq-hint">Score = dependency (1–5) × coverage gap (none=3, partial=2, full=1). Anything "Critical" needs a backup person, vendor or system — soon.</p>';
    $('spof-list').innerHTML = html;
    $('spof-list').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = removeEntry(entries, b.getAttribute('data-del'));
        if (r.ok) { entries = r.list; render(); }
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'single-point-of-failure-detector-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'single-point-of-failure-detector-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is a single point of failure in a business?', a: 'Any role, vendor or system whose absence stops the business: the one Tally operator, the single raw-material supplier, the billing server with no backup. This tool ranks them by dependency × coverage gap.' },
      { q: 'सिंगल पॉइंट ऑफ फेलियर क्या है?', a: 'कोई भी भूमिका, विक्रेता या सिस्टम जिसके बिना व्यवसाय रुक जाए — एकमात्र लेखाकार, एकमात्र कच्चा माल आपूर्तिकर्ता। यह टूल उन्हें निर्भरता × कवरेज अंतर से रैंक करता है।' },
      { q: 'How is the SPOF score calculated?', a: 'Score = dependency (1–5) × coverage gap (no backup=3, partial=2, full=1). Max 15. Dependency 4–5 with no backup is automatically Critical.' },
      { q: 'What should I do about a Critical SPOF?', a: 'Create redundancy: cross-train a backup person, qualify an alternate vendor, or add a failover/backup for the system. Start with the top-ranked one.' },
      { q: 'Is this an operations audit?', a: 'No — it is a self-assessment estimate. Confirm your redundancy plans with your operations head or auditor.' }
    ]);

    $('spof-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('spof-gate'), SLUG, FREE_LIMIT); $('spof-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addEntry(entries, $('spof-label').value, $('spof-kind').value, $('spof-dep').value, $('spof-backup').value);
      if (!r.ok) { msg(r.error, false); return; }
      entries = r.list;
      $('spof-label').value = '';
      msg('Added: "' + r.entry.label + '" — SPOF score ' + r.entry.score + ' (' + r.entry.severity + ').', true);
      render();
    });

    $('spof-save').addEventListener('click', async function () {
      if (!entries.length) { msg('Nothing to save yet — add at least one entry.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('spof-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'snapshot-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), stats: stats(entries), ranked: rankSPOFs(entries)
        });
        msg('Snapshot saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
