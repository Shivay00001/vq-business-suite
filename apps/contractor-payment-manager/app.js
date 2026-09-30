/* ============================================================
   VisionQuantech Business Suite — Contractor Payment Manager
   apps/contractor-payment-manager/app.js

   Pure functions first (no DOM) — tested under node.
   RA (running account) bill register for contractors: bill no,
   date, certified value, amount paid, holdback %, unpaid balance
   and aging buckets (current / 31-60 / 61-90 / 90+ days).
   Paid can never exceed certified; holdback is part of the
   certified value held back (like retention on the bill).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_BILLS = 25;
  var MAX_BILLNO = 40;
  var MAX_AMOUNT = 100000000000;
  var MAX_HOLDBACK = 25;

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
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function addBill(list, b) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_BILLS) return { ok: false, error: 'Bill register is full (max ' + MAX_BILLS + '). Remove one first.' };
    b = b || {};
    var no = text(b.billNo, 'Bill no.', MAX_BILLNO);
    if (!no.ok) return no;
    var dup = list.some(function (x) { return x.billNo.toLowerCase() === no.value.toLowerCase(); });
    if (dup) return { ok: false, error: 'Bill no. "' + no.value + '" is already in the register.' };
    var dt = parseDate(b.date, 'Bill date');
    if (!dt.ok) return dt;
    var cert = num(b.certified, 'Certified value', 0, MAX_AMOUNT);
    if (!cert.ok) return cert;
    if (cert.value <= 0) return { ok: false, error: 'Certified value must be greater than zero.' };
    var paid = num(b.paid == null || b.paid === '' ? 0 : b.paid, 'Amount paid', 0, MAX_AMOUNT);
    if (!paid.ok) return paid;
    if (paid.value > cert.value) return { ok: false, error: 'Amount paid (' + paid.value.toLocaleString('en-IN') + ') cannot exceed certified value (' + cert.value.toLocaleString('en-IN') + ').' };
    var hb = num(b.holdbackPct == null || b.holdbackPct === '' ? 0 : b.holdbackPct, 'Holdback %', 0, MAX_HOLDBACK);
    if (!hb.ok) return hb;
    var rec = {
      id: uid(), billNo: no.value, date: dt.value,
      certified: round2(cert.value), paid: round2(paid.value),
      holdbackPct: round2(hb.value)
    };
    return { ok: true, bill: rec, list: list.concat([rec]) };
  }

  function removeBill(list, id) {
    list = Array.isArray(list) ? list : [];
    var nl = list.filter(function (b) { return b.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Bill not found.' };
    return { ok: true, list: nl };
  }

  function recordPayment(list, id, amount) {
    list = Array.isArray(list) ? list : [];
    var amt = num(amount, 'Payment amount', 0, MAX_AMOUNT);
    if (!amt.ok) return amt;
    if (amt.value <= 0) return { ok: false, error: 'Payment amount must be greater than zero.' };
    var found = false;
    var nl = list.map(function (b) {
      if (b.id !== id) return b;
      found = true;
      var np = round2(b.paid + amt.value);
      if (np > b.certified) return null; // signal overpay
      return Object.assign({}, b, { paid: np });
    });
    if (!found) return { ok: false, error: 'Bill not found.' };
    if (nl.some(function (b) { return b === null; })) return { ok: false, error: 'Payment would exceed the certified value — reduce the amount.' };
    return { ok: true, list: nl };
  }

  function billStats(b, now) {
    var holdback = round2(b.certified * b.holdbackPct / 100);
    var unpaid = round2(b.certified - b.paid);
    var age = dayNum(now || todayStr()) - dayNum(b.date);
    var bucket = age < 0 ? 'future' : age <= 30 ? 'current' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '90+';
    var collectible = round2(Math.max(0, unpaid - holdback)); // unpaid excluding holdback
    return { ok: true, holdback: holdback, unpaid: unpaid, collectible: collectible, ageDays: age, bucket: bucket };
  }

  function registerSummary(list, now) {
    list = Array.isArray(list) ? list : [];
    var s = {
      bills: list.length, certified: 0, paid: 0, unpaid: 0,
      holdback: 0, collectible: 0,
      buckets: { current: 0, '31-60': 0, '61-90': 0, '90+': 0 }
    };
    list.forEach(function (b) {
      var st = billStats(b, now);
      s.certified = round2(s.certified + b.certified);
      s.paid = round2(s.paid + b.paid);
      s.unpaid = round2(s.unpaid + st.unpaid);
      s.holdback = round2(s.holdback + st.holdback);
      s.collectible = round2(s.collectible + st.collectible);
      if (st.bucket !== 'future' && s.buckets[st.bucket] != null) {
        s.buckets[st.bucket] = round2(s.buckets[st.bucket] + st.unpaid);
      }
    });
    s.recoveryPct = s.certified > 0 ? round2(s.paid / s.certified * 100) : 0;
    return { ok: true, summary: s };
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
    MAX_BILLS: MAX_BILLS,
    addBill: addBill, removeBill: removeBill, recordPayment: recordPayment,
    billStats: billStats, registerSummary: registerSummary,
    fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'contractor-payment-manager';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'ra-bills';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('a-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { bills: [] };

  function renderList() {
    var box = $('a-list');
    var s = registerSummary(state.bills).summary;
    $('a-summary').innerHTML =
      '<div class="sum-strip">' +
      '<span>Bills: <strong>' + s.bills + '</strong></span>' +
      '<span>Certified: <strong>' + fmtINR(s.certified) + '</strong></span>' +
      '<span class="pos">Paid: <strong>' + fmtINR(s.paid) + '</strong> (' + s.recoveryPct + '%)</span>' +
      '<span class="neg">Unpaid: <strong>' + fmtINR(s.unpaid) + '</strong></span>' +
      '<span>Holdback: <strong>' + fmtINR(s.holdback) + '</strong></span>' +
      '<span>Collectible (excl. holdback): <strong>' + fmtINR(s.collectible) + '</strong></span>' +
      '</div>' +
      '<div class="sum-strip"><span><strong>Aging of unpaid:</strong></span>' +
      '<span>0–30d: <strong>' + fmtINR(s.buckets.current) + '</strong></span>' +
      '<span>31–60d: <strong>' + fmtINR(s.buckets['31-60']) + '</strong></span>' +
      '<span>61–90d: <strong>' + fmtINR(s.buckets['61-90']) + '</strong></span>' +
      '<span class="neg">90d+: <strong>' + fmtINR(s.buckets['90+']) + '</strong></span></div>';
    if (!state.bills.length) {
      box.innerHTML = '<p class="vq-hint">No bills yet — add your first RA bill above.</p>';
      return;
    }
    var sorted = state.bills.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    var html = '<table class="vq-table"><thead><tr><th>Bill</th><th>Date</th><th>Certified</th><th>Paid</th><th>Unpaid</th><th>Holdback</th><th>Aging</th><th></th></tr></thead><tbody>';
    sorted.forEach(function (b) {
      var st = billStats(b);
      var age = st.ageDays < 0 ? 'future' : st.ageDays + 'd (' + st.bucket + ')';
      html += '<tr><td>' + esc(b.billNo) + '</td><td>' + esc(b.date) + '</td><td>' + fmtINR(b.certified) + '</td>' +
        '<td>' + fmtINR(b.paid) + '</td><td class="' + (st.unpaid > 0 ? 'neg' : '') + '">' + fmtINR(st.unpaid) + '</td>' +
        '<td>' + fmtINR(st.holdback) + ' (' + b.holdbackPct + '%)</td><td>' + esc(age) + '</td>' +
        '<td><button type="button" class="vq-btn vq-btn-ghost mini" data-pay="' + esc(b.id) + '">+ Payment</button> ' +
        '<button type="button" class="vq-btn vq-btn-ghost mini" data-remove="' + esc(b.id) + '">×</button></td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), bills: state.bills.slice(0, MAX_BILLS) });
      msg('Register saved on this device (' + state.bills.length + ' bill(s)).', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.bills)) { state.bills = rec.bills.slice(0, MAX_BILLS); renderList(); }
    } catch (e) { /* nothing saved yet */ }
  }

  function init() {
    Ads.render($('ad-top'), 'contractor-payment-manager-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'contractor-payment-manager-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is an RA bill in construction contracts?', a: 'A Running Account bill — the contractor\u2019s periodic claim for work done. The client\u2019s engineer certifies a value; payment follows, usually minus holdback/retention and statutory deductions (TDS, GST).' },
      { q: 'RA बिल क्या है?', a: 'रनिंग अकाउंट बिल — ठेकेदार का समय-समय पर कार्य का दावा। ग्राहक का इंजीनियर मूल्य प्रमाणित करता है; होल्डबैक और वैधानिक कटौतियों (TDS, GST) के बाद भुगतान होता है।' },
      { q: 'What is holdback on a bill?', a: 'A % of each certified bill held back by the client (like retention on the bill), typically released with the retention money after the defect liability period.' },
      { q: 'बकाया भुगतान कैसे ट्रैक करें?', a: 'हर बिल की तिथि से उम्र (aging) निकालें — 0–30, 31–60, 61–90, 90+ दिन। 90+ दिन का बकाया तुरंत फॉलो-अप माँगता है।' },
      { q: 'Is this accounting advice?', a: 'No — a receivables planning aid. Confirm TDS/GST treatment and contract terms with your CA.' }
    ]);

    $('a-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('a-gate'), SLUG, FREE_LIMIT); $('a-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addBill(state.bills, {
        billNo: $('a-no').value, date: $('a-date').value,
        certified: $('a-cert').value, paid: $('a-paid').value, holdbackPct: $('a-hb').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      state.bills = r.list;
      msg('Bill added. ' + gate.remaining + ' free use(s) left today.', true);
      $('a-no').value = ''; $('a-date').value = ''; $('a-cert').value = ''; $('a-paid').value = '';
      renderList();
    });

    $('a-list').addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.dataset) return;
      if (b.dataset.pay) {
        var amt = window.prompt('Payment received against this bill (₹):', '');
        if (amt == null || amt === '') return;
        var r = recordPayment(state.bills, b.dataset.pay, amt);
        if (r.ok) { state.bills = r.list; renderList(); msg('Payment recorded.', true); }
        else msg(r.error, false);
      } else if (b.dataset.remove) {
        var dr = removeBill(state.bills, b.dataset.remove);
        if (dr.ok) { state.bills = dr.list; renderList(); }
      }
    });

    $('a-save').addEventListener('click', persist);
    renderList();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
