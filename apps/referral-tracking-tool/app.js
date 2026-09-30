/* ============================================================
   Referral Tracking Tool — pure computation layer.
   Referral: {id, referrer, referee, contact, date, reward,
              status:'invited'|'joined'|'purchased', paid:bool, note}
   reward due = Σ reward where status='purchased' && !paid
   reward paid = Σ reward where paid
   top referrers ranked by purchased count, then reward earned.
   Security: lengths capped, ranges checked, reward non-negative.
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

var RSTATUSES = ['invited', 'joined', 'purchased'];
var RSTATUS_LABEL = { invited: 'Invited', joined: 'Joined', purchased: 'Purchased' };

function validateReferral(r) {
  if (!r) return 'Referral data missing hai.';
  if (!String(r.referrer || '').trim()) return 'Referrer name is required.';
  if (!String(r.referee || '').trim()) return 'Referee name is required.';
  if (String(r.referrer).length > 120 || String(r.referee).length > 120)
    return 'Naam 120 characters se zyada nahi ho sakte.';
  if (String(r.contact || '').length > 60) return 'Contact 60 characters se zyada nahi ho sakta.';
  if (String(r.note || '').length > 200) return 'Note 200 characters se zyada nahi ho sakta.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) return 'Date is required.';
  var rw = Number(r.reward);
  if (!isFinite(rw) || !(rw >= 0)) return 'Reward 0 ya usse zyada hona chahiye (negative nahi).';
  if (rw > 1e7) return 'Reward bahut bada hai — entry check karein.';
  if (RSTATUSES.indexOf(r.status) < 0) return 'Status invalid hai.';
  return '';
}

/** Next status in invited → joined → purchased. */
function nextRStatus(s) {
  var i = RSTATUSES.indexOf(s);
  return (i >= 0 && i < RSTATUSES.length - 1) ? RSTATUSES[i + 1] : null;
}

/** {due, paid} reward totals. */
function rewardTotals(refs) {
  var due = 0, paid = 0;
  (refs || []).forEach(function (r) {
    var rw = round2(Number(r.reward) || 0);
    if (r.paid) { paid = round2(paid + rw); return; }
    if (r.status === 'purchased') due = round2(due + rw);
  });
  return { due: due, paid: paid };
}

/**
 * Top referrers: [{referrer, purchased, total, due, paid}]
 * ranked by purchased count desc, then total referrals desc.
 */
function topReferrers(refs) {
  var map = {};
  (refs || []).forEach(function (r) {
    var k = String(r.referrer || '').trim();
    if (!k) return;
    if (!map[k]) map[k] = { referrer: k, purchased: 0, total: 0, due: 0, paid: 0 };
    var rw = round2(Number(r.reward) || 0);
    map[k].total++;
    if (r.status === 'purchased') map[k].purchased++;
    if (r.paid) map[k].paid = round2(map[k].paid + rw);
    else if (r.status === 'purchased') map[k].due = round2(map[k].due + rw);
  });
  return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
    if (b.purchased !== a.purchased) return b.purchased - a.purchased;
    return b.total - a.total;
  });
}

/** Referral counts by status. */
function refStatusCounts(refs) {
  var c = { invited: 0, joined: 0, purchased: 0 };
  (refs || []).forEach(function (r) { if (c[r.status] != null) c[r.status]++; });
  return c;
}

