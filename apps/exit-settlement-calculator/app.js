/* ============================================================
   VisionQuantech Business Suite — Exit Settlement Calculator
   apps/exit-settlement-calculator/app.js

   Pure functions first (no DOM) — tested under node.
   Full & final:
     net = unpaidSalary + leaveEncashment + gratuity + bonus
           + noticePay - advances - tds - otherDeductions
   Assumptions (stated on-screen):
   - unpaid salary = (Basic / divisor) x days; divisor 26 or 30
   - leave encashment = (Basic / 26) x unused EL days
   - gratuity auto = (15/26) x Basic x billable years, cap Rs 20L
   Vault writes are ENCRYPTED ONLY (passphrase required).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_AMT = 100000000;
  var MAX_NAME = 120;
  var MAX_SAVED = 25;
  var GRATUITY_CAP = 2000000;

  function sanitizeName(name) {
    if (typeof name !== 'string') return { ok: false, error: 'Enter a valid employee name.' };
    var t = name.trim().replace(/\s+/g, ' ');
    if (!t) return { ok: false, error: 'Employee name cannot be empty.' };
    if (t.length > MAX_NAME) return { ok: false, error: 'Name too long (max ' + MAX_NAME + ' characters).' };
    return { ok: true, value: t };
  }

  function money(v, label, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter a valid amount for ' + label + '.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: label + ' must be greater than zero.' };
    if (n > MAX_AMT) return { ok: false, error: label + ' looks too large.' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  function daysCount(v, label, max) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: 'Enter valid ' + label + '.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (n > max) return { ok: false, error: label + ' looks too large (max ' + max + ').' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  function isValidDateStr(s) {
    if (!s) return true; // optional field
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function unpaidSalary(basic, days, divisor) {
    var b = money(basic, 'Basic salary', true);
    if (!b.ok) return b;
    var d = daysCount(days, 'unpaid salary days', 31);
    if (!d.ok) return d;
    if (divisor !== 26 && divisor !== 30) return { ok: false, error: 'Divisor must be 26 or 30.' };
    return { ok: true, value: Math.round((b.value / divisor) * d.value * 100) / 100 };
  }

  function leaveEncashment(basic, elDays) {
    var b = money(basic, 'Basic salary', true);
    if (!b.ok) return b;
    var d = daysCount(elDays, 'unused EL days', 365);
    if (!d.ok) return d;
    return { ok: true, value: Math.round((b.value / 26) * d.value * 100) / 100 };
  }

  function gratuityAuto(basic, years, months) {
    var b = money(basic, 'Basic salary', true);
    if (!b.ok) return b;
    var y = Number(years), m = Number(months);
    if (!isFinite(y) || Math.floor(y) !== y || y < 0 || y > 60) return { ok: false, error: 'Gratuity years must be 0–60.' };
    if (!isFinite(m) || Math.floor(m) !== m || m < 0 || m > 11) return { ok: false, error: 'Gratuity months must be 0–11.' };
    var billable = y + (m > 6 ? 1 : 0);
    if (billable < 5) return { ok: true, value: 0, billable: billable, capped: false };
    var raw = (b.value * 15 * billable) / 26;
    var capped = raw > GRATUITY_CAP;
    return { ok: true, value: Math.round((capped ? GRATUITY_CAP : raw) * 100) / 100, billable: billable, capped: capped };
  }

  /**
   * Full settlement. inputs: {name, exitDate, basic, unpaidDays, divisor,
   * elDays, gratYears, gratMonths, gratManual, bonus, notice, advances, tds, other}
   */
  function settle(inp) {
    var nm = sanitizeName(inp.name);
    if (!nm.ok) return { ok: false, error: nm.error };
    if (!isValidDateStr(inp.exitDate)) return { ok: false, error: 'Pick a valid last working day.' };
    var basic = money(inp.basic, 'Basic + DA', false);
    if (!basic.ok) return { ok: false, error: basic.error };
    var up = unpaidSalary(basic.value, inp.unpaidDays, Number(inp.divisor));
    if (!up.ok) return { ok: false, error: up.error };
    var enc = leaveEncashment(basic.value, inp.elDays);
    if (!enc.ok) return { ok: false, error: enc.error };
    var grat;
    if (inp.gratManual !== '' && inp.gratManual != null) {
      var gm = money(inp.gratManual, 'gratuity override', true);
      if (!gm.ok) return { ok: false, error: gm.error };
      if (gm.value > GRATUITY_CAP) return { ok: false, error: 'Gratuity override cannot exceed the ₹20,00,000 statutory cap.' };
      grat = { value: gm.value, manual: true };
    } else {
      var ga = gratuityAuto(basic.value, inp.gratYears, inp.gratMonths);
      if (!ga.ok) return { ok: false, error: ga.error };
      grat = { value: ga.value, manual: false, billable: ga.billable, capped: ga.capped };
    }
    var bonus = money(inp.bonus, 'bonus', true); if (!bonus.ok) return { ok: false, error: bonus.error };
    var notice = money(inp.notice, 'notice pay', true); if (!notice.ok) return { ok: false, error: notice.error };
    var adv = money(inp.advances, 'advances', true); if (!adv.ok) return { ok: false, error: adv.error };
    var tds = money(inp.tds, 'TDS', true); if (!tds.ok) return { ok: false, error: tds.error };
    var oth = money(inp.other, 'other deductions', true); if (!oth.ok) return { ok: false, error: oth.error };

    var earnings = up.value + enc.value + grat.value + bonus.value + notice.value;
    var deductions = adv.value + tds.value + oth.value;
    var net = Math.round((earnings - deductions) * 100) / 100;

    return {
      ok: true,
      name: nm.value, exitDate: inp.exitDate || '',
      lines: [
        { label: 'Unpaid salary (' + inp.unpaidDays + ' day(s) ÷ ' + inp.divisor + ')', amount: up.value, kind: 'earn' },
        { label: 'Leave encashment (' + inp.elDays + ' EL day(s) × Basic ÷ 26)', amount: enc.value, kind: 'earn' },
        { label: 'Gratuity' + (grat.manual ? ' (manual)' : ' (' + grat.billable + ' yr(s), 15/26)' + (grat.capped ? ' — capped ₹20L' : '')), amount: grat.value, kind: 'earn' },
        { label: 'Bonus', amount: bonus.value, kind: 'earn' },
        { label: 'Notice pay', amount: notice.value, kind: 'earn' },
        { label: 'Less: advances / loans', amount: -adv.value, kind: 'ded' },
        { label: 'Less: TDS', amount: -tds.value, kind: 'ded' },
        { label: 'Less: other deductions', amount: -oth.value, kind: 'ded' }
      ],
      earnings: Math.round(earnings * 100) / 100,
      deductions: Math.round(deductions * 100) / 100,
      net: net
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
    GRATUITY_CAP: GRATUITY_CAP, MAX_SAVED: MAX_SAVED,
    sanitizeName: sanitizeName, money: money, daysCount: daysCount,
    unpaidSalary: unpaidSalary, leaveEncashment: leaveEncashment,
    gratuityAuto: gratuityAuto, settle: settle,
    fmtINR: fmtINR, esc: esc, isValidDateStr: isValidDateStr
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'exit-settlement-calculator';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('ex-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok ? 'msg-ok' : 'msg-err');
  }
  function vaultReady() {
    if (Vault.hasPassphrase()) return true;
    msg('Set a passphrase above first — statements are never saved unencrypted.', false);
    return false;
  }

  var lastResult = null;
  var saved = [];

  function readInputs() {
    return {
      name: $('ex-name').value, exitDate: $('ex-exitdate').value,
      basic: $('ex-basic').value, unpaidDays: $('ex-unpaid-days').value,
      divisor: $('ex-divisor').value, elDays: $('ex-el-days').value,
      gratYears: $('ex-grat-yrs').value, gratMonths: $('ex-grat-mths').value,
      gratManual: $('ex-grat-manual').value, bonus: $('ex-bonus').value,
      notice: $('ex-notice').value, advances: $('ex-advances').value,
      tds: $('ex-tds').value, other: $('ex-other').value
    };
  }

  function fmtDate(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function renderResult(r) {
    $('ex-result-card').hidden = false;
    var rows = r.lines.map(function (l) {
      return '<tr><td>' + esc(l.label) + '</td><td class="num" style="text-align:right">' + fmtINR(l.amount) + '</td></tr>';
    }).join('');
    $('ex-result').innerHTML =
      '<p class="vq-hint">Employee: <strong>' + esc(r.name) + '</strong> · Last working day: ' + esc(fmtDate(r.exitDate)) + '</p>' +
      '<div class="vq-table-wrap"><table class="vq-table"><tbody>' + rows +
      '<tr><td><strong>Total earnings</strong></td><td style="text-align:right"><strong>' + fmtINR(r.earnings) + '</strong></td></tr>' +
      '<tr><td><strong>Total deductions</strong></td><td style="text-align:right"><strong>' + fmtINR(r.deductions) + '</strong></td></tr>' +
      '</tbody></table></div>' +
      '<p>Net payable to employee: <span class="big">' + fmtINR(r.net) + '</span></p>' +
      (r.net < 0 ? '<p class="msg-err">Net is negative — the employee owes the company ' + fmtINR(-r.net) + '. Recover before relieving.</p>' : '') +
      '<p class="vq-hint">Estimate only — confirm tax/TDS treatment with your CA.</p>';
    $('ex-result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSaved() {
    var w = $('ex-saved');
    var list = saved.slice().sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
    w.innerHTML = list.length ? list.map(function (s) {
      return '<div class="row"><span><strong>' + esc(s.name) + '</strong> · ' + esc(fmtDate(s.exitDate)) +
        ' · net <strong>' + fmtINR(s.net) + '</strong><br><span class="vq-hint">' + esc(s.savedAt.slice(0, 10)) + '</span></span>' +
        '<span><button type="button" class="vq-btn btn-sm" data-view="' + esc(s.id) + '">View</button> ' +
        '<button type="button" class="vq-btn btn-sm" data-del="' + esc(s.id) + '">Delete</button></span></div>';
    }).join('') : '<p class="vq-hint">No saved statements.</p>';
    w.querySelectorAll('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = saved.filter(function (x) { return x.id === b.getAttribute('data-view'); })[0];
        if (s) { lastResult = s; renderResult(s); }
      });
    });
    w.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!vaultReady()) return;
        saved = saved.filter(function (x) { return x.id !== b.getAttribute('data-del'); });
        try { await Vault.save(SLUG, 'statements', saved); renderSaved(); msg('Statement deleted.', true); }
        catch (err) { msg('Could not save: ' + err.message, false); }
      });
    });
  }

  async function init() {
    Ads.render($('ad-top'), 'exit-settlement-calculator-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'exit-settlement-calculator-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What goes into a full & final settlement?', a: 'Unpaid salary for days worked, leave encashment for unused earned leave, gratuity (if eligible), pro-rata bonus, notice pay — minus advances/loans, TDS and other deductions.' },
      { q: 'फुल एंड फाइनल सेटलमेंट में क्या-क्या आता है?', a: 'बकाया वेतन, बिना ली छुट्टियों का नकदीकरण, ग्रेच्युटी, बोनस, नोटिस वेतन — इनमें से एडवांस, TDS और अन्य कटौतियाँ घटाकर शुद्ध देय राशि निकलती है।' },
      { q: 'How is leave encashment calculated?', a: 'There is no single statutory formula for all establishments; this calculator uses the common convention (Basic ÷ 26) × unused earned-leave days and states it on-screen.' },
      { q: 'Is leave encashment taxable?', a: 'Yes, generally — leave encashment on resignation/termination is taxable, and gratuity above ₹20 lakh is taxable. Confirm TDS with your CA.' },
      { q: 'Is my data private?', a: 'Yes — nothing leaves your device. Saving is locked until you set a passphrase; statements are then stored encrypted (AES-256-GCM) in this browser only.' }
    ]);

    $('pp-set').addEventListener('click', async function () {
      var st = $('pp-status');
      try {
        await Vault.setPassphrase($('pp-input').value);
        $('pp-input').value = '';
        st.textContent = 'Encryption ON — statements are stored encrypted on this device only.';
        st.className = 'vq-hint pp-on';
        await loadAll();
      } catch (err) {
        st.textContent = 'Could not enable encryption: ' + err.message + ' Saving stays disabled — statements are never written unencrypted.';
        st.className = 'vq-hint msg-err';
      }
    });

    $('ex-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('ex-gate'), SLUG, FREE_LIMIT); $('ex-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = settle(readInputs());
      if (!r.ok) { msg(r.error, false); $('ex-result-card').hidden = true; lastResult = null; return; }
      lastResult = r;
      msg('', true);
      renderResult(r);
    });

    $('ex-print').addEventListener('click', function () { window.print(); });

    $('ex-save').addEventListener('click', async function () {
      if (!lastResult) { msg('Calculate the settlement first.', false); return; }
      if (!vaultReady()) return;
      if (saved.length >= MAX_SAVED) { msg('Saved statements are full (' + MAX_SAVED + '). Delete an old one first.', false); return; }
      var rec = Object.assign({ id: 'ex-' + Date.now().toString(36), savedAt: new Date().toISOString() }, lastResult);
      saved.push(rec);
      try { await Vault.save(SLUG, 'statements', saved); renderSaved(); msg('Statement saved (encrypted).', true); }
      catch (err) { msg('Could not save: ' + err.message, false); }
    });

    await loadAll();
  }

  async function loadAll() {
    try {
      var s = await Vault.load(SLUG, 'statements');
      saved = Array.isArray(s) ? s : [];
    } catch (err) { saved = []; }
    renderSaved();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
