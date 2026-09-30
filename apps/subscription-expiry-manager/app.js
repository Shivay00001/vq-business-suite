/* ============================================================
   VisionQuantech Business Suite — Subscription Expiry Manager
   apps/subscription-expiry-manager/app.js

   Track software/SaaS subscriptions, renewal alerts at 30/15/7
   days, and total yearly SaaS spend. On-device only.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var MAX_SUBS = 25;
  var CYCLES = ['weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'];
  var CYCLE_MULT = { weekly: 52, monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1, 'one-time': 1 };
  var MAX_COST = 100000000;

  var _idCounter = 0;
  function makeId() {
    _idCounter += 1;
    return 'sub-' + Date.now().toString(36) + '-' + (_idCounter) + Math.floor(Math.random() * 1e6).toString(36);
  }

  /** Parse YYYY-MM-DD strictly; returns Date at UTC midnight or null. */
  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function validateSub(sub) {
    sub = sub || {};
    var name = String(sub.name == null ? '' : sub.name).trim();
    if (!name) return { ok: false, error: 'Enter a subscription name (e.g. "Tally Prime").' };
    if (name.length > 80) return { ok: false, error: 'Name is too long (max 80 characters).' };
    var cost = Number(sub.cost);
    if (!isFinite(cost)) return { ok: false, error: 'Enter a valid cost per billing cycle.' };
    if (cost < 0) return { ok: false, error: 'Cost cannot be negative.' };
    if (cost > MAX_COST) return { ok: false, error: 'Cost looks too large (max ₹' + MAX_COST.toLocaleString('en-IN') + ').' };
    if (CYCLES.indexOf(sub.cycle) < 0) return { ok: false, error: 'Pick a billing cycle.' };
    var renewal = parseISO(sub.renewal);
    if (!renewal) return { ok: false, error: 'Enter a valid renewal date (YYYY-MM-DD).' };
    var cat = String(sub.category == null ? 'other' : sub.category).trim().slice(0, 40) || 'other';
    return { ok: true, value: { name: name, cost: cost, cycle: sub.cycle, renewal: sub.renewal, category: cat } };
  }

  function addSub(list, sub) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_SUBS) return { ok: false, error: 'Maximum ' + MAX_SUBS + ' subscriptions can be tracked.' };
    var v = validateSub(sub);
    if (!v.ok) return v;
    var rec = { id: makeId(), name: v.value.name, cost: v.value.cost, cycle: v.value.cycle, renewal: v.value.renewal, category: v.value.category };
    return { ok: true, sub: rec, list: list.concat([rec]) };
  }

  function removeSub(list, id) {
    list = Array.isArray(list) ? list : [];
    return { ok: true, list: list.filter(function (s) { return s.id !== id; }) };
  }

  /** Whole days from asOf (YYYY-MM-DD) until renewal (YYYY-MM-DD). Negative = overdue. */
  function daysUntil(renewalISO, asOfISO) {
    var r = parseISO(renewalISO), a = parseISO(asOfISO);
    if (!r || !a) return null;
    return Math.round((r.getTime() - a.getTime()) / 86400000);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Alert band: overdue | critical(<=7) | warning(<=15) | watch(<=30) | ok */
  function alertFor(days) {
    if (days == null) return 'ok';
    if (days < 0) return 'overdue';
    if (days <= 7) return 'critical';
    if (days <= 15) return 'warning';
    if (days <= 30) return 'watch';
    return 'ok';
  }

  function annualCost(cost, cycle) {
    var m = CYCLE_MULT[cycle] || 0;
    return Math.round(cost * m * 100) / 100;
  }

  /** Total recurring yearly spend (one-time purchases excluded — reported separately). */
  function totalYearlySpend(list) {
    list = Array.isArray(list) ? list : [];
    var t = 0;
    list.forEach(function (s) {
      if (s.cycle !== 'one-time') t += annualCost(Number(s.cost) || 0, s.cycle);
    });
    return Math.round(t * 100) / 100;
  }

  function oneTimeSpend(list) {
    list = Array.isArray(list) ? list : [];
    var t = 0;
    list.forEach(function (s) {
      if (s.cycle === 'one-time') t += Number(s.cost) || 0;
    });
    return Math.round(t * 100) / 100;
  }

  /** Subscriptions renewing within `days` from asOf, sorted soonest-first. */
  function renewalsInDays(list, days, asOfISO) {
    list = Array.isArray(list) ? list : [];
    asOfISO = asOfISO || todayISO();
    var out = [];
    list.forEach(function (s) {
      var d = daysUntil(s.renewal, asOfISO);
      if (d != null && d <= days) out.push({ sub: s, days: d, alert: alertFor(d) });
    });
    out.sort(function (a, b) { return a.days - b.days; });
    return out;
  }

  function fmtINR(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_SUBS: MAX_SUBS, CYCLES: CYCLES,
    parseISO: parseISO, validateSub: validateSub,
    addSub: addSub, removeSub: removeSub,
    daysUntil: daysUntil, todayISO: todayISO, alertFor: alertFor,
    annualCost: annualCost, totalYearlySpend: totalYearlySpend,
    oneTimeSpend: oneTimeSpend, renewalsInDays: renewalsInDays,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'subscription-expiry-manager';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('s-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }

  var ALERT_LABEL = { overdue: 'Overdue', critical: '≤ 7 days — renew now', warning: '≤ 15 days', watch: '≤ 30 days', ok: 'OK' };

  function render(list) {
    var asOf = todayISO();
    var sorted = renewalsInDays(list, 100000, asOf); // everything, soonest first
    var html = '';
    if (!sorted.length) {
      html = '<p class="vq-hint">No subscriptions yet. Add your first one above.</p>';
    } else {
      html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
        '<th>Subscription</th><th>Cost / cycle</th><th>₹/year</th><th>Renews on</th><th>Days left</th><th>Alert</th><th></th>' +
        '</tr></thead><tbody>';
      sorted.forEach(function (it) {
        var s = it.sub;
        html += '<tr><td><strong>' + esc(s.name) + '</strong><br><span class="vq-hint">' + esc(s.category) + '</span></td>' +
          '<td>' + fmtINR(s.cost) + ' / ' + esc(s.cycle) + '</td>' +
          '<td>' + (s.cycle === 'one-time' ? '—' : fmtINR(annualCost(s.cost, s.cycle))) + '</td>' +
          '<td>' + esc(s.renewal) + '</td>' +
          '<td>' + (it.days < 0 ? '<span class="msg-err">' + it.days + '</span>' : it.days) + '</td>' +
          '<td><span class="badge b-' + it.alert + '">' + ALERT_LABEL[it.alert] + '</span></td>' +
          '<td><button class="vq-btn ghost s-del" data-id="' + esc(s.id) + '" type="button">Remove</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    var urgent = renewalsInDays(list, 30, asOf);
    html = '<p class="big">' + fmtINR(totalYearlySpend(list)) + ' <span class="vq-hint">/ year (recurring)</span></p>' +
      '<p class="vq-hint">One-time purchases: ' + fmtINR(oneTimeSpend(list)) + ' · ' +
      urgent.length + ' renewal(s) due in the next 30 days.</p>' + html;
    $('s-list').innerHTML = html;
    Array.prototype.forEach.call($('s-list').querySelectorAll('.s-del'), function (b) {
      b.addEventListener('click', function () {
        var gate = Freemium.check(SLUG, FREE_LIMIT);
        if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); return; }
        readList().then(function (list) {
          var nl = removeSub(list, b.getAttribute('data-id')).list;
          saveList(nl).then(function () { render(nl); });
        });
      });
    });
  }

  function readList() {
    return Vault.load(SLUG, 'subscriptions').then(function (r) {
      return (r && Array.isArray(r.value)) ? r.value : [];
    });
  }
  function saveList(list) { return Vault.save(SLUG, 'subscriptions', list.slice(0, MAX_SUBS)); }

  function init() {
    Ads.render($('ad-top'), 'subscription-expiry-manager-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'subscription-expiry-manager-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do renewal alerts work?', a: 'Enter each subscription with its renewal date. The app bands them: overdue, ≤7 days (critical), ≤15 days (warning), ≤30 days (watch), so nothing auto-renews unnoticed.' },
      { q: 'सब्सक्रिप्शन रिन्यूअल अलर्ट कैसे काम करता है?', a: 'हर सब्सक्रिप्शन की रिन्यूअल तारीख डालें। ऐप उन्हें बकाया, 7 दिन के अंदर, 15 दिन के अंदर और 30 दिन के अंदर के बैंड में दिखाता है।' },
      { q: 'How is total yearly SaaS spend calculated?', a: 'Weekly ×52, monthly ×12, quarterly ×4, half-yearly ×2 and yearly ×1. One-time purchases are excluded from the yearly total and shown separately.' },
      { q: 'Is my subscription data uploaded anywhere?', a: 'No. Everything is stored in your browser on this device via the on-device vault. Nothing is sent to any server.' },
      { q: 'How many subscriptions can I track?', a: 'Up to 25 subscriptions per device, free — 20 tracker actions per day.' }
    ]);
    $('s-date').value = todayISO();
    readList().then(render);

    $('s-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('s-gate'), SLUG, FREE_LIMIT); $('s-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      readList().then(function (list) {
        var r = addSub(list, {
          name: $('s-name').value, cost: $('s-cost').value,
          cycle: $('s-cycle').value, renewal: $('s-date').value,
          category: $('s-cat').value
        });
        if (!r.ok) { msg(r.error, false); return; }
        saveList(r.list).then(function () {
          msg('Added: ' + r.sub.name + ' — renews ' + r.sub.renewal + ' (' + fmtINR(annualCost(r.sub.cost, r.sub.cycle)) + '/year).', true);
          $('s-name').value = ''; $('s-cost').value = '';
          render(r.list);
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
