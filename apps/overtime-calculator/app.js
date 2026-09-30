/* ============================================================
   VisionQuantech Business Suite — Overtime Calculator
   apps/overtime-calculator/app.js

   Pure functions first (no DOM) — tested under node.
   OT pay = hours x hourly rate x multiplier. Hourly rate from
   monthly salary = salary / 208 (26 days x 8 hrs — stated
   assumption). Statutory minimum multiplier is 2x (Factories
   Act 1948 s.59; state Shops & Establishments Acts).
   Vault writes are ENCRYPTED ONLY (passphrase required).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_SALARY = 100000000;   // 10 crore / month — sanity cap
  var MAX_HOURLY = 1000000;
  var MAX_HOURS = 744;          // 31 days x 24 hrs — sanity cap
  var MAX_ENTRIES = 25;
  var MAX_NAME = 120;
  var MULTIPLIERS = [1, 1.5, 2];

  function sanitizeName(name) {
    if (typeof name !== 'string') return { ok: false, error: 'Enter a valid name.' };
    var t = name.trim().replace(/\s+/g, ' ');
    if (!t) return { ok: false, error: 'Employee name cannot be empty.' };
    if (t.length > MAX_NAME) return { ok: false, error: 'Name too long (max ' + MAX_NAME + ' characters).' };
    return { ok: true, value: t };
  }

  /** Monthly salary -> hourly rate. Assumption: 26 working days x 8 hours. */
  function hourlyFromSalary(salary) {
    var n = Number(salary);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid monthly salary.' };
    if (n <= 0) return { ok: false, error: 'Monthly salary must be greater than zero.' };
    if (n > MAX_SALARY) return { ok: false, error: 'Monthly salary looks too large (max ₹' + MAX_SALARY.toLocaleString('en-IN') + ').' };
    return { ok: true, value: Math.round((n / 208) * 100) / 100 };
  }

  function validateHourly(h) {
    var n = Number(h);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid hourly rate.' };
    if (n <= 0) return { ok: false, error: 'Hourly rate must be greater than zero.' };
    if (n > MAX_HOURLY) return { ok: false, error: 'Hourly rate looks too large.' };
    return { ok: true, value: n };
  }

  function validateHours(h) {
    var n = Number(h);
    if (!isFinite(n)) return { ok: false, error: 'Enter valid overtime hours.' };
    if (n <= 0) return { ok: false, error: 'Overtime hours must be greater than zero.' };
    if (n > MAX_HOURS) return { ok: false, error: 'Overtime hours look too large (max ' + MAX_HOURS + ').' };
    return { ok: true, value: n };
  }

  function validateMultiplier(m) {
    var n = Number(m);
    if (MULTIPLIERS.indexOf(n) < 0) return { ok: false, error: 'Multiplier must be 1, 1.5 or 2.' };
    return { ok: true, value: n };
  }

  function isValidMonthStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false;
    var m = +s.split('-')[1];
    return m >= 1 && m <= 12;
  }

  /** OT pay = hours x hourly x multiplier (rounded to paise). */
  function otPay(hours, hourly, multiplier) {
    var h = validateHours(hours), r = validateHourly(hourly), m = validateMultiplier(multiplier);
    if (!h.ok) return h;
    if (!r.ok) return r;
    if (!m.ok) return m;
    return { ok: true, value: Math.round(h.value * r.value * m.value * 100) / 100 };
  }

  /**
   * Add an OT entry. Either monthlySalary or hourlyRate must be given.
   * entry: {name, month, salary?, hourly?, hours, multiplier, category}
   */
  function addEntry(entries, entry) {
    var n = sanitizeName(entry.name);
    if (!n.ok) return { ok: false, error: n.error };
    if (!isValidMonthStr(entry.month)) return { ok: false, error: 'Pick a valid month.' };
    var hourly;
    if (entry.hourly !== '' && entry.hourly != null) {
      var vh = validateHourly(entry.hourly);
      if (!vh.ok) return { ok: false, error: vh.error };
      hourly = vh.value;
    } else {
      var sh = hourlyFromSalary(entry.salary);
      if (!sh.ok) return { ok: false, error: 'Enter a monthly salary or an hourly rate. ' + sh.error };
      hourly = sh.value;
    }
    var pay = otPay(entry.hours, hourly, entry.multiplier);
    if (!pay.ok) return { ok: false, error: pay.error };
    entries = Array.isArray(entries) ? entries : [];
    if (entries.length >= MAX_ENTRIES) {
      return { ok: false, error: 'Saved entries are full (' + MAX_ENTRIES + '). Delete an old entry first.' };
    }
    var rec = {
      id: 'ot-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      name: n.value, month: entry.month,
      salary: entry.salary === '' ? null : Number(entry.salary),
      hourly: Math.round(hourly * 100) / 100,
      hours: Number(entry.hours), multiplier: Number(entry.multiplier),
      category: String(entry.category || 'factory'), pay: pay.value,
      createdAt: new Date().toISOString()
    };
    entries.push(rec);
    return { ok: true, entry: rec, entries: entries };
  }

  /** Monthly totals: per-employee hours+pay and grand total. */
  function monthTotals(entries, month) {
    var per = {}, grand = 0, totalHours = 0;
    (Array.isArray(entries) ? entries : []).forEach(function (e) {
      if (e.month !== month) return;
      if (!per[e.name]) per[e.name] = { name: e.name, hours: 0, pay: 0 };
      per[e.name].hours = Math.round((per[e.name].hours + e.hours) * 100) / 100;
      per[e.name].pay = Math.round((per[e.name].pay + e.pay) * 100) / 100;
      grand = Math.round((grand + e.pay) * 100) / 100;
      totalHours = Math.round((totalHours + e.hours) * 100) / 100;
    });
    var rows = Object.keys(per).sort().map(function (k) { return per[k]; });
    return { rows: rows, grand: grand, totalHours: totalHours };
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
    hourlyFromSalary: hourlyFromSalary, otPay: otPay,
    validateHours: validateHours, validateHourly: validateHourly,
    validateMultiplier: validateMultiplier, sanitizeName: sanitizeName,
    addEntry: addEntry, monthTotals: monthTotals,
    isValidMonthStr: isValidMonthStr, fmtINR: fmtINR, esc: esc,
    MAX_ENTRIES: MAX_ENTRIES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'overtime-calculator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function monthStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function msg(t, ok) {
    var el = $('ot-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }
  function vaultReady() {
    if (Vault.hasPassphrase()) return true;
    msg('Set a passphrase above first — OT entries are never saved unencrypted.', false);
    return false;
  }

  var entries = [];

  var GUIDE = {
    factory: 'Factory: overtime beyond 9 hrs/day or 48 hrs/week is payable at 2× the ordinary rate (Factories Act §59). Using less than 2× here may be non-compliant.',
    shops: 'Shops/establishments: most state Shops Acts (Maharashtra, Karnataka, Delhi) mandate 2× the ordinary rate for overtime. Check your state\'s hour caps.',
    other: 'Contractual/policy overtime: use the multiplier from the contract or standing order. The statutory floor remains 2× where the Acts trigger.'
  };

  function renderGuide() {
    $('ot-guide').textContent = GUIDE[$('ot-category').value] || '';
  }

  function renderSummary() {
    var m = $('ot-view-month').value || monthStr();
    var t = monthTotals(entries, m);
    $('ot-summary').innerHTML = '<thead><tr><th>Employee</th><th>OT hours</th><th>OT pay</th></tr></thead><tbody>' +
      (t.rows.length ? t.rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + r.hours + '</td><td><strong>' + fmtINR(r.pay) + '</strong></td></tr>';
      }).join('') : '<tr><td colspan="3" class="vq-hint">No entries for this month.</td></tr>') + '</tbody>';
    $('ot-grand').textContent = fmtINR(t.grand);

    var list = entries.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    $('ot-list').innerHTML = list.length ? list.map(function (e) {
      return '<div class="row"><span><strong>' + esc(e.name) + '</strong> · ' + esc(e.month) +
        ' · ' + e.hours + 'h × ' + fmtINR(e.hourly) + ' × ' + e.multiplier +
        ' = <strong>' + fmtINR(e.pay) + '</strong></span>' +
        '<button type="button" class="vq-btn btn-sm" data-del="' + esc(e.id) + '">Delete</button></div>';
    }).join('') : '<p class="vq-hint">No saved entries.</p>';
    $('ot-list').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!vaultReady()) return;
        entries = entries.filter(function (e) { return e.id !== b.getAttribute('data-del'); });
        try { await Vault.save(SLUG, 'entries', entries); renderSummary(); msg('Entry deleted.', true); }
        catch (err) { msg('Could not save: ' + err.message, false); }
      });
    });
  }

  async function init() {
    Ads.render($('ad-top'), 'overtime-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'overtime-calculator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the legal overtime rate in India?', a: 'Under the Factories Act 1948 (§59) and most state Shops & Establishments Acts, overtime beyond the statutory daily/weekly limits must be paid at twice the ordinary rate of wages.' },
      { q: 'भारत में ओवरटाइम की दर क्या है?', a: 'फ़ैक्टरीज़ एक्ट 1948 (धारा 59) और अधिकांश राज्यों के Shops Acts के तहत तय सीमा से ज़्यादा काम पर सामान्य मज़दूरी की दोगुनी दर से ओवरटाइम मिलता है।' },
      { q: 'How is the hourly rate derived from monthly salary?', a: 'Monthly salary ÷ 208 (26 working days × 8 hours). This is a common payroll convention, not a statutory formula — enter your own hourly rate if your company uses a different divisor.' },
      { q: 'When would I use 1.5× or 1×?', a: 'Only where a contract, certified standing order or company policy sets a different rate for overtime not triggered by the statutory limits — the statutory minimum stays 2×.' },
      { q: 'Is my data private?', a: 'Yes — nothing leaves your device. Saving is locked until you set a passphrase; entries are then stored encrypted (AES-256-GCM) in this browser only.' }
    ]);

    $('ot-month').value = monthStr();
    $('ot-view-month').value = monthStr();
    renderGuide();
    $('ot-category').addEventListener('change', renderGuide);

    $('pp-set').addEventListener('click', async function () {
      var st = $('pp-status');
      try {
        await Vault.setPassphrase($('pp-input').value);
        $('pp-input').value = '';
        st.textContent = 'Encryption ON — OT entries are stored encrypted on this device only.';
        st.className = 'vq-hint pp-on';
        await loadAll();
      } catch (err) {
        st.textContent = 'Could not enable encryption: ' + err.message + ' Saving stays disabled — entries are never written unencrypted.';
        st.className = 'vq-hint msg-err';
      }
    });

    $('ot-add').addEventListener('click', async function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('ot-gate'), SLUG, FREE_LIMIT); $('ot-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      if (!vaultReady()) return;
      var r = addEntry(entries, {
        name: $('ot-ename').value, month: $('ot-month').value,
        salary: $('ot-salary').value, hourly: $('ot-hourly').value,
        hours: $('ot-hours').value, multiplier: $('ot-mult').value,
        category: $('ot-category').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      entries = r.entries;
      try {
        await Vault.save(SLUG, 'entries', entries);
        $('ot-ename').value = ''; $('ot-salary').value = ''; $('ot-hourly').value = ''; $('ot-hours').value = '';
        $('ot-view-month').value = r.entry.month;
        renderSummary();
        msg('Entry saved: ' + fmtINR(r.entry.pay) + ' OT pay (' + r.entry.hours + 'h × ' + fmtINR(r.entry.hourly) + ' × ' + r.entry.multiplier + ').', true);
      } catch (err) { msg('Could not save: ' + err.message, false); }
    });

    $('ot-view-month').addEventListener('change', renderSummary);
    await loadAll();
  }

  async function loadAll() {
    try {
      var e = await Vault.load(SLUG, 'entries');
      entries = Array.isArray(e) ? e : [];
    } catch (err) { entries = []; }
    renderSummary();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
