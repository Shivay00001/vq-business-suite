/* ============================================================
   Loyalty Points Manager — pure computation layer.
   Customer: {id, name, phone}
   Entry: {id, customerId, type:'earn'|'redeem', points, date, note}
   earned points = floor(amount / earnRate)
   balance = Σearn − Σredeem (per customer, never negative on redeem)
   redemption value = balance * redeemValue
   Security: lengths capped, negatives/NaN rejected, redeem ≤ balance.
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

/** Config validation: {earnRate, redeemValue}. */
function validateConfig(c) {
  var er = Number(c.earnRate), rv = Number(c.redeemValue);
  if (!isFinite(er) || !isFinite(rv)) return 'Settings me sahi number likhein.';
  if (!(er >= 1)) return 'Earn rate kam se kam ₹1 per point hona chahiye.';
  if (!(rv > 0)) return 'Redeem value 0 se zyada honi chahiye.';
  if (er > 1e7 || rv > 1e6) return 'Settings values bahut badi hain.';
  return '';
}

/** Points earned for a purchase amount at the earn rate. */
function earnPointsFor(amount, earnRate) {
  var a = Number(amount), er = Number(earnRate);
  if (!isFinite(a) || !isFinite(er) || er <= 0 || a < 0) return 0;
  return Math.floor(a / er);
}

/** {earned, redeemed, balance} for one customer. */
function pointsBalance(entries, customerId) {
  var e = 0, r = 0;
  (entries || []).forEach(function (x) {
    if (x.customerId !== customerId) return;
    var p = Math.max(0, Math.floor(Number(x.points) || 0));
    if (x.type === 'earn') e += p;
    else if (x.type === 'redeem') r += p;
  });
  return { earned: e, redeemed: r, balance: e - r };
}

/** Redemption value (₹) of a points balance. */
function redemptionValue(balancePts, redeemValue) {
  return round2(Math.max(0, Number(balancePts) || 0) * (Number(redeemValue) || 0));
}

/** Validate a ledger entry before recording. */
function validateEntry(en, entries, cfg) {
  if (!en || !en.customerId) return 'Please select a customer.';
  if (en.type !== 'earn' && en.type !== 'redeem') return 'Entry type earn ya redeem hona chahiye.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(en.date || ''))) return 'Date is required.';
  if (String(en.note || '').length > 200) return 'Note 200 characters se zyada nahi ho sakta.';
  var pts = Number(en.points);
  if (!isFinite(pts) || !(pts >= 1) || Math.floor(pts) !== pts) return 'Points 1 ya usse zyada poore number me hone chahiye.';
  if (pts > 1e6) return 'Points bahut zyada hain — entry check karein.';
  if (en.type === 'redeem') {
    var bal = pointsBalance(entries, en.customerId).balance;
    if (pts > bal) return 'Balance sirf ' + bal + ' pts hai — utne ya kam redeem karein.';
  }
  return '';
}

/** Running-balance ledger rows for one customer, oldest first. */
function ledgerRows(entries, customerId) {
  var rows = (entries || [])
    .filter(function (x) { return x.customerId === customerId; })
    .slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  var bal = 0;
  return rows.map(function (x) {
    var p = Math.max(0, Math.floor(Number(x.points) || 0));
    bal += (x.type === 'earn' ? p : -p);
    return { id: x.id, date: x.date, type: x.type, note: x.note, points: p, balance: bal };
  });
}

