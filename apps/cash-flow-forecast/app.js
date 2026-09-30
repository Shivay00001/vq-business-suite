/* ============================================================
   VisionQuantech Business Suite — Cash Flow Forecast
   app.js for apps/cash-flow-forecast/

   Pure functions first (no DOM) — tested under node:
   projectCashFlow, summarize, cashChartSVG.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  /**
   * Project cash over `months`.
   * entries: [{type:'in'|'out', label, amount, recur:'once'|'monthly', start:1-based}]
   * Returns {rows:[{month,inflow,outflow,net,closing}], opening,
   *          minBalance, minMonth, survivalMonths, neverNegative}
   * survivalMonths = number of full months the balance stays >= 0.
   */
  function projectCashFlow(opening, entries, months) {
    var open = +opening || 0;
    months = Math.max(1, Math.min(36, Math.round(+months || 6)));
    var list = (entries || []).map(function (e) {
      return {
        type: e && e.type === 'out' ? 'out' : 'in',
        amount: Math.max(0, +((e && e.amount) || 0)),
        recur: e && e.recur === 'once' ? 'once' : 'monthly',
        start: Math.max(1, Math.min(months, Math.round(+((e && e.start) || 1))))
      };
    }).filter(function (e) { return e.amount > 0; });

    var rows = [], bal = open;
    var minBalance = open, minMonth = 0;
    for (var m = 1; m <= months; m++) {
      var inf = 0, outf = 0;
      list.forEach(function (e) {
        var active = e.recur === 'monthly' ? (m >= e.start) : (m === e.start);
        if (active) {
          if (e.type === 'in') inf += e.amount; else outf += e.amount;
        }
      });
      var net = inf - outf;
      bal += net;
      if (bal < minBalance) { minBalance = bal; minMonth = m; }
      rows.push({ month: m, inflow: inf, outflow: outf, net: net, closing: bal });
    }
    var negIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].closing < 0) { negIdx = i; break; }
    }
    return {
      rows: rows, opening: open, months: months,
      minBalance: minBalance, minMonth: minMonth,
      survivalMonths: negIdx === -1 ? months : negIdx,
      neverNegative: negIdx === -1
    };
  }

  /** Plain-language summary of a projection. */
  function summarize(p) {
    var f = fmtINR;
    if (p.neverNegative) {
      return 'At current burn, your cash stays positive for the full ' +
        p.months + '-month horizon. Projected closing balance: ' +
        f(lastClosing(p)) + '. Lowest point: ' + f(p.minBalance) +
        (p.minMonth ? ' in month ' + p.minMonth + '.' : '.');
    }
    return 'At current burn, cash runs out in month ' + (p.survivalMonths + 1) +
      ' — cash lasts ' + p.survivalMonths + ' full month' +
      (p.survivalMonths === 1 ? '' : 's') + '. Lowest projected balance: ' +
      f(p.minBalance) + ' in month ' + p.minMonth +
      '. Cut outflows or bring inflows forward to extend runway.';
  }

  function lastClosing(p) {
    return p.rows.length ? p.rows[p.rows.length - 1].closing : p.opening;
  }

  /**
   * Simple SVG line chart of closing balances (pure string builder).
   * width x height viewBox, zero-line shown.
   */
  function cashChartSVG(p, opts) {
    opts = opts || {};
    var W = 640, H = 260, padL = 8, padR = 8, padT = 14, padB = 26;
    var vals = p.rows.map(function (r) { return r.closing; });
    vals.push(p.opening);
    var lo = Math.min.apply(null, vals.concat([0]));
    var hi = Math.max.apply(null, vals.concat([0]));
    if (hi - lo < 1) { hi = lo + 1; }
    var iw = W - padL - padR, ih = H - padT - padB;
    function X(i) { return padL + (p.rows.length <= 1 ? iw / 2 : (i / (p.rows.length - 1)) * iw); }
    function Y(v) { return padT + (1 - (v - lo) / (hi - lo)) * ih; }
    var pts = p.rows.map(function (r, i) {
      return X(i).toFixed(1) + ',' + Y(r.closing).toFixed(1);
    }).join(' ');
    var zeroY = Y(0).toFixed(1);
    var dots = p.rows.map(function (r, i) {
      var neg = r.closing < 0;
      return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(r.closing).toFixed(1) +
        '" r="4" fill="' + (neg ? '#b91c1c' : '#1746c2') + '">' +
        '<title>Month ' + r.month + ': ' + fmtINR(r.closing) + '</title></circle>';
    }).join('');
    var labels = p.rows.map(function (r, i) {
      if (p.rows.length > 12 && i % 2 === 1) return '';
      return '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="11" ' +
        'text-anchor="middle" fill="#4b5263">M' + r.month + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Projected closing cash balance by month" style="width:100%;height:auto">' +
      '<line x1="' + padL + '" y1="' + zeroY + '" x2="' + (W - padR) + '" y2="' + zeroY +
      '" stroke="#b91c1c" stroke-dasharray="5,4" stroke-width="1.5"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="#1746c2" stroke-width="2.5"/>' +
      dots + labels +
      '<text x="' + (W - padR) + '" y="' + (+zeroY - 5) + '" font-size="11" text-anchor="end" fill="#b91c1c">zero</text>' +
      '</svg>';
  }

  function fmtINR(n) {
    var v = Math.round(+n || 0);
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    projectCashFlow: projectCashFlow, summarize: summarize,
    cashChartSVG: cashChartSVG, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else if (typeof window !== 'undefined') {
    window.CashFlowApp = API;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'cash-flow-forecast';
  var FREE_LIMIT = 20; // forecasts per day

  function $(id) { return document.getElementById(id); }

  function entryRowHTML() {
    return '<div class="erow">' +
      '<input type="text" class="elabel" placeholder="Label (e.g. Sales, Rent)" maxlength="60" aria-label="Entry label">' +
      '<select class="etype" aria-label="Inflow or outflow"><option value="in">Inflow (+)</option><option value="out">Outflow (\u2212)</option></select>' +
      '<input type="number" class="eamt" min="0" placeholder="₹ amount" aria-label="Amount">' +
      '<select class="erecur" aria-label="Recurrence"><option value="monthly">Every month</option><option value="once">One-time</option></select>' +
      '<input type="number" class="estart" min="1" max="36" value="1" aria-label="Start month" title="Start month">' +
      '<button type="button" class="erow-del" aria-label="Remove entry">\u00D7</button></div>';
  }

  function addEntry(label, type, amount, recur, start) {
    var tmp = document.createElement('div');
    tmp.innerHTML = entryRowHTML();
    var el = tmp.firstChild;
    if (label) el.querySelector('.elabel').value = label;
    if (type) el.querySelector('.etype').value = type;
    if (amount != null) el.querySelector('.eamt').value = amount;
    if (recur) el.querySelector('.erecur').value = recur;
    if (start) el.querySelector('.estart').value = start;
    $('entries').appendChild(el);
    el.querySelector('.erow-del').addEventListener('click', function () { el.remove(); });
  }

  function readEntries() {
    var out = [];
    $('entries').querySelectorAll('.erow').forEach(function (el) {
      var amt = parseFloat(el.querySelector('.eamt').value) || 0;
      if (amt <= 0) return;
      out.push({
        label: el.querySelector('.elabel').value.trim() || '(untitled)',
        type: el.querySelector('.etype').value,
        amount: amt,
        recur: el.querySelector('.erecur').value,
        start: parseInt(el.querySelector('.estart').value, 10) || 1
      });
    });
    return out;
  }

  function monthName(i) {
    var base = new Date();
    var d = new Date(base.getFullYear(), base.getMonth() + i - 1, 1);
    return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  }

  function renderProjection(opening, months, entries) {
    var p = projectCashFlow(opening, entries, months);
    var warn = '';
    if (!p.neverNegative) {
      warn = '<div class="vq-notice"><strong>Cash warning:</strong> projected balance goes ' +
        'negative in month ' + (p.survivalMonths + 1) + ' (' + esc(monthName(p.survivalMonths + 1)) +
        '). Lowest point ' + fmtINR(p.minBalance) + ' in month ' + p.minMonth + '.</div>';
    } else if (p.minBalance < opening * 0.2) {
      warn = '<div class="vq-notice"><strong>Heads up:</strong> cash dips to ' + fmtINR(p.minBalance) +
        ' in month ' + p.minMonth + ' — thin buffer. Consider trimming outflows.</div>';
    }
    var rows = p.rows.map(function (r) {
      var cls = r.closing < 0 ? ' class="neg"' : '';
      return '<tr' + cls + '><td>' + r.month + ' (' + esc(monthName(r.month)) + ')</td>' +
        '<td class="num">+' + fmtINR(r.inflow) + '</td>' +
        '<td class="num">\u2212' + fmtINR(r.outflow) + '</td>' +
        '<td class="num">' + (r.net >= 0 ? '+' : '\u2212') + fmtINR(Math.abs(r.net)) + '</td>' +
        '<td class="num"><strong>' + fmtINR(r.closing) + '</strong></td></tr>';
    }).join('');

    $('cf-results').innerHTML = warn +
      '<div class="vq-result"><h3>Summary</h3><p>' + esc(summarize(p)) + '</p>' +
      '<div class="stat-grid">' +
      '<div><span>Opening cash</span><strong>' + fmtINR(p.opening) + '</strong></div>' +
      '<div><span>Cash runway</span><strong>' + (p.neverNegative ? p.months + '+ months' : p.survivalMonths + ' months') + '</strong></div>' +
      '<div><span>Lowest balance</span><strong>' + fmtINR(p.minBalance) + '</strong></div>' +
      '<div><span>Closing (' + esc(monthName(p.months)) + ')</span><strong>' + fmtINR(lastClosing(p)) + '</strong></div>' +
      '</div></div>' +
      '<h3>Cash trajectory</h3><div class="chart-box">' + cashChartSVG(p) + '</div>' +
      '<h3>Month-wise projection</h3>' +
      '<div class="vq-table-wrap"><table class="vq-table"><thead><tr>' +
      '<th>Month</th><th>Inflow</th><th>Outflow</th><th>Net</th><th>Closing balance</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';

    window.__lastForecast = { opening: opening, months: months, entries: entries,
                             savedAt: new Date().toISOString() };
    $('cf-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function doForecast() {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell($('cf-gate'), SLUG, FREE_LIMIT);
      $('cf-gate').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    renderProjection(parseFloat($('cf-opening').value) || 0,
                     parseInt($('cf-horizon').value, 10) || 6,
                     readEntries());
  }

  async function saveScenario() {
    var f = window.__lastForecast;
    if (!f) { alert('Run a forecast first, then save it.'); return; }
    var name = prompt('Name this scenario:', 'Scenario ' + new Date().toLocaleDateString('en-IN'));
    if (!name) return;
    var key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                .slice(0, 40) + '-' + Date.now().toString(36);
    try {
      await Vault.save(SLUG, key, Object.assign({ name: name }, f));
      await renderSaved();
      alert('Scenario saved.');
    } catch (e) { alert('Could not save: ' + e.message); }
  }

  async function renderSaved() {
    var list = $('saved-list');
    var entries;
    try { entries = await Vault.list(SLUG); }
    catch (e) { list.innerHTML = '<p class="vq-hint">Storage unavailable.</p>'; return; }
    var items = [];
    for (var i = 0; i < entries.length; i++) {
      try {
        var d = await Vault.load(SLUG, entries[i].key);
        if (d && d.entries) items.push({ key: entries[i].key, d: d });
      } catch (e) {}
    }
    list.innerHTML = items.length ? items.map(function (it) {
      var p = projectCashFlow(it.d.opening, it.d.entries, it.d.months);
      return '<div class="saved-row"><div><strong>' + esc(it.d.name) + '</strong>' +
        '<div class="vq-hint">' + it.d.months + ' months &middot; runway ' +
        (p.neverNegative ? it.d.months + '+' : p.survivalMonths) + ' mo &middot; closing ' +
        fmtINR(lastClosing(p)) + '</div></div>' +
        '<div class="row-actions"><button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
        '<button class="vq-btn ghost sm danger" data-del="' + esc(it.key) + '">Delete</button></div></div>';
    }).join('') : '<p class="vq-hint">No saved scenarios yet.</p>';

    list.querySelectorAll('[data-load]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var d = await Vault.load(SLUG, b.getAttribute('data-load'));
        if (!d) return;
        $('cf-opening').value = d.opening;
        $('cf-horizon').value = d.months;
        $('entries').innerHTML = '';
        d.entries.forEach(function (e) { addEntry(e.label, e.type, e.amount, e.recur, e.start); });
        renderProjection(d.opening, d.months, d.entries);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    list.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Delete this scenario?')) return;
        await Vault.remove(SLUG, b.getAttribute('data-del'));
        await renderSaved();
      });
    });
  }

  function init() {
    Ads.render($('ad-top'), 'cash-flow-forecast-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'cash-flow-forecast-bottom', 'leaderboard');

    SEO.faq([
      { q: 'How do I forecast cash flow for my small business?',
        a: 'Enter your opening bank balance, list expected monthly inflows (sales, receivables) and outflows (rent, salaries, suppliers), and pick a 3, 6 or 12-month horizon. The tool projects month-wise closing balances, flags the lowest point and tells you how many months your cash lasts.' },
      { q: '\u0915\u0948\u0936 \u092b\u094d\u0932\u094b \u092b\u0949\u0930\u0915\u093e\u0938\u094d\u091f \u0915\u0948\u0938\u0947 \u0915\u0930\u0947\u0902? (How to do a cash flow forecast?)',
        a: '\u0905\u092a\u0928\u093e \u092e\u094c\u091c\u0942\u0926\u093e \u092c\u0948\u0902\u0915 \u092c\u0948\u0932\u0947\u0902\u0938, \u092e\u093e\u0938\u093f\u0915 \u0906\u092e\u0926\u0928\u0940 \u0914\u0930 \u0916\u0930\u094d\u091a \u0921\u093e\u0932\u0947\u0902 \u0914\u0930 3, 6 \u092f\u093e 12 \u092e\u0939\u0940\u0928\u0947 \u0915\u093e \u0939\u094b\u0930\u093e\u0907\u091c\u093c\u0928 \u091a\u0941\u0928\u0947\u0902 \u2014 \u091f\u0942\u0932 \u092c\u0924\u093e\u090f\u0917\u093e \u0915\u093f \u0906\u092a\u0915\u093e \u092a\u0948\u0938\u093e \u0915\u093f\u0924\u0928\u0947 \u092e\u0939\u0940\u0928\u0947 \u091a\u0932\u0947\u0917\u093e \u0914\u0930 \u0915\u092c \u0915\u092e\u0940 \u092a\u0921\u093c\u0947\u0917\u0940\u0964' },
      { q: 'What is cash runway?',
        a: 'The number of months your business can keep running on current cash at current burn (outflows minus inflows) before the balance goes negative. This tool computes it from your projection.' },
      { q: 'Is my financial data stored online?',
        a: 'No. Scenarios stay in your browser\u2019s local storage under this app\u2019s private namespace. Nothing is uploaded.' },
      { q: 'Is this accounting advice?',
        a: 'No \u2014 it is a planning estimate based on the numbers you enter. Verify important decisions with your accountant.' }
    ]);
    SEO.softwareApp({
      name: 'Cash Flow Forecast Tool for Small Business India',
      description: 'Free cash flow forecasting for Indian SMEs: project 3/6/12-month cash balances, runway, warnings and charts from inflows and outflows.',
      keywords: ['cash flow forecast', 'cash flow projection', 'business runway calculator', '\u0915\u0948\u0936 \u092b\u094d\u0932\u094b', 'working capital planner']
    });

    // starter entries
    addEntry('Sales / collections', 'in', 150000, 'monthly', 1);
    addEntry('Rent', 'out', 30000, 'monthly', 1);
    addEntry('Salaries', 'out', 80000, 'monthly', 1);
    addEntry('Suppliers / stock', 'out', 25000, 'monthly', 1);

    $('add-entry').addEventListener('click', function () { addEntry(); });
    $('cf-run').addEventListener('click', doForecast);
    $('cf-save').addEventListener('click', saveScenario);
    renderSaved();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
