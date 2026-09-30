/* ============================================================
   GST Due Date & Penalty Monitor — pure computation layer.
   Due dates (verified Sep 2026):
   - GSTR-1: monthly -> 11th of next month; QRMP -> 13th of month
     after the quarter.
   - GSTR-3B: monthly -> 20th of next month; QRMP -> 22nd (Group A
     states) / 24th (Group B states) of month after the quarter.
   - PMT-06 (QRMP monthly tax payment): 25th of next month.
   - CMP-08 (composition quarterly): 18th of month after quarter.
   - GSTR-4 (composition annual): 30th April following FY.
   - GSTR-9 / GSTR-9C: 31st December following the FY.
   Late fee estimate reuses Sec 47: Rs 50/day, capped by turnover
   (nil Rs 20/day capped Rs 500). QRMP allowed up to Rs 5cr turnover.
   DOM-free; unit-testable in node.
   ============================================================ */

function ddPad(n) { return String(n).padStart(2, '0'); }
function isoOf(y, m, d) { return y + '-' + ddPad(m) + '-' + ddPad(d); }

/** Whole days from `today` until `dueISO` (negative = overdue). */
function daysUntil(dueISO, todayISO) {
  var due = new Date(dueISO.slice(0, 10) + 'T00:00:00');
  var t = new Date(todayISO.slice(0, 10) + 'T00:00:00');
  if (isNaN(due.getTime()) || isNaN(t.getTime())) return NaN;
  return Math.round((due - t) / 86400000);
}

/** FY quarter for a month: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar. */
function quarterOf(year, month) {
  var q, fyStart;
  if (month >= 4 && month <= 6) { q = 1; fyStart = year; }
  else if (month >= 7 && month <= 9) { q = 2; fyStart = year; }
  else if (month >= 10 && month <= 12) { q = 3; fyStart = year; }
  else { q = 4; fyStart = year - 1; }
  var sm = [4, 7, 10, 1][q - 1], em = [6, 9, 12, 3][q - 1];
  return { year: year, fyStart: fyStart, quarter: q,
           startMonth: sm, endMonth: em, startYear: year, endYear: year };
}
function quarterLabel(q) {
  return 'Q' + q.quarter + ' FY ' + String(q.fyStart).slice(2) + '-' +
    String(q.fyStart + 1).slice(2);
}
/** The FY quarter immediately before / after q. */
function prevQuarter(q) {
  if (q.quarter === 1) return quarterOf(q.startYear, 1);      // Q1 -> Q4 of prev FY (Jan-Mar)
  if (q.quarter === 4) return quarterOf(q.startYear - 1, 10); // Q4 -> Q3 of same FY (Oct-Dec)
  return quarterOf(q.startYear, q.startMonth - 3);
}
function nextQuarter(q) {
  if (q.quarter === 4) return quarterOf(q.endYear, 4); // Q4 -> Q1 of next FY (Apr-Jun)
  return quarterOf(q.startYear, q.endMonth + 1);
}
function prevMonth(y, m) { return m === 1 ? { y: y - 1, m: 12 } : { y: y, m: m - 1 }; }
function monthLabel(year, month) {
  var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[month - 1] + ' ' + year;
}

/** GST state code -> QRMP GSTR-3B group: 'A' (22nd) or 'B' (24th). */
var QRMP_GROUP_A = ['22', '23', '24', '25', '26', '27', '29', '30',
                    '31', '32', '33', '34', '35', '36', '37'];
function qrmpGroupForState(stateCode) {
  return QRMP_GROUP_A.indexOf(String(stateCode)) >= 0 ? 'A' : 'B';
}

/** Basic GSTIN shape check (15 chars). */
function validGSTIN(gstin) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i
    .test(String(gstin || '').trim());
}

/**
 * Late fee estimate if a return were filed `todayISO`:
 * days overdue x Rs 50/day, capped by turnover slab (nil variant
 * available via isNil).
 */
