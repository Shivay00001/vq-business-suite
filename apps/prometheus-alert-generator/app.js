/* ============================================================
   Prometheus Alert Generator — pure generation layer
   (DOM-free, unit-testable in node). Builds an alert-rule
   YAML group, optionally with a recording rule, plus PromQL
   sanity hints.
   ============================================================ */

function promqlMetricOk(m) {
  return /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^{}]*\})?(\[[^\]]+\])?$/.test(String(m || '').trim());
}

function promDurationOk(d) {
  return /^(\d+(ms|s|m|h|d|w|y))+$/.test(String(d || '').trim());
}

function alertNameOk(n) {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(String(n || '').trim());
}

function yamlQ(s) {
  s = String(s == null ? '' : s);
  if (/^[A-Za-z0-9_.\/:@+-]+$/.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * o: { name, metric, op, threshold, duration, severity,
 *      summary, description, recording, recordName }
 * Returns { errors[], hints[] }.
 */
function validateAlert(o) {
  var errors = [], hints = [];
  if (!alertNameOk(o.name)) {
    errors.push('Alert name must start with a letter and contain only letters, digits and underscores — e.g. HighErrorRate.');
  }
  if (!promqlMetricOk(o.metric)) {
    errors.push('That doesn\'t look like a valid PromQL metric/expression. Examples: http_requests_total, up, sum(rate(http_requests_total[5m])).');
  }
  if (['>', '<', '>=', '<=', '==', '!='].indexOf(o.op) < 0) {
    errors.push('Pick a comparison operator.');
  }
  if (!isFinite(parseFloat(o.threshold))) {
    errors.push('Threshold must be a number, e.g. 0.05 or 90.');
  }
  if (!promDurationOk(o.duration)) {
    errors.push('Duration must look like 5m, 1h, 30s — e.g. "5m".');
  }
  if (['critical', 'warning', 'info'].indexOf(o.severity) < 0) {
    errors.push('Severity must be critical, warning or info.');
  }
  if (o.recording && !alertNameOk(o.recordName)) {
    errors.push('Recording rule name must be a valid metric name (letters, digits, underscores, colons) — e.g. job:http_errors:rate5m.');
  }
  var metric = String(o.metric || '').trim();
  if (/^[a-zA-Z_:][a-zA-Z0-9_:]*_total$/.test(metric) && metric.indexOf('rate(') < 0 && metric.indexOf('increase(') < 0) {
    hints.push('"' + metric + '" is a counter (_total) — alerting on its raw value is almost never right. Wrap it: sum(rate(' + metric + '[5m])).');
  }
  if (String(o.op) === '==' && String(o.threshold).indexOf('.') >= 0) {
    hints.push('Exact == comparison on a float threshold is fragile — prefer > or < with a small margin.');
  }
  var durMin = (function () {
    var m = /^(\d+)(ms|s|m|h|d|w|y)/.exec(String(o.duration || '').trim());
    if (!m) return 0;
    var n = parseInt(m[1], 10), u = m[2];
    return u === 'ms' ? n / 60000 : u === 's' ? n / 60 : u === 'm' ? n : u === 'h' ? n * 60 : u === 'd' ? n * 1440 : u === 'w' ? n * 10080 : n * 525600;
  })();
  if (durMin > 0 && durMin < 1) {
    hints.push('"for: ' + o.duration + '" is very short — the alert may flap. 5m is a common starting point.');
  }
  if (String(o.severity) === 'critical' && durMin > 30) {
    hints.push('Critical alerts with a long "for" delay page people late — consider warning for slow-burn conditions.');
  }
  return { errors: errors, hints: hints };
}

/**
 * o: same as validateAlert. Returns the alert-rule YAML text.
 */
function buildAlertYaml(o) {
  var expr = o.recording && o.recordName
    ? String(o.recordName).trim() + ' ' + o.op + ' ' + String(o.threshold).trim()
    : String(o.metric).trim() + ' ' + o.op + ' ' + String(o.threshold).trim();
  var L = [];
  L.push('# Generated with VisionQuantech Prometheus Alert Generator — review before applying.');
  L.push('# Load with: prometheus --config.file=prometheus.yml (rule_files: ["alerts.yml"])');
  L.push('groups:');
  L.push('- name: vq-alerts');
  L.push('  rules:');
  if (o.recording && o.recordName) {
    L.push('  - record: ' + String(o.recordName).trim());
    L.push('    expr: ' + String(o.metric).trim());
  }
  L.push('  - alert: ' + String(o.name).trim());
  L.push('    expr: ' + expr);
  L.push('    for: ' + String(o.duration).trim());
  L.push('    labels:');
  L.push('      severity: ' + o.severity);
  L.push('    annotations:');
  if (o.summary) L.push('      summary: ' + yamlQ(o.summary));
  if (o.description) L.push('      description: ' + yamlQ(o.description));
  L.push('');
  return L.join('\n');
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function pagInit() {
  var SLUG = 'prometheus-alert-generator';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Prometheus alert rule kaise likhein? (How do I write an alert rule?)',
      a: 'An alert rule needs: alert name, a PromQL expr (e.g. up == 0), "for:" duration, severity label and summary/description annotations. This generator writes the YAML for you.' },
    { q: 'Recording rule kya hota hai?',
      a: 'A recording rule precomputes an expensive PromQL expression into a new metric (e.g. job:http_errors:rate5m) on a schedule, so alerts and dashboards query the cheap precomputed series.' },
    { q: '"for: 5m" ka matlab kya hai?',
      a: 'The alert only fires if the expression stays true for 5 continuous minutes — it prevents flapping on brief spikes.' },
    { q: 'Counter metrics par alert kaise lagayein?',
      a: 'Never alert on a raw _total counter — it only grows. Use rate(), e.g. sum(rate(http_requests_total{status=~"5.."}[5m])) > 0.05.' },
    { q: 'Kya ye generator offline kaam karta hai?',
      a: 'Yes — the YAML is generated entirely in your browser and can be saved to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'Prometheus Alert Generator — Free Alert Rule Builder',
    description: 'Free Prometheus alert rule generator: metric, condition, threshold, duration, severity → alert YAML with recording-rule option and PromQL sanity hints.',
    keywords: ['prometheus alert generator', 'promql alert rule', 'prometheus alertmanager example', 'prometheus recording rule', 'promql alert example']
  });

  function readOpts() {
    return {
      name: el('ruleName').value.trim(),
      metric: el('metric').value.trim(),
      op: el('condOp').value,
      threshold: el('threshold').value.trim(),
      duration: el('duration').value.trim() || '5m',
      severity: el('severity').value,
      summary: el('summary').value.trim(),
      description: el('description').value.trim(),
      recording: el('recording').checked,
      recordName: el('recordName').value.trim()
    };
  }

  function generate() {
    var o = readOpts();
    var v = validateAlert(o);
    var errBox = el('pag-error');
    if (v.errors.length) {
      errBox.innerHTML = v.errors.map(esc).join('<br>');
      el('pag-result').style.display = 'none';
      return;
    }
    errBox.textContent = '';
    el('pag-output').textContent = buildAlertYaml(o);
    el('pag-hints').innerHTML = v.hints.length
      ? v.hints.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('')
      : '<li>No issues spotted — expression looks sane. Always test with promtool: <code>promtool check rules alerts.yml</code></li>';
    el('pag-result').style.display = 'block';
    el('pag-upsell').innerHTML = '';
  }

  function copyOut() {
    var t = el('pag-output').textContent;
    var msg = el('pag-msg');
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

  function downloadOut() {
    var blob = new Blob([el('pag-output').textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alerts.yml';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('pag-msg').textContent = 'alerts.yml downloaded.';
  }

  async function saveDraft() {
    var msg = el('pag-msg');
    if (el('pag-result').style.display === 'none') { msg.textContent = 'Generate a valid rule first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('pag-upsell'), SLUG, SAVE_LIMIT); return; }
    el('pag-upsell').innerHTML = '';
    var o = readOpts();
    var name = o.name + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: o.name, opts: o, yaml: el('pag-output').textContent });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('pag-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved rules yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.yaml) { el('pag-output').textContent = d.yaml; el('pag-result').style.display = 'block'; }
          } catch (e) { el('pag-msg').textContent = 'Could not load: ' + e.message; }
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

  el('recording').addEventListener('change', function () {
    el('recWrap').style.display = el('recording').checked ? 'block' : 'none';
  });
  el('genBtn').addEventListener('click', generate);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pagInit);
  } else { pagInit(); }
}
