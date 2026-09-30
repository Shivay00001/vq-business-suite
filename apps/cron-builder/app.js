/* ============================================================
   Cron Builder — pure cron logic (DOM-free, unit-testable in
   node). Parses 5-field cron, describes it in plain English,
   and computes upcoming run times with standard cron semantics
   (day-of-month OR day-of-week when both are restricted).
   ============================================================ */

var MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
var DOW_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
var DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTH_LONG = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Expand one cron field into a sorted array of ints, or null if invalid. */
function parseCronField(field, min, max, names) {
  field = String(field == null ? '' : field).trim().toLowerCase();
  if (!field) return null;
  var out = {};
  var parts = field.split(',');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) return null;
    var step = 1;
    var slash = part.indexOf('/');
    var base = part;
    if (slash >= 0) {
      base = part.slice(0, slash);
      step = parseInt(part.slice(slash + 1), 10);
      if (!(step >= 1)) return null;
    }
    function valNum(tok) {
      if (/^\d+$/.test(tok)) {
        var n = parseInt(tok, 10);
        if (names === DOW_NAMES && n === 7) n = 0; // 7 == Sunday
        return n;
      }
      if (names && names[tok] !== undefined) return names[tok];
      return NaN;
    }
    if (base === '*') {
      for (var v = min; v <= max; v += step) out[v] = 1;
    } else if (base.indexOf('-') >= 0) {
      var rng = base.split('-');
      if (rng.length !== 2) return null;
      var a = valNum(rng[0].trim()), b = valNum(rng[1].trim());
      if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) return null;
      for (var w = a; w <= b; w += step) out[w] = 1;
    } else {
      var single = valNum(base);
      if (isNaN(single) || single < min || single > max) return null;
      if (slash >= 0) {
        // explicit step on a start value, e.g. "5/15" -> 5,20,35,50
        for (var u = single; u <= max; u += step) out[u] = 1;
      } else {
        out[single] = 1;
      }
    }
  }
  var arr = Object.keys(out).map(Number).sort(function (x, y) { return x - y; });
  return arr.length ? arr : null;
}

/** Parse a full 5-field expression. Returns {ok, fields, error}. */
function parseCron(expr) {
  var parts = String(expr == null ? '' : expr).trim().split(/\s+/);
  if (parts.length !== 5) {
    return { ok: false, error: 'A cron expression needs exactly 5 fields (minute hour day-of-month month day-of-week).' };
  }
  var specs = [
    { f: parts[0], min: 0, max: 59, names: null, label: 'minute' },
    { f: parts[1], min: 0, max: 23, names: null, label: 'hour' },
    { f: parts[2], min: 1, max: 31, names: null, label: 'day of month' },
    { f: parts[3], min: 1, max: 12, names: MONTH_NAMES, label: 'month' },
    { f: parts[4], min: 0, max: 6, names: DOW_NAMES, label: 'day of week' }
  ];
  var fields = {};
  var keys = ['mins', 'hours', 'doms', 'months', 'dows'];
  for (var i = 0; i < specs.length; i++) {
    var vals = parseCronField(specs[i].f, specs[i].min, specs[i].max, specs[i].names);
    if (!vals) {
      return { ok: false, error: 'Invalid ' + specs[i].label + ' field: "' + parts[i] + '".' };
    }
    fields[keys[i]] = vals;
  }
  fields.domStar = parts[2] === '*';
  fields.dowStar = parts[4] === '*';
  return { ok: true, fields: fields };
}

function inArr(arr, v) { return arr.indexOf(v) >= 0; }

/** Standard cron match for one Date (local time). */
function cronMatches(d, f) {
  if (!inArr(f.mins, d.getMinutes())) return false;
  if (!inArr(f.hours, d.getHours())) return false;
  if (!inArr(f.months, d.getMonth() + 1)) return false;
  var domMatch = inArr(f.doms, d.getDate());
  var dowMatch = inArr(f.dows, d.getDay());
  var dayOk;
  if (f.domStar && f.dowStar) dayOk = true;
  else if (f.domStar) dayOk = dowMatch;
  else if (f.dowStar) dayOk = domMatch;
  else dayOk = domMatch || dowMatch;
  return dayOk;
}

/**
 * Next `count` run times strictly after `from` (default now).
 * Iterates minute-by-minute with a 5-year safety cap.
 */
function nextCronRuns(expr, count, from) {
  var parsed = parseCron(expr);
  if (!parsed.ok) return { ok: false, error: parsed.error, runs: [] };
  count = Math.max(1, Math.min(50, parseInt(count, 10) || 5));
  var d = from ? new Date(from.getTime()) : new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // strictly after `from`
  var runs = [];
  var cap = 5 * 366 * 24 * 60; // ~5 years of minutes
  var f = parsed.fields;
  while (runs.length < count && cap-- > 0) {
    if (cronMatches(d, f)) runs.push(new Date(d.getTime()));
    d.setMinutes(d.getMinutes() + 1);
  }
  return { ok: true, runs: runs, capped: cap <= 0 && runs.length < count };
}

