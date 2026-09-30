/* ============================================================
   VisionQuantech Business Suite — Tender Deadline Tracker
   apps/tender-deadline-tracker/app.js

   Pure functions first (no DOM) — tested under node.
   Tracks tenders with submission deadlines, days-left math,
   urgency banding and per-tender document-checklist status.
   Dates are 'YYYY-MM-DD' strings; `now` is an optional override
   (used by tests) — otherwise the local calendar date is used.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_TENDERS = 25;
  var MAX_NAME = 120;
  var MAX_REF = 40;
  var MAX_AUTH = 80;
  var MAX_AMOUNT = 100000000000; // 1 lakh crore — sanity ceiling

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function parseDate(v, field) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: (field || 'Date') + ' must be in YYYY-MM-DD format.' };
    var parts = s.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) {
      return { ok: false, error: (field || 'Date') + ' is not a real calendar date.' };
    }
    return { ok: true, value: s };
  }

  function dayNum(iso) {
    var p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
  }

  function text(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return { ok: false, error: name + ' is required.' };
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function optText(v, name, max) {
    var s = String(v == null ? '' : v).trim();
    if (s.length > max) return { ok: false, error: name + ' must be at most ' + max + ' characters.' };
    return { ok: true, value: s };
  }

  function amount(v, name) {
    var n = Number(v);
    if (v === '' || v == null) return { ok: true, value: 0 };
    if (!isFinite(n)) return { ok: false, error: name + ' must be a number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (n > MAX_AMOUNT) return { ok: false, error: name + ' looks too large (max ₹' + MAX_AMOUNT.toLocaleString('en-IN') + ').' };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }

  function uid() {
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Days from `now` to `deadline` (whole days; negative = overdue). */
  function daysLeft(deadline, now) {
    var d = parseDate(deadline, 'Deadline');
    if (!d.ok) return d;
    var n = now ? parseDate(now, 'Reference date') : { ok: true, value: todayStr() };
    if (!n.ok) return n;
    return { ok: true, value: dayNum(d.value) - dayNum(n.value) };
  }

  /** Urgency band for a deadline. */
  function urgency(deadline, now) {
    var dl = daysLeft(deadline, now);
    if (!dl.ok) return dl;
    var days = dl.value;
    var band = days < 0 ? 'overdue' : days <= 3 ? 'critical' : days <= 7 ? 'soon' : 'normal';
    var label = days < 0 ? 'Overdue by ' + Math.abs(days) + ' day(s)'
      : days === 0 ? 'Due TODAY'
      : days === 1 ? 'Due tomorrow'
      : days + ' day(s) left';
    return { ok: true, days: days, band: band, label: label };
  }

  /** Document checklist completion. */
  function docPct(docs) {
    if (!Array.isArray(docs)) return { ok: false, error: 'Documents must be a list.' };
    var total = docs.length;
    var done = docs.filter(function (d) { return d && d.ready; }).length;
    var pct = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
    return { ok: true, done: done, total: total, pct: pct };
  }

  function parseDocList(raw) {
    var lines = String(raw == null ? '' : raw).split(/\r?\n/);
    var docs = [];
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      if (s.length > MAX_NAME) return { ok: false, error: 'A document name exceeds ' + MAX_NAME + ' characters.' };
      docs.push({ name: s, ready: false });
    }
    return { ok: true, value: docs };
  }

  function addTender(list, tender) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_TENDERS) return { ok: false, error: 'Tender list is full (max ' + MAX_TENDERS + ' tenders). Delete one first.' };
    tender = tender || {};
    var name = text(tender.name, 'Tender name', MAX_NAME);
    if (!name.ok) return name;
    var ref = optText(tender.ref, 'Tender reference', MAX_REF);
    if (!ref.ok) return ref;
    var auth = optText(tender.authority, 'Issuing authority', MAX_AUTH);
    if (!auth.ok) return auth;
    var dl = parseDate(tender.deadline, 'Submission deadline');
    if (!dl.ok) return dl;
    var emd = amount(tender.emd, 'EMD');
    if (!emd.ok) return emd;
    var fee = amount(tender.fee, 'Tender fee');
    if (!fee.ok) return fee;
    var docs = tender.docs;
    if (typeof docs === 'string') { var pd = parseDocList(docs); if (!pd.ok) return pd; docs = pd.value; }
    if (!Array.isArray(docs)) docs = [];
    var rec = {
      id: uid(), name: name.value, ref: ref.value, authority: auth.value,
      deadline: dl.value, emd: emd.value, fee: fee.value,
      docs: docs.map(function (d) { return { name: String(d.name).slice(0, MAX_NAME), ready: !!d.ready }; }),
      created: todayStr()
    };
    return { ok: true, tender: rec, list: list.concat([rec]) };
  }

  function removeTender(list, id) {
    list = Array.isArray(list) ? list : [];
    var nl = list.filter(function (t) { return t.id !== id; });
    if (nl.length === list.length) return { ok: false, error: 'Tender not found.' };
    return { ok: true, list: nl };
  }

  function toggleDoc(list, tenderId, docIndex) {
    list = Array.isArray(list) ? list : [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === tenderId) { idx = i; break; }
    if (idx < 0) return { ok: false, error: 'Tender not found.' };
    var docs = list[idx].docs || [];
    if (docIndex < 0 || docIndex >= docs.length) return { ok: false, error: 'Document not found.' };
    var nl = list.map(function (t, ti) {
      if (ti !== idx) return t;
      var nd = t.docs.map(function (d, di) {
        return di === docIndex ? { name: d.name, ready: !d.ready } : d;
      });
      return Object.assign({}, t, { docs: nd });
    });
    return { ok: true, list: nl };
  }

  function summarize(list, now) {
    list = Array.isArray(list) ? list : [];
    var counts = { total: list.length, overdue: 0, critical: 0, soon: 0, normal: 0 };
    var daysArr = [];
    for (var i = 0; i < list.length; i++) {
      var u = urgency(list[i].deadline, now);
      if (!u.ok) continue;
      counts[u.band]++;
      daysArr.push(u.days);
    }
    counts.nearest = daysArr.length ? Math.min.apply(null, daysArr) : null;
    return { ok: true, counts: counts };
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
    MAX_TENDERS: MAX_TENDERS,
    todayStr: todayStr, parseDate: parseDate, daysLeft: daysLeft,
    urgency: urgency, docPct: docPct, parseDocList: parseDocList,
    addTender: addTender, removeTender: removeTender, toggleDoc: toggleDoc,
    summarize: summarize, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'tender-deadline-tracker';
  var FREE_LIMIT = 20;
  var VAULT_KEY = 'tenders';

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('t-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  var state = { tenders: [] };

  function bandClass(band) {
    return band === 'overdue' ? 'u-overdue' : band === 'critical' ? 'u-critical' :
      band === 'soon' ? 'u-soon' : 'u-normal';
  }

  function renderList() {
    var box = $('t-list');
    if (!state.tenders.length) {
      box.innerHTML = '<p class="vq-hint">No tenders tracked yet — add your first one above.</p>';
      $('t-summary').innerHTML = '';
      return;
    }
    var sum = summarize(state.tenders);
    var c = sum.counts;
    $('t-summary').innerHTML =
      '<div class="sum-strip">' +
      '<span>Total: <strong>' + c.total + '</strong></span>' +
      '<span class="u-overdue">Overdue: <strong>' + c.overdue + '</strong></span>' +
      '<span class="u-critical">Critical (≤3d): <strong>' + c.critical + '</strong></span>' +
      '<span class="u-soon">Due soon (≤7d): <strong>' + c.soon + '</strong></span>' +
      '<span class="u-normal">Normal: <strong>' + c.normal + '</strong></span>' +
      '</div>';
    var sorted = state.tenders.slice().sort(function (a, b) { return dayNum(a.deadline) - dayNum(b.deadline); });
    var html = '';
    sorted.forEach(function (t) {
      var u = urgency(t.deadline);
      var dp = docPct(t.docs);
      html += '<div class="tender-card ' + bandClass(u.ok ? u.band : 'normal') + '">' +
        '<div class="t-head"><strong>' + esc(t.name) + '</strong>' +
        '<span class="badge">' + esc(u.ok ? u.label : '—') + '</span></div>' +
        '<p class="vq-hint">' + (t.ref ? 'Ref: ' + esc(t.ref) + ' · ' : '') +
        (t.authority ? esc(t.authority) + ' · ' : '') +
        'Deadline: <strong>' + esc(t.deadline) + '</strong>' +
        (t.emd ? ' · EMD: ' + fmtINR(t.emd) : '') + (t.fee ? ' · Fee: ' + fmtINR(t.fee) : '') + '</p>' +
        '<p class="vq-hint">Documents: <strong>' + dp.done + '/' + dp.total + '</strong> (' + dp.pct + '%)</p>' +
        '<div class="doc-list">' +
        t.docs.map(function (d, di) {
          return '<label class="doc-item"><input type="checkbox" data-tid="' + esc(t.id) +
            '" data-didx="' + di + '"' + (d.ready ? ' checked' : '') + '> ' + esc(d.name) + '</label>';
        }).join('') +
        '</div>' +
        '<button type="button" class="vq-btn vq-btn-ghost" data-remove="' + esc(t.id) + '">Remove</button>' +
        '</div>';
    });
    box.innerHTML = html;
  }

  async function persist() {
    try {
      await Vault.save(SLUG, VAULT_KEY, { savedAt: new Date().toISOString(), tenders: state.tenders.slice(0, MAX_TENDERS) });
      msg('Tender list saved on this device (' + state.tenders.length + ' tender(s)).', true);
    } catch (e) { msg('Could not save: ' + e.message, false); }
  }

  async function restore() {
    try {
      var rec = await Vault.load(SLUG, VAULT_KEY);
      if (rec && Array.isArray(rec.tenders)) { state.tenders = rec.tenders.slice(0, MAX_TENDERS); renderList(); }
    } catch (e) { /* first run — nothing saved */ }
  }

  function init() {
    Ads.render($('ad-top'), 'tender-deadline-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'tender-deadline-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I track tender submission deadlines?', a: 'Add each tender with its submission deadline from the NIT/GeM bid document. The tracker computes days left and color-codes urgency: red for overdue, orange for ≤3 days, amber for ≤7 days.' },
      { q: 'टेंडर डेडलाइन कैसे ट्रैक करें?', a: 'NIT या GeM दस्तावेज़ से सबमिशन डेडलाइन डालें। टूल बचे हुए दिन निकालकर रंग-कोड दिखाता है: लाल (अतिदेय), नारंगी (≤3 दिन), पीला (≤7 दिन)।' },
      { q: 'What happens if I miss a tender submission deadline?', a: 'Late bids are summarily rejected on GeM and in most government tenders — portals close exactly at the deadline time. Track both date and time from the bid document.' },
      { q: 'EMD कैसे ट्रैक करें?', a: 'हर टेंडर के साथ EMD राशि दर्ज करें। MSE/Startup पंजीकृत बोलीदाता कई टेंडरों में EMD से छूट पाते हैं (Bid Securing Declaration) — NIT ज़रूर देखें।' },
      { q: 'Is my tender data sent to any server?', a: 'No. Everything is stored only in your browser (this device), optionally encrypted with your own passphrase. Nothing leaves the device.' }
    ]);

    $('t-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('t-gate'), SLUG, FREE_LIMIT); $('t-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var r = addTender(state.tenders, {
        name: $('t-name').value, ref: $('t-ref').value, authority: $('t-authority').value,
        deadline: $('t-deadline').value, emd: $('t-emd').value, fee: $('t-fee').value,
        docs: $('t-docs').value
      });
      if (!r.ok) { msg(r.error, false); return; }
      state.tenders = r.list;
      msg('Tender added. ' + gate.remaining + ' free use(s) left today.', true);
      $('t-name').value = ''; $('t-ref').value = ''; $('t-deadline').value = '';
      $('t-emd').value = ''; $('t-fee').value = ''; $('t-docs').value = '';
      renderList();
    });

    $('t-list').addEventListener('change', function (e) {
      var cb = e.target;
      if (cb && cb.dataset && cb.dataset.tid != null && cb.dataset.didx != null) {
        var r = toggleDoc(state.tenders, cb.dataset.tid, parseInt(cb.dataset.didx, 10));
        if (r.ok) { state.tenders = r.list; renderList(); }
      }
    });
    $('t-list').addEventListener('click', function (e) {
      var b = e.target;
      if (b && b.dataset && b.dataset.remove) {
        var r = removeTender(state.tenders, b.dataset.remove);
        if (r.ok) { state.tenders = r.list; renderList(); msg('Tender removed.', true); }
      }
    });
    $('t-save').addEventListener('click', persist);
    $('t-clear').addEventListener('click', function () {
      if (window.confirm('Clear all tracked tenders from this view? (Saved snapshot stays in the vault.)')) {
        state.tenders = []; renderList();
      }
    });

    renderList();
    restore();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
