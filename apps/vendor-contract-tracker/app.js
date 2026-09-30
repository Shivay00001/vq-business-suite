/* ============================================================
   VisionQuantech Business Suite — Vendor Contract Tracker
   apps/vendor-contract-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   Tracks vendor contracts with expiry dates and auto-renewal
   flags; raises 90/60/30-day renewal alerts and flags expired
   contracts. Alert windows are computed against a supplied
   "today" so they are fully testable.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_CONTRACTS = 25;
  var ALERT_WINDOWS = [90, 60, 30]; // days before expiry

  function isDateStr(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  }
  function toUTC(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }

  function validateContract(c) {
    if (!c || typeof c !== 'object') return { ok: false, error: 'Contract data is required.' };
    if (!String(c.vendor || '').trim()) return { ok: false, error: 'Vendor name is required.' };
    if (String(c.vendor).length > 120) return { ok: false, error: 'Vendor name too long (max 120).' };
    if (!String(c.title || '').trim()) return { ok: false, error: 'Contract title is required.' };
    if (String(c.title).length > 140) return { ok: false, error: 'Contract title too long (max 140).' };
    if (!isDateStr(c.startDate)) return { ok: false, error: 'Start date must be YYYY-MM-DD.' };
    if (!isDateStr(c.endDate)) return { ok: false, error: 'End date must be YYYY-MM-DD.' };
    if (daysBetween(c.startDate, c.endDate) < 0) return { ok: false, error: 'End date cannot be before start date.' };
    if (daysBetween(c.startDate, c.endDate) > 3650) return { ok: false, error: 'Contract term looks too long (max 10 years).' };
    var val = Number(c.value);
    if (c.value !== '' && c.value != null && (!isFinite(val) || val < 0)) return { ok: false, error: 'Contract value cannot be negative.' };
    var notice = Number(c.noticeDays == null || c.noticeDays === '' ? 60 : c.noticeDays);
    if (!isFinite(notice) || Math.floor(notice) !== notice || notice < 0 || notice > 365)
      return { ok: false, error: 'Notice period must be whole days (0–365).' };
    return {
      ok: true,
      value: {
        vendor: String(c.vendor).trim(), title: String(c.title).trim(),
        startDate: c.startDate, endDate: c.endDate,
        value: (c.value === '' || c.value == null) ? null : val,
        autoRenew: !!c.autoRenew, noticeDays: notice,
        notes: String(c.notes || '').slice(0, 500)
      }
    };
  }

  /** Days from `today` until the contract end date (negative = expired). */
  function daysToExpiry(endDate, today) {
    if (!isDateStr(endDate)) return { ok: false, error: 'Bad end date.' };
    var t = isDateStr(today) ? today : new Date().toISOString().slice(0, 10);
    return { ok: true, value: daysBetween(t, endDate) };
  }

  /**
   * Alert for one contract: expired | '90' | '60' | '30' | null.
   * noticeDays: the contract's own notice window is also checked —
   * if it falls outside the 90/60/30 windows it gets its own alert.
   */
  function alertFor(contract, today) {
    var v = validateContract(contract);
    if (!v.ok) return v;
    var d = daysToExpiry(v.value.endDate, today);
    if (!d.ok) return d;
    var days = d.value;
    if (days < 0) return { ok: true, level: 'expired', daysLeft: days };
    // narrowest matching window first, so the alert is as precise as possible
    for (var i = ALERT_WINDOWS.length - 1; i >= 0; i--) {
      if (days <= ALERT_WINDOWS[i]) {
        return { ok: true, level: String(ALERT_WINDOWS[i]), daysLeft: days };
      }
    }
    if (days <= v.value.noticeDays) return { ok: true, level: 'notice', daysLeft: days, noticeDays: v.value.noticeDays };
    return { ok: true, level: null, daysLeft: days };
  }

  /** All alerts across contracts, most urgent first. */
  function alertsFor(contracts, today) {
    if (!Array.isArray(contracts)) return { ok: false, error: 'Contracts must be an array.' };
    var t = isDateStr(today) ? today : new Date().toISOString().slice(0, 10);
    var out = [];
    for (var i = 0; i < contracts.length; i++) {
      var a = alertFor(contracts[i], t);
      if (!a.ok) return { ok: false, error: 'Contract ' + (i + 1) + ': ' + a.error };
      if (a.level) out.push({ index: i, contract: contracts[i], level: a.level, daysLeft: a.daysLeft });
    }
    var rank = { 'expired': 0, '30': 1, '60': 2, '90': 3, 'notice': 4 };
    out.sort(function (x, y) { return (rank[x.level] - rank[y.level]) || (x.daysLeft - y.daysLeft); });
    return { ok: true, alerts: out };
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
    MAX_CONTRACTS: MAX_CONTRACTS, ALERT_WINDOWS: ALERT_WINDOWS,
    isDateStr: isDateStr, daysBetween: daysBetween,
    validateContract: validateContract, daysToExpiry: daysToExpiry,
    alertFor: alertFor, alertsFor: alertsFor,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'vendor-contract-tracker';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('k-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  async function loadContracts() {
    try { return (await Vault.load(SLUG, 'contracts')) || []; } catch (e) { return []; }
  }
  async function saveContracts(list) {
    await Vault.save(SLUG, 'contracts', list.slice(0, MAX_CONTRACTS));
  }

  function levelBadge(a) {
    var map = {
      'expired': '<span class="a-badge a-bad">Expired</span>',
      '30': '<span class="a-badge a-bad">≤ 30 days</span>',
      '60': '<span class="a-badge a-wait">≤ 60 days</span>',
      '90': '<span class="a-badge a-wait">≤ 90 days</span>',
      'notice': '<span class="a-badge a-wait">Notice window</span>'
    };
    return map[a.level] || '';
  }

  async function renderContracts() {
    var list = await loadContracts();
    var t = todayStr();
    var al = alertsFor(list, t);
    var alerts = al.ok ? al.alerts : [];

    var alertHtml = alerts.length
      ? '<h3 class="vq-section-title">Renewal alerts</h3>' + alerts.map(function (a) {
          var c = a.contract;
          var warn = c.autoRenew && a.level === 'expired'
            ? ' — auto-renewed? verify the renewed term.'
            : (c.autoRenew ? ' — auto-renewal is ON: review before the notice window closes.' : ' — act before expiry.');
          return '<div class="a-req">' + levelBadge(a) + ' <strong>' + esc(c.title) + '</strong> — ' + esc(c.vendor) +
            '<br><span class="vq-hint">Expires ' + esc(c.endDate) + ' (' + (a.daysLeft < 0 ? Math.abs(a.daysLeft) + ' days ago' : a.daysLeft + ' days left') + ')' + esc(warn) + '</span></div>';
        }).join('')
      : '<p class="msg-ok">No renewals due within 90 days.</p>';

    var rows = list.map(function (c, i) {
      var a = alertFor(c, t);
      return '<tr><td><strong>' + esc(c.title) + '</strong><br><span class="vq-hint">' + esc(c.vendor) + '</span></td>' +
        '<td>' + esc(c.startDate) + '</td><td>' + esc(c.endDate) + '</td>' +
        '<td class="num">' + (c.value == null ? '—' : fmtINR(c.value)) + '</td>' +
        '<td>' + (c.autoRenew ? 'Yes' : 'No') + '</td>' +
        '<td>' + (a.ok && a.level ? levelBadge(a) : '<span class="vq-hint">—</span>') + '</td>' +
        '<td><button class="vq-btn vq-btn-ghost k-del" data-i="' + i + '" type="button">Delete</button></td></tr>';
    }).join('');

    $('k-list').innerHTML = alertHtml +
      (list.length
        ? '<h3 class="vq-section-title">All contracts (' + list.length + '/' + MAX_CONTRACTS + ')</h3>' +
          '<div class="po-table-wrap"><table class="vq-table"><thead><tr><th>Contract</th><th>Start</th><th>End</th><th class="num">Value</th><th>Auto-renew</th><th>Alert</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="vq-hint">No contracts yet.</p>');

    Array.prototype.forEach.call(document.querySelectorAll('.k-del'), function (b) {
      b.addEventListener('click', async function () {
        var l = await loadContracts();
        l.splice(Number(b.getAttribute('data-i')), 1);
        await saveContracts(l); renderContracts();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'vendor-contract-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'vendor-contract-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I track vendor contract renewals?', a: 'Add each contract with vendor, title, start and end dates, value, auto-renewal flag and notice period. The dashboard raises 90/60/30-day renewal alerts and flags expired contracts automatically.' },
      { q: 'वेंडर कॉन्ट्रैक्ट रिन्यूअल कैसे ट्रैक करें?', a: 'हर कॉन्ट्रैक्ट का विक्रेता, शीर्षक, शुरू-समाप्ति तारीख, वैल्यू, ऑटो-रिन्यूअल और नोटिस अवधि डालें — डैशबोर्ड 90/60/30 दिन पहले अलर्ट देगा।' },
      { q: 'What about auto-renewing contracts?', a: 'Auto-renewal does not cancel the alert: you still get a reminder before the notice window closes, because most auto-renew clauses require written notice to stop. Expired auto-renew contracts are flagged for verification of the renewed term.' },
      { q: 'ऑटो-रिन्यूअल वाले कॉन्ट्रैक्ट का क्या?', a: 'ऑटो-रिन्यूअल पर भी अलर्ट मिलता है — नोटिस विंडो बंद होने से पहले समीक्षा करें, क्योंकि ज़्यादातर क्लॉज़ में रोकने के लिए लिखित सूचना ज़रूरी होती है।' },
      { q: 'How are the alert windows calculated?', a: 'Against today\u2019s date on your device: expired (< 0 days), then ≤30, ≤60, ≤90 days to expiry, plus your own notice-period window if it falls outside those.' },
      { q: 'Is my contract data stored online?', a: 'No. Up to 25 contracts are saved in your browser vault on this device only.' }
    ]);

    $('k-start').value = todayStr();
    renderContracts();

    $('k-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('k-gate'), SLUG, FREE_LIMIT); $('k-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var v = validateContract({
        vendor: $('k-vendor').value, title: $('k-title').value,
        startDate: $('k-start').value, endDate: $('k-end').value,
        value: $('k-value').value, autoRenew: $('k-renew').checked,
        noticeDays: $('k-notice').value, notes: $('k-notes').value
      });
      if (!v.ok) { msg(v.error, false); return; }
      var list = await loadContracts();
      if (list.length >= MAX_CONTRACTS) { msg('Contract list is full (max ' + MAX_CONTRACTS + '). Delete one first.', false); return; }
      list.push(v.value);
      await saveContracts(list);
      msg('Contract added.', true);
      $('k-vendor').value = ''; $('k-title').value = ''; $('k-end').value = ''; $('k-value').value = ''; $('k-notes').value = '';
      renderContracts();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
