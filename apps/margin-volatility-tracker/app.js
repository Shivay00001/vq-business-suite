/* ============================================================
   VisionQuantech Business Suite — Margin Volatility Tracker
   apps/margin-volatility-tracker/app.js

   Monthly margin % series -> mean, sample standard deviation,
   and flags for months beyond ±2σ (outliers). Trend = last-3
   average vs first-3 average.

   Definitions:
     margin% = (revenue - cost) / revenue * 100
     σ = sample standard deviation (n-1), % points
     flag when |margin - mean| > 2σ (needs >= 4 months for σ)

   Pure functions first (no DOM) — tested under node.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- pure computations ---------------- */

  var MAX_MONTHS = 25;

  function r2(n) { return Math.round(n * 100) / 100; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function validLabel(v) {
    var s = String(v == null ? '' : v).trim().slice(0, 20);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
      return { ok: false, error: 'Month must be YYYY-MM (e.g. 2026-04).' };
    }
    return { ok: true, value: s };
  }

  function validAmt(v, name, allowZero) {
    var n = Number(v);
    if (!isFinite(n)) return { ok: false, error: name + ': enter a valid number.' };
    if (n < 0) return { ok: false, error: name + ' cannot be negative.' };
    if (!allowZero && n <= 0) return { ok: false, error: name + ' must be greater than zero.' };
    if (n > 1e12) return { ok: false, error: name + ' looks too large.' };
    return { ok: true, value: n };
  }

  /** Add a month entry (max 25). */
  function addMonth(months, entry) {
    months = Array.isArray(months) ? months.slice() : [];
    if (months.length >= MAX_MONTHS) return { ok: false, error: 'Month list is full (max 25).' };
    var lb = validLabel(entry && entry.month);
    if (!lb.ok) return lb;
    var rev = validAmt(entry && entry.revenue, 'Revenue');
    if (!rev.ok) return rev;
    var ct = validAmt(entry && entry.cost, 'Cost', true);
    if (!ct.ok) return ct;
    if (months.some(function (m) { return m.month === lb.value; })) {
      return { ok: false, error: 'Month ' + lb.value + ' is already recorded — delete it first to re-enter.' };
    }
    months.push({ month: lb.value, revenue: r2(rev.value), cost: r2(ct.value) });
    months.sort(function (a, b) { return a.month < b.month ? -1 : 1; });
    return { ok: true, months: months };
  }

  function removeMonth(months, label) {
    months = Array.isArray(months) ? months.slice() : [];
    return months.filter(function (m) { return m.month !== label; });
  }

  /** Sample standard deviation of a number array (n-1). */
  function sampleStddev(xs) {
    if (xs.length < 2) return 0;
    var mean = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
    var v = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (xs.length - 1);
    return Math.sqrt(v);
  }

  /**
   * Analyze the monthly series.
   * Returns per-month margin, mean, stddev, 2σ flags, volatility rating, trend.
   */
  function analyze(months) {
    months = Array.isArray(months) ? months : [];
    if (months.length < 2) return { ok: false, error: 'Enter at least 2 months to measure volatility.' };
    var rows = [];
    for (var i = 0; i < months.length; i++) {
      var m = months[i];
      var lb = validLabel(m.month); if (!lb.ok) return lb;
      var rev = validAmt(m.revenue, 'Revenue'); if (!rev.ok) return rev;
      var ct = validAmt(m.cost, 'Cost', true); if (!ct.ok) return ct;
      rows.push({
        month: lb.value, revenue: r2(rev.value), cost: r2(ct.value),
        marginPct: r1((rev.value - ct.value) / rev.value * 100)
      });
    }
    var margins = rows.map(function (r) { return r.marginPct; });
    var mean = r2(margins.reduce(function (a, b) { return a + b; }, 0) / margins.length);
    var sd = r2(sampleStddev(margins));
    var band = 2 * sd;
    rows.forEach(function (r) {
      var dev = r2(r.marginPct - mean);
      r.deviation = dev;
      r.flagged = sd > 0 && Math.abs(dev) > band;
      r.flagDir = !r.flagged ? '' : (dev > 0 ? 'high' : 'low');
    });
    var flagged = rows.filter(function (r) { return r.flagged; });
    var rating;
    if (sd < 2) rating = 'Stable';
    else if (sd < 5) rating = 'Moderate';
    else if (sd < 10) rating = 'Volatile';
    else rating = 'Highly volatile';
    var head = margins.slice(0, 3), tail = margins.slice(-3);
    var avg = function (xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; };
    var trend = margins.length >= 3 ? r1(avg(tail) - avg(head)) : 0;
    return {
      ok: true, count: rows.length, rows: rows,
      mean: mean, stddev: sd, band2sigma: r2(band),
      flagged: flagged, flaggedCount: flagged.length,
      rating: rating, trend: trend,
      best: rows.reduce(function (a, b) { return b.marginPct > a.marginPct ? b : a; }),
      worst: rows.reduce(function (a, b) { return b.marginPct < a.marginPct ? b : a; })
    };
  }

  function fmtINR(n) {
    var v = r2(+n || 0);
    var neg = v < 0;
    return (neg ? '-\u20B9' : '\u20B9') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var API = {
    MAX_MONTHS: MAX_MONTHS, addMonth: addMonth, removeMonth: removeMonth,
    analyze: analyze, sampleStddev: sampleStddev, fmtINR: fmtINR, esc: esc
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
    return;
  }

  /* ---------------- browser UI ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var SLUG = 'margin-volatility-tracker';
  var FREE_LIMIT = 20;
  var months = [];

  function $(id) { return document.getElementById(id); }
  function msg(t, ok) {
    var el = $('mv-msg');
    el.textContent = t;
    el.className = 'vq-hint ' + (ok === true ? 'msg-ok' : ok === false ? 'msg-err' : 'vq-hint');
  }

  function persist() { return Vault.save(SLUG, 'months', months); }
  function restore() {
    return Vault.load(SLUG, 'months').then(function (rec) {
      if (Array.isArray(rec)) months = rec.slice(0, MAX_MONTHS);
      renderList();
    });
  }

  function renderList() {
    var wrap = $('mv-list');
    if (!months.length) { wrap.innerHTML = '<p class="vq-hint">No months yet — add your first month above.</p>'; return; }
    wrap.innerHTML = '<table class="vq-table"><thead><tr><th>Month</th><th style="text-align:right">Revenue</th><th style="text-align:right">Cost</th><th></th></tr></thead><tbody>' +
      months.map(function (m) {
        return '<tr><td>' + esc(m.month) + '</td><td style="text-align:right">' + fmtINR(m.revenue) + '</td>' +
          '<td style="text-align:right">' + fmtINR(m.cost) + '</td>' +
          '<td style="text-align:right"><button type="button" class="vq-link" data-del="' + esc(m.month) + '">delete</button></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="vq-hint">' + months.length + ' / ' + MAX_MONTHS + ' months stored on this device.</p>';
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        months = removeMonth(months, b.getAttribute('data-del'));
        persist().then(renderList);
      });
    });
  }

  function renderResult(a) {
    var card = $('mv-result-card');
    card.hidden = false;
    var html;
    if (!a.ok) { html = '<p class="msg-err">' + esc(a.error) + '</p>'; }
    else {
      html =
        '<p>Mean margin: <strong>' + a.mean + '%</strong> · σ = ' + a.stddev + ' pts · ±2σ band: ' +
        (a.mean - a.band2sigma).toFixed(1) + '% … ' + (a.mean + a.band2sigma).toFixed(1) + '%</p>' +
        '<p>Volatility: <span class="big">' + esc(a.rating) + '</span> ' +
        '<span class="vq-hint">· trend (last 3 vs first 3): ' + (a.trend >= 0 ? '+' : '') + a.trend + ' pts</span></p>' +
        '<table class="vq-table"><thead><tr><th>Month</th><th style="text-align:right">Margin %</th><th style="text-align:right">Δ vs mean</th><th>Flag</th></tr></thead><tbody>' +
        a.rows.map(function (r) {
          return '<tr><td>' + esc(r.month) + '</td><td style="text-align:right"><strong>' + r.marginPct + '%</strong></td>' +
            '<td style="text-align:right">' + (r.deviation >= 0 ? '+' : '') + r.deviation + '</td>' +
            '<td>' + (r.flagged ? (r.flagDir === 'high' ? '🟢 <span class="msg-ok">unusually high</span>' : '🔴 <span class="msg-err">unusually low</span>') : '—') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        (a.flaggedCount
          ? '<p class="vq-hint">⚠️ ' + a.flaggedCount + ' month(s) beyond ±2σ: ' +
            a.flagged.map(function (f) { return esc(f.month) + ' (' + f.marginPct + '%)'; }).join(', ') +
            ' — investigate what changed (pricing, cost spike, mix shift).</p>'
          : '<p class="vq-hint">No months beyond ±2σ — margins are within normal variation.</p>') +
        '<p class="vq-hint">Best month: ' + esc(a.best.month) + ' (' + a.best.marginPct + '%) · Worst: ' + esc(a.worst.month) + ' (' + a.worst.marginPct + '%).</p>';
    }
    $('mv-result').innerHTML = html;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function init() {
    Ads.render($('ad-top'), 'margin-volatility-tracker-top', 'leaderboard');
    Ads.render($('ad-bottom'), 'margin-volatility-tracker-bottom', 'leaderboard');
    SEO.faq([
      { q: 'How do I know if my margins are too volatile?', a: 'Track monthly margin % and compute the standard deviation σ. Months beyond ±2σ from the mean are statistical outliers worth investigating — a one-off cost spike, a deep discount month, or a mix shift.' },
      { q: 'मार्जिन अस्थिरता कैसे मापें?', a: 'मासिक मार्जिन % का माध्य और स्टैंडर्ड डेविएशन (σ) निकालें। माध्य से ±2σ से बाहर के महीने असामान्य हैं — जांचें कि कीमत, लागत या मिक्स में क्या बदला।' },
      { q: 'Why ±2σ?', a: 'Under a normal distribution only ~5% of observations fall outside ±2σ. Flagging those focuses attention on genuinely unusual months instead of everyday noise.' },
      { q: 'What counts as a stable margin?', a: 'Roughly: σ under 2 points = stable, 2–5 = moderate, 5–10 = volatile, above 10 = highly volatile. Context matters — seasonal businesses naturally run higher σ.' },
      { q: 'Is my monthly data private?', a: 'Yes — it is stored only on your device (max 25 months). Nothing is uploaded.' }
    ]);
    restore();

    $('mv-add').addEventListener('click', function () {
      var r = addMonth(months, { month: $('mv-month').value, revenue: $('mv-rev').value, cost: $('mv-cost').value });
      if (!r.ok) { msg(r.error, false); return; }
      months = r.months;
      persist().then(function () { msg('Month added.', true); $('mv-month').value = ''; $('mv-rev').value = ''; $('mv-cost').value = ''; renderList(); });
    });

    $('mv-calc').addEventListener('click', function () {
      var gate = Freemium.check(SLUG, FREE_LIMIT);
      if (!gate.allowed) { Freemium.renderUpsell($('mv-gate'), SLUG, FREE_LIMIT); $('mv-gate').scrollIntoView({ behavior: 'smooth' }); return; }
      var a = analyze(months);
      if (!a.ok) { msg(a.error, false); $('mv-result-card').hidden = true; return; }
      msg('', null);
      renderResult(a);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
