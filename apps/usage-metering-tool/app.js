/* ============================================================
   VisionQuantech Business Suite — Usage Metering Tool
   apps/usage-metering-tool/app.js

   Log API/tool usage per client, quota vs used, and estimate
   overage billing. On-device only.

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  var MAX_CLIENTS = 25;
  var MAX_UNITS = 1000000000;

  var _idCounter = 0;
  function makeId() {
    _idCounter += 1;
    return 'cli-' + Date.now().toString(36) + '-' + _idCounter + Math.floor(Math.random() * 1e6).toString(36);
  }

  function validateClient(c) {
    c = c || {};
    var name = String(c.name == null ? '' : c.name).trim();
    if (!name) return { ok: false, error: 'Enter a client name.' };
    if (name.length > 80) return { ok: false, error: 'Client name too long (max 80 characters).' };
    var quota = Number(c.quota);
    if (!isFinite(quota) || Math.floor(quota) !== quota) return { ok: false, error: 'Quota must be a whole number of units.' };
    if (quota <= 0 || quota > MAX_UNITS) return { ok: false, error: 'Quota must be between 1 and ' + MAX_UNITS.toLocaleString('en-IN') + '.' };
    var price = Number(c.unitPrice == null || c.unitPrice === '' ? 0 : c.unitPrice);
    if (!isFinite(price) || price < 0) return { ok: false, error: 'Overage price must be zero or more (₹ per unit).' };
    if (price > 1000000) return { ok: false, error: 'Overage price looks too large.' };
    return { ok: true, value: { name: name, quota: quota, unitPrice: price } };
  }

  function addClient(list, c) {
    list = Array.isArray(list) ? list : [];
    if (list.length >= MAX_CLIENTS) return { ok: false, error: 'Maximum ' + MAX_CLIENTS + ' clients can be tracked.' };
    var v = validateClient(c);
    if (!v.ok) return v;
    var rec = { id: makeId(), name: v.value.name, quota: v.value.quota, unitPrice: v.value.unitPrice, used: 0 };
    return { ok: true, client: rec, list: list.concat([rec]) };
  }

  function validateUnits(u) {
    var n = Number(u);
    if (!isFinite(n) || Math.floor(n) !== n) return { ok: false, error: 'Units must be a whole number.' };
    if (n <= 0) return { ok: false, error: 'Units must be greater than zero.' };
    if (n > MAX_UNITS) return { ok: false, error: 'Units value too large.' };
    return { ok: true, value: n };
  }

  function logUsage(list, id, units) {
    list = Array.isArray(list) ? list : [];
    var v = validateUnits(units);
    if (!v.ok) return v;
    var found = false;
    var nl = list.map(function (c) {
      if (c.id === id) { found = true; return { id: c.id, name: c.name, quota: c.quota, unitPrice: c.unitPrice, used: (c.used || 0) + v.value }; }
      return c;
    });
    if (!found) return { ok: false, error: 'Client not found.' };
    return { ok: true, list: nl };
  }

  function resetUsage(list, id) {
    list = Array.isArray(list) ? list : [];
    var found = false;
    var nl = list.map(function (c) {
      if (c.id === id) { found = true; return { id: c.id, name: c.name, quota: c.quota, unitPrice: c.unitPrice, used: 0 }; }
      return c;
    });
    if (!found) return { ok: false, error: 'Client not found.' };
    return { ok: true, list: nl };
  }

  function removeClient(list, id) {
    list = Array.isArray(list) ? list : [];
    return { ok: true, list: list.filter(function (c) { return c.id !== id; }) };
  }

  /** Quota status: ok | near (>=80%) | at (=100%) | over (>100%). */
  function quotaStatus(used, quota) {
    used = +used || 0; quota = +quota || 0;
    if (quota <= 0) return { ok: false, error: 'Invalid quota.' };
    var pct = Math.round((used / quota) * 1000) / 10;
    var level = pct > 100 ? 'over' : pct >= 100 ? 'at' : pct >= 80 ? 'near' : 'ok';
    return { ok: true, used: used, quota: quota, pct: pct, level: level, remaining: Math.max(0, quota - used) };
  }

  /** Overage billing estimate: {overUnits, amount}. */
  function overageBill(used, quota, unitPrice, freeOverage) {
    used = +used || 0; quota = +quota || 0; unitPrice = +unitPrice || 0; freeOverage = Math.max(0, Math.floor(+freeOverage || 0));
    if (quota <= 0) return { ok: false, error: 'Invalid quota.' };
    if (unitPrice < 0) return { ok: false, error: 'Invalid unit price.' };
    var over = Math.max(0, used - quota - freeOverage);
    return { ok: true, overUnits: over, amount: Math.round(over * unitPrice * 100) / 100 };
  }

  /** Portfolio rollup: total overage revenue estimate across clients. */
  function portfolioBill(list, freeOverage) {
    list = Array.isArray(list) ? list : [];
    var total = 0, clientsOver = 0;
    list.forEach(function (c) {
      var b = overageBill(c.used, c.quota, c.unitPrice, freeOverage);
      if (b.ok && b.overUnits > 0) { clientsOver++; total += b.amount; }
    });
    return { ok: true, clientsOver: clientsOver, total: Math.round(total * 100) / 100 };
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
    MAX_CLIENTS: MAX_CLIENTS,
    validateClient: validateClient, addClient: addClient,
    validateUnits: validateUnits, logUsage: logUsage,
    resetUsage: resetUsage, removeClient: removeClient,
    quotaStatus: quotaStatus, overageBill: overageBill,
    portfolioBill: portfolioBill, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* ---------------- browser UI ---------------- */
  var SLUG = 'usage-metering-tool';
  var FREE_LIMIT = 20;

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('u-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : '');
  }

  var LEVEL_LABEL = { ok: 'OK', near: '≥80% — near quota', at: 'At quota', over: 'Over quota' };
  var LEVEL_CLASS = { ok: 'b-ok', near: 'b-warning', at: 'b-watch', over: 'b-overdue' };

  function gated(fn) {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell($('u-gate'), SLUG, FREE_LIMIT); $('u-gate').scrollIntoView({ behavior: 'smooth' }); return false; }
    fn(); return true;
  }

  function render(list) {
    var html = '';
    if (!list.length) {
      html = '<p class="vq-hint">No clients yet. Add your first client above.</p>';
    } else {
      html = '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
        '<th>Client</th><th>Used / quota</th><th>Status</th><th>Overage bill</th><th></th></tr></thead><tbody>';
      list.forEach(function (c) {
        var st = quotaStatus(c.used, c.quota);
        var bill = overageBill(c.used, c.quota, c.unitPrice, 0);
        var barPct = Math.min(100, st.pct);
        html += '<tr><td><strong>' + esc(c.name) + '</strong><br><span class="vq-hint">₹' + c.unitPrice + '/unit overage</span></td>' +
          '<td>' + c.used.toLocaleString('en-IN') + ' / ' + c.quota.toLocaleString('en-IN') +
          '<div class="bar"><div class="bar-fill ' + st.level + '" style="width:' + barPct + '%"></div></div>' +
          '<span class="vq-hint">' + st.pct + '% used · ' + st.remaining.toLocaleString('en-IN') + ' left</span></td>' +
          '<td><span class="badge ' + LEVEL_CLASS[st.level] + '">' + LEVEL_LABEL[st.level] + '</span></td>' +
          '<td>' + (bill.overUnits > 0 ? '<strong>' + fmtINR(bill.amount) + '</strong><br><span class="vq-hint">' + bill.overUnits.toLocaleString('en-IN') + ' units over</span>' : '<span class="vq-hint">—</span>') + '</td>' +
          '<td><button class="vq-btn ghost u-reset" data-id="' + esc(c.id) + '" type="button">Reset</button> ' +
          '<button class="vq-btn ghost u-del" data-id="' + esc(c.id) + '" type="button">Remove</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    var pf = portfolioBill(list, 0);
    html = '<p class="big">' + fmtINR(pf.total) + ' <span class="vq-hint">estimated overage billing</span></p>' +
      '<p class="vq-hint">' + pf.clientsOver + ' client(s) over quota.</p>' + html;
    $('u-list').innerHTML = html;

    var sel = $('u-client');
    sel.innerHTML = list.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');

    function bind(cls, fn) {
      Array.prototype.forEach.call($('u-list').querySelectorAll('.' + cls), function (b) {
        b.addEventListener('click', function () {
          gated(function () {
            readList().then(function (l) {
              var r = fn(l, b.getAttribute('data-id'));
              if (!r.ok) { msg(r.error, false); return; }
              saveList(r.list).then(function () { render(r.list); msg('Updated.', true); });
            });
          });
        });
      });
    }
    bind('u-reset', resetUsage);
    bind('u-del', removeClient);
  }

  function readList() {
    return Vault.load(SLUG, 'clients').then(function (r) {
      return (r && Array.isArray(r.value)) ? r.value : [];
    });
  }
  function saveList(list) { return Vault.save(SLUG, 'clients', list.slice(0, MAX_CLIENTS)); }

  function init() {
    Ads.render($('ad-top'), 'usage-metering-tool-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'usage-metering-tool-bottom', 'leaderboard');
    SEO.faq([
      { q: 'What is usage metering for?', a: 'If you sell API access or metered tools, log each client\u2019s consumed units against their quota, watch the 80% near-quota band, and estimate overage bills automatically.' },
      { q: 'यूसेज मीटरींग क्या है?', a: 'अगर आप API या टूल की यूसेज बेचते हैं, तो हर क्लाइंट की खपत कोटा के मुकाबले दर्ज करें और ओवरेज बिल का अनुमान पाएं।' },
      { q: 'When is a client flagged near quota?', a: 'At 80% of quota the status flips to "near quota"; at 100% "at quota"; above 100% "over quota" with an overage amount.' },
      { q: 'Is usage data uploaded anywhere?', a: 'No. Client quotas and usage logs stay in the on-device vault in your browser.' }
    ]);
    readList().then(render);

    $('u-add').addEventListener('click', function () {
      gated(function () {
        readList().then(function (list) {
          var r = addClient(list, { name: $('u-name').value, quota: $('u-quota').value, unitPrice: $('u-price').value });
          if (!r.ok) { msg(r.error, false); return; }
          saveList(r.list).then(function () {
            msg('Client added: ' + r.client.name + ' (' + r.client.quota.toLocaleString('en-IN') + ' units).', true);
            $('u-name').value = ''; $('u-quota').value = ''; $('u-price').value = '';
            render(r.list);
          });
        });
      });
    });

    $('u-log').addEventListener('click', function () {
      gated(function () {
        readList().then(function (list) {
          var r = logUsage(list, $('u-client').value, $('u-units').value);
          if (!r.ok) { msg(r.error, false); return; }
          saveList(r.list).then(function () {
            msg('Logged ' + Number($('u-units').value).toLocaleString('en-IN') + ' units.', true);
            $('u-units').value = '';
            render(r.list);
          });
        });
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
