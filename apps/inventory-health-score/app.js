/* ============================================================
   Inventory Health Score — pure computation layer.
   inputs: {incidents, deadPct, nearExpiryPct, negFlags}
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function validateHealthInputs(i) {
  if (!i) return 'Inputs missing.';
  var f = [
    ['incidents', i.incidents, 0, 10000],
    ['deadPct', i.deadPct, 0, 100],
    ['nearExpiryPct', i.nearExpiryPct, 0, 100],
    ['negFlags', i.negFlags, 0, 10000]
  ];
  for (var k = 0; k < f.length; k++) {
    var v = Number(f[k][1]);
    if (!(v >= f[k][2] && v <= f[k][3])) {
      return f[k][0] + ' must be between ' + f[k][2] + ' and ' + f[k][3] + '.';
    }
  }
  return '';
}

function compScores(inp) {
  var incidents = Number(inp.incidents) || 0;
  var deadPct = Number(inp.deadPct) || 0;
  var nearExpiryPct = Number(inp.nearExpiryPct) || 0;
  var negFlags = Number(inp.negFlags) || 0;
  return [
    { key: 'stockout', label: 'Stockout incidents', value: incidents,
      points: Math.max(0, 25 - 5 * incidents) },
    { key: 'dead', label: 'Dead-stock %', value: deadPct + '%',
      points: Math.max(0, round2(25 - deadPct)) },
    { key: 'expiry', label: 'Near-expiry value %', value: nearExpiryPct + '%',
      points: Math.max(0, round2(25 - nearExpiryPct)) },
    { key: 'negative', label: 'Negative-stock flags', value: negFlags,
      points: Math.max(0, 25 - 8 * negFlags) }
  ];
}

function gradeOf(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

/**
 * Health score: {score, grade, components:[{key,label,value,points}]}
 */
function healthScore(inp) {
  var comps = compScores(inp);
  var score = round2(comps.reduce(function (s, c) { return s + c.points; }, 0));
  return { score: score, grade: gradeOf(score), components: comps };
}

function improvementTips(res, inp) {
  var tips = [];
  var byKey = {};
  res.components.forEach(function (c) { byKey[c.key] = c; });
  if (res.grade === 'A') {
    tips.push({ urgent: false, text: '🎉 Grade A — inventory excellent shape me hai! Isi discipline ko banaye rakhein: reorder levels aur expiry tracking jaari rakhein.' });
  }
  if (byKey.stockout.points < 25) {
    tips.push({ urgent: byKey.stockout.points <= 10,
      text: 'Stockouts (' + inp.incidents + ' incidents): Stock Forecast Tool se har item ka reorder point set karein aur safety stock badhayein.' });
  }
  if (byKey.dead.points < 25) {
    tips.push({ urgent: Number(inp.deadPct) >= 30,
      text: 'Dead stock ' + inp.deadPct + '% hai: Dead Stock Analyzer ke clearance suggestions follow karein — discount/bundle/return se locked paisa nikalein.' });
  }
  if (byKey.expiry.points < 25) {
    tips.push({ urgent: Number(inp.nearExpiryPct) >= 30,
      text: 'Near-expiry value ' + inp.nearExpiryPct + '% hai: Expiry Date Tracker ki FEFO list se pehle expire hone wale batches nikalein.' });
  }
  if (byKey.negative.points < 25) {
    tips.push({ urgent: true,
      text: 'Negative stock flags (' + inp.negFlags + '): Stock Register me inward/outward entries check karein — koi entry miss ya galat hai.' });
  }
  if (!tips.length) {
    tips.push({ urgent: false, text: 'Sab components full marks par hain — badhai ho!' });
  }
  return tips;
}

/**
 * Auto-detect inputs from sibling vault data.
 * srData: {items, entries} from stock-register
 * deadData: {items:[{lastMove, qty, unitValue}]} from dead-stock-analyzer
 * expData: {batches:[{expiryDate, qty, rate}]} from expiry-date-tracker
 * Returns {deadPct, nearExpiryPct, negFlags} with nulls where data absent.
 */
