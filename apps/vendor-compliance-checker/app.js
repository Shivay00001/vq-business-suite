/* ============================================================
   Vendor Compliance Checker — GSTIN format + checksum validation
   and heuristic risk flags.
   GSTIN structure (verified Sep 2026):
   - 15 chars: 2-digit state code + 10-char PAN + 1 entity code
     + 'Z' + 1 check digit.
   - Check digit: Luhn mod-36 over the first 14 chars. Alphabet
     "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" (0-35); left to
     right with alternating factor 1,2; digit = floor(p/36)+(p%36);
     check = (36 - total%36) % 36. Cross-checked against known
     valid GSTINs (27AAPFU0939F1ZV, 29AAACH7409R1ZX, 33ABCDE1234F1Z7).
   - Position 14 must be 'Z'; entity code must not be '0';
     PAN: 5 letters + 4 digits + letter, serial != '0000';
     PAN 4th char entity types: P H F A T B L J G C.
   - State codes 01-38 (25 merged into 26 for Dadra & Nagar Haveli
     and Daman & Diu; legacy 25 codes still validate); 96-99 are
     special/other-territory codes (accepted, flagged informational).
   IMPORTANT: this is format-level validation only. Live GSTN
   registration status (active/cancelled/suspended) CANNOT be
   checked without the GSTN API — the page says this plainly and
   the risk score is explicitly a heuristic.
   Core logic is DOM-free so it can be unit-tested in node.
   ============================================================ */

var ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

var STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu (legacy — merged into 26)',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra', '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh (new)', '38': 'Ladakh',
  '96': 'Other territory (special code)', '97': 'Other territory (special code)',
  '98': 'Other territory (special code)', '99': 'Other territory (special code)'
};

var PAN_ENTITY_TYPES = {
  P: 'Individual', C: 'Company', H: 'HUF', F: 'Firm',
  A: 'AOP', T: 'Trust', B: 'BOI', L: 'Local Authority',
  J: 'Artificial Juridical Person', G: 'Government'
};

/** Compute the mod-36 Luhn check character for a 14-char prefix. */
function checkDigit(prefix14) {
  var total = 0, factor = 1;
  for (var i = 0; i < 14; i++) {
    var v = ALPHABET.indexOf(prefix14[i]);
    if (v < 0) return null;
    var p = v * factor;
    total += Math.floor(p / 36) + (p % 36);
    factor = (factor === 1) ? 2 : 1;
  }
  return ALPHABET[(36 - (total % 36)) % 36];
}

/**
 * Validate one GSTIN.
 * Returns {gstin, valid, state, stateName, pan, entity, entityType,
 *          risk:'low'|'medium'|'high'|'invalid', issues:[...]}
 */
function validateGSTIN(raw) {
  var g = String(raw || '').trim().toUpperCase().replace(/[\s-]/g, '');
  var issues = [];
  var res = { gstin: g, valid: false, risk: 'invalid', issues: issues,
              state: null, stateName: null, pan: null, entity: null, entityType: null };

  if (g.length !== 15) { issues.push('Must be exactly 15 characters (got ' + g.length + ').'); return res; }
  if (!/^[0-9A-Z]{15}$/.test(g)) { issues.push('Only digits and capital letters A–Z are allowed.'); return res; }

  var state = g.slice(0, 2);
  res.state = state;
  if (STATE_CODES[state]) {
    res.stateName = STATE_CODES[state];
    if (state === '25') issues.push('Legacy state code 25 (Daman & Diu) — merged into 26; old GSTINs remain valid.');
    if (['96', '97', '98', '99'].indexOf(state) >= 0) issues.push('Special "other territory" code — verify the registration type.');
  } else {
    issues.push('Unknown state code "' + state + '" — not a valid Indian GST state code.');
    return res;
  }

  var pan = g.slice(2, 12);
  res.pan = pan;
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    issues.push('Embedded PAN "' + pan + '" is malformed (expected 5 letters + 4 digits + letter).');
    return res;
  }
  if (pan.slice(5, 9) === '0000') issues.push('PAN serial "0000" is not a valid PAN pattern.');
  var etype = pan[3];
  res.entityType = PAN_ENTITY_TYPES[etype] || null;
  if (!res.entityType) issues.push('PAN 4th character "' + etype + '" is not a recognised entity type.');

  var entity = g[12];
  res.entity = entity;
  if (entity === '0') { issues.push('Entity code cannot be 0.'); return res; }

  if (g[13] !== 'Z') { issues.push('Character 14 must be the letter "Z".'); return res; }

  var expected = checkDigit(g.slice(0, 14));
  if (expected === null) { issues.push('Could not compute checksum (bad character).'); return res; }
  if (g[14] !== expected) {
    issues.push('Checksum FAILED — expected check digit "' + expected + '", found "' + g[14] + '". Likely a typo; verify against the invoice/registration certificate.');
    res.risk = 'high';
    return res;
  }

  res.valid = true;
  // heuristic risk among checksum-valid GSTINs
  if (issues.length) res.risk = 'medium';
  else res.risk = 'low';
  return res;
}

