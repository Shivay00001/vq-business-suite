/* ============================================================
   Cashbook Tool — pure computation layer.
   entries: {id, type:'in'|'out', date, category, amount, note}
   opening: {amount, date} — entries strictly before `date` are ignored.
   closingBalance(date) = opening + Σ in(≤date) − Σ out(≤date)
   DOM-free; unit-testable in node.
   ============================================================ */

var IN_CATS = ['Sales / revenue', 'Customer collection', 'Owner capital', 'Other income'];
var OUT_CATS = ['Purchases', 'Rent', 'Salaries & wages', 'Utilities', 'Transport', 'Other expense'];

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateEntry(e) {
  if (!e || (e.type !== 'in' && e.type !== 'out')) return 'Type must be cash in or cash out.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ''))) return 'Date is required.';
  if (!(Number(e.amount) > 0)) return 'Amount must be greater than 0.';
  return '';
}

/** Entries on/after opening date. */
function effectiveEntries(entries, opening) {
  var from = (opening && opening.date) || '0000-00-00';
  return (entries || []).filter(function (e) { return e.date >= from; });
}

/** Closing balance as of dateISO (inclusive). */
function closingBalance(entries, opening, dateISO) {
  var bal = round2(Number((opening && opening.amount) || 0));
  effectiveEntries(entries, opening).forEach(function (e) {
    if (e.date > dateISO) return;
    var a = round2(Number(e.amount) || 0);
    bal = round2(bal + (e.type === 'in' ? a : -a));
  });
  return bal;
}

/** Daily totals for a month 'YYYY-MM': [{date, in, out, closing}]. */
function monthView(entries, opening, ym) {
  var parts = String(ym).split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (!(y > 0 && m >= 1 && m <= 12)) return [];
  var days = new Date(y, m, 0).getDate();
  var out = [];
  for (var d = 1; d <= days; d++) {
    var iso = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var din = 0, dout = 0;
    effectiveEntries(entries, opening).forEach(function (e) {
      if (e.date !== iso) return;
      var a = round2(Number(e.amount) || 0);
      if (e.type === 'in') din = round2(din + a); else dout = round2(dout + a);
    });
    out.push({ date: iso, in: din, out: dout, closing: closingBalance(entries, opening, iso) });
  }
  return out;
}