function autoDetect(srData, deadData, expData, todayStr) {
  var out = { deadPct: null, nearExpiryPct: null, negFlags: null };
  try {
    if (srData && Array.isArray(srData.items) && srData.items.length) {
      var neg = 0;
      srData.items.forEach(function (it) {
        var bal = 0;
        (srData.entries || []).forEach(function (e) {
          if (e.itemId !== it.id) return;
          bal += (e.type === 'in' ? 1 : -1) * (Number(e.qty) || 0);
        });
        if (bal < 0) neg++;
      });
      out.negFlags = neg;
    }
    if (deadData && Array.isArray(deadData.items) && deadData.items.length) {
      var tot = 0, dead180 = 0;
      deadData.items.forEach(function (it) {
        var v = (Number(it.qty) || 0) * (Number(it.unitValue) || 0);
        tot += v;
        var lm = String(it.lastMove || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(lm)) {
          var e = Date.UTC(+lm.slice(0, 4), +lm.slice(5, 7) - 1, +lm.slice(8, 10));
          var t = Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, +todayStr.slice(8, 10));
          if (Math.round((t - e) / 86400000) >= 180) dead180 += v;
        }
      });
      if (tot > 0) out.deadPct = round2(dead180 / tot * 100);
    }
    if (expData && Array.isArray(expData.batches) && expData.batches.length) {
      var totV = 0, nearV = 0;
      expData.batches.forEach(function (b) {
        var v = (Number(b.qty) || 0) * (Number(b.rate) || 0);
        totV += v;
        var ed = String(b.expiryDate || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
          var e2 = Date.UTC(+ed.slice(0, 4), +ed.slice(5, 7) - 1, +ed.slice(8, 10));
          var t2 = Date.UTC(+todayStr.slice(0, 4), +todayStr.slice(5, 7) - 1, +todayStr.slice(8, 10));
          var dl = Math.round((e2 - t2) / 86400000);
          if (dl <= 90) nearV += v;
        }
      });
      if (totV > 0) out.nearExpiryPct = round2(nearV / totV * 100);
    }
  } catch (e) { /* degrade gracefully */ }
  return out;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function ihsInit() {
  var SLUG = 'inventory-health-score';
  var SAVE_LIMIT = 25;
  var lastResult = null;
  var lastInputs = null;

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Inventory health score kya batata hai?',
      a: 'Ye 0–100 ka composite score hai jo 4 cheezon se banta hai — stockouts, dead stock %, near-expiry value %, aur negative stock flags. Score jitna zyada, inventory utni healthy.' },
    { q: 'Grade A/B/C/D ka matlab kya hai?',
      a: 'A (85+) excellent, B (70–84) good, C (50–69) needs attention, D (below 50) urgent action needed — har grade ke saath improvement tips milte hain.' },
    { q: 'Data auto-detect kaise hota hai?',
      a: 'Agar aapne Stock Register, Dead Stock Analyzer ya Expiry Date Tracker apps me data daala hai to wahan se dead-stock %, near-expiry % aur negative flags automatic liye jaate hain. Stockout incidents manual hi dene hote hain.' },
    { q: 'इन्वेंटरी हेल्थ स्कोर क्यों ज़रूरी है?',
      a: 'Ek number me poori inventory ki sehat — kahan paisa fasa hai, kahan stockout ka khatra hai, ye sab ek glance me pata chalta hai.' }
  ]);
  SEO.softwareApp({
    name: 'Inventory Health Score — इन्वेंटरी हेल्थ स्कोर',
    description: 'Free inventory health score for Indian SMEs: composite 0–100 score with grade A/B/C/D and improvement tips.',
    keywords: ['inventory health score', 'इन्वेंटरी हेल्थ स्कोर', 'inventory audit', 'stock health check', 'dead stock percentage', 'stockout rate', 'inventory KPI', 'inventory performance score']
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

  function readInputs() {
    return {
      incidents: el('inIncidents').value === '' ? 0 : parseFloat(el('inIncidents').value),
      deadPct: el('inDeadPct').value === '' ? 0 : parseFloat(el('inDeadPct').value),
      nearExpiryPct: el('inExpiryPct').value === '' ? 0 : parseFloat(el('inExpiryPct').value),
      negFlags: el('inNegFlags').value === '' ? 0 : parseFloat(el('inNegFlags').value)
    };
  }

  function calculate() {
    var err = el('h-error'); err.textContent = '';
    var inp = readInputs();
    var verr = validateHealthInputs(inp);
    if (verr) { err.textContent = verr; return; }
    lastInputs = inp;
    lastResult = healthScore(inp);
    renderScore();
    Vault.save(SLUG, 'inputs', inp).catch(function () {});
  }

  function renderScore() {
    if (!lastResult) return;
    el('scoreCard').style.display = 'block';
    el('tipsCard').style.display = 'block';
    el('scoreNum').textContent = lastResult.score + ' / 100';
    var g = lastResult.grade;
    var pill = g === 'A' ? 'p-a' : (g === 'B' ? 'p-b' : (g === 'C' ? 'p-c' : 'p-d'));
    el('scoreGrade').innerHTML = 'Grade <span class="pill ' + pill + '">' + g + '</span>';
    var bar = el('scoreBar');
    bar.style.width = lastResult.score + '%';
    bar.style.background = g === 'A' ? '#1a7f37' : (g === 'B' ? '#1d4ed8' : (g === 'C' ? '#d97706' : '#b42318'));

    el('compBody').innerHTML = lastResult.components.map(function (c) {
      return '<tr><td>' + esc(c.label) + '</td><td class="r">' + esc(String(c.value)) + '</td>' +
        '<td class="r"><strong>' + c.points + '</strong></td></tr>';
    }).join('');

    el('tipsBody').innerHTML = improvementTips(lastResult, lastInputs).map(function (t) {
      return '<div class="tip' + (t.urgent ? ' urgent' : '') + '">' + esc(t.text) + '</div>';
    }).join('');
  }

  async function refreshAuto() {
    var msg = el('autoMsg');
    msg.textContent = 'Sibling apps ka data padha ja raha hai…';
    var sr = null, dd = null, ex = null;
    try { sr = await Vault.load('stock-register', 'data'); } catch (e) {}
    try { dd = await Vault.load('dead-stock-analyzer', 'data'); } catch (e) {}
    try { ex = await Vault.load('expiry-date-tracker', 'data'); } catch (e) {}
    var det = autoDetect(sr, dd, ex, today());
    var found = [];
    if (det.negFlags !== null) { el('inNegFlags').value = det.negFlags; found.push('Stock Register (' + det.negFlags + ' negative flags)'); }
    if (det.deadPct !== null) { el('inDeadPct').value = det.deadPct; found.push('Dead Stock Analyzer (' + det.deadPct + '%)'); }
    if (det.nearExpiryPct !== null) { el('inExpiryPct').value = det.nearExpiryPct; found.push('Expiry Tracker (' + det.nearExpiryPct + '%)'); }
    msg.textContent = found.length
      ? '✓ Auto-detected: ' + found.join(' · ') + '. Stockout incidents manual daalein, phir Calculate dabayein.'
      : '⚠ Sibling apps me koi usable data nahi mila — values manual daalein.';
  }

  async function saveReport() {
    el('upsell').innerHTML = '';
    if (!lastResult) { el('h-error').textContent = 'Pehle "Calculate health score" dabayein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'report-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), inputs: lastInputs, result: lastResult
      });
      el('savedMsg').textContent = 'Report snapshot saved ✓ (' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('h-error').textContent = 'Save failed: ' + e.message; }
  }

  el('calcBtn').addEventListener('click', calculate);
  el('refreshAutoBtn').addEventListener('click', refreshAuto);
  el('saveReportBtn').addEventListener('click', saveReport);
  el('printBtn').addEventListener('click', function () { window.print(); });

  Vault.load(SLUG, 'inputs').then(function (d) {
    if (d) {
      if (d.incidents != null) el('inIncidents').value = d.incidents;
      if (d.deadPct != null) el('inDeadPct').value = d.deadPct;
      if (d.nearExpiryPct != null) el('inExpiryPct').value = d.nearExpiryPct;
      if (d.negFlags != null) el('inNegFlags').value = d.negFlags;
    }
    return refreshAuto();
  }).catch(refreshAuto);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ihsInit);
  } else { ihsInit(); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { round2: round2, validateHealthInputs: validateHealthInputs,
    compScores: compScores, gradeOf: gradeOf, healthScore: healthScore,
    improvementTips: improvementTips, autoDetect: autoDetect };
}
