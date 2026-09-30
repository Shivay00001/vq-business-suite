/* ============================================================
   VisionQuantech Business Suite — Retention Money Calculator
   apps/retention-money-calculator/app.js

   Pure functions first (no DOM) — tested under node.
   Retention money: a % of contract value held back by the client
   (typically 5-10% in Indian works/supply contracts) and released
   after the defect liability period (DLP). This tool tracks per-
   contract retention, release due dates, released vs locked amounts,
   and total locked working capital across contracts.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_CONTRACTS = 25;
  var MAX_NAME = 120;
  var MAX_AMOUNT = 100000000000;
  var MAX_PCT = 25; // retention above 25% is almost certainly a data error

  function num(v, name, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < min) return { ok: false, error: name + ' cannot be negative.' };
    if (max != null && n > max) return { ok: false, error: name + ' looks too large (max ' + max.toLocaleString('en-IN') + ').' };
    return { ok: true, value: n };
  }

  function text(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: name + ' is required.' };
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function parseDate(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: (field || 'Date') + ' must be in YYYY-MM-DD format.' };
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) {
      return { ok: false, error: (field || 'Date') + ' is not a real calendar date.' };
    }
    return { ok: true, value: s };
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayNum(iso) {
    var p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function uid() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Add N months to a YYYY-MM-DD date (clamped to month end). */
  function addMonths(iso, months) {
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1 + months, 1);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var day = Math.min(p[2], last);
    var r = new Date(d.getFullYear(), d.getMonth(), day);
    return r.getFullYear() + '-' + String(r.getMonth() + 1).padStart(2, '0') + '-' + String(r.getDate()).padStart(2, '0');
  }

  /** Retention amount for one contract value. */
  function retentionFor(value, pct, capPct) {
    var v = num(value, 'Contract value', 0, MAX_AMOUNT);
    if (!v.ok) return v;
    if (v.value <= 0) return { ok: false, error: 'Contract value must be greater than zero.' };
    var p = num(pct, 'Retention %', 0, MAX_PCT);
    if (!p.ok) return p;
    var ret = v.value * p.value / 100;
    if (capPct != null && capPct !== '') {
      var cp = num(capPct, 'Retention cap %', 0, MAX_PCT);
      if (!cp.ok) return cp;
      var capAmt = v.value * cp.value / 100;
      if (ret > capAmt) ret = capAmt;
    }
    return { ok: true, value: round2(ret) };
  }

  function addContract(list, c) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_CONTRACTS) return { ok: false, error: 'Contract list is full (max ' + MAX_CONTRACTS + '). Remove one first.' };
    c = c || {};
    var name = text(c.name, 'Contract name', MAX_NAME);
    if (!name.ok) return name;
    var ret = retentionFor(c.value, c.retentionPct, c.capPct);
    if (!ret.ok) return ret;
    var comp = parseDate(c.completionDate, 'Completion date');
    if (!comp.ok) return comp;
    var dlp = num(c.dlpMonths == null || c.dlpMonths === '' ? 12 : c.dlpMonths, 'DLP (months)', 0, 120);
    if (!dlp.ok) return dlp;
    var rec = {
      id: uid(), name: name.value, value: round2(Number(c.value)),
      retentionPct: Number(c.retentionPct), capPct: c.capPct === '' || c.capPct == null ? '' : Number(c.capPct),
      retention: ret.value, completionDate: comp.value, dlpMonths: Math.floor(dlp.value),
      released: false, releasedOn: ''
    };
    rec.releaseDue = addMonths(comp.value, rec.dlpMonths);
    return { ok: true, contract: rec, list: list.concat([rec]) };
  }

  function removeContract(list, id) {
    list = Array.isArray(list) ? list : [];
    var nl = list.filter(function (c) { return c.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Contract not found.' };
    return { ok: true, list: nl };
  }

  function markReleased(list, id, onDate) {
    list = Array.isArray(list) ? list : [];
    var d = onDate ? parseDate(onDate, 'Release date') : { ok: true, value: todayStr() };
    if (!d.ok) return d;
    var found = false;
    var nl = list.map(function (c) {
      if (c.id !== id) return c;
      found = true;
      return Object.assign({}, c, { released: true, releasedOn: d.value });
    });
    if (!found) return { ok: false, error: 'Contract not found.' };
    return { ok: true, list: nl };
  }

  function totals(list, now) {
    list = Array.isArray(list) ? list : [];
    var t = { totalValue: 0, totalRetained: 0, released: 0, locked: 0, dueNow: [], contracts: list.length };
    var n = now || todayStr();
    list.forEach(function (c) {
      t.totalValue = round2(t.totalValue + c.value);
      t.totalRetained = round2(t.totalRetained + c.retention);
      if (c.released) { t.released = round2(t.released + c.retention); }
      else {
        t.locked = round2(t.locked + c.retention);
        if (dayNum(c.releaseDue) <= dayNum(n)) t.dueNow.push(c);
      }
    });
    return { ok: true, totals: t };
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
    MAX_CONTRACTS: MAX_CONTRACTS,
    addMonths: addMonths, retentionFor: retentionFor,
    addContract: addContract, removeContract: removeContract,
    markReleased: markReleased, totals: totals,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'retention-money-calculator';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'retention-contracts';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('r-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { contracts: [] };

  function renderList() {
    var box = $('r-list');
    var t = totals(state.contracts).totals;
    $('r-summary').innerHTML =
      '<div class="sum-strip">' +
      '<span>Contracts: <strong>' + t.contracts + '</strong></span>' +
      '<span>Total retained: <strong>' + fmtINR(t.totalRetained) + '</strong></span>' +
      '<span class="lk">Locked now: <strong>' + fmtINR(t.locked) + '</strong></span>' +
      '<span class="rl">Released: <strong>' + fmtINR(t.released) + '</strong></span>' +
      '<span class="due">Release due: <strong>' + t.dueNow.length + '</strong></span>' +
      '</div>';
    if (!state.contracts.length) {
      box.innerHTML = '<p class="vq-hint">No contracts tracked yet — add your first one above.</p>';
      return;
    }
    var html = '';
    state.contracts.forEach(function (c) {
      var dueNow = !c.released && c.releaseDue <= todayStr();
      html += '<div class="ret-card' + (c.released ? ' is-released' : dueNow ? ' is-due' : '') + '">' +
        '<div class="t-head"><strong>' + esc(c.name) + '</strong>' +
        (c.released ? '<span class="badge b-ok">Released ' + esc(c.releasedOn) + '</span>'
          : dueNow ? '<span class="badge b-bad">Release due</span>'
          : '<span class="badge b-warn">Locked</span>') + '</div>' +
        '<p class="vq-hint">Contract value: ' + fmtINR(c.value) + ' · Retention ' + c.retentionPct + '% = <strong>' + fmtINR(c.retention) + '</strong><br>' +
        'Completed: ' + esc(c.completionDate) + ' · DLP: ' + c.dlpMonths + ' month(s) · Release due: <strong>' + esc(c.releaseDue) + '</strong></p>' +
        '<div class="btn-row">' +
        (c.released ? '' : '<button type="button" class="vq-btn vq-btn-ghost" data-release="' + esc(c.id) + '">Mark released</button>') +
        '<button type="button" class="vq-btn vq-btn-ghost" data-remove="' + esc(c.id) + '">Remove</button>' +
        '</div></div>';
    });
    box.innerHTML = html;
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), contracts: state.contracts.slice(0, MAX_CONTRACTS) });
      msg('Saved on this device (' + state.contracts.length + ' contract(s)).', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.contracts)) { state.contracts = rec.contracts.slice(0, MAX_CONTRACTS); renderList(); }
    } catch (e) { /* nothing saved yet */ }
  }

  function init() {
    Ads.render($('ad-top'), 'retention-money-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'retention-money-calculator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is retention money in a contract?', a: 'A percentage of the contract value (typically 5–10% in Indian works/supply contracts) held back by the client as security, released after the defect liability period (often 12 months) if no defects arise.' },
      { q: 'रिटेंशन मनी क्या है?', a: 'कॉन्ट्रैक्ट मूल्य का एक प्रतिशत (आमतौर पर 5–10%) जो ग्राहक सुरक्षा के रूप में रोककर रखता है, और डिफेक्ट लायबिलिटी अवधि (अक्सर 12 महीने) के बाद जारी होता है।' },
      { q: 'When is retention money released?', a: 'After the defect liability period ends and defects (if any) are rectified — the release date is computed here as completion date + DLP months. The contract may release it in parts; adjust the record accordingly.' },
      { q: 'रिटेंशन पर ब्याज मिलता है?', a: 'आमतौर पर नहीं — रिटेंशन मनी पर ब्याज नहीं मिलता, इसलिए यह आपकी कार्यशील पूँजी (working capital) में बँधा पैसा है। कुल locked राशि पर नज़र रखें।' },
      { q: 'Is this financial advice?', a: 'No — a working-capital planning aid. Retention terms vary by contract; confirm the % and release conditions in your agreement and with your CA.' }
    ]);

    $('r-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('r-gate'), SLUG, FREE_LIMIT); $('r-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addContract(state.contracts, {
        name: $('r-name').value, value: $('r-value').value,
        retentionPct: $('r-pct').value, capPct: $('r-cap').value,
        completionDate: $('r-date').value, dlpMonths: $('r-dlp').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      state.contracts = r.list;
      msg('Contract added — retention ' + fmtINR(r.contract.retention) + ', release due ' + r.contract.releaseDue + '. ' + gate.remaining + ' free use(s) left today.', true);
      $('r-name').value = ''; $('r-value').value = ''; $('r-date').value = '';
      renderList();
    });

    $('r-list').addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.dataset) return;
      if (b.dataset.release) {
        var rr = markReleased(state.contracts, b.dataset.release);
        if (rr.ok) { state.contracts = rr.list; renderList(); msg('Marked released.', true); }
        else msg(rr.error, false);
      } else if (b.dataset.remove) {
        var dr = removeContract(state.contracts, b.dataset.remove);
        if (dr.ok) { state.contracts = dr.list; renderList(); msg('Contract removed.', true); }
      }
    });

    $('r-save').addEventListener('click', persist);
    renderList();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
