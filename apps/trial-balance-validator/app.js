/* ============================================================
   Trial Balance Validator — pure computation layer.
   accounts: [{id, name, type, debit, credit}]
   validateTB: totals debits & credits, difference, suspense suggestion,
               per-type subtotals.
   HONEST NOTE: validates arithmetic only (debits = credits), not
   whether entries are in the correct accounts.
   DOM-free; unit-testable in node.
   ============================================================ */

var TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function validateAccount(a) {
  if (!a || !String(a.name || '').trim()) return 'Account name is required.';
  if (TYPES.indexOf(a.type) < 0) return 'Account type is invalid.';
  var d = num(a.debit), c = num(a.credit);
  if (!(d >= 0) || !(c >= 0)) return 'Balances must be 0 or more.';
  if (d > 0 && c > 0) return 'Enter the NET balance only — debit or credit, not both.';
  if (d === 0 && c === 0) return 'Enter a debit or credit balance.';
  return '';
}

/**
 * Validate a trial balance.
 * Returns {totalDebit, totalCredit, diff, tallied, suspense, byType[]}
 * suspense: null when tallied, else {side:'debit'|'credit', amount}
 *   — the side on which to book a Suspense A/c entry to force tally.
 */
function validateTB(accounts) {
  var totalD = 0, totalC = 0;
  var byType = {};
  TYPES.forEach(function (t) { byType[t] = { debit: 0, credit: 0, count: 0 }; });
  (accounts || []).forEach(function (a) {
    var d = round2(num(a.debit)), c = round2(num(a.credit));
    totalD = round2(totalD + d);
    totalC = round2(totalC + c);
    if (byType[a.type]) {
      byType[a.type].debit = round2(byType[a.type].debit + d);
      byType[a.type].credit = round2(byType[a.type].credit + c);
      byType[a.type].count++;
    }
  });
  var diff = round2(totalD - totalC);
  var tallied = diff === 0;
  var suspense = null;
  if (!tallied) {
    // If debits exceed credits, add the difference to the CREDIT side via Suspense A/c.
    suspense = diff > 0
      ? { side: 'credit', amount: diff, entry: 'Suspense A/c ............ Dr ' + inrPlain(diff) + ' — To Balance c/d (credit side)' }
      : { side: 'debit', amount: -diff, entry: 'To Suspense A/c ............ ' + inrPlain(-diff) + ' — By Balance c/d (debit side)' };
  }
  return {
    totalDebit: totalD, totalCredit: totalC, diff: diff, tallied: tallied,
    suspense: suspense, byType: byType, accountCount: (accounts || []).length
  };
}

function sampleAccounts() {
  return [
    { id: uid('a'), name: 'Cash', type: 'Asset', debit: 45000, credit: 0 },
    { id: uid('a'), name: 'Bank', type: 'Asset', debit: 120000, credit: 0 },
    { id: uid('a'), name: 'Stock', type: 'Asset', debit: 80000, credit: 0 },
    { id: uid('a'), name: 'Debtors', type: 'Asset', debit: 60000, credit: 0 },
    { id: uid('a'), name: 'Furniture', type: 'Asset', debit: 35000, credit: 0 },
    { id: uid('a'), name: 'Creditors', type: 'Liability', debit: 0, credit: 70000 },
    { id: uid('a'), name: 'Bank loan', type: 'Liability', debit: 0, credit: 100000 },
    { id: uid('a'), name: 'Capital', type: 'Equity', debit: 0, credit: 180000 },
    { id: uid('a'), name: 'Sales', type: 'Income', debit: 0, credit: 320000 },
    { id: uid('a'), name: 'Purchases', type: 'Expense', debit: 180000, credit: 0 },
    { id: uid('a'), name: 'Rent', type: 'Expense', debit: 60000, credit: 0 },
    { id: uid('a'), name: 'Salaries', type: 'Expense', debit: 90000, credit: 0 }
  ];
}