/** CSV export of the full ledger. */
function ledgerCSV(entries, customers) {
  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function name(id) {
    var c = (customers || []).filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '(deleted)';
  }
  var rows = ['Customer,Date,Type,Points,Note'];
  (entries || []).forEach(function (x) {
    rows.push([q(name(x.customerId)), q(x.date), q(x.type), q(x.points), q(x.note)].join(','));
  });
  return rows.join('\r\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function lpInit() {
  var SLUG = 'loyalty-points-manager';
  var EXPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var customers = [];
  var entries = [];
  var cfg = { earnRate: 100, redeemValue: 1 };
  var selectedId = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Loyalty points program kaise kaam karta hai?',
      a: 'Aap earn rate set karte hain (jaise 1 point per ₹100). Har khareed par points judte hain; customer points redeem karke discount pa sakta hai — 1 point = aapke set kiye redeem value (₹) ke barabar.' },
    { q: 'Points balance kaise nikalta hai?',
      a: 'Balance = total earned − total redeemed. Redemption value = balance × redeem-value. Redeem balance se zyada nahi ho sakta — app ise rok deti hai.' },
    { q: 'Redeem balance se zyada ho to kya hota hai?',
      a: 'App entry reject kar deti hai aur error dikhati hai — negative balance possible nahi hai.' },
    { q: 'लॉयल्टी प्रोग्राम क्यों ज़रूरी है?',
      a: 'Loyalty points se customers wapas aate hain — unhe lagta hai unki har khareed ka kuchh fayda mil raha hai. Chhoti dukano ke liye ye repeat business ka sabse sasta tareeka hai.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Loyalty Points Manager — लॉयल्टी पॉइंट्स',
    description: 'Free loyalty points manager for Indian SMEs: per-customer points ledger — earn (1 pt per ₹X, configurable) & redeem entries, balance, redemption value, CSV export.',
    keywords: ['loyalty points manager', 'लॉयल्टी पॉइंट्स', 'loyalty program India', 'customer points ledger', 'reward points tracker', 'loyalty points calculator', 'redeem points']
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
    return Vault.save(SLUG, 'data', { customers: customers, entries: entries, cfg: cfg }).catch(function () {});
  }

  function custName(id) {
    var c = customers.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '—';
  }

  function refreshSelects() {
    var opts = customers.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
    el('e-cust').innerHTML = opts || '<option value="">— Add a customer first —</option>';
    el('sel-cust').innerHTML = opts || '<option value="">—</option>';
    if (selectedId && customers.some(function (c) { return c.id === selectedId; })) {
      el('sel-cust').value = selectedId;
    } else {
      selectedId = customers.length ? customers[0].id : null;
      if (selectedId) el('sel-cust').value = selectedId;
    }
  }

  function readConfig() {
    var c = { earnRate: parseFloat(el('lp-earnrate').value), redeemValue: parseFloat(el('lp-redeemval').value) };
    var verr = validateConfig(c);
    el('cfg-error').textContent = verr;
    if (!verr) { cfg = c; persist(); }
    return !verr;
  }

  function addCustomer() {
    var err = el('lp-error'); err.textContent = '';
    var name = el('lp-name').value.trim();
    if (!name) { err.textContent = 'Customer name is required.'; return; }
    if (name.length > 120) { err.textContent = 'Name 120 characters se zyada nahi ho sakta.'; return; }
    var c = { id: uid('c'), name: name, phone: el('lp-phone').value.trim().slice(0, 20) };
    customers.push(c);
    el('lp-name').value = ''; el('lp-phone').value = '';
    selectedId = c.id;
    persist().then(render);
  }

  function addEntry() {
    var err = el('e-error'); err.textContent = '';
    if (!readConfig()) { err.textContent = 'Pehle program settings sahi karein.'; return; }
    var type = document.querySelector('input[name="etype"]:checked').value;
    var en;
    if (type === 'earn') {
      var amt = parseFloat(el('e-amount').value);
      if (!isFinite(amt) || amt < 0) { err.textContent = 'Purchase amount sahi likhein (negative nahi).'; return; }
      if (amt > 1e8) { err.textContent = 'Amount bahut bada hai — entry check karein.'; return; }
      var pts = earnPointsFor(amt, cfg.earnRate);
      if (pts < 1) { err.textContent = 'Is amount par 0 points bante hain (earn rate ₹' + cfg.earnRate + '/pt).'; return; }
      en = { id: uid('e'), customerId: el('e-cust').value, type: 'earn', points: pts,
             date: el('e-date').value, note: 'Purchase ₹' + amt + (el('e-note').value.trim() ? ' · ' + el('e-note').value.trim().slice(0, 200) : '') };
    } else {
      en = { id: uid('e'), customerId: el('e-cust').value, type: 'redeem',
             points: parseInt(el('e-points').value, 10),
             date: el('e-date').value, note: el('e-note').value.trim().slice(0, 200) };
    }
    var verr = validateEntry(en, entries, cfg);
    if (verr) { err.textContent = verr; return; }
    entries.push(en);
    el('e-amount').value = ''; el('e-points').value = ''; el('e-note').value = '';
    selectedId = en.customerId;
    persist().then(render);
  }

  function render() {
    refreshSelects();
    var c = customers.filter(function (x) { return x.id === selectedId; })[0];
    el('balName').textContent = c ? c.name : '—';
    el('ledgerName').textContent = c ? c.name : '—';
    if (!c) {
      el('balPoints').textContent = '—'; el('balValue').textContent = '—';
      el('ledgerBody').innerHTML = '<tr><td colspan="6" class="vq-hint">Koi customer nahi hai — pehle customer add karein.</td></tr>';
      return;
    }
    var b = pointsBalance(entries, c.id);
    el('balPoints').textContent = b.balance + ' pts';
    el('balValue').textContent = inr(redemptionValue(b.balance, cfg.redeemValue)) +
      ' (earned ' + b.earned + ' · redeemed ' + b.redeemed + ')';

    var rows = ledgerRows(entries, c.id);
    el('ledgerBody').innerHTML = rows.length ? rows.map(function (r) {
      return '<tr><td>' + esc(r.date) + '</td>' +
        '<td><span class="pill ' + (r.type === 'earn' ? 'p-earn' : 'p-redeem') + '">' +
        (r.type === 'earn' ? 'Earn' : 'Redeem') + '</span></td>' +
        '<td>' + esc(r.note || '—') + '</td>' +
        '<td class="r">' + (r.type === 'earn' ? '+' + r.points : '—') + '</td>' +
        '<td class="r">' + (r.type === 'redeem' ? '−' + r.points : '—') + '</td>' +
        '<td class="r"><strong>' + r.balance + '</strong></td></tr>';
    }).join('') : '<tr><td colspan="6" class="vq-hint">Is customer ke liye abhi koi entry nahi hai.</td></tr>';
  }

  function downloadCSV() {
    el('lp-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, EXPORT_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('lp-upsell'), SLUG, EXPORT_LIMIT); return; }
    if (!entries.length) { el('e-error').textContent = 'Export ke liye pehle entry add karein.'; return; }
    var blob = new Blob([ledgerCSV(entries, customers)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'loyalty-ledger-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
    el('lp-saved').textContent = 'CSV exported ✓ (' + Freemium.remaining(SLUG, EXPORT_LIMIT) + ' free exports left today)';
  }

  async function saveSnapshot() {
    el('lp-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('lp-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), cfg: cfg,
        balances: customers.map(function (c) {
          return { name: c.name, balance: pointsBalance(entries, c.id).balance };
        })
      });
      el('lp-saved').textContent = 'Snapshot saved ✓ (' + Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('e-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addCustBtn').addEventListener('click', addCustomer);
  el('addEntryBtn').addEventListener('click', addEntry);
  el('sel-cust').addEventListener('change', function () { selectedId = el('sel-cust').value; render(); });
  el('lp-earnrate').addEventListener('change', readConfig);
  el('lp-redeemval').addEventListener('change', readConfig);
  el('exportBtn').addEventListener('click', downloadCSV);
  el('saveBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('e-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d) {
      if (Array.isArray(d.customers)) customers = d.customers;
      if (Array.isArray(d.entries)) entries = d.entries;
      if (d.cfg && !validateConfig(d.cfg)) {
        cfg = d.cfg;
        el('lp-earnrate').value = cfg.earnRate; el('lp-redeemval').value = cfg.redeemValue;
      }
    }
    if (customers.length) selectedId = customers[0].id;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lpInit);
  } else { lpInit(); }
}
