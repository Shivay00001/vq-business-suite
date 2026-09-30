/* ============================================================
   VisionQuantech Business Suite — Long-Term Data Preservation Tool
   apps/long-term-data-preservation-tool/app.js

   Statutory record-retention schedule for India: per document
   type, how long records must be kept, under which law, and when
   a given batch becomes eligible for destruction. Sources are
   shown on-screen; figures verified via web search Sep 2026.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var MAX_ITEMS = 25;

  /* Verified Sep 2026. Basis tells the user which reference date to enter. */
  var RETENTION = [
    { id: 'books-companies', doc: 'Books of account + vouchers (company)', years: 8, basis: 'fy-end',
      statute: 'Companies Act, 2013 — Sec 128(5)',
      note: 'Min 8 financial years immediately preceding the current FY. Longer if an investigation is ordered.',
      src: 'https://taxguru.in/company-law/maintenance-books-accounts-section-128-companies-act-2013.html' },
    { id: 'books-incometax', doc: 'Specified books of account (income-tax)', years: 6, basis: 'ay-end',
      statute: 'Income-tax Act, 1961 (Rule 6F)',
      note: '6 years from the end of the relevant assessment year \u2014 effectively ~8 previous years.',
      src: 'https://www.bcasonline.org/Referencer2016-17/Other%20Laws/period_of_preservation_of_accounts_records.html' },
    { id: 'transfer-pricing', doc: 'Transfer pricing documentation (Rule 10D)', years: 8, basis: 'ay-end',
      statute: 'Income-tax Rules, 1962 — Rule 10D',
      note: '8 years from the end of the relevant AY (\u224810 previous years).',
      src: 'https://www.bcasonline.org/Referencer2016-17/Other%20Laws/period_of_preservation_of_accounts_records.html' },
    { id: 'foreign-asset', doc: 'Records where foreign-asset income escaped assessment', years: 16, basis: 'ay-end',
      statute: 'Income-tax Act, 1961 (reopening provisions)',
      note: '16 years from the end of the relevant AY \u2014 keep until the extended window closes.',
      src: 'https://www.bcasonline.org/Referencer2016-17/Other%20Laws/period_of_preservation_of_accounts_records.html' },
    { id: 'gst-records', doc: 'GST books, invoices, returns, ITC records', years: 0, months: 72, basis: 'gst-ar',
      statute: 'CGST Act, 2017 — Sec 36',
      note: '72 months (6 years) from the due date of the annual return for the FY.',
      src: 'https://www.caclubindia.com/articles/how-long-must-you-keep-your-books-of-accounts-under-gst-54470.asp' },
    { id: 'esi-register', doc: 'ESI employee register (Form 7)', years: 5, basis: 'last-entry',
      statute: 'ESI (General) Regulations, 1950 — Rule 32',
      note: 'Preserve 5 years from the date of the last entry. ESIC circular 28-01-2020: officers may not demand records beyond 5 years.',
      src: 'https://www.lawyersclubindia.com/forum/esic-record-maintenance-9537.asp' },
    { id: 'esi-accident', doc: 'ESI accident book (Form 11)', years: 5, basis: 'last-entry',
      statute: 'ESI (General) Regulations, 1950 — Rule 66',
      note: 'Preserve 5 years from the date of the last entry.',
      src: 'https://www.lawyersclubindia.com/forum/esic-record-maintenance-9537.asp' },
    { id: 'wages-register', doc: 'Wage registers (Payment of Wages Act)', years: 3, basis: 'last-entry',
      statute: 'Payment of Wages Act, 1936 — Sec 13A(2)',
      note: 'Preserve 3 years after the date of the last entry.',
      src: 'https://indiankanoon.org/doc/186852307/' },
    { id: 'pf-register', doc: 'PF wage/EPF records', years: 6, basis: 'last-entry',
      statute: 'EPF Act guidance (forum-advised — confirm with consultant)',
      note: 'Commonly advised: not less than 6 years from when particulars were last recorded. Grey area — confirm with your PF consultant.',
      src: 'https://www.CAclubindia.com/forum/epf-employees-provident-fund-440602.asp' }
  ];

  var BASIS_LABEL = {
    'fy-end': 'Financial year end (31 March of the FY)',
    'ay-end': 'End of the relevant assessment year (31 March)',
    'last-entry': 'Date of the last entry in the register',
    'gst-ar': 'Due date of the GST annual return for that FY'
  };

  var _idCounter = 0;
  function makeId() {
    _idCounter += 1;
    return 'ret-' + Date.now().toString(36) + '-' + _idCounter + Math.floor(Math.random() * 1e6).toString(36);
  }

  function retentionFor(id) {
    for (var i = 0; i < RETENTION.length; i++) if (RETENTION[i].id === id) return RETENTION[i];
    return null;
  }

  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
    return dt;
  }

  function addPeriod(dt, years, months) {
    var y = dt.getUTCFullYear() + (years || 0);
    var mo = dt.getUTCMonth() + (months || 0);
    y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
    var day = dt.getUTCDate();
    var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(day, last)));
  }

  function isoOf(dt) {
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }

  /** Earliest date the batch may be destroyed = ref + retention period. */
  function destroyAfter(entry, refISO) {
    if (!entry) return { ok: false, error: 'Pick a document type.' };
    var ref = parseISO(refISO);
    if (!ref) return { ok: false, error: 'Enter a valid reference date (YYYY-MM-DD).' };
    return { ok: true, destroyDate: isoOf(addPeriod(ref, entry.years, entry.months)) };
  }

  /** Keep-or-destroy status as of asOfISO. */
  function status(entry, refISO, asOfISO) {
    var d = destroyAfter(entry, refISO);
    if (!d.ok) return d;
    var asOf = parseISO(asOfISO);
    if (!asOf) return { ok: false, error: 'Invalid "as of" date.' };
    var dd = parseISO(d.destroyDate);
    var daysLeft = Math.round((dd.getTime() - asOf.getTime()) / 86400000);
    return {
      ok: true, destroyDate: d.destroyDate, daysLeft: daysLeft,
      state: daysLeft <= 0 ? 'eligible' : 'keep',
      verdict: daysLeft <= 0
        ? 'Eligible for destruction review — retention period has run. Confirm no litigation/appeal/investigation is open before destroying.'
        : 'KEEP — ' + daysLeft + ' day(s) left before the statutory minimum runs.'
    };
  }

  function addItem(list, item) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_ITEMS) return { ok: false, error: 'Maximum ' + MAX_ITEMS + ' tracked batches.' };
    var entry = retentionFor(item.typeId);
    if (!entry) return { ok: false, error: 'Pick a document type.' };
    var ref = parseISO(item.ref);
    if (!ref) return { ok: false, error: 'Enter a valid reference date (YYYY-MM-DD).' };
    var d = destroyAfter(entry, item.ref);
    var label = String(item.label == null ? '' : item.label).trim().slice(0, 60);
    var rec = { id: makeId(), typeId: entry.id, label: label || entry.doc, ref: item.ref,
            destroyDate: d.destroyDate, statute: entry.statute };
    return { ok: true, item: rec, list: list.concat([rec]) };
  }

  function removeItem(list, id) {
    list = Array.isArray(list) ? list : [];
    return { ok: true, list: list.filter(function (x) { return x.id !== id; }) };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_ITEMS: MAX_ITEMS, RETENTION: RETENTION, BASIS_LABEL: BASIS_LABEL,
    retentionFor: retentionFor, destroyAfter: destroyAfter, status: status,
    addItem: addItem, removeItem: removeItem, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'long-term-data-preservation-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('d-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function render(list) {
    var asOf = todayISO();
    var html = '';
    if (!list.length) {
      html = '<p class="vq-hint">No batches tracked yet. Add your first one above.</p>';
    } else {
      html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
        '<th>Batch</th><th>Statute</th><th>Reference</th><th>May destroy after</th><th>Status</th><th></th></tr></thead><tbody>';
      list.forEach(function (x) {
        var entry = retentionFor(x.typeId);
        var st = entry ? status(entry, x.ref, asOf) : null;
        html += '<tr><td><strong>' + esc(x.label) + '</strong></td>' +
          '<td><span class="vq-hint">' + esc(x.statute) + '</span></td>' +
          '<td>' + esc(x.ref) + '</td><td>' + esc(x.destroyDate) + '</td>' +
          '<td>' + (st ? (st.state === 'eligible'
              ? '<span class="badge b-watch">Review — eligible</span>'
              : '<span class="badge b-ok">Keep (' + st.daysLeft + 'd)</span>') : '—') + '</td>' +
          '<td><button class="vq-btn ghost d-del" data-id="' + esc(x.id) + '" type="button">Remove</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    $('d-list').innerHTML = html;
    Array.prototype.forEach.call($('d-list').querySelectorAll('.d-del'), function (b) {
      b.addEventListener('click', function () {
        var gate = Freemium.check(SLUG, FREE_LIMIT);
        if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); return; }
        readList().then(function (l) {
          var nl = removeItem(l, b.getAttribute('data-id')).list;
          saveList(nl).then(function () { render(nl); });
        });
      });
    });
  }

  function readList() {
    return Vault.load(SLUG, 'batches').then(function (r) {
      return (r && Array.isArray(r.value)) ? r.value : [];
    });
  }
  function saveList(list) { return Vault.save(SLUG, 'batches', list.slice(0, MAX_ITEMS)); }

  function updateBasisHint() {
    var entry = retentionFor($('d-type').value);
    $('d-basis').textContent = entry ? 'Reference date needed: ' + BASIS_LABEL[entry.basis] + '. ' + entry.note : '';
  }

  function init() {
    Ads.render($('ad-top'), 'long-term-data-preservation-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'long-term-data-preservation-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How long must books of account be kept in India?', a: 'A company must preserve books of account and vouchers for at least 8 financial years (Companies Act, 2013, Sec 128(5)); income-tax books for 6 years from the end of the relevant AY; GST records for 72 months from the annual-return due date.' },
      { q: 'भारत में रिकॉर्ड कितने साल रखने होते हैं?', a: 'कंपनी की बही-खाते कम से कम 8 वित्तीय वर्ष (कंपनी अधिनियम 2013, धारा 128(5)); आयकर बही संबंधित निर्धारण वर्ष के अंत से 6 वर्ष; GST रिकॉर्ड वार्षिक रिटर्न की देय तिथि से 72 महीने।' },
      { q: 'Can I destroy records as soon as the period ends?', a: 'Only after confirming no litigation, appeal, assessment or investigation is open that needs them. This tool flags eligibility for review \u2014 the destruction decision stays with you and your CA.' },
      { q: 'Where do the retention periods come from?', a: 'Each row shows its statute and a source link \u2014 verified via web search in September 2026. They are minimums; keeping longer is always safe.' }
    ]);

    $('d-type').innerHTML = RETENTION.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.doc) + ' — ' + esc(e.statute) + '</option>';
    }).join('');
    $('d-type').addEventListener('change', updateBasisHint);
    updateBasisHint();
    readList().then(render);

    $('d-check').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var entry = retentionFor($('d-type').value);
      var st = status(entry, $('d-ref').value, todayISO());
      if (!st.ok) { msg(st.error, false); return; }
      $('d-result').innerHTML = '<p>' + esc(entry.doc) + '</p>' +
        '<p>May be destroyed after: <span class="big">' + esc(st.destroyDate) + '</span></p>' +
        '<p class="' + (st.state === 'eligible' ? 'msg-err' : 'msg-ok') + '">' + esc(st.verdict) + '</p>' +
        '<p class="vq-hint">' + esc(entry.statute) + ' · ' + esc(entry.note) + '</p>';
      $('d-result-card').hidden = false;
      msg('', null);
    });

    $('d-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('d-gate'), SLUG, FREE_LIMIT); $('d-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      readList().then(function (list) {
        var r = addItem(list, { typeId: $('d-type').value, ref: $('d-ref').value, label: $('d-label').value });
        if (!r.ok) { msg(r.error, false); return; }
        saveList(r.list).then(function () {
          msg('Batch tracked. May destroy after ' + r.item.destroyDate + ' (statutory minimum).', true);
          $('d-label').value = '';
          render(r.list);
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