/** CSV export. */
function referralsCSV(refs) {
  function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  var rows = ['Date,Referrer,Referee,Contact,Status,Reward,RewardPaid,Note'];
  (refs || []).forEach(function (r) {
    rows.push([q(r.date), q(r.referrer), q(r.referee), q(r.contact), q(r.status),
               q(r.reward), q(r.paid ? 'yes' : 'no'), q(r.note)].join(','));
  });
  return rows.join('\r\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function rtInit() {
  var SLUG = 'referral-tracking-tool';
  var EXPORT_LIMIT = 20, SAVE_LIMIT = 25;
  var refs = [];

  function el(id) { return document.getElementById(id); }
  function today() { return new Date().toISOString().slice(0, 10); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Referral status ka flow kya hai?',
      a: 'Invited = referee ko invite kiya gaya, Joined = vo jud gaya (signup/visit), Purchased = usne khareed liya. Reward sirf purchased par due hota hai.' },
    { q: 'Reward due aur reward paid me kya farak hai?',
      a: 'Due = referee ne purchase kar liya par referrer ko reward abhi dena baaki hai. Log me Mark paid dabane par vo paid me chala jaata hai.' },
    { q: 'Top referrers list kaise banti hai?',
      a: 'Har referrer ke purchased referrals gine jaate hain — sabse zyada successful referrals wala sabse upar. Ye aapke best brand ambassadors hain.' },
    { q: 'रेफरल प्रोग्राम क्यों ज़रूरी है?',
      a: 'Referral se aane wale customers ka bharosa pehle se hota hai aur vo aam leads se zyada khareedte hain. Chhota sa reward dekar aap apne customers ko apna sales team bana sakte hain.' },
    { q: 'Kya mera data safe hai?',
      a: 'Haan — saara data sirf aapke browser ke vault me store hota hai. Passphrase se encrypt bhi kar sakte hain.' }
  ]);
  SEO.softwareApp({
    name: 'Referral Tracking Tool — रेफरल ट्रैकिंग',
    description: 'Free referral tracking for Indian SMEs: referrer → referee links, referral status (invited/joined/purchased), reward due/paid tracking, top referrers list, CSV export.',
    keywords: ['referral tracking', 'रेफरल ट्रैकिंग', 'referral program India', 'refer and earn tracker', 'referee referral software', 'top referrers', 'referral reward tracker', 'रेफरल प्रोग्राम']
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
    return Vault.save(SLUG, 'data', { refs: refs }).catch(function () {});
  }

  function addReferral() {
    var err = el('r-error'); err.textContent = '';
    var r = {
      id: uid('r'),
      referrer: el('r-referrer').value.trim().slice(0, 120),
      referee: el('r-referee').value.trim().slice(0, 120),
      contact: el('r-contact').value.trim().slice(0, 60),
      date: el('r-date').value,
      reward: parseFloat(el('r-reward').value),
      status: 'invited',
      paid: false,
      note: el('r-note').value.trim().slice(0, 200),
      createdAt: new Date().toISOString()
    };
    if (!isFinite(r.reward)) r.reward = NaN;
    var verr = validateReferral(r);
    if (verr) { err.textContent = verr; return; }
    refs.push(r);
    el('r-referrer').value = ''; el('r-referee').value = ''; el('r-contact').value = '';
    el('r-reward').value = ''; el('r-note').value = '';
    persist().then(render);
  }

  function findRef(id) {
    return refs.filter(function (x) { return x.id === id; })[0];
  }

  function advanceStatus(id) {
    var r = findRef(id);
    if (!r) return;
    var nx = nextRStatus(r.status);
    if (nx) { r.status = nx; persist().then(render); }
  }

  function togglePaid(id) {
    var r = findRef(id);
    if (!r) return;
    r.paid = !r.paid;
    persist().then(render);
  }

  function delRef(id) {
    if (!window.confirm('Delete this referral?')) return;
    refs = refs.filter(function (x) { return x.id !== id; });
    persist().then(render);
  }

  function statusPill(s) {
    return '<span class="pill rs-' + s + '">' + RSTATUS_LABEL[s] + '</span>';
  }
  function paidPill(r) {
    if (r.paid) return '<span class="pill rw-paid">Paid</span>';
    if (r.status === 'purchased') return '<span class="pill rw-due">Due</span>';
    return '<span class="vq-hint">—</span>';
  }

  function render() {
    var counts = refStatusCounts(refs);
    var rt = rewardTotals(refs);
    el('kpiTotal').textContent = refs.length;
    el('kpiPurchased').textContent = counts.purchased;
    el('kpiDue').textContent = inr(rt.due);
    el('kpiPaid').textContent = inr(rt.paid);

    if (!refs.length) {
      el('refBody').innerHTML = '<tr><td colspan="7" class="vq-hint">Koi referral nahi hai — upar form se add karein.</td></tr>';
    } else {
      el('refBody').innerHTML = refs.map(function (r) {
        var nx = nextRStatus(r.status);
        var actions = nx
          ? '<button class="vq-btn ghost mini" data-adv="' + r.id + '" type="button">→ ' + RSTATUS_LABEL[nx] + '</button> '
          : '';
        if (r.status === 'purchased') {
          actions += '<button class="vq-btn ghost mini" data-paid="' + r.id + '" type="button">' +
            (r.paid ? 'Mark unpaid' : 'Mark paid') + '</button> ';
        }
        return '<tr>' +
          '<td>' + esc(r.date) + '</td>' +
          '<td><strong>' + esc(r.referrer) + '</strong> → ' + esc(r.referee) +
          (r.note ? '<br><span class="vq-hint">' + esc(r.note) + '</span>' : '') + '</td>' +
          '<td>' + esc(r.contact || '—') + '</td>' +
          '<td>' + statusPill(r.status) + '</td>' +
          '<td class="r">' + inr(r.reward) + '</td>' +
          '<td>' + paidPill(r) + '</td>' +
          '<td class="row-actions no-print">' + actions +
          '<button class="vq-btn ghost mini" data-del="' + r.id + '" type="button">Delete</button></td></tr>';
      }).join('');
    }
    el('refBody').querySelectorAll('[data-adv]').forEach(function (b) {
      b.addEventListener('click', function () { advanceStatus(b.getAttribute('data-adv')); });
    });
    el('refBody').querySelectorAll('[data-paid]').forEach(function (b) {
      b.addEventListener('click', function () { togglePaid(b.getAttribute('data-paid')); });
    });
    el('refBody').querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { delRef(b.getAttribute('data-del')); });
    });

    var top = topReferrers(refs);
    el('topList').innerHTML = top.length ? top.slice(0, 10).map(function (t, i) {
      return '<div class="top-row"><div class="top-rank">' + (i + 1) + '</div>' +
        '<div style="flex:1"><strong>' + esc(t.referrer) + '</strong><br>' +
        '<span class="vq-hint">' + t.purchased + ' purchased · ' + t.total + ' total referrals</span></div>' +
        '<div style="text-align:right"><strong>' + inr(t.due) + '</strong> due' +
        '<br><span class="vq-hint">' + inr(t.paid) + ' paid</span></div></div>';
    }).join('') : '<p class="vq-hint">Abhi koi referral nahi hai — top referrers yahaan dikhenge.</p>';
  }

  function downloadCSV() {
    el('rt-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, EXPORT_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('rt-upsell'), SLUG, EXPORT_LIMIT); return; }
    if (!refs.length) { el('r-error').textContent = 'Export ke liye pehle referral add karein.'; return; }
    var blob = new Blob([referralsCSV(refs)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'referrals-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
    el('rt-saved').textContent = 'CSV exported ✓ (' + Freemium.remaining(SLUG, EXPORT_LIMIT) + ' free exports left today)';
  }

  async function saveSnapshot() {
    el('rt-upsell').innerHTML = '';
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('rt-upsell'), SLUG, SAVE_LIMIT); return; }
    var key = 'snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      await Vault.save(SLUG, key, {
        savedAt: new Date().toISOString(), rewards: rewardTotals(refs),
        top: topReferrers(refs).slice(0, 10), refs: refs
      });
      el('rt-saved').textContent = 'Snapshot saved ✓ (' + Freemium.remaining(SLUG, SAVE_LIMIT) + ' left today)';
    } catch (e) { el('r-error').textContent = 'Save failed: ' + e.message; }
  }

  el('addRefBtn').addEventListener('click', addReferral);
  el('exportBtn').addEventListener('click', downloadCSV);
  el('saveBtn').addEventListener('click', saveSnapshot);
  el('printBtn').addEventListener('click', function () { window.print(); });

  el('r-date').value = today();
  Vault.load(SLUG, 'data').then(function (d) {
    if (d && Array.isArray(d.refs)) refs = d.refs;
    render();
  }).catch(render);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rtInit);
  } else { rtInit(); }
}
