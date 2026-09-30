/* ============================================================
   Sprint Planner — pure planning logic (DOM-free,
   unit-testable in node). T-shirt → story-point map, sprint
   fit calculator, and an SVG burndown chart renderer.
   ============================================================ */

var TSHIRT_POINTS = { XS: 1, S: 2, M: 3, L: 5, XL: 8, XXL: 13 };

/**
 * items: [{ title, size }] — size is a T-shirt key.
 * capacity: number (story points the team can take).
 * Returns { total, capacity, status, overBy, fillPct, unassigned }.
 * status: 'ok' (fits), 'over' (scope warning), 'under' (spare capacity).
 */
function sprintFit(items, capacity) {
  var total = 0;
  (items || []).forEach(function (it) {
    total += TSHIRT_POINTS[it.size] || 0;
  });
  capacity = Number(capacity) || 0;
  var overBy = total - capacity;
  var status = overBy > 0 ? 'over' : (total < capacity ? 'under' : 'ok');
  return {
    total: total,
    capacity: capacity,
    status: status,
    overBy: overBy > 0 ? overBy : 0,
    spare: overBy < 0 ? -overBy : 0,
    fillPct: capacity > 0 ? Math.round(total / capacity * 100) : 0
  };
}

/** Average velocity from the last up-to-3 completed sprint totals. */
function avgVelocity(history) {
  var h = (history || []).map(Number).filter(function (n) { return n > 0; }).slice(-3);
  if (!h.length) return 0;
  return Math.round(h.reduce(function (a, b) { return a + b; }, 0) / h.length * 10) / 10;
}

/**
 * Simple SVG burndown: ideal line from `total` to 0 over `days`.
 * Returns an SVG string (no external deps).
 */
