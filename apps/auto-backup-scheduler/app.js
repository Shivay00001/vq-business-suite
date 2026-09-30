/* ============================================================
   VisionQuantech Business Suite — Auto Backup Scheduler
   apps/auto-backup-scheduler/app.js

   Backup plan builder: what to back up, where, how often.
   Validates the 3-2-1 rule (3 copies, 2 media types, 1 off-site)
   and lists the next backup dates. Plans saved on-device.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var MAX_PLANS = 25;
  var FREQS = ['daily', 'weekly', 'monthly'];

  var _idCounter = 0;
  function makeId() {
    _idCounter += 1;
    return 'bkp-' + Date.now().toString(36) + '-' + _idCounter + Math.floor(Math.random() * 1e6).toString(36);
  }

  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
    return dt;
  }

  function validatePlan(p) {
    p = p || {};
    var name = String(p.name == null ? '' : p.name).trim();
    if (!name) return { ok: false, error: 'Name the backup plan (e.g. "Tally + invoices").' };
    if (name.length > 80) return { ok: false, error: 'Plan name too long (max 80 characters).' };
    var what = String(p.what == null ? '' : p.what).trim();
    if (!what) return { ok: false, error: 'Say what gets backed up (e.g. "Tally data, invoice PDFs").' };
    if (what.length > 200) return { ok: false, error: 'Description too long (max 200 characters).' };
    if (FREQS.indexOf(p.freq) < 0) return { ok: false, error: 'Pick a frequency: daily, weekly or monthly.' };
    var where = String(p.where == null ? '' : p.where).trim();
    if (!where) return { ok: false, error: 'Say where backups are stored (e.g. "external HDD + Google Drive").' };
    var start = parseISO(p.start);
    if (!start) return { ok: false, error: 'Enter a valid start date (YYYY-MM-DD).' };
    var copies = Math.floor(Number(p.copies));
    if (!isFinite(copies) || copies < 1 || copies > 10) return { ok: false, error: 'Copies must be between 1 and 10.' };
    var media = Math.floor(Number(p.media));
    if (!isFinite(media) || media < 1 || media > 5) return { ok: false, error: 'Media types must be between 1 and 5.' };
    return {
      ok: true,
      value: { name: name, what: what, freq: p.freq, where: where, start: p.start,
               copies: copies, media: media, offsite: !!p.offsite }
    };
  }

  function addPlan(list, p) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_PLANS) return { ok: false, error: 'Maximum ' + MAX_PLANS + ' plans can be saved.' };
    var v = validatePlan(p);
    if (!v.ok) return v;
    var rec = { id: makeId(), name: v.value.name, what: v.value.what, freq: v.value.freq,
                where: v.value.where, start: v.value.start, copies: v.value.copies,
                media: v.value.media, offsite: v.value.offsite };
    return { ok: true, plan: rec, list: list.concat([rec]) };
  }

  function removePlan(list, id) {
    list = Array.isArray(list) ? list : [];
    return { ok: true, list: list.filter(function (p) { return p.id !== id; }) };
  }

  /**
   * 3-2-1 rule: >=3 copies, >=2 media types, >=1 off-site copy.
   */
  function threeTwoOne(plan) {
    plan = plan || {};
    var copiesOk = (plan.copies || 0) >= 3;
    var mediaOk = (plan.media || 0) >= 2;
    var offsiteOk = !!plan.offsite;
    var pass = copiesOk && mediaOk && offsiteOk;
    return {
      ok: true, copiesOk: copiesOk, mediaOk: mediaOk, offsiteOk: offsiteOk, pass: pass,
      verdict: pass ? 'PASS' : 'FAIL',
      advice: !copiesOk ? 'Keep at least 3 copies of your data.' :
              !mediaOk ? 'Use at least 2 different media types (e.g. external HDD + cloud).' :
              !offsiteOk ? 'Store at least 1 copy off-site (cloud or another location).' :
              '3-2-1 rule satisfied.'
    };
  }

  function isoOf(dt) {
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }

  /** Next n run dates from startISO for freq. */
  function nextRuns(startISO, freq, n) {
    var start = parseISO(startISO);
    if (!start) return { ok: false, error: 'Invalid start date.' };
    if (FREQS.indexOf(freq) < 0) return { ok: false, error: 'Invalid frequency.' };
    n = Math.max(1, Math.min(52, Math.floor(+n) || 12));
    var out = [];
    var d = new Date(start.getTime());
    for (var i = 0; i < n; i++) {
      out.push(isoOf(d));
      if (freq === 'daily') d = new Date(d.getTime() + 86400000);
      else if (freq === 'weekly') d = new Date(d.getTime() + 7 * 86400000);
      else {
        var y = d.getUTCFullYear(), mo = d.getUTCMonth();
        var nd = new Date(Date.UTC(mo === 11 ? y + 1 : y, (mo + 1) % 12, d.getUTCDate()));
        // clamp end-of-month overflow (Jan 31 → Feb 28/29)
        if (nd.getUTCDate() !== d.getUTCDate()) nd = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), 0));
        d = nd;
      }
    }
    return { ok: true, runs: out };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_PLANS: MAX_PLANS, FREQS: FREQS,
    validatePlan: validatePlan, addPlan: addPlan, removePlan: removePlan,
    threeTwoOne: threeTwoOne, nextRuns: nextRuns, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'auto-backup-scheduler';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('b-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function render(list) {
    var html = '';
    if (!list.length) {
      html = '<p class="vq-hint">No backup plans yet. Build your first one above.</p>';
    } else {
      html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
        '<th>Plan</th><th>What / where</th><th>Frequency</th><th>3-2-1</th><th>Next run</th><th></th></tr></thead><tbody>';
      list.forEach(function (p) {
        var r321 = threeTwoOne(p);
        var nr = nextRuns(p.start, p.freq, 1);
        html += '<tr><td><strong>' + esc(p.name) + '</strong></td>' +
          '<td>' + esc(p.what) + '<br><span class="vq-hint">' + esc(p.where) + ' · ' + p.copies + ' copies · ' + p.media + ' media' + (p.offsite ? ' · off-site' : '') + '</span></td>' +
          '<td>' + esc(p.freq) + '<br><span class="vq-hint">from ' + esc(p.start) + '</span></td>' +
          '<td><span class="badge ' + (r321.pass ? 'b-ok' : 'b-critical') + '">' + r321.verdict + '</span><br><span class="vq-hint">' + esc(r321.advice) + '</span></td>' +
          '<td>' + (nr.ok ? esc(nr.runs[0]) : '—') + '</td>' +
          '<td><button class="vq-btn ghost b-del" data-id="' + esc(p.id) + '" type="button">Remove</button></td></tr>';
      });
      html += '</tbody></table></div>';
      html += '<h3 class="vq-section-sub">Upcoming runs (next 12)</h3>';
      list.forEach(function (p) {
        var nr = nextRuns(p.start, p.freq, 12);
        if (nr.ok) html += '<p><strong>' + esc(p.name) + '</strong> <span class="vq-hint">(' + esc(p.freq) + ')</span><br><span class="vq-hint">' + nr.runs.map(esc).join(' · ') + '</span></p>';
      });
    }
    $('b-list').innerHTML = html;
    Array.prototype.forEach.call($('b-list').querySelectorAll('.b-del'), function (b) {
      b.addEventListener('click', function () {
        var gate = Freemium.check(SLUG, FREE_LIMIT);
        if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); return; }
        readList().then(function (l) {
          var nl = removePlan(l, b.getAttribute('data-id')).list;
          saveList(nl).then(function () { render(nl); });
        });
      });
    });
  }

  function readList() {
    return Vault.load(SLUG, 'plans').then(function (r) {
      return (r && Array.isArray(r.value)) ? r.value : [];
    });
  }
  function saveList(list) { return Vault.save(SLUG, 'plans', list.slice(0, MAX_PLANS)); }

  function init() {
    Ads.render($('ad-top'), 'auto-backup-scheduler-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'auto-backup-scheduler-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is the 3-2-1 backup rule?', a: 'Keep 3 copies of your data, on 2 different media types, with 1 copy off-site. This app checks your plan against that rule.' },
      { q: '3-2-1 बैकअप नियम क्या है?', a: 'डेटा की 3 प्रतियां, 2 अलग-अलग मीडिया पर, 1 प्रति ऑफ-साइट। यह ऐप आपकी योजना को इस नियम पर जांचता है।' },
      { q: 'How often should a small business back up?', a: 'Daily for active accounting data (Tally, invoices); weekly is the minimum for most small businesses. Monthly alone is rarely enough.' },
      { q: 'Where is my backup plan stored?', a: 'In the on-device vault in your browser. It lists when to back up — it does not back up files itself.' }
    ]);
    $('b-start').value = todayISO();
    readList().then(render);

    $('b-add').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('b-gate'), SLUG, FREE_LIMIT); $('b-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      readList().then(function (list) {
        var r = addPlan(list, {
          name: $('b-name').value, what: $('b-what').value, freq: $('b-freq').value,
          where: $('b-where').value, start: $('b-start').value,
          copies: $('b-copies').value, media: $('b-media').value, offsite: $('b-offsite').checked
        });
        if (!r.ok) { msg(r.error, false); return; }
        saveList(r.list).then(function () {
          var r321 = threeTwoOne(r.plan);
          msg('Plan saved. 3-2-1 check: ' + r321.verdict + ' — ' + r321.advice, r321.pass);
          $('b-name').value = ''; $('b-what').value = ''; $('b-where').value = '';
          render(r.list);
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
