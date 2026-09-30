/* ============================================================
   Dockerfile Generator — pure generation layer.
   These functions are DOM-free so they can be unit-tested in node:
     node -e "eval(require('fs').readFileSync('app.js','utf8'));
              console.log(buildDockerfile({...}).text)"
   Output follows the official Dockerfile reference
   (docs.docker.com/reference/dockerfile/).
   ============================================================ */

/** Split "KEY=VALUE" lines into pairs; collects warnings for bad lines. */
function parseEnvLines(text) {
  var pairs = [], warnings = [];
  String(text || '').split('\n').forEach(function (line, i) {
    var t = line.trim();
    if (!t || t.charAt(0) === '#') return;
    var eq = t.indexOf('=');
    if (eq <= 0) { warnings.push('Line ' + (i + 1) + ' is not KEY=VALUE — skipped: "' + t + '"'); return; }
    var k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      warnings.push('"' + k + '" is not a valid ENV name — skipped.');
      return;
    }
    pairs.push({ k: k, v: v });
  });
  return { pairs: pairs, warnings: warnings };
}

/** Split a comma/space separated port list into valid port numbers. */
function parsePorts(text) {
  var ports = [], warnings = [];
  String(text || '').split(/[,\s]+/).forEach(function (p) {
    p = p.trim();
    if (!p) return;
    // allow "8080:80" host:container form — container port is the last part
    var parts = p.split(':');
    var c = parts[parts.length - 1];
    if (/^\d+$/.test(c) && +c >= 1 && +c <= 65535) {
      ports.push(p);
    } else {
      warnings.push('"' + p + '" is not a valid port — skipped.');
    }
  });
  return { ports: ports, warnings: warnings };
}