function ord(n) {
  var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function fmtTime(h, m) {
  if (h === 0) return '12:' + pad2(m) + ' AM';
  if (h < 12) return h + ':' + pad2(m) + ' AM';
  if (h === 12) return '12:' + pad2(m) + ' PM';
  return (h - 12) + ':' + pad2(m) + ' PM';
}

/** Plain-English description of a cron expression. */
function describeCron(expr) {
  var parsed = parseCron(expr);
  if (!parsed.ok) return parsed.error;
  var f = parsed.fields;
  var allM = f.mins.length === 60, allH = f.hours.length === 24;
  var allDom = f.domStar, allMon = f.months.length === 12, allDow = f.dowStar;

  function isStep(arr, min, max) {
    if (arr.length < 2 || arr[0] !== min) return 0;
    var s = arr[1] - arr[0];
    if (s < 1) return 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== min + i * s || arr[i] > max) return 0;
    }
    return s;
  }
  var minStep = isStep(f.mins, 0, 59);

  if (allM && allH && allDom && allMon && allDow) return 'Every minute';
  if (minStep && allH && allDom && allMon && allDow) {
    return 'Every ' + minStep + (minStep === 1 ? ' minute' : ' minutes');
  }
  if (allH && allDom && allMon && allDow && f.mins.length === 1) {
    return 'Every hour at minute ' + f.mins[0];
  }

  var timePart = '';
  if (f.mins.length === 1 && f.hours.length === 1) {
    timePart = 'at ' + fmtTime(f.hours[0], f.mins[0]);
  } else if (allM && allH) {
    timePart = 'every minute';
  } else if (minStep && allH) {
    timePart = 'every ' + minStep + ' minutes';
  } else {
    var times = [];
    f.hours.forEach(function (h) {
      f.mins.forEach(function (m) { times.push(fmtTime(h, m)); });
    });
    timePart = 'at ' + (times.length <= 4 ? times.join(', ') : times.length + ' times a day');
  }

  var dayPart;
  if (!allDow && allDom) {
    dayPart = 'every ' + f.dows.map(function (d) { return DOW_LONG[d]; }).join(', ');
  } else if (!allDom && allDow) {
    dayPart = 'on the ' + f.doms.map(ord).join(', ') + ' of the month';
  } else if (!allDom && !allDow) {
    dayPart = 'on the ' + f.doms.map(ord).join(', ') + ' and every ' +
      f.dows.map(function (d) { return DOW_LONG[d]; }).join(', ');
  } else {
    dayPart = 'every day';
  }
  var monPart = allMon ? '' : ' in ' + f.months.map(function (m) { return MONTH_LONG[m]; }).join(', ');
  return 'Runs ' + timePart + ', ' + dayPart + monPart;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function cronInit() {
  var SLUG = 'cron-builder';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtRun(d) {
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Cron kaise set kare? (How do I set a cron job?)',
      a: 'Build the 5-field expression here (minute hour day month weekday), copy it, then on Linux run "crontab -e" and paste a line like "*/15 * * * * /path/to/script.sh". On cPanel use the Cron Jobs panel.' },
    { q: '*/15 * * * * ka matlab kya hai?',
      a: 'Har 15 minute me — minute 0, 15, 30 aur 45 par, har ghante, har din. Ye sabse common schedule me se ek hai.' },
    { q: 'Cron me day-of-month aur day-of-week dono diye to kya hota hai?',
      a: 'Standard cron me dono me se koi ek match hone par job chalti hai (OR logic). Jaise "0 9 1 * 1" har mahine ki 1 tareekh AUR har Somvaar subah 9 baje chalega.' },
    { q: '0 2 * * * ka matlab kya hai?',
      a: 'Roz raat 2:00 baje. Server maintenance, backups aur reports ke liye common timing — load kam hota hai.' },
    { q: 'Kya ye tool meri timezone me next run dikhata hai?',
      a: 'Yes — next run times aapke device ki local timezone me calculate hote hain. Server ka timezone alag ho sakta hai, deploy se pehle verify kar lein.' }
  ]);
  SEO.softwareApp({
    name: 'Cron Builder — Free Online Cron Expression Generator',
    description: 'Free cron builder: click-to-build cron expressions with plain-English description and next 5 run-time preview. Cron kaise set kare — explained.',
    keywords: ['cron builder', 'cron generator', 'cron kaise set kare', 'cron expression generator', 'crontab example', 'cron schedule']
  });

  var FIELD_IDS = ['fMin', 'fHour', 'fDom', 'fMon', 'fDow'];

  var PRESETS = {
    min: [['*', 'Every (*)'], ['*/1', 'Every minute'], ['*/5', 'Every 5'], ['*/15', 'Every 15'], ['*/30', 'Every 30'], ['0', 'At 0'], ['30', 'At 30']],
    hour: [['*', 'Every (*)'], ['*/2', 'Every 2 hours'], ['*/6', 'Every 6 hours'], ['0', 'Midnight (0)'], ['2', '2 AM'], ['9', '9 AM'], ['12', 'Noon'], ['18', '6 PM']],
    dom: [['*', 'Every (*)'], ['1', '1st'], ['15', '15th'], ['*/2', 'Every 2 days']],
    mon: [['*', 'Every (*)'], ['1', 'Jan'], ['4', 'Apr'], ['7', 'Jul'], ['10', 'Oct'], ['1,4,7,10', 'Quarterly']],
    dow: [['*', 'Every (*)'], ['1', 'Monday'], ['5', 'Friday'], ['0', 'Sunday'], ['1-5', 'Weekdays'], ['0,6', 'Weekend']]
  };

  function fieldVal(id) {
    var custom = el(id + 'x').value.trim();
    if (custom) return custom;
    return el(id).value;
  }

  function currentExpr() {
    return [fieldVal('fMin'), fieldVal('fHour'), fieldVal('fDom'), fieldVal('fMon'), fieldVal('fDow')].join(' ');
  }

  function update() {
    var expr = currentExpr();
    el('exprOut').textContent = expr;
    var parsed = parseCron(expr);
    var errBox = el('cron-error');
    if (!parsed.ok) {
      errBox.textContent = parsed.error;
      el('cron-desc').textContent = '—';
      el('cron-runs').innerHTML = '';
      return;
    }
    errBox.textContent = '';
    el('cron-desc').textContent = describeCron(expr);
    var res = nextCronRuns(expr, 5, new Date());
    if (!res.ok) { el('cron-runs').innerHTML = ''; return; }
    el('cron-runs').innerHTML = res.runs.map(function (d, i) {
      return '<div class="run-row"><span class="n">' + (i + 1) + '</span><span>' + esc(fmtRun(d)) + '</span></div>';
    }).join('') + (res.capped ? '<p class="vq-hint">Schedule repeats rarely — showing fewer than 5 upcoming runs within 5 years.</p>' : '');
  }

  function copyExpr() {
    var t = el('exprOut').textContent;
    var msg = el('cron-msg');
    function ok() { msg.textContent = 'Copied to clipboard.'; }
    function fail() { msg.textContent = 'Copy failed — select the text manually.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, fail);
    } else {
      var ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(); }
      ta.remove();
    }
  }

  async function saveExpr() {
    var msg = el('cron-msg');
    var expr = currentExpr();
    if (!parseCron(expr).ok) { msg.textContent = 'Fix the expression before saving.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('cron-upsell'), SLUG, SAVE_LIMIT); return; }
    el('cron-upsell').innerHTML = '';
    var label = (el('saveLabel').value.trim() || describeCron(expr)).slice(0, 60);
    var key = label + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, key, { name: label, expr: expr, desc: describeCron(expr) });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      el('saveLabel').value = '';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('cron-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved schedules yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.expr) {
              var parts = d.expr.split(/\s+/);
              var ids = ['fMin', 'fHour', 'fDom', 'fMon', 'fDow'];
              parts.forEach(function (p, i) {
                el(ids[i] + 'x').value = p;
                el(ids[i]).value = '*';
              });
              update();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          } catch (e) { el('cron-msg').textContent = 'Could not load: ' + e.message; }
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

  function applyQuick(expr) {
    var parts = expr.split(/\s+/);
    var ids = ['fMin', 'fHour', 'fDom', 'fMon', 'fDow'];
    parts.forEach(function (p, i) { el(ids[i] + 'x').value = p; el(ids[i]).value = '*'; });
    update();
  }

  // preset selects
  var presetMap = [['fMin', 'min'], ['fHour', 'hour'], ['fDom', 'dom'], ['fMon', 'mon'], ['fDow', 'dow']];
  presetMap.forEach(function (pair) {
    var s = el(pair[0]);
    PRESETS[pair[1]].forEach(function (p) {
      var o = document.createElement('option');
      o.value = p[0]; o.textContent = p[1];
      s.appendChild(o);
    });
    s.addEventListener('change', function () { el(pair[0] + 'x').value = ''; update(); });
  });
  FIELD_IDS.forEach(function (id) {
    el(id + 'x').addEventListener('input', update);
  });

  document.querySelectorAll('[data-quick]').forEach(function (b) {
    b.addEventListener('click', function () { applyQuick(b.getAttribute('data-quick')); });
  });

  el('copyBtn').addEventListener('click', copyExpr);
  el('saveBtn').addEventListener('click', saveExpr);
  update();
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cronInit);
  } else { cronInit(); }
}
