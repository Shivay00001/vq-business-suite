/* ============================================================
   VisionQuantech Business Suite — Software Upgrade Safety Checker
   apps/software-upgrade-safety-checker/app.js

   Pre-upgrade readiness checklist → risk score, plus a
   fill-in rollback plan template (copyable text) for when an
   upgrade goes wrong. On-device.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var CHECKS = [
    { id: 'backup', label: 'Full backup taken and verified just before the upgrade', weight: 25, risk: 'Upgrading without a fresh, verified backup.' },
    { id: 'changelog', label: 'Changelog / release notes read; breaking changes noted', weight: 12, risk: 'Breaking changes you did not expect.' },
    { id: 'compat', label: 'Hardware, OS and driver compatibility confirmed', weight: 12, risk: 'New version may not run on old hardware/OS.' },
    { id: 'deps', label: 'Dependent software/plugins confirmed compatible', weight: 10, risk: 'Plugins or integrations breaking after upgrade.' },
    { id: 'test-env', label: 'Upgrade tested on a non-production machine first', weight: 12, risk: 'First run on the live machine is a gamble.' },
    { id: 'downtime', label: 'Downtime window scheduled and staff informed', weight: 8, risk: 'Business interrupted mid-day without warning.' },
    { id: 'license', label: 'License key / activation for the new version is in hand', weight: 8, risk: 'Upgrade completes but software will not activate.' },
    { id: 'rollback-media', label: 'Installer of the OLD version + license is saved and reachable', weight: 13, risk: 'No way back if the new version fails.' }
  ];

  /** answers: {checkId: bool}. Returns {score (risk 0-100), level, failed[]}. */
  function riskScore(answers) {
    answers = answers || {};
    var risk = 0, failed = [];
    CHECKS.forEach(function (c) {
      if (!answers[c.id]) { risk += c.weight; failed.push(c.id); }
    });
    risk = Math.max(0, Math.min(100, risk));
    var level = risk >= 60 ? 'critical' : risk >= 35 ? 'high' : risk >= 15 ? 'medium' : 'low';
    return { ok: true, score: risk, level: level, failed: failed };
  }

  function checkById(id) {
    for (var i = 0; i < CHECKS.length; i++) if (CHECKS[i].id === id) return CHECKS[i];
    return null;
  }

  /** risks: array of check ids that failed → prioritized risk lines. */
  function riskLines(failedIds) {
    failedIds = failedIds || [];
    var out = [];
    CHECKS.forEach(function (c) {
      if (failedIds.indexOf(c.id) >= 0) out.push({ id: c.id, risk: c.risk, weight: c.weight });
    });
    out.sort(function (a, b) { return b.weight - a.weight; });
    return out;
  }

  function reqStr(v, label, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: label + ' is required.' };
    if (s.length > (max || 80)) return { ok: false, error: label + ' is too long.' };
    return { ok: true, value: s };
  }

  /** Build the rollback plan text from inputs. */
  function rollbackPlan(inp) {
    inp = inp || {};
    var f = [
      reqStr(inp.system, 'System/software name'),
      reqStr(inp.fromVer, 'Current version', 40),
      reqStr(inp.toVer, 'Target version', 40),
      reqStr(inp.owner, 'Owner on duty', 60)
    ];
    for (var i = 0; i < f.length; i++) if (!f[i].ok) return f[i];
    var backup = String(inp.backupLoc == null ? '' : inp.backupLoc).trim().slice(0, 120) || '(fill in: backup location)';
    var installer = String(inp.installer == null ? '' : inp.installer).trim().slice(0, 120) || '(fill in: old installer location)';
    var window = String(inp.window == null ? '' : inp.window).trim().slice(0, 120) || '(fill in: rollback window)';
    var L = [];
    L.push('ROLLBACK PLAN — ' + f[0].value);
    L.push('Upgrade: ' + f[1].value + ' -> ' + f[2].value + ' | Owner on duty: ' + f[3].value);
    L.push('Rollback window: ' + window);
    L.push('');
    L.push('TRIGGER — roll back if ANY of these happen:');
    L.push('1. Software fails to start or activate after upgrade.');
    L.push('2. Core business function broken (billing, printing, data entry).');
    L.push('3. Data corruption or missing records detected.');
    L.push('4. Vendor support cannot resolve the issue within the rollback window.');
    L.push('');
    L.push('STEPS');
    L.push('1. Stop the software on all machines; disconnect shared data if networked.');
    L.push('2. Rename the upgraded install folder to <name>.upgraded-backup (do NOT delete).');
    L.push('3. Reinstall the old version from: ' + installer);
    L.push('4. Restore data from backup at: ' + backup);
    L.push('5. Re-activate the old license; verify 3 critical business functions end-to-end.');
    L.push('6. Inform staff the rollback is complete; note the failure for the vendor.');
    L.push('');
    L.push('SIGN-OFF — rollback completed at ____:____ by ____________.');
    return { ok: true, plan: L.join('\n') };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = { CHECKS: CHECKS, riskScore: riskScore, checkById: checkById, riskLines: riskLines, rollbackPlan: rollbackPlan, esc: esc };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'software-upgrade-safety-checker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }

  function init() {
    Ads.render($('ad-top'), 'software-upgrade-safety-checker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'software-upgrade-safety-checker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What makes a software upgrade risky?', a: 'Upgrading without a fresh verified backup, unread release notes, untested compatibility, and no saved copy of the old installer. This checklist scores those risks and builds a rollback plan.' },
      { q: 'सॉफ्टवेयर अपग्रेड से पहले क्या जांचें?', a: 'ताज़ा बैकअप, रिलीज़ नोट्स, हार्डवेयर/OS अनुकूलता, पुराने वर्ज़न का इंस्टॉलर और रोलबैक योजना — यही चेकलिस्ट जांचती है।' },
      { q: 'What is a rollback plan?', a: 'A written, step-by-step plan to restore the old version and its data if the upgrade fails — trigger conditions, reinstall steps, restore location and sign-off.' },
      { q: 'Should I upgrade on the live machine first?', a: 'No. Test on a non-production machine first; only upgrade the live machine in a scheduled downtime window with a verified backup in hand.' }
    ]);

    $('r-checks').innerHTML = CHECKS.map(function (c) {
      return '<div class="check-row"><input type="checkbox" id="r-' + c.id + '">' +
        '<label for="r-' + c.id + '" style="margin:0">' + esc(c.label) +
        ' <span class="vq-hint">(' + c.weight + ' risk pts if skipped)</span></label></div>';
    }).join('');

    $('r-risk').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); $('r-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var answers = {};
      CHECKS.forEach(function (c) { answers[c.id] = $('r-' + c.id).checked; });
      var r = riskScore(answers);
      var lines = riskLines(r.failed);
      var html = '<p>Upgrade risk: <span class="big">' + r.score + '/100</span> <span class="badge b-' + r.level + '">' + r.level + '</span></p>';
      if (lines.length) {
        html += '<h3 class="vq-section-sub">Risks you are carrying (' + lines.length + ')</h3><ul class="risks">';
        lines.forEach(function (l) { html += '<li>' + esc(l.risk) + ' <span class="vq-hint">(' + l.weight + ' pts)</span></li>'; });
        html += '</ul><p class="vq-hint">Do not upgrade at critical/high risk — fix the red items first.</p>';
      } else {
        html += '<p class="msg-ok">All safeguards in place. Proceed in your scheduled downtime window.</p>';
      }
      $('r-result').innerHTML = html;
      $('r-result-card').hidden = false;
      $('r-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('r-plan').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); $('r-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var p = rollbackPlan({
        system: $('r-sys').value, fromVer: $('r-from').value, toVer: $('r-to').value,
        owner: $('r-owner').value, backupLoc: $('r-backup').value,
        installer: $('r-installer').value, window: $('r-window').value
      });
      var ta = $('r-plan-out');
      if (!p.ok) { ta.value = ''; $('r-plan-msg').textContent = p.error; $('r-plan-msg').className = 'vq-hint msg-err'; return; }
      ta.value = p.plan;
      $('r-plan-msg').textContent = 'Rollback plan generated — copy it, print it, keep it next to the machine during the upgrade.';
      $('r-plan-msg').className = 'vq-hint msg-ok';
      $('r-plan-card').hidden = false;
    });

    $('r-copy').addEventListener('click', function () {
      var ta = $('r-plan-out');
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value);
      $('r-plan-msg').textContent = 'Plan copied to clipboard.';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
