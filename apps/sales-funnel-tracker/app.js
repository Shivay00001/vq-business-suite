/* ============================================================
   Sales Funnel Tracker — pure computation layer.
   Stage: {key, label, prob (0..1), deals (int), value (₹)}
   Conversion A→B = deals(B)/deals(A)*100
   Total pipeline = Σ value
   Weighted pipeline = Σ value*prob
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var DEFAULT_STAGES = [
  { key: 'lead', label: 'Lead', prob: 0.10 },
  { key: 'qualified', label: 'Qualified', prob: 0.25 },
  { key: 'proposal', label: 'Proposal', prob: 0.50 },
  { key: 'negotiation', label: 'Negotiation', prob: 0.75 },
  { key: 'won', label: 'Won', prob: 1.00 }
];

/** stages: [{deals, value, ...}] -> {conversions:[{from,to,pct}], total, weighted, openDeals} */
function computeFunnel(stages) {
  var conversions = [];
  for (var i = 0; i < stages.length - 1; i++) {
    var a = Number(stages[i].deals) || 0, b = Number(stages[i + 1].deals) || 0;
    var pct = a > 0 ? round2((b / a) * 100) : 0;
    conversions.push({ from: stages[i].label, to: stages[i + 1].label, pct: pct });
  }
  var total = 0, weighted = 0, openDeals = 0;
  stages.forEach(function (s) {
    var v = round2(Number(s.value) || 0);
    total = round2(total + v);
    weighted = round2(weighted + v * (Number(s.prob) || 0));
    openDeals += Math.max(0, Math.floor(Number(s.deals) || 0));
  });
  return { conversions: conversions, total: total, weighted: weighted, openDeals: openDeals };
}

/**
 * Pure-SVG horizontal funnel chart.
 * Bar width ∝ stage value relative to the largest stage.
 */