function estimateLateFee(dueISO, todayISO, turnover, isNil) {
  var overdue = -daysUntil(dueISO, todayISO);
  if (!(overdue > 0)) return 0;
  var perDay = isNil ? 20 : 50;
  var cap;
  if (isNil) cap = 500;
  else if (turnover > 50000000) cap = 10000;
  else if (turnover > 15000000) cap = 5000;
  else cap = 2000;
  return Math.min(overdue * perDay, cap);
}

/**
 * Build the upcoming schedule.
 * scheme: 'monthly' | 'qrmp' | 'composition'
 * opts: {todayISO, monthsAhead, qrmpGroup, includeAnnual}
 * Returns [{ret, period, due, kind}] sorted by due date.
 */
function buildSchedule(scheme, opts) {
  opts = opts || {};
  var todayISO = opts.todayISO || new Date().toISOString().slice(0, 10);
  var monthsAhead = opts.monthsAhead || 4;
  var group = opts.qrmpGroup === 'B' ? 'B' : 'A';
  var items = [];

  var t = new Date(todayISO.slice(0, 10) + 'T00:00:00');
  var ty = t.getFullYear(), tm = t.getMonth() + 1;

  function push(ret, period, y, m, d, kind) {
    items.push({ ret: ret, period: period, due: isoOf(y, m, d),
                 kind: kind || 'return' });
  }
  function nextMonth(y, m) { return m === 12 ? { y: y + 1, m: 1 } : { y: y, m: m + 1 }; }

  if (scheme === 'monthly') {
    // start one month back so a just-missed due date shows as overdue
    var st = prevMonth(ty, tm), y = st.y, m = st.m;
    for (var i = 0; i < monthsAhead + 1; i++) {
      var nm = nextMonth(y, m);
      push('GSTR-1', monthLabel(y, m), nm.y, nm.m, 11);
      push('GSTR-3B', monthLabel(y, m), nm.y, nm.m, 20);
      var adv = nextMonth(y, m); y = adv.y; m = adv.m;
    }
  } else if (scheme === 'qrmp') {
    var sq = prevQuarter(quarterOf(ty, tm));
    for (var j = 0; j < 3; j++) {
      var label = quarterLabel(sq);
      var after = nextMonth(sq.endYear, sq.endMonth);
      // GSTR-1 quarterly: 13th of month after quarter
      push('GSTR-1 (QRMP)', label, after.y, after.m, 13);
      // GSTR-3B quarterly: 22nd/24th of month after quarter
      push('GSTR-3B (QRMP)', label, after.y, after.m, group === 'A' ? 22 : 24);
      // PMT-06 for each month of the quarter: 25th of next month
      for (var mm = sq.startMonth; mm <= sq.startMonth + 2; mm++) {
        var nm2 = nextMonth(sq.startYear, mm);
        push('PMT-06', monthLabel(sq.startYear, mm) + ' tax', nm2.y, nm2.m, 25, 'payment');
      }
      sq = nextQuarter(sq);
    }
  } else if (scheme === 'composition') {
    var cq2 = prevQuarter(quarterOf(ty, tm));
    for (var k = 0; k < 3; k++) {
      var qa = nextMonth(cq2.endYear, cq2.endMonth);
      push('CMP-08', quarterLabel(cq2), qa.y, qa.m, 18, 'payment');
      cq2 = nextQuarter(cq2);
    }
    // GSTR-4 annual: 30 April following the FY
    var fyNow = tm <= 3 ? ty - 1 : ty; // FY currently in progress started this year
    push('GSTR-4 (annual)', 'FY ' + String(fyNow).slice(2) + '-' + String(fyNow + 1).slice(2),
         fyNow + 1, 4, 30);
  }

  // Annual returns: last completed FY (due this Dec) + FY in progress (due next Dec)
  var lastEnd = tm <= 3 ? ty - 1 : ty; // March of the last completed FY
  for (var a = 0; a < 2; a++) {
    var fyS = lastEnd - 1 + a;
    var fyL = 'FY ' + String(fyS).slice(2) + '-' + String(fyS + 1).slice(2);
    if (scheme !== 'composition') {
      push('GSTR-9 (annual)', fyL, fyS + 1, 12, 31);
      push('GSTR-9C (annual)', fyL, fyS + 1, 12, 31);
    }
  }

  // drop items already due more than 45 days ago (stale history)
  items = items.filter(function (it) { return daysUntil(it.due, todayISO) >= -45; });
  items.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  return items;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function gdmInit() {
  var SLUG = 'gst-due-date-monitor';
  var SAVE_LIMIT = 25; // profile saves per day

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'GSTR-3B ki due date kya hai? (What is the GSTR-3B due date?)',
      a: 'Monthly filers: 20th of the next month. QRMP (quarterly) filers: 22nd or 24th of the month after the quarter, depending on the state group.' },
    { q: 'GSTR-1 kab file hota hai? (When is GSTR-1 due?)',
      a: '11th of the next month for monthly filers; 13th of the month following the quarter for QRMP filers.' },
    { q: 'CMP-08 aur GSTR-4 ki due date? (Due dates for composition dealers?)',
      a: 'CMP-08 (quarterly tax payment): 18th of the month after each quarter. GSTR-4 (annual return): 30th April of the next financial year. No late fee on CMP-08 itself, but 18% p.a. interest applies on tax paid late.' },
    { q: 'GSTR-9 kab file karna hota hai? (When is the annual return due?)',
      a: 'GSTR-9 and GSTR-9C are due on 31st December following the financial year. GSTR-9 is optional below Rs 2 crore turnover; GSTR-9C applies above Rs 5 crore.' },
    { q: 'Kya ye app mujhe reminder bhejega? (Will this app send me reminders?)',
      a: 'No. This is a 100% browser-based tool with no backend, so it cannot send SMS/email/push reminders. It shows a live countdown — keep the page bookmarked or pinned and check it weekly.' },
    { q: 'Late return file karne par kitna late fee lagega? (Late fee for delayed filing?)',
      a: 'Rs 50/day (Rs 25 CGST + Rs 25 SGST), Rs 20/day for nil returns, capped per return by turnover: Rs 500 (nil), Rs 2,000 (up to Rs 1.5 cr), Rs 5,000 (Rs 1.5–5 cr), Rs 10,000 (above Rs 5 cr).' }
  ]);
  SEO.softwareApp({
    name: 'GST Due Date & Penalty Monitor — जीएसटी ड्यू डेट कैलेंडर',
    description: 'Free GST compliance calendar for Indian SMEs: GSTR-1, GSTR-3B, CMP-08, GSTR-9 due dates with live countdown, overdue alerts and late-fee estimates.',
    keywords: ['GST due dates', 'जीएसटी ड्यू डेट', 'GSTR-3B due date', 'GST return last date', 'GST compliance calendar', 'GST late fee calculator']
  });

  var profile = { gstin: '', name: '', scheme: 'monthly', turnover: 0, qrmpGroup: 'A' };
  var filedMap = {};

  function scheme() {
    var r = document.querySelector('input[name="scheme"]:checked');
    return r ? r.value : 'monthly';
  }

  function refreshGroupHint() {
    var g = el('gstin').value.trim().toUpperCase();
    var auto = validGSTIN(g) ? qrmpGroupForState(g.slice(0, 2)) : null;
    el('groupAuto').textContent = auto
      ? 'GSTIN se auto-detect: Group ' + auto + ' (' + (auto === 'A' ? '22nd' : '24th') + ') — aap override kar sakte hain.'
      : 'Group A = 22nd (western/southern states), Group B = 24th (northern/eastern states).';
    if (auto && !el('qrmpGroup').dataset.touched) el('qrmpGroup').value = auto;
  }

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
  }

  function render() {
    var todayISO = new Date().toISOString().slice(0, 10);
    var sc = scheme();
    el('qrmpRow').style.display = sc === 'qrmp' ? '' : 'none';
    var items = buildSchedule(sc, {
      todayISO: todayISO,
      monthsAhead: 4,
      qrmpGroup: el('qrmpGroup').value
    });

    var html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
      '<th>Return</th><th>Period</th><th>Due date</th><th>Status</th>' +
      '<th>Est. late fee if filed today</th><th>Filed?</th></tr></thead><tbody>';

    items.forEach(function (it, idx) {
      var key = it.ret + '|' + it.period + '|' + it.due;
      var filed = !!filedMap[key];
      var left = daysUntil(it.due, todayISO);
      var status, cls;
      if (filed) { status = 'Filed ✓'; cls = 'st-filed'; }
      else if (left < 0) { status = Math.abs(left) + ' days OVERDUE'; cls = 'st-over'; }
      else if (left === 0) { status = 'Due TODAY'; cls = 'st-today'; }
      else if (left <= 7) { status = left + ' days left'; cls = 'st-soon'; }
      else { status = left + ' days left'; cls = 'st-ok'; }
      var fee = filed ? 0 : estimateLateFee(it.due, todayISO,
        parseFloat(el('turnover').value) || 0, false);
      html += '<tr class="' + cls + '"><td><strong>' + it.ret + '</strong></td>' +
        '<td>' + it.period + '</td><td>' + fmtDate(it.due) + '</td>' +
        '<td><span class="pill">' + status + '</span></td>' +
        '<td>' + (fee > 0 ? '₹' + fee.toLocaleString('en-IN') : '—') + '</td>' +
        '<td><input type="checkbox" data-filed="' + idx + '"' + (filed ? ' checked' : '') +
        ' aria-label="Mark ' + it.ret + ' ' + it.period + ' as filed"></td></tr>';
      it._key = key;
    });
    html += '</tbody></table></div>';
    el('gdm-table').innerHTML = html;

    el('gdm-table').querySelectorAll('input[data-filed]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var it = items[parseInt(cb.getAttribute('data-filed'), 10)];
        if (cb.checked) filedMap[it._key] = true; else delete filedMap[it._key];
        Vault.save(SLUG, 'filed-map', filedMap).catch(function () {});
        render();
      });
    });
  }

  async function saveProfile() {
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('gdm-upsell'), SLUG, SAVE_LIMIT);
      return;
    }
    el('gdm-upsell').innerHTML = '';
    var gstin = el('gstin').value.trim().toUpperCase();
    var err = el('gdm-error');
    err.textContent = '';
    if (gstin && !validGSTIN(gstin)) {
      err.textContent = 'GSTIN format galat lag raha hai (15 characters, e.g. 27ABCDE1234F1Z5).';
      return;
    }
    profile = {
      gstin: gstin,
      name: el('bizName').value.trim(),
      scheme: scheme(),
      turnover: parseFloat(el('turnover').value) || 0,
      qrmpGroup: el('qrmpGroup').value,
      savedAt: new Date().toISOString()
    };
    try {
      await Vault.save(SLUG, 'gstin-profile', profile);
      el('gdm-saved').textContent = 'Profile saved on this device ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' saves left today)';
    } catch (e) {
      err.textContent = 'Could not save: ' + e.message;
    }
    render();
  }

  async function loadProfile() {
    try {
      var p = await Vault.load(SLUG, 'gstin-profile');
      if (p) {
        profile = p;
        el('gstin').value = p.gstin || '';
        el('bizName').value = p.name || '';
        el('turnover').value = p.turnover || '';
        var radio = document.querySelector('input[name="scheme"][value="' + p.scheme + '"]');
        if (radio) radio.checked = true;
        if (p.qrmpGroup) el('qrmpGroup').value = p.qrmpGroup;
        refreshGroupHint();
      }
      var fm = await Vault.load(SLUG, 'filed-map');
      if (fm) filedMap = fm;
    } catch (e) { /* fresh start */ }
  }

  el('saveProfileBtn').addEventListener('click', saveProfile);
  el('refreshBtn').addEventListener('click', render);
  el('gstin').addEventListener('input', refreshGroupHint);
  el('qrmpGroup').addEventListener('change', function () {
    el('qrmpGroup').dataset.touched = '1';
  });
  document.querySelectorAll('input[name="scheme"]').forEach(function (r) {
    r.addEventListener('change', render);
  });
  el('turnover').addEventListener('change', render);

  loadProfile().then(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gdmInit);
  } else { gdmInit(); }
}
