/* ============================================================
   Sales Target Tracker — pure computation layer.
   Row: {id, name, target, achieved}
   Month: {days (total), elapsed}
   % complete = achieved/target*100
   gap = target - achieved
   run-rate = achieved/elapsed ; projected = run-rate*days
   alert if pct < 70
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function validateRow(r) {
  if (!r || !String(r.name || '').trim()) return 'Salesperson ka naam required hai.';
  if (!(Number(r.target) > 0)) return 'Target 0 se zyada hona chahiye.';
  if (!(Number(r.achieved) >= 0)) return 'Achieved 0 ya usse zyada hona chahiye.';
  return '';
}

function validateMonth(m) {
  if (!(Number(m.days) >= 1 && Number(m.days) <= 31)) return 'Days in month 1–31 hone chahiye.';
  if (!(Number(m.elapsed) >= 1 && Number(m.elapsed) <= Number(m.days))) return 'Days elapsed 1 se days-in-month tak hona chahiye.';
  return '';
}

/** One row's metrics: {pct, gap, runRate, projected, alert}. */
function rowMetrics(row, month) {
  var target = Number(row.target) || 0, achieved = Number(row.achieved) || 0;
  var pct = target > 0 ? round2((achieved / target) * 100) : 0;
  var gap = round2(target - achieved);
  var runRate = month.elapsed > 0 ? round2(achieved / month.elapsed) : 0;
  var projected = round2(runRate * month.days);
  return { pct: pct, gap: gap, runRate: runRate, projected: projected, alert: pct < 70 };
}

