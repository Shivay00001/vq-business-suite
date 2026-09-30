/* ============================================================
   Working Capital Analyzer — pure computation layer.
   Standard accounting formulas (shown on screen):
     Working capital   = Current assets − Current liabilities
     Current ratio     = Current assets / Current liabilities
     Quick ratio       = (Current assets − Inventory) / Current liabilities
     Debtor days       = Receivables / Annual sales × 365
     Creditor days     = Payables / Annual COGS × 365
     Inventory days    = Inventory / Annual COGS × 365
     Cash conversion cycle = Inventory days + Debtor days − Creditor days
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/**
 * opts: {ca, cl, inventory, receivables, payables, sales, cogs}
 * Returns {wc, currentRatio, quickRatio, debtorDays, creditorDays,
 *          inventoryDays, ccc, errors[], verdict}
 */
function analyzeWC(opts) {
  var ca = num(opts.ca), cl = num(opts.cl);
  var inv = num(opts.inventory), rec = num(opts.receivables),
      pay = num(opts.payables);
  var sales = num(opts.sales), cogs = num(opts.cogs);
  var r = { errors: [] };

  if (!(ca >= 0)) r.errors.push('Current assets must be 0 or more.');
  if (!(cl > 0)) r.errors.push('Current liabilities must be greater than 0.');
  if (r.errors.length) return r;

  r.wc = round2(ca - cl);
  r.currentRatio = round2(ca / cl);
  r.quickRatio = round2((ca - inv) / cl);

  r.debtorDays = sales > 0 ? round2(rec / sales * 365) : null;
  r.creditorDays = cogs > 0 ? round2(pay / cogs * 365) : null;
  r.inventoryDays = cogs > 0 ? round2(inv / cogs * 365) : null;
  r.ccc = (r.inventoryDays != null && r.debtorDays != null && r.creditorDays != null)
    ? round2(r.inventoryDays + r.debtorDays - r.creditorDays) : null;

  // Plain-language verdict (thumb rules, stated as such)
  var good = [], warn = [], bad = [];
  if (r.wc >= 0) good.push('working capital positive (' + inrPlain(r.wc) + ')');
  else bad.push('working capital negative (' + inrPlain(r.wc) + ') — short-term payments ke liye cash ki kami ho sakti hai');
  if (r.currentRatio >= 1.33) good.push('current ratio ' + r.currentRatio + ' (healthy ≥ 1.33)');
  else if (r.currentRatio >= 1) warn.push('current ratio ' + r.currentRatio + ' (thin — 1.33 se kam)');
  else bad.push('current ratio ' + r.currentRatio + ' (1 se kam — liquidity risk)');
  if (r.quickRatio >= 1) good.push('quick ratio ' + r.quickRatio + ' (healthy ≥ 1)');
  else warn.push('quick ratio ' + r.quickRatio + ' (1 se kam — stock beche bina bills mushkil)');
  if (r.ccc != null) {
    if (r.ccc <= 60) good.push('cash conversion cycle ' + r.ccc + ' din (tez cash wapas)');
    else if (r.ccc <= 120) warn.push('cash conversion cycle ' + r.ccc + ' din (dheema)');
    else bad.push('cash conversion cycle ' + r.ccc + ' din (bahut dheema — cash phas raha hai)');
  }
  if (bad.length) r.verdict = { tone: 'bad', title: '⚠ Liquidity pressure', points: bad.concat(warn) };
  else if (warn.length) r.verdict = { tone: 'mid', title: '⚠ Manageable, par dhyan dein', points: warn.concat(good) };
  else r.verdict = { tone: 'good', title: '✓ Healthy liquidity', points: good };

  return r;
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
function wcInit() {
  var SLUG = 'working-capital-analyzer';
  var FREE_LIMIT = 20; // analyses per day
  var SAVE_LIMIT = 25; // report snapshots per day
  var lastResult = null;

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Working capital formula kya hai?',
      a: 'Working capital = Current assets − Current liabilities. Positive matlab short-term me dene se zyada paane ki sthiti.' },
    { q: 'Current ratio aur quick ratio me kya farak hai?',
      a: 'Current ratio = Current assets ÷ Current liabilities. Quick ratio = (Current assets − Inventory) ÷ Current liabilities — stock turant cash nahi banta, isliye use hatakar dekha jata hai.' },
    { q: 'Cash conversion cycle (CCC) kya hota hai?',
      a: 'CCC = Inventory days + Debtor days − Creditor days. Maal me laga paisa kitne dino me wapas cash banta hai — kam CCC behtar.' },
    { q: 'वर्किंग कैपिटल क्या होती है?',
      a: 'Roz ke business chalane ke liye chahiye paisa — current assets me se current liabilities ghata kar nikalti hai.' }
  ]);
  SEO.softwareApp({
    name: 'Working Capital Analyzer — वर्किंग कैपिटल फॉर्मूला',
    description: 'Free working capital analyzer: working capital, current/quick ratios, debtor/creditor/inventory days, cash conversion cycle with formulas and health verdict.',
    keywords: ['working capital', 'working capital formula', 'वर्किंग कैपिटल', 'current ratio', 'quick ratio', 'cash conversion cycle', 'debtor days', 'inventory days']
  });

  function kpi(label, value, formula, tone) {
    var color = tone === 'bad' ? '#b42318' : (tone === 'mid' ? '#b45309' : '#1a7f37');
    return '<div class="kpi"><div class="l">' + label + '</div>' +
      '<div class="v" style="color:' + color + '">' + value + '</div>' +
      '<div class="f">' + esc(formula) + '</div></div>';
  }
  function toneOf(v, goodAt, midAt) {
    return v >= goodAt ? 'good' : (v >= midAt ? 'mid' : 'bad');
  }

  function calculate() {
    var err = el('w-error'); err.textContent = '';
    el('w-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    el('w-meter').textContent = 'Free analyses left today: ' + gate.remaining + '/' + FREE_LIMIT;
    if (!gate.allowed) {
      Freemium.renderUpsell(el('w-upsell'), SLUG, FREE_LIMIT);
      el('resultWrap').style.display = 'none';
      return;
    }
    var r = analyzeWC({
      ca: el('w-ca').value, cl: el('w-cl').value, inventory: el('w-inv').value,
      receivables: el('w-rec').value, payables: el('w-pay').value,
      sales: el('w-sales').value, cogs: el('w-cogs').value
    });
    if (r.errors.length) { err.textContent = r.errors.join(' '); el('resultWrap').style.display = 'none'; return; }
    lastResult = r;

    var vb = el('verdictBox');
    vb.className = 'verdict' + (r.verdict.tone === 'bad' ? ' bad' : (r.verdict.tone === 'mid' ? ' mid' : ''));
    el('verdictTitle').textContent = r.verdict.title;
    el('verdictText').innerHTML = r.verdict.points.map(function (p) {
      return '• ' + esc(p);
    }).join('<br>') + '<br><span class="vq-hint">Ye thumb-rule based verdict hai — CA ki salah ka replacement nahi.</span>';

    el('kpiRow').innerHTML =
      kpi('Working capital', inr(r.wc), 'CA − CL', r.wc >= 0 ? 'good' : 'bad') +
      kpi('Current ratio', r.currentRatio + '×', 'CA ÷ CL', toneOf(r.currentRatio, 1.33, 1)) +
      kpi('Quick ratio', r.quickRatio + '×', '(CA − Inv) ÷ CL', toneOf(r.quickRatio, 1, 0.7));

    function dayKpi(label, v, formula) {
      return kpi(label, v == null ? '—' : v + ' days', formula, 'good');
    }
    el('daysRow').innerHTML =
      dayKpi('Debtor days', r.debtorDays, 'Receivables ÷ Sales × 365') +
      dayKpi('Creditor days', r.creditorDays, 'Payables ÷ COGS × 365') +
      dayKpi('Inventory days', r.inventoryDays, 'Inventory ÷ COGS × 365') +
      kpi('Cash conversion cycle', r.ccc == null ? '—' : r.ccc + ' days',
        'Inv days + Debtor days − Creditor days',
        r.ccc == null ? 'good' : (r.ccc <= 60 ? 'good' : (r.ccc <= 120 ? 'mid' : 'bad')));

    el('resultWrap').style.display = 'block';
    el('w-saved').textContent = '';
  }

  async function saveReport() {
    el('w-upsell').innerHTML = '';
    if (!lastResult) { el('w-error').textContent = 'Pehle analyze karein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('w-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, { result: lastResult, savedAt: new Date().toISOString() });
      el('w-saved').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('w-error').textContent = 'Save failed: ' + e.message; }
  }

  el('calcBtn').addEventListener('click', calculate);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('w-meter').textContent = 'Free analyses left today: ' + Freemium.remaining(SLUG, FREE_LIMIT) + '/' + FREE_LIMIT;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wcInit);
  } else { wcInit(); }
}