function inrPlain(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function inr(n) { return inrPlain(n); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function tbInit() {
  var SLUG = 'trial-balance-validator';
  var FREE_LIMIT = 20; // validations per day
  var SAVE_LIMIT = 25; // report snapshots per day
  var accounts = [];
  var lastResult = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Trial balance kya hota hai?',
      a: 'Trial balance saare ledger accounts ke debit/credit balances ki list hai. Double-entry me total debits hamesha total credits ke barabar hone chahiye.' },
    { q: 'Debits credits se match na karein to kya karein?',
      a: 'Farak ki rakam Suspense Account me dal kar books temporarily tally ki jati hain, phir galti dhoondh kar sudhari jati hai.' },
    { q: 'Kya tally hona matlab hisaab sahi hai?',
      a: 'Nahi. Ye tool sirf arithmetic check karta hai — galat account me entry ya chhooti entry bhi kabhi tally ho jati hai.' },
    { q: 'ट्रायल बैलेंस कैसे बनता है?',
      a: 'Har ledger account ka closing balance nikalkar — debit balance debit column me, credit balance credit column me. Dono totals barabar hone chahiye.' }
  ]);
  SEO.softwareApp({
    name: 'Trial Balance Validator — ट्रायल बैलेंस चेकर',
    description: 'Free trial balance validator: debit/credit balance check, suspense-account difference flagging, type-wise grouping, printable trial balance.',
    keywords: ['trial balance', 'ट्रायल बैलेंस', 'tally trial balance', 'debit credit check', 'suspense account', 'trial balance format']
  });

  function persist() {
    return Vault.save(SLUG, 'accounts', accounts).catch(function () {});
  }

  function addAccount() {
    var err = el('a-error'); err.textContent = '';
    var a = {
      id: uid('a'), name: el('a-name').value.trim(), type: el('a-type').value,
      debit: num(el('a-debit').value), credit: num(el('a-credit').value)
    };
    var verr = validateAccount(a);
    if (verr) { err.textContent = verr; return; }
    a.debit = round2(a.debit); a.credit = round2(a.credit);
    accounts.push(a);
    el('a-name').value = ''; el('a-debit').value = ''; el('a-credit').value = '';
    persist().then(function () { el('a-error').textContent = ''; });
  }

  function renderTB(r) {
    el('tbDate').textContent = 'as of ' + today();
    var html = '';
    TYPES.forEach(function (t) {
      var rows = accounts.filter(function (a) { return a.type === t; });
      if (!rows.length) return;
      html += '<tr class="typehead"><td colspan="4">' + t + 's</td></tr>';
      rows.forEach(function (a) {
        html += '<tr><td>' + esc(a.name) +
          ' <button class="vq-btn ghost mini no-print del" data-id="' + a.id + '">✕</button></td>' +
          '<td>' + a.type + '</td>' +
          '<td class="r">' + (a.debit > 0 ? inr(a.debit) : '—') + '</td>' +
          '<td class="r">' + (a.credit > 0 ? inr(a.credit) : '—') + '</td></tr>';
      });
      var bt = r.byType[t];
      html += '<tr><td colspan="2" style="text-align:right"><em>' + t + ' total</em></td>' +
        '<td class="r"><em>' + inr(bt.debit) + '</em></td>' +
        '<td class="r"><em>' + inr(bt.credit) + '</em></td></tr>';
    });
    html += '<tr class="grand"><td colspan="2">TOTAL</td>' +
      '<td class="r">' + inr(r.totalDebit) + '</td>' +
      '<td class="r">' + inr(r.totalCredit) + '</td></tr>';
    el('tbBody').innerHTML = html;
    el('tbBody').querySelectorAll('.del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.confirm('Delete this account?')) return;
        accounts = accounts.filter(function (a) { return a.id !== b.getAttribute('data-id'); });
        persist().then(function () { el('resultWrap').style.display = 'none'; });
      });
    });
  }

  function validate() {
    var err = el('a-error'); err.textContent = '';
    el('tb-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    el('tb-meter').textContent = 'Free validations left today: ' + gate.remaining + '/' + FREE_LIMIT;
    if (!gate.allowed) {
      Freemium.renderUpsell(el('tb-upsell'), SLUG, FREE_LIMIT);
      el('resultWrap').style.display = 'none';
      return;
    }
    if (!accounts.length) { err.textContent = 'Pehle kam se kam ek account add karein.'; return; }
    var r = validateTB(accounts);
    lastResult = r;
    renderTB(r);

    var vb = el('verdictBox');
    if (r.tallied) {
      vb.className = 'verdict';
      el('verdictTitle').textContent = '✓ Trial balance tallied';
      el('verdictText').innerHTML = 'Total debits = total credits = <strong>' + inr(r.totalDebit) + '</strong> (' +
        r.accountCount + ' accounts). Arithmetic sahi hai — lekin yaad rahe, ye accounting correctness ki guarantee nahi hai.';
    } else {
      vb.className = 'verdict bad';
      el('verdictTitle').textContent = '⚠ Difference of ' + inr(Math.abs(r.diff));
      el('verdictText').innerHTML = 'Debits (' + inr(r.totalDebit) + ') ≠ credits (' + inr(r.totalCredit) + '). ' +
        'Farak: <strong>' + inr(Math.abs(r.diff)) + '</strong> ' +
        (r.diff > 0 ? 'zyada debit side par' : 'zyada credit side par') + '.<br>' +
        'Suspense entry: <strong>' + esc(r.suspense.entry) + '</strong> — phir galti dhoondh kar sudharein.';
    }
    el('resultWrap').style.display = 'block';
    el('tb-saved').textContent = '';
  }

  async function saveReport() {
    el('tb-upsell').innerHTML = '';
    if (!lastResult) { el('a-error').textContent = 'Pehle validate karein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('tb-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        accounts: accounts, result: lastResult, savedAt: new Date().toISOString()
      });
      el('tb-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('a-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addBtn').addEventListener('click', addAccount);
  el('validateBtn').addEventListener('click', validate);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });
  el('sampleBtn').addEventListener('click', function () {
    accounts = sampleAccounts();
    persist().then(validate);
  });
  el('clearBtn').addEventListener('click', function () {
    if (!window.confirm('Clear all accounts?')) return;
    accounts = [];
    persist().then(function () { el('resultWrap').style.display = 'none'; });
  });

  el('tb-meter').textContent = 'Free validations left today: ' + Freemium.remaining(SLUG, FREE_LIMIT) + '/' + FREE_LIMIT;
  Vault.load(SLUG, 'accounts').then(function (d) {
    if (Array.isArray(d)) accounts = d;
  }).catch(function () {});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tbInit);
  } else { tbInit(); }
}
