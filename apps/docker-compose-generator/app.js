/* ============================================================
   Docker Compose Generator — pure generation layer (DOM-free,
   unit-testable in node). Emits a Compose Specification YAML
   (no `version:` key — obsolete since Compose v2).
   ============================================================ */

/** Always double-quote (for port mappings: "8080:80" must stay a string). */
function yamlStrQ(s) {
  s = String(s == null ? '' : s);
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Quote a YAML scalar when it needs it. */
function yamlStr(s) {
  s = String(s == null ? '' : s);
  if (s === '') return '""';
  if (/^[A-Za-z0-9_.\/:@+-]+$/.test(s) && !/^(y|n|yes|no|true|false|on|off|null|~)$/i.test(s)) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * services: [{ name, image, ports[], volumes[], environment[{k,v}],
 *              depends_on[], restart, command }]
 * Returns the docker-compose.yml text.
 */
function buildCompose(services) {
  var L = [];
  L.push('# Generated with VisionQuantech Docker Compose Generator — review before use.');
  L.push('services:');
  (services || []).forEach(function (sv) {
    L.push('  ' + yamlStr(sv.name) + ':');
    L.push('    image: ' + yamlStr(sv.image));
    if (sv.command) L.push('    command: ' + yamlStr(sv.command));
    if (sv.restart) L.push('    restart: ' + yamlStr(sv.restart));
    if (sv.ports && sv.ports.length) {
      L.push('    ports:');
      sv.ports.forEach(function (p) { L.push('      - ' + yamlStrQ(p)); });
    }
    if (sv.volumes && sv.volumes.length) {
      L.push('    volumes:');
      sv.volumes.forEach(function (v) { L.push('      - ' + yamlStr(v)); });
    }
    if (sv.environment && sv.environment.length) {
      L.push('    environment:');
      sv.environment.forEach(function (e) { L.push('      ' + e.k + ': ' + yamlStr(e.v)); });
    }
    if (sv.depends_on && sv.depends_on.length) {
      L.push('    depends_on:');
      sv.depends_on.forEach(function (d) { L.push('      - ' + yamlStr(d)); });
    }
  });
  L.push('');
  return L.join('\n');
}

/** Validate a service object; returns error strings (empty = ok). */
function validateService(sv) {
  var errs = [];
  if (!sv.name || !/^[a-z0-9][a-z0-9_-]*$/.test(sv.name)) {
    errs.push('Service name must be lowercase alphanumeric (dashes/underscores allowed), e.g. "web" or "db-1".');
  }
  if (!sv.image) errs.push('Service "' + (sv.name || '?') + '" needs an image.');
  (sv.ports || []).forEach(function (p) {
    var parts = String(p).split(':');
    var bad = parts.some(function (x) { return !/^\d+$/.test(x) || +x < 1 || +x > 65535; });
    if (bad) errs.push('Bad port mapping "' + p + '" — use "HOST:CONTAINER" or "PORT", e.g. "8080:80".');
  });
  return errs;
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function dcgInit() {
  var SLUG = 'docker-compose-generator';
  var SAVE_LIMIT = 25;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'docker-compose.yml kaise banaye? (How do I write a docker-compose file?)',
      a: 'List each container under "services:" with its image, port mappings, volumes, environment variables and depends_on. This generator builds the YAML for you as you add services — then run "docker compose up -d".' },
    { q: 'docker compose vs docker-compose me kya antar hai?',
      a: '"docker compose" (space, no hyphen) is the current Compose v2 plugin; "docker-compose" (hyphen) is the old Python v1 tool. New files omit the obsolete "version:" key — this generator does that.' },
    { q: 'depends_on kya karta hai?',
      a: 'It controls startup order — e.g. your web service depends_on db so the database container starts first. For "wait until ready" behaviour, combine it with a healthcheck.' },
    { q: 'Compose file me secrets kaise handle karein?',
      a: 'Don\'t hardcode passwords in the YAML you commit. Use an env_file (e.g. .env, git-ignored) or Docker secrets, and reference variables like "${DB_PASSWORD}".' },
    { q: 'Kya ye generator offline kaam karta hai?',
      a: 'Yes — the YAML is generated entirely in your browser. You can save drafts to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'Docker Compose Generator — Free Online',
    description: 'Free docker-compose.yml generator: add services with ports, volumes, env vars, depends_on and restart policies. Copy & download, 100% in-browser.',
    keywords: ['docker compose generator', 'docker-compose.yml generator', 'docker compose file kaise banaye', 'docker compose example']
  });

  var services = [];
  var editing = -1;

  function readForm() {
    function lines(id) {
      return el(id).value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function csv(id) {
      return el(id).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    var env = [];
    lines('sEnv').forEach(function (ln) {
      var eq = ln.indexOf('=');
      if (eq > 0) env.push({ k: ln.slice(0, eq).trim(), v: ln.slice(eq + 1).trim() });
    });
    return {
      name: el('sName').value.trim().toLowerCase(),
      image: el('sImage').value.trim(),
      command: el('sCommand').value.trim(),
      restart: el('sRestart').value,
      ports: csv('sPorts'),
      volumes: csv('sVolumes'),
      environment: env,
      depends_on: csv('sDepends')
    };
  }

  function clearForm() {
    ['sName', 'sImage', 'sCommand', 'sPorts', 'sVolumes', 'sEnv', 'sDepends'].forEach(function (id) { el(id).value = ''; });
    el('sRestart').value = 'unless-stopped';
    editing = -1;
    el('addBtn').textContent = 'Add service';
  }

  function renderList() {
    var box = el('dcg-services');
    if (!services.length) {
      box.innerHTML = '<p class="vq-hint">No services yet — add your first one above.</p>';
    } else {
      box.innerHTML = services.map(function (sv, i) {
        return '<div class="saved-row"><span><strong>' + esc(sv.name) + '</strong> · ' + esc(sv.image) + '</span>' +
          '<button class="vq-btn ghost sm" data-edit="' + i + '">Edit</button>' +
          '<button class="vq-btn ghost sm" data-del="' + i + '">Remove</button></div>';
      }).join('');
      box.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var sv = services[+b.getAttribute('data-edit')];
          editing = +b.getAttribute('data-edit');
          el('sName').value = sv.name; el('sImage').value = sv.image;
          el('sCommand').value = sv.command || ''; el('sRestart').value = sv.restart || 'unless-stopped';
          el('sPorts').value = (sv.ports || []).join(', ');
          el('sVolumes').value = (sv.volumes || []).join(', ');
          el('sEnv').value = (sv.environment || []).map(function (e) { return e.k + '=' + e.v; }).join('\n');
          el('sDepends').value = (sv.depends_on || []).join(', ');
          el('addBtn').textContent = 'Update service';
          window.scrollTo({ top: el('dcg-form').offsetTop - 10, behavior: 'smooth' });
        });
      });
      box.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          services.splice(+b.getAttribute('data-del'), 1);
          renderList();
        });
      });
    }
    generate();
  }

  function generate() {
    var yml = buildCompose(services);
    el('dcg-output').textContent = yml;
    el('dcg-count').textContent = services.length + (services.length === 1 ? ' service' : ' services');
  }

  function copyOut() {
    var t = el('dcg-output').textContent;
    var msg = el('dcg-msg');
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
    var blob = new Blob([el('dcg-output').textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'docker-compose.yml';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('dcg-msg').textContent = 'docker-compose.yml downloaded.';
  }

  async function saveDraft() {
    var msg = el('dcg-msg');
    if (!services.length) { msg.textContent = 'Add at least one service first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('dcg-upsell'), SLUG, SAVE_LIMIT); return; }
    el('dcg-upsell').innerHTML = '';
    var name = (el('draftName').value.trim() || 'compose') + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, services: services, yml: el('dcg-output').textContent });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) { msg.textContent = 'Could not save: ' + e.message; }
  }

  async function refreshSaved() {
    var list = el('dcg-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved drafts yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + esc(it.key) + (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + esc(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + esc(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.services) { services = d.services; clearForm(); renderList(); }
          } catch (e) { el('dcg-msg').textContent = 'Could not load: ' + e.message; }
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

  el('addBtn').addEventListener('click', function () {
    var sv = readForm();
    var errs = validateService(sv);
    if (editing < 0 && services.some(function (s) { return s.name === sv.name; })) {
      errs.push('A service named "' + sv.name + '" already exists — edit it instead.');
    }
    var errBox = el('dcg-error');
    if (errs.length) { errBox.textContent = errs[0]; return; }
    errBox.textContent = '';
    if (editing >= 0) { services[editing] = sv; } else { services.push(sv); }
    clearForm();
    renderList();
  });
  el('clearBtn').addEventListener('click', clearForm);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  renderList();
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dcgInit);
  } else { dcgInit(); }
}
