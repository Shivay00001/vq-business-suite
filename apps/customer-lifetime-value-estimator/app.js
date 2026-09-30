/* ============================================================
   Customer Lifetime Value Estimator — pure computation layer.
   CLV = aov * freq * years * (margin/100)
   Annual value = aov * freq * (margin/100)
   What-if: lifespan' = years * (1 + retImprovement/100)
   Security: all inputs range-checked; negatives/NaN rejected.
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

/** Validate raw CLV inputs; returns '' if OK else an error string. */
function validateCLV(i) {
  var num = ['aov', 'freq', 'years', 'margin', 'ret'];
  for (var k = 0; k < num.length; k++) {
    var v = Number(i[num[k]]);
    if (!isFinite(v)) return 'Saare inputs me sahi number likhein.';
  }
  if (!(i.aov >= 0) || !(i.freq >= 0) || !(i.years >= 0)) return 'Order value, purchases/year aur lifespan 0 ya usse zyada hone chahiye (negative nahi).';
  if (!(i.margin >= 0 && i.margin <= 100)) return 'Margin 0–100% ke beech hona chahiye.';
  if (!(i.ret >= 0 && i.ret <= 100)) return 'Retention improvement 0–100% ke beech hona chahiye.';
  if (i.aov > 1e9 || i.freq > 1e4 || i.years > 100) return 'Input bahut bada hai — sahi values daalein.';
  return '';
}

/** {clv, annual} from validated inputs. */
function computeCLV(aov, freq, years, margin) {
  var m = margin / 100;
  var annual = round2(aov * freq * m);
  var clv = round2(aov * freq * years * m);
  return { clv: clv, annual: annual };
}

/** What-if CLV when retention improves by pct% (lifespan scales). */
function whatIfCLV(aov, freq, years, margin, pct) {
  var years2 = round2(years * (1 + pct / 100));
  var r = computeCLV(aov, freq, years2, margin);
  return { years: years2, clv: r.clv, uplift: round2(r.clv - computeCLV(aov, freq, years, margin).clv) };
}

/** Table of what-if scenarios for fixed retention improvements. */
function whatIfTable(aov, freq, years, margin) {
  return [10, 25, 50].map(function (p) {
    var w = whatIfCLV(aov, freq, years, margin, p);
    return { pct: p, years: w.years, clv: w.clv, uplift: w.uplift };
  });
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function clvInit() {
  var SLUG = 'customer-lifetime-value-estimator';
  var CALC_LIMIT = 20, SAVE_LIMIT = 25;
  var lastResult = null;

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Customer Lifetime Value (CLV) kya hota hai?',
      a: 'CLV ye batata hai ki ek customer apne poore relationship me aapke business ko kitna profit dega. Formula: CLV = avg order value × purchases/year × lifespan years × margin %.' },
    { q: 'CLV jaankar kya fayda hai?',
      a: 'CLV se pata chalta hai ki ek naya customer paane par aap kitna kharch (ads, commission) kar sakte hain. Agar CLV ₹4,800 hai to ₹500-₹1,000 customer acquisition cost profitable hai.' },
    { q: 'Retention improvement se CLV kyon badhta hai?',
      a: 'Customer jitne zyada saal judaa rahega, utne zyada orders karega. Thodi si bhi retention improvement lifespan badha kar CLV kaafi badha sakti hai — slider se khud dekhein.' },
    { q: 'ग्राहक लाइफटाइम वैल्यू कैसे निकालें?',
      a: 'Average order value ko saal me khareed ki sankhya se, phir grahak ke judne ke saalon se, aur aakhir me margin % se multiply karein. Ye app ye calculation automatic karti hai.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser me store hota hai, kahin upload nahi hota. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Customer Lifetime Value Estimator — CLV कैलकुलेटर',
    description: 'Free customer lifetime value (CLV) calculator for Indian SMEs: avg order value × purchases/year × lifespan × margin, with retention-improvement what-if scenarios.',
    keywords: ['customer lifetime value', 'CLV calculator India', 'ग्राहक लाइफटाइम वैल्यू', 'CLV formula', 'retention calculator', 'customer value estimator', 'CLV kaise nikale']
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

  el('clv-ret').addEventListener('input', function () {
    el('clv-retval').textContent = el('clv-ret').value + '%';
    el('clv-wiret').textContent = el('clv-ret').value + '%';
    if (lastResult) renderResult(lastResult.inputs);
  });

  function readInputs() {
    return {
      aov: parseFloat(el('clv-aov').value),
      freq: parseFloat(el('clv-freq').value),
      years: parseFloat(el('clv-years').value),
      margin: parseFloat(el('clv-margin').value),
      ret: parseFloat(el('clv-ret').value) || 0
    };
  }

  function renderResult(inputs) {
    var r = computeCLV(inputs.aov, inputs.freq, inputs.years, inputs.margin);
    var w = whatIfCLV(inputs.aov, inputs.freq, inputs.years, inputs.margin, inputs.ret);
    el('clv-result').textContent = inr(r.clv);
    el('clv-annual').textContent = inr(r.annual);
    el('clv-wi').textContent = inr(w.clv);
    el('clv-uplift').textContent = '+' + inr(w.uplift);
    el('wiBody').innerHTML = whatIfTable(inputs.aov, inputs.freq, inputs.years, inputs.margin).map(function (t) {
      return '<tr><td>+' + t.pct + '%</td><td class="r">' + t.years + ' yrs</td>' +
        '<td class="r">' + inr(t.clv) + '</td><td class="r">+' + inr(t.uplift) + '</td></tr>';
    }).join('');
    el('resultCard').style.display = '';
  }

  el('calcBtn').addEventListener('click', function () {
    var err = el('clv-error'); err.textContent = '';
    el('clv-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, CALC_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('clv-upsell'), SLUG, CALC_LIMIT); return; }
    var inputs = readInputs();
    var verr = validateCLV(inputs);
    if (verr) { err.textContent = verr; return; }
    lastResult = { inputs: inputs, computedAt: new Date().toISOString(),
                   result: computeCLV(inputs.aov, inputs.freq, inputs.years, inputs.margin) };
    renderResult(inputs);
    el('clv-saved').textContent = 'Calculated ✓ (' + Freemium.remaining(SLUG, CALC_LIMIT) + ' free calculations left today)';
  });

  el('saveBtn').addEventListener('click', async function () {
    el('clv-upsell').innerHTML = '';
    if (!lastResult) { el('clv-error').textContent = 'Pehle Calculate dabakar result nikaalein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('clv-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'result-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, Object.assign({ type: 'clv-result' }, lastResult));
      el('clv-saved').textContent = 'Result saved ✓ (' + Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('clv-error').textContent = 'Save failed: ' + e.message; }
  });

  el('printBtn').addEventListener('click', function () { window.print(); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', clvInit);
  } else { clvInit(); }
}
