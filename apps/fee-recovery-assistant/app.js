/* ============================================================
   VisionQuantech Business Suite — Fee Recovery Assistant
   apps/fee-recovery-assistant/app.js

   Pure functions first (no DOM) — tested under node.
   Aging buckets (current / 30 / 60 / 90+ days), recovery priority
   score (0–100 from days overdue + amount weight), and follow-up
   script generator (Hindi + English, per aging stage).
   Drafts text only — never sends messages.
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEXT = 120;

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
  function round2(n) { return Math.round(n * 100) / 100; }

  /** Days between dueDate and asOf; negative/future => 0 overdue days. */
  function daysOverdue(dueDate, asOf) {
    var a = new Date(String(dueDate || '') + 'T00:00:00');
    var b = new Date(String(asOf || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.max(0, Math.floor((b - a) / 86400000));
  }

  /** Bucket: 'current' | 'b30' (1–30) | 'b60' (31–60) | 'b90' (61–90) | 'b90p' (90+). */
  function agingBucket(dueDate, asOf) {
    var d = daysOverdue(dueDate, asOf);
    if (d <= 0) return { bucket: 'current', days: d, label: 'Not yet due' };
    if (d <= 30) return { bucket: 'b30', days: d, label: '1–30 days overdue' };
    if (d <= 60) return { bucket: 'b60', days: d, label: '31–60 days overdue' };
    if (d <= 90) return { bucket: 'b90', days: d, label: '61–90 days overdue' };
    return { bucket: 'b90p', days: d, label: '90+ days overdue' };
  }

  /**
   * Priority score 0–100: 60% weight on days overdue (capped at 120 days),
   * 40% weight on amount (log-scaled, ₹500 → ~40 pts, ₹50000 → ~100 pts).
   */
  function priorityScore(dueAmount, daysOd) {
    var amt = Number(dueAmount);
    if (!isFinite(amt) || amt <= 0) return { ok: false, error: 'Due amount must be greater than zero.' };
    var days = Math.max(0, Number(daysOd) || 0);
    var dayPts = Math.min(60, days / 120 * 60);
    var amtPts = Math.min(40, Math.max(0, (Math.log10(amt) - Math.log10(500)) / (Math.log10(50000) - Math.log10(500)) * 40));
    var score = Math.round(dayPts + amtPts);
    var band = score >= 70 ? 'critical' : score >= 40 ? 'high' : 'normal';
    return { ok: true, score: score, band: band };
  }

  var SCRIPTS = {
    b30: {
      en: 'Polite reminder: fee of {amount} for {student} (Class {cls}) is {days} days overdue. Please pay by {date} to avoid late reminders. — {institute}',
      hi: 'विनम्र अनुस्मारक: {student} (कक्षा {cls}) की फीस {amount} {days} दिन से बकाया है। कृपया {date} तक भुगतान करें। — {institute}'
    },
    b60: {
      en: 'Second reminder: fee of {amount} for {student} (Class {cls}) is now {days} days overdue. Kindly clear it this week, or visit the office to discuss a payment plan. — {institute}',
      hi: 'दूसरा अनुस्मारक: {student} (कक्षा {cls}) की फीस {amount} अब {days} दिन से बकाया है। कृपया इस सप्ताह भुगतान करें या कार्यालय में किस्त योजना पर चर्चा करें। — {institute}'
    },
    b90: {
      en: 'Urgent: fee of {amount} for {student} (Class {cls}) is {days} days overdue. Continued non-payment may affect class/test access per institute policy. Please contact the office immediately. — {institute}',
      hi: 'अत्यावश्यक: {student} (कक्षा {cls}) की फीस {amount} {days} दिन से बकाया है। भुगतान न होने पर संस्थान की नीति के अनुसार कक्षा/परीक्षा में बाधा आ सकती है। कृपया तुरंत कार्यालय से संपर्क करें। — {institute}'
    },
    b90p: {
      en: 'Final notice: fee of {amount} for {student} (Class {cls}) is {days} days overdue. Settle by {date} to avoid escalation per institute policy. — {institute}',
      hi: 'अंतिम सूचना: {student} (कक्षा {cls}) की फीस {amount} {days} दिन से बकाया है। संस्थान की नीति के अनुसार आगे की कार्रवाई से बचने हेतु {date} तक भुगतान करें। — {institute}'
    }
  };

  /** Follow-up script for a dues entry {student, cls, due, dueDate, institute, lang}. */
  function followUpScript(entry, lang) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'Invalid entry.' };
    var name = String(entry.student || '').trim().slice(0, MAX_TEXT);
    if (!name) return { ok: false, error: 'Student name is required.' };
    var due = Number(entry.due);
    if (!isFinite(due) || due <= 0) return { ok: false, error: 'Due amount must be greater than zero.' };
    var b = agingBucket(entry.dueDate, entry.asOf);
    if (b.bucket === 'current') return { ok: false, error: 'Not overdue yet — no recovery script needed.' };
    var tpl = SCRIPTS[b.bucket][lang === 'hi' ? 'hi' : 'en'];
    var text = tpl
      .replace(/\{student\}/g, name)
      .replace(/\{cls\}/g, String(entry.cls || '').trim().slice(0, MAX_TEXT) || '-')
      .replace(/\{amount\}/g, fmtINR(due))
      .replace(/\{days\}/g, String(b.days))
      .replace(/\{date\}/g, String(entry.payBy || '').slice(0, 10) || '-')
      .replace(/\{institute\}/g, String(entry.institute || 'Institute').trim().slice(0, MAX_TEXT) || 'Institute');
    return { ok: true, text: text, bucket: b.bucket, label: b.label, days: b.days };
  }

  /** Summarize a dues list into aging buckets with totals. */
  function agingReport(list, asOf) {
    if (!Array.isArray(list)) return { ok: false, error: 'Invalid list.' };
    var buckets = { current: 0, b30: 0, b60: 0, b90: 0, b90p: 0 };
    var counts = { current: 0, b30: 0, b60: 0, b90: 0, b90p: 0 };
    list.forEach(function (e) {
      var due = Number(e.due);
      if (!isFinite(due) || due <= 0) return;
      var b = agingBucket(e.dueDate, asOf).bucket;
      buckets[b] = round2(buckets[b] + due);
      counts[b]++;
    });
    var total = round2(buckets.b30 + buckets.b60 + buckets.b90 + buckets.b90p);
    return { ok: true, buckets: buckets, counts: counts, totalOverdue: total };
  }

  var API = {
    esc: esc, fmtINR: fmtINR, round2: round2, SCRIPTS: SCRIPTS,
    daysOverdue: daysOverdue, agingBucket: agingBucket,
    priorityScore: priorityScore, followUpScript: followUpScript, agingReport: agingReport
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'fee-recovery-assistant', FREE_LIMIT = 20;
  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('v-msg'); el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  var dues = [];

  function bandPill(band) {
    var cls = band === 'critical' ? 'pill bad' : band === 'high' ? 'pill warn' : 'pill ok';
    return '<span class="' + cls + '">' + band + '</span>';
  }

  function render() {
    var today = new Date().toISOString().slice(0, 10);
    var lang = $('v-lang').value, inst = $('v-inst').value;
    var rows = dues.map(function (e, i) {
      var b = agingBucket(e.dueDate, today);
      var ps = priorityScore(e.due, b.days);
      var script = followUpScript(Object.assign({ institute: inst, lang: lang }, e), lang);
      return '<div class="rec-card">' +
        '<p><strong>' + esc(e.student) + '</strong> (' + esc(e.cls || '-') + ') — due ' + fmtINR(e.due) +
        ', ' + esc(b.label) + ' ' + (ps.ok ? bandPill(ps.band) + ' <span class="vq-hint">score ' + ps.score + '/100</span>' : '') +
        ' <button type="button" class="vq-btn small warn v-del" data-i="' + i + '">×</button></p>' +
        (script.ok ? '<pre class="r-text">' + esc(script.text) + '</pre>' : '<p class="vq-hint">' + esc(script.error) + '</p>') +
        '</div>';
    }).join('');
    $('v-list').innerHTML = rows || '<p class="vq-hint">Add overdue dues to see aging, priority scores and scripts.</p>';
    var rep = agingReport(dues, today);
    $('v-aging').innerHTML =
      '<div class="stat"><span>1–30 days</span><strong>' + fmtINR(rep.buckets.b30) + ' (' + rep.counts.b30 + ')</strong></div>' +
      '<div class="stat"><span>31–60 days</span><strong>' + fmtINR(rep.buckets.b60) + ' (' + rep.counts.b60 + ')</strong></div>' +
      '<div class="stat"><span>61–90 days</span><strong>' + fmtINR(rep.buckets.b90) + ' (' + rep.counts.b90 + ')</strong></div>' +
      '<div class="stat"><span>90+ days</span><strong class="bad">' + fmtINR(rep.buckets.b90p) + ' (' + rep.counts.b90p + ')</strong></div>' +
      '<div class="stat"><span>Total overdue</span><strong class="bad">' + fmtINR(rep.totalOverdue) + '</strong></div>';
    var dels = document.querySelectorAll('.v-del');
    for (var i = 0; i < dels.length; i++) {
      dels[i].addEventListener('click', function () { dues.splice(Number(this.getAttribute('data-i')), 1); render(); });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'fee-recovery-assistant-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'fee-recovery-assistant-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What are aging buckets?', a: 'Overdue dues are grouped by how late they are: 1–30, 31–60, 61–90, and 90+ days. Older buckets get firmer follow-up scripts.' },
      { q: 'प्राथमिकता स्कोर कैसे तय होता है?', a: '0–100 का स्कोर: बकाया दिनों का 60% वज़न (120 दिन पर अधिकतम) और राशि का 40% वज़न। 70+ = critical, 40+ = high, बाकी normal। सबसे पहले critical वालों से संपर्क करें।' },
      { q: 'Does the tool send the follow-up messages?', a: 'No — it only drafts Hindi/English scripts for you to copy. You send them yourself through your own channels.' },
      { q: 'Where is the data stored?', a: 'Only in this browser session — the list is kept in memory and is not uploaded anywhere.' }
    ]);

    $('f-add-due').addEventListener('click', function () {
      if (dues.length >= 25) { msg('List full (max 25).', false); return; }
      var name = $('v-name').value.trim(), cls = $('v-cls').value.trim();
      var due = Number($('v-due').value), dueDate = $('v-duedate').value;
      if (!name) { msg('Enter the student name.', false); return; }
      if (!isFinite(due) || due <= 0) { msg('Due amount must be greater than zero.', false); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { msg('Enter a valid due date.', false); return; }
      dues.push({ student: name, cls: cls, due: Math.round(due * 100) / 100, dueDate: dueDate });
      $('v-name').value = ''; $('v-due').value = '';
      render(); msg('Due added.', true);
    });

    $('f-score').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('v-gate'), SLUG, FREE_LIMIT); return; }
      if (!dues.length) { msg('Add dues first.', false); return; }
      // sort in place: critical first, then by score desc
      var today = new Date().toISOString().slice(0, 10);
      dues.sort(function (a, b) {
        var pa = priorityScore(a.due, daysOverdue(a.dueDate, today)).score;
        var pb = priorityScore(b.due, daysOverdue(b.dueDate, today)).score;
        return pb - pa;
      });
      render(); msg('Sorted by recovery priority.', true);
    });

    $('v-lang').addEventListener('change', render);
    $('v-inst').addEventListener('input', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