function teamAgg(rows, month) {
  var t = { target: 0, achieved: 0, gap: 0, projected: 0, alerts: 0 };
  rows.forEach(function (r) {
    var m = rowMetrics(r, month);
    t.target = round2(t.target + Number(r.target));
    t.achieved = round2(t.achieved + Number(r.achieved));
    t.gap = round2(t.gap + m.gap);
    t.projected = round2(t.projected + m.projected);
    if (m.alert) t.alerts++;
  });
  t.pct = t.target > 0 ? round2((t.achieved / t.target) * 100) : 0;
  return t;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function stInit() {
  var SLUG = 'sales-target-tracker';
  var REPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var rows = [];
  var month = { days: 30, elapsed: 15, label: '' };

  function el(id) { return document.getElementById(id); }

  function defaultMonth() {
    var d = new Date();
    var days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    return { days: days, elapsed: Math.min(d.getDate(), days), label: label };
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: '% complete aur gap kya hote hain?',
      a: '% complete = (achieved ÷ target) × 100 — target ka kitna hissa poora ho gaya. Gap = target − achieved — target poora karne ke liye abhi kitna aur chahiye.' },
    { q: 'Month-end projection kaise nikalti hai?',
      a: 'Run-rate = achieved ÷ days elapsed (roz ka average). Projected = run-rate × days in month — agar isi speed se chale to month-end tak kitna hoga.' },
    { q: '<70% alert ka matlab kya hai?',
      a: 'Agar koi salesperson 70% se kam complete hai to us par ⚠️ Off-track alert lagta hai — manager turant dekh sakta hai kisko push karna hai.' },
    { q: 'सेल्स टार्गेट ट्रैकिंग क्यों ज़रूरी है?',
      a: 'Month-end par surprise se bachne ke liye beech me track karna zaroori hai. Projection se pehle hi pata chal jaata hai target miss hone wala hai ya nahi.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Sales Target Tracker — सेल्स टार्गेट',
    description: 'Free sales target tracker for Indian SMEs: monthly targets per salesperson vs achieved, % complete, gap, month-end projection at current run-rate, <70% alerts.',
    keywords: ['sales target tracker', 'सेल्स टार्गेट', 'sales target vs achievement India', 'monthly sales target', 'salesperson target', 'run rate projection', 'सेल्स टारगेट कैलकुलेटर']
  });

  el('passSetBtn').addEventListener('click', async function () {
    var msg = el('passMsg');
    try {
      await Vault.setPassphrase(el('passInput').value);
      msg.textContent = '✓ Vault encrypted for this session. Naye saves encrypted honge.';
      el('passInput').value = '';
    } catch (e) {
      msg.textContent = 'Encryption unavailable (' + e.message + ') — data unencrypted save hoga.';
    }
  });
  el('passClearBtn').addEventListener('click', function () {
    Vault.clearPassphrase();
    el('passMsg').textContent = 'Vault locked. Encrypted records padhne ke liye passphrase dobara set karein.';
  });

  function persist() {
    return Vault.save(SLUG, 'data', { rows: rows, month: month }).catch(function () {});
  }

  function readMonthFromInputs() {
    var m = {
      days: parseInt(el('m-days').value, 10),
      elapsed: parseInt(el('m-elapsed').value, 10),
      label: el('m-label').value.trim()
    };
    if (!validateMonth(m)) month = m;
  }

  function addSales() {
    var err = el('s-error'); err.textContent = '';
    var r = {
      id: uid('s'),
      name: el('s-name').value.trim(),
      target: parseFloat(el('s-target').value) || 0,
      achieved: parseFloat(el('s-achieved').value) || 0
    };
    var verr = validateRow(r);
    if (verr) { err.textContent = verr; return; }
    rows.push(r);
    el('s-name').value = ''; el('s-target').value = ''; el('s-achieved').value = '';
    persist().then(render);
  }

  function delRow(id) {
    if (!window.confirm('Remove this salesperson?')) return;
    rows = rows.filter(function (r) { return r.id !== id; });
    persist().then(render);
  }

  function editAchieved(id, val) {
    var r = rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var v = parseFloat(val);
    if (!(v >= 0)) return;
    r.achieved = v;
    persist().then(render);
  }

  function render() {
    el('monthTitle').textContent = month.label || ('Month · ' + month.days + ' days, ' + month.elapsed + ' elapsed');
    if (!rows.length) {
      el('salesBody').innerHTML = '<tr><td colspan="8" class="vq-hint">Koi salesperson nahi hai — upar form se add karein.</td></tr>';
      el('salesFoot').innerHTML = '';
      return;
    }
    el('salesBody').innerHTML = rows.map(function (r) {
      var m = rowMetrics(r, month);
      var cls = m.alert ? 'p-warn' : (m.pct >= 100 ? 'p-good' : 'p-mid');
      var bar = '<div class="progress' + (m.alert ? ' low' : '') + '"><span style="width:' +
        Math.min(100, m.pct) + '%"></span></div>';
      return '<tr>' +
        '<td><strong>' + esc(r.name) + '</strong>' +
        (m.alert ? ' <span class="pill p-warn">⚠️ Off-track</span>' : '') + '</td>' +
        '<td class="r">' + inr(r.target) + '</td>' +
        '<td class="r"><input type="number" min="0" step="0.01" inputmode="decimal" value="' + r.achieved +
        '" data-ach="' + r.id + '" style="width:110px;text-align:right"></td>' +
        '<td>' + bar + '</td>' +
        '<td class="r"><span class="pill ' + cls + '">' + m.pct + '%</span></td>' +
        '<td class="r">' + inr(m.gap) + '</td>' +
        '<td class="r">' + inr(m.projected) + '</td>' +
        '<td class="row-actions no-print"><button class="vq-btn ghost mini" data-del="' + r.id + '" type="button">Remove</button></td></tr>';
    }).join('');
    el('salesBody').querySelectorAll('[data-ach]').forEach(function (inp) {
      inp.addEventListener('change', function () { editAchieved(inp.getAttribute('data-ach'), inp.value); });
    });
    el('salesBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delRow(b.getAttribute('data-del')); });
    });

    var t = teamAgg(rows, month);
    el('salesFoot').innerHTML = '<tr style="font-weight:800;border-top:2px solid var(--line)">' +
      '<td>Team total' + (t.alerts ? ' <span class="pill p-warn">' + t.alerts + ' off-track</span>' : '') + '</td>' +
      '<td class="r">' + inr(t.target) + '</td>' +
      '<td class="r">' + inr(t.achieved) + '</td>' +
      '<td></td>' +
      '<td class="r">' + t.pct + '%</td>' +
      '<td class="r">' + inr(t.gap) + '</td>' +
      '<td class="r">' + inr(t.projected) + '</td>' +
      '<td class="no-print"></td></tr>';
  }

  async function gatedSave(limit, data) {
    el('st-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, limit);
    if (!gate.allowed) { Freemium.renderUpsell(el('st-upsell'), SLUG, limit); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, data);
      el('st-saved').textContent = 'Saved ✓ (' + Freemium.remaining(SLUG, limit) + ' left today)';
    } catch (e) { el('s-error').textContent = 'Save failed: ' + e.message; }
  }

  function currentReport() {
    return {
      type: 'team-report', savedAt: new Date().toISOString(), month: month,
      rows: rows.map(function (r) {
        var m = rowMetrics(r, month);
        return { name: r.name, target: r.target, achieved: r.achieved,
                 pct: m.pct, gap: m.gap, projected: m.projected, alert: m.alert };
      }),
      team: teamAgg(rows, month)
    };
  }

  el('addSalesBtn').addEventListener('click', addSales);
  el('m-days').addEventListener('change', function () { readMonthFromInputs(); render(); persist(); });
  el('m-elapsed').addEventListener('change', function () { readMonthFromInputs(); render(); persist(); });
  el('m-label').addEventListener('change', function () { readMonthFromInputs(); render(); persist(); });
  el('saveReportBtn').addEventListener('click', function () { gatedSave(REPORT_LIMIT, currentReport()); });
  el('saveBtn').addEventListener('click', function () {
    gatedSave(SAVE_LIMIT, { type: 'snapshot', savedAt: new Date().toISOString(), rows: rows, month: month });
  });
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.rows)) rows = d.rows;
    if (d && d.month && !validateMonth(d.month)) month = d.month;
    var dm = defaultMonth();
    el('m-days').value = month.days || dm.days;
    el('m-elapsed').value = month.elapsed || dm.elapsed;
    el('m-label').value = month.label || dm.label;
    readMonthFromInputs();
    render();
  }).catch(function () {
    var dm = defaultMonth();
    month = dm;
    el('m-days').value = dm.days; el('m-elapsed').value = dm.elapsed; el('m-label').value = dm.label;
    render();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stInit);
  } else { stInit(); }
}
