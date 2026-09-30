/* ============================================================
   VisionQuantech Business Suite — Data Loss Probability
   Analyzer
   apps/data-loss-probability-analyzer/app.js

   Self-assessment tool: answer 5 questions about backups
   (frequency, locations, encryption, tested restores, device age)
   -> data-loss risk score 0-100, an RPO estimate (how much data is
   at risk), and prioritised recommendations.

   Pure functions first (no DOM) — tested under node.
   Estimate — confirm with your IT support/auditor.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var FREQS = ['none', 'monthly', 'weekly', 'daily'];
  var FREQ_POINTS = { none: 40, monthly: 25, weekly: 12, daily: 4 };
  var FREQ_LABELS = { none: 'No regular backups', monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily (or more often)' };

  var LOCATIONS = ['none', 'local-only', 'one-offsite', 'multi-offsite'];
  var LOCATION_POINTS = { none: 25, 'local-only': 15, 'one-offsite': 6, 'multi-offsite': 2 };
  var LOCATION_LABELS = { none: 'No backups kept', 'local-only': 'Only on the same device/premises', 'one-offsite': 'One offsite / cloud copy', 'multi-offsite': 'Multiple offsite copies' };

  var RPO_TEXT = {
    none: 'No recoverable point — an incident may mean total, permanent data loss.',
    monthly: 'Up to ~30 days of work at risk between backups.',
    weekly: 'Up to ~7 days of work at risk between backups.',
    daily: 'Up to ~24 hours of work at risk between backups.'
  };

  var YESNO = ['yes', 'no'];

  function validateInputs(freq, locations, encrypted, restoreTested, oldDevices) {
    if (FREQS.indexOf(freq) === -1) return { ok: false, error: 'Choose a backup frequency.' };
    if (LOCATIONS.indexOf(locations) === -1) return { ok: false, error: 'Choose where backups are kept.' };
    if (YESNO.indexOf(encrypted) === -1) return { ok: false, error: 'Answer whether backups are encrypted.' };
    if (YESNO.indexOf(restoreTested) === -1) return { ok: false, error: 'Answer whether a restore was tested.' };
    if (YESNO.indexOf(oldDevices) === -1) return { ok: false, error: 'Answer whether key devices are 5+ years old.' };
    return { ok: true };
  }

  /**
   * Analyze backup posture.
   * opts: {freq, locations, encrypted:'yes'|'no', restoreTested:'yes'|'no', oldDevices:'yes'|'no'}
   * Returns {ok, score 0-100, band, rpo, recommendations[]}.
   */
  function analyze(opts) {
    if (!opts || typeof opts !== 'object') return { ok: false, error: 'Internal error: options required.' };
    var v = validateInputs(opts.freq, opts.locations, opts.encrypted, opts.restoreTested, opts.oldDevices);
    if (!v.ok) return v;

    var score = FREQ_POINTS[opts.freq] + LOCATION_POINTS[opts.locations];
    var recs = [];

    if (opts.freq === 'none' || opts.locations === 'none') {
      recs.push({ priority: 1, text: 'Start backups immediately: daily automatic backup to at least one offsite/cloud location.' });
    } else {
      if (opts.freq !== 'daily') recs.push({ priority: 2, text: 'Move to daily automatic backups — ' + RPO_TEXT[opts.freq].toLowerCase() });
      if (opts.locations === 'local-only') recs.push({ priority: 1, text: 'Add an offsite/cloud copy — fire or theft on the premises wipes local backups too.' });
      if (opts.locations === 'one-offsite') recs.push({ priority: 3, text: 'Consider a second offsite copy for critical data (3-2-1 rule: 3 copies, 2 media, 1 offsite).' });
    }
    if (opts.encrypted === 'no') {
      score += 10;
      recs.push({ priority: 2, text: 'Encrypt backups — an unencrypted backup drive is a data breach waiting to happen.' });
    }
    if (opts.restoreTested === 'no') {
      score += 12;
      recs.push({ priority: 1, text: 'Test a restore this week — an untested backup is only a hope, not a recovery plan.' });
    }
    if (opts.oldDevices === 'yes') {
      score += 8;
      recs.push({ priority: 3, text: 'Plan replacement for 5+ year-old devices — drive failure risk rises sharply with age.' });
    }
    if (score > 100) score = 100;

    var band = score < 30 ? 'Low' : score < 60 ? 'Moderate' : 'High';
    recs.sort(function (a, b) { return a.priority - b.priority; });
    if (!recs.length) recs.push({ priority: 1, text: 'Posture looks solid — keep testing restores every 6 months.' });

    return {
      ok: true, score: score, band: band,
      rpo: RPO_TEXT[opts.freq],
      rpoNote: opts.locations === 'local-only'
        ? 'Note: with local-only backups, a premises-level incident (fire/theft) can still mean total loss.'
        : '',
      inputs: {
        freq: FREQ_LABELS[opts.freq], locations: LOCATION_LABELS[opts.locations],
        encrypted: opts.encrypted, restoreTested: opts.restoreTested, oldDevices: opts.oldDevices
      },
      recommendations: recs
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    FREQS: FREQS, LOCATIONS: LOCATIONS, FREQ_LABELS: FREQ_LABELS,
    LOCATION_LABELS: LOCATION_LABELS, analyze: analyze, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'data-loss-probability-analyzer';
  var FREE_LIMIT = 20;
  var SAVE_CAP = 25;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('dla-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function bandClass(b) { return b === 'High' ? 'b-high' : b === 'Moderate' ? 'b-med' : 'b-low'; }

  function opt(id) { var e = $(id); return e ? e.value : ''; }

  function renderResult(r) {
    var html = '<p>Data-loss risk: <span class="big">' + r.score + '/100</span> ' +
      '<span class="chip ' + bandClass(r.band) + '">' + r.band + ' risk</span></p>' +
      '<p><strong>RPO estimate:</strong> ' + esc(r.rpo) + '</p>' +
      (r.rpoNote ? '<p class="msg-err">' + esc(r.rpoNote) + '</p>' : '') +
      '<p class="vq-hint">Setup: ' + esc(r.inputs.freq) + ' · ' + esc(r.inputs.locations) +
      ' · encrypted: ' + r.inputs.encrypted + ' · restore tested: ' + r.inputs.restoreTested +
      ' · old devices: ' + r.inputs.oldDevices + '</p>' +
      '<h3 class="vq-section-title">Recommendations — do these first</h3><ol class="recs">';
    r.recommendations.forEach(function (c) {
      html += '<li>' + esc(c.text) + '</li>';
    });
    html += '</ol><p class="vq-hint">Estimate from your answers — confirm with your IT support or auditor.</p>';
    $('dla-result').innerHTML = html;
    $('dla-result-card').hidden = false;
    $('dla-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'data-loss-probability-analyzer-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'data-loss-probability-analyzer-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is data-loss probability analysis?', a: 'A self-assessment of how likely you are to lose business data permanently, based on backup frequency, backup locations, encryption, tested restores and device age. It returns a 0–100 risk score and an RPO estimate.' },
      { q: 'डेटा हानि संभावना विश्लेषण क्या है?', a: 'बैकअप आवृत्ति, स्थान, एन्क्रिप्शन, पुनर्स्थापना परीक्षण और डिवाइस आयु के आधार पर डेटा स्थायी रूप से खोने की संभावना का आत्म-मूल्यांकन।' },
      { q: 'What is RPO?', a: 'Recovery Point Objective — the maximum data you can afford to lose, measured in time. Daily backups mean an RPO of ~24 hours: at worst you redo one day of work.' },
      { q: 'What is the 3-2-1 backup rule?', a: 'Keep 3 copies of important data, on 2 different media, with 1 copy offsite (or in the cloud). It protects against device failure, ransomware and premises-level incidents at once.' },
      { q: 'Is this an IT security audit?', a: 'No — it is a self-assessment estimate from your answers. Confirm your backup strategy with your IT support or auditor.' }
    ]);

    $('dla-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('dla-gate'), SLUG, FREE_LIMIT); $('dla-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = analyze({
        freq: opt('dla-freq'), locations: opt('dla-loc'), encrypted: opt('dla-enc'),
        restoreTested: opt('dla-restore'), oldDevices: opt('dla-old')
      });
      if (!r.ok) { msg(r.error, false); return; }
      msg('', null);
      renderResult(r);
      window._dlaLast = r;
    });

    $('dla-save').addEventListener('click', async function () {
      var r = window._dlaLast;
      if (!r) { msg('Run the analysis first.', false); return; }
      try {
        var list = await Vault.list(SLUG);
        if (list.length >= SAVE_CAP) { Freemium.renderUpsell($('dla-upsell'), SLUG, SAVE_CAP); return; }
        await Vault.save(SLUG, 'analysis-' + Date.now().toString(36), {
          savedAt: new Date().toISOString(), score: r.score, band: r.band,
          rpo: r.rpo, inputs: r.inputs, recommendations: r.recommendations
        });
        msg('Analysis saved on this device (' + (list.length + 1) + '/' + SAVE_CAP + ').', true);
      } catch (e) { msg('Could not save: ' + e.message, false); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