function burndownSvg(total, days, opts) {
  opts = opts || {};
  var W = opts.w || 560, H = opts.h || 280;
  var padL = 44, padB = 30, padT = 14, padR = 10;
  total = Math.max(1, Number(total) || 1);
  days = Math.max(1, Math.round(Number(days) || 10));
  var iw = W - padL - padR, ih = H - padT - padB;
  function X(d) { return padL + iw * d / days; }
  function Y(p) { return padT + ih * (1 - p / total); }

  var grid = '';
  for (var g = 0; g <= 4; g++) {
    var py = padT + ih * g / 4;
    var pv = Math.round(total * (1 - g / 4));
    grid += '<line x1="' + padL + '" y1="' + py + '" x2="' + (W - padR) + '" y2="' + py + '" stroke="#e5e7eb"/>' +
      '<text x="' + (padL - 6) + '" y="' + (py + 4) + '" font-size="10" text-anchor="end" fill="#6b7280">' + pv + '</text>';
  }
  var xticks = '';
  var step = days > 14 ? Math.ceil(days / 7) : 1;
  for (var d = 0; d <= days; d += step) {
    xticks += '<text x="' + X(d) + '" y="' + (H - 10) + '" font-size="10" text-anchor="middle" fill="#6b7280">D' + d + '</text>';
  }
  var ideal = '<line x1="' + X(0) + '" y1="' + Y(total) + '" x2="' + X(days) + '" y2="' + Y(0) +
    '" stroke="#2563eb" stroke-width="2.5"/>';
  var dots = '<circle cx="' + X(0) + '" cy="' + Y(total) + '" r="4" fill="#2563eb"/>' +
    '<circle cx="' + X(days) + '" cy="' + Y(0) + '" r="4" fill="#2563eb"/>';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Sprint burndown chart">' +
    grid + xticks + ideal + dots +
    '<text x="' + (padL - 34) + '" y="' + (padT + 8) + '" font-size="10" fill="#6b7280" transform="rotate(-90 ' + (padL - 34) + ' ' + (padT + 8) + ')">points</text>' +
    '<text x="' + X(0) + '" y="' + (Y(total) - 10) + '" font-size="11" fill="#2563eb" font-weight="bold">' + total + ' pts</text>' +
    '</svg>';
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function spInit() {
  var SLUG = 'sprint-planner';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Story points kya hote hain? (What are story points?)',
      a: 'Story points measure effort/complexity relatively, not hours. Teams often use T-shirt sizes (XS=1 … XXL=13) or Fibonacci numbers so estimates stay comparative.' },
    { q: 'Sprint capacity kaise calculate karein?',
      a: 'Take your average velocity (completed points over the last 3 sprints) and subtract planned leave/meetings. This planner warns you when the backlog exceeds capacity.' },
    { q: 'Burndown chart kya dikhata hai?',
      a: 'Remaining work over sprint days. The ideal line goes from total points to zero; if your actual line stays above it, scope or pace needs attention.' },
    { q: 'Velocity aur capacity me kya antar hai?',
      a: 'Velocity is what you actually completed (history); capacity is what you plan to take on (forecast). Healthy planning keeps commitment near proven velocity.' },
    { q: 'Kya mere sprint plans device par save hote hain?',
      a: 'Yes — plans are saved to this device\'s vault with optional passphrase encryption. Nothing leaves your browser.' }
  ]);
  SEO.softwareApp({
    name: 'Sprint Planner — Free Agile Planning Tool',
    description: 'Free sprint planner: backlog with T-shirt → story-point map, capacity & velocity fit calculator, SVG burndown chart, scope warnings, vault save.',
    keywords: ['sprint planner', 'sprint planning tool', 'story points calculator', 't-shirt sizing story points', 'burndown chart generator', 'agile sprint capacity']
  });

  var items = [];

  function readInputs() {
    return {
      days: Math.max(1, parseInt(el('sprintDays').value, 10) || 10),
      capacity: Math.max(0, parseFloat(el('capacity').value) || 0),
      velocity: avgVelocity(el('velocityHist').value.split(','))
    };
  }

  function render() {
    var box = el('sp-items');
    if (!items.length) {
      box.innerHTML = '<p class="vq-hint">Backlog khaali hai — pehla item add karein.</p>';
    } else {
      box.innerHTML = items.map(function (it, i) {
        var pts = TSHIRT_POINTS[it.size] || 0;
        return '<div class="saved-row"><span><strong>' + esc(it.title) + '</strong> · ' + esc(it.size) + ' (' + pts + ' pts)</span>' +
          '<button class="vq-btn ghost sm" data-del="' + i + '">Remove</button></div>';
      }).join('');
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          items.splice(+b.getAttribute('data-del'), 1);
          render();
        });
      });
    }
    var inp = readInputs();
    var fit = sprintFit(items, inp.capacity || inp.velocity);
    el('sp-total').textContent = fit.total + ' pts';
    el('sp-cap').textContent = (inp.capacity || inp.velocity || 0) + ' pts';
    el('sp-fill').textContent = fit.fillPct + '%';
    var warn = el('sp-warn');
    if (fit.status === 'over') {
      warn.innerHTML = '<strong>⚠ Scope warning:</strong> backlog capacity se <strong>' + fit.overBy + ' points zyada</strong> hai. Kuch items agle sprint me move karein ya capacity badhayein.';
      warn.style.display = 'block';
    } else if (fit.status === 'under' && items.length) {
      warn.innerHTML = '<strong>ℹ Spare capacity:</strong> ' + fit.spare + ' points khaali hain — chhota item aur le sakte hain.';
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
    if (inp.velocity && !inp.capacity) {
      el('sp-velnote').textContent = 'Using avg velocity (' + inp.velocity + ' pts) as capacity — enter team capacity to override.';
    } else if (inp.velocity) {
      el('sp-velnote').textContent = 'Avg velocity (last 3 sprints): ' + inp.velocity + ' pts.';
    } else {
      el('sp-velnote').textContent = '';
    }
    el('sp-chart').innerHTML = burndownSvg(fit.total || 1, inp.days);
  }

  function addItem() {
    var title = el('itemTitle').value.trim();
    var size = el('itemSize').value;
    if (!title) { el('sp-msg').textContent = 'Item ka title likhein.'; return; }
    items.push({ title: title, size: size });
    el('itemTitle').value = '';
    el('sp-msg').textContent = '';
    render();
  }

  async function savePlan() {
    var msg = el('sp-msg');
    if (!items.length) { msg.textContent = 'Pehle backlog me items add karein.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('sp-upsell'), SLUG, SAVE_LIMIT); return; }
    el('sp-upsell').innerHTML = '';
    var name = (el('planName').value.trim() || 'Sprint') + ' — ' + new Date().toLocaleDateString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, items: items, inputs: readInputs(), savedAt: new Date().toISOString() });
      msg.textContent = 'Plan saved on this device (' + gate.remaining + ' saves left today).';
      el('planName').value = '';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('sp-saved');
    try {
      var saved = await Vault.list(SLUG);
      if (!saved.length) { list.innerHTML = '<p class="vq-hint">No saved plans yet.</p>'; return; }
      list.innerHTML = saved.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.items) {
              items = d.items;
              if (d.inputs) {
                el('sprintDays').value = d.inputs.days || 10;
                el('capacity').value = d.inputs.capacity || '';
              }
              render();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          } catch (e) { el('sp-msg').textContent = 'Could not load: ' + e.message; }
        });
      });
      list.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', async function () {
          await Vault.remove(SLUG, b.getAttribute('data-del'));
          refreshSaved();
        });
      });
    } catch (e) {
      list.innerHTML = '<p class="vq-hint">Vault unavailable in this browser.</p>';
    }
  }

  async function setPassphrase() {
    var msg = el('sp-msg');
    var pp = el('sp-pass').value;
    if (!pp) { Vault.clearPassphrase(); msg.textContent = 'Passphrase cleared — saving unencrypted.'; return; }
    try {
      await Vault.setPassphrase(pp);
      msg.textContent = 'Passphrase set — saved plans will be encrypted on this device.';
    } catch (e) {
      // Graceful on non-secure contexts (file://): continue unencrypted and say so.
      msg.textContent = 'Encryption unavailable here (' + e.message + ') — saving unencrypted.';
    }
  }

  el('addItemBtn').addEventListener('click', addItem);
  el('itemTitle').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); addItem(); }
  });
  ['sprintDays', 'capacity', 'velocityHist'].forEach(function (id) {
    el(id).addEventListener('input', render);
  });
  el('savePlanBtn').addEventListener('click', savePlan);
  el('ppBtn').addEventListener('click', setPassphrase);
  render();
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', spInit);
  } else { spInit(); }
}
