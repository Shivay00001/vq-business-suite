/* ============================================================
   Statutory Compliance Calendar — recurring due-date generator.
   Standard dates (verified Sep 2026):
   - GSTR-1: 11th of following month (monthly filers)
   - GSTR-3B: 20th of following month
   - GSTR-7 / GSTR-8: 10th of following month
   - IFF (QRMP, optional): 13th of following month
   - GSTR-6 (ISD): 13th of following month
   - CMP-08 (composition, quarterly): 18th of Jan/Apr/Jul/Oct
   - GSTR-4 (composition, annual): 30 June (from FY 2024-25, Notification 12/2024;
     earlier 30 April)
   - QRMP: quarterly GSTR-1 13th (Jan/Apr/Jul/Oct),
     quarterly GSTR-3B 22nd/24th (state category),
     PMT-06 monthly payment 25th
   - TDS/TCS deposit: 7th of following month
   - 24Q: 31 Jul (Q1), 31 Oct (Q2), 31 Jan (Q3), 31 May (Q4)
   - Form 16: 15 June
   - PF & ESI deposit: 15th of following month
   - Advance tax: 15 Jun, 15 Sep, 15 Dec, 15 Mar
   - GSTR-9/9C: 31 December
   Generator is DOM-free so it can be unit-tested in node.
   ============================================================ */

/* laws: {gstM, qrmp, comp, tds, labour, itax} */
function buildEvents(year, month0, laws) {
  // month0: 0-based (0=Jan). Events belong to this display month.
  laws = laws || {};
  var ev = [];
  function add(day, code, label, cls) {
    ev.push({ y: year, m: month0, d: day, code: code, label: label, cls: cls });
  }
  var qMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct (month after quarter end)

  if (laws.gstM) {
    add(11, 'GSTR-1', 'GSTR-1 (monthly outward supplies)', 'gst');
    add(20, 'GSTR-3B', 'GSTR-3B (monthly return + payment)', 'gst');
    add(10, 'GSTR-7/8', 'GSTR-7 (TDS) / GSTR-8 (TCS) returns', 'gst');
    add(13, 'IFF/GSTR-6', 'IFF (QRMP, optional) · GSTR-6 (ISD)', 'gst');
    if (month0 === 11) add(31, 'GSTR-9/9C', 'GSTR-9 annual return + 9C reconciliation (regular filers)', 'gst');
  }
  if (laws.qrmp) {
    if (qMonths.indexOf(month0) >= 0) {
      add(13, 'GSTR-1 (QRMP)', 'GSTR-1 quarterly (QRMP scheme)', 'gst');
      add(22, 'GSTR-3B (QRMP)', 'GSTR-3B quarterly — 22nd (Cat X) / 24th (Cat Y states)', 'gst');
    }
    add(25, 'PMT-06', 'PMT-06 (QRMP monthly tax payment)', 'gst');
  }
  if (laws.comp) {
    if (qMonths.indexOf(month0) >= 0) {
      add(18, 'CMP-08', 'CMP-08 (composition quarterly payment)', 'comp');
    }
    if (month0 === 5) add(30, 'GSTR-4', 'GSTR-4 (composition annual return)', 'comp');
  }
  if (laws.tds) {
    add(7, 'TDS deposit', 'TDS/TCS deposit for previous month', 'tds');
    var q24 = { 6: ['Q1 (Apr–Jun)', 'Jul'], 9: ['Q2 (Jul–Sep)', 'Oct'],
                0: ['Q3 (Oct–Dec)', 'Jan'], 4: ['Q4 (Jan–Mar)', 'May'] };
    if (q24[month0]) {
      add(31, '24Q', '24Q TDS return ' + q24[month0][0] + ' (due 31 ' + q24[month0][1] + ')', 'tds');
    }
    if (month0 === 5) add(15, 'Form 16', 'Form 16 issuance (FY gone by)', 'tds');
  }
  if (laws.labour) {
    add(15, 'PF/ESI', 'PF & ESI deposit for previous month', 'labour');
  }
  if (laws.itax) {
    var adv = { 5: 'Q1', 8: 'Q2', 11: 'Q3', 2: 'Q4' };
    if (adv[month0]) add(15, 'Advance tax', 'Advance tax instalment ' + adv[month0], 'itax');
  }
  if (laws.ptDay) {
    add(laws.ptDay, 'PT', 'Professional Tax — ' + (laws.ptState || 'your state') +
      ' (your custom reminder; verify the date on the state PT portal)', 'labour');
  }

  ev.sort(function (a, b) { return a.d - b.d; });
  return ev;
}

