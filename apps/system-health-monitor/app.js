/* ============================================================
   VisionQuantech Business Suite — System Health Monitor
   apps/system-health-monitor/app.js

   Checklist-based IT health score for a small business:
   backups, updates, antivirus, disk space, passwords, 2FA.
   Produces a 0–100 score, a grade, and a prioritized action list.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var CHECKS = [
    { id: 'backup-exists', label: 'A full backup of business data was taken in the last 7 days', weight: 20, severity: 'critical', action: 'Take a full backup of business data today — tally, invoices, documents.' },
    { id: 'backup-offsite', label: 'At least one backup copy is stored off-site / in the cloud', weight: 10, severity: 'high', action: 'Copy the latest backup to an off-site location or cloud drive (3-2-1 rule).' },
    { id: 'backup-restore', label: 'A backup restore was successfully tested in the last 90 days', weight: 10, severity: 'high', action: 'Restore one file from backup to prove the backup actually works.' },
    { id: 'os-updated', label: 'Operating systems on office PCs are up to date', weight: 10, severity: 'high', action: 'Run OS updates on all office computers this week.' },
    { id: 'antivirus', label: 'Antivirus / endpoint protection is installed and active on all PCs', weight: 10, severity: 'high', action: 'Install or renew antivirus on every office PC and run a full scan.' },
    { id: 'disk-space', label: 'No office PC has less than 15% free disk space', weight: 8, severity: 'medium', action: 'Free disk space on crowded PCs — archive old files to external storage.' },
    { id: 'passwords', label: 'Important accounts use unique passwords of 12+ characters', weight: 8, severity: 'medium', action: 'Change reused/short passwords; use a password manager for shared accounts.' },
    { id: '2fa', label: 'Two-factor authentication is on for email, banking and GST portal logins', weight: 8, severity: 'medium', action: 'Enable 2FA on email, net-banking, GST and income-tax portal accounts.' },
    { id: 'wifi', label: 'Office Wi-Fi uses WPA2/WPA3 with a non-default admin password', weight: 6, severity: 'medium', action: 'Change the router admin password and set WPA2/WPA3 on office Wi-Fi.' },
    { id: 'staff-exits', label: 'Ex-employees\u2019 logins and shared passwords were revoked on exit', weight: 10, severity: 'high', action: 'Audit and revoke logins of staff who left; rotate shared passwords.' }
  ];

  var SEV_ORDER = { critical: 0, high: 1, medium: 2 };

  /** answers: {checkId: true/false}. Returns {score, grade, passed[], failed[]}. */
  function scoreChecklist(answers) {
    answers = answers || {};
    var score = 0, passed = [], failed = [];
    CHECKS.forEach(function (c) {
      if (answers[c.id]) { score += c.weight; passed.push(c.id); }
      else failed.push(c.id);
    });
    score = Math.max(0, Math.min(100, score));
    var grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    return { ok: true, score: score, grade: grade, passed: passed, failed: failed };
  }

  /** Prioritized action list for failed check ids. */
  function actionList(failedIds) {
    failedIds = failedIds || [];
    var out = [];
    CHECKS.forEach(function (c) {
      if (failedIds.indexOf(c.id) >= 0) out.push({ id: c.id, label: c.label, severity: c.severity, action: c.action, weight: c.weight });
    });
    out.sort(function (a, b) { return SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.weight - a.weight; });
    return out;
  }

  function checkById(id) {
    for (var i = 0; i < CHECKS.length; i++) if (CHECKS[i].id === id) return CHECKS[i];
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { CHECKS: CHECKS, scoreChecklist: scoreChecklist, actionList: actionList, checkById: checkById, esc: esc };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'system-health-monitor';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }

  function init() {
    Ads.render($('ad-top'), 'system-health-monitor-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'system-health-monitor-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What does the IT health score measure?', a: 'Ten weighted checks — backups (exist, off-site, restore-tested), OS updates, antivirus, disk space, passwords, 2FA, Wi-Fi security and exit revocation \u2014 scored 0\u2013100 with an A\u2013F grade.' },
      { q: 'सिस्टम हेल्थ स्कोर क्या है?', a: '10 जांचों पर आधारित 0–100 स्कोर — बैकअप, अपडेट, एंटीवायरस, डिस्क स्पेस, पासवर्ड, 2FA। फेल जांचों के लिए प्राथमिकता वाली एक्शन लिस्ट मिलती है।' },
      { q: 'What should I fix first?', a: 'The action list is sorted by severity: critical items (like missing backups) first, then high, then medium.' },
      { q: 'Is this a security audit?', a: 'No \u2014 it is a self-assessment checklist for small businesses, not a professional security audit.' }
    ]);

    var box = $('h-checks');
    box.innerHTML = CHECKS.map(function (c) {
      return '<div class="check-row"><input type="checkbox" id="h-' + c.id + '">' +
        '<label for="h-' + c.id + '" style="margin:0">' + esc(c.label) +
        ' <span class="vq-hint">(' + c.weight + ' pts)</span></label></div>';
    }).join('');

    $('h-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('h-gate'), SLUG, FREE_LIMIT); $('h-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var answers = {};
      CHECKS.forEach(function (c) { answers[c.id] = $('h-' + c.id).checked; });
      var r = scoreChecklist(answers);
      var actions = actionList(r.failed);
      var html = '<p>IT health score: <span class="big">' + r.score + '/100</span> <span class="grade">Grade ' + r.grade + '</span></p>' +
        '<p class="vq-hint">' + r.passed.length + ' of ' + CHECKS.length + ' checks passing.</p>';
      if (actions.length) {
        html += '<h3 class="vq-section-sub">Fix these first (' + actions.length + ')</h3><ol class="actions">';
        actions.forEach(function (a) {
          html += '<li><span class="badge b-' + a.severity + '">' + a.severity + '</span> ' + esc(a.action) + '</li>';
        });
        html += '</ol>';
      } else {
        html += '<p class="msg-ok">All checks passing — well maintained. Re-run this monthly.</p>';
      }
      $('h-result').innerHTML = html;
      $('h-result-card').hidden = false;
      $('h-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