/**
 * Validate a batch; flags duplicates within the batch.
 * entries: [{gstin, name, note}]
 * Returns {results:[...], counts:{low,medium,high,invalid}}
 */
function validateBatch(entries) {
  var seen = {};
  var results = (entries || []).map(function (e) {
    var r = validateGSTIN(e.gstin);
    r.name = e.name || '';
    r.note = e.note || '';
    var key = r.gstin;
    if (key && key.length === 15) {
      if (seen[key]) {
        r.issues.push('Duplicate GSTIN in your list (entered ' + (seen[key] + 1) + ' times).');
        if (r.risk === 'low') r.risk = 'medium';
      }
      seen[key] = (seen[key] || 0) + 1;
    }
    return r;
  });
  var counts = { low: 0, medium: 0, high: 0, invalid: 0 };
  results.forEach(function (r) { counts[r.risk]++; });
  return { results: results, counts: counts };
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function vcInit() {
  var SLUG = 'vendor-compliance-checker';
  var FREE_LIMIT = 20; // validation batches per day
  var SAVE_CAP = 25;   // vendors in vault

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'GSTIN ka format kya hota hai? (What is the GSTIN format?)',
      a: '15 characters: 2-digit state code (e.g. 27 = Maharashtra) + 10-character PAN + 1 entity code (usually 1) + the letter "Z" + 1 check digit computed by a checksum to catch typos.' },
    { q: 'Checksum fail ka matlab vendor fake hai? (Does a failed checksum mean the vendor is fake?)',
      a: 'No — it is usually a typing mistake. Re-verify the GSTIN against the invoice or registration certificate first, then check the live status on gst.gov.in → Search Taxpayer.' },
    { q: 'Kya ye tool vendor ka live GST status batata hai? (Does this tool show live GST registration status?)',
      a: 'No. Live status (active/cancelled/suspended) needs the GSTN API, which a static offline tool cannot call. This tool validates format + checksum and applies risk heuristics; verify high-risk flags on the portal.' },
    { q: 'Vendor list kahan save hoti hai? (Where is the vendor list stored?)',
      a: 'Only in this browser\'s local vault (optionally passphrase-encrypted). Up to 25 vendors; you can delete any entry any time.' },
    { q: 'Risk score kaise banta hai? (How is the risk score computed?)',
      a: 'Checksum failure or format error → high/invalid; PAN/entity pattern issues or duplicates → medium; all checks pass → low (format OK). It is a heuristic — a high flag means "verify on the portal", not "bad vendor".' }
  ]);
  SEO.softwareApp({
    name: 'Vendor Compliance Checker — वेंडर GSTIN वेरिफिकेशन',
    description: 'Free vendor compliance checker: validate GSTIN format and checksum, flag risky vendor patterns, keep a vault-saved vendor list with risk flags. 100% on-device.',
    keywords: ['vendor compliance checker', 'GSTIN verification', 'जीएसटीआईएन वेरिफिकेशन', 'GSTIN format check', 'vendor GSTIN validation', 'GSTIN checksum validator', 'vendor risk check GST']
  });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var lastBatch = null;

  el('addVendorBtn').addEventListener('click', function () {
    var ta = el('gstinInput');
    var extra = ta.value.trim() ? '\n' : '';
    // vendor name/note are attached at validation time per line; keep input simple
    ta.value = (ta.value.trim() + extra).trim();
    el('vc-error').textContent = 'GSTINs already in the box will be validated together — type or paste one GSTIN per line, then press "Validate all".';
  });

  el('clearInputBtn').addEventListener('click', function () {
    el('gstinInput').value = ''; el('vendorName').value = ''; el('vendorNote').value = '';
    el('vc-error').textContent = ''; el('vc-upsell').innerHTML = '';
  });

  var RISK_LABEL = { low: 'LOW — format OK', medium: 'MEDIUM', high: 'HIGH', invalid: 'INVALID' };

  function renderBatch(batch) {
    var c = batch.counts;
    el('vcSummary').innerHTML =
      '<div class="sum-cell"><div class="k">Checked</div><div class="v">' + batch.results.length + '</div></div>' +
      '<div class="sum-cell"><div class="k">Low risk</div><div class="v" style="color:#1a7f37">' + c.low + '</div></div>' +
      '<div class="sum-cell"><div class="k">Medium</div><div class="v" style="color:#a15c00">' + c.medium + '</div></div>' +
      '<div class="sum-cell"><div class="k">High / Invalid</div><div class="v" style="color:#b42318">' + (c.high + c.invalid) + '</div></div>';

    var html = '';
    batch.results.forEach(function (r) {
      var meta = [];
      if (r.stateName) meta.push('State: ' + r.stateName);
      if (r.entityType) meta.push('Entity: ' + r.entityType);
      if (r.name) meta.push('Name: ' + r.name);
      html += '<div class="vendor-row"><span class="flag ' + r.risk + '">' + RISK_LABEL[r.risk] + '</span>' +
        '<div><div class="g">' + esc(r.gstin || '(blank)') + '</div>' +
        (meta.length ? '<div class="why">' + meta.map(esc).join(' · ') + '</div>' : '') +
        (r.issues.length ? '<ul class="why">' + r.issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>'
          : '<div class="why">All format checks passed. (Live GSTN status not checked — verify on gst.gov.in.)</div>') +
        '</div><div class="acts"></div></div>';
    });
    el('vcList').innerHTML = html || '<p class="vq-hint">No GSTINs entered.</p>';
    el('vc-result').style.display = 'block';
  }

  el('validateBtn').addEventListener('click', function () {
    var gate = Freemium.check(SLUG, FREE_LIMIT);
    if (!gate.allowed) {
      Freemium.renderUpsell(el('vc-upsell'), SLUG, FREE_LIMIT);
      el('vc-result').style.display = 'none';
      return;
    }
    el('vc-upsell').innerHTML = '';
    el('vc-error').textContent = ''; el('vc-saved').textContent = '';

    var lines = el('gstinInput').value.split(/\r?\n/)
      .map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) { el('vc-error').textContent = 'Paste at least one GSTIN (one per line).'; return; }

    var name = el('vendorName').value.trim();
    var note = el('vendorNote').value.trim();
    var entries = lines.map(function (l, i) {
      return { gstin: l, name: (lines.length === 1 ? name : ''), note: (lines.length === 1 ? note : '') };
    });
    lastBatch = validateBatch(entries);
    renderBatch(lastBatch);
  });

  el('saveVendorsBtn').addEventListener('click', async function () {
    if (!lastBatch || !lastBatch.results.length) return;
    try {
      var existing = {};
      (await Vault.list(SLUG)).forEach(function (e) { existing[e.key] = true; });
      var toSave = lastBatch.results.filter(function (r) {
        return r.gstin && !existing['vendor-' + r.gstin];
      });
      var room = SAVE_CAP - Object.keys(existing).length;
      if (toSave.length > room) {
        Freemium.renderUpsell(el('vc-upsell'), SLUG, SAVE_CAP);
        el('vc-saved').textContent = '';
        return;
      }
      for (var i = 0; i < toSave.length; i++) {
        var r = toSave[i];
        await Vault.save(SLUG, 'vendor-' + r.gstin, {
          gstin: r.gstin, name: r.name || '', note: r.note || '',
          state: r.state, stateName: r.stateName, pan: r.pan,
          entityType: r.entityType, risk: r.risk, issues: r.issues,
          validatedAt: new Date().toISOString()
        });
      }
      el('vc-saved').textContent = toSave.length
        ? toSave.length + ' vendor(s) saved on this device.'
        : 'These vendors are already in your saved list.';
      renderSaved();
    } catch (e) {
      el('vc-error').textContent = 'Could not save: ' + e.message;
    }
  });

  async function renderSaved() {
    var box = el('savedVendors');
    try {
      var list = await Vault.list(SLUG);
      if (!list.length) { box.innerHTML = '<p class="vq-hint">No saved vendors yet.</p>'; return; }
      var html = '';
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var d = await Vault.load(SLUG, list[i].key);
        if (d) items.push(d);
      }
      items.forEach(function (d) {
        html += '<div class="vendor-row"><span class="flag ' + d.risk + '">' + RISK_LABEL[d.risk] + '</span>' +
          '<div><div class="g">' + esc(d.gstin) + '</div>' +
          '<div class="why">' + esc([d.name, d.stateName].filter(Boolean).join(' · ') || '—') + '</div></div>' +
          '<div class="acts"><button class="vq-btn ghost" data-del="vendor-' + esc(d.gstin) + '" type="button">Delete</button></div></div>';
      });
      box.innerHTML = html || '<p class="vq-hint">No saved vendors yet.</p>';
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', async function () {
          await Vault.remove(SLUG, b.getAttribute('data-del'));
          renderSaved();
        });
      });
    } catch (e) {
      box.innerHTML = '<p class="vq-hint">Could not read saved vendors.</p>';
    }
  }

  renderSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vcInit);
  } else { vcInit(); }
}

/* node test hook */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateGSTIN: validateGSTIN, validateBatch: validateBatch,
    checkDigit: checkDigit, STATE_CODES: STATE_CODES };
}