/** Events in the next `n` days from a base date (ISO yyyy-mm-dd). */
function upcomingEvents(baseISO, laws, n) {
  n = n || 7;
  var base = new Date(String(baseISO).slice(0, 10) + 'T00:00:00');
  var out = [];
  for (var off = 0; off <= n; off++) {
    var d = new Date(base.getTime() + off * 86400000);
    var evs = buildEvents(d.getFullYear(), d.getMonth(), laws)
      .filter(function (e) { return e.d === d.getDate(); });
    for (var i = 0; i < evs.length; i++) {
      out.push({ inDays: off, date: d, ev: evs[i] });
    }
  }
  out.sort(function (a, b) {
    return a.inDays - b.inDays || (a.ev.code < b.ev.code ? -1 : 1);
  });
  return out;
}

function fmtDate(d) {
  return String(d.getDate()).padStart(2, '0') + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
}

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function calInit() {
  var SLUG = 'statutory-calendar';
  var VAULT_KEY = 'law-prefs';

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'GSTR-1 aur GSTR-3B ki due date kya hai? (What are the GSTR-1 and GSTR-3B due dates?)',
      a: 'Monthly filers: GSTR-1 by the 11th and GSTR-3B by the 20th of the following month. Under QRMP: quarterly GSTR-1 by the 13th and quarterly GSTR-3B by the 22nd/24th of the month after the quarter (depending on state category).' },
    { q: 'CMP-08 kab file hota hai? (When is CMP-08 due?)',
      a: 'By the 18th of the month after each quarter — 18 Apr, 18 Jul, 18 Oct, 18 Jan. The composition annual return GSTR-4 is due by 30 June (from FY 2024-25 onwards, Notification 12/2024; earlier it was 30 April).' },
    { q: 'TDS deposit aur return ki dates kya hain? (TDS deposit and return dates?)',
      a: 'TDS/TCS deposit: by the 7th of the following month. 24Q quarterly returns: 31 Jul, 31 Oct, 31 Jan, 31 May. Form 16 must be issued by 15 June.' },
    { q: 'PF aur ESI kab jama hota hai? (When are PF and ESI deposited?)',
      a: 'Both PF and ESI monthly deposits are due by the 15th of the following month.' },
    { q: 'Kya ye dates hamesha sahi rehti hain? (Are these dates always correct?)',
      a: 'These are the standard recurring dates, but the government sometimes extends deadlines via notification — always re-verify on gst.gov.in or the relevant portal as the deadline approaches.' }
  ]);
  SEO.softwareApp({
    name: 'Statutory Compliance Calendar — कंप्लायंस कैलेंडर',
    description: 'Free statutory compliance calendar for Indian SMEs: GSTR-1/3B, CMP-08, PMT-06, TDS, PF/ESI and advance tax due dates with filters and a 7-day upcoming widget.',
    keywords: ['statutory compliance calendar', 'GST due dates calendar', 'GSTR-1 GSTR-3B due date', 'CMP-08 due date', 'TDS due date', 'PF ESI due date', 'compliance calendar India']
  });

  var view = { y: null, m: null };
  var selectedDay = null;

  function lawState() {
    return {
      gstM: el('lawGstM').checked, qrmp: el('lawQrmp').checked,
      comp: el('lawComp').checked, tds: el('lawTds').checked,
      labour: el('lawLabour').checked, itax: el('lawItax').checked,
      // Professional Tax is state-specific: user-configured monthly reminder
      ptOn: el('lawPt').checked,
      ptState: el('ptState').value.trim(),
      ptDay: el('lawPt').checked
        ? Math.min(28, Math.max(1, parseInt(el('ptDay').value, 10) || 0)) || 0
        : 0
    };
  }

  async function savePrefs() {
    try { await Vault.save(SLUG, VAULT_KEY, lawState()); } catch (e) { /* non-fatal */ }
  }

  async function loadPrefs() {
    try {
      var p = await Vault.load(SLUG, VAULT_KEY);
      if (p) {
        el('lawGstM').checked = !!p.gstM; el('lawQrmp').checked = !!p.qrmp;
        el('lawComp').checked = !!p.comp; el('lawTds').checked = !!p.tds;
        el('lawLabour').checked = !!p.labour; el('lawItax').checked = !!p.itax;
        el('lawPt').checked = !!p.ptOn;
        if (p.ptState) el('ptState').value = p.ptState;
        if (p.ptDay) el('ptDay').value = p.ptDay;
      }
    } catch (e) { /* defaults stand */ }
  }

  ['lawGstM', 'lawQrmp', 'lawComp', 'lawTds', 'lawLabour', 'lawItax', 'lawPt'].forEach(function (id) {
    el(id).addEventListener('change', function () { savePrefs(); renderAll(); });
  });
  ['ptState', 'ptDay'].forEach(function (id) {
    el(id).addEventListener('change', function () { savePrefs(); renderAll(); });
  });

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  function renderCalendar() {
    var y = view.y, m = view.m;
    el('calTitle').textContent = MONTH_NAMES[m] + ' ' + y;
    var grid = el('calGrid');
    var html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      .map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');

    var firstDow = new Date(y, m, 1).getDay();
    var dim = daysInMonth(y, m);
    var prevDim = daysInMonth(y, (m + 11) % 12);
    var today = new Date();
    var isThisMonth = today.getFullYear() === y && today.getMonth() === m;
    var evs = buildEvents(y, m, lawState());
    var byDay = {};
    evs.forEach(function (e) { (byDay[e.d] = byDay[e.d] || []).push(e); });

    function cell(dnum, other) {
      var cls = 'cal-day' + (other ? ' other' : '');
      if (!other && isThisMonth && dnum === today.getDate()) cls += ' today';
      var h = '<div class="' + cls + '" data-day="' + (other ? '' : dnum) + '"><div class="d">' + dnum + '</div>';
      if (!other && byDay[dnum]) {
        byDay[dnum].forEach(function (e) {
          h += '<div class="ev ' + e.cls + '">' + e.code + '</div>';
        });
      }
      return h + '</div>';
    }

    for (var i = firstDow - 1; i >= 0; i--) html += cell(prevDim - i, true);
    for (var d = 1; d <= dim; d++) html += cell(d, false);
    var tail = (7 - ((firstDow + dim) % 7)) % 7;
    for (var t = 1; t <= tail; t++) html += cell(t, true);
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day[data-day]:not(.other)').forEach(function (c) {
      c.addEventListener('click', function () {
        selectedDay = parseInt(c.getAttribute('data-day'), 10);
        renderDayDetail();
      });
    });
    renderDayDetail();
  }

  function renderDayDetail() {
    var box = el('dayDetail');
    if (!selectedDay) { box.innerHTML = ''; return; }
    var evs = buildEvents(view.y, view.m, lawState())
      .filter(function (e) { return e.d === selectedDay; });
    var h = '<div class="card"><h2>' + selectedDay + ' ' + MONTH_NAMES[view.m] + ' ' + view.y + '</h2>';
    if (!evs.length) h += '<p class="vq-hint">No compliances due on this date (for your selected laws).</p>';
    evs.forEach(function (e) {
      h += '<div class="up-item"><span class="up-date">' + e.code + '</span><span>' + e.label + '</span></div>';
    });
    box.innerHTML = h + '</div>';
  }

  function renderUpcoming() {
    var now = new Date();
    var base = now.toISOString().slice(0, 10);
    var list = upcomingEvents(base, lawState(), 7);
    var box = el('upcomingList');
    if (!list.length) {
      box.innerHTML = '<p class="vq-hint">No compliances due in the next 7 days (for your selected laws).</p>';
      return;
    }
    var html = '';
    list.forEach(function (it) {
      var when = it.inDays === 0 ? '<span class="up-days">TODAY</span>'
        : it.inDays === 1 ? '<span class="up-days">tomorrow</span>'
        : '<span class="up-days">in ' + it.inDays + ' days</span>';
      html += '<div class="up-item"><span class="up-date">' + fmtDate(it.date) + '</span>' +
        '<span><strong>' + it.ev.code + '</strong> — ' + it.ev.label + '</span>' + when + '</div>';
    });
    box.innerHTML = html;
  }

  function renderAll() { renderCalendar(); renderUpcoming(); }

  el('prevBtn').addEventListener('click', function () {
    view.m--; if (view.m < 0) { view.m = 11; view.y--; }
    selectedDay = null; renderAll();
  });
  el('nextBtn').addEventListener('click', function () {
    view.m++; if (view.m > 11) { view.m = 0; view.y++; }
    selectedDay = null; renderAll();
  });
  el('todayBtn').addEventListener('click', function () {
    var n = new Date(); view.y = n.getFullYear(); view.m = n.getMonth();
    selectedDay = n.getDate(); renderAll();
  });

  (async function start() {
    await loadPrefs();
    var n = new Date(); view.y = n.getFullYear(); view.m = n.getMonth();
    renderAll();
  })();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', calInit);
  } else { calInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildEvents: buildEvents, upcomingEvents: upcomingEvents };
}
