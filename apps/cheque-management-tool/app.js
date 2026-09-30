/* ============================================================
   VisionQuantech Business Suite — Cheque Management Tool
   apps/cheque-management-tool/app.js

   Pure functions first (no DOM) — tested under node.
   Issued/received cheque & DD register with CTS validity tracking:
   RBI (2012 circular, eff. 1 Apr 2012) — cheques, demand drafts,
   pay orders and banker's cheques are valid for 3 months from the
   date of issue; presented later they are dishonoured as STALE.
   Stale-cheque, expiring-soon and pending-encashment alerts.
   Max 25 saved entries (Vault), reads unmetered.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SAVED = 25;
  var MAX_AMOUNT = 10000000000;
  var VALIDITY_DAYS = 90; // 3-month validity; calendar-month nuance stated on screen
  var EXPIRING_SOON_DAYS = 7;

  var KINDS = ['cheque', 'dd', 'pay-order'];
  var DIRECTIONS = ['issued', 'received'];
  var STATUSES = ['pending', 'cleared', 'bounced', 'stopped'];

  function trim(s) { return String(s == null ? '' : s).trim(); }

  /** Strict YYYY-MM-DD calendar parse. */
  function strictDate(s) {
    s = trim(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return { ok: false, error: 'Invalid calendar date.' };
    if (y < 1900 || y > 2100) return { ok: false, error: 'Year out of range.' };
    return { ok: true, value: s };
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function dayDiff(fromISO, toISO) {
    return Math.round((new Date(toISO + 'T00:00:00Z').getTime() - new Date(fromISO + 'T00:00:00Z').getTime()) / 86400000);
  }

  function validateCheque(c) {
    c = c || {};
    var no = trim(c.no);
    if (!no) return { ok: false, error: 'Enter the cheque/DD number.' };
    if (no.length > 30) return { ok: false, error: 'Instrument number too long (max 30 chars).' };
    if (!/^[A-Za-z0-9\-\/ ]+$/.test(no))
      return { ok: false, error: 'Instrument number may only contain letters, digits, spaces, - and /.' };
    var party = trim(c.party);
    if (!party) return { ok: false, error: 'Enter the payee/payer name.' };
    if (party.length > 80) return { ok: false, error: 'Name too long (max 80 chars).' };
    var amt = Number(c.amount);
    if (!isFinite(amt)) return { ok: false, error: 'Enter a valid amount.' };
    if (amt <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    if (amt > MAX_AMOUNT) return { ok: false, error: 'Amount looks too large.' };
    var dp = strictDate(c.issueDate);
    if (!dp.ok) return { ok: false, error: 'Issue date: ' + dp.error };
    if (KINDS.indexOf(c.kind) < 0) return { ok: false, error: 'Unknown instrument type.' };
    if (DIRECTIONS.indexOf(c.direction) < 0) return { ok: false, error: 'Unknown direction.' };
    if (STATUSES.indexOf(c.status) < 0) return { ok: false, error: 'Unknown status.' };
    return {
      ok: true,
      cheque: {
        no: no, party: party.slice(0, 80), amount: Math.round(amt * 100) / 100,
        issueDate: dp.value, kind: c.kind, direction: c.direction, status: c.status
      }
    };
  }

  /** Validity snapshot as of asOfISO. status: valid | expiring | stale. */
  function validity(issueISO, asOfISO) {
    var ip = strictDate(issueISO);
    if (!ip.ok) return ip;
    var ap = strictDate(asOfISO || todayISO());
    if (!ap.ok) return ap;
    var daysOld = dayDiff(ip.value, ap.value);
    var expiresOn = addDays(ip.value, VALIDITY_DAYS);
    var daysLeft = VALIDITY_DAYS - daysOld;
    var status = daysLeft < 0 ? 'stale' : (daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'valid');
    return { ok: true, daysOld: daysOld, expiresOn: expiresOn, daysLeft: daysLeft, status: status };
  }

  function registerAdd(list, cheque) {
    var v = validateCheque(cheque);
    if (!v.ok) return v;
    var arr = Array.isArray(list) ? list.slice() : [];
    if (arr.length >= MAX_SAVED)
      return { ok: false, error: 'Register is full (max ' + MAX_SAVED + ' entries) — clear settled cheques first.' };
    var dup = arr.some(function (e) { return e.no === v.cheque.no && e.issueDate === v.cheque.issueDate; });
    if (dup) return { ok: false, error: 'This instrument number + issue date is already in the register.' };
    arr.push(v.cheque);
    return { ok: true, list: arr };
  }

  function registerRemove(list, no, issueDate) {
    var arr = (Array.isArray(list) ? list : []).filter(function (e) {
      return !(e.no === no && e.issueDate === issueDate);
    });
    return { ok: true, list: arr };
  }

  /** Alerts across the whole register as of asOfISO. */
  function alerts(list, asOfISO) {
    var arr = Array.isArray(list) ? list : [];
    var stale = [], expiring = [], pendingIssued = [], pendingReceived = [];
    var issuedPendingTotal = 0, receivedPendingTotal = 0;
    arr.forEach(function (e) {
      var v = validity(e.issueDate, asOfISO);
      if (!v.ok) return;
      var item = { cheque: e, daysOld: v.daysOld, expiresOn: v.expiresOn, daysLeft: v.daysLeft };
      if (e.status === 'pending') {
        if (v.status === 'stale') stale.push(item);
        else if (v.status === 'expiring') expiring.push(item);
        if (e.direction === 'issued') { pendingIssued.push(item); issuedPendingTotal += e.amount; }
        else { pendingReceived.push(item); receivedPendingTotal += e.amount; }
      }
    });
    issuedPendingTotal = Math.round(issuedPendingTotal * 100) / 100;
    receivedPendingTotal = Math.round(receivedPendingTotal * 100) / 100;
    return {
      ok: true, stale: stale, expiring: expiring,
      pendingIssued: pendingIssued, pendingReceived: pendingReceived,
      issuedPendingTotal: issuedPendingTotal, receivedPendingTotal: receivedPendingTotal,
      total: arr.length
    };
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
    MAX_SAVED: MAX_SAVED, VALIDITY_DAYS: VALIDITY_DAYS, EXPIRING_SOON_DAYS: EXPIRING_SOON_DAYS,
    KINDS: KINDS, DIRECTIONS: DIRECTIONS, STATUSES: STATUSES,
    strictDate: strictDate, todayISO: todayISO,
    validateCheque: validateCheque, validity: validity,
    registerAdd: registerAdd, registerRemove: registerRemove, alerts: alerts,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cheque-management-tool';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'register';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('c-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  async function loadList() {
    try {
      var l = await Vault.load(SLUG, VAULT_KEY);
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }
  async function saveList(list) { await Vault.save(SLUG, VAULT_KEY, list); }

  function statusBadge(e) {
    var v = validity(e.issueDate, todayISO());
    if (e.status !== 'pending') return '<span class="tag">' + esc(e.status) + '</span>';
    if (!v.ok) return '';
    if (v.status === 'stale') return '<span class="tag tag-bad">STALE — ' + v.daysOld + ' days old</span>';
    if (v.status === 'expiring') return '<span class="tag tag-warn">expires in ' + v.daysLeft + 'd</span>';
    return '<span class="tag tag-ok">valid ' + v.daysLeft + 'd left</span>';
  }

  async function renderRegister() {
    var list = await loadList();
    var a = alerts(list, todayISO());
    var h = '<div class="kpi-row">' +
      '<div class="kpi"><div class="kpi-n">' + a.pendingIssued.length + '</div><div class="kpi-l">issued pending (' + fmtINR(a.issuedPendingTotal) + ')</div></div>' +
      '<div class="kpi"><div class="kpi-n">' + a.pendingReceived.length + '</div><div class="kpi-l">received pending (' + fmtINR(a.receivedPendingTotal) + ')</div></div>' +
      '<div class="kpi"><div class="kpi-n' + (a.stale.length ? ' txt-bad' : '') + '">' + a.stale.length + '</div><div class="kpi-l">stale alerts</div></div>' +
      '<div class="kpi"><div class="kpi-n' + (a.expiring.length ? ' txt-warn' : '') + '">' + a.expiring.length + '</div><div class="kpi-l">expiring ≤7 days</div></div>' +
      '</div>';
    if (a.stale.length) {
      h += '<p class="msg-err">⚠ ' + a.stale.length + ' pending instrument(s) are STALE (past 3-month validity) — get them reissued; banks will dishonour them.</p>';
    }
    if (!list.length) {
      h += '<p class="vq-hint">Register is empty. Add your first cheque or DD above.</p>';
    } else {
      h += '<div class="tbl-wrap"><table class="tbl"><tr><th>No.</th><th>Party</th><th>Dir.</th><th>Amount</th><th>Issue date</th><th>Status</th><th></th></tr>';
      list.forEach(function (e) {
        h += '<tr><td>' + esc(e.no) + '</td><td>' + esc(e.party) + '</td><td>' + esc(e.direction) + '</td>' +
          '<td class="num">' + fmtINR(e.amount) + '</td><td>' + esc(e.issueDate) + '</td>' +
          '<td>' + statusBadge(e) + '</td>' +
          '<td><button type="button" class="vq-btn vq-btn-sm" data-del="' + esc(e.no) + '|' + esc(e.issueDate) + '">Remove</button></td></tr>';
      });
      h += '</table></div>';
    }
    $('c-register').innerHTML = h;
    var btns = $('c-register').querySelectorAll('[data-del]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', async function () {
        var parts = this.getAttribute('data-del').split('|');
        var r = registerRemove(await loadList(), parts[0], parts[1]);
        await saveList(r.list);
        renderRegister();
      });
    }
  }

  function init() {
    Ads.render($('ad-top'), 'cheque-management-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cheque-management-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How long is a cheque valid in India?', a: '3 months from the date of issue, per the RBI circular effective 1 April 2012. The same applies to demand drafts, pay orders and banker\u2019s cheques. Presented later, the bank dishonours it as stale.' },
      { q: 'चेक कितने समय तक वैध रहता है?', a: 'जारी होने की तारीख से 3 महीने तक। इसके बाद चेक stale हो जाता है और बैंक भुगतान नहीं करता।' },
      { q: 'What happens to a stale cheque?', a: 'The bank will not honour it. Ask the drawer to cancel it and issue a fresh instrument; do not simply alter the date.' },
      { q: 'Does the tool warn before a cheque expires?', a: 'Yes — pending instruments expiring within 7 days get an "expiring" alert, and instruments past 90 days get a STALE alert.' },
      { q: 'Where is my cheque register stored?', a: 'On your own device (encrypted in your browser). Nothing is uploaded anywhere.' },
      { q: 'Can I track received cheques awaiting deposit too?', a: 'Yes — mark direction as "received" and status "pending"; the pending-encashment totals show money not yet in your account.' }
    ]);

    $('c-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('c-gate'), SLUG, FREE_LIMIT); $('c-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = registerAdd(await loadList(), {
        no: $('c-no').value, party: $('c-party').value, amount: $('c-amount').value,
        issueDate: $('c-date').value, kind: $('c-kind').value,
        direction: $('c-dir').value, status: $('c-status').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      await saveList(r.list); // Vault save awaited, max 25
      msg('Added to register.', true);
      $('c-no').value = ''; $('c-party').value = ''; $('c-amount').value = '';
      renderRegister();
    });

    renderRegister(); // reads are unmetered
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