/** Book-vs-counted check: {book, counted, diff}. */
function cashCheck(entries, opening, dateISO, counted) {
  var book = closingBalance(entries, opening, dateISO);
  counted = round2(Number(counted) || 0);
  return { book: book, counted: counted, diff: round2(counted - book) };
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function cbInit() {
  var SLUG = 'cashbook-tool';
  var SAVE_LIMIT = 25; // report snapshots per day
  var entries = [];
  var opening = { amount: 0, date: '' };

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function thisMonth() { return today().slice(0, 7); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Cashbook kaise banaye? (रोकड़ बही कैसे बनाएं?)',
      a: 'Opening balance set karein, phir roz ki cash in/out entries category aur note ke saath darj karein. App automatic day-wise closing balance nikalta hai.' },
    { q: 'Cash-vs-book difference ka matlab kya hai?',
      a: 'Book balance (hisab) aur tijori me gine hue cash ka farak zero hona chahiye. Farak hai to koi entry chhooti ya galat hui hai — ye check usi ko pakadta hai.' },
    { q: 'Month view me kya dikhta hai?',
      a: 'Har din ka total cash in, cash out aur us din ka closing balance — poore mahine ka cash flow ek nazar me.' },
    { q: 'कैश बुक क्या होती है?',
      a: 'Cashbook (rokad bahi) me roz ke nakad len-den ka hisaab rehta hai — kitna cash aaya, kitna gaya, aur din ke ant me kitna bacha.' }
  ]);
  SEO.softwareApp({
    name: 'Cashbook Tool — कैश बुक हिसाब',
    description: 'Free digital cashbook for Indian SMEs: daily cash in/out, opening balance, day-wise closing, month view, counted-cash difference check, print.',
    keywords: ['cashbook', 'कैश बुक', 'rokad bahi', 'daily cash book', 'cash closing balance', 'petty cash book']
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
    return Vault.save(SLUG, 'cashbook', { entries: entries, opening: opening })
      .catch(function () {});
  }

  function refreshCats() {
    var type = document.querySelector('input[name="ctype"]:checked').value;
    var cats = type === 'in' ? IN_CATS : OUT_CATS;
    el('e-cat').innerHTML = cats.map(function (c) {
      return '<option>' + esc(c) + '</option>';
    }).join('');
  }

  function saveOpening() {
    var err = el('open-error'); err.textContent = '';
    var amt = parseFloat(el('openBal').value);
    if (!(amt >= 0)) { err.textContent = 'Opening balance 0 ya zyada hona chahiye.'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(el('openDate').value)) { err.textContent = 'Effective date chunein.'; return; }
    opening = { amount: round2(amt), date: el('openDate').value };
    persist().then(renderAll);
  }

  function addEntry() {
    var err = el('e-error'); err.textContent = '';
    var e = {
      id: uid('e'),
      type: document.querySelector('input[name="ctype"]:checked').value,
      category: el('e-cat').value,
      date: el('e-date').value,
      amount: parseFloat(el('e-amount').value) || 0,
      note: el('e-note').value.trim()
    };
    var verr = validateEntry(e);
    if (verr) { err.textContent = verr; return; }
    entries.push(e);
    el('e-amount').value = ''; el('e-note').value = '';
    persist().then(renderAll);
  }

  function delEntry(id) {
    if (!window.confirm('Delete this entry?')) return;
    entries = entries.filter(function (e) { return e.id !== id; });
    persist().then(renderAll);
  }

  function renderBook() {
    var ym = el('monthSel').value || thisMonth();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var p = ym.split('-');
    el('cbMonth').textContent = months[parseInt(p[1], 10) - 1] + ' ' + p[0];
    el('cbOpen').textContent = inr(opening.amount) + (opening.date ? ' (from ' + opening.date + ')' : '');

    var rows = effectiveEntries(entries, opening)
      .filter(function (e) { return e.date.slice(0, 7) === ym; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    var html = '';
    rows.forEach(function (e) {
      var a = round2(Number(e.amount) || 0);
      html += '<tr><td>' + esc(e.date) + '</td>' +
        '<td><span class="pill ' + (e.type === 'in' ? 'p-in' : 'p-out') + '">' +
        (e.type === 'in' ? 'IN' : 'OUT') + '</span> ' + esc(e.note || '—') + '</td>' +
        '<td>' + esc(e.category || '—') + '</td>' +
        '<td class="r">' + (e.type === 'in' ? inr(a) : '—') + '</td>' +
        '<td class="r">' + (e.type === 'out' ? inr(a) : '—') + '</td>' +
        '<td class="r"><strong>' + inr(closingBalance(entries, opening, e.date)) + '</strong></td>' +
        '<td><button class="vq-btn ghost mini del" data-id="' + e.id + '">✕</button></td></tr>';
    });
    if (!rows.length) html = '<tr><td colspan="7" class="vq-hint">Is mahine me koi entry nahi hai.</td></tr>';
    el('cbBody').innerHTML = html;
    el('cbBody').querySelectorAll('.del').forEach(function (b) {
      b.addEventListener('click', function () { delEntry(b.getAttribute('data-id')); });
    });

    el('cbToday').textContent = inr(closingBalance(entries, opening, today()));

    var mv = monthView(entries, opening, ym);
    el('monthBody').innerHTML = mv.map(function (d) {
      var hasAct = d.in > 0 || d.out > 0;
      return '<tr' + (hasAct ? '' : ' style="color:#94a3b8"') + '><td>' + d.date + '</td>' +
        '<td class="r">' + inr(d.in) + '</td><td class="r">' + inr(d.out) + '</td>' +
        '<td class="r"><strong>' + inr(d.closing) + '</strong></td></tr>';
    }).join('');
  }

  function renderAll() { renderBook(); }

  function doCheck() {
    var err = el('chk-error'); err.textContent = '';
    var date = el('chk-date').value, counted = el('chk-counted').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Date chunein.'; return; }
    if (!(parseFloat(counted) >= 0)) { err.textContent = 'Counted cash darj karein.'; return; }
    var r = cashCheck(entries, opening, date, parseFloat(counted));
    if (r.diff === 0) {
      el('chk-result').innerHTML = '<span class="pill p-in">✓ MATCH</span> Book balance ' +
        inr(r.book) + ' = counted cash ' + inr(r.counted) + '. Hisab mil gaya!';
    } else {
      el('chk-result').innerHTML = '<span class="pill p-out">⚠ DIFFERENCE ' + inr(r.diff) + '</span> ' +
        'Book balance ' + inr(r.book) + ', counted ' + inr(r.counted) +
        '. Koi entry chhooti ya galat hai — entries check karein.';
    }
  }

  async function saveReport() {
    el('cb-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cb-upsell'), SLUG, SAVE_LIMIT); return; }
    var ym = el('monthSel').value || thisMonth();
    var mv = monthView(entries, opening, ym);
    var key = 'report-' + ym + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, { month: ym, opening: opening, daily: mv, savedAt: new Date().toISOString() });
      el('cb-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('chk-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addEntryBtn').addEventListener('click', addEntry);
  el('saveOpenBtn').addEventListener('click', saveOpening);
  el('chkBtn').addEventListener('click', doCheck);
  el('monthSel').addEventListener('change', renderAll);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });
  document.querySelectorAll('input[name="ctype"]').forEach(function (r) {
    r.addEventListener('change', refreshCats);
  });

  el('e-date').value = today();
  el('chk-date').value = today();
  el('monthSel').value = thisMonth();
  refreshCats();
  Vault.load(SLUG, 'cashbook').then(function (d) {
    if (d && Array.isArray(d.entries)) entries = d.entries;
    if (d && d.opening) opening = d.opening;
    if (opening.amount != null) el('openBal').value = opening.amount;
    if (opening.date) el('openDate').value = opening.date;
    renderAll();
  }).catch(renderAll);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cbInit);
  } else { cbInit(); }
}
