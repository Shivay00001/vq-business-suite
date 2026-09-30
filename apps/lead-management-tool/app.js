/* ============================================================
   Lead Management Tool — pure computation layer.
   Lead: {id, name, phone, source, value, stage, followUp, note, createdAt}
   stages: new -> contacted -> negotiating -> won / lost
   DOM-free; unit-testable in node.
   ============================================================ */

function round2(n) { return Math.round((n + 1e-9) * 100) / 100; }

function uid(p) {
  return (p || 'x') + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

function inr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var STAGES = ['new', 'contacted', 'negotiating', 'won', 'lost'];
var STAGE_LABEL = { new: 'New', contacted: 'Contacted', negotiating: 'Negotiating', won: 'Won', lost: 'Lost' };
var OPEN_STAGES = ['new', 'contacted', 'negotiating'];

function validateLead(l) {
  if (!l || !String(l.name || '').trim()) return 'Lead name is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.followUp || ''))) return 'Follow-up date is required.';
  if (STAGES.indexOf(l.stage) < 0) return 'Stage invalid hai.';
  if (!(Number(l.value) >= 0)) return 'Value 0 ya usse zyada honi chahiye.';
  return '';
}

/** {new: n, contacted: n, ...} stage-wise counts. */
function stageCounts(leads) {
  var r = { new: 0, contacted: 0, negotiating: 0, won: 0, lost: 0 };
  (leads || []).forEach(function (l) {
    if (r[l.stage] == null) r[l.stage] = 0;
    r[l.stage]++;
  });
  return r;
}

/** Sum of expected value of open (non-won/lost) leads. */
function openPipelineValue(leads) {
  var t = 0;
  (leads || []).forEach(function (l) {
    if (OPEN_STAGES.indexOf(l.stage) >= 0) t = round2(t + (Number(l.value) || 0));
  });
  return t;
}

/** true if follow-up date has passed and the lead is still open. */
function isOverdue(lead, asOfISO) {
  if (!lead || OPEN_STAGES.indexOf(lead.stage) < 0) return false;
  var f = new Date(String(lead.followUp).slice(0, 10) + 'T00:00:00');
  var a = new Date(String(asOfISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(f.getTime()) || isNaN(a.getTime())) return false;
  return f < a;
}

/** Overdue open leads as of a date. */
function overdueLeads(leads, asOfISO) {
  return (leads || []).filter(function (l) { return isOverdue(l, asOfISO); });
}

/** Next stage in the pipeline (linear path). */
function nextStage(stage) {
  var i = STAGES.indexOf(stage);
  if (i < 0 || i >= 3) return null; // won/lost have no "next"
  return STAGES[i + 1];
}

/** CSV export of all leads. */
function leadsCSV(leads) {
  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  var rows = ['Name,Phone,Source,Value,FollowUp,Stage,Note'];
  (leads || []).forEach(function (l) {
    rows.push([q(l.name), q(l.phone), q(l.source), q(l.value), q(l.followUp), q(l.stage), q(l.note)].join(','));
  });
  return rows.join('\r\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function lmInit() {
  var SLUG = 'lead-management-tool';
  var EXPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var leads = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Lead pipeline stages ka matlab kya hai?',
      a: 'New = fresh lead, Contacted = baat ho gayi, Negotiating = price/terms par baat chal rahi hai, Won = deal close ho gaya, Lost = lead haath se nikal gaya.' },
    { q: 'Overdue follow-up highlight kyon hai?',
      a: 'Agar follow-up date nikal gayi aur lead abhi bhi open hai, to row red highlight ho jaati hai — taaki koi follow-up miss na ho.' },
    { q: 'Open pipeline value kya hoti hai?',
      a: 'New + Contacted + Negotiating leads ke expected values ka total — ye batata hai kitna business pipeline me hai. Won leads isme nahi judte.' },
    { q: 'लीड मैनेजमेंट क्यों ज़रूरी है?',
      a: 'Leads ko copy-register me track karne se follow-ups miss hote hain. Pipeline view me har lead ka stage aur follow-up date saaf dikhta hai.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Lead Management Tool — लीड मैनेजमेंट',
    description: 'Free lead management for Indian SMEs: lead pipeline with stages (new → contacted → negotiating → won/lost), follow-up dates with overdue highlights, stage-wise counts, CSV export.',
    keywords: ['lead management', 'लीड मैनेजमेंट', 'lead pipeline India', 'sales lead tracker', 'lead follow up tool', 'लीड ट्रैकिंग', 'lead stages', 'free CRM leads']
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
    return Vault.save(SLUG, 'data', { leads: leads }).catch(function () {});
  }

  function addLead() {
    var err = el('l-error'); err.textContent = '';
    var l = {
      id: uid('l'),
      name: el('l-name').value.trim(),
      phone: el('l-phone').value.trim(),
      source: el('l-source').value,
      value: parseFloat(el('l-value').value) || 0,
      stage: 'new',
      followUp: el('l-followup').value,
      note: el('l-note').value.trim(),
      createdAt: new Date().toISOString()
    };
    var verr = validateLead(l);
    if (verr) { err.textContent = verr; return; }
    leads.push(l);
    el('l-name').value = ''; el('l-phone').value = ''; el('l-value').value = '';
    el('l-followup').value = ''; el('l-note').value = '';
    persist().then(render);
  }

  function moveLead(id, stage) {
    leads = leads.map(function (l) { return l.id === id ? Object.assign({}, l, { stage: stage }) : l; });
    persist().then(render);
  }

  function delLead(id) {
    if (!window.confirm('Delete this lead?')) return;
    leads = leads.filter(function (l) { return l.id !== id; });
    persist().then(render);
  }

  function stagePill(stage) {
    return '<span class="pill st-' + stage + '">' + STAGE_LABEL[stage] + '</span>';
  }

  function render() {
    var counts = stageCounts(leads);
    el('stageGrid').innerHTML = STAGES.map(function (s) {
      return '<div class="stage-cell"><div class="num">' + counts[s] + '</div><div class="lbl">' +
        STAGE_LABEL[s] + '</div></div>';
    }).join('') +
    '<div class="stage-cell" style="border-color:var(--brand)"><div class="num">' + inr(openPipelineValue(leads)) +
    '</div><div class="lbl">Open pipeline value</div></div>';

    var asOf = today();
    if (!leads.length) {
      el('leadBody').innerHTML = '<tr><td colspan="6" class="vq-hint">Koi lead nahi hai — upar form se add karein.</td></tr>';
      return;
    }
    el('leadBody').innerHTML = leads.map(function (l) {
      var od = isOverdue(l, asOf);
      var nx = nextStage(l.stage);
      var actions = nx
        ? '<button class="vq-btn ghost mini" data-move="' + l.id + '" type="button">→ ' + STAGE_LABEL[nx] + '</button> '
        : '';
      return '<tr class="' + (od ? 'overdue' : '') + '">' +
        '<td><strong>' + esc(l.name) + '</strong>' + (l.phone ? '<br><span class="vq-hint">' + esc(l.phone) + '</span>' : '') + '</td>' +
        '<td>' + esc(l.source || '—') + '</td>' +
        '<td class="r">' + inr(l.value) + '</td>' +
        '<td>' + esc(l.followUp) + (od ? ' <span class="pill st-overdue">Overdue!</span>' : '') + '</td>' +
        '<td>' + stagePill(l.stage) + '</td>' +
        '<td class="row-actions no-print">' + actions +
        '<button class="vq-btn ghost mini" data-del="' + l.id + '" type="button">Delete</button></td></tr>';
    }).join('');
    el('leadBody').querySelectorAll('[data-move]').forEach(function (b) {
      var l = leads.filter(function (x) { return x.id === b.getAttribute('data-move'); })[0];
      b.addEventListener('click', function () { moveLead(l.id, nextStage(l.stage)); });
    });
    el('leadBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delLead(b.getAttribute('data-del')); });
    });
  }

  function downloadCSV() {
    el('lm-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, EXPORT_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('lm-upsell'), SLUG, EXPORT_LIMIT); return; }
    if (!leads.length) { el('l-error').textContent = 'Export ke liye pehle lead add karein.'; return; }
    var blob = new Blob([leadsCSV(leads)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
    el('lm-saved').textContent = 'CSV exported ✓ (' + Freemium.remaining(SLUG, EXPORT_LIMIT) + ' free exports left today)';
  }

  async function saveSnapshot() {
    el('lm-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('lm-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), counts: stageCounts(leads),
        openPipelineValue: openPipelineValue(leads), leads: leads
      });
      el('lm-saved').textContent = 'Snapshot saved ✓ (' + leads.length + ' leads, ' +
        Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('l-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addLeadBtn').addEventListener('click', addLead);
  el('exportBtn').addEventListener('click', downloadCSV);
  el('saveBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('l-followup').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.leads)) leads = d.leads;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lmInit);
  } else { lmInit(); }
}