function funnelSVG(stages, values) {
  var W = 640, barH = 34, gap = 10, labelW = 130, padR = 120;
  var maxV = 1;
  values.forEach(function (s) { if (s.value > maxV) maxV = s.value; });
  var barMax = W - labelW - padR;
  var H = stages.length * (barH + gap) + gap;
  var colors = ['#3b5bfd', '#6366f1', '#8b5cf6', '#a855f7', '#1a7f37'];
  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sales funnel chart" xmlns="http://www.w3.org/2000/svg">';
  stages.forEach(function (s, i) {
    var y = gap + i * (barH + gap);
    var w = Math.max(6, round2((values[i].value / maxV) * barMax));
    var x = labelW + (barMax - w) / 2;
    svg += '<text x="0" y="' + (y + barH / 2 + 5) + '" font-size="14" font-weight="600" fill="#1f2937">' +
      esc(s.label) + '</text>';
    svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + barH +
      '" rx="6" fill="' + colors[i % colors.length] + '" opacity="' + (0.45 + i * 0.14) + '"/>';
    svg += '<text x="' + (x + w + 8) + '" y="' + (y + barH / 2 + 5) +
      '" font-size="13" fill="#334155">' + esc(String(values[i].deals)) + ' deals · ' + inr(values[i].value) + '</text>';
  });
  svg += '</svg>';
  return svg;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function sfInit() {
  var SLUG = 'sales-funnel-tracker';
  var REPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var values = DEFAULT_STAGES.map(function () { return { deals: 0, value: 0 }; });

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Sales funnel kya hota hai?',
      a: 'Sales funnel leads ke safar ko dikhata hai — Lead → Qualified → Proposal → Negotiation → Won. Har stage ke deals aur value se pata chalta hai kahaan deals atak rahi hain.' },
    { q: 'Conversion % kaise nikala jaata hai?',
      a: 'Conversion % = (agle stage ke deals ÷ is stage ke deals) × 100. Jaise 100 leads me se 40 qualified hue to conversion 40% hai.' },
    { q: 'Weighted pipeline kya hoti hai?',
      a: 'Har stage ke value ko us stage ki win-probability se multiply karke joda jaata hai. Ye realistic revenue forecast deta hai.' },
    { q: 'सेल्स फ़नल क्यों ज़रूरी है?',
      a: 'Funnel se pata chalta hai ki deals kis stage par atak rahi hain. Agar proposal se negotiation me conversion low hai, to pricing ya follow-up par kaam karna chahiye.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Sales Funnel Tracker — सेल्स फ़नल',
    description: 'Free sales funnel tracker for Indian SMEs: deal values per stage → stage-to-stage conversion %, total pipeline value, weighted pipeline, pure-SVG funnel chart.',
    keywords: ['sales funnel', 'सेल्स फ़नल', 'sales pipeline tracker India', 'funnel conversion rate', 'weighted pipeline', 'सेल्स फ़नल क्या है', 'pipeline value', 'deal stage tracker']
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
    return Vault.save(SLUG, 'data', { values: values }).catch(function () {});
  }

  function readInputs() {
    DEFAULT_STAGES.forEach(function (s, i) {
      var d = parseInt(el('f-deals-' + i).value, 10);
      var v = parseFloat(el('f-value-' + i).value);
      values[i] = { deals: isNaN(d) ? 0 : Math.max(0, d), value: isNaN(v) ? 0 : Math.max(0, v) };
    });
  }

  function render() {
    readInputs();
    var stages = DEFAULT_STAGES.map(function (s, i) {
      return { key: s.key, label: s.label, prob: s.prob, deals: values[i].deals, value: values[i].value };
    });
    var r = computeFunnel(stages);

    el('stageInputsBody').innerHTML = DEFAULT_STAGES.map(function (s, i) {
      return '<tr><td><strong>' + esc(s.label) + '</strong></td>' +
        '<td>' + Math.round(s.prob * 100) + '%</td>' +
        '<td class="r"><input id="f-deals-' + i + '" type="number" min="0" step="1" inputmode="numeric" value="' +
        values[i].deals + '" style="width:90px;text-align:right"></td>' +
        '<td class="r"><input id="f-value-' + i + '" type="number" min="0" step="0.01" inputmode="decimal" value="' +
        values[i].value + '" style="width:130px;text-align:right"></td></tr>';
    }).join('');
    DEFAULT_STAGES.forEach(function (s, i) {
      el('f-deals-' + i).addEventListener('input', function () { refresh(false); });
      el('f-value-' + i).addEventListener('input', function () { refresh(false); });
    });

    el('funnelChart').innerHTML = funnelSVG(DEFAULT_STAGES, values);

    el('convBody').innerHTML = r.conversions.map(function (c) {
      var warn = c.pct < 20 ? ' style="color:#b42318;font-weight:700"' : '';
      return '<tr><td>' + esc(c.from) + ' → ' + esc(c.to) + '</td>' +
        '<td class="r"' + warn + '>' + c.pct + '%</td></tr>';
    }).join('');

    el('kpiTotal').textContent = inr(r.total);
    el('kpiWeighted').textContent = inr(r.weighted);
    el('kpiDeals').textContent = r.openDeals;

    persist();
  }

  function refresh(reRenderInputs) {
    readInputs();
    if (reRenderInputs === false) {
      // update chart + KPIs without rebuilding the input rows (keeps focus while typing)
      var stages = DEFAULT_STAGES.map(function (s, i) {
        return { key: s.key, label: s.label, prob: s.prob, deals: values[i].deals, value: values[i].value };
      });
      var r = computeFunnel(stages);
      el('funnelChart').innerHTML = funnelSVG(DEFAULT_STAGES, values);
      el('convBody').innerHTML = r.conversions.map(function (c) {
        var warn = c.pct < 20 ? ' style="color:#b42318;font-weight:700"' : '';
        return '<tr><td>' + esc(c.from) + ' → ' + esc(c.to) + '</td>' +
          '<td class="r"' + warn + '>' + c.pct + '%</td></tr>';
      }).join('');
      el('kpiTotal').textContent = inr(r.total);
      el('kpiWeighted').textContent = inr(r.weighted);
      el('kpiDeals').textContent = r.openDeals;
      persist();
    } else { render(); }
  }

  async function saveReport(meterLimit, upsellEl, okEl, reportData) {
    el('sf-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, meterLimit);
    if (!gate.allowed) { Freemium.renderUpsell(el('sf-upsell'), SLUG, meterLimit); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, reportData);
      el('sf-saved').textContent = 'Report saved ✓ (' + Freemium.remaining(SLUG, meterLimit) + ' left today)';
    } catch (e) { el('f-error').textContent = 'Save failed: ' + e.message; }
  }

  function currentReport() {
    var stages = DEFAULT_STAGES.map(function (s, i) {
      return { key: s.key, label: s.label, prob: s.prob, deals: values[i].deals, value: values[i].value };
    });
    var r = computeFunnel(stages);
    return {
      type: 'funnel-report', savedAt: new Date().toISOString(),
      stages: stages, conversions: r.conversions,
      totalPipeline: r.total, weightedPipeline: r.weighted, openDeals: r.openDeals
    };
  }

  el('saveReportBtn').addEventListener('click', function () {
    saveReport(REPORT_LIMIT, el('sf-upsell'), el('sf-saved'), currentReport());
  });
  el('saveBtn').addEventListener('click', function () {
    saveReport(SAVE_LIMIT, el('sf-upsell'), el('sf-saved'),
      { type: 'snapshot', savedAt: new Date().toISOString(), values: values });
  });
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.values) && d.values.length === DEFAULT_STAGES.length) values = d.values;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sfInit);
  } else { sfInit(); }
}