/** Quote a value for Dockerfile ENV if it contains whitespace. */
function dockerQuote(v) {
  if (/[\s"'\\]/.test(v)) {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return v;
}

/**
 * Build a Dockerfile.
 * opts: { base, workdir, runLines[], copySrc, expose[], env[{k,v}],
 *         entrypoint, cmd, multistage }
 * Returns { text, hints[] }.
 */
function buildDockerfile(opts) {
  opts = opts || {};
  var hints = [];
  var base = String(opts.base || 'node:20-alpine').trim();
  var workdir = String(opts.workdir || '/app').trim() || '/app';
  var runLines = (opts.runLines || []).map(function (s) { return String(s).trim(); })
    .filter(function (s) { return s.length > 0; });
  var copySrc = String(opts.copySrc == null ? '.' : opts.copySrc).trim() || '.';
  var expose = opts.expose || [];
  var env = opts.env || [];
  var entrypoint = String(opts.entrypoint || '').trim();
  var cmd = String(opts.cmd || '').trim();
  var multistage = !!opts.multistage;

  var tag = base.indexOf(':') >= 0 ? base.split(':').pop() : '';
  if (!tag || tag === 'latest') {
    hints.push('Pin an explicit image tag instead of "latest" — e.g. node:20-alpine. "latest" makes builds non-reproducible and can pull a breaking change overnight.');
  }
  if (copySrc === '.' || copySrc === './' || copySrc === './*') {
    hints.push('You COPY the whole build context — add a .dockerignore (node_modules, .git, *.log) so secrets and junk never land in the image or bloat the build cache.');
  }
  var hasApt = runLines.some(function (l) { return /apt(-get)?\s+(install|update)/.test(l); });
  var hasAptClean = runLines.some(function (l) { return /rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(l); });
  if (hasApt && !hasAptClean) {
    hints.push('apt-get leaves package lists behind — end the RUN with "rm -rf /var/lib/apt/lists/*" (same RUN layer) to keep the image small.');
  }
  var secretEnv = env.filter(function (p) { return /passw|secret|token|api[-_]?key|private/i.test(p.k); });
  if (secretEnv.length) {
    hints.push('Looks like a secret in ENV (' + secretEnv.map(function (p) { return p.k; }).join(', ') +
      ') — bake no secrets into images. Use Docker build secrets (--secret) or inject at runtime via env files / a secrets manager.');
  }
  if (multistage) {
    hints.push('Multi-stage is on: keep the final stage minimal (distroless or -alpine) and copy only build artefacts with COPY --from=build.');
  } else {
    hints.push('Consider a multi-stage build if you compile or npm-install in the image — it keeps devDependencies and build tools out of the final image.');
  }
  if (!entrypoint && !cmd) {
    hints.push('No CMD or ENTRYPOINT set — the container will exit immediately. Add the command that starts your app.');
  }
  hints.push('This image runs as root by default. For production, add "RUN adduser -D appuser && USER appuser" (alpine) or the equivalent for your base.');

  var L = [];
  L.push('# Generated with VisionQuantech Dockerfile Generator — review before use.');
  if (multistage) {
    L.push('FROM ' + base + ' AS build');
    L.push('WORKDIR ' + workdir);
    runLines.forEach(function (r) { L.push('RUN ' + r); });
    L.push('COPY ' + copySrc + ' ' + workdir + '/');
    L.push('');
    L.push('# ---- final image ----');
    L.push('FROM ' + base);
  } else {
    L.push('FROM ' + base);
  }
  L.push('WORKDIR ' + workdir);
  if (!multistage) {
    runLines.forEach(function (r) { L.push('RUN ' + r); });
    if (copySrc) L.push('COPY ' + copySrc + ' ' + workdir + '/');
  } else {
    L.push('COPY --from=build ' + workdir + ' ' + workdir + '/');
  }
  env.forEach(function (p) { L.push('ENV ' + p.k + '=' + dockerQuote(p.v)); });
  expose.forEach(function (p) { L.push('EXPOSE ' + p); });
  if (entrypoint) L.push('ENTRYPOINT ' + entrypoint);
  if (cmd) L.push('CMD ' + cmd);
  L.push('');

  return { text: L.join('\n'), hints: hints };
}

/* ============================================================
   DOM glue (browser only)
   ============================================================ */
function dfgInit() {
  var SLUG = 'dockerfile-generator';
  var SAVE_LIMIT = 25; // vault saves per day; generation is unlimited

  function el(id) { return document.getElementById(id); }

  Ads.render(el('ad-top'), SLUG + '-top', 'leaderboard');
  Ads.render(el('ad-bottom'), SLUG + '-bottom', 'leaderboard');

  SEO.faq([
    { q: 'Dockerfile kaise banaye? (How do I write a Dockerfile?)',
      a: 'Pick a base image for your runtime (e.g. node:20-alpine), set a WORKDIR, COPY your code, RUN install/build steps, EXPOSE the port, and finish with CMD or ENTRYPOINT. This generator assembles all of that plus best-practice hints for you.' },
    { q: 'Dockerfile me latest tag kyon avoid karein? (Why avoid the latest tag?)',
      a: 'The "latest" tag moves over time, so the same Dockerfile can build a different — possibly breaking — image tomorrow. Pin an explicit version like node:20-alpine for reproducible builds.' },
    { q: 'Multi-stage Docker build kya hota hai? (What is a multi-stage build?)',
      a: 'You use one stage to compile/install dependencies and a second slim stage that copies only the built artefacts. The final image stays small and free of compilers and dev dependencies.' },
    { q: '.dockerignore kyon zaroori hai? (Why do I need a .dockerignore?)',
      a: 'COPY . . sends your whole build context to the daemon. Without .dockerignore, node_modules, .git and .env files bloat the build and can leak secrets into image layers.' },
    { q: 'Kya ye generator offline kaam karta hai? (Does this work offline?)',
      a: 'Yes — the Dockerfile is generated entirely in your browser. Nothing is uploaded; you can save drafts to this device\'s vault.' }
  ]);
  SEO.softwareApp({
    name: 'Dockerfile Generator — Free Online',
    description: 'Free Dockerfile generator: base image presets, multi-stage builds, ENV/EXPOSE/CMD forms, copy & download, with best-practice lint hints.',
    keywords: ['dockerfile generator', 'dockerfile kaise banaye', 'dockerfile online', 'multi-stage dockerfile example', 'dockerfile best practices']
  });

  function readOpts() {
    var baseSel = el('baseImage').value;
    var base = baseSel === 'custom…' ? el('customBase').value.trim() : baseSel;
    var envParsed = parseEnvLines(el('envVars').value);
    var portsParsed = parsePorts(el('expose').value);
    return {
      base: base || 'node:20-alpine',
      workdir: el('workdir').value.trim() || '/app',
      runLines: el('runCmds').value.split('\n'),
      copySrc: el('copySrc').value.trim() || '.',
      expose: portsParsed.ports,
      env: envParsed.pairs,
      entrypoint: el('entrypoint').value.trim(),
      cmd: el('cmd').value.trim(),
      multistage: el('multistage').checked,
      envWarnings: envParsed.warnings,
      portWarnings: portsParsed.warnings
    };
  }

  function generate() {
    var o = readOpts();
    var err = el('dfg-error');
    err.textContent = '';
    if (!o.base) { err.textContent = 'Please pick or type a base image.'; return; }
    var out = buildDockerfile(o);
    el('dfg-output').textContent = out.text;
    var hints = out.hints.concat(o.envWarnings, o.portWarnings);
    el('dfg-hints').innerHTML = hints.map(function (h) {
      return '<li>' + escapeHtml(h) + '</li>';
    }).join('');
    el('dfg-result').style.display = 'block';
    el('dfg-upsell').innerHTML = '';
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function copyOut() {
    var t = el('dfg-output').textContent;
    if (!t) return;
    var msg = el('dfg-msg');
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
    var t = el('dfg-output').textContent;
    if (!t) return;
    var blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Dockerfile';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    el('dfg-msg').textContent = 'Dockerfile downloaded.';
  }

  async function saveDraft() {
    var t = el('dfg-output').textContent;
    var msg = el('dfg-msg');
    if (!t) { msg.textContent = 'Generate a Dockerfile first.'; return; }
    var gate = Freemium.check(SLUG, SAVE_LIMIT);
    if (!gate.allowed) { Freemium.renderUpsell(el('dfg-upsell'), SLUG, SAVE_LIMIT); return; }
    el('dfg-upsell').innerHTML = '';
    var name = (el('draftName').value.trim() || 'Dockerfile') + ' — ' + new Date().toLocaleString('en-IN');
    try {
      await Vault.save(SLUG, name, { name: name, text: t, opts: readOpts() });
      msg.textContent = 'Saved to this device\'s vault (' + gate.remaining + ' saves left today).';
      refreshSaved();
    } catch (e) {
      msg.textContent = 'Could not save: ' + e.message;
    }
  }

  async function refreshSaved() {
    var list = el('dfg-saved');
    try {
      var items = await Vault.list(SLUG);
      if (!items.length) { list.innerHTML = '<p class="vq-hint">No saved drafts yet.</p>'; return; }
      list.innerHTML = items.slice().reverse().map(function (it) {
        return '<div class="saved-row"><span>' + escapeHtml(it.key) +
          (it.encrypted ? ' 🔒' : '') + '</span>' +
          '<button class="vq-btn ghost sm" data-load="' + escapeHtml(it.key) + '">Load</button>' +
          '<button class="vq-btn ghost sm" data-del="' + escapeHtml(it.key) + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('[data-load]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            var d = await Vault.load(SLUG, b.getAttribute('data-load'));
            if (d && d.text) { el('dfg-output').textContent = d.text; el('dfg-result').style.display = 'block'; }
          } catch (e) { el('dfg-msg').textContent = 'Could not load: ' + e.message; }
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

  el('baseImage').addEventListener('change', function () {
    el('customBaseWrap').style.display = el('baseImage').value === 'custom…' ? 'block' : 'none';
  });
  el('genBtn').addEventListener('click', generate);
  el('copyBtn').addEventListener('click', copyOut);
  el('dlBtn').addEventListener('click', downloadOut);
  el('saveBtn').addEventListener('click', saveDraft);
  refreshSaved();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dfgInit);
  } else { dfgInit(); }
}
